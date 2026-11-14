#include "MmoCreateEffectAssetsCommandlet.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Game/MmoCues.h"
#include "Game/MmoEntityVisuals.h"
#include "HAL/FileManager.h"
#include "Misc/PackageName.h"
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

	/** 소리 하나를 만들어 저장한다. Attenuation이 있으면 거리에 따라 작아지는 3D 효과음이다. */
	USoundWave* CreateSound(const TCHAR* Name, const TArray<float>& Samples, USoundClass* Class, USoundAttenuation* Attenuation, bool bLooping)
	{
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
	// 구역의 종류(ZoneKind): 1 마을, 2 사냥터, 3 채집지, 4 보스 자리.
	USoundWave* Town = CreateSound(TEXT("M_Town"), Pad({ 261.63, 329.63, 392.0 }, false), Music, nullptr, true);
	USoundWave* Hunting = CreateSound(TEXT("M_Hunting"), Pad({ 220.0, 261.63, 329.63 }, false), Music, nullptr, true);
	USoundWave* Gathering = CreateSound(TEXT("M_Gathering"), Pad({ 174.61, 220.0, 261.63 }, false), Music, nullptr, true);
	USoundWave* Boss = CreateSound(TEXT("M_Boss"), Pad({ 146.83, 174.61, 220.0 }, true), Music, nullptr, true);
	if (!Hit || !Skill || !Revive || !Step || !Click || !Window || !Town || !Hunting || !Gathering || !Boss)
	{
		return 1;
	}

	// 이펙트의 자리 표시: 한 번 터지는 템플릿(타격, 스킬, 부활)과 계속 뿜는 템플릿(발사체).
	const auto Template = [](const TCHAR* Name)
	{
		return TSoftObjectPtr<UNiagaraSystem>(FSoftObjectPath(FString::Printf(TEXT("/Niagara/DefaultAssets/Templates/Systems/%s.%s"), Name, Name)));
	};
	const TSoftObjectPtr<UNiagaraSystem> Burst = Template(TEXT("RadialBurst"));
	const TSoftObjectPtr<UNiagaraSystem> Directional = Template(TEXT("DirectionalBurst"));
	const TSoftObjectPtr<UNiagaraSystem> Fountain = Template(TEXT("FountainLightweight"));
	for (const TSoftObjectPtr<UNiagaraSystem>& System : { Burst, Directional, Fountain })
	{
		if (!System.LoadSynchronous())
		{
			UE_LOG(LogMmoCreateEffectAssets, Error, TEXT("The Niagara template %s is missing. Enable the Niagara plugin."), *System.ToString());
			return 1;
		}
	}

	UMmoCues* Cues = CreateSimple<UMmoCues>(TEXT("DA_Cues"));
	Cues->EffectsClass = Effects;
	Cues->MusicClass = Music;
	const int32 Player = UMmoEntityVisuals::PlayerKind();
	const int32 Monster = UMmoEntityVisuals::MonsterKind();
	const auto Add = [Cues](EMmoCue Cue, int32 Kind, int32 Key, const TSoftObjectPtr<UNiagaraSystem>& Effect, USoundBase* Sound)
	{
		Cues->Rows.Add({ Cue, Kind, Key, Effect, Sound });
	};
	// 직업과 몬스터 템플릿마다의 줄, 스킬 번호마다의 줄은 그림과 소리가 생기는 91이 더한다. 지금은 종류의 기본 줄(키 0)이 받는다.
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
	return SaveSimple(Cues) ? 0 : 1;
}
