#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "MmoCues.generated.h"

class UMaterialInterface;
class UNiagaraSystem;
class UStaticMesh;
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
	/** 레벨이 오름(그 개체에 붙는 이펙트. 남의 것도 보임). 31. */
	LevelUp,
	/** 내 레벨이 오름(UI의 소리). 31. */
	UiLevelUp,
	/** 바닥 아이템을 주움(UI의 소리. 까닭이 줍기인 얻음 사건). 33. */
	UiPickUp,
	/** 강화에 성공함(UI의 소리. 35). */
	UiEnchantSuccess,
	/** 강화에 실패해 장비가 사라짐(UI의 소리. 35). */
	UiEnchantFailure,
	/** 필드 보스가 나타남(UI의 소리. 43). */
	UiBossAppeared,
	/** 시전 시간이 있는 스킬의 시전이 시작됨(시전자에 붙고, 시전이 끝나거나 끊기면 사라짐). 키는 스킬 번호. 104. */
	SkillCharge,
};

/**
 * 이펙트의 모양 한 겹(104). 엔진 기본 도형(1 m의 판이나 구) 하나에 가산 머티리얼(M_Fx의 인스턴스: 그림, 흐르는 속도, 가장자리 흐림)을
 * 입혀 시간에 따라 옮기고 키우고 돌리고 흐린다. 색(1을 넘으면 블룸으로 번짐)과 불투명도는 커스텀 프리미티브 데이터 0–3이라 같은 머티리얼을
 * 스킬마다 다른 색으로 쓴다. 자리와 방향은 연출의 자리(개체의 가슴, 땅은 Z −98)와 방향(시전자가 대상을 보는 쪽)에 대한 것이다.
 */
USTRUCT()
struct FMmoFxLayer
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UStaticMesh> Mesh;

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UMaterialInterface> Material;

	/** 색(HDR). */
	UPROPERTY(EditAnywhere)
	FLinearColor Color = FLinearColor::White;

	/** 처음과 끝의 자리(cm). 시간의 제곱으로 옮긴다(떨어지는 운석). */
	UPROPERTY(EditAnywhere)
	FVector From = FVector::ZeroVector;

	UPROPERTY(EditAnywhere)
	FVector To = FVector::ZeroVector;

	UPROPERTY(EditAnywhere)
	FRotator Rotation = FRotator::ZeroRotator;

	/** 처음과 끝의 크기(m. 엔진 도형이 1 m). 처음에 빨리 커진다. */
	UPROPERTY(EditAnywhere)
	FVector StartScale = FVector::OneVector;

	UPROPERTY(EditAnywhere)
	FVector EndScale = FVector::OneVector;

	/** 연출이 나고 이 겹이 나타나기까지(초). */
	UPROPERTY(EditAnywhere)
	float Delay = 0.0f;

	UPROPERTY(EditAnywhere)
	float Duration = 0.5f;

	/** 나타나고 사라지는 시간(초). */
	UPROPERTY(EditAnywhere)
	float FadeIn = 0.05f;

	UPROPERTY(EditAnywhere)
	float FadeOut = 0.3f;

	/** 위(Z) 축으로 도는 속도(도/초). */
	UPROPERTY(EditAnywhere)
	float Spin = 0.0f;

	/** 시전 동안 남는다(시전의 연출. 남는 시간은 시전 시간이 정하고 Duration은 그보다 짧으면 무시). */
	UPROPERTY(EditAnywhere)
	bool bHold = false;
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

	/** 모양의 겹(104. 스킬마다 다른 고리, 기둥, 방패, 베기). Niagara 이펙트와 함께 난다. */
	UPROPERTY(EditAnywhere)
	TArray<FMmoFxLayer> Layers;
};

/**
 * 연출 표(이펙트와 소리). 표현 표(UMmoEntityVisuals)처럼 그림과 소리는 여기에만 두고 데이터 테이블에는 키를 두지 않는다.
 * 소프트 참조라 표를 읽어도 불러오지 않고, UMmoCueSubsystem이 표를 처음 읽을 때(배경음은 처음 쓰일 때) 비동기로 불러온다. 에셋은 에디터 모듈의
 * MmoCreateEffectAssets 커맨드렛이 만든다(그림과 소리의 출처는 mmo/docs/art.md).
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
