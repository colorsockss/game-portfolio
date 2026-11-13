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
