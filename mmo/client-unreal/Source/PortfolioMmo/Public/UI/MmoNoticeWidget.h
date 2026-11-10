#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoNoticeWidget.generated.h"

class UTextBlock;

/** 알림 층에 잠깐 뜨는 글(WBP_Notice의 기반). 연결 끊김 등. 입력은 받지 않는다. */
UCLASS(Abstract)
class UMmoNoticeWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** Message를 보이고 몇 초 뒤에 감춘다. 보이는 동안 다시 부르면 글을 바꾸고 시간을 새로 센다. */
	void Show(const FText& Message);

protected:
	virtual void NativeTick(const FGeometry& Geometry, float DeltaTime) override;

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> MessageText;

	float RemainingSeconds = 0;
};
