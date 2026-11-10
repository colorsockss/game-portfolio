#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MmoEntityActor.generated.h"

/**
 * 시야 안의 다른 개체 하나. UMmoEntitySubsystem이 만들고 지우고, 프레임마다 보간한 자리에 놓는다.
 * 액터의 틱과 이동 컴포넌트는 두지 않고 충돌도 없다(서버가 개체끼리 막지 않는다). 루트는 지면에 있다.
 */
UCLASS()
class AMmoEntityActor : public AActor
{
	GENERATED_BODY()

public:
	AMmoEntityActor();

	/**
	 * shortcut: 메시가 들어오기 전(backlog 14)의 자리 표시용 몸통(원기둥)과 앞을 보이는 코. 내 캐릭터도 쓴다. 14에서 스켈레탈 메시로 바꾼다.
	 * Owner의 생성자에서만 부른다. Parent는 몸통 아래쪽이 지면에 닿는 자리다.
	 */
	static void AddPlaceholderBody(AActor& Owner, USceneComponent& Parent);

	/** 자리 표시용 몸통의 색. 동적 머티리얼을 만들므로 BeginPlay에서 부른다. */
	static void TintPlaceholderBody(AActor& Owner, const FLinearColor& Color);

protected:
	virtual void BeginPlay() override;
};
