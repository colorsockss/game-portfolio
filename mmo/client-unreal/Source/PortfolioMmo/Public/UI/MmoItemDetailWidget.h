#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoItemDetailWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;

/**
 * 아이템 상세 창(WBP_ItemDetail의 기반, 32). 인벤토리 칸을 누르면 연다. 이름(등급의 색), 등급, 필요 레벨·직업·파는 값, 설명과 쓰기·퀵슬롯·떨어뜨리기(33) 버튼을 보이고
 * 아이템에 맞지 않는 버튼은 감춘다. 쓰기와 떨어뜨리기는 답(RequestResult)이 올 때까지 누를 수 없다. 떨어뜨리기는 확인 팝업을 띄우고 겹친 아이템이면
 * 수량 입력을 거친다. 입기는 34, 강화는 35가 더한다.
 * 칸이 비거나 다른 아이템이 되면 닫는다.
 */
UCLASS(Abstract)
class UMmoItemDetailWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 인벤토리의 칸을 보인다. */
	void SetUp(uint32 InSlotIndex);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleUseClicked();

	UFUNCTION()
	void HandleQuickslotClicked();

	UFUNCTION()
	void HandleDropClicked();

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

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> QuickslotButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> DropButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	uint32 SlotIndex = 0;
	uint32 ItemId = 0;
	/** 답을 기다리는 쓰기나 떨어뜨리기의 요청 번호. 0이면 없음. */
	uint32 PendingRequest = 0;
};
