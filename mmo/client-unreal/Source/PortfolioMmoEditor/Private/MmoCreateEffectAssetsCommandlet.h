#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoCreateEffectAssetsCommandlet.generated.h"

/**
 * 연출 표(UMmoCues, /Game/Effects/DA_Cues)와 그 자리 표시 에셋을 만든다.
 *   - 소리: 짧은 효과음과 구역 종류마다의 배경음(8초 되풀이)을 여기서 합성해 /Game/Effects/Sounds/에 둔다(직접 만든 것. 밖의 파일을 가져오지
 *     않으므로 에셋에 가져온 경로가 남지 않음). 소리 파일은 91이 바꾼다.
 *   - 소리의 묶음 SC_Effects, SC_Music과 효과음의 거리 감쇠 SA_Effects.
 *   - 이펙트: Niagara 플러그인의 템플릿 시스템을 소프트 참조로 가리킨다(저장소에 복사하지 않음. 그림은 91).
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoCreateEffectAssets -unattended -nullrhi
 */
UCLASS()
class UMmoCreateEffectAssetsCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoCreateEffectAssetsCommandlet();

	virtual int32 Main(const FString& Params) override;
};
