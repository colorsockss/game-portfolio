#include "UI/MmoConfirmWidget.h"

#include "UI/MmoButtonWidget.h"
#include "Components/TextBlock.h"
#include "Engine/LocalPlayer.h"
#include "UI/MmoUiManager.h"

void UMmoConfirmWidget::SetUp(const FText& Message, TFunction<void()> InOnYes, TFunction<void()> InOnNo, const TCHAR* YesKey, const TCHAR* NoKey)
{
	MessageText->SetText(Message);
	OnYes = MoveTemp(InOnYes);
	OnNo = MoveTemp(InOnNo);
	YesButton->LabelKey = YesKey;
	YesButton->RefreshText();
	// 아니요의 키가 없으면 버튼 하나의 알림 창이다(조작 안내 94).
	NoButton->SetVisibility(NoKey ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	NoButton->LabelKey = NoKey ? NoKey : TEXT("common.no");
	NoButton->RefreshText();
}

void UMmoConfirmWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	YesButton->OnClicked.AddDynamic(this, &UMmoConfirmWidget::HandleYesClicked);
	NoButton->OnClicked.AddDynamic(this, &UMmoConfirmWidget::HandleNoClicked);
}

void UMmoConfirmWidget::HandleYesClicked()
{
	// 닫은 뒤에 부른다. 할 일이 다른 화면을 열고 닫아도(로그아웃) 이 팝업이 그 위에 남지 않는다.
	TFunction<void()> Action = MoveTemp(OnYes);
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Confirm);
	if (Action)
	{
		Action();
	}
}

void UMmoConfirmWidget::HandleNoClicked()
{
	TFunction<void()> Action = MoveTemp(OnNo);
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Confirm);
	if (Action)
	{
		Action();
	}
}
