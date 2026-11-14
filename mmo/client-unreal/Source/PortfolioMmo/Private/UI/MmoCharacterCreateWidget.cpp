#include "UI/MmoCharacterCreateWidget.h"

#include "UI/MmoText.h"
#include "UI/MmoButtonWidget.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoUiManager.h"


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
	NameBox->SetHintText(MmoText::Get(this, TEXT("create.nameHint")));
	NameBox->SetText(FText::GetEmpty());
	StatusText->SetText(FText::GetEmpty());
	CreateButton->SetWaiting(false);
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
	CreateButton->SetWaiting(true);
	StatusText->SetText(MmoText::Get(this, TEXT("create.creating")));
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
	CreateButton->SetWaiting(false);
	switch (Packet.create_character_result().result())
	{
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_OK:
		Close();
		return;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_INVALID_NAME:
		StatusText->SetText(MmoText::Get(this, TEXT("create.invalidName")));
		break;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_NAME_TAKEN:
		StatusText->SetText(MmoText::Get(this, TEXT("create.nameTaken")));
		break;
	case portfolio::mmo::CREATE_CHARACTER_RESULT_CODE_TOO_MANY:
		StatusText->SetText(MmoText::Get(this, TEXT("create.tooMany")));
		break;
	default:
		StatusText->SetText(MmoText::Get(this, TEXT("create.failed")));
		break;
	}
}

void UMmoCharacterCreateWidget::SelectClass(bool bMage)
{
	bMageSelected = bMage;
	KnightButton->SetSelected(!bMage);
	MageButton->SetSelected(bMage);
}

void UMmoCharacterCreateWidget::Close()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::CharacterCreate);
}

UMmoSession& UMmoCharacterCreateWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

