#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoEnchantWidget.generated.h"

class UMmoButtonWidget;
class UMmoItemSlotEntry;
class UTextBlock;
class UTileView;

/**
 * 강화 창(WBP_Enchant의 기반, 35). 강화 주문서의 상세 창에서 연다. 가방과 입은 장비의 장비들(목록 위젯) 가운데 대상을 고르면 다음 단계와 성공 확률,
 * 실패하면 사라진다는 글을 보이고, 깨질 수 있는 단계면 확인 팝업을 거쳐 Enchant를 보낸다. 답을 기다리는 동안과 +9인 장비는 버튼을 누를 수 없다.
 * 결과(EnchantResult)를 창에 보이고 성공과 실패의 소리를 튼다.
 */
UCLASS(Abstract)
class UMmoEnchantWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 주문서가 든 인벤토리 칸으로 연다. */
	void SetUp(uint32 InScrollItemId);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleGoClicked();

	UFUNCTION()
	void HandleCloseClicked();

	void HandleTargetClicked(UObject* Item);

	/** 목록(가방과 입은 장비의 장비들)과 고른 대상의 글을 다시 채운다. */
	void Refresh();

	void Send();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTileView> Targets;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> InfoText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ResultText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> GoButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoItemSlotEntry>> Entries;

	uint32 ScrollItemId = 0;
	/** 고른 대상(없으면 SelectedIndex < 0). */
	int32 SelectedIndex = -1;
	bool bSelectedWorn = false;
	uint32 PendingRequest = 0;
	uint32 ShownVersion = MAX_uint32;
};
