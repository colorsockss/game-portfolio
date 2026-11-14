#include "Game/MmoGameUserSettings.h"

#include "Engine/Engine.h"
#include "Engine/World.h"
#include "Game/MmoCueSubsystem.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformMisc.h"

const UMmoGameUserSettings::FLevel UMmoGameUserSettings::Levels[3] = {
	{ 70.0f, 0, 20, 50 },
	{ 85.0f, 1, 40, 100 },
	{ 100.0f, 2, 80, 200 },
};

UMmoGameUserSettings& UMmoGameUserSettings::Get()
{
	return *CastChecked<UMmoGameUserSettings>(GEngine->GetGameUserSettings());
}

int32 UMmoGameUserSettings::QualityLevel() const
{
	if (Quality >= 0 && Quality < UE_ARRAY_COUNT(Levels))
	{
		return Quality;
	}
	return PLATFORM_ANDROID ? 0 : 2;
}

FString UMmoGameUserSettings::LanguageCode() const
{
	if (Language == TEXT("ko") || Language == TEXT("en"))
	{
		return Language;
	}
	// 엔진의 문화가 아니라 기기(OS)의 언어를 본다(예: "ko-KR").
	return FPlatformMisc::GetDefaultLanguage().StartsWith(TEXT("ko")) ? TEXT("ko") : TEXT("en");
}

void UMmoGameUserSettings::ApplyMmo(UWorld* World)
{
	const FLevel& Level = Levels[QualityLevel()];
	// 제한 없음은 PC만이다. 모바일에서 0이 남아 있으면 60으로 둔다.
	SetFrameRateLimit(FrameCap == 0 && (PLATFORM_ANDROID || PLATFORM_IOS) ? 60.0f : static_cast<float>(FrameCap));
	ApplyNonResolutionSettings();
	const auto Set = [](const TCHAR* Name, float Value)
	{
		if (IConsoleVariable* Variable = IConsoleManager::Get().FindConsoleVariable(Name))
		{
			Variable->Set(Value, ECVF_SetByGameSetting);
		}
	};
	Set(TEXT("r.ScreenPercentage"), Level.ScreenPercentage);
	Set(TEXT("r.ShadowQuality"), Level.Shadows == 0 ? 0.0f : Level.Shadows == 1 ? 1.0f : 3.0f);
	Set(TEXT("Mmo.CameraShake"), bCameraShake ? 1.0f : 0.0f);
	if (UMmoCueSubsystem* Cues = World ? World->GetSubsystem<UMmoCueSubsystem>() : nullptr)
	{
		Cues->SetVolume(EMmoSoundGroup::Effects, EffectVolume);
		Cues->SetVolume(EMmoSoundGroup::Music, MusicVolume);
		Cues->SetEffectLimit(Level.MaxEffects);
	}
}
