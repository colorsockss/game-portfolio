#include "UI/MmoJoystickWidget.h"

#include "Components/Image.h"
#include "Game/MmoPlayerController.h"

FReply UMmoJoystickWidget::NativeOnTouchStarted(const FGeometry& Geometry, const FPointerEvent& Event)
{
	if (Finger != INDEX_NONE)
	{
		return FReply::Unhandled();
	}
	Finger = Event.GetPointerIndex();
	Follow(Geometry, Event);
	return FReply::Handled().CaptureMouse(TakeWidget());
}

FReply UMmoJoystickWidget::NativeOnTouchMoved(const FGeometry& Geometry, const FPointerEvent& Event)
{
	if (Event.GetPointerIndex() != Finger)
	{
		return FReply::Unhandled();
	}
	Follow(Geometry, Event);
	return FReply::Handled();
}

FReply UMmoJoystickWidget::NativeOnTouchEnded(const FGeometry& Geometry, const FPointerEvent& Event)
{
	if (Event.GetPointerIndex() != Finger)
	{
		return FReply::Unhandled();
	}
	Release();
	return FReply::Handled().ReleaseMouseCapture();
}

void UMmoJoystickWidget::NativeTick(const FGeometry& Geometry, float DeltaTime)
{
	Super::NativeTick(Geometry, DeltaTime);
	// 넣은 값은 그 프레임에만 쓰이므로 누르는 동안 매 프레임 넣는다.
	if (Finger != INDEX_NONE)
	{
		if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
		{
			Controller->InjectMove(Value);
		}
	}
}

void UMmoJoystickWidget::NativeDestruct()
{
	Release();
	Super::NativeDestruct();
}

void UMmoJoystickWidget::Follow(const FGeometry& Geometry, const FPointerEvent& Event)
{
	// 손잡이는 바탕의 가장자리까지 간다. 화면 좌표는 아래가 +y이고 이동 값은 앞이 +y다.
	const FVector2D Center = FVector2D(Geometry.GetLocalSize()) * 0.5;
	const double Radius = FMath::Max(Center.X, 1.0);
	const FVector2D Offset = (FVector2D(Geometry.AbsoluteToLocal(Event.GetScreenSpacePosition())) - Center).GetClampedToMaxSize(Radius);
	Thumb->SetRenderTranslation(Offset);
	Value = FVector2D(Offset.X, -Offset.Y) / Radius;
}

void UMmoJoystickWidget::Release()
{
	Finger = INDEX_NONE;
	Value = FVector2D::ZeroVector;
	if (Thumb)
	{
		Thumb->SetRenderTranslation(FVector2D::ZeroVector);
	}
}
