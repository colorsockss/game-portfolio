#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNameTagLayer.generated.h"

class UCanvasPanel;
class UMmoNameTagWidget;

/**
 * 이름표 층. 화면 하나의 캔버스에서 프레임마다 시야 안 개체(내 캐릭터 포함)의 머리 위를 화면 좌표로 바꿔 이름표를 놓는다.
 * 이름표 위젯은 개체마다 만들지 않고 풀에서 꺼내 쓰고, 개체가 나가거나 화면 밖이면 감춰 풀로 돌린다.
 */
UCLASS()
class UMmoNameTagLayer : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& Geometry, float DeltaTime) override;

private:
	UMmoNameTagWidget& Acquire(uint32 Id, const FString& Name);

	UPROPERTY()
	TObjectPtr<UCanvasPanel> Canvas;

	UPROPERTY()
	TSubclassOf<UMmoNameTagWidget> TagClass;

	/** 개체 번호 → 쓰는 중인 이름표. */
	UPROPERTY()
	TMap<uint32, TObjectPtr<UMmoNameTagWidget>> Active;

	/** 감춰 둔 이름표. */
	UPROPERTY()
	TArray<TObjectPtr<UMmoNameTagWidget>> Pool;
};
