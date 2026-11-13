#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoQuantityWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;

/**
 * 1부터 받은 최대까지의 수를 고르는 공용 팝업(WBP_Quantity의 기반). UMmoUiManager::Quantity가 연다. −10, −1, +1, +10, 최대 버튼으로
 * 고르고 확인을 누르면 고른 수를 넘긴다. 떨어뜨리기(33), 상점(37), 창고(75)가 쓴다.
 */
UCLASS(Abstract)
class UMmoQuantityWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 제목, 최대(1 이상), 확인을 눌렀을 때 할 일. 열 때마다 바꾸고 수는 1에서 시작한다. */
	void SetUp(const FText& Title, int32 InMax, TFunction<void(int32)> InOnChosen);

	int32 Value() const { return Current; }

protected:
	virtual void NativeOnInitialized() override;

private:
	void Change(int32 Delta);
	void Refresh();

	UFUNCTION()
	void HandleMinusTen();
	UFUNCTION()
	void HandleMinusOne();
	UFUNCTION()
	void HandlePlusOne();
	UFUNCTION()
	void HandlePlusTen();
	UFUNCTION()
	void HandleMax();
	UFUNCTION()
	void HandleOk();
	UFUNCTION()
	void HandleCancel();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> TitleText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ValueText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> MinusTenButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> MinusOneButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> PlusOneButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> PlusTenButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> MaxButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> OkButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CancelButton;

	int32 Current = 1;
	int32 Max = 1;
	TFunction<void(int32)> OnChosen;
};
