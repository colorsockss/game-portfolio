#include "Game/MmoCharacterLook.h"

#include "Game/MmoAnimInstance.h"
#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Data/MmoDataTables.h"
#include "Game/MmoEntityVisuals.h"
#include "Materials/MaterialInterface.h"
#include "Protocol/MmoPackets.h"

namespace MmoCharacterLook
{
	void ShowWeapon(USkeletalMeshComponent& Mesh, TObjectPtr<UStaticMeshComponent>& Weapon, const portfolio::mmo::data::ItemsRow* Item, const UMmoEntityVisuals* Visuals,
		UMaterialInterface* Hidden)
	{
		for (int32 Index = 0; Hidden && Index < Mesh.GetNumMaterials(); ++Index)
		{
			const UMaterialInterface* Material = Mesh.GetMaterial(Index);
			if (Material && Material != Hidden && Material->GetName().Contains(TEXT("Weapon")))
			{
				Mesh.SetMaterial(Index, Hidden);
			}
		}
		if (!Item)
		{
			if (Weapon)
			{
				Weapon->SetVisibility(false);
			}
			return;
		}
		if (!Weapon)
		{
			Weapon = NewObject<UStaticMeshComponent>(Mesh.GetOwner());
			Weapon->SetCollisionEnabled(ECollisionEnabled::NoCollision);
			Weapon->SetCastShadow(false);
			Weapon->RegisterComponent();
			Weapon->AttachToComponent(&Mesh, FAttachmentTransformRules::SnapToTargetNotIncludingScale, TEXT("Weapon_R"));
			// 팩의 뼈는 크기가 커서(FBX의 단위) 무기의 크기는 뼈와 상관없이 정한다.
			Weapon->SetUsingAbsoluteScale(true);
		}
		const TSoftObjectPtr<UStaticMesh>* Drawn = Visuals ? Visuals->Weapons.Find(static_cast<int32>(Item->family())) : nullptr;
		UStaticMesh* Shape = Drawn ? Drawn->LoadSynchronous() : nullptr;
		Weapon->SetStaticMesh(Shape ? Shape : (Visuals ? Visuals->WeaponPlaceholder.Get() : nullptr));
		if (!Shape)
		{
			// 자리 표시: 0.9 m 막대(검은 은색, 지팡이는 갈색)를 뼈의 축을 따라 손에서 앞으로 놓는다. 위치는 뼈의 크기로 곱해지므로 그만큼 나눈다.
			const FTransform Bone = Mesh.GetSocketTransform(TEXT("Weapon_R"));
			FVector Axis = Bone.InverseTransformPositionNoScale(Mesh.GetSocketLocation(TEXT("Weapon_R_end"))).GetSafeNormal();
			Axis = Axis.IsNearlyZero() ? FVector::YAxisVector : Axis;
			const double BoneScale = FMath::Max(Bone.GetScale3D().GetAbsMax(), UE_KINDA_SMALL_NUMBER);
			Weapon->SetRelativeRotation(FRotationMatrix::MakeFromZ(Axis).Rotator());
			Weapon->SetRelativeLocation(Axis * (45.0 / BoneScale));
			Weapon->SetWorldScale3D(FVector(0.05, 0.05, 0.9));
			Weapon->SetMaterial(0, Visuals ? Visuals->PlaceholderMaterial.Get() : nullptr);
			const bool bStaff = Item->has_class_() && Item->class_() == portfolio::mmo::CHARACTER_CLASS_MAGE;
			const FLinearColor Color = bStaff ? FLinearColor(0.5f, 0.33f, 0.15f) : FLinearColor(0.8f, 0.8f, 0.85f);
			Weapon->SetCustomPrimitiveDataVector4(0, FVector4(Color.R, Color.G, Color.B, 1.0));
		}
		Weapon->SetVisibility(true);
	}

	void ShowPlaceholder(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* Shape, UMaterialInterface* Material, const FLinearColor& Color, const FVector& Scale)
	{
		// 바닥(가운데 − 높이의 반)을 그대로 두고 크기를 바꾼다(엔진 도형은 높이 1 m, 가운데가 원점).
		const double Bottom = Placeholder.GetRelativeLocation().Z - Placeholder.GetRelativeScale3D().Z * 50.0;
		Placeholder.SetRelativeScale3D(Scale);
		Placeholder.SetRelativeLocation(FVector(0.0, 0.0, Bottom + Scale.Z * 50.0));
		Placeholder.SetStaticMesh(Shape);
		Placeholder.SetMaterial(0, Material);
		Placeholder.SetCustomPrimitiveDataVector4(0, FVector4(Color.R, Color.G, Color.B, 1.0));
		Placeholder.SetVisibility(true);
		Mesh.SetVisibility(false);
	}

	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, TSubclassOf<UMmoAnimInstance> Animation, float Scale)
	{
		Mesh.SetRelativeScale3D(FVector(Scale));
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
		Mesh.SetRelativeLocationAndRotation(Feet, FRotator(0.0, -90.0, 0.0));
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
