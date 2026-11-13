#pragma once

#include "CoreMinimal.h"
#include "Engine/StreamableManager.h"
#include "Subsystems/WorldSubsystem.h"

#include "MmoEntitySubsystem.generated.h"

class UMmoEntityVisuals;

namespace portfolio::mmo
{
	class EntityEnter;
}

/**
 * 월드 모델(FWorldState)의 개체를 액터로 그린다. 프레임마다 나간 개체의 액터를 지우고, 들어온 개체의 액터를 만들고,
 * 다른 개체의 액터를 보간한 자리(RenderTick)에 놓는다. 내 개체는 AMmoCharacter로 만들어 플레이어 컨트롤러에 붙이고 자리는 건드리지 않는다.
 * 액터마다 틱을 돌리지 않고 여기서 한 번에 갱신한다.
 * 모습은 표현 표(UMmoEntityVisuals)의 (종류, 키) 줄이다. 처음 보는 줄은 비동기로 불러오고 그동안 자리 표시 메시를 보이며,
 * 다 불러오기 전에 개체가 나갔으면 결과를 버린다. 한 번 불러온 줄은 메모리에 남아 다음 개체에는 바로 입힌다.
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
	/** 액터에 개체의 모습을 입힌다(불러오는 중이면 자리 표시). */
	void ShowEntity(uint32 Id, AActor& Actor, const portfolio::mmo::EntityEnter& Info);

	/** 개체 번호 → 그 개체의 액터(내 캐릭터 포함). */
	UPROPERTY()
	TMap<uint32, TObjectPtr<AActor>> Actors;

	/** 표현 표. 처음 개체를 그릴 때 읽는다(소프트 참조만 있어 작음). */
	UPROPERTY()
	TObjectPtr<UMmoEntityVisuals> Visuals;

	FStreamableManager Streamable;
};
