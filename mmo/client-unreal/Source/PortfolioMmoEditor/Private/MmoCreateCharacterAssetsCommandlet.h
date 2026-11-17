#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoCreateCharacterAssetsCommandlet.generated.h"

/**
 * 가져온 캐릭터(Scripts/import_characters.py)와 몬스터·소환수·NPC(Scripts/import_creatures.py. 91)로 세 가지를 만든다.
 *   - 모습마다 속도로 대기와 이동을 섞는 블렌드 스페이스(<폴더>/BS_<이름>_Locomotion). Python으로 샘플을 넣으면
 *     블렌드 스페이스가 다시 계산되지 않아 0이 아닌 속도에서 T 포즈가 되므로, 엔진의 AddSample과 ResampleData를 부르는 C++로 만든다.
 *   - 모습마다 애니메이션 블루프린트(<폴더>/ABP_<이름>).
 *   - 표현 표(UMmoEntityVisuals, /Game/Characters/DA_EntityVisuals). 줄마다 메시, 애니메이션 블루프린트, 동작, 크기 배수와 종류마다의 자리 표시.
 *     채집물과 바닥 아이템은 아직 줄이 없어 자리 표시다.
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoCreateCharacterAssets -unattended -nullrhi
 */
UCLASS()
class UMmoCreateCharacterAssetsCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoCreateCharacterAssetsCommandlet();

	virtual int32 Main(const FString& Params) override;
};
