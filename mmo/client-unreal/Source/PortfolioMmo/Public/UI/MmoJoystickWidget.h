#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoJoystickWidget.generated.h"

class UImage;

/**
 * 가상 조이스틱(WBP_Joystick의 기반). 이 위젯을 누른 손가락을 붙잡아 가운데에서 끈 만큼을 이동 값(-1–1)으로 바꾸고,
 * 프레임마다 키보드·게임패드와 같은 이동 액션에 넣는다(AMmoPlayerController::InjectMove). 이 위젯이 가져간 터치는 카메라로 가지 않는다.
 */
UCLASS(Abstract)
class UMmoJoystickWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual FReply NativeOnTouchStarted(const FGeometry& Geometry, const FPointerEvent& Event) override;
	virtual FReply NativeOnTouchMoved(const FGeometry& Geometry, const FPointerEvent& Event) override;
	virtual FReply NativeOnTouchEnded(const FGeometry& Geometry, const FPointerEvent& Event) override;
	virtual void NativeTick(const FGeometry& Geometry, float DeltaTime) override;
	virtual void NativeDestruct() override;

private:
	/** 손가락의 자리로 손잡이와 이동 값을 정한다. */
	void Follow(const FGeometry& Geometry, const FPointerEvent& Event);
	void Release();

	/** 끄는 손잡이. 바탕은 이 위젯 전체다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UImage> Thumb;

	/** 붙잡은 손가락. 없으면 INDEX_NONE. */
	int32 Finger = INDEX_NONE;
	FVector2D Value = FVector2D::ZeroVector;
};
