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

	/** 시연 표시의 줄에 지금 켰는지를 보인다. */
	void ShowStatsLabel();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CharacterSelectButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> LogOutButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	/** 시연 표시(프레임, 보이는 캐릭터 수, 지연)를 켜고 끄는 줄. Shipping 빌드에서도 있다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> StatsButton;
};
