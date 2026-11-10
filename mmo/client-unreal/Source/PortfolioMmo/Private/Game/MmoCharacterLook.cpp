#include "Game/MmoCharacterLook.h"

#include "Animation/AnimSingleNodeInstance.h"
#include "Animation/BlendSpace1D.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"

namespace MmoCharacterLook
{
	namespace
	{
		struct FLook
		{
			const TCHAR* Mesh;
			const TCHAR* Locomotion;
		};

		const FLook& LookOf(portfolio::mmo::CharacterClass Class)
		{
			static const FLook Knight{
				TEXT("/Game/Characters/Knight/Warrior.Warrior"), TEXT("/Game/Characters/Knight/BS_Knight_Locomotion.BS_Knight_Locomotion") };
			static const FLook Mage{
				TEXT("/Game/Characters/Mage/Wizard.Wizard"), TEXT("/Game/Characters/Mage/BS_Mage_Locomotion.BS_Mage_Locomotion") };
			return Class == portfolio::mmo::CHARACTER_CLASS_MAGE ? Mage : Knight;
		}
	}

	void Apply(USkeletalMeshComponent& Mesh, portfolio::mmo::CharacterClass Class)
	{
		// 메시 하나에 수 MB라 처음 볼 때 바로 불러온다. 직업이 둘뿐이라 두 번째부터는 메모리에 있다.
		const FLook& Look = LookOf(Class);
		Mesh.SetSkeletalMesh(LoadObject<USkeletalMesh>(nullptr, Look.Mesh));
		Mesh.SetAnimationMode(EAnimationMode::AnimationSingleNode);
		Mesh.PlayAnimation(LoadObject<UBlendSpace1D>(nullptr, Look.Locomotion), true);
	}

	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed)
	{
		if (UAnimSingleNodeInstance* Instance = Mesh.GetSingleNodeInstance())
		{
			Instance->SetBlendSpacePosition(FVector(Speed, 0.0, 0.0));
		}
	}
}
