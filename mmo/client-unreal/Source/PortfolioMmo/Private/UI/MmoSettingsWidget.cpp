#include "UI/MmoSettingsWidget.h"

#include "Components/Button.h"
#include "Engine/LocalPlayer.h"
#include "UI/MmoUiManager.h"

void UMmoSettingsWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	LogOutButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleLogOutClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleCloseClicked);
}

void UMmoSettingsWidget::HandleLogOutClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->LogOut();
}

void UMmoSettingsWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Settings);
}
