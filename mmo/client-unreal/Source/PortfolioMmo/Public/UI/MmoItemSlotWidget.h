#pragma once

#include "CoreMinimal.h"
#include "Blueprint/IUserObjectListEntry.h"
#include "Blueprint/UserWidget.h"

#include "MmoItemSlotWidget.generated.h"

class UBorder;
class UImage;
class UTextBlock;

/** 목록 위젯(UTileView)의 항목 하나: 인벤토리의 칸 번호. 그리는 내용은 칸 위젯이 세션의 인벤토리에서 읽는다. */
UCLASS()
class UMmoItemSlotEntry : public UObject
{
	GENERATED_BODY()

public:
	int32 SlotIndex = 0;
};

/**
 * 아이템 칸(WBP_ItemSlot의 기반, 32): 등급의 색 테두리, 아이콘(아이콘 표의 그림, 없으면 이름의 첫 글자), 겹친 수. 인벤토리 창의 목록 위젯이 항목마다
 * 다시 쓰고, 뒤의 창(상점 37, 제작 48)도 같은 위젯을 쓴다.
 */
UCLASS(Abstract)
class UMmoItemSlotWidget : public UUserWidget, public IUserObjectListEntry
{
	GENERATED_BODY()

public:
	/** 칸을 그린다. ItemId가 0이면 빈 칸이다. */
	void Show(uint32 ItemId, uint32 Count);

	/** 등급의 이름 색(일반 흰색, 고급 초록, 희귀 파랑, 영웅 보라). */
	static FLinearColor GradeColor(int32 Grade);

protected:
	virtual void NativeOnListItemObjectSet(UObject* ListItemObject) override;

private:
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UBorder> GradeBorder;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UImage> IconImage;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> LetterText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> CountText;
};
