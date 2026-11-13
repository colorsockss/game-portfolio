#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MmoEntityActor.generated.h"

class USkeletalMeshComponent;
class UStaticMeshComponent;

/**
 * 시야 안의 다른 개체 하나. UMmoEntitySubsystem이 만들고 지우고, 모습을 입히고, 프레임마다 보간한 자리에 놓고 달리는 속도를 넣는다.
 * 액터의 틱과 이동 컴포넌트는 두지 않고 충돌도 없다(서버가 개체끼리 막지 않는다). 루트는 지면에 있다.
 */
UCLASS()
class AMmoEntityActor : public AActor
{
	GENERATED_BODY()

public:
	AMmoEntityActor();

	USkeletalMeshComponent& Mesh() const { return *Body; }

	UStaticMeshComponent& PlaceholderMesh() const { return *Placeholder; }

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkeletalMeshComponent> Body;

	/** 모습을 불러오는 동안 보이는 단순한 메시. */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Placeholder;
};
