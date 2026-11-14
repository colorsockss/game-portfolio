#include "UI/MmoCharacterSelectWidget.h"

#include "UI/MmoText.h"
#include "UI/MmoButtonWidget.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Misc/CommandLine.h"
#include "Net/MmoSession.h"
#include "UI/MmoUiManager.h"


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
	Session().OnLanguageChanged.AddUObject(this, &UMmoCharacterSelectWidget::Refresh);
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
			? MmoText::Format(this, TEXT("select.slot"), { UTF8_TO_TCHAR(List.characters(Index).name().c_str()), MmoText::Get(this, ClassKey(List.characters(Index).character_class())).ToString() })
			: MmoText::Get(this, TEXT("select.emptySlot")));
	}
	StartButton->SetIsEnabled(Selected != INDEX_NONE && !bEntering);
	CreateButton->SetIsEnabled(List.characters_size() < portfolio::mmo::CONSTANT_MAX_CHARACTERS && !bEntering);
}

UMmoSession& UMmoCharacterSelectWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

