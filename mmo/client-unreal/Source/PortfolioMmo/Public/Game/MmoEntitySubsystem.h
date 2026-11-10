#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"

#include "MmoEntitySubsystem.generated.h"

/**
 * 월드 모델(FWorldState)의 개체를 액터로 그린다. 프레임마다 나간 개체의 액터를 지우고, 들어온 개체의 액터를 만들고,
 * 다른 개체의 액터를 보간한 자리(RenderTick)에 놓는다. 내 개체는 AMmoCharacter로 만들어 플레이어 컨트롤러에 붙이고 자리는 건드리지 않는다.
 * 액터마다 틱을 돌리지 않고 여기서 한 번에 갱신한다.
 */
UCLASS()
class UMmoEntitySubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

	/** 개체 번호의 액터(내 캐릭터 포함). 아직 만들지 않았으면 nullptr. */
	AActor* FindActor(uint32 Id) const { return Actors.FindRef(Id); }

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	/** 개체 번호 → 그 개체의 액터(내 캐릭터 포함). */
	UPROPERTY()
	TMap<uint32, TObjectPtr<AActor>> Actors;
};
