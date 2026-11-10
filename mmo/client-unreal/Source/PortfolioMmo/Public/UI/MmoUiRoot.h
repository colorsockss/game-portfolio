#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Screen/ScreenStack.h"

#include "MmoUiRoot.generated.h"

class UMmoNameTagLayer;
class UOverlay;

/**
 * 모든 화면이 올라가는 뿌리. 아래에서 위로 이름표, HUD, 창, 팝업, 알림 층이다. 화면 배치가 아니라 구조라서 위젯 블루프린트 없이 C++로 만든다.
 * 층 자체는 입력을 받지 않아(SelfHitTestInvisible) 화면이 없는 곳의 터치와 클릭은 게임으로 간다.
 */
UCLASS()
class UMmoUiRoot : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 화면을 그 층의 맨 위에 놓는다. 이미 어딘가에 있으면 옮긴다. */
	void AddToLayer(MmoScreen::ELayer Layer, UUserWidget& Widget);

	/** 알림 층에 놓는다. */
	void AddNotice(UUserWidget& Widget);

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;

private:
	UOverlay* AddLayer(UOverlay& Root, const TCHAR* Name);

	UPROPERTY()
	TObjectPtr<UMmoNameTagLayer> NameTags;

	/** ELayer의 차례. */
	UPROPERTY()
	TArray<TObjectPtr<UOverlay>> Layers;

	UPROPERTY()
	TObjectPtr<UOverlay> Notices;
};
