#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"

#include "MmoGameMode.generated.h"

/**
 * Field 레벨의 게임 모드. 컨트롤러만 정하고 폰은 처음부터 만들지 않는다. 내 캐릭터는 로그인해 내 개체가 들어오면 UMmoEntitySubsystem이 만들고,
 * 화면(로그인 화면부터)은 UMmoUiManager가 연다.
 */
UCLASS()
class AMmoGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMmoGameMode();
};
