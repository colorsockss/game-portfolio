#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNameTagWidget.generated.h"

class UProgressBar;
class UTextBlock;

/**
 * 개체 머리 위의 이름표 하나(WBP_NameTag의 기반): 상태 이상의 글자 아이콘(기절, 감속), 이름(몬스터는 이름과 레벨), 그 아래 작은 체력 바
 * (플레이어와 몬스터만)와 진행 바(시전 등. 진행 중일 때만), 그 위의 말풍선(주변 채팅. 41).
 * UMmoNameTagLayer가 풀로 돌려쓴다. 길드 등은 그 항목이 더한다.
 */
UCLASS(Abstract)
class UMmoNameTagWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 이름과 그 색을 넣는다. 바뀌었을 때만 고친다. */
	void SetName(const FString& Name, const FLinearColor& Color);

	/** 체력의 비율(0–1)을 보이거나, 음수면 체력 바를 감춘다. */
	void SetHp(float Ratio);

	/** 상태 이상의 글자 아이콘(예: "기절 감속"). 비면 감춘다. 바뀌었을 때만 고친다. */
	void SetStatus(const FString& Status);

	/** 진행 중인 일의 지난 비율(0–1)을 보이거나, 음수면 진행 바를 감춘다. */
	void SetProgress(float Ratio);

	/** 머리 위의 말풍선(주변 채팅. 41). 비면 감춘다. 바뀌었을 때만 고친다. */
	void SetBubble(const FString& Text);

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> NameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> HpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatusText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> ProgressBar;

	/** 말풍선의 틀과 글(41). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> Bubble;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> BubbleText;

	FString ShownBubble = TEXT("-");

	FString ShownStatus = TEXT("-");
	float ShownProgress = -2.0f;

	FString ShownName;
	FLinearColor ShownColor = FLinearColor::Transparent;
	float ShownHp = -2.0f;
};
