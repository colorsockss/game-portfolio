#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoCreateLocomotionCommandlet.generated.h"

/**
 * 직업마다 속도로 대기와 달리기를 섞는 블렌드 스페이스(/Game/Characters/<직업>/BS_<직업>_Locomotion)를 만든다.
 * Scripts/import_characters.py로 캐릭터를 가져온 뒤에 돌린다. Python으로 샘플을 넣으면 블렌드 스페이스가 다시 계산되지 않아
 * 0이 아닌 속도에서 T 포즈가 되므로, 엔진의 AddSample과 ResampleData를 부르는 C++로 만든다.
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoCreateLocomotion -unattended -nullrhi
 */
UCLASS()
class UMmoCreateLocomotionCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoCreateLocomotionCommandlet();

	virtual int32 Main(const FString& Params) override;
};
