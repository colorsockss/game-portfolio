#include "UI/MmoHudWidget.h"

#include "UI/MmoText.h"
#include "UI/MmoQuestWidget.h"
#include "UI/MmoMapDrawing.h"
#include "Components/Button.h"
#include "Components/Image.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Game/MmoCoordinates.h"
#include "Blueprint/WidgetTree.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoCueSubsystem.h"
#include "Game/MmoEntitySubsystem.h"
#include "Game/MmoPlayerController.h"
#include "Input/MmoKeys.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoChatWidget.h"
#include "UI/MmoIcons.h"
#include "GameFramework/Pawn.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "UI/MmoJoystickWidget.h"
#include "UI/MmoUiManager.h"
#include "World/CombatState.h"
#include "World/FailMessages.h"
#include "World/Units.h"

namespace
{
	/** 효과의 글자 아이콘의 Strings 키(아이콘 표는 73). */
	const TCHAR* EffectKey(portfolio::mmo::data::EffectKind Kind)
	{
		switch (Kind)
		{
		case portfolio::mmo::data::EFFECT_KIND_STUN: return TEXT("effect.stun");
		case portfolio::mmo::data::EFFECT_KIND_SLOW: return TEXT("effect.slow");
		case portfolio::mmo::data::EFFECT_KIND_ATTACK_UP: return TEXT("effect.attackUp");
		case portfolio::mmo::data::EFFECT_KIND_DEFENSE_UP: return TEXT("effect.defenseUp");
		default: return TEXT("?");
		}
	}
}

int32 UMmoHudWidget::QuickslotCount()
{
	return portfolio::mmo::CONSTANT_QUICKSLOT_COUNT;
}

int32 UMmoHudWidget::PartySlotCount()
{
	return portfolio::mmo::CONSTANT_MAX_PARTY_SIZE - 1;
}

namespace
{
	/** 퀘스트의 목표(50)를 지도 모델의 (X, Z)로. 없으면 nullopt. */
	std::optional<std::pair<int32_t, int32_t>> QuestGoalOf(const UMmoSession& Session, const FVector& Location)
	{
		const std::optional<MmoWorld::FPoint> Goal = Session.QuestGoal(MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location));
		return Goal ? std::optional<std::pair<int32_t, int32_t>>(std::make_pair(Goal->X, Goal->Z)) : std::nullopt;
	}
}

void UMmoHudWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	AttackButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleAttackClicked);
	MinimapButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleMinimapClicked);
	AutoButton->SetKeyHint(MmoKeys::Hint(EMmoAction::AutoHunt));
	AutoButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
		{
			Controller->ToggleAutoHunt();
		}
	});
	TargetButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleTargetClicked);
	ForceButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		MmoWorld::FCombatState& Combat = GetGameInstance()->GetSubsystem<UMmoSession>()->Combat();
		Combat.SetForceAttack(!Combat.IsForceAttack());
	});
	PartyInviteButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_party_invite()->set_target_id(ShownTarget);
		GetGameInstance()->GetSubsystem<UMmoSession>()->Send(Packet);
	});
	PartyButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->TogglePartyWindow(); });
	for (int32 Index = 0; Index < PartySlotCount(); ++Index)
	{
		UWidget* Slot = WidgetTree->FindWidget(*FString::Printf(TEXT("PartyMember%dBox"), Index));
		UMmoButtonWidget* Name = WidgetTree->FindWidget<UMmoButtonWidget>(*FString::Printf(TEXT("PartyMember%d"), Index));
		UProgressBar* Hp = WidgetTree->FindWidget<UProgressBar>(*FString::Printf(TEXT("PartyMember%dHpBar"), Index));
		if (!Slot || !Name || !Hp)
		{
			break;
		}
		Name->OnClickedNative.AddWeakLambda(this, [this, Index] { TargetPartyMember(Index); });
		PartySlots.Add(Slot);
		PartyNames.Add(Name);
		PartyHpBars.Add(Hp);
	}
	WhisperButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		const auto& Entities = GetGameInstance()->GetSubsystem<UMmoSession>()->World().Entities();
		const auto Found = Entities.find(ShownTarget);
		if (Found != Entities.end())
		{
			ChatBox->StartWhisper(UTF8_TO_TCHAR(Found->second.Info.name().c_str()));
		}
	});
	InteractButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleInteractClicked);
	SettingsButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleSettingsClicked);
	CharacterButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleCharacter(); });
	BagButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleInventory(); });
	SkillsButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleSkills(); });
	QuestButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleQuest(); });
	// 메뉴의 키 표시는 키 표의 키다(설정 창은 뒤로 가기의 키가 연다).
	const TPair<UMmoButtonWidget*, EMmoAction> Menus[] = {
		{ BagButton, EMmoAction::Bag }, { CharacterButton, EMmoAction::Character }, { SkillsButton, EMmoAction::Skills },
		{ QuestButton, EMmoAction::Quest }, { SettingsButton, EMmoAction::Back },
	};
	for (const TPair<UMmoButtonWidget*, EMmoAction>& Menu : Menus)
	{
		Menu.Key->SetKeyHint(MmoKeys::Hint(Menu.Value));
	}
	for (int32 Index = 0; Index < QuickslotCount(); ++Index)
	{
		UMmoButtonWidget* Slot = WidgetTree->FindWidget<UMmoButtonWidget>(*FString::Printf(TEXT("Slot%d"), Index));
		UProgressBar* Shade = WidgetTree->FindWidget<UProgressBar>(*FString::Printf(TEXT("Slot%dCooldown"), Index));
		if (!Slot || !Shade)
		{
			break;
		}
		Slot->OnClickedNative.AddWeakLambda(this, [this, Index] { UseSlot(Index); });
		Slots.Add(Slot);
		SlotShades.Add(Shade);
	}
}

void UMmoHudWidget::UseSlot(int32 Index)
{
	if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
	{
		Controller->UseQuickslot(Index);
	}
}

void UMmoHudWidget::ShowSlots(double ServerTick)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (!Icons)
	{
		Icons = LoadObject<UMmoIcons>(nullptr, UMmoIcons::Path);
	}
	if (ShownSlots.Num() != Slots.Num())
	{
		ShownSlots.Init(MAX_uint64, Slots.Num());
	}

	// 서버의 퀵슬롯 배치(36). 스킬은 아이콘과 쿨다운, 물약(32)은 글자 아이콘과 가진 수의 합, 쓰는 종류의 쿨다운.
	const std::vector<portfolio::mmo::Quickslot>& Bar = Session->Skills().Slots();
	for (int32 Index = 0; Index < Slots.Num(); ++Index)
	{
		const portfolio::mmo::Quickslot Slot = Index < static_cast<int32>(Bar.size()) ? Bar[Index] : portfolio::mmo::Quickslot();
		const portfolio::mmo::data::SkillsRow* Skill = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_SKILL ? Session->Data().Skill(Slot.id()) : nullptr;
		const portfolio::mmo::data::ItemsRow* Potion = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_ITEM ? Session->Data().Item(Slot.id()) : nullptr;
		const uint32 Count = Potion ? Session->Inventory().CountOf(Potion->id()) : 0;
		const uint64 Shown = static_cast<uint64>(Slot.kind()) << 56 | static_cast<uint64>(Slot.id()) << 24 | Count;
		if (Shown != ShownSlots[Index])
		{
			ShownSlots[Index] = Shown;
			const std::string* NameKey = Skill ? &Skill->name_key() : Potion ? &Potion->name_key() : nullptr;
			const FText Name = NameKey ? MmoText::Get(this, UTF8_TO_TCHAR(NameKey->c_str())) : FText::GetEmpty();
			UTexture2D* Icon = !Icons ? nullptr : Skill ? Icons->Load(EMmoIconKind::Skill, Skill->id()) : Potion ? Icons->Load(EMmoIconKind::Item, Potion->id()) : nullptr;
			Slots[Index]->SetIcon(Icon, Name);
			if (Potion)
			{
				// 그림이 있으면 개수만, 없으면 글자 아이콘의 첫 글자와 개수를 쓴다(91).
				Slots[Index]->SetLabel(Icon ? FText::AsNumber(Count) : FText::FromString(FString::Printf(TEXT("%s %u"), *Name.ToString().Left(1), Count)));
			}
			// 키 표시는 PC만(크기와 규칙은 93).
			Slots[Index]->SetKeyHint(MmoKeys::Hint(MmoKeys::Slot(Index)));
		}
		SlotShades[Index]->SetPercent(Skill ? static_cast<float>(Session->Combat().Cooldowns().Remaining(Skill->id(), Skill->cooldown_ms(), ServerTick))
			: Potion ? static_cast<float>(Session->Combat().Cooldowns().Remaining(MmoWorld::FCooldowns::PotionKey(Potion->use()), Potion->cooldown_ms(), ServerTick))
			: 0.0f);
	}
}

void UMmoHudWidget::ShowProgress(double NowSeconds)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const std::optional<double> Ratio = Me ? Session->World().ProgressRatio(*Me, Session->Data(), NowSeconds) : std::nullopt;
	const uint32 Shown = Ratio ? static_cast<uint32>(*Ratio * 1000) : MAX_uint32 - 1;
	if (Shown == ShownProgress)
	{
		return;
	}
	ShownProgress = Shown;
	CastPanel->SetVisibility(Ratio ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	if (Ratio)
	{
		CastBar->SetPercent(static_cast<float>(*Ratio));
		const portfolio::mmo::data::SkillsRow* Skill = Me->Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_CAST ? Session->Data().Skill(Me->Info.progress().id()) : nullptr;
		// 채집(47)은 채집물의 이름을 보인다.
		const portfolio::mmo::data::GatherNodesRow* Node = Me->Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_GATHER ? Session->Data().GatherNode(Me->Info.progress().id()) : nullptr;
		// 제작(48)은 만드는 것의 이름(장비는 그 종의 일반 등급의 이름)을 보인다.
		const portfolio::mmo::data::RecipesRow* Recipe = Me->Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_CRAFT ? Session->Data().Recipe(Me->Info.progress().id()) : nullptr;
		const portfolio::mmo::data::ItemsRow* Crafted = Recipe ? Session->Data().RecipeItem(*Recipe) : nullptr;
		CastText->SetText(Skill ? MmoText::Get(this, UTF8_TO_TCHAR(Skill->name_key().c_str()))
			: Me->Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_RECALL ? MmoText::Get(this, TEXT("progress.recall"))
			: Node ? MmoText::Get(this, UTF8_TO_TCHAR(Node->name_key().c_str()))
			: Crafted ? MmoText::Get(this, UTF8_TO_TCHAR(Crafted->name_key().c_str())) : FText::GetEmpty());
	}
}

void UMmoHudWidget::ShowEffects(double ServerTick)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	FString Text;
	const auto Add = [&](const TCHAR* Label, double EndTick)
	{
		Text += FString::Printf(TEXT("[%s %.1f] "), Label, FMath::Max(0.0, (EndTick - ServerTick) / MmoWorld::Units::TicksPerSecond));
	};
	if (ServerTick < Session->World().SelfState().CombatEndTick)
	{
		Add(*MmoText::Get(this, TEXT("hud.combat")).ToString(), Session->World().SelfState().CombatEndTick);
	}
	// 내 소환수(95)의 체력과 남은 시간.
	if (const MmoWorld::FEntity* Summon = Session->World().MySummon(); Summon && !Summon->Info.dead())
	{
		const portfolio::mmo::data::MonstersRow* Row = Session->Data().Monster(Summon->Info.template_id());
		Text += TEXT("[") + MmoText::Format(this, TEXT("hud.summon"), { Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString(),
			FString::FromInt(Summon->Info.hp()), FString::FromInt(Summon->Info.max_hp()),
			FString::Printf(TEXT("%.0f"), FMath::Max(0.0, (Summon->Info.summon_end_tick() - ServerTick) / MmoWorld::Units::TicksPerSecond)) }).ToString() + TEXT("] ");
	}
	// 선공 표시(44)도 효과 아이콘처럼 남은 시간과 함께 보인다.
	if (ServerTick < Session->World().SelfState().AggressorEndTick)
	{
		Add(*MmoText::Get(this, TEXT("effect.aggressor")).ToString(), Session->World().SelfState().AggressorEndTick);
	}
	for (int32 Index = 0; Me && Index < Me->Info.effects_size(); ++Index)
	{
		const portfolio::mmo::EffectState& Effect = Me->Info.effects(Index);
		if (const portfolio::mmo::data::EffectsRow* Row = Session->Data().Effect(Effect.effect_id()))
		{
			Add(*MmoText::Get(this, EffectKey(Row->kind())).ToString(), Effect.end_tick());
		}
	}
	if (Text != ShownEffects)
	{
		ShownEffects = Text;
		EffectsText->SetText(FText::FromString(Text));
	}
}

void UMmoHudWidget::HandleAttackClicked()
{
	if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
	{
		Controller->AttackOrTargetNearest();
	}
}

void UMmoHudWidget::ShowParty()
{
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FParty& Party = Session->Party();
	if (Party.Revision() == ShownParty)
	{
		return;
	}
	ShownParty = Party.Revision();
	PartyShown.Reset();
	for (const MmoWorld::FPartyMember& Member : Party.Members())
	{
		if (Member.Id != Session->World().SelfId())
		{
			PartyShown.Add(Member.Id);
		}
	}
	for (int32 Index = 0; Index < PartySlots.Num(); ++Index)
	{
		const MmoWorld::FPartyMember* Member = nullptr;
		if (PartyShown.IsValidIndex(Index))
		{
			for (const MmoWorld::FPartyMember& Candidate : Party.Members())
			{
				Member = Candidate.Id == PartyShown[Index] ? &Candidate : Member;
			}
		}
		PartySlots[Index]->SetVisibility(Member ? ESlateVisibility::SelfHitTestInvisible : ESlateVisibility::Collapsed);
		if (Member)
		{
			PartyNames[Index]->SetLabel(FText::FromString(UTF8_TO_TCHAR(Member->Name.c_str())));
			// 체력은 1초마다의 PartyMemberVitals다(아직 받지 못했으면 가득).
			PartyHpBars[Index]->SetPercent(Member->bVitals && Member->MaxHp > 0 ? static_cast<float>(Member->Hp) / Member->MaxHp : 1.0f);
		}
	}
}

void UMmoHudWidget::ShowQuest()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const uint32 Level = Me ? Me->Info.level() : 0;
	if (Session->Quests().Version() == ShownQuest && Session->Inventory().Version() == ShownQuestInventory && Level == ShownQuestLevel
		&& Session->Strings().Version() == ShownQuestLanguage)
	{
		return;
	}
	ShownQuest = Session->Quests().Version();
	ShownQuestInventory = Session->Inventory().Version();
	ShownQuestLevel = Level;
	ShownQuestLanguage = Session->Strings().Version();
	const FText Line = UMmoQuestWidget::ProgressLine(this, *Session);
	QuestText->SetText(Line);
	QuestText->SetVisibility(Line.IsEmpty() ? ESlateVisibility::Collapsed : ESlateVisibility::HitTestInvisible);
}

void UMmoHudWidget::ShowBoss()
{
	// 시야 안의 보스의 이름과 체력(Damaged와 EntityVitals가 월드의 체력을 맞춤. 43).
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const uint32 Boss = MmoWorld::FBossWatch::BossInView(Session->World(), Session->Data());
	if (Boss != ShownBoss)
	{
		ShownBoss = Boss;
		ShownBossHp = MAX_uint64;
		BossPanel->SetVisibility(Boss != 0 ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
		const portfolio::mmo::data::MonstersRow* Row = Boss != 0 ? Session->Data().Monster(Session->World().Entities().at(Boss).Info.template_id()) : nullptr;
		BossNameText->SetText(Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())) : FText::GetEmpty());
	}
	if (Boss != 0)
	{
		const portfolio::mmo::EntityEnter& Info = Session->World().Entities().at(Boss).Info;
		ShowBar(*BossHpBar, *BossHpText, Info.hp(), Info.max_hp(), ShownBossHp);
	}
}

void UMmoHudWidget::TargetPartyMember(int32 Index)
{
	// 시야 안의 파티원만 대상으로 삼는다(회복과 강화를 쓰기 쉽게. 42).
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PartyShown.IsValidIndex(Index) && Session->Party().IsTargetable(Session->World(), PartyShown[Index]))
	{
		if (const std::optional<portfolio::mmo::Packet> Stop = Session->Combat().SetTarget(PartyShown[Index]))
		{
			Session->Send(*Stop);
		}
	}
}

void UMmoHudWidget::HandleTargetClicked()
{
	if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
	{
		Controller->TargetNearest();
	}
}

void UMmoHudWidget::HandleInteractClicked()
{
	if (AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
	{
		Controller->Interact();
	}
}

void UMmoHudWidget::HandleSettingsClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Open(MmoScreen::EScreen::Settings);
}

void UMmoHudWidget::ShowStats(float DeltaTime)
{
	const bool bShown = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->IsStatsShown();
	StatsText->SetVisibility(bShown ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	StatsSeconds += DeltaTime;
	++StatsFrames;
	if (!bShown || StatsSeconds < 0.5f)
	{
		return;
	}
	const MmoWorld::FWorldState& World = GetGameInstance()->GetSubsystem<UMmoSession>()->World();
	int32 Players = 0;
	for (const auto& [Id, Entity] : World.Entities())
	{
		Players += Id != World.SelfId() && Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER ? 1 : 0;
	}
	const std::optional<double> Latency = GetGameInstance()->GetSubsystem<UMmoConnection>()->Latency().Milliseconds();
	StatsText->SetText(MmoText::Format(this, TEXT("hud.stats"), { FString::Printf(TEXT("%.0f"), StatsFrames / StatsSeconds), FString::FromInt(Players),
		Latency ? MmoText::Format(this, TEXT("hud.latency"), { FString::Printf(TEXT("%.0f"), *Latency) }).ToString() : MmoText::Get(this, TEXT("hud.latencyUnknown")).ToString() }));
	StatsSeconds = 0.0f;
	StatsFrames = 0;
}

void UMmoHudWidget::ShowInteract()
{
	const AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>();
	const std::optional<MmoWorld::FInteractTarget> Candidate = Controller ? Controller->InteractCandidate() : std::nullopt;
	const MmoWorld::EInteractKind Kind = Candidate ? Candidate->Kind : MmoWorld::EInteractKind::None;
	if (static_cast<uint8>(Kind) == ShownInteract)
	{
		return;
	}
	ShownInteract = static_cast<uint8>(Kind);
	// 그림은 아이콘 표(73)가 생기면 더한다.
	switch (Kind)
	{
	case MmoWorld::EInteractKind::PickUp: InteractButton->SetLabel(MmoText::Get(this, TEXT("interact.pickUp"))); break;
	case MmoWorld::EInteractKind::Gather: InteractButton->SetLabel(MmoText::Get(this, TEXT("interact.gather"))); break;
	case MmoWorld::EInteractKind::Talk: InteractButton->SetLabel(MmoText::Get(this, TEXT("interact.talk"))); break;
	default: InteractButton->SetLabel(MmoText::Get(this, TEXT("interact.none"))); break;
	}
	InteractButton->SetIsEnabled(Kind != MmoWorld::EInteractKind::None);
}

void UMmoHudWidget::ShowTarget()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const auto& Entities = Session->World().Entities();
	const auto Found = Entities.find(Session->Combat().Target());
	if (Found == Entities.end())
	{
		if (ShownTarget != 0)
		{
			ShownTarget = 0;
			TargetPanel->SetVisibility(ESlateVisibility::Collapsed);
		}
		return;
	}

	const portfolio::mmo::EntityEnter& Info = Found->second.Info;
	if (ShownTarget != Found->first)
	{
		ShownTarget = Found->first;
		ShownTargetHp = MAX_uint64;
		FString Name = UTF8_TO_TCHAR(Info.name().c_str());
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_SUMMON)
		{
			// 소환수(95)는 이름만(레벨이 없음).
			const portfolio::mmo::data::MonstersRow* Summon = Session->Data().Monster(Info.template_id());
			Name = Summon ? MmoText::Get(this, UTF8_TO_TCHAR(Summon->name_key().c_str())).ToString() : FString();
		}
		else if (const portfolio::mmo::data::MonstersRow* Row = Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER ? Session->Data().Monster(Info.template_id()) : nullptr)
		{
			Name = MmoText::Format(this, TEXT("hud.level"), { MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString(), FString::FromInt(Row->level()) }).ToString();
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			Name = MmoText::Format(this, TEXT("hud.level"), { Name, FString::FromInt(Info.level()) }).ToString();
		}
		TargetNameText->SetText(FText::FromString(Name));
		// 귓속말 버튼만 누를 수 있게 판은 자식만 입력을 받는다(41).
		TargetPanel->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
		const bool bOtherPlayer = Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER && Found->first != Session->World().SelfId();
		WhisperButton->SetVisibility(bOtherPlayer ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	}
	// 초대 버튼은 파티가 바뀌어도 맞게 프레임마다 정한다(42).
	const MmoWorld::FParty& Party = Session->Party();
	const bool bCanInvite = Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER && Found->first != Session->World().SelfId() && !Party.Contains(Found->first)
		&& (Party.Id() == 0 || Party.LeaderId() == Session->World().SelfId());
	PartyInviteButton->SetVisibility(bCanInvite ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	ShowBar(*TargetHpBar, *TargetHpText, Info.hp(), Info.max_hp(), ShownTargetHp);
}

void UMmoHudWidget::NativeConstruct()
{
	Super::NativeConstruct();
	// 조이스틱은 터치 기기(와 Mac에서 -faketouches로 시험할 때)에만 보인다.
	const bool bTouch = FPlatformMisc::SupportsTouchInput() || FSlateApplication::Get().IsFakingTouchEvents();
	Joystick->SetVisibility(bTouch ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	// 채팅창은 생성기가 조이스틱 위에 두었다. 조이스틱이 없으면 그 자리로 내린다(41).
	if (!bTouch)
	{
		Cast<UCanvasPanelSlot>(ChatBox->Slot)->SetPosition(Cast<UCanvasPanelSlot>(Joystick->Slot)->GetPosition());
	}
	ShownZone = MAX_uint32;
	ShownHp = MAX_uint64;
	ShownMp = MAX_uint64;
	ShownTarget = MAX_uint32;
	ShownSlots.Reset();
	ShownEffects = TEXT("-");
	ShownProgress = MAX_uint32;
	ShownInteract = MAX_uint8;
	ShownExp = MAX_uint32;
	if (UMmoEntitySubsystem* Entities = GetWorld()->GetSubsystem<UMmoEntitySubsystem>())
	{
		GrowthHandle = Entities->OnGrowthEvent.AddUObject(this, &UMmoHudWidget::HandleGrowthEvent);
	}
}

void UMmoHudWidget::NativeDestruct()
{
	if (UMmoEntitySubsystem* Entities = GetWorld() ? GetWorld()->GetSubsystem<UMmoEntitySubsystem>() : nullptr)
	{
		Entities->OnGrowthEvent.Remove(GrowthHandle);
	}
	Super::NativeDestruct();
}

void UMmoHudWidget::HandleGrowthEvent(const MmoWorld::FGrowthEvent& Event)
{
	UMmoUiManager* Ui = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>();
	if (Event.Kind == MmoWorld::FGrowthEvent::EKind::ExpGained)
	{
		Ui->ShowNotice(MmoText::Format(this, TEXT("notice.exp"), { FString::FromInt(Event.Value) }));
	}
	else if (Event.bMine)
	{
		Ui->ShowNotice(MmoText::Format(this, TEXT("notice.levelUp"), { FString::FromInt(Event.Value) }));
	}
}

void UMmoHudWidget::ShowExp()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const double Ratio = Session->World().ExpRatio(Session->Data());
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const bool bMax = Me && !Session->Data().Level(static_cast<uint32>(Me->Info.character_class()), Me->Info.level() + 1);
	// 천분율로 견줘 바뀔 때만 채운다. 최대 레벨은 따로 둔다(비율이 같은 1이라도 글이 다름).
	const uint32 Shown = bMax ? 1001 : static_cast<uint32>(Ratio * 1000);
	if (Shown == ShownExp)
	{
		return;
	}
	ShownExp = Shown;
	ExpBar->SetPercent(static_cast<float>(Ratio));
	ExpText->SetText(bMax ? MmoText::Get(this, TEXT("hud.expMax")) : FText::FromString(FString::Printf(TEXT("%.1f%%"), Ratio * 100.0)));
}

void UMmoHudWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (Session->Strings().Version() != ShownLanguage)
	{
		ShownLanguage = Session->Strings().Version();
		ShownZone = MAX_uint32;
		ShownTarget = MAX_uint32;
		ShownSlots.Reset();
		ShownEffects = TEXT("-");
		ShownProgress = MAX_uint32;
		ShownInteract = MAX_uint8;
		ShownExp = MAX_uint32;
	}
	const MmoWorld::FSelfState& Vitals = Session->World().SelfState();
	ShowBar(*HpBar, *HpText, Vitals.Hp, Vitals.MaxHp, ShownHp);
	ShowBar(*MpBar, *MpText, Vitals.Mp, Vitals.MaxMp, ShownMp);
	ShowExp();
	ShowTarget();
	const double Now = FPlatformTime::Seconds();
	const double ServerTick = Session->World().Clock().Now(Now);
	ShowSlots(ServerTick);
	ShowProgress(Now);
	ShowEffects(ServerTick);
	if (const AMmoPlayerController* Controller = GetOwningPlayer<AMmoPlayerController>())
	{
		AutoButton->SetSelected(Controller->IsAutoHunting());
	}
	ForceButton->SetSelected(Session->Combat().IsForceAttack());
	ShowMinimap(Now);
	ShowInteract();
	ShowParty();
	ShowBoss();
	ShowQuest();
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->UpdateInvite();
	ShowStats(InDeltaTime);
	// 실패한 요청의 이유를 알림 층에 띄운다(93의 알림 틀). 요청 번호가 있는 요청의 실패와 얻은 것(32)도 같다.
	UMmoUiManager* Ui = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>();
	for (const portfolio::mmo::FailReason Reason : Session->Combat().TakeNotices())
	{
		Ui->ShowNotice(MmoText::Get(this, UTF8_TO_TCHAR(MmoWorld::FailKey(Reason))));
	}
	if (Session->Combat().TakeForceNotice())
	{
		Ui->ShowNotice(MmoText::Get(this, TEXT("notice.forceAttack")));
	}
	for (const MmoWorld::FRequestFailure& Failure : Session->Inventory().TakeFailures())
	{
		Ui->ShowNotice(MmoText::Get(this, UTF8_TO_TCHAR(MmoWorld::FailKey(Failure.Reason))));
	}
	if (Session->World().TakeRevivedOnEnter())
	{
		Ui->ShowNotice(MmoText::Get(this, TEXT("notice.revivedOnEnter")));
	}
	// 필드 보스의 등장(43): 알림 층의 글과 소리. 죽음은 채팅의 시스템 줄로만 알린다.
	for (const uint32_t Boss : Session->Bosses().TakeAppeared())
	{
		const portfolio::mmo::data::MonstersRow* Row = Session->Data().Monster(Boss);
		Ui->ShowNotice(MmoText::Format(this, TEXT("notice.bossAppeared"), { Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString() }));
		if (UMmoCueSubsystem* Cues = GetWorld()->GetSubsystem<UMmoCueSubsystem>())
		{
			Cues->PlayUi(EMmoCue::UiBossAppeared);
		}
	}
	for (const uint32_t Skill : Session->Skills().TakeLearned())
	{
		const portfolio::mmo::data::SkillsRow* Row = Session->Data().Skill(Skill);
		Ui->ShowNotice(MmoText::Format(this, TEXT("notice.skillLearned"), { Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString() }));
	}
	for (const MmoWorld::FItemGain& Gain : Session->Inventory().TakeGains())
	{
		if (Gain.Reason == portfolio::mmo::GAIN_REASON_PICK_UP)
		{
			if (UMmoCueSubsystem* Cues = GetWorld()->GetSubsystem<UMmoCueSubsystem>())
			{
				Cues->PlayUi(EMmoCue::UiPickUp);
			}
		}
		const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(Gain.ItemId);
		Ui->ShowNotice(Item
			? MmoText::Format(this, TEXT("notice.gainItem"), { MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString(), FString::FromInt(Gain.Count) })
			: MmoText::Format(this, TEXT("notice.gainGold"), { FText::AsNumber(static_cast<uint64>(Gain.Gold)).ToString() }));
	}

	const MmoWorld::FFieldMap* Field = Session->Field();
	const APawn* Self = GetOwningPlayerPawn();
	if (!Field || !Self)
	{
		ShowZone(0);
		return;
	}

	// 내 캐릭터는 이동 컴포넌트가 옮기므로 월드 모델이 아니라 액터의 자리로 구역을 구한다.
	const FVector Location = Self->GetActorLocation();
	ShowZone(Field->ZoneAt(MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location)));
}

void UMmoHudWidget::ShowBar(UProgressBar& Bar, UTextBlock& Text, uint32 Value, uint32 Max, uint64& Shown)
{
	const uint64 Pair = (static_cast<uint64>(Value) << 32) | Max;
	if (Pair == Shown)
	{
		return;
	}

	Shown = Pair;
	Bar.SetPercent(Max == 0 ? 0.0f : static_cast<float>(Value) / Max);
	Text.SetText(FText::FromString(FString::Printf(TEXT("%u / %u"), Value, Max)));
}

void UMmoHudWidget::ShowZone(uint32 Zone)
{
	if (Zone == ShownZone)
	{
		return;
	}

	ShownZone = Zone;
	const portfolio::mmo::data::ZonesRow* Row = nullptr;
	for (const portfolio::mmo::data::ZonesRow& Candidate : GetGameInstance()->GetSubsystem<UMmoSession>()->Data().Zones.rows())
	{
		Row = Candidate.id() == Zone ? &Candidate : Row;
	}

	if (!Row)
	{
		ZoneText->SetText(FText::GetEmpty());
		SafeZoneText->SetVisibility(ESlateVisibility::Collapsed);
		return;
	}

	const FText Name = MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str()));
	ZoneText->SetText(Row->has_min_level() && Row->has_max_level()
		? MmoText::Format(this, TEXT("hud.zone"), { Name.ToString(), FString::FromInt(Row->min_level()), FString::FromInt(Row->max_level()) })
		: Name);
	SafeZoneText->SetVisibility(Row->safe() ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
}

void UMmoHudWidget::HandleMinimapClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleMap();
}

void UMmoHudWidget::ShowMinimap(double Now)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FFieldMap* Field = Session->Field();
	const APawn* Self = GetOwningPlayerPawn();
	if (!Field || !Self || Now < NextMinimap)
	{
		return;
	}
	NextMinimap = Now + 0.2;
	if (!MinimapTexture)
	{
		// 바탕 그림은 격자에서 한 번 만든다(화면을 찍지 않음).
		MinimapTexture = MmoMapDrawing::MakeTexture(this, *Field);
	}
	const FVector Location = Self->GetActorLocation();
	const std::vector<MmoWorld::FMapPoint> Points = MmoWorld::FMapView::Points(*Field, Session->Data(), MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location),
		MmoCoordinates::ToYaw(Self->GetActorRotation()), Session->Party().Positions(Session->World()), Session->Bosses().Positions(), QuestGoalOf(*Session, Location));
	// 화면과 같은 방향으로 돌린다(97: 카메라가 북동쪽을 위로 봄). 돌린 사각형이 틀을 다 덮도록 Cover배 넓은 범위를 그려 Cover배 키우고
	// 틀 밖은 자른다(축척은 그대로). 점은 바탕과 같은 변환을 받고, 화살표는 내 방향에서 카메라의 방위를 뺀다.
	constexpr double Cover = 1.45;
	const float CameraYaw = GetOwningPlayer() ? static_cast<float>(GetOwningPlayer()->GetControlRotation().Yaw) : 0.0f;
	const double Span = MinimapMeters / Field->GridSize() * Cover;
	const double MinU = Points[0].U - Span / 2;
	const double MinV = Points[0].V - Span / 2;
	FSlateBrush Brush;
	Brush.SetResourceObject(MinimapTexture);
	Brush.ImageSize = FVector2D(MinimapSize, MinimapSize);
	Brush.SetUVRegion(FBox2f(FVector2f(MinU, MinV), FVector2f(MinU + Span, MinV + Span)));
	MinimapImage->SetBrush(Brush);
	MmoMapDrawing::PlaceDots(*MinimapDots, MinimapDotPool, Points, MinU, MinV, Span, MinimapSize);
	const FWidgetTransform Turned(FVector2D::ZeroVector, FVector2D(Cover, Cover), FVector2D::ZeroVector, -CameraYaw);
	MinimapImage->SetRenderTransform(Turned);
	MinimapDots->SetRenderTransform(Turned);
	if (UPanelWidget* Stack = MinimapImage->GetParent())
	{
		Stack->SetClipping(EWidgetClipping::ClipToBounds);
	}
	MinimapArrow->SetRenderTransformAngle(static_cast<float>(Points[0].YawDegrees) - CameraYaw);
}
