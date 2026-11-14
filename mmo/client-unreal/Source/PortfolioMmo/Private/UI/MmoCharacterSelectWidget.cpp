#include "UI/MmoCharacterSelectWidget.h"

#include "UI/MmoText.h"
#include "UI/MmoButtonWidget.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Misc/CommandLine.h"
#include "Net/MmoSession.h"
#include "UI/MmoUiManager.h"
#include "Animation/SkeletalMeshActor.h"
#include "Camera/CameraActor.h"
#include "Camera/PlayerCameraManager.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "Game/MmoAnimInstance.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoCueSubsystem.h"
#include "Game/MmoEntityVisuals.h"
#include "GameFramework/PlayerController.h"
#include "Materials/MaterialInstanceDynamic.h"


namespace
{
	FString ClassKey(portfolio::mmo::CharacterClass Class)
	{
		return Class == portfolio::mmo::CHARACTER_CLASS_MAGE ? TEXT("class.mage") : TEXT("class.knight");
	}

}

void UMmoCharacterSelectWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Slot0Button->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleSlot0Clicked);
	Slot1Button->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleSlot1Clicked);
	Slot2Button->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleSlot2Clicked);
	Slot3Button->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleSlot3Clicked);
	StartButton->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleStartClicked);
	CreateButton->OnClicked.AddDynamic(this, &UMmoCharacterSelectWidget::HandleCreateClicked);
	// 닫혀 있는 동안에도 목록이 바뀌면(만들기 화면에서 만듦) 다시 그린다. AddUObject는 이 위젯이 사라지면 저절로 건너뛴다.
	Session().OnPacket.AddUObject(this, &UMmoCharacterSelectWidget::HandlePacket);
	// 언어가 바뀌면 칸의 글(이름과 직업)을 다시 채운다.
	// 화면은 닫혀도 남아 있으므로 보이는 동안만 다시 채운다(닫힌 채 다시 채우면 월드 안에서 미리 보기와 그 카메라가 다시 선다).
	Session().OnLanguageChanged.AddWeakLambda(this, [this]
	{
		if (GetParent() != nullptr)
		{
			Refresh();
		}
	});
}

void UMmoCharacterSelectWidget::NativeConstruct()
{
	Super::NativeConstruct();
	bEntering = false;
	StatusText->SetText(FText::GetEmpty());
	// 처음 열거나 월드에서 돌아오면 첫 캐릭터를 고른다.
	Selected = Session().Characters().characters_size() > 0 ? 0 : INDEX_NONE;
	Refresh();
	EnterFromCommandLine();
}

void UMmoCharacterSelectWidget::EnterFromCommandLine()
{
	static bool bUsedCommandLine = false;
	if (!bUsedCommandLine && Session().Characters().characters_size() > 0 && FParse::Param(FCommandLine::Get(), TEXT("MmoEnter")))
	{
		bUsedCommandLine = true;
		Selected = 0;
		HandleStartClicked();
	}
}

void UMmoCharacterSelectWidget::HandleSlot0Clicked() { Select(0); }
void UMmoCharacterSelectWidget::HandleSlot1Clicked() { Select(1); }
void UMmoCharacterSelectWidget::HandleSlot2Clicked() { Select(2); }
void UMmoCharacterSelectWidget::HandleSlot3Clicked() { Select(3); }

void UMmoCharacterSelectWidget::HandleStartClicked()
{
	if (Selected == INDEX_NONE || Selected >= Session().Characters().characters_size())
	{
		return;
	}
	bEntering = true;
	StatusText->SetText(MmoText::Get(this, TEXT("select.entering")));
	Session().EnterWorld(Session().Characters().characters(Selected).id());
	Refresh();
}

void UMmoCharacterSelectWidget::HandleCreateClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Open(MmoScreen::EScreen::CharacterCreate);
}

void UMmoCharacterSelectWidget::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kCharacterList)
	{
		// 목록이 늘었으면 새로 만든 캐릭터(목록의 끝)를 고르고, 아니면 고른 칸을 목록 안에 둔다.
		const int32 Count = Packet.character_list().characters_size();
		Selected = (Count > ShownCount || Selected >= Count) ? Count - 1 : Selected;
		Refresh();
		EnterFromCommandLine();
	}
	else if (Packet.body_case() == portfolio::mmo::Packet::kEnterWorldResult
		&& Packet.enter_world_result().result() != portfolio::mmo::ENTER_WORLD_RESULT_CODE_OK)
	{
		bEntering = false;
		StatusText->SetText(MmoText::Get(this, TEXT("select.enterFailed")));
		Refresh();
	}
}

void UMmoCharacterSelectWidget::Select(int32 Index)
{
	Selected = Index;
	Refresh();
}

void UMmoCharacterSelectWidget::Refresh()
{
	const portfolio::mmo::CharacterList& List = Session().Characters();
	ShownCount = List.characters_size();
	UMmoButtonWidget* const Buttons[] = { Slot0Button, Slot1Button, Slot2Button, Slot3Button };
	for (int32 Index = 0; Index < UE_ARRAY_COUNT(Buttons); ++Index)
	{
		const bool bFilled = Index < List.characters_size();
		Buttons[Index]->SetIsEnabled(bFilled && !bEntering);
		Buttons[Index]->SetSelected(Index == Selected);
		Buttons[Index]->SetLabel(bFilled
			? MmoText::Format(this, TEXT("select.slot"), { UTF8_TO_TCHAR(List.characters(Index).name().c_str()), MmoText::Get(this, ClassKey(List.characters(Index).character_class())).ToString(),
				FString::FromInt(List.characters(Index).level()) })
			: MmoText::Get(this, TEXT("select.emptySlot")));
	}
	StartButton->SetIsEnabled(Selected != INDEX_NONE && !bEntering);
	const bool bPicked = Selected != INDEX_NONE && Selected < List.characters_size();
	ShowPreview(bPicked ? static_cast<uint32>(List.characters(Selected).character_class()) : 0, bPicked ? List.characters(Selected).weapon_item_id() : 0);
	CreateButton->SetIsEnabled(List.characters_size() < portfolio::mmo::CONSTANT_MAX_CHARACTERS && !bEntering);
}

void UMmoCharacterSelectWidget::NativeDestruct()
{
	ShowPreview(0, 0);
	Super::NativeDestruct();
}

void UMmoCharacterSelectWidget::ShowPreview(uint32 CharacterClass, uint32 WeaponItemId)
{
	if (CharacterClass == PreviewClass && WeaponItemId == PreviewWeaponItemId && (CharacterClass == 0 || Preview.IsValid()))
	{
		return;
	}
	PreviewClass = CharacterClass;
	PreviewWeaponItemId = WeaponItemId;
	if (Preview.IsValid())
	{
		Preview->Destroy();
	}
	Preview.Reset();
	PreviewWeapon = nullptr;
	const UMmoEntityVisuals* Visuals = CharacterClass != 0 ? LoadObject<UMmoEntityVisuals>(nullptr, UMmoEntityVisuals::Path) : nullptr;
	const FMmoEntityVisual* Row = Visuals ? Visuals->Find(UMmoEntityVisuals::PlayerKind(), static_cast<int32>(CharacterClass)) : nullptr;
	APlayerController* Controller = GetOwningPlayer();
	if (!Row || !Controller)
	{
		if (PreviewCamera.IsValid())
		{
			PreviewCamera->Destroy();
		}
		PreviewCamera.Reset();
		return;
	}

	// 필드의 것과 겹치지 않게 높이 200 m에 세우고, 3.5 m 앞의 카메라가 몸의 가운데를 비춘다. 캐릭터는 화면의 왼쪽(가운데의 창에 가리지 않게)이다.
	// 팩의 메시는 +Y를 보므로 카메라(−X 쪽)를 보게 하려면 yaw 90도다.
	const FVector Stage(0.0, 0.0, 20000.0);
	FActorSpawnParameters Spawn;
	Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	if (!PreviewCamera.IsValid())
	{
		PreviewCamera = GetWorld()->SpawnActor<ACameraActor>(Stage + FVector(-350.0, 110.0, 100.0), FRotator(-5.0, 0.0, 0.0), Spawn);
	}
	Controller->SetViewTarget(PreviewCamera.Get());
	ASkeletalMeshActor* Actor = GetWorld()->SpawnActor<ASkeletalMeshActor>(Stage, FRotator(0.0, 90.0, 0.0), Spawn);
	USkeletalMeshComponent* Mesh = Actor->GetSkeletalMeshComponent();
	Mesh->SetMobility(EComponentMobility::Movable);
	Mesh->SetSkeletalMesh(Row->Mesh.LoadSynchronous());
	Mesh->SetAnimationMode(EAnimationMode::AnimationBlueprint);
	Mesh->SetAnimInstanceClass(Row->Animation.LoadSynchronous());
	Mesh->SetWorldScale3D(FVector(180.0 / 272.0));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Preview = Actor;

	UMmoCueSubsystem* Cues = GetWorld()->GetSubsystem<UMmoCueSubsystem>();
	if (!HiddenWeapon && Cues && Cues->HitFlashMaterial())
	{
		HiddenWeapon = UMaterialInstanceDynamic::Create(Cues->HitFlashMaterial(), this);
		HiddenWeapon->SetScalarParameterValue(TEXT("Flash"), 0.0f);
	}
	// 목록의 입은 무기(38)를 든다.
	MmoCharacterLook::ShowWeapon(*Mesh, PreviewWeapon, Session().Data().Item(WeaponItemId), Visuals, HiddenWeapon);
}

UMmoSession& UMmoCharacterSelectWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

