#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "MmoCues.generated.h"

class UMaterialInterface;
class UNiagaraSystem;
class USoundBase;
class USoundClass;

/** 연출이 나는 때. 줄을 더하는 것은 그 연출을 쓰는 항목이다(레벨 업 31, 줍기 33, 강화 35, 보스 등장 43). */
UENUM()
enum class EMmoCue : uint8
{
	/** 기본 공격의 타격(피해). 키는 공격자(직업, 몬스터 템플릿). */
	Hit,
	/** 대상을 따라가는 발사체(날아가는 동안 되풀이). 키는 공격자. */
	Projectile,
	/** 스킬 동작의 시작(시전자에 붙음). 키는 스킬 번호. */
	SkillCast,
	/** 스킬이 맞는 때(대상이나 범위의 중심). 키는 스킬 번호. */
	SkillHit,
	/** 부활. */
	Revive,
	/** 발소리. 키는 개체(직업, 몬스터 템플릿). */
	Footstep,
	/** 버튼을 누름(UI). */
	UiClick,
	/** 창이나 팝업이 열림(UI). */
	UiWindow,
	/** 구역의 배경음(되풀이). 키는 구역의 종류(ZoneKind의 값). */
	Music,
};

/** 연출 표의 줄 하나: (때, 개체 종류, 키) → 이펙트와 소리. 둘 다 비어도 된다. */
USTRUCT()
struct FMmoCueRow
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere)
	EMmoCue Cue = EMmoCue::Hit;

	/** 개체 종류(EntityKind의 값). 개체와 상관없는 줄(스킬, UI, 배경음)은 0. */
	UPROPERTY(EditAnywhere)
	int32 Kind = 0;

	/** 종류 안의 키(UMmoEntityVisuals::KeyOf와 같음, 스킬은 스킬 번호, 배경음은 구역의 종류). 0이면 그 종류의 기본 줄이다. */
	UPROPERTY(EditAnywhere)
	int32 Key = 0;

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UNiagaraSystem> Effect;

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<USoundBase> Sound;
};

/**
 * 연출 표(이펙트와 소리). 표현 표(UMmoEntityVisuals)처럼 그림과 소리는 여기에만 두고 데이터 테이블에는 키를 두지 않는다.
 * 소프트 참조라 표를 읽어도 불러오지 않고, UMmoCueSubsystem이 처음 쓰일 때 비동기로 불러온다. 에셋은 에디터 모듈의
 * MmoCreateEffectAssets 커맨드렛이 만든다. 지금의 이펙트와 소리는 자리 표시이고 그림과 소리 파일은 91이 채운다.
 */
UCLASS()
class PORTFOLIOMMO_API UMmoCues : public UDataAsset
{
	GENERATED_BODY()

public:
	/** 표의 경로. /Game/Effects는 늘 쿠킹한다. */
	static constexpr const TCHAR* Path = TEXT("/Game/Effects/DA_Cues.DA_Cues");

	/** 소리의 두 묶음. 묶음마다 크기를 정한다(설정 창의 줄은 77). */
	UPROPERTY(EditAnywhere)
	TObjectPtr<USoundClass> EffectsClass;

	UPROPERTY(EditAnywhere)
	TObjectPtr<USoundClass> MusicClass;

	/** 맞은 개체에 0.1초 덮는 머티리얼(오버레이). 스칼라 파라미터 Flash(0–1)가 불투명도다. */
	UPROPERTY(EditAnywhere)
	TObjectPtr<UMaterialInterface> HitFlash;

	UPROPERTY(EditAnywhere)
	TArray<FMmoCueRow> Rows;

	/** (때, 종류, 키)의 줄. 없으면 (때, 종류, 0), 그것도 없으면 (때, 0, 0)이고, 모두 없으면 nullptr. */
	const FMmoCueRow* Find(EMmoCue Cue, int32 Kind, int32 Key) const;
};
