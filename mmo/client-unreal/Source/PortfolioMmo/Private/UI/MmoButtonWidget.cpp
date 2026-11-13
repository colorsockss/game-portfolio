#include "UI/MmoButtonWidget.h"

#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Framework/Application/SlateApplication.h"
#include "UI/MmoUiManager.h"

bool UMmoButtonWidget::IsTouchDevice()
{
	return FPlatformMisc::SupportsTouchInput() || (FSlateApplication::IsInitialized() && FSlateApplication::Get().IsFakingTouchEvents());
}

void UMmoButtonWidget::SetLabel(const FText& InLabel)
{
	Label = InLabel;
	LabelText->SetText(Label);
}

void UMmoButtonWidget::SetKeyHint(const FText& InKeyHint)
{
	KeyHint = InKeyHint;
	KeyText->SetText(KeyHint);
	KeyText->SetVisibility(KeyHint.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
}

void UMmoButtonWidget::SetWaiting(bool bWaiting)
{
	SetIsEnabled(!bWaiting);
	SetRenderOpacity(bWaiting ? 0.5f : 1.0f);
}

void UMmoButtonWidget::SetSelected(bool bSelected)
{
	Button->SetBackgroundColor(bSelected ? SelectedTint : FLinearColor::White);
}

void UMmoButtonWidget::NativePreConstruct()
{
	Super::NativePreConstruct();
	SetLabel(Label);
	SetKeyHint(KeyHint);
	Size->SetMinDesiredHeight(IsTouchDevice() ? MinHeightTouch : MinHeightPointer);
	if (bTouchOnly && !IsDesignTime() && !IsTouchDevice())
	{
		SetVisibility(ESlateVisibility::Collapsed);
	}
}

void UMmoButtonWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Button->OnClicked.AddDynamic(this, &UMmoButtonWidget::HandleClicked);
}

FReply UMmoButtonWidget::NativeOnPreviewMouseButtonDown(const FGeometry& Geometry, const FPointerEvent& Event)
{
	// 버튼이 누른 순간 그 손가락의 주인이 된다(카메라로 가지 않음). 누르기 자체는 안의 UButton이 받는다.
	if (Event.IsTouchEvent())
	{
		if (UMmoUiManager* Manager = GetOwningLocalPlayer() ? GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>() : nullptr)
		{
			Manager->TouchOwners().Claim(Event.GetPointerIndex(), MmoScreen::ETouchOwner::Button);
		}
	}
	return Super::NativeOnPreviewMouseButtonDown(Geometry, Event);
}

void UMmoButtonWidget::HandleClicked()
{
	OnClicked.Broadcast();
}
