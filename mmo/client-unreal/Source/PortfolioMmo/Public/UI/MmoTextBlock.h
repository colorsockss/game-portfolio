#pragma once

#include "CoreMinimal.h"
#include "Components/TextBlock.h"

#include "MmoTextBlock.generated.h"

/**
 * Strings 테이블의 키로 글을 채우는 글 상자(74). 위젯 생성기가 고정된 글(창의 제목, 안전 지대 표시 등)을 이것으로 놓는다.
 * 실행 중에 키의 문장을 채우고, 언어가 바뀌면 화면 관리자가 RefreshText를 부른다. 디자인 화면에서는 키가 보인다.
 */
UCLASS()
class PORTFOLIOMMO_API UMmoTextBlock : public UTextBlock
{
	GENERATED_BODY()

public:
	UPROPERTY(EditAnywhere, Category = "Mmo")
	FString TextKey;

	/** 키의 문장으로 다시 채운다(언어가 바뀜). 키가 비면 아무것도 하지 않는다. */
	void RefreshText();

protected:
	virtual void SynchronizeProperties() override;
};
