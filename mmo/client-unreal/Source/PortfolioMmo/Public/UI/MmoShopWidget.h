#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoShopWidget.generated.h"

class UMmoButtonWidget;
class UMmoItemSlotEntry;
class UTextBlock;
class UTileView;

/**
 * 상점 창(WBP_Shop의 기반, 37). 상점 NPC에게 말하면 열린다. 사기 목록(Shops 테이블의 차례. 패킷으로 받지 않음)과 내 인벤토리의 칸을 32의 아이템 칸으로 보이고,
 * 고른 것의 이름과 값, 내 골드를 보인다. 겹친 아이템은 수량 입력을 거쳐 Buy·Sell을 보내고, 답을 기다리는 동안 버튼을 누를 수 없다.
 */
UCLASS(Abstract)
class UMmoShopWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void HandleBuyClicked(UObject* Item);
	void HandleSellClicked(UObject* Item);

	UFUNCTION()
	void HandleActClicked();

	UFUNCTION()
	void HandleCloseClicked();

	/** 고른 것의 글과 버튼을 다시 채운다. */
	void Refresh();

	void Send(uint32 Count);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> BuyGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> SellGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> InfoText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> GoldText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ActButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> BuyEntries;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> SellEntries;

	/** 고른 것: 사기 목록의 아이템 번호(bBuying), 또는 팔 인벤토리 칸. 고르지 않았으면 Selected가 음수다. */
	bool bBuying = true;
	int64 Selected = -1;
	uint32 PendingRequest = 0;
	uint32 ShownVersion = MAX_uint32;
	uint32 ShownLanguage = MAX_uint32;
};
