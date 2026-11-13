#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"

#include "MmoAnimInstance.generated.h"

class UAnimSequenceBase;

/**
 * 캐릭터의 애니메이션 인스턴스(애니메이션 블루프린트 ABP_<직업>의 부모). 그래프는 에디터 모듈의 MmoCreateCharacterAssets가 만든다:
 * 이동 블렌드 스페이스(축 = Speed) → 슬롯(DefaultSlot) → 출력. 공격·피격처럼 한 번 트는 동작은 PlayAction이 그 슬롯에 넣는다.
 * 상체와 하체를 섞는 것은 backlog 92다.
 */
UCLASS()
class PORTFOLIOMMO_API UMmoAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	/** 동작을 넣는 슬롯의 이름(뼈대의 기본 그룹에 있는 슬롯). */
	static const FName SlotName;

	/** 달리는 속도(언리얼 단위/초). 0이 대기, 600(6 m/s)이 달리기다. */
	UPROPERTY(BlueprintReadOnly, Category = "Mmo")
	float Speed = 0.0f;

	/** 동작 하나를 한 번 튼다. 트는 중인 동작은 끊는다. */
	void PlayAction(UAnimSequenceBase* Sequence);
};
