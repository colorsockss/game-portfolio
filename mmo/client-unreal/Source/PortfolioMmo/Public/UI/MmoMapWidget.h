#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoMapWidget.generated.h"

class UBorder;
class UCanvasPanel;
class UImage;
class UMmoButtonWidget;
class UTextBlock;
class UTexture2D;

/**
 * 전체 지도 창(WBP_Map의 기반, 76). 미니맵을 누르거나 M 키로 연다. 필드 전체의 바탕 그림 위에 구역의 이름, NPC의 점, 내 화살표를 그린다(0.2초마다 옮김).
 * 지도에서 목표를 눌러 걷는 것은 50이 더한다.
 */
UCLASS(Abstract)
class UMmoMapWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 생성기가 정하는 지도 그림의 한 변(픽셀). */
	static constexpr float MapSize = 560.0f;

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

	/** 퀘스트의 목표 점(50)을 누르면 그곳까지 걷고 지도를 닫는다. */
	virtual FReply NativeOnMouseButtonDown(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent) override;

private:
	UFUNCTION()
	void HandleCloseClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UImage> MapImage;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UCanvasPanel> MapDots;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> SelfArrow;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TObjectPtr<UTexture2D> Texture;

	UPROPERTY()
	TArray<TObjectPtr<UBorder>> Dots;

	UPROPERTY()
	TArray<TObjectPtr<UTextBlock>> ZoneNames;

	double NextDraw = 0;
	uint32 ShownLanguage = MAX_uint32;
};
