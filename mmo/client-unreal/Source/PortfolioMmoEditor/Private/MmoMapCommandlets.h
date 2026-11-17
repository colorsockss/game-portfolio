#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoMapCommandlets.generated.h"

/**
 * 맵 생성기가 낸 놓인 것의 목록(mmo/shared/data/files/Map.tsv)에서 Field 레벨의 맵 액터(AMmoMapObject)를 비우고 다시 놓는다.
 * 먼저 땅의 높낮이(106. AMmoTerrain과 그 메시)를 만들고, 맵 액터는 차지하는 사각형의 가장 낮은 땅에 놓는다. 메시는 /Game/Environment/<메시의
 * 키>(나무·바위 등은 그 변형 가운데 하나)가 있으면 그것이고, 없으면 엔진 기본 도형에 종류의 색을 입힌 자리 표시다. 이어서 꾸민다(102.
 * MmoMapDecoration: 땅의 마스크와 MI_Ground, 흩은 풀과 덤불). 레벨 전체를 다시 만드는 차례는
 * Scripts/create_content.py(땅, 조명, 하늘) → Scripts/import_props.py → 이 도구다. 에디터가 프로젝트를 열고 있지 않을 때 돌린다.
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoBuildMap -unattended -nosplash -nullrhi
 */
UCLASS()
class UMmoBuildMapCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoBuildMapCommandlet();

	virtual int32 Main(const FString& Params) override;
};

/**
 * Field 레벨의 맵 액터를 놓인 것의 원본(mmo/data/MapObjects.tsv)으로 내보낸다. 줄은 종류, z, x, 방향의 차례라 같은 배치면 같은 파일이다.
 * 방향이 90도의 배수가 아니거나 자리가 정수 미터가 아닌 액터가 있으면 쓰지 않고 1로 끝난다. 내보낸 뒤 npm run generate -- mmo로 격자와
 * 목록을 다시 만든다. -Check를 주면 쓰지 않고, 레벨의 놓인 줄과 그 종류의 줄이 맵 생성기의 목록(Map.tsv)과 같은지만 보아 다르면 1로 끝난다
 * (package.mjs가 패키징 전에 부름. 레벨이 낡았는지는 이것 하나로 봄).
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoExportMap [-Check] -unattended -nosplash -nullrhi
 */
UCLASS()
class UMmoExportMapCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoExportMapCommandlet();

	virtual int32 Main(const FString& Params) override;
};
