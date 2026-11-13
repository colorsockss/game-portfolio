#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "MmoEntityVisuals.generated.h"

class UBlendSpace;
class USkeletalMesh;
class UStaticMesh;

/** 표현 표의 줄 하나: (개체 종류, 키) → 메시와 대기·달리기 블렌드 스페이스. */
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

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UBlendSpace> Locomotion;
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

	/** 불러오는 동안과 표에 줄이 없는 개체가 보이는 단순한 메시(엔진의 원기둥). 하드 참조라 함께 쿠킹된다. */
	UPROPERTY(EditAnywhere)
	TObjectPtr<UStaticMesh> Placeholder;

	UPROPERTY(EditAnywhere)
	TArray<FMmoEntityVisual> Rows;

	/** (종류, 키)의 줄. 없으면 nullptr. */
	const FMmoEntityVisual* Find(int32 Kind, int32 Key) const;

	/** 플레이어 줄의 종류와, 직업(기사, 마법사)의 키. 에디터 모듈의 생성기가 protobuf 헤더 없이 줄을 만들 때 쓴다. */
	static int32 PlayerKind();
	static int32 KnightKey();
	static int32 MageKey();
};
