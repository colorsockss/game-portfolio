#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNoticeWidget.generated.h"

class UTextBlock;
class UWidget;

/**
 * 알림 층에 잠깐 뜨는 글(WBP_Notice의 기반). 이어 오면 줄을 쌓아(새 줄이 아래) 보이고, 줄마다 3초 뒤에 사라진다. 줄이 넘치면 가장
 * 오래된 줄을 뺀다. 입력은 받지 않는다. 줄의 모양은 생성기가 만든 Line0–3이 정한다.
 */
UCLASS(Abstract)
class UMmoNoticeWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 줄 하나를 더한다. */
	void Show(const FText& Message);

	/** 한 번에 보이는 줄 수(WBP_Notice의 Line0–3). */
	static constexpr int32 MaxLines = 4;

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& Geometry, float DeltaTime) override;

private:
	void Refresh();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> Line0;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> Line1;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> Line2;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> Line3;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Line0Text;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Line1Text;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Line2Text;
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> Line3Text;

	struct FLine
	{
		FText Message;
		float RemainingSeconds = 0;
	};
	/** 보이는 줄(오래된 것이 앞). */
	TArray<FLine> Lines;
};
