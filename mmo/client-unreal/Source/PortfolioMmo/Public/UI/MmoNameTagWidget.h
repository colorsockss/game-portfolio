#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNameTagWidget.generated.h"

class UTextBlock;

/** 개체 머리 위의 이름표 하나(WBP_NameTag의 기반). UMmoNameTagLayer가 풀로 돌려쓴다. 뒤에 체력 바와 길드가 더해진다. */
UCLASS(Abstract)
class UMmoNameTagWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	void SetName(const FString& Name);

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> NameText;
};
