#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoItemDetailWidget.generated.h"

class UMmoButtonWidget;
class UMmoQuickslotBarWidget;
class UTextBlock;

/**
 * 아이템 상세 창(WBP_ItemDetail의 기반, 32). 인벤토리 칸을 누르면 연다. 이름(등급의 색), 등급, 필요 레벨·직업·파는 값, 설명과 쓰기·퀵슬롯·떨어뜨리기(33) 버튼을 보이고
 * 아이템에 맞지 않는 버튼은 감춘다. 쓰기와 떨어뜨리기는 답(RequestResult)이 올 때까지 누를 수 없다. 떨어뜨리기는 확인 팝업을 띄우고 겹친 아이템이면
 * 수량 입력을 거친다. 장비는 능력치 줄(입은 것과의 비교)과 입기(입은 것이면 벗기) 버튼을 보이고, 입을 수 없으면 버튼을 누를 수 없고 맞지 않는 까닭을
 * 붉은 줄로 보인다(34). 강화는 35가 더한다.
 * 칸이 비거나 다른 아이템이 되면 닫는다.
 */
UCLASS(Abstract)
class UMmoItemDetailWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 인벤토리의 칸(bEquipment면 입은 장비의 칸. 34)을 보인다. */
	void SetUp(uint32 InSlotIndex, bool bInEquipment = false);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleUseClicked();


	UFUNCTION()
	void HandleDropClicked();

	UFUNCTION()
	void HandleEquipClicked();

	UFUNCTION()
	void HandleEnchantClicked();

	/** DropItem을 보내고 답을 기다린다. */
	void SendDrop(uint32 Count);

	UFUNCTION()
	void HandleCloseClicked();

	void Close();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> NameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> InfoText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> DescText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> UseButton;

	/** 물약을 올릴 퀵슬롯의 자리를 고르는 줄과 그 제목(36). 물약만 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> QuickslotTitle;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoQuickslotBarWidget> SlotBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> DropButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> EquipButton;

	/** 강화 주문서의 강화 버튼(35). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> EnchantButton;

	/** 장비의 능력치 줄(입은 것과의 비교). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatsText;

	/** 입을 수 없는 까닭(붉은 글). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> WarnText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	uint32 SlotIndex = 0;
	bool bEquipment = false;
	uint32 ItemId = 0;
	/** 답을 기다리는 쓰기나 떨어뜨리기의 요청 번호. 0이면 없음. */
	uint32 PendingRequest = 0;
};
