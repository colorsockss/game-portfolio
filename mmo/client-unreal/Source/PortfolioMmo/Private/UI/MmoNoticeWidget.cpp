#include "UI/MmoNoticeWidget.h"

#include "Components/TextBlock.h"

namespace
{
	constexpr float ShowSeconds = 3.0f;
}

void UMmoNoticeWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Refresh();
}

void UMmoNoticeWidget::Show(const FText& Message)
{
	if (Lines.Num() == MaxLines)
	{
		Lines.RemoveAt(0);
	}
	Lines.Add({ Message, ShowSeconds });
	Refresh();
}

void UMmoNoticeWidget::NativeTick(const FGeometry& Geometry, float DeltaTime)
{
	Super::NativeTick(Geometry, DeltaTime);
	const int32 Before = Lines.Num();
	for (FLine& Line : Lines)
	{
		Line.RemainingSeconds -= DeltaTime;
	}
	Lines.RemoveAll([](const FLine& Line) { return Line.RemainingSeconds <= 0; });
	if (Lines.Num() != Before)
	{
		Refresh();
	}
}

void UMmoNoticeWidget::Refresh()
{
	UWidget* const Rows[] = { Line0, Line1, Line2, Line3 };
	UTextBlock* const Texts[] = { Line0Text, Line1Text, Line2Text, Line3Text };
	for (int32 Index = 0; Index < MaxLines; ++Index)
	{
		const bool bShown = Lines.IsValidIndex(Index);
		Rows[Index]->SetVisibility(bShown ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
		Texts[Index]->SetText(bShown ? Lines[Index].Message : FText::GetEmpty());
	}
}
