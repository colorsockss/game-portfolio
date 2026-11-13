#include "UI/MmoQuantityWidget.h"

#include "Components/TextBlock.h"
#include "Engine/LocalPlayer.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoUiManager.h"

void UMmoQuantityWidget::SetUp(const FText& Title, int32 InMax, TFunction<void(int32)> InOnChosen)
{
	TitleText->SetText(Title);
	Max = FMath::Max(InMax, 1);
	Current = 1;
	OnChosen = MoveTemp(InOnChosen);
	Refresh();
}

void UMmoQuantityWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	MinusTenButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandleMinusTen);
	MinusOneButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandleMinusOne);
	PlusOneButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandlePlusOne);
	PlusTenButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandlePlusTen);
	MaxButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandleMax);
	OkButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandleOk);
	CancelButton->OnClicked.AddDynamic(this, &UMmoQuantityWidget::HandleCancel);
}

void UMmoQuantityWidget::Change(int32 Delta)
{
	Current = FMath::Clamp(Current + Delta, 1, Max);
	Refresh();
}

void UMmoQuantityWidget::Refresh()
{
	ValueText->SetText(FText::Format(NSLOCTEXT("MmoUi", "QuantityValue", "{0} / {1}"), FText::AsNumber(Current), FText::AsNumber(Max)));
	MinusTenButton->SetIsEnabled(Current > 1);
	MinusOneButton->SetIsEnabled(Current > 1);
	PlusOneButton->SetIsEnabled(Current < Max);
	PlusTenButton->SetIsEnabled(Current < Max);
	MaxButton->SetIsEnabled(Current < Max);
}

void UMmoQuantityWidget::HandleMinusTen() { Change(-10); }
void UMmoQuantityWidget::HandleMinusOne() { Change(-1); }
void UMmoQuantityWidget::HandlePlusOne() { Change(1); }
void UMmoQuantityWidget::HandlePlusTen() { Change(10); }
void UMmoQuantityWidget::HandleMax() { Change(Max); }

void UMmoQuantityWidget::HandleOk()
{
	// 닫은 뒤에 부른다(확인 팝업과 같음).
	TFunction<void(int32)> Action = MoveTemp(OnChosen);
	const int32 Chosen = Current;
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Quantity);
	if (Action)
	{
		Action(Chosen);
	}
}

void UMmoQuantityWidget::HandleCancel()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Quantity);
}
