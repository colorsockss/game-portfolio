#include "UI/MmoPartyWidget.h"

#include "Blueprint/WidgetTree.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

int32 UMmoPartyWidget::MaxMembers()
{
	return portfolio::mmo::CONSTANT_MAX_PARTY_SIZE;
}

void UMmoPartyWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	for (int32 Index = 0; Index < MaxMembers(); ++Index)
	{
		UWidget* Row = WidgetTree->FindWidget(*FString::Printf(TEXT("Member%dRow"), Index));
		UTextBlock* Name = WidgetTree->FindWidget<UTextBlock>(*FString::Printf(TEXT("Member%dText"), Index));
		UMmoButtonWidget* Kick = WidgetTree->FindWidget<UMmoButtonWidget>(*FString::Printf(TEXT("Member%dKick"), Index));
		if (!Row || !Name || !Kick)
		{
			break;
		}
		Kick->OnClickedNative.AddWeakLambda(this, [this, Index]
		{
			if (Shown.IsValidIndex(Index))
			{
				portfolio::mmo::Packet Packet;
				Packet.mutable_party_kick()->set_target_id(Shown[Index]);
				GetGameInstance()->GetSubsystem<UMmoSession>()->Send(Packet);
			}
		});
		Rows.Add(Row);
		Names.Add(Name);
		Kicks.Add(Kick);
	}
	LeaveButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_party_leave();
		GetGameInstance()->GetSubsystem<UMmoSession>()->Send(Packet);
	});
	CloseButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Party); });
}

void UMmoPartyWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	ShowMembers();
}

void UMmoPartyWidget::ShowMembers()
{
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FParty& Party = Session->Party();
	if (Party.Revision() == ShownRevision && Session->Strings().Version() == ShownLanguage)
	{
		return;
	}
	ShownRevision = Party.Revision();
	ShownLanguage = Session->Strings().Version();
	const uint32 Self = Session->World().SelfId();
	const bool bLeader = Party.LeaderId() == Self;
	Shown.Reset();
	for (int32 Index = 0; Index < Rows.Num(); ++Index)
	{
		const bool bUsed = Index < static_cast<int32>(Party.Members().size());
		Rows[Index]->SetVisibility(bUsed ? ESlateVisibility::SelfHitTestInvisible : ESlateVisibility::Collapsed);
		if (!bUsed)
		{
			continue;
		}
		const MmoWorld::FPartyMember& Member = Party.Members()[Index];
		const FString Name = UTF8_TO_TCHAR(Member.Name.c_str());
		Names[Index]->SetText(Member.Id == Party.LeaderId() ? MmoText::Format(this, TEXT("party.leader"), { Name }) : FText::FromString(Name));
		Kicks[Index]->SetVisibility(bLeader && Member.Id != Self ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
		Shown.Add(Member.Id);
	}
	EmptyText->SetVisibility(Party.Id() == 0 ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	LeaveButton->SetIsEnabled(Party.Id() != 0);
}
