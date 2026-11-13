#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "World/CombatState.h"

#include "MmoNameTagLayer.generated.h"

class UCanvasPanel;
class UMmoNameTagWidget;
class UTextBlock;

/**
 * 이름표 층. 화면 하나의 캔버스에서 프레임마다 시야 안 개체(내 캐릭터 포함)의 머리 위를 화면 좌표로 바꿔 이름표를 놓는다.
 * 이름표 위젯은 개체마다 만들지 않고 풀에서 꺼내 쓰고, 개체가 나가거나 화면 밖이면 감춰 풀로 돌린다. 몬스터는 이름(Strings의 키, 74 전)과
 * 레벨을, 선공 몬스터는 다른 색으로 보이고, 플레이어와 몬스터는 체력 바를 단다.
 * 피해 숫자도 이 층에서 그린다: 내가 주거나 받은 피해만 맞은 개체의 머리 위에 1초 동안 떠오르며 사라지고, 치명타는 크게 그린다(풀로 돌려씀).
 */
UCLASS()
class UMmoNameTagLayer : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeDestruct() override;
	virtual void NativeTick(const FGeometry& Geometry, float DeltaTime) override;

private:
	UMmoNameTagWidget& Acquire(uint32 Id);

	/** 내가 주거나 받은 피해면 숫자를 띄운다. */
	void HandleCombatEvent(const MmoWorld::FCombatEvent& Event);

	/** 떠 있는 숫자들을 옮기고, 다 산 숫자는 풀로 돌린다. */
	void UpdateNumbers(float DeltaTime);

	/** 떠 있는 피해 숫자 하나. 글 위젯은 캔버스의 자식이라 GC가 지킨다. */
	struct FNumber
	{
		UTextBlock* Text = nullptr;
		uint32 Target = 0;
		float Age = 0.0f;
	};
	TArray<FNumber> Numbers;

	UPROPERTY()
	TArray<TObjectPtr<UTextBlock>> NumberPool;

	FDelegateHandle CombatHandle;

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
