#include "Game/MmoAnimInstance.h"

#include "Animation/AnimMontage.h"
#include "Animation/AnimSequenceBase.h"

const FName UMmoAnimInstance::SlotName(TEXT("DefaultSlot"));
const FName UMmoAnimInstance::UpperSlotName(TEXT("UpperBody"));
const FName UMmoAnimInstance::UpperBodyBone(TEXT("Abdomen"));

void UMmoAnimInstance::PlayAction(UAnimSequenceBase* Sequence, bool bLoop)
{
	if (Sequence && !DeathMontage)
	{
		bActionFullBody = Speed < StandingSpeed;
		bActionLoop = bLoop;
		ActionSequence = Sequence;
		ActionMontage = PlaySlotAnimationAsDynamicMontage(Sequence, bActionFullBody ? SlotName : UpperSlotName, 0.1f, 0.15f, 1.0f, bLoop ? MAX_int32 : 1);
	}
}

void UMmoAnimInstance::StopAction()
{
	if (!DeathMontage)
	{
		StopSlotAnimation(0.15f, UpperSlotName);
		StopSlotAnimation(0.15f, SlotName);
	}
	ActionMontage = nullptr;
	ActionSequence = nullptr;
}

namespace
{
	/** 쓰러진 자세로 멈추는 곳: 끝에서 이만큼 앞(초). 끝에 닿으면 몽타주가 끝나 이동 동작으로 돌아가므로 그 전에 멈춘다. */
	constexpr float HoldBeforeEnd = 0.05f;
}

void UMmoAnimInstance::PlayDeath(UAnimSequenceBase* Sequence, bool bAlreadyDown)
{
	if (!Sequence)
	{
		return;
	}
	DeathMontage = PlaySlotAnimationAsDynamicMontage(Sequence, SlotName, bAlreadyDown ? 0.0f : 0.1f, 0.0f);
	if (DeathMontage && bAlreadyDown)
	{
		Montage_SetPosition(DeathMontage, DeathMontage->GetPlayLength() - HoldBeforeEnd);
	}
}

void UMmoAnimInstance::StandUp()
{
	if (DeathMontage)
	{
		Montage_Stop(0.2f, DeathMontage);
		DeathMontage = nullptr;
	}
}

void UMmoAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
	Super::NativeUpdateAnimation(DeltaSeconds);
	if (DeathMontage && Montage_IsPlaying(DeathMontage) && Montage_GetPosition(DeathMontage) >= DeathMontage->GetPlayLength() - HoldBeforeEnd)
	{
		Montage_Pause(DeathMontage);
	}
	// 온몸으로 트는 동작 중에 움직이기 시작하면 다리가 미끄러지지 않게 같은 자리부터 상체 슬롯으로 넘긴다(한 그룹이라 온몸의 것은 섞여 꺼짐).
	if (bActionFullBody && !DeathMontage && ActionMontage && ActionSequence && Speed >= StandingSpeed && Montage_IsPlaying(ActionMontage))
	{
		const float Position = Montage_GetPosition(ActionMontage);
		bActionFullBody = false;
		ActionMontage = PlaySlotAnimationAsDynamicMontage(ActionSequence, UpperSlotName, 0.15f, 0.15f, 1.0f, bActionLoop ? MAX_int32 : 1, -1.0f, Position);
	}
}
