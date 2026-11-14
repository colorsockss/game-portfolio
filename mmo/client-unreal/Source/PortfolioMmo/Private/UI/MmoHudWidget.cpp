#include "UI/MmoHudWidget.h"

#include "Blueprint/WidgetTree.h"
#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoPlayerController.h"
#include "UI/MmoButtonWidget.h"
#include "GameFramework/Pawn.h"
#include "Net/MmoSession.h"
#include "UI/MmoJoystickWidget.h"
#include "World/CombatState.h"
#include "World/Units.h"

namespace
{
	/** 스킬의 짧은 이름. shortcut: Strings의 키의 마지막 마디(74 전). 문자열 테이블이 생기면 그 글로 바꾼다. */
	FString ShortName(const portfolio::mmo::data::SkillsRow& Skill)
	{
		const FString Key = UTF8_TO_TCHAR(Skill.name_key().c_str());
		int32 Dot = INDEX_NONE;
		return Key.FindLastChar(TEXT('.'), Dot) ? Key.Mid(Dot + 1) : Key;
	}

	/** 효과의 글자 아이콘(아이콘 표는 73). */
	const TCHAR* EffectLabel(portfolio::mmo::data::EffectKind Kind)
	{
		switch (Kind)
		{
		case portfolio::mmo::data::EFFECT_KIND_STUN: return TEXT("기절");
		case portfolio::mmo::data::EFFECT_KIND_SLOW: return TEXT("감속");
		case portfolio::mmo::data::EFFECT_KIND_ATTACK_UP: return TEXT("공격↑");
		case portfolio::mmo::data::EFFECT_KIND_DEFENSE_UP: return TEXT("방어↑");
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
		const std::vector<uint32_t> Skills = MmoWorld::FCombatState::Quickslots(Session->Data(), Class);
		SlotSkills.Init(0, Slots.Num());
		for (int32 Index = 0; Index < Slots.Num(); ++Index)
		{
			const portfolio::mmo::data::SkillsRow* Skill = Index < static_cast<int32>(Skills.size()) ? Session->Data().Skill(Skills[Index]) : nullptr;
			SlotSkills[Index] = Skill ? Skill->id() : 0;
			Slots[Index]->SetLabel(Skill ? FText::FromString(ShortName(*Skill)) : FText::GetEmpty());
			// 키 표시는 PC만(키 표는 89, 크기와 규칙은 93).
			Slots[Index]->SetKeyHint(UMmoButtonWidget::IsTouchDevice() ? FText::GetEmpty() : FText::AsNumber(Index + 1));
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
		CastText->SetText(Skill ? FText::FromString(ShortName(*Skill)) : FText::GetEmpty());
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
		Add(TEXT("전투"), Session->World().SelfState().CombatEndTick);
	}
	for (int32 Index = 0; Me && Index < Me->Info.effects_size(); ++Index)
	{
		const portfolio::mmo::EffectState& Effect = Me->Info.effects(Index);
		if (const portfolio::mmo::data::EffectsRow* Row = Session->Data().Effect(Effect.effect_id()))
		{
			Add(EffectLabel(Row->kind()), Effect.end_tick());
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
			// shortcut: 이름은 Strings의 키 그대로(74 전).
			Name = FString::Printf(TEXT("%s  Lv %u"), UTF8_TO_TCHAR(Row->name_key().c_str()), Row->level());
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			Name += FString::Printf(TEXT("  Lv %u"), Info.level());
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
}

void UMmoHudWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FSelfState& Vitals = Session->World().SelfState();
	ShowBar(*HpBar, *HpText, Vitals.Hp, Vitals.MaxHp, ShownHp);
	ShowBar(*MpBar, *MpText, Vitals.Mp, Vitals.MaxMp, ShownMp);
	ShowTarget();
	const double Now = FPlatformTime::Seconds();
	const double ServerTick = Session->World().Clock().Now(Now);
	ShowSlots(ServerTick);
	ShowProgress(Now);
	ShowEffects(ServerTick);

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

	// shortcut: 이름은 Strings의 키를 그대로 보인다. 문자열 테이블(backlog 74)이 생기면 그 글로 바꾼다.
	FString Text = UTF8_TO_TCHAR(Row->name_key().c_str());
	if (Row->has_min_level() && Row->has_max_level())
	{
		Text += FString::Printf(TEXT("  Lv %u–%u"), Row->min_level(), Row->max_level());
	}
	ZoneText->SetText(FText::FromString(Text));
	SafeZoneText->SetVisibility(Row->safe() ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
}
