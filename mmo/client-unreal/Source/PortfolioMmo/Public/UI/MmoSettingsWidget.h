#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoSettingsWidget.generated.h"

class UMmoButtonWidget;

/** 설정 창(WBP_Settings의 기반). 게임 중에 Esc나 Android 뒤로 버튼으로 연다. 지금은 캐릭터 선택, 로그아웃, 닫기뿐이다. */
UCLASS(Abstract)
class UMmoSettingsWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;

private:
	UFUNCTION()
	void HandleCharacterSelectClicked();

	UFUNCTION()
	void HandleLogOutClicked();

	UFUNCTION()
	void HandleCloseClicked();

	UFUNCTION()
	void HandleQuitClicked();

	/** 시연 표시의 줄에 지금 켰는지를 보인다. */
	void ShowStatsLabel();

	/** 기기에 남기는 설정의 줄(77)의 글을 지금 값으로 채운다. */
	void ShowSettingLabels();

	/** 설정을 바꾼 뒤: 바로 적용하고 기기에 남기고 글을 고친다. */
	void Changed();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> EffectVolumeButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> MusicVolumeButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> QualityButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> FrameButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> LanguageButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ShakeButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> QuitButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CharacterSelectButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> LogOutButton;

	/** 조작 안내 다시 보기(94). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> GuideButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	/** 시연 표시(프레임, 보이는 캐릭터 수, 지연)를 켜고 끄는 줄. Shipping 빌드에서도 있다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> StatsButton;
};
