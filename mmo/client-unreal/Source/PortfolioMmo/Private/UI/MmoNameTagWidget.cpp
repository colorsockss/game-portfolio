#include "UI/MmoNameTagWidget.h"

#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"

void UMmoNameTagWidget::SetName(const FString& Name, const FLinearColor& Color)
{
	if (Name != ShownName)
	{
		ShownName = Name;
		NameText->SetText(FText::FromString(Name));
	}
	if (Color != ShownColor)
	{
		ShownColor = Color;
		NameText->SetColorAndOpacity(FSlateColor(Color));
	}
}

void UMmoNameTagWidget::SetHp(float Ratio)
{
	if (Ratio == ShownHp)
	{
		return;
	}
	ShownHp = Ratio;
	HpBar->SetVisibility(Ratio < 0.0f ? ESlateVisibility::Hidden : ESlateVisibility::HitTestInvisible);
	HpBar->SetPercent(FMath::Max(Ratio, 0.0f));
}

void UMmoNameTagWidget::SetStatus(const FString& Status)
{
	if (Status == ShownStatus)
	{
		return;
	}
	ShownStatus = Status;
	StatusText->SetText(FText::FromString(Status));
	StatusText->SetVisibility(Status.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
}

void UMmoNameTagWidget::SetBubble(const FString& Text)
{
	if (Text == ShownBubble)
	{
		return;
	}
	ShownBubble = Text;
	BubbleText->SetText(FText::FromString(Text));
	Bubble->SetVisibility(Text.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
}

void UMmoNameTagWidget::SetProgress(float Ratio)
{
	if (Ratio == ShownProgress)
	{
		return;
	}
	ShownProgress = Ratio;
	ProgressBar->SetVisibility(Ratio < 0.0f ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
	ProgressBar->SetPercent(FMath::Max(Ratio, 0.0f));
}
