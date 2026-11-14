#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoDeathWidget.generated.h"

class UMmoButtonWidget;

namespace portfolio::mmo
{
	class Packet;
}

/**
 * 사망 화면(WBP_Death의 기반): 부활 버튼 하나. 내가 죽으면 화면 관리자가 열고 Revived가 오면 닫는다. 부활 버튼은 Revive를 보내고 답이 올 때까지
 * 누를 수 없다(부활의 ActionFailed가 오면 다시 누를 수 있음). 잃은 것을 적는 줄은 backlog 45가 더한다.
 */
UCLASS(Abstract)
class UMmoDeathWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;

private:
	UFUNCTION()
	void HandleReviveClicked();

	void HandlePacket(const portfolio::mmo::Packet& Packet);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ReviveButton;
};
