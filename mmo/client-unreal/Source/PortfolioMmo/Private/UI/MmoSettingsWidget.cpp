#include "UI/MmoSettingsWidget.h"

#include "Engine/GameInstance.h"
#include "Game/MmoGameUserSettings.h"
#include "Net/MmoSession.h"

#include "UI/MmoText.h"
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

	// 기기에 남기는 설정(77): 누를 때마다 다음 값으로 돌린다.
	UMmoGameUserSettings& Settings = UMmoGameUserSettings::Get();
	const auto NextVolume = [](float Volume) { return Volume >= 0.99f ? 0.0f : FMath::Min(1.0f, FMath::RoundToFloat(Volume * 4.0f + 1.0f) / 4.0f); };
	EffectVolumeButton->OnClickedNative.AddWeakLambda(this, [this, &Settings, NextVolume] { Settings.EffectVolume = NextVolume(Settings.EffectVolume); Changed(); });
	MusicVolumeButton->OnClickedNative.AddWeakLambda(this, [this, &Settings, NextVolume] { Settings.MusicVolume = NextVolume(Settings.MusicVolume); Changed(); });
	QualityButton->OnClickedNative.AddWeakLambda(this, [this, &Settings] { Settings.Quality = (Settings.QualityLevel() + 1) % 3; Changed(); });
	FrameButton->OnClickedNative.AddWeakLambda(this, [this, &Settings]
	{
		// 제한 없음은 PC만이다.
		const bool bPc = !(PLATFORM_ANDROID || PLATFORM_IOS);
		Settings.FrameCap = Settings.FrameCap == 30 ? 60 : (Settings.FrameCap == 60 && bPc ? 0 : 30);
		Changed();
	});
	LanguageButton->OnClickedNative.AddWeakLambda(this, [this, &Settings]
	{
		Settings.Language = Settings.LanguageCode() == TEXT("ko") ? TEXT("en") : TEXT("ko");
		GetGameInstance()->GetSubsystem<UMmoSession>()->SetLanguage(Settings.Language == TEXT("en") ? MmoData::ELanguage::English : MmoData::ELanguage::Korean);
		Changed();
	});
	ShakeButton->OnClickedNative.AddWeakLambda(this, [this, &Settings] { Settings.bCameraShake = !Settings.bCameraShake; Changed(); });
	QuitButton->OnClicked.AddDynamic(this, &UMmoSettingsWidget::HandleQuitClicked);
	ShowSettingLabels();
}

void UMmoSettingsWidget::Changed()
{
	UMmoGameUserSettings& Settings = UMmoGameUserSettings::Get();
	Settings.ApplyMmo(GetWorld());
	Settings.SaveSettings();
	ShowSettingLabels();
}

void UMmoSettingsWidget::ShowSettingLabels()
{
	const UMmoGameUserSettings& Settings = UMmoGameUserSettings::Get();
	const auto Percent = [](float Volume) { return FString::FromInt(FMath::RoundToInt(Volume * 100.0f)); };
	EffectVolumeButton->SetLabel(MmoText::Format(this, TEXT("settings.effectVolume"), { Percent(Settings.EffectVolume) }));
	MusicVolumeButton->SetLabel(MmoText::Format(this, TEXT("settings.musicVolume"), { Percent(Settings.MusicVolume) }));
	const TCHAR* const Qualities[] = { TEXT("settings.qualityLow"), TEXT("settings.qualityMedium"), TEXT("settings.qualityHigh") };
	QualityButton->SetLabel(MmoText::Format(this, TEXT("settings.quality"), { MmoText::Get(this, Qualities[Settings.QualityLevel()]).ToString() }));
	FrameButton->SetLabel(MmoText::Format(this, TEXT("settings.frameLimit"),
		{ Settings.FrameCap == 0 ? MmoText::Get(this, TEXT("settings.frameUnlimited")).ToString() : FString::FromInt(Settings.FrameCap) }));
	LanguageButton->SetLabel(MmoText::Format(this, TEXT("settings.language"),
		{ MmoText::Get(this, Settings.LanguageCode() == TEXT("ko") ? TEXT("settings.languageKo") : TEXT("settings.languageEn")).ToString() }));
	ShakeButton->SetLabel(MmoText::Get(this, Settings.bCameraShake ? TEXT("settings.shakeOn") : TEXT("settings.shakeOff")));
}

void UMmoSettingsWidget::HandleQuitClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->QuitGame();
}

void UMmoSettingsWidget::ShowStatsLabel()
{
	const bool bShown = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->IsStatsShown();
	StatsButton->SetLabel(MmoText::Get(this, bShown ? TEXT("settings.statsOn") : TEXT("settings.statsOff")));
}

void UMmoSettingsWidget::HandleCharacterSelectClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ConfirmCharacterSelect();
}

void UMmoSettingsWidget::HandleLogOutClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->LogOut();
}

void UMmoSettingsWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Settings);
}
