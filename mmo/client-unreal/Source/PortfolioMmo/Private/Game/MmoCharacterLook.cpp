#include "Game/MmoCharacterLook.h"

#include "Animation/AnimSingleNodeInstance.h"
#include "Animation/BlendSpace.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"

namespace MmoCharacterLook
{
	void ShowPlaceholder(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* PlaceholderMesh)
	{
		Placeholder.SetStaticMesh(PlaceholderMesh);
		Placeholder.SetVisibility(true);
		Mesh.SetVisibility(false);
	}

	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, UBlendSpace* Locomotion)
	{
		Mesh.SetSkeletalMesh(SkeletalMesh);
		Mesh.SetAnimationMode(EAnimationMode::AnimationSingleNode);
		Mesh.PlayAnimation(Locomotion, true);
		Mesh.SetVisibility(true);
		Placeholder.SetVisibility(false);
	}

	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed)
	{
		if (UAnimSingleNodeInstance* Instance = Mesh.GetSingleNodeInstance())
		{
			Instance->SetBlendSpacePosition(FVector(Speed, 0.0, 0.0));
		}
	}

	void SetUpPlaceholder(UStaticMeshComponent& Placeholder, const FVector& Center)
	{
		// 엔진의 원기둥은 지름 1 m, 높이 1 m이고 가운데가 원점이다.
		Placeholder.SetRelativeLocation(Center);
		Placeholder.SetRelativeScale3D(FVector(0.6, 0.6, 1.8));
		Placeholder.SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Placeholder.SetCanEverAffectNavigation(false);
		Placeholder.SetVisibility(false);
	}
}
