#include "UI/MmoCharacterCreateWidget.h"

#include "Components/Button.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoUiManager.h"

#define LOCTEXT_NAMESPACE "MmoCharacterCreate"

namespace
{
	const FLinearColor SelectedColor(1.0f, 0.78f, 0.3f);
}

void UMmoCharacterCreateWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	KnightButton->OnClicked.AddDynamic(this, &UMmoCharacterCreateWidget::HandleKnightClicked);
	MageButton->OnClicked.AddDynamic(this, &UMmoCharacterCreateWidget::HandleMageClicked);
	CreateButton->OnClicked.AddDynamic(this, &UMmoCharacterCreateWidget::HandleCreateClicked);
	CancelButton->OnClicked.AddDynamic(this, &UMmoCharacterCreateWidget::HandleCancelClicked);
	Session().OnPacket.AddUObject(this, &UMmoCharacterCreateWidget::HandlePacket);
}

void UMmoCharacterCreateWidget::NativeConstruct()
{
	Super::NativeConstruct();
	bCreating = false;
	NameBox->SetText(FText::GetEmpty());
	StatusText->SetText(FText::GetEmpty());
	CreateButton->SetIsEnabled(true);
	SelectClass(false);
	NameBox->SetKeyboardFocus();
}

void UMmoCharacterCreateWidget::HandleKnightClicked()
{
	SelectClass(false);
}

void UMmoCharacterCreateWidget::HandleMageClicked()
{
	SelectClass(true);
}

void UMmoCharacterCreateWidget::HandleCreateClicked()
{
	bCreating = true;
	CreateButton->SetIsEnabled(false);
	StatusText->SetText(LOCTEXT("Creating", "만드는 중…"));
	Session().CreateCharacter(
		NameBox->GetText().ToString().TrimStartAndEnd(), bMageSelected ? portfolio::mmo::CHARACTER_CLASS_MAGE : portfolio::mmo::CHARACTER_CLASS_KNIGHT);
}

void UMmoCharacterCreateWidget::HandleCancelClicked()
{
	Close();
}

void UMmoCharacterCreateWidget::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (!bCreating || Packet.body_case() != portfolio::mmo::Packet::kCreateCharacterResult)
	{
		return;
	}
	bCreating = false;
	CreateButton->SetIsEnabled(true);
	switch (Packet.create_character_result().result())
	{
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_OK:
		Close();
		return;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_INVALID_NAME:
		StatusText->SetText(LOCTEXT("InvalidName", "이름은 한글·영문·숫자 2–12자입니다."));
		break;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_NAME_TAKEN:
		StatusText->SetText(LOCTEXT("NameTaken", "이미 있는 이름입니다."));
		break;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_TOO_MANY:
		StatusText->SetText(LOCTEXT("TooMany", "캐릭터를 더 만들 수 없습니다."));
		break;
	default:
		StatusText->SetText(LOCTEXT("CreateFailed", "캐릭터를 만들지 못했습니다."));
		break;
	}
}

void UMmoCharacterCreateWidget::SelectClass(bool bMage)
{
	bMageSelected = bMage;
	KnightButton->SetBackgroundColor(bMage ? FLinearColor::White : SelectedColor);
	MageButton->SetBackgroundColor(bMage ? SelectedColor : FLinearColor::White);
}

void UMmoCharacterCreateWidget::Close()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::CharacterCreate);
}

UMmoSession& UMmoCharacterCreateWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

#undef LOCTEXT_NAMESPACE
