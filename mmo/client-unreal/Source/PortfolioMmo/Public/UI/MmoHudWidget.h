#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoHudWidget.generated.h"

class UMmoJoystickWidget;

/** 게임 중의 HUD(WBP_Hud의 기반). 지금은 터치 기기의 가상 조이스틱뿐이고, 체력 바 등은 뒤 항목에서 더한다. */
UCLASS(Abstract)
class UMmoHudWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeConstruct() override;

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoJoystickWidget> Joystick;
};
