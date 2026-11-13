#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoHudWidget.generated.h"

class UMmoJoystickWidget;
class UTextBlock;

/**
 * 게임 중의 HUD(WBP_Hud의 기반). 터치 기기의 가상 조이스틱과, 내 캐릭터가 있는 구역(이름, 권장 레벨, 안전 지대)을 보인다.
 * 체력 바 등은 뒤 항목에서 더한다.
 */
UCLASS(Abstract)
class UMmoHudWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	/** 구역이 바뀌었을 때만 글을 고친다. */
	void ShowZone(uint32 Zone);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoJoystickWidget> Joystick;

	/** 구역의 이름과 권장 레벨. 구역 0이면 비운다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ZoneText;

	/** 안전 지대 안에서만 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> SafeZoneText;

	/** 마지막으로 보인 구역. 처음에는 어떤 구역과도 다르게 둔다. */
	uint32 ShownZone = MAX_uint32;
};
