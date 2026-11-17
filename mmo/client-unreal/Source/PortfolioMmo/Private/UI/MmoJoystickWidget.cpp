#include "UI/MmoJoystickWidget.h"

#include "Components/Image.h"
#include "Engine/LocalPlayer.h"
#include "Game/MmoPlayerController.h"
#include "UI/MmoUiManager.h"

namespace
{
	/** 손잡이를 이만큼(바탕 반지름의 비율) 넘게 밀어야 걷는다. 손가락을 댄 자리의 작은 떨림으로 걷지 않게 한다. */
	constexpr double DeadZone = 0.2;
}

FReply UMmoJoystickWidget::NativeOnTouchStarted(const FGeometry& Geometry, const FPointerEvent& Event)
{
	// 이미 다른 손가락을 쥐었거나, 이 손가락의 주인이 이미 정해졌으면(터치 나눔) 받지 않는다.
	UMmoUiManager* Manager = GetOwningLocalPlayer() ? GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>() : nullptr;
	if (Finger != INDEX_NONE || (Manager && !Manager->TouchOwners().Claim(Event.GetPointerIndex(), MmoScreen::ETouchOwner::Joystick)))
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
	// 손잡이는 바탕의 가장자리까지 간다. 화면 좌표는 아래가 +y이고 이동 값은 앞이 +y다. 기울인 정도와 관계없이 최대 속도로 걷는다(서버가 알리는
	// 빠르기가 최대 속도라서. 54). 가운데 DeadZone 안은 서 있다.
	const FVector2D Center = FVector2D(Geometry.GetLocalSize()) * 0.5;
	const double Radius = FMath::Max(Center.X, 1.0);
	const FVector2D Offset = (FVector2D(Geometry.AbsoluteToLocal(Event.GetScreenSpacePosition())) - Center).GetClampedToMaxSize(Radius);
	Thumb->SetRenderTranslation(Offset);
	Value = Offset.Size() < Radius * DeadZone ? FVector2D::ZeroVector : FVector2D(Offset.X, -Offset.Y).GetSafeNormal();
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
