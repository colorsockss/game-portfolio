#include "MmoCreateEffectAssetsCommandlet.h"

#include "AssetImportTask.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "AssetToolsModule.h"
#include "Game/MmoCues.h"
#include "Game/MmoEntityVisuals.h"
#include "HAL/FileManager.h"
#include "Materials/Material.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialExpressionCameraVectorWS.h"
#include "Materials/MaterialExpressionConstant3Vector.h"
#include "Materials/MaterialExpressionCustom.h"
#include "Materials/MaterialExpressionScalarParameter.h"
#include "Materials/MaterialExpressionTextureCoordinate.h"
#include "Materials/MaterialExpressionTextureObjectParameter.h"
#include "Materials/MaterialExpressionTextureSampleParameter2D.h"
#include "Materials/MaterialExpressionTime.h"
#include "Materials/MaterialExpressionVectorParameter.h"
#include "Materials/MaterialExpressionVertexNormalWS.h"
#include "Materials/MaterialInstanceConstant.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Engine/Texture2D.h"
#include "Materials/MaterialExpressionMultiply.h"
#include "Materials/MaterialExpressionParticleColor.h"
#include "Materials/MaterialExpressionTextureSample.h"
#include "NiagaraEmitter.h"
#include "NiagaraEmitterHandle.h"
#include "NiagaraSpriteRendererProperties.h"
#include "NiagaraSystem.h"
#include "Sound/SoundAttenuation.h"
#include "Sound/SoundClass.h"
#include "Sound/SoundWave.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateEffectAssets, Log, All);

namespace
{
	constexpr int32 SampleRate = 22050;

	/** 패키지 하나를 새로 만든다(디스크의 옛 파일은 지움). */
	UPackage* NewPackage(const FString& Name, FString& Filename)
	{
		Filename = FPackageName::LongPackageNameToFilename(Name, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		return CreatePackage(*Name);
	}

	bool Save(UPackage* Package, UObject* Asset, const FString& Filename)
	{
		FAssetRegistryModule::AssetCreated(Asset);
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		if (!UPackage::SavePackage(Package, Asset, *Filename, Args))
		{
			UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("Could not save %s."), *Filename);
			return false;
		}
		UE_LOG(LogMmoCreateEffectAssets, Display, TEXT("Created %s"), *Package->GetName());
		return true;
	}

	/** 16비트 모노 WAV 파일의 바이트(엔진의 SoundFactory가 RawData에 두는 것과 같은 형식). */
	TArray<uint8> Wav(const TArray<float>& Samples)
	{
		TArray<uint8> Bytes;
		const auto Put32 = [&Bytes](uint32 Value) { for (int32 Shift = 0; Shift < 32; Shift += 8) Bytes.Add(static_cast<uint8>(Value >> Shift)); };
		const auto Put16 = [&Bytes](uint16 Value) { Bytes.Add(static_cast<uint8>(Value)); Bytes.Add(static_cast<uint8>(Value >> 8)); };
		const auto Tag = [&Bytes](const char* Text) { Bytes.Append(reinterpret_cast<const uint8*>(Text), 4); };
		const uint32 DataSize = Samples.Num() * 2;
		Tag("RIFF");
		Put32(36 + DataSize);
		Tag("WAVE");
		Tag("fmt ");
		Put32(16);
		Put16(1);
		Put16(1);
		Put32(SampleRate);
		Put32(SampleRate * 2);
		Put16(2);
		Put16(16);
		Tag("data");
		Put32(DataSize);
		for (const float Sample : Samples)
		{
			Put16(static_cast<uint16>(static_cast<int16>(FMath::Clamp(Sample, -1.0f, 1.0f) * 32767.0f)));
		}
		return Bytes;
	}

	/** Seconds초 동안 시각(초) → 표본(−1–1)으로 채운다. */
	TArray<float> Synth(double Seconds, TFunctionRef<double(double)> Wave)
	{
		TArray<float> Samples;
		const int32 Count = FMath::RoundToInt32(Seconds * SampleRate);
		Samples.Reserve(Count);
		for (int32 Index = 0; Index < Count; ++Index)
		{
			Samples.Add(static_cast<float>(Wave(static_cast<double>(Index) / SampleRate)));
		}
		return Samples;
	}

	/** 소리의 원본 mmo/art/sounds/<Name>.(ogg|wav|flac)(91. 출처는 docs/art.md). 없으면 빈 문자열. */
	FString SourceOf(const TCHAR* Name)
	{
		const FString Folder = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../art/sounds"));
		for (const TCHAR* Extension : { TEXT("ogg"), TEXT("wav"), TEXT("flac") })
		{
			const FString File = Folder / FString::Printf(TEXT("%s.%s"), Name, Extension);
			if (FPaths::FileExists(File))
			{
				return File;
			}
		}
		return FString();
	}

	/**
	 * 소리 하나를 만들어 저장한다. Attenuation이 있으면 거리에 따라 작아지는 3D 효과음이다. mmo/art/sounds/에 그 이름의 원본이 있으면 그것을 가져오고,
	 * 없으면 Samples(코드로 합성한 소리)로 만든다.
	 */
	USoundWave* CreateSound(const TCHAR* Name, const TArray<float>& Samples, USoundClass* Class, USoundAttenuation* Attenuation, bool bLooping)
	{
		if (const FString Source = SourceOf(Name); !Source.IsEmpty())
		{
			const FString PackageName = FString::Printf(TEXT("/Game/Effects/Sounds/%s"), Name);
			const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
			IFileManager::Get().Delete(*Filename, false, true, true);
			UAssetImportTask* Task = NewObject<UAssetImportTask>();
			Task->Filename = Source;
			Task->DestinationPath = TEXT("/Game/Effects/Sounds");
			Task->DestinationName = Name;
			Task->bAutomated = true;
			Task->bReplaceExisting = true;
			Task->bSave = false;
			FAssetToolsModule::GetModule().Get().ImportAssetTasks({ Task });
			USoundWave* Imported = Task->GetObjects().IsEmpty() ? nullptr : Cast<USoundWave>(Task->GetObjects()[0]);
			if (!Imported)
			{
				UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("Could not import %s."), *Source);
				return nullptr;
			}
			Imported->bLooping = bLooping;
			Imported->SoundClassObject = Class;
			Imported->AttenuationSettings = Attenuation;
			return Save(Imported->GetPackage(), Imported, Filename) ? Imported : nullptr;
		}

		FString Filename;
		UPackage* Package = NewPackage(FString::Printf(TEXT("/Game/Effects/Sounds/%s"), Name), Filename);
		USoundWave* Sound = NewObject<USoundWave>(Package, Name, RF_Public | RF_Standalone);
		const TArray<uint8> Bytes = Wav(Samples);
		Sound->RawData.UpdatePayload(FSharedBuffer::Clone(Bytes.GetData(), Bytes.Num()));
		Sound->Duration = static_cast<float>(Samples.Num()) / SampleRate;
		Sound->SetImportedSampleRate(SampleRate);
		Sound->SetSampleRate(SampleRate);
		Sound->NumChannels = 1;
		Sound->TotalSamples = Samples.Num();
		Sound->bLooping = bLooping;
		Sound->SoundClassObject = Class;
		Sound->AttenuationSettings = Attenuation;
		Sound->InvalidateCompressedData(true, false);
		return Save(Package, Sound, Filename) ? Sound : nullptr;
	}

	/** mmo/art/effects/<Name>.png(Kenney Particle Pack, CC0. 91)를 /Game/Effects/Textures/<Name>으로 가져온다. */
	UTexture2D* ImportParticle(const TCHAR* Name)
	{
		const FString Source = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../art/effects") / FString::Printf(TEXT("%s.png"), Name));
		const FString Filename = FPackageName::LongPackageNameToFilename(FString::Printf(TEXT("/Game/Effects/Textures/%s"), Name), FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UAssetImportTask* Task = NewObject<UAssetImportTask>();
		Task->Filename = Source;
		Task->DestinationPath = TEXT("/Game/Effects/Textures");
		Task->DestinationName = Name;
		Task->bAutomated = true;
		Task->bReplaceExisting = true;
		Task->bSave = false;
		FAssetToolsModule::GetModule().Get().ImportAssetTasks({ Task });
		UTexture2D* Texture = Task->GetObjects().IsEmpty() ? nullptr : Cast<UTexture2D>(Task->GetObjects()[0]);
		if (!Texture)
		{
			UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("Could not import %s."), *Source);
			return nullptr;
		}
		return Save(Texture->GetPackage(), Texture, Filename) ? Texture : nullptr;
	}

	/** 파티클 스프라이트의 머티리얼: 흰 그림 × 파티클 색 × 파티클 알파를 빛으로 더한다(가산, 그림자 없음). */
	UMaterial* CreateParticleMaterial(const TCHAR* Name, UTexture2D* Texture)
	{
		FString Filename;
		UPackage* Package = NewPackage(FString::Printf(TEXT("/Game/Effects/%s"), Name), Filename);
		UMaterial* Material = NewObject<UMaterial>(Package, Name, RF_Public | RF_Standalone);
		Material->BlendMode = BLEND_Additive;
		Material->SetShadingModel(MSM_Unlit);
		Material->SetUsageByFlag(MATUSAGE_NiagaraSprites, true);
		UMaterialExpressionTextureSample* Sample = NewObject<UMaterialExpressionTextureSample>(Material);
		Sample->Texture = Texture;
		UMaterialExpressionParticleColor* Color = NewObject<UMaterialExpressionParticleColor>(Material);
		UMaterialExpressionMultiply* Tinted = NewObject<UMaterialExpressionMultiply>(Material);
		Tinted->A.Connect(1, Sample);
		Tinted->B.Connect(1, Color);
		UMaterialExpressionMultiply* Faded = NewObject<UMaterialExpressionMultiply>(Material);
		Faded->A.Connect(0, Tinted);
		Faded->B.Connect(4, Color);
		for (UMaterialExpression* Expression : TArray<UMaterialExpression*>{ Sample, Color, Tinted, Faded })
		{
			Material->GetExpressionCollection().AddExpression(Expression);
		}
		Material->GetEditorOnlyData()->EmissiveColor.Connect(0, Faded);
		Material->PostEditChange();
		return Save(Package, Material, Filename) ? Material : nullptr;
	}

	/** 엔진의 템플릿 시스템을 /Game/Effects/<Name>으로 복사하고 스프라이트 렌더러의 머티리얼을 바꾼다(91). 움직임은 템플릿 그대로다. */
	UNiagaraSystem* CreateParticleSystem(const TCHAR* Name, const TCHAR* Template, UMaterialInterface* Material)
	{
		UNiagaraSystem* Source = LoadObject<UNiagaraSystem>(nullptr, *FString::Printf(TEXT("/Niagara/DefaultAssets/Templates/Systems/%s.%s"), Template, Template));
		if (!Source || !Material)
		{
			UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("The Niagara template %s or the particle material is missing."), Template);
			return nullptr;
		}
		FString Filename;
		UPackage* Package = NewPackage(FString::Printf(TEXT("/Game/Effects/%s"), Name), Filename);
		UNiagaraSystem* System = DuplicateObject<UNiagaraSystem>(Source, Package, Name);
		System->SetFlags(RF_Public | RF_Standalone);
		for (const FNiagaraEmitterHandle& Handle : System->GetEmitterHandles())
		{
			if (FVersionedNiagaraEmitterData* Data = Handle.GetEmitterData())
			{
				for (UNiagaraRendererProperties* Renderer : Data->GetRenderers())
				{
					if (UNiagaraSpriteRendererProperties* Sprite = Cast<UNiagaraSpriteRendererProperties>(Renderer))
					{
						Sprite->Material = Material;
					}
				}
			}
		}
		System->RequestCompile(false);
		System->WaitForCompilationComplete();
		return Save(Package, System, Filename) ? System : nullptr;
	}

	/**
	 * 모양 겹의 머티리얼(104): 흰 그림의 밝기 × 색(커스텀 프리미티브 데이터 0–2) × 불투명도(3)를 빛으로 더한다. 인스턴스가 그림(Sprite),
	 * 그림이 세로로 흐르는 속도(PanV. 기둥), 판의 네 가장자리를 흐리는 정도(EdgeFade. 기둥), 가장자리만 밝히는 정도(Fresnel. 방패, 운석)를 정한다.
	 */
	UMaterial* CreateFxMaterial(UTexture2D* DefaultSprite)
	{
		FString Filename;
		UPackage* Package = NewPackage(TEXT("/Game/Effects/M_Fx"), Filename);
		UMaterial* Material = NewObject<UMaterial>(Package, TEXT("M_Fx"), RF_Public | RF_Standalone);
		Material->BlendMode = BLEND_Additive;
		Material->SetShadingModel(MSM_Unlit);
		Material->TwoSided = true;
		UMaterialExpressionTextureObjectParameter* Sprite = NewObject<UMaterialExpressionTextureObjectParameter>(Material);
		Sprite->ParameterName = TEXT("Sprite");
		Sprite->Texture = DefaultSprite;
		const auto Scalar = [Material](const TCHAR* Name)
		{
			UMaterialExpressionScalarParameter* Parameter = NewObject<UMaterialExpressionScalarParameter>(Material);
			Parameter->ParameterName = Name;
			Parameter->DefaultValue = 0.0f;
			return Parameter;
		};
		UMaterialExpressionVectorParameter* Tint = NewObject<UMaterialExpressionVectorParameter>(Material);
		Tint->ParameterName = TEXT("Tint");
		Tint->bUseCustomPrimitiveData = true;
		Tint->PrimitiveDataIndex = 0;
		Tint->DefaultValue = FLinearColor::White;
		UMaterialExpressionCustom* Custom = NewObject<UMaterialExpressionCustom>(Material);
		Custom->OutputType = CMOT_Float3;
		Custom->Code = TEXT(
			"float2 Moved = UV + float2(0.0, Time * PanV);\n"
			"float Shape = Texture2DSample(Sprite, SpriteSampler, Moved).r;\n"
			"float Edge = lerp(1.0, saturate(sin(saturate(UV.y) * 3.14159) * 1.4) * saturate(sin(saturate(UV.x) * 3.14159) * 1.2), EdgeFade);\n"
			"float Rim = lerp(1.0, pow(saturate(1.0 - abs(dot(normalize(Normal), normalize(View)))), 1.5) * 1.6, Fresnel);\n"
			"return Tint * Shape * Edge * Rim * Opacity;");
		Custom->Inputs.Empty();
		TArray<UMaterialExpression*> Expressions = { Sprite, Tint, Custom };
		const auto Input = [&](const TCHAR* Name, UMaterialExpression* Source, int32 Output)
		{
			FCustomInput& In = Custom->Inputs.AddDefaulted_GetRef();
			In.InputName = Name;
			In.Input.Connect(Output, Source);
			Expressions.AddUnique(Source);
		};
		Input(TEXT("UV"), NewObject<UMaterialExpressionTextureCoordinate>(Material), 0);
		Input(TEXT("Time"), NewObject<UMaterialExpressionTime>(Material), 0);
		Input(TEXT("PanV"), Scalar(TEXT("PanV")), 0);
		Input(TEXT("EdgeFade"), Scalar(TEXT("EdgeFade")), 0);
		Input(TEXT("Fresnel"), Scalar(TEXT("Fresnel")), 0);
		Input(TEXT("Tint"), Tint, 0);
		Input(TEXT("Opacity"), Tint, 4);
		Input(TEXT("Normal"), NewObject<UMaterialExpressionVertexNormalWS>(Material), 0);
		Input(TEXT("View"), NewObject<UMaterialExpressionCameraVectorWS>(Material), 0);
		Input(TEXT("Sprite"), Sprite, 0);
		for (UMaterialExpression* Expression : Expressions)
		{
			Material->GetExpressionCollection().AddExpression(Expression);
		}
		Material->GetEditorOnlyData()->EmissiveColor.Connect(0, Custom);
		Material->PostEditChange();
		return Save(Package, Material, Filename) ? Material : nullptr;
	}

	/** 색을 입히는 파티클 머티리얼(104): 흰 그림의 밝기 × Tint × 파티클의 알파(템플릿의 색은 쓰지 않아 스킬마다 색을 정함). */
	UMaterial* CreateTintedParticleMaterial(UTexture2D* DefaultSprite)
	{
		FString Filename;
		UPackage* Package = NewPackage(TEXT("/Game/Effects/M_ParticleTint"), Filename);
		UMaterial* Material = NewObject<UMaterial>(Package, TEXT("M_ParticleTint"), RF_Public | RF_Standalone);
		Material->BlendMode = BLEND_Additive;
		Material->SetShadingModel(MSM_Unlit);
		Material->SetUsageByFlag(MATUSAGE_NiagaraSprites, true);
		UMaterialExpressionTextureSampleParameter2D* Sample = NewObject<UMaterialExpressionTextureSampleParameter2D>(Material);
		Sample->ParameterName = TEXT("Sprite");
		Sample->Texture = DefaultSprite;
		UMaterialExpressionVectorParameter* Tint = NewObject<UMaterialExpressionVectorParameter>(Material);
		Tint->ParameterName = TEXT("Tint");
		Tint->DefaultValue = FLinearColor::White;
		UMaterialExpressionParticleColor* Color = NewObject<UMaterialExpressionParticleColor>(Material);
		UMaterialExpressionMultiply* Tinted = NewObject<UMaterialExpressionMultiply>(Material);
		Tinted->A.Connect(1, Sample);
		Tinted->B.Connect(0, Tint);
		UMaterialExpressionMultiply* Faded = NewObject<UMaterialExpressionMultiply>(Material);
		Faded->A.Connect(0, Tinted);
		Faded->B.Connect(4, Color);
		for (UMaterialExpression* Expression : TArray<UMaterialExpression*>{ Sample, Tint, Color, Tinted, Faded })
		{
			Material->GetExpressionCollection().AddExpression(Expression);
		}
		Material->GetEditorOnlyData()->EmissiveColor.Connect(0, Faded);
		Material->PostEditChange();
		return Save(Package, Material, Filename) ? Material : nullptr;
	}

	/** 머티리얼 인스턴스를 /Game/Effects/<Path>로 만든다. Fill이 파라미터를 채운다. */
	UMaterialInstanceConstant* CreateInstance(const FString& Path, UMaterialInterface* Parent, TFunctionRef<void(UMaterialInstanceConstant&)> Fill)
	{
		FString Filename;
		UPackage* Package = NewPackage(FString::Printf(TEXT("/Game/Effects/%s"), *Path), Filename);
		UMaterialInstanceConstant* Instance = NewObject<UMaterialInstanceConstant>(Package, *FPaths::GetCleanFilename(Path), RF_Public | RF_Standalone);
		Instance->SetParentEditorOnly(Parent);
		Fill(*Instance);
		Instance->PostEditChange();
		return Save(Package, Instance, Filename) ? Instance : nullptr;
	}

	template <typename T>
	T* CreateSimple(const TCHAR* Name)
	{
		FString Filename;
		UPackage* Package = NewPackage(FString::Printf(TEXT("/Game/Effects/%s"), Name), Filename);
		T* Asset = NewObject<T>(Package, Name, RF_Public | RF_Standalone);
		return Asset;
	}

	bool SaveSimple(UObject* Asset)
	{
		return Save(Asset->GetPackage(), Asset, FPackageName::LongPackageNameToFilename(Asset->GetPackage()->GetName(), FPackageName::GetAssetPackageExtension()));
	}

	double Envelope(double T, double Attack, double Decay)
	{
		return FMath::Min(1.0, T / Attack) * FMath::Exp(-T * Decay);
	}

	/** 8초에 정수 번 도는 진동수로 맞춰 되풀이가 끊기지 않게 한다. */
	double LoopFrequency(double Hertz)
	{
		return FMath::RoundToDouble(Hertz * 8.0) / 8.0;
	}

	/** 화음 하나를 천천히 떨리게 이어 낸 8초의 배경음. Pulse면 박자에 맞춰 두드린다(보스). */
	TArray<float> Pad(std::initializer_list<double> Chord, bool bPulse)
	{
		TArray<double> Notes;
		for (const double Note : Chord)
		{
			Notes.Add(LoopFrequency(Note));
		}
		return Synth(8.0, [&Notes, bPulse](double T)
		{
			double Sum = 0.0;
			for (const double Note : Notes)
			{
				Sum += FMath::Sin(UE_DOUBLE_TWO_PI * Note * T);
			}
			// 0.25 Hz(8초에 두 번)로 떨려 이음매가 같다.
			const double Swell = 0.75 + 0.25 * FMath::Sin(UE_DOUBLE_TWO_PI * 0.25 * T);
			const double Beat = bPulse ? 0.6 + 0.4 * FMath::Exp(-FMath::Fmod(T, 0.5) * 8.0) : 1.0;
			return Sum / Notes.Num() * 0.18 * Swell * Beat;
		});
	}
}

namespace
{
	/**
	 * 스킬마다 다른 연출(104). 모양 겹(M_Fx의 인스턴스를 입힌 엔진 도형)과 색을 입힌 파티클(템플릿의 복사본)로, 직업의 색(기사는 강철·금,
	 * 마법사는 원소)과 스킬의 모양(베기, 땅의 고리, 기둥, 방패, 떨어지는 운석, 시전의 마법진)을 나눈다. 부활과 레벨 업의 줄에도 겹을 더한다.
	 * 땅은 연출의 자리(가슴)에서 Z −98이다.
	 */
	bool AddSkillCues(UMmoCues& Cues, TFunctionRef<UTexture2D*(const TCHAR*)> SpriteOf, USoundBase* CastSound, USoundBase* HitSound, USoundBase* ReviveSound)
	{
		UMaterial* Fx = CreateFxMaterial(SpriteOf(TEXT("circle_02")));
		UMaterial* Tint = CreateTintedParticleMaterial(SpriteOf(TEXT("spark_01")));
		if (!Fx || !Tint)
		{
			return false;
		}

		bool bFailed = false;
		const auto Shape = [&](const TCHAR* Sprite, float PanV, float EdgeFade, float Fresnel) -> TSoftObjectPtr<UMaterialInterface>
		{
			const FString Name = FString::Printf(TEXT("Fx/MI_Fx_%s%s%s"), Sprite, PanV != 0.0f ? TEXT("_Flow") : TEXT(""), Fresnel > 0.0f ? TEXT("_Rim") : TEXT(""));
			UTexture2D* Texture = SpriteOf(Sprite);
			UMaterialInstanceConstant* Instance = Texture ? CreateInstance(Name, Fx, [&](UMaterialInstanceConstant& Out)
			{
				Out.SetTextureParameterValueEditorOnly(FMaterialParameterInfo(TEXT("Sprite")), Texture);
				Out.SetScalarParameterValueEditorOnly(FMaterialParameterInfo(TEXT("PanV")), PanV);
				Out.SetScalarParameterValueEditorOnly(FMaterialParameterInfo(TEXT("EdgeFade")), EdgeFade);
				Out.SetScalarParameterValueEditorOnly(FMaterialParameterInfo(TEXT("Fresnel")), Fresnel);
			}) : nullptr;
			bFailed |= !Instance;
			return Instance;
		};
		const auto Burst = [&](const TCHAR* System, const TCHAR* Template, const TCHAR* Sprite, const FLinearColor& Color) -> TSoftObjectPtr<UNiagaraSystem>
		{
			UTexture2D* Texture = SpriteOf(Sprite);
			UMaterialInstanceConstant* Instance = Texture ? CreateInstance(FString::Printf(TEXT("Fx/MI_%s"), System), Tint, [&](UMaterialInstanceConstant& Out)
			{
				Out.SetTextureParameterValueEditorOnly(FMaterialParameterInfo(TEXT("Sprite")), Texture);
				Out.SetVectorParameterValueEditorOnly(FMaterialParameterInfo(TEXT("Tint")), Color);
			}) : nullptr;
			UNiagaraSystem* Created = Instance ? CreateParticleSystem(System, Template, Instance) : nullptr;
			bFailed |= !Created;
			return Created;
		};

		const FLinearColor Steel(2.2f, 2.6f, 3.4f);
		const FLinearColor Gold(4.0f, 2.7f, 0.7f);
		const FLinearColor Shield(0.7f, 1.7f, 4.5f);
		const FLinearColor Blood(3.6f, 0.35f, 0.25f);
		const FLinearColor Fire(5.0f, 1.5f, 0.25f);
		const FLinearColor Arcane(2.4f, 0.9f, 5.0f);
		const FLinearColor Heal(1.0f, 4.0f, 1.2f);
		const FLinearColor Frost(1.0f, 2.6f, 5.0f);
		const FLinearColor Spirit(0.5f, 3.4f, 3.0f);
		const FLinearColor Dust(1.4f, 1.0f, 0.6f);

		const TSoftObjectPtr<UMaterialInterface> Ring = Shape(TEXT("circle_02"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> ThickRing = Shape(TEXT("circle_03"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Disc = Shape(TEXT("circle_05"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Glow = Shape(TEXT("light_01"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> RuneA = Shape(TEXT("magic_01"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> RuneB = Shape(TEXT("magic_02"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Crescent = Shape(TEXT("slash_02"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Arc = Shape(TEXT("slash_03"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Swirl = Shape(TEXT("twirl_02"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> Star = Shape(TEXT("star_06"), 0.0f, 0.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> FlameFlow = Shape(TEXT("flame_01"), 1.4f, 1.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> MistFlow = Shape(TEXT("smoke_01"), 0.8f, 1.0f, 0.0f);
		const TSoftObjectPtr<UMaterialInterface> ShieldRim = Shape(TEXT("smoke_01"), 0.25f, 0.0f, 1.0f);
		const TSoftObjectPtr<UMaterialInterface> FireBall = Shape(TEXT("flame_01"), -2.0f, 0.0f, 0.6f);

		const TSoftObjectPtr<UNiagaraSystem> SteelSparks = Burst(TEXT("NS_Steel"), TEXT("RadialBurst"), TEXT("spark_01"), Steel);
		const TSoftObjectPtr<UNiagaraSystem> GoldStars = Burst(TEXT("NS_Gold"), TEXT("RadialBurst"), TEXT("star_01"), Gold);
		const TSoftObjectPtr<UNiagaraSystem> ShieldStars = Burst(TEXT("NS_Shield"), TEXT("DirectionalBurst"), TEXT("star_06"), Shield);
		const TSoftObjectPtr<UNiagaraSystem> BloodSparks = Burst(TEXT("NS_Blood"), TEXT("RadialBurst"), TEXT("spark_01"), Blood);
		const TSoftObjectPtr<UNiagaraSystem> Embers = Burst(TEXT("NS_Embers"), TEXT("DirectionalBurst"), TEXT("flame_01"), Fire);
		const TSoftObjectPtr<UNiagaraSystem> ArcaneSparks = Burst(TEXT("NS_Arcane"), TEXT("RadialBurst"), TEXT("star_01"), Arcane);
		const TSoftObjectPtr<UNiagaraSystem> ArcaneTrail = Burst(TEXT("NS_ArcaneTrail"), TEXT("FountainLightweight"), TEXT("star_01"), Arcane * 0.7f);
		const TSoftObjectPtr<UNiagaraSystem> FireBurst = Burst(TEXT("NS_Fire"), TEXT("RadialBurst"), TEXT("flame_01"), Fire);
		const TSoftObjectPtr<UNiagaraSystem> HealStars = Burst(TEXT("NS_Heal"), TEXT("DirectionalBurst"), TEXT("star_06"), Heal);
		const TSoftObjectPtr<UNiagaraSystem> FrostStars = Burst(TEXT("NS_Frost"), TEXT("RadialBurst"), TEXT("star_06"), Frost);
		const TSoftObjectPtr<UNiagaraSystem> SpiritStars = Burst(TEXT("NS_Spirit"), TEXT("DirectionalBurst"), TEXT("star_01"), Spirit);
		const TSoftObjectPtr<UNiagaraSystem> DustCloud = Burst(TEXT("NS_Dust"), TEXT("RadialBurst"), TEXT("smoke_01"), Dust * 0.4f);
		if (bFailed)
		{
			return false;
		}

		const TSoftObjectPtr<UStaticMesh> Plane(FSoftObjectPath(TEXT("/Engine/BasicShapes/Plane.Plane")));
		const TSoftObjectPtr<UStaticMesh> Sphere(FSoftObjectPath(TEXT("/Engine/BasicShapes/Sphere.Sphere")));
		constexpr double Floor = -98.0;
		const auto Layer = [](const TSoftObjectPtr<UStaticMesh>& Mesh, const TSoftObjectPtr<UMaterialInterface>& Material, const FLinearColor& Color, float Duration)
		{
			FMmoFxLayer Out;
			Out.Mesh = Mesh;
			Out.Material = Material;
			Out.Color = Color;
			Out.Duration = Duration;
			return Out;
		};
		// 판은 1 m라 크기가 지름(m)이다.
		const auto Ground = [&](const TSoftObjectPtr<UMaterialInterface>& Material, const FLinearColor& Color, double FromRadius, double ToRadius, float Duration)
		{
			FMmoFxLayer Out = Layer(Plane, Material, Color, Duration);
			Out.From = Out.To = FVector(0.0, 0.0, Floor);
			Out.StartScale = FVector(FromRadius * 2.0, FromRadius * 2.0, 1.0);
			Out.EndScale = FVector(ToRadius * 2.0, ToRadius * 2.0, 1.0);
			return Out;
		};
		const auto Flat = [&](const TSoftObjectPtr<UMaterialInterface>& Material, const FLinearColor& Color, double FromSize, double ToSize, float Duration)
		{
			FMmoFxLayer Out = Layer(Plane, Material, Color, Duration);
			Out.StartScale = FVector(FromSize, FromSize, 1.0);
			Out.EndScale = FVector(ToSize, ToSize, 1.0);
			return Out;
		};
		// 기둥: 세운 판 셋을 60°씩 엇갈려(어느 쪽에서 봐도 굵기가 같음) 땅에서 Height m까지 세우고 천천히 돌린다. 판의 네 가장자리는 흐리다
		// (원기둥은 뚜껑과 UV 때문에 상자처럼 보여 쓰지 않음). 가늘게 나와 굵어진다.
		const auto Pillar = [&](const TSoftObjectPtr<UMaterialInterface>& Material, const FLinearColor& Color, double Radius, double Height, float Duration)
		{
			TArray<FMmoFxLayer> Planes;
			for (const double Yaw : { 0.0, 60.0, 120.0 })
			{
				FMmoFxLayer Out = Layer(Plane, Material, Color * 0.9f, Duration);
				Out.From = Out.To = FVector(0.0, 0.0, Floor + Height * 50.0);
				Out.Rotation = FRotator(0.0, Yaw, 90.0);
				Out.StartScale = FVector(Radius * 1.2, Height, 1.0);
				Out.EndScale = FVector(Radius * 2.2, Height, 1.0);
				Out.FadeIn = 0.08f;
				Out.FadeOut = Duration * 0.5f;
				Out.Spin = 40.0f;
				Planes.Add(Out);
			}
			return Planes;
		};
		const auto Join = [](std::initializer_list<TArray<FMmoFxLayer>> Parts)
		{
			TArray<FMmoFxLayer> Out;
			for (const TArray<FMmoFxLayer>& Part : Parts)
			{
				Out.Append(Part);
			}
			return Out;
		};
		const auto Hold = [](FMmoFxLayer Out, float Spin)
		{
			Out.bHold = true;
			Out.Spin = Spin;
			Out.FadeIn = 0.2f;
			Out.FadeOut = 0.25f;
			return Out;
		};
		const auto Delayed = [](FMmoFxLayer Out, float Delay)
		{
			Out.Delay = Delay;
			return Out;
		};
		const auto Add = [&Cues](EMmoCue Cue, int32 Key, const TSoftObjectPtr<UNiagaraSystem>& Effect, USoundBase* Sound, TArray<FMmoFxLayer> Layers)
		{
			Cues.Rows.Add({ Cue, 0, Key, Effect, Sound, MoveTemp(Layers) });
		};

		// 기사 101 베기: 대상 앞을 가르는 초승달과 기울어진 호, 강철빛 불꽃.
		{
			FMmoFxLayer Second = Delayed(Flat(Arc, Gold * 1.2f, 2.6, 3.6, 0.3f), 0.05f);
			Second.Rotation = FRotator(0.0, 0.0, 30.0);
			Add(EMmoCue::SkillCast, 101, nullptr, CastSound, {});
			Add(EMmoCue::SkillHit, 101, SteelSparks, HitSound, { Flat(Crescent, Steel * 1.8f, 3.2, 4.4, 0.3f), Second, Flat(Glow, Steel, 1.0, 2.6, 0.2f) });
		}
		// 102 방패 치기(기절): 땅을 울리는 금빛 고리와 머리 위에서 도는 별.
		{
			FMmoFxLayer Stun = Flat(Star, Gold * 0.7f, 0.9, 0.9, 1.8f);
			Stun.From = Stun.To = FVector(0.0, 0.0, 95.0);
			Stun.Spin = 240.0f;
			Stun.FadeIn = 0.1f;
			Stun.FadeOut = 0.5f;
			Add(EMmoCue::SkillCast, 102, nullptr, CastSound, {});
			Add(EMmoCue::SkillHit, 102, GoldStars, HitSound, { Ground(Ring, Gold, 0.5, 2.4, 0.45f), Stun, Flat(Glow, Gold, 1.0, 2.5, 0.2f) });
		}
		// 103 수호(방어력 올림): 푸른 방패의 구와 발밑에서 도는 마법진.
		{
			FMmoFxLayer Dome = Layer(Sphere, ShieldRim, Shield * 0.8f, 1.3f);
			Dome.From = Dome.To = FVector(0.0, 0.0, -10.0);
			Dome.StartScale = FVector(2.2);
			Dome.EndScale = FVector(2.6);
			Dome.FadeIn = 0.15f;
			Dome.FadeOut = 0.6f;
			FMmoFxLayer Circle = Ground(RuneB, Shield, 1.6, 1.7, 1.3f);
			Circle.Spin = 70.0f;
			Circle.FadeOut = 0.5f;
			Add(EMmoCue::SkillCast, 103, ShieldStars, CastSound, { Dome, Circle, Ground(Ring, Shield, 0.4, 2.2, 0.5f) });
			Add(EMmoCue::SkillHit, 103, nullptr, nullptr, {});
		}
		// 104 회전 베기(자기 둘레 4 m): 빠르게 도는 소용돌이와 퍼지는 먼지.
		{
			FMmoFxLayer Whirl = Flat(Swirl, Steel * 1.1f, 3.0, 8.5, 0.45f);
			Whirl.From = Whirl.To = FVector(0.0, 0.0, -50.0);
			Whirl.Spin = 900.0f;
			Whirl.FadeOut = 0.25f;
			Add(EMmoCue::SkillCast, 104, nullptr, CastSound, { Whirl, Ground(Disc, Dust * 0.6f, 1.0, 4.2, 0.55f), Ground(Ring, Steel * 0.7f, 1.0, 4.2, 0.4f) });
			Add(EMmoCue::SkillHit, 104, SteelSparks, HitSound, {});
		}
		// 105 힘줄 끊기(감속): 붉은 두 호와 조여 드는 보랏빛 고리.
		{
			FMmoFxLayer First = Flat(Arc, Blood * 1.8f, 2.8, 3.8, 0.3f);
			First.Rotation = FRotator(0.0, 0.0, 40.0);
			FMmoFxLayer Second = Delayed(Flat(Crescent, Blood * 1.4f, 2.4, 3.4, 0.28f), 0.05f);
			Second.Rotation = FRotator(0.0, 180.0, 0.0);
			FMmoFxLayer Slow = Ground(Ring, Arcane * 0.6f, 1.6, 0.8, 0.9f);
			Slow.FadeIn = 0.1f;
			Slow.FadeOut = 0.4f;
			Add(EMmoCue::SkillCast, 105, nullptr, CastSound, {});
			Add(EMmoCue::SkillHit, 105, BloodSparks, HitSound, { First, Second, Slow });
		}
		// 106 분노(공격력 올림): 솟는 불기둥과 붉은 고리.
		Add(EMmoCue::SkillCast, 106, Embers, CastSound, Join({ Pillar(FlameFlow, Fire, 0.9, 3.2, 1.0f), { Ground(Disc, Fire * 0.5f, 0.6, 2.6, 0.6f), Ground(Ring, Fire, 0.5, 2.8, 0.45f) } }));
		Add(EMmoCue::SkillHit, 106, nullptr, nullptr, {});

		// 마법사 201 마력탄: 손 앞에 서는 보랏빛 마법진(발사체는 마력의 흔적).
		{
			FMmoFxLayer Circle = Flat(RuneA, Arcane * 1.4f, 1.4, 2.6, 0.4f);
			Circle.From = Circle.To = FVector(120.0, 0.0, 0.0);
			Circle.Rotation = FRotator(90.0, 0.0, 0.0);
			FMmoFxLayer Flash = Flat(Glow, Arcane, 0.6, 1.6, 0.2f);
			Flash.From = Flash.To = Circle.From;
			Flash.Rotation = Circle.Rotation;
			Add(EMmoCue::SkillCast, 201, ArcaneSparks, CastSound, { Circle, Flash, Ground(Ring, Arcane, 0.5, 1.8, 0.35f) });
		}
		// 202 운석(대상 둘레 4 m, 시전 1.5초): 발밑의 불의 마법진, 떨어지는 불덩이, 퍼지는 불의 고리와 타는 땅.
		{
			FMmoFxLayer Meteor = Layer(Sphere, FireBall, Fire * 1.3f, 0.28f);
			Meteor.From = FVector(0.0, 0.0, 1400.0);
			Meteor.To = FVector(0.0, 0.0, -60.0);
			Meteor.StartScale = Meteor.EndScale = FVector(1.3);
			Meteor.FadeIn = Meteor.FadeOut = 0.02f;
			FMmoFxLayer Flash = Delayed(Flat(Glow, Fire * 1.2f, 3.0, 8.0, 0.3f), 0.26f);
			Flash.From = Flash.To = FVector(0.0, 0.0, -40.0);
			FMmoFxLayer Burning = Delayed(Ground(Disc, Fire * 0.3f, 3.8, 4.0, 1.6f), 0.3f);
			Burning.FadeIn = 0.1f;
			Burning.FadeOut = 1.1f;
			Add(EMmoCue::SkillCharge, 202, nullptr, nullptr, { Hold(Ground(RuneB, Fire * 0.8f, 1.6, 1.7, 1.5f), 45.0f), Hold(Ground(Glow, Fire * 0.35f, 1.2, 1.4, 1.5f), 0.0f) });
			Add(EMmoCue::SkillCast, 202, nullptr, CastSound, {});
			Add(EMmoCue::SkillHit, 202, nullptr, HitSound, { Meteor, Delayed(Ground(Ring, Fire, 1.0, 4.5, 0.5f), 0.26f), Flash, Burning });
		}
		// 203 치유(시전 1초): 발밑의 초록 마법진, 대상에 서는 빛기둥과 올라가는 고리.
		{
			FMmoFxLayer Rising = Ground(Ring, Heal, 1.0, 0.7, 1.0f);
			Rising.To = FVector(0.0, 0.0, 120.0);
			Add(EMmoCue::SkillCharge, 203, nullptr, nullptr, { Hold(Ground(RuneA, Heal * 0.8f, 1.4, 1.5, 1.0f), 40.0f) });
			Add(EMmoCue::SkillCast, 203, nullptr, CastSound, {});
			Add(EMmoCue::SkillHit, 203, HealStars, nullptr, Join({ Pillar(MistFlow, Heal, 0.8, 3.0, 1.1f), { Rising } }));
		}
		// 204 서리(자기 둘레 5 m, 감속): 퍼지는 얼음 고리와 서리 낀 땅.
		{
			FMmoFxLayer Frosted = Ground(Disc, Frost * 0.35f, 4.8, 5.0, 1.6f);
			Frosted.FadeIn = 0.1f;
			Frosted.FadeOut = 1.1f;
			Add(EMmoCue::SkillCast, 204, nullptr, CastSound, { Ground(ThickRing, Frost, 1.0, 5.2, 0.5f), Frosted, Flat(Glow, Frost, 1.5, 4.0, 0.25f) });
			Add(EMmoCue::SkillHit, 204, FrostStars, HitSound, {});
		}
		// 205 화염(시전 2초): 발밑의 불의 마법진, 대상에 치솟는 불기둥.
		Add(EMmoCue::SkillCharge, 205, nullptr, nullptr, { Hold(Ground(RuneA, Fire * 0.8f, 1.4, 1.5, 2.0f), -60.0f), Hold(Ground(Ring, Fire * 0.5f, 1.6, 1.6, 2.0f), 0.0f) });
		Add(EMmoCue::SkillCast, 205, nullptr, CastSound, {});
		Add(EMmoCue::SkillHit, 205, FireBurst, HitSound, Join({ Pillar(FlameFlow, Fire * 1.2f, 1.0, 4.5, 1.0f), { Ground(Disc, Fire * 0.5f, 0.5, 2.4, 0.7f), Flat(Glow, Fire, 1.0, 4.0, 0.25f) } }));
		// 206 정령 부르기(시전 2초): 청록의 마법진과 빛기둥.
		Add(EMmoCue::SkillCharge, 206, nullptr, nullptr, { Hold(Ground(RuneB, Spirit * 0.8f, 1.9, 2.0, 2.0f), 30.0f) });
		Add(EMmoCue::SkillCast, 206, nullptr, CastSound, {});
		Add(EMmoCue::SkillHit, 206, SpiritStars, nullptr, Join({ Pillar(MistFlow, Spirit, 1.1, 4.0, 1.2f), { Ground(Ring, Spirit, 1.0, 3.0, 0.7f) } }));
		// 보스 901 내려찍기(43): 퍼지는 흙먼지와 땅의 고리.
		{
			FMmoFxLayer Flash = Flat(Glow, Fire * 0.5f, 2.0, 6.0, 0.25f);
			Flash.From = Flash.To = FVector(0.0, 0.0, -60.0);
			Add(EMmoCue::SkillHit, 901, DustCloud, HitSound, { Ground(Disc, Dust * 0.7f, 1.0, 5.5, 0.7f), Ground(Ring, Dust * 1.2f, 1.0, 5.5, 0.5f), Flash });
		}

		// 부활과 레벨 업의 줄(키 0)에 금빛 기둥과 고리를 더하고, 마법사의 발사체를 마력의 흔적으로 바꾼다.
		for (FMmoCueRow& Row : Cues.Rows)
		{
			if (Row.Cue == EMmoCue::Revive)
			{
				Row.Layers = Join({ Pillar(MistFlow, Gold, 0.9, 3.5, 1.3f), { Ground(Ring, Gold, 0.5, 2.2, 0.7f) } });
			}
			else if (Row.Cue == EMmoCue::LevelUp)
			{
				FMmoFxLayer Rising = Ground(Ring, Gold, 1.2, 0.8, 1.2f);
				Rising.To = FVector(0.0, 0.0, 250.0);
				FMmoFxLayer Circle = Ground(RuneB, Gold * 0.7f, 1.8, 1.8, 1.5f);
				Circle.Spin = 60.0f;
				Row.Layers = Join({ Pillar(MistFlow, Gold * 1.2f, 1.0, 4.0, 1.5f), { Rising, Circle } });
			}
			else if (Row.Cue == EMmoCue::Projectile && Row.Kind == UMmoEntityVisuals::PlayerKind() && Row.Key == UMmoEntityVisuals::MageKey())
			{
				Row.Effect = ArcaneTrail;
			}
		}
		return true;
	}
}

UMmoCreateEffectAssetsCommandlet::UMmoCreateEffectAssetsCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

int32 UMmoCreateEffectAssetsCommandlet::Main(const FString& Params)
{
	USoundClass* Effects = CreateSimple<USoundClass>(TEXT("SC_Effects"));
	USoundClass* Music = CreateSimple<USoundClass>(TEXT("SC_Music"));
	USoundAttenuation* Attenuation = CreateSimple<USoundAttenuation>(TEXT("SA_Effects"));
	// 4 m 안은 그대로, 그 밖은 40 m까지 줄어든다(카메라 거리 13–36 m).
	Attenuation->Attenuation.AttenuationShapeExtents = FVector(400.0, 0.0, 0.0);
	Attenuation->Attenuation.FalloffDistance = 4000.0f;
	if (!SaveSimple(Effects) || !SaveSimple(Music) || !SaveSimple(Attenuation))
	{
		return 1;
	}

	FRandomStream Noise(27);
	const auto White = [&Noise] { return Noise.FRandRange(-1.0f, 1.0f); };
	double Low = 0.0;
	USoundWave* Hit = CreateSound(TEXT("S_Hit"), Synth(0.15, [&](double T)
	{
		return (White() * 0.6 * FMath::Exp(-T * 40.0) + FMath::Sin(UE_DOUBLE_TWO_PI * 90.0 * T) * 0.5 * FMath::Exp(-T * 25.0)) * 0.8;
	}), Effects, Attenuation, false);
	USoundWave* Skill = CreateSound(TEXT("S_Skill"), Synth(0.35, [](double T)
	{
		return FMath::Sin(UE_DOUBLE_TWO_PI * (400.0 * T + 1000.0 * T * T)) * Envelope(T, 0.01, 8.0) * 0.5;
	}), Effects, Attenuation, false);
	USoundWave* Revive = CreateSound(TEXT("S_Revive"), Synth(0.7, [](double T)
	{
		const double Note = T < 0.2 ? 523.25 : (T < 0.4 ? 659.25 : 783.99);
		return FMath::Sin(UE_DOUBLE_TWO_PI * Note * T) * Envelope(FMath::Fmod(T, 0.2) + (T >= 0.4 ? T - 0.4 : 0.0), 0.01, 4.0) * 0.4;
	}), Effects, Attenuation, false);
	USoundWave* Step = CreateSound(TEXT("S_Footstep"), Synth(0.07, [&](double T)
	{
		Low += (White() - Low) * 0.15;
		return Low * 2.5 * FMath::Exp(-T * 60.0);
	}), Effects, Attenuation, false);
	USoundWave* Click = CreateSound(TEXT("S_UiClick"), Synth(0.04, [](double T) { return FMath::Sin(UE_DOUBLE_TWO_PI * 1500.0 * T) * Envelope(T, 0.002, 80.0) * 0.4; }), Effects, nullptr, false);
	USoundWave* Window = CreateSound(TEXT("S_UiWindow"), Synth(0.12, [](double T)
	{
		return FMath::Sin(UE_DOUBLE_TWO_PI * (500.0 * T + 1700.0 * T * T)) * Envelope(T, 0.005, 20.0) * 0.35;
	}), Effects, nullptr, false);
	USoundWave* LevelUp = CreateSound(TEXT("S_UiLevelUp"), Synth(0.9, [](double T)
	{
		// 도·미·솔·도의 오르는 네 음.
		const double Notes[] = { 523.25, 659.25, 783.99, 1046.5 };
		const int32 Index = FMath::Min(3, static_cast<int32>(T / 0.15));
		return FMath::Sin(UE_DOUBLE_TWO_PI * Notes[Index] * T) * Envelope(T - Index * 0.15, 0.01, Index == 3 ? 3.0 : 10.0) * 0.4;
	}), Effects, nullptr, false);
	USoundWave* PickUp = CreateSound(TEXT("S_UiPickUp"), Synth(0.12, [](double T)
	{
		// 짧게 오르는 두 음.
		return FMath::Sin(UE_DOUBLE_TWO_PI * (T < 0.05 ? 880.0 : 1320.0) * T) * Envelope(FMath::Fmod(T, 0.05), 0.003, 30.0) * 0.35;
	}), Effects, nullptr, false);
	USoundWave* EnchantSuccess = CreateSound(TEXT("S_UiEnchantSuccess"), Synth(0.5, [](double T)
	{
		// 오르는 세 음의 반짝임.
		const double Notes[] = { 659.25, 987.77, 1318.5 };
		const int32 Index = FMath::Min(2, static_cast<int32>(T / 0.1));
		return FMath::Sin(UE_DOUBLE_TWO_PI * Notes[Index] * T) * Envelope(T - Index * 0.1, 0.005, Index == 2 ? 6.0 : 20.0) * 0.4;
	}), Effects, nullptr, false);
	USoundWave* BossAppeared = CreateSound(TEXT("S_UiBossAppeared"), Synth(1.4, [](double T)
	{
		// 낮게 울리며 떨리는 두 음(뿔피리를 흉내 냄. 43).
		const double Note = T < 0.6 ? 146.83 : 110.0;
		const double Tremolo = 0.75 + 0.25 * FMath::Sin(UE_DOUBLE_TWO_PI * 6.0 * T);
		return (FMath::Sin(UE_DOUBLE_TWO_PI * Note * T) + 0.4 * FMath::Sin(UE_DOUBLE_TWO_PI * Note * 2.0 * T)) * Tremolo * Envelope(FMath::Fmod(T, 0.6), 0.04, 2.0) * 0.35;
	}), Effects, nullptr, false);
	USoundWave* EnchantFailure = CreateSound(TEXT("S_UiEnchantFailure"), Synth(0.6, [](double T)
	{
		// 내려가는 낮은 미끄럼.
		return FMath::Sin(UE_DOUBLE_TWO_PI * (300.0 * T - 150.0 * T * T)) * Envelope(T, 0.01, 4.0) * 0.45;
	}), Effects, nullptr, false);
	// 구역의 종류(ZoneKind): 1 마을, 2 사냥터, 3 채집지, 4 보스 자리.
	USoundWave* Town = CreateSound(TEXT("M_Town"), Pad({ 261.63, 329.63, 392.0 }, false), Music, nullptr, true);
	USoundWave* Hunting = CreateSound(TEXT("M_Hunting"), Pad({ 220.0, 261.63, 329.63 }, false), Music, nullptr, true);
	USoundWave* Gathering = CreateSound(TEXT("M_Gathering"), Pad({ 174.61, 220.0, 261.63 }, false), Music, nullptr, true);
	USoundWave* Boss = CreateSound(TEXT("M_Boss"), Pad({ 146.83, 174.61, 220.0 }, true), Music, nullptr, true);
	if (!Hit || !Skill || !Revive || !LevelUp || !PickUp || !EnchantSuccess || !EnchantFailure || !Step || !Click || !Window || !Town || !Hunting || !Gathering || !Boss)
	{
		return 1;
	}

	// 이펙트의 자리 표시: 한 번 터지는 템플릿(타격, 스킬, 부활)과 계속 뿜는 템플릿(발사체).
	const auto Template = [](const TCHAR* Name)
	{
		return TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(FString::Printf(TEXT("/Niagara/DefaultAssets/Templates/Systems/%s.%s"), Name, Name)));
	};
	// 91: 템플릿의 움직임에 Kenney Particle Pack의 그림을 입힌 복사본이다(타격 spark, 스킬·부활 star, 발사체 magic).
	FModuleManager::Get().LoadModuleChecked(TEXT("NiagaraEditor"));
	TMap<FString, UTexture2D*> Sprites;
	const auto SpriteOf = [&Sprites](const TCHAR* Name)
	{
		UTexture2D*& Texture = Sprites.FindOrAdd(Name);
		if (!Texture)
		{
			Texture = ImportParticle(Name);
		}
		return Texture;
	};
	const auto Particle = [&](const TCHAR* System, const TCHAR* Source, const TCHAR* Sprite)
	{
		UTexture2D* Texture = SpriteOf(Sprite);
		UMaterial* Material = Texture ? CreateParticleMaterial(*FString::Printf(TEXT("M_Particle_%s"), Sprite), Texture) : nullptr;
		return TSoftObjectPtr<UNiagaraSystem>(CreateParticleSystem(System, Source, Material));
	};
	const TSoftObjectPtr<UNiagaraSystem> Burst = Particle(TEXT("NS_Hit"), TEXT("RadialBurst"), TEXT("spark_01"));
	const TSoftObjectPtr<UNiagaraSystem> Directional = Particle(TEXT("NS_Skill"), TEXT("DirectionalBurst"), TEXT("star_01"));
	const TSoftObjectPtr<UNiagaraSystem> Fountain = Particle(TEXT("NS_Projectile"), TEXT("FountainLightweight"), TEXT("magic_01"));
	for (const TSoftObjectPtr<UNiagaraSystem>& System : { Burst, Directional, Fountain })
	{
		if (!System.LoadSynchronous())
		{
			UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("The Niagara template %s is missing. Enable the Niagara plugin."), *System.ToString());
			return 1;
		}
	}

	// 피격 번쩍임: 빛을 받지 않는 흰색을 파라미터 Flash만큼 비치게 덮는다(오버레이 머티리얼이라 캐릭터 머티리얼을 고치지 않음).
	UMaterial* Flash = CreateSimple<UMaterial>(TEXT("M_HitFlash"));
	Flash->MaterialDomain = MD_Surface;
	Flash->BlendMode = BLEND_Translucent;
	Flash->SetShadingModel(MSM_Unlit);
	Flash->SetUsageByFlag(MATUSAGE_SkeletalMesh, true);
	UMaterialExpressionScalarParameter* Opacity = NewObject<UMaterialExpressionScalarParameter>(Flash);
	Opacity->ParameterName = TEXT("Flash");
	Opacity->DefaultValue = 0.0f;
	UMaterialExpressionConstant3Vector* FlashColor = NewObject<UMaterialExpressionConstant3Vector>(Flash);
	FlashColor->Constant = FLinearColor(1.0f, 1.0f, 1.0f);
	Flash->GetExpressionCollection().AddExpression(Opacity);
	Flash->GetExpressionCollection().AddExpression(FlashColor);
	Flash->GetEditorOnlyData()->EmissiveColor.Connect(0, FlashColor);
	Flash->GetEditorOnlyData()->Opacity.Connect(0, Opacity);
	Flash->PostEditChange();
	if (!SaveSimple(Flash))
	{
		return 1;
	}

	UMmoCues* Cues = CreateSimple<UMmoCues>(TEXT("DA_Cues"));
	Cues->EffectsClass = Effects;
	Cues->MusicClass = Music;
	Cues->HitFlash = Flash;
	const int32 Player = UMmoEntityVisuals::PlayerKind();
	const int32 Monster = UMmoEntityVisuals::MonsterKind();
	const auto Add = [Cues](EMmoCue Cue, int32 Kind, int32 Key, const TSoftObjectPtr<UNiagaraSystem>& Effect, USoundBase* Sound)
	{
		Cues->Rows.Add({ Cue, Kind, Key, Effect, Sound });
	};
	// 직업과 몬스터 템플릿마다의 줄은 그림과 소리가 생기는 91이 더한다. 지금은 종류의 기본 줄(키 0)이 받는다. 스킬마다의 줄은 아래(104).
	Add(EMmoCue::Hit, Player, UMmoEntityVisuals::KnightKey(), Burst, Hit);
	Add(EMmoCue::Hit, Player, UMmoEntityVisuals::MageKey(), Burst, Hit);
	Add(EMmoCue::Hit, Monster, 0, Burst, Hit);
	// 받지 않은 공격자(번호 0)의 타격과 발사체.
	Add(EMmoCue::Hit, 0, 0, Burst, Hit);
	Add(EMmoCue::Projectile, Player, UMmoEntityVisuals::MageKey(), Fountain, nullptr);
	Add(EMmoCue::Projectile, Monster, 0, Fountain, nullptr);
	Add(EMmoCue::Projectile, 0, 0, Fountain, nullptr);
	Add(EMmoCue::SkillCast, 0, 0, Directional, Skill);
	// SimpleExplosion은 연기가 캐릭터를 가려 쓰지 않는다.
	Add(EMmoCue::SkillHit, 0, 0, Burst, Hit);
	Add(EMmoCue::Revive, 0, 0, Directional, Revive);
	Add(EMmoCue::Footstep, 0, 0, nullptr, Step);
	Add(EMmoCue::UiClick, 0, 0, nullptr, Click);
	Add(EMmoCue::UiWindow, 0, 0, nullptr, Window);
	Add(EMmoCue::Music, 0, 1, nullptr, Town);
	Add(EMmoCue::Music, 0, 2, nullptr, Hunting);
	Add(EMmoCue::Music, 0, 3, nullptr, Gathering);
	Add(EMmoCue::Music, 0, 4, nullptr, Boss);
	Add(EMmoCue::LevelUp, 0, 0, Burst, nullptr);
	Add(EMmoCue::UiLevelUp, 0, 0, nullptr, LevelUp);
	Add(EMmoCue::UiPickUp, 0, 0, nullptr, PickUp);
	Add(EMmoCue::UiEnchantSuccess, 0, 0, nullptr, EnchantSuccess);
	Add(EMmoCue::UiEnchantFailure, 0, 0, nullptr, EnchantFailure);
	Add(EMmoCue::UiBossAppeared, 0, 0, nullptr, BossAppeared);
	if (!AddSkillCues(*Cues, SpriteOf, Skill, Hit, Revive))
	{
		return 1;
	}
	return SaveSimple(Cues) ? 0 : 1;
}
