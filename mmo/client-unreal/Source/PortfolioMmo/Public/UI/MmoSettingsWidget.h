#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoSettingsWidget.generated.h"

class UButton;

/** 설정 창(WBP_Settings의 기반). 게임 중에 Esc나 Android 뒤로 버튼으로 연다. 지금은 로그아웃과 닫기뿐이다. */
UCLASS(Abstract)
class UMmoSettingsWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;

private:
	UFUNCTION()
	void HandleLogOutClicked();

	UFUNCTION()
	void HandleCloseClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> LogOutButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> CloseButton;
};
