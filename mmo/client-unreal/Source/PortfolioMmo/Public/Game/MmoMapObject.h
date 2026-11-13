#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MmoMapObject.generated.h"

class UBoxComponent;
class UStaticMeshComponent;

/** 맵에 놓인 것의 종류 한 줄(MapObjectKinds. 맵 생성기가 낸 Map.tsv의 kind 줄). 놓을 때 읽은 값을 액터가 그대로 가진다. */
USTRUCT()
struct PORTFOLIOMMO_API FMmoMapObjectKind
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere)
	int32 Id = 0;

	/** 방향 0일 때 차지하는 x 칸 수(m). */
	UPROPERTY(VisibleAnywhere)
	int32 Width = 1;

	/** 방향 0일 때 차지하는 z 칸 수(m). */
	UPROPERTY(VisibleAnywhere)
	int32 Depth = 1;

	/** 걷기와 선을 막는지. 끄면 막지 않는 장식이다. */
	UPROPERTY(VisibleAnywhere)
	bool bBlocks = false;

	/** 카메라를 막는지(건물과 테두리의 산). */
	UPROPERTY(VisibleAnywhere)
	bool bBlocksCamera = false;

	/** 메시를 고르는 키. /Game/Environment/<키>의 스태틱 메시이고, 없으면 에디터 도구가 자리 표시 도형을 입힌다. */
	UPROPERTY(VisibleAnywhere)
	FString MeshKey;
};

/**
 * 맵에 놓인 것 하나(건물, 나무, 바위, 울타리, 산, 장식). 에디터 모듈의 MmoBuildMap이 놓인 것의 목록(Map.tsv)에서 Field 레벨에 놓고,
 * 에디터에서 옮긴 배치는 MmoExportMap이 원본(mmo/data/MapObjects.tsv)으로 내보낸다. 액터의 자리는 차지하는 사각형의 가운데이고
 * yaw가 방향(0·90·180·270도)이다. 막는 종류만 차지하는 칸의 경계 그대로인 충돌 상자를 가지고(서버의 막힌 칸과 같음. 캡슐의 중심이
 * 반지름만큼 떨어져 서버보다 엄격함), 메시 자체의 충돌은 끈다. 상자는 폰을 막고, 카메라를 막는 종류만 카메라(스프링 암)를 막는다.
 */
UCLASS()
class PORTFOLIOMMO_API AMmoMapObject : public AActor
{
	GENERATED_BODY()

public:
	AMmoMapObject();

	/** 종류와 놓인 줄(작은 모서리 x, z(m), 방향(도))로 자리, 방향, 충돌 상자를 맞춘다. 메시는 부르는 쪽이 고른다. */
	void Place(const FMmoMapObjectKind& InKind, int32 X, int32 Z, int32 Rotation);

	/**
	 * 지금의 자리와 방향을 놓인 줄로 읽는다(에디터에서 옮긴 뒤 내보낼 때). 방향이 90도의 배수가 아니거나 작은 모서리가 정수 미터가
	 * 아니면 Error에 까닭을 담고 false다.
	 */
	bool ReadPlacement(int32& X, int32& Z, int32& Rotation, FString& Error) const;

	const FMmoMapObjectKind& Kind() const { return KindRow; }
	UStaticMeshComponent& Mesh() const { return *MeshComponent; }

	/** 충돌 상자의 높이(m). 캡슐(1.8 m)보다 높고, 카메라를 막는 종류는 카메라가 넘어가지 않게 더 높다. */
	static constexpr double BlockHeight = 4.0;
	static constexpr double CameraBlockHeight = 30.0;

private:
	UPROPERTY(VisibleAnywhere)
	FMmoMapObjectKind KindRow;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> MeshComponent;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UBoxComponent> Collision;
};
