#include "Game/MmoAnimInstance.h"

#include "Animation/AnimSequenceBase.h"

const FName UMmoAnimInstance::SlotName(TEXT("DefaultSlot"));

void UMmoAnimInstance::PlayAction(UAnimSequenceBase* Sequence)
{
	if (Sequence)
	{
		PlaySlotAnimationAsDynamicMontage(Sequence, SlotName, 0.1f, 0.15f);
	}
}
