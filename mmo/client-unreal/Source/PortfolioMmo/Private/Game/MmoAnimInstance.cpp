#include "Game/MmoAnimInstance.h"

#include "Animation/AnimMontage.h"
#include "Animation/AnimSequenceBase.h"

const FName UMmoAnimInstance::SlotName(TEXT("DefaultSlot"));

void UMmoAnimInstance::PlayAction(UAnimSequenceBase* Sequence)
{
	if (Sequence)
	{
		PlaySlotAnimationAsDynamicMontage(Sequence, SlotName, 0.1f, 0.15f);
	}
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
}
