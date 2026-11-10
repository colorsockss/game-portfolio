#include "UI/MmoNameTagWidget.h"

#include "Components/TextBlock.h"

void UMmoNameTagWidget::SetName(const FString& Name)
{
	NameText->SetText(FText::FromString(Name));
}
