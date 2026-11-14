#include "UI/MmoHudWidget.h"

#include "UI/MmoText.h"
#include "Blueprint/WidgetTree.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntitySubsystem.h"
#include "Game/MmoPlayerController.h"
#include "Input/MmoKeys.h"
#include "UI/MmoButtonWidget.h"
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

void UMmoHudWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	AttackButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleAttackClicked);
	TargetButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleTargetClicked);
	InteractButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleInteractClicked);
	SettingsButton->OnClicked.AddDynamic(this, &UMmoHudWidget::HandleSettingsClicked);
	CharacterButton->OnClickedNative.AddWeakLambda(this, [this] { GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ToggleCharacter(); });
	// 메뉴의 키 표시는 키 표의 키다(설정 창은 뒤로 가기의 키가 연다). 창이 아직 없는 버튼은 그 항목이 잇기 전까지 누를 수 없다.
	const TPair<UMmoButtonWidget*, EMmoAction> Menus[] = {
		{ BagButton, EMmoAction::Bag }, { CharacterButton, EMmoAction::Character }, { SkillsButton, EMmoAction::Skills },
		{ QuestButton, EMmoAction::Quest }, { SettingsButton, EMmoAction::Back },
	};
	for (const TPair<UMmoButtonWidget*, EMmoAction>& Menu : Menus)
	{
		Menu.Key->SetKeyHint(MmoKeys::Hint(Menu.Value));
		Menu.Key->SetIsEnabled(Menu.Key == SettingsButton || Menu.Key == CharacterButton);
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
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const uint32 Class = Me ? static_cast<uint32>(Me->Info.character_class()) : 0;
	if (Class != SlotClass)
	{
		SlotClass = Class;
		if (!Icons)
		{
			Icons = LoadObject<UMmoIcons>(nullptr, UMmoIcons::Path);
		}
		const std::vector<uint32_t> Skills = MmoWorld::FCombatState::Quickslots(Session->Data(), Class);
		SlotSkills.Init(0, Slots.Num());
		for (int32 Index = 0; Index < Slots.Num(); ++Index)
		{
			const portfolio::mmo::data::SkillsRow* Skill = Index < static_cast<int32>(Skills.size()) ? Session->Data().Skill(Skills[Index]) : nullptr;
			SlotSkills[Index] = Skill ? Skill->id() : 0;
			Slots[Index]->SetIcon(Skill && Icons ? Icons->Load(EMmoIconKind::Skill, Skill->id()) : nullptr,
				Skill ? MmoText::Get(this, UTF8_TO_TCHAR(Skill->name_key().c_str())) : FText::GetEmpty());
			// 키 표시는 PC만(크기와 규칙은 93).
			Slots[Index]->SetKeyHint(MmoKeys::Hint(MmoKeys::Slot(Index)));
		}
	}

	for (int32 Index = 0; Index < Slots.Num(); ++Index)
	{
		const portfolio::mmo::data::SkillsRow* Skill = SlotSkills[Index] != 0 ? Session->Data().Skill(SlotSkills[Index]) : nullptr;
		SlotShades[Index]->SetPercent(Skill ? static_cast<float>(Session->Combat().Cooldowns().Remaining(Skill->id(), Skill->cooldown_ms(), ServerTick)) : 0.0f);
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
		const portfolio::mmo::data::SkillsRow* Skill = Session->Data().Skill(Me->Info.progress().id());
		CastText->SetText(Skill ? MmoText::Get(this, UTF8_TO_TCHAR(Skill->name_key().c_str())) : FText::GetEmpty());
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
		if (const portfolio::mmo::data::MonstersRow* Row = Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER ? Session->Data().Monster(Info.template_id()) : nullptr)
		{
			Name = MmoText::Format(this, TEXT("hud.level"), { MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString(), FString::FromInt(Row->level()) }).ToString();
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			Name = MmoText::Format(this, TEXT("hud.level"), { Name, FString::FromInt(Info.level()) }).ToString();
		}
		TargetNameText->SetText(FText::FromString(Name));
		TargetPanel->SetVisibility(ESlateVisibility::HitTestInvisible);
	}
	ShowBar(*TargetHpBar, *TargetHpText, Info.hp(), Info.max_hp(), ShownTargetHp);
}

void UMmoHudWidget::NativeConstruct()
{
	Super::NativeConstruct();
	// 조이스틱은 터치 기기(와 Mac에서 -faketouches로 시험할 때)에만 보인다.
	const bool bTouch = FPlatformMisc::SupportsTouchInput() || FSlateApplication::Get().IsFakingTouchEvents();
	Joystick->SetVisibility(bTouch ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	ShownZone = MAX_uint32;
	ShownHp = MAX_uint64;
	ShownMp = MAX_uint64;
	ShownTarget = MAX_uint32;
	SlotClass = MAX_uint32;
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
		SlotClass = MAX_uint32;
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
	ShowInteract();
	ShowStats(InDeltaTime);
	// 실패한 요청의 이유를 알림 층에 띄운다(93의 알림 틀).
	for (const portfolio::mmo::FailReason Reason : Session->Combat().TakeNotices())
	{
		GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ShowNotice(MmoText::Get(this, UTF8_TO_TCHAR(MmoWorld::FailKey(Reason))));
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
