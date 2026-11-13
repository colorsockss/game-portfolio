#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNameTagWidget.generated.h"

class UProgressBar;
class UTextBlock;

/**
 * 개체 머리 위의 이름표 하나(WBP_NameTag의 기반): 이름(몬스터는 이름과 레벨)과 그 아래 작은 체력 바(플레이어와 몬스터만).
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

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> NameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> HpBar;

	FString ShownName;
	FLinearColor ShownColor = FLinearColor::Transparent;
	float ShownHp = -2.0f;
};
