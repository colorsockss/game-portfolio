#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"

#include "MmoTerrain.generated.h"

/**
 * 땅의 높낮이(106). 에디터의 MmoBuildMap이 맵 데이터에서 높이의 격자를 만들어 이 액터에 넣고 그 격자로 땅의 메시(조각마다 스태틱 메시)를
 * 만들어 붙인다. 게임의 규칙(서버)은 평면 그대로이고 높이는 겉모습뿐이라, 클라이언트가 개체를 땅 위에 세울 때(MmoCoordinates::ToWorld) 이 높이를 쓴다.
 * 격자의 칸은 메시와 같은 대각선(작은 모서리 → 큰 모서리)으로 나눈 두 삼각형이라 HeightAt이 메시의 표면과 같다.
 */
UCLASS()
class PORTFOLIOMMO_API AMmoTerrain : public AActor
{
	GENERATED_BODY()

public:
	AMmoTerrain();

	/** 높이의 격자를 바꾼다(에디터). Origin은 첫 점의 (X, Y)(cm), Spacing은 점 사이(cm), Heights는 X가 행인 CountX × CountY개(cm). */
	void SetHeights(const FVector2D& InOrigin, float InSpacing, int32 InCountX, int32 InCountY, TArray<float> InHeights);

	/** 월드의 (X, Y)(cm)에서 땅의 높이(cm). 격자 밖은 0이다. */
	double HeightAt(double X, double Y) const;

	/** 월드의 (X, Y)(cm)에서 땅의 위쪽 노멀. */
	FVector NormalAt(double X, double Y) const;

	/** 지금 게임 월드의 땅(없으면 높이 0, 노멀 위). 개체의 자리(MmoCoordinates)와 땅을 누른 자리가 쓴다. */
	static double GroundZ(double X, double Y);
	static FVector GroundNormal(double X, double Y);

	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type Reason) override;

private:
	UPROPERTY()
	FVector2D Origin = FVector2D::ZeroVector;

	UPROPERTY()
	float Spacing = 100.0f;

	UPROPERTY()
	int32 CountX = 0;

	UPROPERTY()
	int32 CountY = 0;

	UPROPERTY()
	TArray<float> Heights;

	/** 게임 월드에서 시작한 땅(맵이 하나라 하나). */
	static TWeakObjectPtr<const AMmoTerrain> Current;
};
