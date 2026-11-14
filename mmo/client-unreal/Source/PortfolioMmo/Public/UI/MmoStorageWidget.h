#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoStorageWidget.generated.h"

class UMmoButtonWidget;
class UMmoItemSlotEntry;
class UTileView;

/**
 * 창고 창(WBP_Storage의 기반, 75). 창고 NPC에게 말해 서버가 Storage를 보내면 열린다. 창고 칸과 내 가방 칸을 나란히 32의 아이템 칸으로 보이고, 창고 칸을 누르면 찾고
 * 가방 칸을 누르면 맡긴다. 겹친 것은 수량 입력을 거치고, 답을 기다리는 동안에는 누르지 않는다.
 */
UCLASS(Abstract)
class UMmoStorageWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void HandleStorageClicked(UObject* Item);
	void HandleBagClicked(UObject* Item);

	/** 칸 하나를 옮긴다: 둘 이상이면 수량을 묻는다. */
	void Move(bool bWithdraw, uint32 Slot, uint32 Count);

	UFUNCTION()
	void HandleCloseClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> StorageGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> BagGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> StorageEntries;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> BagEntries;

	uint32 PendingRequest = 0;
	uint32 ShownStorage = MAX_uint32;
	uint32 ShownBag = MAX_uint32;
};
