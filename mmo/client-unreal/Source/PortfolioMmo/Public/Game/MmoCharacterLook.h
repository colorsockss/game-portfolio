#pragma once

#include "CoreMinimal.h"

class UAnimSequenceBase;
class UMmoAnimInstance;
class USkeletalMesh;
class USkeletalMeshComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * 개체 액터(내 캐릭터와 다른 개체)의 모습을 바꾸는 도우미. 무엇을 입힐지는 표현 표(UMmoEntityVisuals)가 정하고,
 * 언제 입힐지(불러오기가 끝났을 때)는 UMmoEntitySubsystem이 정한다. 액터는 스켈레탈 메시와 자리 표시 메시를 하나씩 가진다.
 */
namespace MmoCharacterLook
{
	/** 자리 표시(단순한 메시)를 보이고 스켈레탈 메시를 감춘다. 불러오는 동안과 표에 줄이 없는 개체가 이렇게 보인다. */
	void ShowPlaceholder(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UStaticMesh* PlaceholderMesh);

	/** 불러온 메시와 애니메이션 블루프린트를 입히고 자리 표시를 감춘다. */
	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, TSubclassOf<UMmoAnimInstance> Animation);

	/** 속도(언리얼 단위/초)로 대기와 달리기를 섞는다. 0이 대기, 600(6 m/s)이 달리기다. */
	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed);

	/** 공격·피격 같은 동작을 한 번 튼다. 모습을 아직 입히지 않았으면(자리 표시) 아무것도 하지 않는다. */
	void PlayAction(USkeletalMeshComponent& Mesh, UAnimSequenceBase* Sequence, bool bLoop = false);

	/** 트는 동작을 끊는다(시전의 끝과 취소). */
	void StopAction(USkeletalMeshComponent& Mesh);

	/**
	 * 쓰러뜨리거나(bDead) 일으킨다. 모습을 입혔으면 죽음 동작을 마지막 자세로 멈추고(bInstant면 처음부터 그 자세), 자리 표시면 원기둥을 눕힌다.
	 * Death가 nullptr이면 자리 표시만 다룬다.
	 */
	void SetDead(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, UAnimSequenceBase* Death, bool bDead, bool bInstant);

	/**
	 * 스켈레탈 메시 컴포넌트를 액터의 앞(+X)을 보는 사람 크기로 둔다. Feet는 그 컴포넌트의 부모에서 발(지면)까지다.
	 * 들여온 메시는 +Y를 보고(Unreal의 스켈레탈 메시 관례) 키가 2.72 m라 돌리고 줄인다.
	 */
	void SetUpBody(USkeletalMeshComponent& Mesh, const FVector& Feet);

	/** 자리 표시 컴포넌트를 사람 크기(지름 0.6 m, 높이 1.8 m)의 원기둥으로 둔다. Center는 그 컴포넌트에서 원기둥 가운데까지다. */
	void SetUpPlaceholder(UStaticMeshComponent& Placeholder, const FVector& Center);
}
