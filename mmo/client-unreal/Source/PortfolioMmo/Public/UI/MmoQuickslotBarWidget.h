#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoQuickslotBarWidget.generated.h"

class UMmoButtonWidget;
class UMmoIcons;

/**
 * 퀵슬롯의 자리를 고르는 줄(WBP_QuickslotBar의 기반, 36). 스킬 창과 아이템 상세 창이 함께 쓴다. 자리마다 서버의 퀵슬롯 배치(스킬이나 물약의 아이콘)를
 * 보이고, 누른 자리의 번호를 OnPicked로 알린다. 무엇을 올릴지는 쓰는 창이 정한다.
 */
UCLASS(Abstract)
class UMmoQuickslotBarWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnPicked, int32 /* Index */);

	/** 누른 자리. */
	FOnPicked OnPicked;

	/** 생성기가 만드는 자리 버튼의 이름(Slot0, Slot1, ...). */
	static FString SlotName(int32 Index) { return FString::Printf(TEXT("Slot%d"), Index); }

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UPROPERTY()
	TArray<TObjectPtr<UMmoButtonWidget>> Slots;

	UPROPERTY()
	TObjectPtr<UMmoIcons> Icons;

	/** 마지막으로 채운 배치의 버전과 언어. 같으면 다시 채우지 않는다. */
	uint64 Shown = MAX_uint64;
};
