#pragma once

#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"

#include "MmoAnimInstance.generated.h"

class UAnimMontage;
class UAnimSequenceBase;

/**
 * 캐릭터의 애니메이션 인스턴스(애니메이션 블루프린트 ABP_<직업>의 부모). 그래프는 에디터 모듈의 MmoCreateCharacterAssets가 만든다:
 * 하체는 이동 블렌드 스페이스(축 = Speed), 상체(UpperBodyBone부터 위)는 상체 슬롯(UpperBody)을 지난 이동이고, 둘을 섞은 뒤 온몸 슬롯(DefaultSlot) → 출력.
 * 공격·스킬·피격·채집처럼 트는 동작은 PlayAction이 서 있으면 온몸 슬롯에 넣어 발과 엉덩이도 동작대로 움직이고, 움직이는 중이면 상체 슬롯에 넣어
 * 다리가 걷는 동작을 이어 간다. 온몸으로 트는 중에 움직이기 시작하면 같은 자리부터 상체 슬롯으로 넘긴다(두 슬롯은 한 그룹이라 새 것이 옛 것을 섞어 끔).
 * 죽음은 온몸 슬롯에 넣는다.
 */
UCLASS()
class PORTFOLIOMMO_API UMmoAnimInstance : public UAnimInstance
{
	GENERATED_BODY()

public:
	/** 온몸 동작(죽음)을 넣는 슬롯의 이름(뼈대의 기본 그룹에 있는 슬롯). */
	static const FName SlotName;

	/** 상체 동작(공격, 스킬, 피격, 시전)을 넣는 슬롯의 이름. 커맨드렛이 뼈대의 기본 그룹에 등록한다. */
	static const FName UpperSlotName;

	/** 상체가 시작하는 뼈(Quaternius 캐릭터의 배). 이 뼈와 그 아래(머리, 팔)가 상체 동작을 따른다. */
	static const FName UpperBodyBone;

	/** 서 있다고 보는 속도(언리얼 단위/초). 이보다 느리면 동작을 온몸에 튼다. 다른 개체의 속도는 보간한 자리에서 구해 서 있어도 조금 흔들린다. */
	static constexpr float StandingSpeed = 50.0f;

	/** 달리는 속도(언리얼 단위/초). 0이 대기, 600(6 m/s)이 달리기다. */
	UPROPERTY(BlueprintReadOnly, Category = "Mmo")
	float Speed = 0.0f;

	/** 동작 하나를 한 번 튼다(bLoop면 StopAction까지 되풀이. 시전, 채집). 트는 중인 동작은 끊는다. 서 있으면 온몸, 움직이면 상체에 튼다. */
	void PlayAction(UAnimSequenceBase* Sequence, bool bLoop = false);

	/** 트는 동작을 끊고 이동 동작으로 돌아간다(시전의 끝과 취소). 쓰러진 자세는 건드리지 않는다. */
	void StopAction();

	/** 쓰러지는 동작을 틀고 마지막 자세로 멈춘다. bAlreadyDown이면 처음부터 쓰러진 자세다(죽은 채 시야에 들어옴). */
	void PlayDeath(UAnimSequenceBase* Sequence, bool bAlreadyDown);

	/** 쓰러진 자세를 풀고 이동 동작으로 돌아간다(부활). */
	void StandUp();

protected:
	virtual void NativeUpdateAnimation(float DeltaSeconds) override;

private:
	/** 쓰러진 자세를 붙잡는 몽타주. */
	UPROPERTY()
	TObjectPtr<UAnimMontage> DeathMontage;

	/** 트는 동작의 몽타주와 그 동작. 온몸으로 트는 중에 움직이기 시작하면 같은 자리부터 상체 슬롯으로 다시 튼다. */
	UPROPERTY()
	TObjectPtr<UAnimMontage> ActionMontage;

	UPROPERTY()
	TObjectPtr<UAnimSequenceBase> ActionSequence;

	bool bActionFullBody = false;
	bool bActionLoop = false;
};
