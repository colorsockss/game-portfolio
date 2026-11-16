#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoCraftWidget.generated.h"

class UMmoButtonWidget;
class UMmoItemSlotEntry;
class UTextBlock;
class UTileView;

/**
 * 제작 창(WBP_Craft의 기반, 48). 제작 NPC에게 말하면 열린다. 제작법 목록(Recipes의 차례. 패킷으로 받지 않음)을 32의 아이템 칸으로 보이고(장비는 그 종의 일반 등급),
 * 고른 제작법의 결과, 필요 레벨, 재료(필요한 수와 가진 수), 골드, 장비면 등급의 확률을 보인다. 만들 수 없으면 버튼을 끄고 모자란 줄을 붉게 보인다(서버와 같은
 * 판단 MmoWorld::CheckCraft). 답과 내 제작을 기다리는 동안 버튼을 누를 수 없다. 칸 항목의 SlotIndex가 제작법의 차례다.
 */
UCLASS(Abstract)
class UMmoCraftWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 재료 줄의 수(제작법의 재료가 이보다 많지 않음). */
	static constexpr int32 MaterialLines = 3;

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void HandleRecipeClicked(UObject* Item);

	UFUNCTION()
	void HandleActClicked();

	UFUNCTION()
	void HandleCloseClicked();

	/** 고른 제작법의 글과 버튼을 다시 채운다. */
	void Refresh();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> RecipeGrid;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ResultText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> LevelText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Material0Text;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Material1Text;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Material2Text;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> GoldText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> GradesText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> RoomText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ActButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> Entries;

	/** 고른 제작법의 차례. 고르지 않았으면 음수다. */
	int32 Selected = -1;
	uint32 PendingRequest = 0;
	bool bShownBusy = false;
	uint32 ShownVersion = MAX_uint32;
	uint32 ShownLanguage = MAX_uint32;
	uint32 ShownLevel = MAX_uint32;
};
