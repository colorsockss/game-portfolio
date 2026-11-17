#pragma once

#include "CoreMinimal.h"

class UMaterialInterface;
class UStaticMesh;

/** 코드로 정한 삼각형으로 스태틱 메시 에셋을 만든다(휘두름의 호 105, 땅 106). */
namespace MmoMeshBuilder
{
	/**
	 * 점(cm)과 UV(점마다 하나), 삼각형(점 번호 셋씩. 위에서 볼 때 시계 방향이 앞면)으로 PackageName(/Game/…)의 메시를 새로 만들어 저장한다.
	 * 이웃한 삼각형이 점을 같이 쓰면 노멀이 부드럽게 이어진다. bCollision이면 삼각형 그대로를 충돌로 쓴다(땅). 실패하면 nullptr.
	 */
	UStaticMesh* Create(const FString& PackageName, const TArray<FVector3f>& Positions, const TArray<FVector2f>& UVs, const TArray<int32>& Triangles,
		UMaterialInterface* Material, bool bCollision);
}
