#pragma once

#include "CoreMinimal.h"

class UAnimSequenceBase;
class UMmoEntityVisuals;
class UMaterialInterface;
class UMmoAnimInstance;
class USkeletalMesh;
class USkeletalMeshComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * 개체 액터(내 캐릭터와 다른 개체)의 모습을 바꾸는 도우미. 무엇을 입힐지는 표현 표(UMmoEntityVisuals)가 정하고,
 * 언제 입힐지(불러오기가 끝났을 때)는 UMmoEntitySubsystem이 정한다. 액터는 스켈레탈 메시와 자리 표시 메시를 하나씩 가진다.
 */
namespace portfolio::mmo::data
{
	class ItemsRow;
}

namespace MmoCharacterLook
{
	/**
	 * 손의 무기(34). 캐릭터 팩의 메시에 구워진 무기는 그 재질 칸(MI_<직업>_Weapon)을 Hidden(투명한 재질)으로 감추고, Item이 있으면 표현 표의 무기 메시나
	 * 자리 표시 막대를 Weapon_R 뼈에 붙인다(없으면 만든다). 막대는 뼈의 축(Weapon_R → Weapon_R_end)을 따라 놓는다. Item이 없으면 맨손이다.
	 */
	void ShowWeapon(USkeletalMeshComponent& Mesh, TObjectPtr<UStaticMeshComponent>& Weapon, const portfolio::mmo::data::ItemsRow* Item, const UMmoEntityVisuals* Visuals,
		UMaterialInterface* Hidden);

	/** 자리 표시(종류마다의 도형과 색)를 보이고 스켈레탈 메시를 감춘다. 불러오는 동안과 표에 줄이 없는 개체가 이렇게 보인다. */
	void ShowPlaceholder(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* Shape, UMaterialInterface* Material, const FLinearColor& Color, const FVector& Scale);

	/** 불러온 메시와 애니메이션 블루프린트를 표현 표의 크기(Scale)로 입히고 자리 표시를 감춘다. */
	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, TSubclassOf<UMmoAnimInstance> Animation, float Scale);

	/** 속도(언리얼 단위/초)로 대기와 달리기를 섞는다. 0이 대기, 600(6 m/s)이 달리기다. */
	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed);

	/** 공격·피격 같은 동작을 한 번 튼다. 모습을 아직 입히지 않았으면(자리 표시) 아무것도 하지 않는다. */
	void PlayAction(USkeletalMeshComponent& Mesh, UAnimSequenceBase* Sequence, bool bLoop = false);

	/** 트는 동작을 끊는다(시전의 끝과 취소). */
	void StopAction(USkeletalMeshComponent& Mesh);

	/**
	 * 쓰러뜨리거나(bDead) 일으킨다. 모습을 입혔으면 죽음 동작을 마지막 자세로 멈추고(bInstant면 처음부터 그 자세), 자리 표시면 도형을 눕힌다.
	 * Death가 nullptr이면 자리 표시만 다룬다.
	 */
	void SetDead(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UAnimSequenceBase* Death, bool bDead, bool bInstant);

	/**
	 * 스켈레탈 메시 컴포넌트를 액터의 앞(+X)을 보게 둔다. Feet는 그 컴포넌트의 부모에서 발(지면)까지다.
	 * 들여온 메시는 +Y를 보므로(Unreal의 스켈레탈 메시 관례) 돌린다. 크기는 모습을 입힐 때 표현 표의 줄이 정한다(Apply).
	 */
	void SetUpBody(USkeletalMeshComponent& Mesh, const FVector& Feet);

	/** 자리 표시 컴포넌트를 사람 크기(지름 0.6 m, 높이 1.8 m)의 원기둥으로 둔다. Center는 그 컴포넌트에서 원기둥 가운데까지다. */
	void SetUpPlaceholder(UStaticMeshComponent& Placeholder, const FVector& Center);
}
