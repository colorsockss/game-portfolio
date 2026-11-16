#include "UI/MmoDeathWidget.h"

#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Net/MmoSession.h"
#include "TimerManager.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoText.h"

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
	ShowPenalty();
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
	else if (Packet.body_case() == portfolio::mmo::Packet::kDeathPenalty)
	{
		ShowPenalty();
	}
}

void UMmoDeathWidget::ShowPenalty()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const std::optional<portfolio::mmo::DeathPenalty>& Penalty = Session->World().SelfState().Penalty;
	if (!Penalty)
	{
		PenaltyText->SetText(FText::GetEmpty());
		return;
	}

	FString Text = MmoText::Format(this, TEXT("death.expLost"), { FString::FromInt(Penalty->exp_lost()) }).ToString();
	TArray<FString> Items;
	for (const portfolio::mmo::ItemSlot& Item : Penalty->items())
	{
		const portfolio::mmo::data::ItemsRow* Row = Session->Data().Item(Item.item_id());
		FString Name = Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString();
		if (Item.enchant() > 0)
		{
			Name += FString::Printf(TEXT(" +%u"), Item.enchant());
		}
		if (Item.count() > 1)
		{
			Name += TEXT(" ") + MmoText::Format(this, TEXT("detail.count"), { FString::FromInt(Item.count()) }).ToString();
		}
		Items.Add(Name);
	}
	if (Items.Num() > 0)
	{
		Text += TEXT("\n") + MmoText::Format(this, TEXT("death.dropped"), { FString::Join(Items, TEXT(", ")) }).ToString();
	}
	PenaltyText->SetText(FText::FromString(Text));
}
