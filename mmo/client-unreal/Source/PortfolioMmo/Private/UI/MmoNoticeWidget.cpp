#include "UI/MmoNoticeWidget.h"

#include "Components/TextBlock.h"

namespace
{
	constexpr float ShowSeconds = 3.0f;
}

void UMmoNoticeWidget::Show(const FText& Message)
{
	MessageText->SetText(Message);
	RemainingSeconds = ShowSeconds;
	SetVisibility(ESlateVisibility::HitTestInvisible);
}

void UMmoNoticeWidget::NativeTick(const FGeometry& Geometry, float DeltaTime)
{
	Super::NativeTick(Geometry, DeltaTime);
	if (RemainingSeconds > 0 && (RemainingSeconds -= DeltaTime) <= 0)
	{
		SetVisibility(ESlateVisibility::Collapsed);
	}
}
