#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MmoEntityActor.generated.h"

class UCapsuleComponent;
class USkeletalMeshComponent;
class UStaticMeshComponent;

/**
 * 시야 안의 다른 개체 하나. UMmoEntitySubsystem이 만들고 지우고, 모습을 입히고, 프레임마다 보간한 자리에 놓고 달리는 속도를 넣는다.
 * 액터의 틱과 이동 컴포넌트는 두지 않고 충돌도 없다(서버가 개체끼리 막지 않는다). 누르기(대상 고르기)만 받는 캡슐이 Visibility 채널을 막는다.
 * 루트는 지면에 있다.
 */
UCLASS()
class AMmoEntityActor : public AActor
{
	GENERATED_BODY()

public:
	AMmoEntityActor();

	USkeletalMeshComponent& Mesh() const { return *Body; }

	UStaticMeshComponent& PlaceholderMesh() const { return *Placeholder; }

	/** 이 액터가 그리는 개체의 번호. 누른 액터에서 대상을 얻는다. */
	uint32 EntityId = 0;

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkeletalMeshComponent> Body;

	/** 커서와 터치의 누르기만 받는 캡슐(지름 0.8 m, 높이 1.8 m). */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCapsuleComponent> Pick;

	/** 모습을 불러오는 동안 보이는 단순한 메시. */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Placeholder;
};
