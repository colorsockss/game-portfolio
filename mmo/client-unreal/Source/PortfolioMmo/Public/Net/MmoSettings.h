#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"

#include "MmoSettings.generated.h"

/**
 * 붙을 서버의 기본값. Config/DefaultGame.ini에서 읽고(프로젝트 설정의 MMO 항목), 명령줄의 -MmoServer=호스트:포트가 이긴다.
 * 패키지는 Scripts/package.mjs가 대상(로컬, Live)의 주소를 패키지의 명령줄(UECommandLine.txt)로 넣으므로 ini를 바꾸지 않는다.
 */
UCLASS(Config = Game, DefaultConfig, meta = (DisplayName = "MMO"))
class UMmoSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UPROPERTY(Config, EditAnywhere, Category = "Server")
	FString ServerHost = TEXT("127.0.0.1");

	UPROPERTY(Config, EditAnywhere, Category = "Server")
	int32 ServerPort = 7777;
};
