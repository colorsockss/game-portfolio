#include "UI/MmoSettingsWidget.h"

#include "UI/MmoButtonWidget.h"
#include "Engine/LocalPlayer.h"
#include "UI/MmoUiManager.h"

void UMmoSettingsWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	CharacterSelectButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleCharacterSelectClicked);
	LogOutButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleLogOutClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleCloseClicked);
	StatsButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		UMmoUiManager* Ui = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>();
		Ui->SetStatsShown(!Ui->IsStatsShown());
		ShowStatsLabel();
	});
	ShowStatsLabel();
}

void UMmoSettingsWidget::ShowStatsLabel()
{
	const bool bShown = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->IsStatsShown();
	StatsButton->SetLabel(bShown ? NSLOCTEXT("MmoSettings", "StatsOn", "성능 표시: 켬") : NSLOCTEXT("MmoSettings", "StatsOff", "성능 표시: 끔"));
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
