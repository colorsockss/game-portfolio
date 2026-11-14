#pragma once

#include "CoreMinimal.h"
#include "Engine/StreamableManager.h"
#include "Subsystems/WorldSubsystem.h"
#include "World/CombatState.h"

#include "MmoEntitySubsystem.generated.h"

class AStaticMeshActor;
class UMaterialInterface;
class USkeletalMeshComponent;
class UStaticMeshComponent;
class UMmoEntityVisuals;
struct FMmoEntityVisual;

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
 * 전투 모델(FCombatState)의 사건을 받은 순서대로 꺼내 공격·피격 동작을 틀고 OnCombatEvent로 알린다(피해 숫자는 이름표 층이 그림).
 * 따라가는 발사체와 내 대상의 발밑 원을 자리 표시(색을 입힌 엔진의 구와 원기둥)로 그린다. 이펙트로 바꾸는 것은 backlog 27이다.
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

	DECLARE_MULTICAST_DELEGATE_OneParam(FOnCombatEvent, const MmoWorld::FCombatEvent&);

	/** 전투 사건(받은 순서). 동작을 튼 뒤에 알린다. */
	FOnCombatEvent OnCombatEvent;

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	/** 액터에 개체의 모습을 입힌다(불러오는 중이면 자리 표시). */
	void ShowEntity(uint32 Id, AActor& Actor, const portfolio::mmo::EntityEnter& Info);

	/** 모습을 입힌 개체에 표현 줄의 동작(공격, 피격)을 튼다. */
	void PlayAction(uint32 Id, TSoftObjectPtr<UAnimSequence> FMmoEntityVisual::* Action);

	/** 발사체와 대상의 원을 그린다. */
	void DrawCombat(const MmoWorld::FWorldState& World, MmoWorld::FCombatState& Combat);

	/** 개체가 죽어 있으면 쓰러진 자세로 둔다(모습을 입히거나 불러온 뒤). */
	void ShowDeadIfDead(uint32 Id, USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, const FMmoEntityVisual* Row);

	/** 부활한 액터에 잠깐 부활의 자리 표시를 보인다. */
	void ShowRevive(const AActor& Actor);

	/** 스킬 동작의 시작: 동작을 틀고, 범위 스킬은 중심에 범위의 원을, 나머지는 대상(그 자리에서 쓰면 시전자)에 이펙트의 자리 표시를 잠깐 둔다. */
	void ShowSkill(const MmoWorld::FCombatEvent& Event, const MmoData::FGameData& Data);

	/** 시전의 시작: 시전 동작을 되풀이하고 끝나는 틱을 둔다(그 틱이나 Interrupt에서 끊음). */
	void StartCast(const MmoWorld::FCombatEvent& Event, const MmoWorld::FWorldState& World, const MmoData::FGameData& Data);

	/** 동작을 끊는다(시전의 끝, 취소, 내 스킬의 실패). */
	void StopAction(uint32 Id);

	/** 풀에서 감춰진 자리 표시를 꺼내(없으면 만듦) Seconds 동안 보인다. */
	void Flash(TArray<TObjectPtr<AStaticMeshActor>>& Pool, TArray<double>& Until, const TCHAR* Shape, const FLinearColor& Color, const FVector& Location, const FVector& Scale, double Seconds);

	/** 자리 표시 액터 하나(엔진의 기본 도형, 색은 커스텀 프리미티브 데이터). */
	AStaticMeshActor* SpawnMarker(const TCHAR* Shape, const FVector& Scale, const FLinearColor& Color);

	/** 개체 번호 → 그 개체의 액터(내 캐릭터 포함). */
	UPROPERTY()
	TMap<uint32, TObjectPtr<AActor>> Actors;

	/** 표현 표. 처음 개체를 그릴 때 읽는다(소프트 참조만 있어 작음). */
	UPROPERTY()
	TObjectPtr<UMmoEntityVisuals> Visuals;

	/** 모습을 입힌 개체 → 그 표현 줄(Visuals의 줄을 가리킴). */
	TMap<uint32, const FMmoEntityVisual*> Looks;

	UPROPERTY()
	TObjectPtr<AStaticMeshActor> TargetMarker;

	/** 발사체의 자리 표시. 모자라면 늘리고 남으면 감춰 다시 쓴다. */
	UPROPERTY()
	TArray<TObjectPtr<AStaticMeshActor>> ProjectileMarkers;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> MarkerMaterial;

	UPROPERTY()
	TObjectPtr<AStaticMeshActor> ReviveMarker;
	double ReviveMarkerUntil = 0.0;

	/** 범위 스킬의 원과 스킬 이펙트의 자리 표시(27 전), 그리고 저마다 감출 때(초). */
	UPROPERTY()
	TArray<TObjectPtr<AStaticMeshActor>> AreaMarkers;
	TArray<double> AreaUntil;
	UPROPERTY()
	TArray<TObjectPtr<AStaticMeshActor>> SkillMarkers;
	TArray<double> SkillUntil;

	/** 시전 동작을 트는 개체 → 시전이 끝나는 서버 틱. */
	TMap<uint32, uint32> CastEnds;

	FStreamableManager Streamable;
};
