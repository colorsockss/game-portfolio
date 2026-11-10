#pragma once

#include "CoreMinimal.h"
#include "UObject/SoftObjectPath.h"

/**
 * 위젯 블루프린트의 패키지 경로. 에디터 모듈의 생성기(UMmoCreateWidgetsCommandlet)가 여기에 만들고, 게임은 여기서 불러온다.
 * /Game/UI는 코드만 참조하므로 DefaultGame.ini에서 늘 쿠킹한다.
 */
namespace MmoUiPaths
{
	inline const TCHAR* const Login = TEXT("/Game/UI/WBP_Login");
	inline const TCHAR* const Hud = TEXT("/Game/UI/WBP_Hud");
	inline const TCHAR* const Joystick = TEXT("/Game/UI/WBP_Joystick");
	inline const TCHAR* const Settings = TEXT("/Game/UI/WBP_Settings");
	inline const TCHAR* const Confirm = TEXT("/Game/UI/WBP_Confirm");
	inline const TCHAR* const Notice = TEXT("/Game/UI/WBP_Notice");
	inline const TCHAR* const NameTag = TEXT("/Game/UI/WBP_NameTag");

	/** 패키지 경로 → 그 위젯 블루프린트가 만든 클래스(…/WBP_X.WBP_X_C). */
	inline FSoftClassPath ClassOf(const TCHAR* Package)
	{
		const FString Path(Package);
		return FSoftClassPath(FString::Printf(TEXT("%s.%s_C"), *Path, *FPaths::GetBaseFilename(Path)));
	}
}
