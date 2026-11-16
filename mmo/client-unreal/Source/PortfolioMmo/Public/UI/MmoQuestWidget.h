#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoQuestWidget.generated.h"

class UMmoButtonWidget;
class UMmoSession;
class UTextBlock;

/**
 * 퀘스트 창(WBP_Quest의 기반, 50). HUD의 퀘스트 버튼과 L 키, 퀘스트 NPC에게 말하기로 연다. 지금 퀘스트(받지 않았으면 다음 차례)의 이름, 설명, 조건과 진행,
 * 보상을 보이고, 목표까지 걷기와 받기·끝내기 버튼을 둔다. 받기와 끝내기는 NPC의 표시가 받을 수 있음·끝낼 수 있음일 때만 켜고 답을 기다리는 동안 누를 수 없다.
 */
UCLASS(Abstract)
class UMmoQuestWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 받은 퀘스트의 조건과 진행 한 줄("늑대 잡기 3/10"). 받은 것이 없으면 빈 글이다. HUD도 쓴다. */
	static FText ProgressLine(const UObject* Context, UMmoSession& Session);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleGoalClicked();

	UFUNCTION()
	void HandleAcceptClicked();

	UFUNCTION()
	void HandleCompleteClicked();

	UFUNCTION()
	void HandleCloseClicked();

	void Refresh();

	void Send(bool bAccept);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> NameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> DescriptionText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ConditionText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> RewardText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> GoalButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> AcceptButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CompleteButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	uint32 PendingRequest = 0;
	UMmoButtonWidget* PendingButton = nullptr;
	uint32 ShownQuest = MAX_uint32;
	uint32 ShownInventory = MAX_uint32;
	uint32 ShownLanguage = MAX_uint32;
	uint32 ShownLevel = MAX_uint32;
};
