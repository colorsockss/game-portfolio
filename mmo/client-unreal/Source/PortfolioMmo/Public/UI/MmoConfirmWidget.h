#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoConfirmWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;

/** 예·아니요를 묻는 팝업(WBP_Confirm의 기반). UMmoUiManager::Confirm이 연다. */
UCLASS(Abstract)
class UMmoConfirmWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 물을 글, 예와 아니요를 눌렀을 때 할 일, 두 버튼의 글(Strings의 키). 열 때마다 바꾼다. */
	void SetUp(const FText& Message, TFunction<void()> InOnYes, TFunction<void()> InOnNo, const TCHAR* YesKey, const TCHAR* NoKey);

protected:
	virtual void NativeOnInitialized() override;

private:
	UFUNCTION()
	void HandleYesClicked();

	UFUNCTION()
	void HandleNoClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> MessageText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> YesButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> NoButton;

	TFunction<void()> OnYes;
	TFunction<void()> OnNo;
};
