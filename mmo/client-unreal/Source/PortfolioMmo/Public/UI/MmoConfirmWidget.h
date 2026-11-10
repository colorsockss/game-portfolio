#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoConfirmWidget.generated.h"

class UButton;
class UTextBlock;

/** 예·아니요를 묻는 팝업(WBP_Confirm의 기반). UMmoUiManager::Confirm이 연다. */
UCLASS(Abstract)
class UMmoConfirmWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 물을 글과 예를 눌렀을 때 할 일. 열 때마다 바꾼다. */
	void SetUp(const FText& Message, TFunction<void()> InOnYes);

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
	TObjectPtr<UButton> YesButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> NoButton;

	TFunction<void()> OnYes;
};
