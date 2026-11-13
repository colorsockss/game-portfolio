#include "MmoCreateCharacterAssetsCommandlet.h"

#include "AnimGraphNode_BlendSpacePlayer.h"
#include "AnimGraphNode_Root.h"
#include "AnimGraphNode_Slot.h"
#include "Animation/AnimBlueprint.h"
#include "Animation/AnimSequence.h"
#include "Animation/BlendSpace1D.h"
#include "AssetRegistry/AssetRegistryModule.h"
#include "EdGraphSchema_K2.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Factories/AnimBlueprintFactory.h"
#include "Game/MmoAnimInstance.h"
#include "Game/MmoEntityVisuals.h"
#include "HAL/FileManager.h"
#include "K2Node_VariableGet.h"
#include "Kismet2/KismetEditorUtilities.h"
#include "Misc/FeedbackContext.h"
#include "Modules/ModuleManager.h"
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
		/** 공격 동작(가져온 팩의 애니메이션 이름 끝). */
		const TCHAR* Attack;
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

	/** 그래프의 핀. 없으면 로그를 남기고 nullptr. */
	UEdGraphPin* PinOf(UEdGraphNode& Node, const TCHAR* Name, EEdGraphPinDirection Direction)
	{
		UEdGraphPin* Pin = Node.FindPin(FName(Name), Direction);
		if (!Pin)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s has no %s pin %s."), *Node.GetName(), Direction == EGPD_Input ? TEXT("input") : TEXT("output"), Name);
		}
		return Pin;
	}

	/**
	 * 애니메이션 블루프린트 ABP_<직업>(부모 UMmoAnimInstance)를 만든다: 이동 블렌드 스페이스(축 = 인스턴스의 Speed) → 슬롯(DefaultSlot) → 출력.
	 * 공격·피격 동작은 UMmoAnimInstance::PlayAction이 슬롯에 넣는다. 블렌드 스페이스를 만든 뒤에 부른다.
	 */
	bool CreateAnimBlueprint(const FClassAnimations& Class)
	{
		const FString Folder(Class.Folder);
		const FString Source(Class.SourceName);
		USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *FString::Printf(TEXT("%s/%s_Skeleton.%s_Skeleton"), *Folder, *Source, *Source));
		UBlendSpace* Locomotion = LoadObject<UBlendSpace>(nullptr, *FString::Printf(TEXT("%s/BS_%s_Locomotion.BS_%s_Locomotion"), *Folder, Class.ClassName, Class.ClassName));
		if (!Skeleton || !Locomotion)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the skeleton or the blend space is missing."), *Folder);
			return false;
		}

		// 애니메이션 블루프린트의 컴파일은 속성 접근 편집기(플러그인 PropertyAccessEditor, .uproject에서 켬)를 쓰는데, 커맨드렛에서는
		// 그 모듈이 아직 로드되지 않았으므로 먼저 로드한다.
		FModuleManager::Get().LoadModuleChecked(TEXT("PropertyAccessEditor"));
		FModuleManager::Get().LoadModuleChecked(TEXT("AnimGraph"));

		const FString Name = FString::Printf(TEXT("ABP_%s"), Class.ClassName);
		const FString PackageName = Folder / Name;
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UAnimBlueprintFactory* Factory = NewObject<UAnimBlueprintFactory>();
		Factory->ParentClass = UMmoAnimInstance::StaticClass();
		Factory->TargetSkeleton = Skeleton;
		Factory->BlueprintType = BPTYPE_Normal;
		UAnimBlueprint* Blueprint = Cast<UAnimBlueprint>(Factory->FactoryCreateNew(UAnimBlueprint::StaticClass(), Package, *Name, RF_Public | RF_Standalone, nullptr, GWarn));
		UEdGraph* Graph = nullptr;
		for (UEdGraph* Candidate : Blueprint ? Blueprint->FunctionGraphs : TArray<TObjectPtr<UEdGraph>>())
		{
			Graph = Candidate->GetFName() == UEdGraphSchema_K2::GN_AnimGraph ? Candidate : Graph;
		}
		UAnimGraphNode_Root* Root = nullptr;
		for (UEdGraphNode* Node : Graph ? Graph->Nodes : TArray<TObjectPtr<UEdGraphNode>>())
		{
			Root = Root ? Root : Cast<UAnimGraphNode_Root>(Node);
		}
		if (!Root)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("Could not create %s with an anim graph."), *PackageName);
			return false;
		}

		FGraphNodeCreator<UAnimGraphNode_BlendSpacePlayer> PlayerCreator(*Graph);
		UAnimGraphNode_BlendSpacePlayer* Player = PlayerCreator.CreateNode();
		Player->Node.SetBlendSpace(Locomotion);
		Player->NodePosX = -600;
		PlayerCreator.Finalize();

		FGraphNodeCreator<UK2Node_VariableGet> SpeedCreator(*Graph);
		UK2Node_VariableGet* Speed = SpeedCreator.CreateNode();
		Speed->VariableReference.SetSelfMember(GET_MEMBER_NAME_CHECKED(UMmoAnimInstance, Speed));
		Speed->NodePosX = -900;
		SpeedCreator.Finalize();

		FGraphNodeCreator<UAnimGraphNode_Slot> SlotCreator(*Graph);
		UAnimGraphNode_Slot* Slot = SlotCreator.CreateNode();
		Slot->Node.SlotName = UMmoAnimInstance::SlotName;
		Slot->NodePosX = -300;
		SlotCreator.Finalize();

		const UEdGraphSchema* Schema = Graph->GetSchema();
		UEdGraphPin* SpeedOut = Speed->GetValuePin();
		UEdGraphPin* X = PinOf(*Player, TEXT("X"), EGPD_Input);
		UEdGraphPin* PlayerOut = PinOf(*Player, TEXT("Pose"), EGPD_Output);
		UEdGraphPin* SlotIn = PinOf(*Slot, TEXT("Source"), EGPD_Input);
		UEdGraphPin* SlotOut = PinOf(*Slot, TEXT("Pose"), EGPD_Output);
		UEdGraphPin* Result = PinOf(*Root, TEXT("Result"), EGPD_Input);
		if (!SpeedOut || !X || !PlayerOut || !SlotIn || !SlotOut || !Result || !Schema->TryCreateConnection(SpeedOut, X)
			|| !Schema->TryCreateConnection(PlayerOut, SlotIn) || !Schema->TryCreateConnection(SlotOut, Result))
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("Could not wire the anim graph of %s."), *PackageName);
			return false;
		}

		FKismetEditorUtilities::CompileBlueprint(Blueprint);
		if (Blueprint->Status == BS_Error)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s did not compile."), *PackageName);
			return false;
		}
		return Save(Package, Blueprint, Filename);
	}

	/** 표현 표를 만든다. 블렌드 스페이스와 애니메이션 블루프린트를 만든 뒤에 부른다. */
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
			Row.Animation = TSoftClassPtr<UMmoAnimInstance>(FSoftObjectPath(FString::Printf(TEXT("%s/ABP_%s.ABP_%s_C"), *Folder, Class.ClassName, Class.ClassName)));
			Row.Attack = TSoftObjectPtr<UAnimSequence>(FSoftObjectPath(FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_%s.%s_Anim_CharacterArmature_%s"), *Folder, *Source, Class.Attack, *Source, Class.Attack)));
			Row.Hit = TSoftObjectPtr<UAnimSequence>(FSoftObjectPath(FString::Printf(TEXT("%s/%s_Anim_CharacterArmature_RecieveHit.%s_Anim_CharacterArmature_RecieveHit"), *Folder, *Source, *Source)));
			if (!Row.Mesh.LoadSynchronous() || !Row.Animation.LoadSynchronous() || !Row.Attack.LoadSynchronous() || !Row.Hit.LoadSynchronous())
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the mesh, the anim blueprint or the attack/hit animation is missing."), *Folder);
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
		{ TEXT("/Game/Characters/Knight"), TEXT("Knight"), TEXT("Warrior"), UMmoEntityVisuals::KnightKey(), TEXT("Sword_Attack") },
		{ TEXT("/Game/Characters/Mage"), TEXT("Mage"), TEXT("Wizard"), UMmoEntityVisuals::MageKey(), TEXT("Staff_Attack") },
	};
	bool bOk = true;
	for (const FClassAnimations& Class : Classes)
	{
		bOk &= CreateLocomotion(Class) && CreateAnimBlueprint(Class);
	}
	return bOk && CreateVisuals(Classes) ? 0 : 1;
}
