#pragma once

#include "CoreMinimal.h"
#include "Game/MmoCues.h"
#include "GameFramework/Actor.h"

#include "MmoFxActor.generated.h"

class UStaticMeshComponent;

/**
 * 연출 표의 모양 겹(FMmoFxLayer)을 그리는 액터(104). 겹마다 메시 컴포넌트 하나이고, 틱마다 자리·크기·회전과 색·불투명도(커스텀 프리미티브
 * 데이터 0–3)를 고친다. 모든 겹이 끝나면 스스로 없어진다. 충돌과 그림자가 없다.
 */
UCLASS()
class PORTFOLIOMMO_API AMmoFxActor : public AActor
{
	GENERATED_BODY()

public:
	AMmoFxActor();

	/** 겹을 펴고 시작한다. 메시와 머티리얼을 아직 불러오지 않은 겹은 건너뛴다. Hold는 bHold인 겹이 남는 시간(초)이다. */
	void Start(const TArray<FMmoFxLayer>& Layers, float Hold);

	/** 남은 겹을 FinishSeconds 동안 흐리고 끝낸다(시전이 끝나거나 끊김). */
	void Finish();

	virtual void Tick(float DeltaSeconds) override;

	static constexpr float FinishSeconds = 0.2f;

private:
	struct FLive
	{
		FMmoFxLayer Layer;
		float Duration = 0.0f;
		TObjectPtr<UStaticMeshComponent> Mesh;
	};

	TArray<FLive> Live;
	float Age = 0.0f;
	/** Finish가 불린 때의 Age(아니면 음수). */
	float FinishedAt = -1.0f;
};
