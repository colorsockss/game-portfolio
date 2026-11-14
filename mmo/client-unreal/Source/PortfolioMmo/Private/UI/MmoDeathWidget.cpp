#include "UI/MmoDeathWidget.h"

#include "Engine/GameInstance.h"
#include "Net/MmoSession.h"
#include "TimerManager.h"
#include "UI/MmoButtonWidget.h"

void UMmoDeathWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	ReviveButton->OnClicked.AddDynamic(this, &UMmoDeathWidget::HandleReviveClicked);
	GetGameInstance()->GetSubsystem<UMmoSession>()->OnPacket.AddUObject(this, &UMmoDeathWidget::HandlePacket);
}

void UMmoDeathWidget::NativeConstruct()
{
	Super::NativeConstruct();
	ReviveButton->SetWaiting(false);
	// 개발용: -MmoRevive면 3초 뒤에 부활을 누른다(클릭 없이 부활을 확인).
	if (FParse::Param(FCommandLine::Get(), TEXT("MmoRevive")))
	{
		FTimerHandle Timer;
		GetWorld()->GetTimerManager().SetTimer(Timer, FTimerDelegate::CreateUObject(this, &UMmoDeathWidget::HandleReviveClicked), 3.0f, false);
	}
}

void UMmoDeathWidget::HandleReviveClicked()
{
	ReviveButton->SetWaiting(true);
	portfolio::mmo::Packet Packet;
	Packet.mutable_revive();
	GetGameInstance()->GetSubsystem<UMmoSession>()->Send(Packet);
}

void UMmoDeathWidget::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kActionFailed && Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_REVIVE)
	{
		ReviveButton->SetWaiting(false);
	}
}
