#include "MmoCreateLocomotionCommandlet.h"

#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace1D.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "HAL/FileManager.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateLocomotion, Log, All);

namespace
{
	/** 달리기의 속도(언리얼 단위/초). Constant의 최대 속도 6 m/s다. */
	constexpr float RunSpeed = 600.0f;

	struct FClassAnimations
	{
		const TCHAR* Folder;
		const TCHAR* ClassName;
		const TCHAR* SourceName;
	};

	bool CreateLocomotion(const FClassAnimations& Class)
	{
		const FString Folder(Class.Folder);
		const FString Source(Class.SourceName);
		USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *FString::Printf(TEXT("%s/%s_Skeleton.%s_Skeleton"), *Folder, *Source, *Source));
		UAnimSequence* Idle = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_Idle_Weapon"), *Folder, *Source));
		UAnimSequence* Run = LoadObject<UAnimSequence>(nullptr, *FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_Run_Weapon"), *Folder, *Source));
		if (!Skeleton || !Idle || !Run)
		{
			UE_LOG(LogMmoCreateLocomotion, Error, TEXT("%s: the skeleton or the idle/run animation is missing. Run import_characters.py first."), *Folder);
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

		FAssetRegistryModule::AssetCreated(BlendSpace);
		FSavePackageArgs Args;
		Args.TopLevelFlags = RF_Public | RF_Standalone;
		if (!UPackage::SavePackage(Package, BlendSpace, *Filename, Args))
		{
			UE_LOG(LogMmoCreateLocomotion, Error, TEXT("Could not save %s."), *Filename);
			return false;
		}
		UE_LOG(LogMmoCreateLocomotion, Display, TEXT("Created %s"), *PackageName);
		return true;
	}
}

UMmoCreateLocomotionCommandlet::UMmoCreateLocomotionCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

int32 UMmoCreateLocomotionCommandlet::Main(const FString& Params)
{
	// 직업 → 폴더와 가져온 원본 이름(Quaternius RPG Characters의 Warrior, Wizard). MmoCharacterLook의 경로와 같다.
	const FClassAnimations Classes[] = {
		{ TEXT("/Game/Characters/Knight"), TEXT("Knight"), TEXT("Warrior") },
		{ TEXT("/Game/Characters/Mage"), TEXT("Mage"), TEXT("Wizard") },
	};
	bool bOk = true;
	for (const FClassAnimations& Class : Classes)
	{
		bOk &= CreateLocomotion(Class);
	}
	return bOk ? 0 : 1;
}
