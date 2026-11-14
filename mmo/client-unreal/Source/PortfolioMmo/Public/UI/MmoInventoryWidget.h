#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoInventoryWidget.generated.h"

class UMmoButtonWidget;
class UMmoItemSlotEntry;
class UTextBlock;
class UTileView;

/**
 * 인벤토리 창(WBP_Inventory의 기반, 32). 칸들은 보이는 줄만 만드는 목록 위젯(UTileView, 항목은 칸 번호)이 WBP_ItemSlot으로 그리고, 칸을 누르면
 * 아이템 상세 창을 연다. HUD의 가방 버튼과 I 키로 열고 닫는다. 칸을 옮기거나 정렬하는 조작은 없다(범위 밖). 장비 쪽은 34가 더한다.
 */
UCLASS(Abstract)
class UMmoInventoryWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleCloseClicked();

	void HandleItemClicked(UObject* Item);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> Grid;

	/** 입은 장비 여섯 칸(34). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> EquipGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> GoldText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> Entries;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> EquipEntries;

	/** 마지막으로 채운 인벤토리의 판과 언어. */
	uint32 ShownVersion = MAX_uint32;
	uint32 ShownLanguage = MAX_uint32;
};
