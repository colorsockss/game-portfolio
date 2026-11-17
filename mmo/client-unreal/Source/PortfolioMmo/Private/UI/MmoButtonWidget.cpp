#include "UI/MmoButtonWidget.h"

#include "Components/ButtonSlot.h"

#include "UI/MmoText.h"

#include "Components/Image.h"
#include "Components/SizeBox.h"
#include "Components/TextBlock.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCueSubsystem.h"
#include "UI/MmoUiManager.h"

bool UMmoButtonWidget::IsTouchDevice()
{
	return FPlatformMisc::SupportsTouchInput() || (FSlateApplication::IsInitialized() && FSlateApplication::Get().IsFakingTouchEvents());
}

void UMmoButtonWidget::RefreshText()
{
	if (!LabelKey.IsEmpty() && !Icon)
	{
		SetLabel(MmoText::Get(this, LabelKey));
	}
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

void UMmoButtonWidget::SetIcon(UTexture2D* Texture, const FText& Name)
{
	IconImage->SetVisibility(Texture ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	if (Texture)
	{
		IconImage->SetBrushFromTexture(Texture);
		SetLabel(FText::GetEmpty());
		return;
	}
	FSlateFontInfo Font = LabelText->GetFont();
	Font.Size = IconLetterSize;
	LabelText->SetFont(Font);
	SetLabel(FText::FromString(Name.ToString().Left(1)));
}

void UMmoButtonWidget::NativePreConstruct()
{
	Super::NativePreConstruct();
	SetLabel(Label);
	if (!IsDesignTime())
	{
		RefreshText();
	}
	SetKeyHint(KeyHint);
	const float Height = IsTouchDevice() ? MinHeightTouch : MinHeightPointer;
	Size->SetMinDesiredHeight(Height);
	if (Icon)
	{
		// 그림만 있는 버튼은 정사각형이고, 그림이 작아지지 않게 라벨의 안쪽 여백을 줄인다.
		SetIcon(Icon, FText::GetEmpty());
		Size->SetMinDesiredWidth(Height);
		if (UButtonSlot* Content = Cast<UButtonSlot>(Button->GetContentSlot()))
		{
			Content->SetPadding(FMargin(4.0f));
		}
	}
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
	if (UMmoCueSubsystem* Cues = GetWorld() ? GetWorld()->GetSubsystem<UMmoCueSubsystem>() : nullptr)
	{
		Cues->PlayUi(EMmoCue::UiClick);
	}
	OnClicked.Broadcast();
	OnClickedNative.Broadcast();
}
