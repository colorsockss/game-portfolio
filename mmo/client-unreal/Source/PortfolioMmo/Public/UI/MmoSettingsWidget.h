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

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CharacterSelectButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> LogOutButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;
};
