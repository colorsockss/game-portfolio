#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoHudWidget.generated.h"

class UMmoJoystickWidget;
class UProgressBar;
class UTextBlock;

/**
 * 게임 중의 HUD(WBP_Hud의 기반). 내 체력·마나 바(지금/최대), 터치 기기의 가상 조이스틱과, 내 캐릭터가 있는 구역(이름, 권장 레벨,
 * 안전 지대)을 보인다. 경험치 바(31) 등은 그 항목이 더한다.
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

	/** 바 하나에 지금 값과 최대값을 보인다. 값이 바뀌었을 때만 고친다. */
	static void ShowBar(UProgressBar& Bar, UTextBlock& Text, uint32 Value, uint32 Max, uint64& Shown);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoJoystickWidget> Joystick;

	/** 구역의 이름과 권장 레벨. 구역 0이면 비운다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ZoneText;

	/** 안전 지대 안에서만 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> SafeZoneText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> HpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> HpText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> MpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> MpText;

	/** 마지막으로 보인 (지금 값, 최대값). 처음에는 어떤 값과도 다르게 둔다. */
	uint64 ShownHp = MAX_uint64;
	uint64 ShownMp = MAX_uint64;

	/** 마지막으로 보인 구역. 처음에는 어떤 구역과도 다르게 둔다. */
	uint32 ShownZone = MAX_uint32;
};
