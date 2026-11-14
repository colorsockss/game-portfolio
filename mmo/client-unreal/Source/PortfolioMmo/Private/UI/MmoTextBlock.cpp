#include "UI/MmoTextBlock.h"

#include "UI/MmoText.h"

void UMmoTextBlock::RefreshText()
{
	if (!TextKey.IsEmpty())
	{
		SetText(MmoText::Get(this, TextKey));
	}
}

void UMmoTextBlock::SynchronizeProperties()
{
	Super::SynchronizeProperties();
	if (!IsDesignTime())
	{
		RefreshText();
	}
}
