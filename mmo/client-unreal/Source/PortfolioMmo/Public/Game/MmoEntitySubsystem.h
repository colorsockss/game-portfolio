#pragma once

#include "CoreMinimal.h"
#include "Engine/StreamableManager.h"
#include "Subsystems/WorldSubsystem.h"
#include "World/CombatState.h"

#include "MmoEntitySubsystem.generated.h"

class AStaticMeshActor;
class UMmoCueSubsystem;
class UNiagaraComponent;
class UMaterialInterface;
class UMaterialInstanceDynamic;
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

	DECLARE_MULTICAST_DELEGATE_OneParam(FOnGrowthEvent, const MmoWorld::FGrowthEvent&);

	/** 성장 사건(31: 얻은 경험치, 레벨 업). 레벨 업 이펙트와 내 레벨 업 소리를 튼 뒤에 알린다(알림은 HUD가 띄움). */
	FOnGrowthEvent OnGrowthEvent;

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	/** 액터에 개체의 모습을 입힌다(불러오는 중이면 자리 표시). */
	void ShowEntity(uint32 Id, AActor& Actor, const portfolio::mmo::EntityEnter& Info);

	/** 모습을 입힌 개체에 표현 줄의 동작(공격, 피격)을 튼다. */
	void PlayAction(uint32 Id, TSoftObjectPtr<UAnimSequence> FMmoEntityVisual::* Action);

	/** 발사체(되풀이하는 이펙트)와 대상의 원, 때가 된 스킬의 맞는 연출을 그린다. */
	void DrawCombat(const MmoWorld::FWorldState& World, MmoWorld::FCombatState& Combat);

	/** 개체가 죽어 있으면 쓰러진 자세로 둔다(모습을 입히거나 불러온 뒤). */
	void ShowDeadIfDead(uint32 Id, USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, const FMmoEntityVisual* Row);

	/** 연출을 트는 곳(같은 월드). */
	UMmoCueSubsystem& Cues() const;

	/** 개체의 연출 표의 (종류, 키). 받지 않은 개체면 (0, 0)이라 그 때의 기본 줄을 쓴다. */
	TPair<int32, int32> CueKey(uint32 Id) const;

	/**
	 * 스킬 동작의 시작: 동작과 시전자의 연출(SkillCast)을 틀고, 타격까지의 시간 뒤에 맞는 연출(SkillHit)을 대상(그 자리에서 쓰면 시전자)에
	 * 튼다. 범위 스킬은 중심에 범위의 원을 잠깐 둔다.
	 */
	void ShowSkill(const MmoWorld::FCombatEvent& Event, const MmoData::FGameData& Data);

	/** 시전의 시작: 시전 동작을 되풀이하고 끝나는 틱을 둔다(그 틱이나 Interrupt에서 끊음). */
	void StartCast(const MmoWorld::FCombatEvent& Event, const MmoWorld::FWorldState& World, const MmoData::FGameData& Data);

	/** 동작을 끊는다(시전의 끝, 취소, 내 스킬의 실패). */
	void StopAction(uint32 Id);

	/** 공격·스킬 동작 동안 행위자를 대상 쪽으로 돌려 그린다. 행위자나 대상을 받지 않았거나 같은 개체면 돌리지 않는다. */
	void FaceTarget(uint32 Attacker, uint32 Target, double Now);

	/** 돌려 그리는 메시의 방향을 대상 쪽(동작 동안)이나 서버의 방향(그 뒤)으로 옮기고, 끝난 번쩍임을 걷는다. */
	void DrawFacingAndFlashes(double Now, float DeltaTime);

	/** 맞은 개체를 0.1초 번쩍인다(보이는 메시에 번쩍임 머티리얼을 덮음). */
	void FlashHit(uint32 Id, double Now);

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

	/** 발사체 번호 → 그 발사체에 붙인 이펙트. 발사체가 끝나면 풀로 돌려놓는다. */
	UPROPERTY()
	TMap<uint32, TObjectPtr<UNiagaraComponent>> ProjectileEffects;

	/** 동작 동안 대상 쪽으로 돌려 그리는 개체: 대상과 끝나는 때(초). */
	struct FFacing
	{
		uint32 Target = 0;
		double Until = 0.0;
	};
	TMap<uint32, FFacing> Facings;

	/** 메시를 서버의 방향에서 돌린 각(도). 0으로 돌아오면 지운다. 그리기만 바꾸고 액터와 보내는 Move의 방향은 그대로다. */
	TMap<uint32, float> MeshYaw;

	/** 번쩍이는 개체 → 덮은 머티리얼(파라미터 Flash를 줄임)과 끝나는 때(초). */
	UPROPERTY()
	TMap<uint32, TObjectPtr<UMaterialInstanceDynamic>> FlashMaterials;
	TMap<uint32, double> FlashUntil;

	/** 직선 발사체(서버의 번호) → 그 발사체에 붙인 이펙트. 따라가는 발사체와 번호 공간이 달라 따로 둔다. */
	UPROPERTY()
	TMap<uint32, TObjectPtr<UNiagaraComponent>> LineEffects;

	/** 타격까지의 시간 뒤에 틀 스킬의 맞는 연출: 틀 때(초), 스킬, 그 자리의 개체. */
	struct FPendingHit
	{
		double At = 0.0;
		uint32 Skill = 0;
		uint32 Anchor = 0;
	};
	TArray<FPendingHit> PendingHits;

	UPROPERTY()
	TObjectPtr<UMaterialInterface> MarkerMaterial;


	/** 범위 스킬의 원(바닥 표시)과 저마다 감출 때(초). */
	UPROPERTY()
	TArray<TObjectPtr<AStaticMeshActor>> AreaMarkers;
	TArray<double> AreaUntil;

	/** 시전 동작을 트는 개체 → 시전이 끝나는 서버 틱. */
	TMap<uint32, uint32> CastEnds;

	FStreamableManager Streamable;
};
