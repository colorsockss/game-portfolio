#include "UI/MmoSettingsWidget.h"

#include "Components/Button.h"
#include "Engine/LocalPlayer.h"
#include "UI/MmoUiManager.h"

void UMmoSettingsWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	CharacterSelectButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleCharacterSelectClicked);
	LogOutButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleLogOutClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleCloseClicked);
}

void UMmoSettingsWidget::HandleCharacterSelectClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ReturnToCharacterSelect();
}

void UMmoSettingsWidget::HandleLogOutClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->LogOut();
}

void UMmoSettingsWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Settings);
}
