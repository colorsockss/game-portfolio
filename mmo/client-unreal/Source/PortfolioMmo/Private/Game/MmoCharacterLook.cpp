#include "Game/MmoCharacterLook.h"

#include "Game/MmoAnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"

namespace MmoCharacterLook
{
	void ShowPlaceholder(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* Shape, UMaterialInterface* Material, const FLinearColor& Color)
	{
		Placeholder.SetStaticMesh(Shape);
		Placeholder.SetMaterial(0, Material);
		Placeholder.SetCustomPrimitiveDataVector4(0, FVector4(Color.R, Color.G, Color.B, 1.0));
		Placeholder.SetVisibility(true);
		Mesh.SetVisibility(false);
	}

	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, TSubclassOf<UMmoAnimInstance> Animation)
	{
		Mesh.SetSkeletalMesh(SkeletalMesh);
		Mesh.SetAnimationMode(EAnimationMode::AnimationBlueprint);
		Mesh.SetAnimInstanceClass(Animation);
		Mesh.SetVisibility(true);
		Placeholder.SetVisibility(false);
	}

	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed)
	{
		if (UMmoAnimInstance* Instance = Cast<UMmoAnimInstance>(Mesh.GetAnimInstance()))
		{
			Instance->Speed = static_cast<float>(Speed);
		}
	}

	void PlayAction(USkeletalMeshComponent& Mesh, UAnimSequenceBase* Sequence, bool bLoop)
	{
		if (UMmoAnimInstance* Instance = Cast<UMmoAnimInstance>(Mesh.GetAnimInstance()))
		{
			Instance->PlayAction(Sequence, bLoop);
		}
	}

	void StopAction(USkeletalMeshComponent& Mesh)
	{
		if (UMmoAnimInstance* Instance = Cast<UMmoAnimInstance>(Mesh.GetAnimInstance()))
		{
			Instance->StopAction();
		}
	}

	void SetDead(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UAnimSequenceBase* Death, bool bDead, bool bInstant)
	{
		// 자리 표시의 원기둥(높이 1.8 m, 가운데가 0.9 m 위)은 옆으로 눕혀 땅에 둔다.
		Placeholder.SetRelativeRotation(bDead ? FRotator(90.0, 0.0, 0.0) : FRotator::ZeroRotator);
		Placeholder.SetRelativeLocation(FVector(0.0, 0.0, bDead ? 30.0 : 90.0));
		if (UMmoAnimInstance* Instance = Cast<UMmoAnimInstance>(Mesh.GetAnimInstance()))
		{
			if (bDead)
			{
				Instance->PlayDeath(Death, bInstant);
			}
			else
			{
				Instance->StandUp();
			}
		}
	}

	void SetUpBody(USkeletalMeshComponent& Mesh, const FVector& Feet)
	{
		// Quaternius 캐릭터의 바인드 포즈에서 발바닥(0)부터 머리 끝까지가 272 단위다. 자리 표시와 캡슐에 맞춰 1.8 m로 줄인다.
		// shortcut: 모든 모델이 같은 뼈대라 한 값이다. 키가 다른 모델이 오면 표현 표의 줄에 크기를 둔다.
		constexpr double Scale = 180.0 / 272.0;
		Mesh.SetRelativeLocationAndRotation(Feet, FRotator(0.0, -90.0, 0.0));
		Mesh.SetRelativeScale3D(FVector(Scale));
		Mesh.SetCollisionEnabled(ECollisionEnabled::NoCollision);
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
