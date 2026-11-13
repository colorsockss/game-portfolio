#include "UI/MmoCharacterSelectWidget.h"

#include "Components/Button.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Misc/CommandLine.h"
#include "Net/MmoSession.h"
#include "UI/MmoUiManager.h"

#define LOCTEXT_NAMESPACE "MmoCharacterSelect"

namespace
{
	FText ClassName(portfolio::mmo::CharacterClass Class)
	{
		return Class == portfolio::mmo::CHARACTER_CLASS_MAGE ? LOCTEXT("Mage", "마법사") : LOCTEXT("Knight", "기사");
	}

	const FLinearColor SelectedColor(1.0f, 0.78f, 0.3f);
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
	StatusText->SetText(LOCTEXT("Entering", "들어가는 중…"));
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
		StatusText->SetText(LOCTEXT("NoSuchCharacter", "그 캐릭터로 들어갈 수 없습니다."));
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
	UButton* const Buttons[] = { Slot0Button, Slot1Button, Slot2Button, Slot3Button };
	UTextBlock* const Texts[] = { Slot0Text, Slot1Text, Slot2Text, Slot3Text };
	for (int32 Index = 0; Index < UE_ARRAY_COUNT(Buttons); ++Index)
	{
		const bool bFilled = Index < List.characters_size();
		Buttons[Index]->SetIsEnabled(bFilled && !bEntering);
		Buttons[Index]->SetBackgroundColor(Index == Selected ? SelectedColor : FLinearColor::White);
		Texts[Index]->SetText(bFilled
			? FText::Format(LOCTEXT("Slot", "{0}  ({1})"), FText::FromString(UTF8_TO_TCHAR(List.characters(Index).name().c_str())), ClassName(List.characters(Index).character_class()))
			: LOCTEXT("EmptySlot", "빈 칸"));
	}
	StartButton->SetIsEnabled(Selected != INDEX_NONE && !bEntering);
	CreateButton->SetIsEnabled(List.characters_size() < portfolio::mmo::CONSTANT_MAX_CHARACTERS && !bEntering);
}

UMmoSession& UMmoCharacterSelectWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

#undef LOCTEXT_NAMESPACE
