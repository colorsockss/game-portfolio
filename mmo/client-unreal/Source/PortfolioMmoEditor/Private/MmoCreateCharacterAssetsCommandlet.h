#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoCreateCharacterAssetsCommandlet.generated.h"

/**
 * 가져온 캐릭터(Scripts/import_characters.py)로 두 가지를 만든다.
 *   - 직업마다 속도로 대기와 달리기를 섞는 블렌드 스페이스(/Game/Characters/<직업>/BS_<직업>_Locomotion). Python으로 샘플을 넣으면
 *     블렌드 스페이스가 다시 계산되지 않아 0이 아닌 속도에서 T 포즈가 되므로, 엔진의 AddSample과 ResampleData를 부르는 C++로 만든다.
 *   - 표현 표(UMmoEntityVisuals, /Game/Characters/DA_EntityVisuals). 플레이어의 직업마다 메시와 블렌드 스페이스, 자리 표시 원기둥.
 *     몬스터, NPC, 채집물, 바닥 아이템의 줄은 그 항목이 여기에 더한다.
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
