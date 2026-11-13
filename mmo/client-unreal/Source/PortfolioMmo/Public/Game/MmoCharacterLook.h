#pragma once

#include "CoreMinimal.h"

class UBlendSpace;
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

	/** 불러온 메시와 블렌드 스페이스를 입히고 자리 표시를 감춘다. 애니메이션 블루프린트 없이 단일 노드로 블렌드 스페이스를 튼다. */
	void Apply(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, USkeletalMesh* SkeletalMesh, UBlendSpace* Locomotion);

	/** 속도(언리얼 단위/초)로 대기와 달리기를 섞는다. 0이 대기, 600(6 m/s)이 달리기다. */
	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed);

	/**
	 * 스켈레탈 메시 컴포넌트를 액터의 앞(+X)을 보는 사람 크기로 둔다. Feet는 그 컴포넌트의 부모에서 발(지면)까지다.
	 * 들여온 메시는 +Y를 보고(Unreal의 스켈레탈 메시 관례) 키가 2.72 m라 돌리고 줄인다.
	 */
	void SetUpBody(USkeletalMeshComponent& Mesh, const FVector& Feet);

	/** 자리 표시 컴포넌트를 사람 크기(지름 0.6 m, 높이 1.8 m)의 원기둥으로 둔다. Center는 그 컴포넌트에서 원기둥 가운데까지다. */
	void SetUpPlaceholder(UStaticMeshComponent& Placeholder, const FVector& Center);
}
