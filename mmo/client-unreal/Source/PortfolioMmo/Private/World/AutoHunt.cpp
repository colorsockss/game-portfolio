#include "World/AutoHunt.h"

#include <cmath>
#include <limits>

#include "World/CombatState.h"
#include "World/Interaction.h"
#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		using portfolio::mmo::data::SkillsRow;

		double Distance(int32_t AX, int32_t AZ, int32_t BX, int32_t BZ)
		{
			return std::hypot(static_cast<double>(AX) - BX, static_cast<double>(AZ) - BZ);
		}

		bool InRange(const FAutoHuntInput& In, int32_t X, int32_t Z)
		{
			return Distance(In.Origin.X, In.Origin.Z, X, Z) <= In.Data.Constants.auto_hunt_range() * Units::PerMeter;
		}

		/** 퀵슬롯에 올린 스킬 가운데 Pick이 참인 것을 앞자리부터 하나(쿨다운이 돌고 마나가 됨). */
		template <typename FPick>
		const SkillsRow* SkillOnBar(const FAutoHuntInput& In, FPick Pick)
		{
			const uint32_t Mp = In.World.SelfState().Mp;
			for (const portfolio::mmo::Quickslot& Slot : In.Skills.Slots())
			{
				const SkillsRow* Skill = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_SKILL ? In.Data.Skill(Slot.id()) : nullptr;
				if (Skill && In.Skills.IsLearned(Skill->id()) && Mp >= Skill->mp() && In.Cooldowns.IsReady(Skill->id(), In.ServerTick) && Pick(*Skill))
				{
					return Skill;
				}
			}
			return nullptr;
		}

		/** 퀵슬롯에 올린 물약 가운데 그 쓰는 종류의 것을 앞자리부터 하나(가진 수가 있고 쿨다운이 돎). 없으면 0. */
		uint32_t PotionOnBar(const FAutoHuntInput& In, portfolio::mmo::data::ItemUse Use)
		{
			if (!In.Cooldowns.IsReady(FCooldowns::PotionKey(Use), In.ServerTick))
			{
				return 0;
			}
			for (const portfolio::mmo::Quickslot& Slot : In.Skills.Slots())
			{
				const portfolio::mmo::data::ItemsRow* Item = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_ITEM ? In.Data.Item(Slot.id()) : nullptr;
				if (Item && Item->use() == Use && In.Inventory.CountOf(Item->id()) > 0)
				{
					return Item->id();
				}
			}
			return 0;
		}

		bool Below(uint32_t Value, uint32_t Max, uint32_t Percent)
		{
			return Max > 0 && static_cast<uint64_t>(Value) * 100 < static_cast<uint64_t>(Max) * Percent;
		}

		/** 줍기의 후보: 내가 지금 주울 수 있고 플레이어가 떨어뜨린 것이 아니며 범위 안이고 들어갈 자리가 있는(골드는 늘) 바닥 아이템 가운데 가장 가까운 것. */
		uint32_t NearestLoot(const FAutoHuntInput& In)
		{
			uint32_t Best = 0;
			double BestDistance = std::numeric_limits<double>::max();
			for (const auto& [Id, Entity] : In.World.Entities())
			{
				const portfolio::mmo::EntityEnter& Info = Entity.Info;
				if (Info.kind() != portfolio::mmo::ENTITY_KIND_GROUND_ITEM || Info.dropped_by_player() || In.Excluded.count(Id) > 0 || !InRange(In, Entity.X, Entity.Z)
					|| !FInteraction::CanPickUp(Info, In.World.SelfId(), In.ServerTick, In.PartyId))
				{
					continue;
				}
				const portfolio::mmo::data::ItemsRow* Item = In.Data.Item(Info.item_id());
				if (!Item || (Item->kind() != portfolio::mmo::data::ITEM_KIND_GOLD && !In.Inventory.HasRoom(In.Data, Item->id())))
				{
					continue;
				}
				const double Far = Distance(In.Self.X, In.Self.Z, Entity.X, Entity.Z);
				if (Far < BestDistance || (Far == BestDistance && Id < Best))
				{
					Best = Id;
					BestDistance = Far;
				}
			}
			return Best;
		}

		/** 고를 수 있는 몬스터 가운데 내 자리에서 직선거리로 가장 가까운 것. */
		uint32_t NearestMonster(const FAutoHuntInput& In)
		{
			uint32_t Best = 0;
			double BestDistance = std::numeric_limits<double>::max();
			for (const auto& [Id, Entity] : In.World.Entities())
			{
				if (!FAutoHunt::IsHuntable(Entity, In))
				{
					continue;
				}
				const double Far = Distance(In.Self.X, In.Self.Z, Entity.X, Entity.Z);
				if (Far < BestDistance || (Far == BestDistance && Id < Best))
				{
					Best = Id;
					BestDistance = Far;
				}
			}
			return Best;
		}
	}

	bool FAutoHunt::IsHuntable(const FEntity& Entity, const FAutoHuntInput& In)
	{
		if (Entity.Info.kind() != portfolio::mmo::ENTITY_KIND_MONSTER || Entity.Info.dead() || In.Excluded.count(Entity.Id) > 0 || !InRange(In, Entity.X, Entity.Z))
		{
			return false;
		}
		const portfolio::mmo::data::MonstersRow* Row = In.Data.Monster(Entity.Info.template_id());
		return Row && Row->kind() != portfolio::mmo::data::MONSTER_KIND_BOSS;
	}

	FAutoDecision FAutoHunt::Decide(const FAutoHuntInput& In)
	{
		const FEntity* Me = In.World.SelfEntity();
		const FSelfState& Mine = In.World.SelfState();
		if (!Me || Mine.bDead)
		{
			return { EAutoAction::Stop };
		}
		// 움직이면 시전이 취소되고 다른 요청은 "진행 중"으로 실패하므로 체력과 마나도 보지 않고 기다린다.
		if (In.bAwaiting || Me->Info.has_progress() || In.World.SelfEffect(In.Data, portfolio::mmo::data::EFFECT_KIND_STUN, In.NowSeconds))
		{
			return { EAutoAction::Wait };
		}

		const portfolio::mmo::data::Constants& Constants = In.Data.Constants;
		if (Below(Mine.Hp, Mine.MaxHp, Constants.auto_hunt_hp_percent()))
		{
			if (const SkillsRow* Heal = SkillOnBar(In, [](const SkillsRow& Skill) { return Skill.kind() == portfolio::mmo::data::SKILL_KIND_HEAL; }))
			{
				return { EAutoAction::UseSkill, Heal->id() };
			}
			if (const uint32_t Potion = PotionOnBar(In, portfolio::mmo::data::ITEM_USE_HEAL_HP))
			{
				return { EAutoAction::UsePotion, Potion };
			}
		}
		if (Below(Mine.Mp, Mine.MaxMp, Constants.auto_hunt_mp_percent()))
		{
			if (const uint32_t Potion = PotionOnBar(In, portfolio::mmo::data::ITEM_USE_HEAL_MP))
			{
				return { EAutoAction::UsePotion, Potion };
			}
		}

		const auto Found = In.World.Entities().find(In.Target);
		if (Found == In.World.Entities().end() || !IsHuntable(Found->second, In))
		{
			if (const uint32_t Loot = NearestLoot(In))
			{
				return { EAutoAction::PickUp, Loot };
			}
			const uint32_t Next = NearestMonster(In);
			return Next != 0 ? FAutoDecision{ EAutoAction::SelectTarget, Next } : FAutoDecision{ EAutoAction::Wait };
		}

		// 소환(95)은 내 소환수가 없을 때 강화처럼 다가가기 전에 그 자리에서 쓴다.
		const FEntity* Summoned = In.World.MySummon();
		if (!Summoned || Summoned->Info.dead())
		{
			if (const SkillsRow* Summon = SkillOnBar(In, [](const SkillsRow& Skill) { return Skill.kind() == portfolio::mmo::data::SKILL_KIND_SUMMON; }))
			{
				return { EAutoAction::UseSkill, Summon->id() };
			}
		}

		// 강화는 효과가 내게 없을 때 대상까지의 거리와 상관없이 다가가기 전에 그 자리에서 쓴다.
		if (const SkillsRow* Buff = SkillOnBar(In, [&In](const SkillsRow& Skill)
			{
				return Skill.kind() == portfolio::mmo::data::SKILL_KIND_BUFF && Skill.has_effect()
					&& !In.World.SelfEffect(In.Data, In.Data.Effect(Skill.effect()) ? In.Data.Effect(Skill.effect())->kind() : portfolio::mmo::data::EFFECT_KIND_UNSPECIFIED, In.NowSeconds);
			}))
		{
			return { EAutoAction::UseSkill, Buff->id() };
		}

		const FEntity& Target = Found->second;
		const std::optional<FCombatState::FAttack> Attack = FCombatState::AttackOf(Me->Info, In.Data);
		if (!Attack || !FCombatState::CanStrikeFrom(In.Field, In.Self.X, In.Self.Z, Target, Attack->RangeMeters))
		{
			return { EAutoAction::Approach, Target.Id };
		}
		if (!In.bAttacking)
		{
			return { EAutoAction::Attack, Target.Id };
		}
		const double TargetDistance = Distance(In.Self.X, In.Self.Z, Target.X, Target.Z);
		if (const SkillsRow* Strike = SkillOnBar(In, [TargetDistance](const SkillsRow& Skill)
			{
				const bool bOffensive = Skill.kind() == portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE || Skill.kind() == portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE
					|| Skill.kind() == portfolio::mmo::data::SKILL_KIND_DEBUFF;
				// 중심이 자기인 범위 스킬은 대상이 그 범위 안에 있을 때만 쓴다.
				const bool bAroundMe = Skill.kind() == portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE && Skill.center() == portfolio::mmo::data::SKILL_CENTER_SELF;
				return bOffensive && (!bAroundMe || TargetDistance <= Skill.radius() * Units::PerMeter);
			}))
		{
			return { EAutoAction::UseSkill, Strike->id() };
		}
		return { EAutoAction::Wait };
	}

	void FAutoHuntState::Start(FPoint Here)
	{
		bOn = true;
		StartPoint = Here;
		Until.clear();
		Current.clear();
		Approaching = 0;
		Stalled = 0;
		LastApproach = -1;
	}

	void FAutoHuntState::Exclude(uint32_t Id, double NowSeconds, double Seconds)
	{
		if (Id != 0)
		{
			Until[Id] = NowSeconds + Seconds;
		}
	}

	const std::set<uint32_t>& FAutoHuntState::Excluded(double NowSeconds)
	{
		Current.clear();
		for (auto It = Until.begin(); It != Until.end();)
		{
			if (It->second <= NowSeconds)
			{
				It = Until.erase(It);
				continue;
			}
			Current.insert(It->first);
			++It;
		}
		return Current;
	}

	void FAutoHuntState::OnPacket(const portfolio::mmo::Packet& Packet, uint32_t SelfId, uint32_t Target, double NowSeconds, double Seconds)
	{
		const bool bFailed = Packet.body_case() == portfolio::mmo::Packet::kActionFailed && Packet.action_failed().reason() == portfolio::mmo::FAIL_REASON_INVALID_TARGET
			&& (Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_ATTACK || Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_SKILL);
		const bool bCancelled = Packet.body_case() == portfolio::mmo::Packet::kProgressCancelled && Packet.progress_cancelled().id() == SelfId
			&& Packet.progress_cancelled().reason() == portfolio::mmo::FAIL_REASON_INVALID_TARGET;
		if (bOn && (bFailed || bCancelled))
		{
			Exclude(Target, NowSeconds, Seconds);
		}
	}

	bool FAutoHuntState::Observe(const FAutoDecision& Decision, double Distance, double NowSeconds, double StallSeconds, double ExcludeSeconds)
	{
		if (Decision.Kind != EAutoAction::Approach)
		{
			// 다가가기가 끊기면 그 사이의 시간은 세지 않는다(쌓은 시간은 남김).
			LastApproach = -1;
			return false;
		}
		if (Decision.Id != Approaching)
		{
			Approaching = Decision.Id;
			BestDistance = Distance;
			Stalled = 0;
			LastApproach = NowSeconds;
			return false;
		}
		if (Distance < BestDistance - Units::PerMeter * 0.25)
		{
			BestDistance = Distance;
			Stalled = 0;
		}
		else if (LastApproach >= 0)
		{
			Stalled += NowSeconds - LastApproach;
		}
		LastApproach = NowSeconds;
		if (Stalled < StallSeconds)
		{
			return false;
		}
		Exclude(Approaching, NowSeconds, ExcludeSeconds);
		Approaching = 0;
		Stalled = 0;
		LastApproach = -1;
		return true;
	}
}
