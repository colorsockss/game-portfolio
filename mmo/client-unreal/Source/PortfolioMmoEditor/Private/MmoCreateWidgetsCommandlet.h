#pragma once

#include "CoreMinimal.h"
#include "Commandlets/Commandlet.h"

#include "MmoCreateWidgetsCommandlet.generated.h"

/**
 * 위젯 블루프린트(MmoUiPaths의 WBP_*)를 처음부터 만든다. 화면 배치의 원본은 이 코드이고, 에디터에서 고친 배치는 다시 만들 때 덮인다.
 * 기반 클래스의 BindWidget 이름과 같은 위젯을 만들어 컴파일하므로, 이름이 어긋나면 컴파일 오류로 멈춘다.
 *
 *   UnrealEditor-Cmd PortfolioMmo.uproject -run=MmoCreateWidgets -unattended -nullrhi
 */
UCLASS()
class UMmoCreateWidgetsCommandlet : public UCommandlet
{
	GENERATED_BODY()

public:
	UMmoCreateWidgetsCommandlet();

	virtual int32 Main(const FString& Params) override;
};
