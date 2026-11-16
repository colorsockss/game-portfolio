#include "UI/MmoQuestWidget.h"

#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Game/MmoPlayerController.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

namespace
{
	uint32 MyLevel(const UMmoSession& Session)
	{
		const MmoWorld::FEntity* Me = Session.World().SelfEntity();
		return Me ? Me->Info.level() : 0;
	}

	FString NameOf(const UObject* Context, const std::string& Key)
	{
		return MmoText::Get(Context, UTF8_TO_TCHAR(Key.c_str())).ToString();
	}

	/** 조건의 글("늑대 잡기", "쑥 잎 모으기", "레벨", "투구 입기"). */
	FString Condition(const UObject* Context, const MmoData::FGameData& Data, const portfolio::mmo::data::QuestsRow& Quest)
	{
		switch (Quest.kind())
		{
		case portfolio::mmo::data::QUEST_KIND_KILL:
		{
			const portfolio::mmo::data::MonstersRow* Monster = Data.Monster(Quest.target());
			return MmoText::Format(Context, TEXT("quest.kill"), { Monster ? NameOf(Context, Monster->name_key()) : FString() }).ToString();
		}
		case portfolio::mmo::data::QUEST_KIND_COLLECT:
		{
			const portfolio::mmo::data::ItemsRow* Item = Data.Item(Quest.target());
			return MmoText::Format(Context, TEXT("quest.collect"), { Item ? NameOf(Context, Item->name_key()) : FString() }).ToString();
		}
		case portfolio::mmo::data::QUEST_KIND_CRAFT:
		{
			const portfolio::mmo::data::RecipesRow* Recipe = Data.Recipe(Quest.target());
			const portfolio::mmo::data::ItemsRow* Item = Recipe ? Data.RecipeItem(*Recipe) : nullptr;
			return MmoText::Format(Context, TEXT("quest.craft"), { Item ? NameOf(Context, Item->name_key()) : FString() }).ToString();
		}
		case portfolio::mmo::data::QUEST_KIND_EQUIP:
			return MmoText::Format(Context, TEXT("quest.equip"), { MmoText::Get(Context, FString::Printf(TEXT("equipSlot.%u"), Quest.target())).ToString() }).ToString();
		default:
			return MmoText::Get(Context, TEXT("quest.level")).ToString();
		}
	}
}

FText UMmoQuestWidget::ProgressLine(const UObject* Context, UMmoSession& Session)
{
	const portfolio::mmo::data::QuestsRow* Quest = Session.Quests().Current(Session.Data());
	if (!Quest)
	{
		return FText::GetEmpty();
	}
	const MmoWorld::FQuestProgress Progress = Session.Quests().Progress(Session.Data(), Session.Inventory(), MyLevel(Session));
	return MmoText::Format(Context, TEXT("quest.progress"), { Condition(Context, Session.Data(), *Quest), FString::FromInt(Progress.Have), FString::FromInt(Progress.Need) });
}

void UMmoQuestWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	GoalButton->OnClicked.AddDynamic(this, &UMmoQuestWidget::HandleGoalClicked);
	AcceptButton->OnClicked.AddDynamic(this, &UMmoQuestWidget::HandleAcceptClicked);
	CompleteButton->OnClicked.AddDynamic(this, &UMmoQuestWidget::HandleCompleteClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoQuestWidget::HandleCloseClicked);
}

void UMmoQuestWidget::NativeConstruct()
{
	Super::NativeConstruct();
	PendingRequest = 0;
	PendingButton = nullptr;
	ShownQuest = MAX_uint32;
}

void UMmoQuestWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
		PendingButton->SetWaiting(false);
		PendingButton = nullptr;
		ShownQuest = MAX_uint32;
	}
	const uint32 Level = MyLevel(*Session);
	if (Session->Quests().Version() == ShownQuest && Session->Inventory().Version() == ShownInventory && Session->Strings().Version() == ShownLanguage && Level == ShownLevel)
	{
		return;
	}
	ShownQuest = Session->Quests().Version();
	ShownInventory = Session->Inventory().Version();
	ShownLanguage = Session->Strings().Version();
	ShownLevel = Level;
	Refresh();
}

void UMmoQuestWidget::Refresh()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoData::FGameData& Data = Session->Data();
	const MmoWorld::FQuestState& State = Session->Quests();
	const portfolio::mmo::data::QuestsRow* Quest = State.Next(Data);
	for (UTextBlock* Line : TArray<UTextBlock*>{ DescriptionText, ConditionText, RewardText })
	{
		Line->SetVisibility(Quest ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	}
	if (!Quest)
	{
		NameText->SetText(MmoText::Get(this, TEXT("quest.allDone")));
		GoalButton->SetIsEnabled(false);
		AcceptButton->SetIsEnabled(false);
		CompleteButton->SetIsEnabled(false);
		return;
	}

	NameText->SetText(State.IsAccepted() ? MmoText::Get(this, UTF8_TO_TCHAR(Quest->name_key().c_str()))
		: MmoText::Format(this, TEXT("quest.next"), { NameOf(this, Quest->name_key()) }));
	DescriptionText->SetText(MmoText::Get(this, UTF8_TO_TCHAR(Quest->description_key().c_str())));
	const MmoWorld::FQuestProgress Progress = State.Progress(Data, Session->Inventory(), MyLevel(*Session));
	ConditionText->SetText(MmoText::Format(this, TEXT("quest.progress"), { Condition(this, Data, *Quest), FString::FromInt(Progress.Have), FString::FromInt(Quest->count()) }));
	TArray<FString> Rewards;
	if (Quest->reward_gold() > 0)
	{
		Rewards.Add(MmoText::Format(this, TEXT("quest.rewardGold"), { FText::AsNumber(Quest->reward_gold()).ToString() }).ToString());
	}
	if (Quest->has_reward_item_id() && Quest->reward_item_count() > 0)
	{
		const portfolio::mmo::data::ItemsRow* Item = Data.Item(Quest->reward_item_id());
		Rewards.Add(MmoText::Format(this, TEXT("quest.rewardItem"), { Item ? NameOf(this, Item->name_key()) : FString(), FString::FromInt(Quest->reward_item_count()) }).ToString());
	}
	if (Quest->reward_exp() > 0)
	{
		Rewards.Add(MmoText::Format(this, TEXT("quest.rewardExp"), { FText::AsNumber(Quest->reward_exp()).ToString() }).ToString());
	}
	RewardText->SetText(MmoText::Format(this, TEXT("quest.reward"), { FString::Join(Rewards, TEXT(" · ")) }));

	const MmoWorld::EQuestMark Mark = State.Mark(Data, Session->Inventory(), MyLevel(*Session));
	// 목표가 있는지는 자리와 상관없다(자리는 가장 가까운 것을 고를 뿐).
	GoalButton->SetIsEnabled(Session->QuestGoal(0, 0).has_value());
	AcceptButton->SetIsEnabled(PendingRequest == 0 && Mark == MmoWorld::EQuestMark::CanAccept);
	CompleteButton->SetIsEnabled(PendingRequest == 0 && Mark == MmoWorld::EQuestMark::CanComplete);
}

void UMmoQuestWidget::HandleGoalClicked()
{
	if (AMmoPlayerController* Controller = Cast<AMmoPlayerController>(GetOwningPlayer()))
	{
		if (Controller->WalkToQuestGoal())
		{
			GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Quest);
		}
	}
}

void UMmoQuestWidget::HandleAcceptClicked()
{
	Send(true);
}

void UMmoQuestWidget::HandleCompleteClicked()
{
	Send(false);
}

void UMmoQuestWidget::Send(bool bAccept)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PendingRequest != 0)
	{
		return;
	}
	Session->Send(bAccept ? Session->Inventory().QuestAccept() : Session->Inventory().QuestComplete());
	PendingRequest = Session->Inventory().RequestId();
	PendingButton = bAccept ? AcceptButton.Get() : CompleteButton.Get();
	PendingButton->SetWaiting(true);
	AcceptButton->SetIsEnabled(false);
	CompleteButton->SetIsEnabled(false);
}

void UMmoQuestWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Quest);
}
