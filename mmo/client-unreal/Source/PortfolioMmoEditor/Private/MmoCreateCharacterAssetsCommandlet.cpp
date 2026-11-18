#include "MmoCreateCharacterAssetsCommandlet.h"

#include "AnimGraphNode_BlendSpacePlayer.h"
#include "AnimGraphNode_LayeredBoneBlend.h"
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
#include "Materials/MaterialInterface.h"
#include "Misc/FeedbackContext.h"
#include "Modules/ModuleManager.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoCreateCharacterAssets, Log, All);

namespace
{
	/** 플레이어의 달리기 속도(언리얼 단위/초). Constant의 최대 속도 6 m/s다. */
	constexpr float RunSpeed = 600.0f;

	/**
	 * 모습 하나: 가져온 메시(import_characters.py, import_creatures.py)와 그 동작으로 블렌드 스페이스, 애니메이션 블루프린트, 표현 표의 줄을 만든다.
	 * 동작은 이름 끝(<뼈대>Armature_<동작>)으로 찾는다. 팩마다 뼈대의 이름이 달라서다(CharacterArmature, MonsterArmature, Armature 등).
	 */
	struct FCreature
	{
		/** 에셋 폴더와 이름(BS_<이름>_Locomotion, ABP_<이름>). */
		const TCHAR* Folder;
		const TCHAR* Name;
		/** 가져온 메시의 이름. 스켈레톤은 <원본>_Skeleton이다. */
		const TCHAR* Source;
		/** 표현 표의 종류와 키들(같은 모습을 쓰는 NPC 여럿은 키가 여럿). */
		int32 Kind;
		TArray<int32> Keys;
		/** 원하는 키(m). 바인드 포즈의 높이로 나눠 크기 배수를 정한다. 0이면 Scale을 그대로 쓴다. */
		float Height;
		float Scale;
		/** 이동 동작이 제 빠르기로 도는 속도(언리얼 단위/초. 데이터의 이동 속도). */
		float MoveSpeed;
		const TCHAR* Idle;
		const TCHAR* Move;
		const TCHAR* Attack;
		/** 아래는 없으면 nullptr. 피격 동작이 없는 모델도 있다(슬라임, 해골). */
		const TCHAR* Hit;
		const TCHAR* Death;
		const TCHAR* Skill = nullptr;
		const TCHAR* Cast = nullptr;
		const TCHAR* Gather = nullptr;
	};

	/** 폴더에서 이름이 <뼈대>Armature_<Clip>으로 끝나는 애니메이션. Clip이 nullptr이면 nullptr. */
	UAnimSequence* FindClip(const FCreature& Creature, const TCHAR* Clip)
	{
		if (!Clip)
		{
			return nullptr;
		}
		IAssetRegistry& Registry = FModuleManager::LoadModuleChecked<FAssetRegistryModule>(TEXT("AssetRegistry")).Get();
		Registry.ScanPathsSynchronous({ FString(Creature.Folder) }, true);
		TArray<FAssetData> Found;
		Registry.GetAssetsByPath(FName(Creature.Folder), Found);
		const FString Suffix = FString::Printf(TEXT("Armature_%s"), Clip);
		for (const FAssetData& Asset : Found)
		{
			if (Asset.AssetClassPath == UAnimSequence::StaticClass()->GetClassPathName() && Asset.AssetName.ToString().EndsWith(Suffix))
			{
				return Cast<UAnimSequence>(Asset.GetAsset());
			}
		}
		UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: no animation ends with %s."), Creature.Folder, *Suffix);
		return nullptr;
	}

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

	bool CreateLocomotion(const FCreature& Creature)
	{
		const FString Folder(Creature.Folder);
		const FString Source(Creature.Source);
		USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *FString::Printf(TEXT("%s/%s_Skeleton.%s_Skeleton"), *Folder, *Source, *Source));
		UAnimSequence* Idle = FindClip(Creature, Creature.Idle);
		UAnimSequence* Move = FindClip(Creature, Creature.Move);
		if (!Skeleton || !Idle || !Move)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the skeleton or the idle/move animation is missing. Run import_characters.py and import_creatures.py first."), *Folder);
			return false;
		}

		const FString Name = FString::Printf(TEXT("BS_%s_Locomotion"), Creature.Name);
		const FString PackageName = Folder / Name;
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UBlendSpace1D* BlendSpace = NewObject<UBlendSpace1D>(Package, *Name, RF_Public | RF_Standalone);
		BlendSpace->SetSkeleton(Skeleton);

		// 축은 보호된 속성이라 리플렉션으로 정한다(에디터의 세부 정보 패널과 같은 값). 이동 동작은 제 속도에 두고, 그보다 빠르면 그 동작 그대로다.
		const FStructProperty* Property = FindFProperty<FStructProperty>(UBlendSpace::StaticClass(), TEXT("BlendParameters"));
		FBlendParameter& Speed = Property->ContainerPtrToValuePtr<FBlendParameter>(BlendSpace)[0];
		Speed.DisplayName = TEXT("Speed");
		Speed.Min = 0.0f;
		Speed.Max = FMath::Max(RunSpeed, Creature.MoveSpeed);
		Speed.GridNum = 4;

		BlendSpace->AddSample(Idle, FVector(0.0, 0.0, 0.0));
		BlendSpace->AddSample(Move, FVector(Creature.MoveSpeed, 0.0, 0.0));
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
	 * 애니메이션 블루프린트 ABP_<이름>(부모 UMmoAnimInstance)를 만든다. 이동 블렌드 스페이스(축 = 인스턴스의 Speed)를 둘 두어,
	 * 하나는 그대로 하체가 되고 다른 하나는 상체 슬롯(UpperBody)을 지나 뼈마다 섞기(Abdomen부터 위)의 상체가 된 뒤, 온몸 슬롯(DefaultSlot) → 출력이다.
	 * 공격·스킬·피격 동작은 UMmoAnimInstance::PlayAction이 상체 슬롯에, 죽음은 온몸 슬롯에 넣는다(걷는 중에 쳐도 다리는 걷는 동작을 이어 감).
	 * 뼈대에 Abdomen이 없으면(몬스터, 동물) 섞지 않고 이동 → 상체 슬롯 → 온몸 슬롯 → 출력이라, 동작이 온몸에 든다.
	 * 상체 슬롯은 뼈대의 슬롯 그룹에 등록하고 뼈대를 저장한다. 블렌드 스페이스를 만든 뒤에 부른다.
	 */
	bool CreateAnimBlueprint(const FCreature& Creature)
	{
		const FString Folder(Creature.Folder);
		const FString Source(Creature.Source);
		USkeleton* Skeleton = LoadObject<USkeleton>(nullptr, *FString::Printf(TEXT("%s/%s_Skeleton.%s_Skeleton"), *Folder, *Source, *Source));
		UBlendSpace* Locomotion = LoadObject<UBlendSpace>(nullptr, *FString::Printf(TEXT("%s/BS_%s_Locomotion.BS_%s_Locomotion"), *Folder, Creature.Name, Creature.Name));
		if (!Skeleton || !Locomotion)
		{
			UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the skeleton or the blend space is missing."), *Folder);
			return false;
		}

		// 애니메이션 블루프린트의 컴파일은 속성 접근 편집기(플러그인 PropertyAccessEditor, .uproject에서 켬)를 쓰는데, 커맨드렛에서는
		// 그 모듈이 아직 로드되지 않았으므로 먼저 로드한다.
		FModuleManager::Get().LoadModuleChecked(TEXT("PropertyAccessEditor"));
		FModuleManager::Get().LoadModuleChecked(TEXT("AnimGraph"));

		const FString Name = FString::Printf(TEXT("ABP_%s"), Creature.Name);
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

		// 동작을 상체에만 넣는 슬롯은 뼈대의 슬롯 그룹에 있어야 몽타주가 그 슬롯을 찾는다.
		Skeleton->RegisterSlotNode(UMmoAnimInstance::UpperSlotName);
		if (!Save(Skeleton->GetPackage(), Skeleton, FPackageName::LongPackageNameToFilename(Skeleton->GetPackage()->GetName(), FPackageName::GetAssetPackageExtension())))
		{
			return false;
		}

		const UEdGraphSchema* Schema = Graph->GetSchema();
		// 이동 블렌드 스페이스(속도로 섞음). 포즈 핀은 하나에만 이을 수 있어 하체와 상체에 하나씩 둔다.
		auto Locomotion2 = [&](int32 PosY) -> UEdGraphPin*
		{
			FGraphNodeCreator<UAnimGraphNode_BlendSpacePlayer> PlayerCreator(*Graph);
			UAnimGraphNode_BlendSpacePlayer* Player = PlayerCreator.CreateNode();
			Player->Node.SetBlendSpace(Locomotion);
			Player->NodePosX = -900;
			Player->NodePosY = PosY;
			PlayerCreator.Finalize();
			FGraphNodeCreator<UK2Node_VariableGet> SpeedCreator(*Graph);
			UK2Node_VariableGet* Speed = SpeedCreator.CreateNode();
			Speed->VariableReference.SetSelfMember(GET_MEMBER_NAME_CHECKED(UMmoAnimInstance, Speed));
			Speed->NodePosX = -1200;
			Speed->NodePosY = PosY;
			SpeedCreator.Finalize();
			UEdGraphPin* X = PinOf(*Player, TEXT("X"), EGPD_Input);
			UEdGraphPin* Out = PinOf(*Player, TEXT("Pose"), EGPD_Output);
			return X && Out && Schema->TryCreateConnection(Speed->GetValuePin(), X) ? Out : nullptr;
		};
		auto MakeSlot = [&](FName SlotName, int32 PosX, int32 PosY)
		{
			FGraphNodeCreator<UAnimGraphNode_Slot> SlotCreator(*Graph);
			UAnimGraphNode_Slot* Slot = SlotCreator.CreateNode();
			Slot->Node.SlotName = SlotName;
			Slot->NodePosX = PosX;
			Slot->NodePosY = PosY;
			SlotCreator.Finalize();
			return Slot;
		};

		UAnimGraphNode_Slot* Full = MakeSlot(UMmoAnimInstance::SlotName, 0, 0);
		UEdGraphPin* Result = PinOf(*Root, TEXT("Result"), EGPD_Input);
		UEdGraphPin* FullIn = PinOf(*Full, TEXT("Source"), EGPD_Input);
		UEdGraphPin* FullOut = PinOf(*Full, TEXT("Pose"), EGPD_Output);
		if (Skeleton->GetReferenceSkeleton().FindBoneIndex(UMmoAnimInstance::UpperBodyBone) == INDEX_NONE)
		{
			// 상체가 따로 없는 뼈대: 이동 → 상체 슬롯 → 온몸 슬롯 → 출력.
			UEdGraphPin* Moving = Locomotion2(0);
			UAnimGraphNode_Slot* Action = MakeSlot(UMmoAnimInstance::UpperSlotName, -300, 0);
			UEdGraphPin* ActionIn = PinOf(*Action, TEXT("Source"), EGPD_Input);
			UEdGraphPin* ActionOut = PinOf(*Action, TEXT("Pose"), EGPD_Output);
			if (!Moving || !Result || !FullIn || !FullOut || !ActionIn || !ActionOut || !Schema->TryCreateConnection(Moving, ActionIn)
				|| !Schema->TryCreateConnection(ActionOut, FullIn) || !Schema->TryCreateConnection(FullOut, Result))
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("Could not wire the anim graph of %s."), *PackageName);
				return false;
			}
		}
		else
		{
			UEdGraphPin* Lower = Locomotion2(0);
			UEdGraphPin* UpperSource = Locomotion2(300);
			UAnimGraphNode_Slot* Upper = MakeSlot(UMmoAnimInstance::UpperSlotName, -600, 300);

			FGraphNodeCreator<UAnimGraphNode_LayeredBoneBlend> BlendCreator(*Graph);
			UAnimGraphNode_LayeredBoneBlend* Blend = BlendCreator.CreateNode();
			Blend->Node.LayerSetup[0].BranchFilters.Add({ UMmoAnimInstance::UpperBodyBone, 0 });
			// 상체의 회전을 메시 공간에서 섞어, 하체가 돌아도 상체 동작이 같은 쪽을 본다.
			Blend->Node.bMeshSpaceRotationBlend = true;
			Blend->NodePosX = -300;
			BlendCreator.Finalize();

			UEdGraphPin* UpperIn = PinOf(*Upper, TEXT("Source"), EGPD_Input);
			UEdGraphPin* UpperOut = PinOf(*Upper, TEXT("Pose"), EGPD_Output);
			UEdGraphPin* Base = PinOf(*Blend, TEXT("BasePose"), EGPD_Input);
			UEdGraphPin* Layer = PinOf(*Blend, TEXT("BlendPoses_0"), EGPD_Input);
			UEdGraphPin* BlendOut = PinOf(*Blend, TEXT("Pose"), EGPD_Output);
			if (!Lower || !UpperSource || !Result || !UpperIn || !UpperOut || !Base || !Layer || !BlendOut || !FullIn || !FullOut
				|| !Schema->TryCreateConnection(Lower, Base) || !Schema->TryCreateConnection(UpperSource, UpperIn) || !Schema->TryCreateConnection(UpperOut, Layer)
				|| !Schema->TryCreateConnection(BlendOut, FullIn) || !Schema->TryCreateConnection(FullOut, Result))
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("Could not wire the anim graph of %s."), *PackageName);
				return false;
			}
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
	bool CreateVisuals(TConstArrayView<FCreature> Creatures)
	{
		const FString PackageName = FPackageName::ObjectPathToPackageName(FString(UMmoEntityVisuals::Path));
		const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
		IFileManager::Get().Delete(*Filename, false, true, true);
		UPackage* Package = CreatePackage(*PackageName);
		UMmoEntityVisuals* Visuals = NewObject<UMmoEntityVisuals>(Package, *FPackageName::GetShortName(PackageName), RF_Public | RF_Standalone);
		// 종류마다의 자리 표시(73): 서는 개체는 원기둥, 채집물은 원뿔, 바닥 아이템은 상자, 소환수(95)는 구이고 색으로 종류를 가른다.
		// 머티리얼은 나타나고 사라질 수 있는 개체용(59. create_entity_materials.py)이다. 맵의 자리 표시는 불투명한 M_Placeholder다.
		Visuals->PlaceholderMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_EntityPlaceholder.M_EntityPlaceholder"));
		const FVector Standing(0.6, 0.6, 1.8);
		const struct { int32 Kind; const TCHAR* Shape; FLinearColor Color; FVector Scale; } Placeholders[] = {
			{ UMmoEntityVisuals::PlayerKind(), TEXT("Cylinder"), FLinearColor(0.25f, 0.5f, 1.0f), Standing },
			{ UMmoEntityVisuals::MonsterKind(), TEXT("Cylinder"), FLinearColor(0.9f, 0.25f, 0.2f), Standing },
			{ UMmoEntityVisuals::NpcKind(), TEXT("Cylinder"), FLinearColor(0.3f, 0.8f, 0.35f), Standing },
			{ UMmoEntityVisuals::GatherNodeKind(), TEXT("Cone"), FLinearColor(0.6f, 0.45f, 0.25f), FVector(1.0, 1.0, 1.2) },
			{ UMmoEntityVisuals::GroundItemKind(), TEXT("Cube"), FLinearColor(1.0f, 0.85f, 0.2f), FVector(0.35, 0.35, 0.35) },
			{ UMmoEntityVisuals::SummonKind(), TEXT("Sphere"), FLinearColor(0.65f, 0.35f, 0.95f), FVector(0.8, 0.8, 0.8) },
		};
		for (const auto& Placeholder : Placeholders)
		{
			UStaticMesh* Shape = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Placeholder.Shape, Placeholder.Shape));
			if (!Shape || !Visuals->PlaceholderMaterial)
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("The engine shape %s or /Game/Materials/M_EntityPlaceholder (create_entity_materials.py) is missing."), Placeholder.Shape);
				return false;
			}
			Visuals->Placeholders.Add({ Placeholder.Kind, Shape, Placeholder.Color, Placeholder.Scale });
		}
		// 무기(34): 종 → 메시의 줄을 Weapons에 더하면 그 메시를 손에 붙인다. 지금은 줄이 없어 캐릭터 팩에 구워진 검과 지팡이를 쓴다(91).

		for (const FCreature& Creature : Creatures)
		{
			const FString Folder(Creature.Folder);
			const FString Source(Creature.Source);
			USkeletalMesh* Mesh = LoadObject<USkeletalMesh>(nullptr, *FString::Printf(TEXT("%s/%s.%s"), *Folder, *Source, *Source));
			UClass* Animation = LoadObject<UClass>(nullptr, *FString::Printf(TEXT("%s/ABP_%s.ABP_%s_C"), *Folder, Creature.Name, Creature.Name));
			UAnimSequence* Attack = FindClip(Creature, Creature.Attack);
			UAnimSequence* Death = FindClip(Creature, Creature.Death);
			if (!Mesh || !Animation || !Attack || !Death || (Creature.Hit && !FindClip(Creature, Creature.Hit)) || (Creature.Skill && !FindClip(Creature, Creature.Skill))
				|| (Creature.Cast && !FindClip(Creature, Creature.Cast)) || (Creature.Gather && !FindClip(Creature, Creature.Gather)))
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("%s: the mesh, the anim blueprint or an animation is missing."), *Folder);
				return false;
			}
			// 바인드 포즈의 높이(가져온 단위)로 원하는 키를 나눠 크기 배수를 정한다. 팩마다 단위와 키가 다르다.
			const double BindHeight = Mesh->GetImportedBounds().BoxExtent.Z * 2.0;
			const float Scale = Creature.Height > 0.0f ? static_cast<float>(Creature.Height * 100.0 / BindHeight) : Creature.Scale;
			UE_LOG(LogMmoCreateCharacterAssets, Display, TEXT("%s: bind pose %.1f units tall, bottom %.1f, scale %.3f"), Creature.Name, BindHeight,
				Mesh->GetImportedBounds().Origin.Z - Mesh->GetImportedBounds().BoxExtent.Z, Scale);
			const auto Soft = [](UAnimSequence* Sequence) { return TSoftObjectPtr<UAnimSequence>(Sequence); };
			for (const int32 Key : Creature.Keys)
			{
				FMmoEntityVisual& Row = Visuals->Rows.AddDefaulted_GetRef();
				Row.Kind = Creature.Kind;
				Row.Key = Key;
				Row.Mesh = Mesh;
				Row.Animation = TSoftClassPtr<UMmoAnimInstance>(FSoftObjectPath(Animation));
				Row.Attack = Soft(Attack);
				Row.Hit = Soft(FindClip(Creature, Creature.Hit));
				Row.Death = Soft(Death);
				Row.Skill = Soft(FindClip(Creature, Creature.Skill));
				Row.Cast = Soft(FindClip(Creature, Creature.Cast));
				Row.Gather = Soft(FindClip(Creature, Creature.Gather));
				Row.Scale = Scale;
			}
		}
		// 움직이지 않는 개체(91): 채집물의 키는 GatherNodes의 id, 바닥 아이템은 아이템마다가 아니라 기본 줄(키 0) 하나다.
		// 메시는 Scripts/import_props.py가 크기와 원점을 맞춰 /Game/Props/에 가져온 것이다.
		const struct { int32 Kind; int32 Key; const TCHAR* Name; } Props[] = {
			{ UMmoEntityVisuals::GatherNodeKind(), 1, TEXT("gather_pine") },
			{ UMmoEntityVisuals::GatherNodeKind(), 2, TEXT("gather_copper") },
			{ UMmoEntityVisuals::GatherNodeKind(), 3, TEXT("gather_mugwort") },
			{ UMmoEntityVisuals::GatherNodeKind(), 4, TEXT("gather_oak") },
			{ UMmoEntityVisuals::GatherNodeKind(), 5, TEXT("gather_iron") },
			{ UMmoEntityVisuals::GatherNodeKind(), 6, TEXT("gather_ginseng") },
			{ UMmoEntityVisuals::GroundItemKind(), 0, TEXT("ground_item") },
		};
		for (const auto& Prop : Props)
		{
			UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/Props/%s.%s"), Prop.Name, Prop.Name));
			if (!Mesh)
			{
				UE_LOG(LogMmoCreateCharacterAssets, Error, TEXT("/Game/Props/%s is missing. Run Scripts/import_props.py first."), Prop.Name);
				return false;
			}
			FMmoEntityVisual& Row = Visuals->Rows.AddDefaulted_GetRef();
			Row.Kind = Prop.Kind;
			Row.Key = Prop.Key;
			Row.Prop = Mesh;
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
	const int32 Player = UMmoEntityVisuals::PlayerKind();
	const int32 Monster = UMmoEntityVisuals::MonsterKind();
	// 몬스터의 키는 Monsters의 id, NPC는 Npcs의 id(경비병 넷이 3–6), 소환수는 몬스터 템플릿의 id다. 이동 속도는 데이터의 speed(m/s)다.
	// 플레이어는 import_characters.py가, 나머지는 import_creatures.py가 가져온 폴더다(원본은 docs/art.md). 기사는 Tripo의 모델(투구까지 키 1)에
	// UAL의 동작을 옮긴 것이라 1.8배이고(export_tripo_characters.py) 피격 동작이 있다. 마법사(System G6)는 바인드 포즈의 발바닥부터 머리 끝까지
	// 421 단위를 1.8 m로 줄인 값이다(98. 모자가 머리 위로 나와 높이로 정하지 않음). 피격 동작은 그 팩에 없다.
	const auto People = [](const TCHAR* Name, const TCHAR* Source, TArray<int32> Keys, float MoveSpeed, const TCHAR* Attack = TEXT("Punch"))
	{
		return FCreature{ nullptr, Name, Source, UMmoEntityVisuals::NpcKind(), MoveTemp(Keys), 1.8f, 1.0f, MoveSpeed, TEXT("Idle"), TEXT("Walk"), Attack, TEXT("RecieveHit"), TEXT("Defeat") };
	};
	TArray<FCreature> Creatures = {
		{ TEXT("/Game/Characters/Knight"), TEXT("Knight"), TEXT("knight"), Player, { UMmoEntityVisuals::KnightKey() }, 0.0f, 1.8f, RunSpeed,
			TEXT("Idle"), TEXT("Run"), TEXT("Attack"), TEXT("Hit"), TEXT("Death"), TEXT("Skill"), nullptr, TEXT("Gather") },
		{ TEXT("/Game/Characters/Mage"), TEXT("Mage"), TEXT("mage"), Player, { UMmoEntityVisuals::MageKey() }, 0.0f, 180.0f / 421.0f, RunSpeed,
			TEXT("Idle"), TEXT("Run"), TEXT("Attack"), nullptr, TEXT("Death"), TEXT("Skill"), TEXT("Cast"), TEXT("Gather") },
		{ nullptr, TEXT("Slime"), TEXT("Slime"), Monster, { 1 }, 0.7f, 1.0f, 250.0f, TEXT("Slime_Idle"), TEXT("Slime_Walk"), TEXT("Slime_Attack"), nullptr, TEXT("Slime_Death") },
		{ nullptr, TEXT("Mushroom"), TEXT("Mushnub"), Monster, { 2 }, 1.0f, 1.0f, 250.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_Front"), TEXT("HitRecieve"), TEXT("Death") },
		{ nullptr, TEXT("Boar"), TEXT("Bull"), Monster, { 3 }, 1.1f, 1.0f, 350.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Attack_Headbutt"), TEXT("Idle_HitReact_Left"), TEXT("Death") },
		{ nullptr, TEXT("Goblin"), TEXT("Goblin_Male"), Monster, { 4 }, 1.3f, 1.0f, 300.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Punch"), TEXT("RecieveHit"), TEXT("Defeat") },
		{ nullptr, TEXT("Wolf"), TEXT("Wolf"), Monster, { 5 }, 1.1f, 1.0f, 400.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Attack"), TEXT("Idle_HitReact_Left"), TEXT("Death") },
		{ nullptr, TEXT("GoblinArcher"), TEXT("Goblin_Female"), Monster, { 6 }, 1.3f, 1.0f, 300.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Shoot_OneHanded"), TEXT("RecieveHit"), TEXT("Defeat") },
		{ nullptr, TEXT("Orc"), TEXT("Orc"), Monster, { 7 }, 2.0f, 1.0f, 300.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Punch"), TEXT("HitReact"), TEXT("Death") },
		{ nullptr, TEXT("Skeleton"), TEXT("Skeleton"), Monster, { 8 }, 1.8f, 1.0f, 350.0f, TEXT("Skeleton_Idle"), TEXT("Skeleton_Running"), TEXT("Skeleton_Attack"), nullptr, TEXT("Skeleton_Death") },
		{ nullptr, TEXT("Troll"), TEXT("Cyclops"), Monster, { 9 }, 2.6f, 1.0f, 300.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_InPlace"), TEXT("HitRecieve"), TEXT("Death") },
		{ nullptr, TEXT("StoneGiant"), TEXT("Yeti"), Monster, { 10 }, 4.5f, 1.0f, 300.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_InPlace"), TEXT("HitRecieve"), TEXT("Death") },
		{ nullptr, TEXT("Spirit"), TEXT("Ghost"), UMmoEntityVisuals::SummonKind(), { 12 }, 1.4f, 1.0f, 700.0f, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_InPlace"), TEXT("HitRecieve"), TEXT("Death") },
		// 펫(96)은 주인의 달리기 속도로 따라간다. 부엉이가 CC0로 없어 둥근 새(Birb)다.
		{ nullptr, TEXT("Cat"), TEXT("Cat"), UMmoEntityVisuals::PetKind(), { 1 }, 0.5f, 1.0f, RunSpeed, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_Front"), TEXT("HitRecieve"), TEXT("Death") },
		{ nullptr, TEXT("Owl"), TEXT("Birb"), UMmoEntityVisuals::PetKind(), { 2 }, 0.45f, 1.0f, RunSpeed, TEXT("Idle"), TEXT("Walk"), TEXT("Bite_Front"), TEXT("HitRecieve"), TEXT("Death") },
		People(TEXT("Merchant"), TEXT("OldClassy_Male"), { 1 }, 300.0f),
		People(TEXT("Keeper"), TEXT("Worker_Male"), { 2 }, 300.0f),
		People(TEXT("Guard"), TEXT("Knight_Male"), { 3, 4, 5, 6 }, 550.0f),
		People(TEXT("Crafter"), TEXT("Viking_Male"), { 7 }, 300.0f),
		People(TEXT("QuestGiver"), TEXT("Wizard"), { 8 }, 300.0f),
	};
	// 플레이어 말고는 /Game/Creatures/<이름>이다(import_creatures.py와 같은 폴더).
	TArray<FString> Folders;
	Folders.Reserve(Creatures.Num());
	for (FCreature& Creature : Creatures)
	{
		if (!Creature.Folder)
		{
			Creature.Folder = *Folders.Add_GetRef(FString::Printf(TEXT("/Game/Creatures/%s"), Creature.Name));
		}
	}
	bool bOk = true;
	for (const FCreature& Creature : Creatures)
	{
		bOk &= CreateLocomotion(Creature) && CreateAnimBlueprint(Creature);
	}
	return bOk && CreateVisuals(Creatures) ? 0 : 1;
}
