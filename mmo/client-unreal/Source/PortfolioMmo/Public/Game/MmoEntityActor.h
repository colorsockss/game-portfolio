#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Protocol/MmoPackets.h"

#include "MmoEntityActor.generated.h"

class USkeletalMeshComponent;

/**
 * 시야 안의 다른 개체 하나. UMmoEntitySubsystem이 만들고 지우고, 프레임마다 보간한 자리에 놓고 달리는 속도를 넣는다.
 * 액터의 틱과 이동 컴포넌트는 두지 않고 충돌도 없다(서버가 개체끼리 막지 않는다). 루트는 지면에 있다.
 */
UCLASS()
class AMmoEntityActor : public AActor
{
	GENERATED_BODY()

public:
	AMmoEntityActor();

	/** 직업의 모습을 입힌다. 만든 뒤 한 번 부른다. */
	void SetClass(portfolio::mmo::CharacterClass Class);

	USkeletalMeshComponent& Mesh() const { return *Body; }

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USkeletalMeshComponent> Body;
};
