#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "MmoEntityVisuals.generated.h"

class UAnimSequence;
class UMaterialInterface;
class UMmoAnimInstance;
class USkeletalMesh;
class UStaticMesh;

/** 표현 표의 줄 하나: (개체 종류, 키) → 메시, 애니메이션 블루프린트(대기·달리기), 공격과 피격 동작. */
USTRUCT()
struct FMmoEntityVisual
{
	GENERATED_BODY()

	/** 개체 종류(EntityKind의 값). */
	UPROPERTY(EditAnywhere)
	int32 Kind = 0;

	/** 종류 안의 키. 플레이어는 직업, 몬스터·NPC·채집물은 템플릿 번호, 바닥 아이템은 아이템 번호다(UMmoEntityVisuals::KeyOf). */
	UPROPERTY(EditAnywhere)
	int32 Key = 0;

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<USkeletalMesh> Mesh;

	/** 애니메이션 블루프린트(UMmoAnimInstance를 부모로 하는 ABP_<직업>). */
	UPROPERTY(EditAnywhere)
	TSoftClassPtr<UMmoAnimInstance> Animation;

	/** 공격 동작의 시작(AttackSwing)에 트는 동작. */
	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UAnimSequence> Attack;

	/** 피해(Damaged)를 받을 때 트는 동작. */
	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UAnimSequence> Hit;

	/** 죽음(Died)에 트고 마지막 자세로 멈추는 동작. */
	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UAnimSequence> Death;

	/** 스킬 동작의 시작(SkillUsed)에 트는 동작. 비면 Attack을 튼다. */
	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UAnimSequence> Skill;

	/** 시전(Progress) 동안 되풀이하는 동작. 비면 시전 동작이 없다. */
	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UAnimSequence> Cast;
};

/** 표에 줄이 없는 개체(와 불러오는 동안)의 자리 표시 하나: 개체 종류 → 도형과 색. */
USTRUCT()
struct FMmoPlaceholder
{
	GENERATED_BODY()

	/** 개체 종류(EntityKind의 값). */
	UPROPERTY(EditAnywhere)
	int32 Kind = 0;

	/** 엔진 기본 도형. 하드 참조라 함께 쿠킹된다. */
	UPROPERTY(EditAnywhere)
	TObjectPtr<UStaticMesh> Mesh;

	UPROPERTY(EditAnywhere)
	FLinearColor Color = FLinearColor::White;

	/** 도형의 크기 배수(엔진 도형은 1 m). 바닥에 닿게 놓는다. 서는 개체는 사람 크기(0.6, 0.6, 1.8), 바닥 아이템은 작다(33). */
	UPROPERTY(EditAnywhere)
	FVector Scale = FVector(0.6, 0.6, 1.8);
};

/**
 * 표현 표. 개체의 그림은 여기에만 두고(데이터 테이블에는 표현의 키를 두지 않음), 수치는 데이터 테이블에 둔다.
 * 메시와 애니메이션은 소프트 참조라 표를 읽어도 불러오지 않고, UMmoEntitySubsystem이 처음 보는 줄을 비동기로 불러온다.
 * 에셋은 에디터 모듈의 MmoCreateCharacterAssets 커맨드렛이 만들고 손으로 고치지 않는다. 몬스터, NPC, 채집물, 바닥 아이템의 줄은
 * 그 항목(23, 37, 47, 33)이 커맨드렛에 더한다. 엔진 없는 코드가 아니어서 protobuf 헤더를 쓰지 않는다(에디터 모듈이 include함).
 */
UCLASS()
class PORTFOLIOMMO_API UMmoEntityVisuals : public UDataAsset
{
	GENERATED_BODY()

public:
	/** 표의 경로. /Game/Characters는 늘 쿠킹한다. */
	static constexpr const TCHAR* Path = TEXT("/Game/Characters/DA_EntityVisuals.DA_EntityVisuals");

	/** 자리 표시의 재질(M_Placeholder. 색은 커스텀 프리미티브 데이터 0). */
	UPROPERTY(EditAnywhere)
	TObjectPtr<UMaterialInterface> PlaceholderMaterial;

	/** 종류마다의 자리 표시. 그림이 생기면(91) Rows에 줄을 더할 뿐 이것은 그대로 둔다. */
	UPROPERTY(EditAnywhere)
	TArray<FMmoPlaceholder> Placeholders;

	/** 무기의 종(Items의 family) → 손에 붙일 메시(34). 등급은 같은 메시다. 줄이 없는 종은 WeaponPlaceholder(가는 막대)로 그린다. */
	UPROPERTY(EditAnywhere)
	TMap<int32, TSoftObjectPtr<UStaticMesh>> Weapons;

	/** 그림이 없는 무기의 자리 표시(엔진의 원기둥을 가늘고 길게). 하드 참조라 함께 쿠킹된다. */
	UPROPERTY(EditAnywhere)
	TObjectPtr<UStaticMesh> WeaponPlaceholder;

	UPROPERTY(EditAnywhere)
	TArray<FMmoEntityVisual> Rows;

	/** (종류, 키)의 줄. 없으면 nullptr. */
	const FMmoEntityVisual* Find(int32 Kind, int32 Key) const;

	/** 종류의 자리 표시. 없으면 첫 줄, 표가 비었으면 nullptr. */
	const FMmoPlaceholder* PlaceholderOf(int32 Kind) const;

	/** 플레이어 줄의 종류와, 직업(기사, 마법사)의 키. 에디터 모듈의 생성기가 protobuf 헤더 없이 줄을 만들 때 쓴다. */
	static int32 PlayerKind();
	static int32 MonsterKind();
	static int32 NpcKind();
	static int32 GatherNodeKind();
	static int32 GroundItemKind();
	static int32 KnightKey();
	static int32 MageKey();
};
