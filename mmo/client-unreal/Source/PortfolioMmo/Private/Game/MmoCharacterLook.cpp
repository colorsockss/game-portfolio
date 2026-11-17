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
		const TSoftObjectPtr<UStaticMesh>* Drawn = Item && Visuals ? Visuals->Weapons.Find(static_cast<int32>(Item->family())) : nullptr;
		UStaticMesh* Shape = Drawn ? Drawn->LoadSynchronous() : nullptr;
		// 구운 무기: 들지 않았으면 감추고, 들었는데 그 종의 메시가 없으면 그대로 보인다(91: 지팡이 모델이 CC0 팩에 없어 캐릭터 팩의 무기를 씀).
		// 감춘 칸은 지금 재질로는 찾을 수 없어 메시의 원래 재질의 이름(MI_<직업>_Weapon)으로 찾는다.
		const bool bBaked = Item && !Shape;
		const USkeletalMesh* Asset = Mesh.GetSkeletalMeshAsset();
		for (int32 Index = 0; Hidden && Asset && Index < Asset->GetMaterials().Num(); ++Index)
		{
			UMaterialInterface* Original = Asset->GetMaterials()[Index].MaterialInterface;
			if (Original && Original->GetName().Contains(TEXT("Weapon")))
			{
				Mesh.SetMaterial(Index, bBaked ? Original : Hidden);
			}
		}
		if (!Shape)
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
		Weapon->SetStaticMesh(Shape);
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

	void ApplyProp(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* Prop, float Scale)
	{
		Mesh.SetVisibility(false);
		Placeholder.SetStaticMesh(Prop);
		// 자리 표시의 머티리얼을 걷어 내 원본의 머티리얼(M_EntityProp의 인스턴스)로 그린다. 원점이 바닥의 가운데다.
		Placeholder.EmptyOverrideMaterials();
		Placeholder.SetRelativeLocationAndRotation(FVector::ZeroVector, FRotator::ZeroRotator);
		Placeholder.SetRelativeScale3D(FVector(Scale));
		Placeholder.SetVisibility(true);
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
