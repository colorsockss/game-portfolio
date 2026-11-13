#include "MmoCreateCharacterAssetsCommandlet.h"

#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace1D.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Game/MmoEntityVisuals.h"
#include "HAL/FileManager.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateCharacterAssets, Log, All);

namespace
{
	/** 달리기의 속도(언리얼 단위/초). Constant의 최대 속도 6 m/s다. */
	constexpr float RunSpeed = 600.0f;

	struct FClassAnimations
	{
		const TCHAR* Folder;
		const TCHAR* ClassName;
		const TCHAR* SourceName;
		/** 표현 표의 키(직업의 값). */
		int32 Key;
	};

	/** 패키지에 에셋 하나를 새로 저장한다. 같은 이름의 파일이 있으면 지우고 만든다. */
	bool Save(UPackage* Package, UObject* Asset, const FString& Filename)
	{
		FAssetRegistryModule::AssetCreated(Asset);
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		if (!UPackage::SavePackage(Package, Asset, *Filename, Args))
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("Could not save %s."), *Filename);
			return false;
		}
		UE_LOG(LogMmoCreateCharacterAssets, Display, TEXT("Created %s"), *Package->GetName());
		return true;
	}

	bool CreateLocomotion(const FClassAnimations& Class)
	{
		const FString Folder(Class.Folder);
		const FString Source(Class.SourceName);
		USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *FString::Printf(TEXT("%s/%s_Skeleton.%s_Skeleton"), *Folder, *Source, *Source));
		UAnimSequence* Idle = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_Idle_Weapon"), *Folder, *Source));
		UAnimSequence* Run = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_Run_Weapon"), *Folder, *Source));
		if (!Skeleton || !Idle || !Run)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the skeleton or the idle/run animation is missing. Run import_characters.py first."), *Folder);
			return false;
		}

		const FString Name = FString::Printf(TEXT("BS_%s_Locomotion"), Class.ClassName);
		const FString PackageName = Folder / Name;
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UBlendSpace1D* BlendSpace = NewObject<UBlendSpace1D>(Package, *Name, RF_Public | RF_Standalone);
		BlendSpace->SetSkeleton(Skeleton);

		// 축은 보호된 속성이라 리플렉션으로 정한다(에디터의 세부 정보 패널과 같은 값).
		const FStructProperty* Property = FindFProperty<FStructProperty>(UBlendSpace::StaticClass(), TEXT("BlendParameters"));
		FBlendParameter& Speed = Property->ContainerPtrToValuePtr<FBlendParameter>(BlendSpace)[0];
		Speed.DisplayName = TEXT("Speed");
		Speed.Min = 0.0f;
		Speed.Max = RunSpeed;
		Speed.GridNum = 4;

		BlendSpace->AddSample(Idle, FVector(0.0, 0.0, 0.0));
		BlendSpace->AddSample(Run, FVector(RunSpeed, 0.0, 0.0));
		BlendSpace->ValidateSampleData();
		BlendSpace->ResampleData();

		return Save(Package, BlendSpace, Filename);
	}

	/** 표현 표를 만든다. 블렌드 스페이스를 만든 뒤에 부른다. */
	bool CreateVisuals(TConstArrayView<FClassAnimations> Classes)
	{
		const FString PackageName = FPackageName::ObjectPathToPackageName(FString(UMmoEntityVisuals::Path));
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UMmoEntityVisuals* Visuals = NewObject<UMmoEntityVisuals>(Package, *FPackageName::GetShortName(PackageName), RF_Public | RF_Standalone);
		Visuals->Placeholder = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
		if (!Visuals->Placeholder)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("The engine cylinder is missing."));
			return false;
		}

		for (const FClassAnimations& Class : Classes)
		{
			const FString Folder(Class.Folder);
			const FString Source(Class.SourceName);
			FMmoEntityVisual& Row = Visuals->Rows.AddDefaulted_GetRef();
			Row.Kind = UMmoEntityVisuals::PlayerKind();
			Row.Key = Class.Key;
			Row.Mesh = TSoftObjectPtr<USkeletalMesh>(FSoftObjectPath(FString::Printf(TEXT("%s/%s.%s"), *Folder, *Source, *Source)));
			Row.Locomotion = TSoftObjectPtr<UBlendSpace>(FSoftObjectPath(FString::Printf(TEXT("%s/BS_%s_Locomotion.BS_%s_Locomotion"), *Folder, Class.ClassName, Class.ClassName)));
			if (!Row.Mesh.LoadSynchronous() || !Row.Locomotion.LoadSynchronous())
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the mesh or the blend space is missing."), *Folder);
				return false;
			}
		}
		return Save(Package, Visuals, Filename);
	}
}

UMmoCreateCharacterAssetsCommandlet::UMmoCreateCharacterAssetsCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

int32 UMmoCreateCharacterAssetsCommandlet::Main(const FString& Params)
{
	// 직업 → 폴더와 가져온 원본 이름(Quaternius RPG Characters의 Warrior, Wizard). import_characters.py의 폴더와 같다.
	const FClassAnimations Classes[] = {
		{ TEXT("/Game/Characters/Knight"), TEXT("Knight"), TEXT("Warrior"), UMmoEntityVisuals::KnightKey() },
		{ TEXT("/Game/Characters/Mage"), TEXT("Mage"), TEXT("Wizard"), UMmoEntityVisuals::MageKey() },
	};
	bool bOk = true;
	for (const FClassAnimations& Class : Classes)
	{
		bOk &= CreateLocomotion(Class);
	}
	return bOk && CreateVisuals(Classes) ? 0 : 1;
}
