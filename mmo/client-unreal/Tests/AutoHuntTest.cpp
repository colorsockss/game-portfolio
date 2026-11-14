// 자동 사냥(World/AutoHunt, 40)의 판단을 UE 없이 본다. 월드 모델은 패킷으로 꾸민다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <set>
#include <string>
#include <vector>

#include "World/AutoHunt.h"

namespace
{
	using MmoWorld::EAutoAction;
	using MmoWorld::FAutoDecision;
	using portfolio::mmo::Packet;

	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	constexpr int32_t M = 32;
	constexpr uint32_t Me = 1;

	/** 시험 데이터: 기사(사거리 2 m)와 마법사, 몬스터 1(일반)과 9(보스), 기사의 스킬 101 단일·102 기절·103 방어력 올림(효과 3)·104 자기 중심 범위(4 m),
	 * 마법사의 203 회복, 물약 2001(체력)·2003(마나), 재료 3001, 장비 1001, 골드 4001. 기준은 30%, 범위 30 m. */
	MmoData::FGameData Data()
	{
		MmoData::FGameData Result;
		Result.Constants.set_auto_hunt_range(30);
		Result.Constants.set_auto_hunt_hp_percent(30);
		Result.Constants.set_auto_hunt_mp_percent(30);
		Result.Constants.set_inventory_slots(3);
		for (const auto& [Id, Range] : { std::pair<uint32_t, double>{ 1, 2 }, { 2, 12 } })
		{
			portfolio::mmo::data::ClassesRow* Row = Result.Classes.add_rows();
			Row->set_id(Id);
			Row->set_attack_range(Range);
		}
		for (const auto& [Id, Kind] : { std::pair<uint32_t, portfolio::mmo::data::MonsterKind>{ 1, portfolio::mmo::data::MONSTER_KIND_NORMAL }, { 9, portfolio::mmo::data::MONSTER_KIND_BOSS } })
		{
			portfolio::mmo::data::MonstersRow* Row = Result.Monsters.add_rows();
			Row->set_id(Id);
			Row->set_kind(Kind);
		}
		const auto Skill = [&Result](uint32_t Id, portfolio::mmo::data::SkillKind Kind, portfolio::mmo::data::SkillCenter Center, uint32_t Effect, double Radius)
		{
			portfolio::mmo::data::SkillsRow* Row = Result.Skills.add_rows();
			Row->set_id(Id);
			Row->set_class_(Id / 100);
			Row->set_kind(Kind);
			Row->set_center(Center);
			Row->set_range(2);
			Row->set_mp(10);
			Row->set_cooldown_ms(1000);
			if (Effect != 0)
			{
				Row->set_effect(Effect);
			}
			if (Radius > 0)
			{
				Row->set_radius(Radius);
			}
		};
		Skill(101, portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 0, 0);
		Skill(102, portfolio::mmo::data::SKILL_KIND_DEBUFF, portfolio::mmo::data::SKILL_CENTER_TARGET, 1, 0);
		Skill(103, portfolio::mmo::data::SKILL_KIND_BUFF, portfolio::mmo::data::SKILL_CENTER_SELF, 3, 0);
		Skill(104, portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE, portfolio::mmo::data::SKILL_CENTER_SELF, 0, 4);
		Skill(203, portfolio::mmo::data::SKILL_KIND_HEAL, portfolio::mmo::data::SKILL_CENTER_SELF, 0, 0);
		for (const auto& [Id, Kind] : { std::pair<uint32_t, portfolio::mmo::data::EffectKind>{ 1, portfolio::mmo::data::EFFECT_KIND_STUN }, { 3, portfolio::mmo::data::EFFECT_KIND_DEFENSE_UP } })
		{
			portfolio::mmo::data::EffectsRow* Row = Result.Effects.add_rows();
			Row->set_id(Id);
			Row->set_kind(Kind);
		}
		const auto Item = [&Result](uint32_t Id, portfolio::mmo::data::ItemKind Kind, portfolio::mmo::data::ItemUse Use, bool bStackable)
		{
			portfolio::mmo::data::ItemsRow* Row = Result.Items.add_rows();
			Row->set_id(Id);
			Row->set_kind(Kind);
			Row->set_use(Use);
			Row->set_stackable(bStackable);
		};
		Item(2001, portfolio::mmo::data::ITEM_KIND_CONSUMABLE, portfolio::mmo::data::ITEM_USE_HEAL_HP, true);
		Item(2003, portfolio::mmo::data::ITEM_KIND_CONSUMABLE, portfolio::mmo::data::ITEM_USE_HEAL_MP, true);
		Item(3001, portfolio::mmo::data::ITEM_KIND_MATERIAL, portfolio::mmo::data::ITEM_USE_NONE, true);
		Item(1001, portfolio::mmo::data::ITEM_KIND_EQUIPMENT, portfolio::mmo::data::ITEM_USE_NONE, false);
		Item(4001, portfolio::mmo::data::ITEM_KIND_GOLD, portfolio::mmo::data::ITEM_USE_NONE, true);
		return Result;
	}

	/** 벽이 없는 128 m 필드. */
	MmoWorld::FFieldMap OpenField()
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(128);
		Grid.set_depth(128);
		Grid.set_origin_x(-64);
		Grid.set_origin_z(-64);
		Grid.set_cells(std::string(128 * 128, '\0'));
		return *MmoWorld::FFieldMap::Make(128, {}, Grid);
	}

	/** 판단에 쓰는 모델을 한데 둔 장면. 나는 원점에 서 있고 서버의 지금 틱은 100이다. */
	struct FScene
	{
		MmoData::FGameData Game = Data();
		MmoWorld::FWorldState World;
		MmoWorld::FFieldMap Field = OpenField();
		MmoWorld::FInventory Inventory;
		MmoWorld::FSkillBook Skills;
		MmoWorld::FCooldowns Cooldowns;
		std::set<uint32_t> Excluded;
		uint32_t Target = 0;
		bool bAttacking = false;
		bool bAwaiting = false;
		MmoWorld::FPoint Self{ 0, 0 };

		explicit FScene(uint32_t Class = 1)
		{
			Packet Entered;
			Entered.mutable_enter_world_result()->set_self_id(Me);
			Entered.mutable_enter_world_result()->set_tick(100);
			World.Apply(Entered, 0);
			Packet Enter;
			portfolio::mmo::EntityEnter* Player = Enter.mutable_entities_enter()->add_entities();
			Player->set_id(Me);
			Player->set_kind(portfolio::mmo::ENTITY_KIND_PLAYER);
			Player->set_character_class(static_cast<portfolio::mmo::CharacterClass>(Class));
			World.Apply(Enter, 0);
			Vitals(100, 100);
			Learn({ 101, 102, 103, 104, 203 });
			Bag({ { 2001, 5 }, { 2003, 5 } });
		}

		void Vitals(uint32_t Hp, uint32_t Mp)
		{
			Packet Stats;
			Stats.mutable_self_stats()->set_max_hp(100);
			Stats.mutable_self_stats()->set_max_mp(100);
			World.Apply(Stats, 0);
			Packet Now;
			Now.mutable_self_vitals()->set_hp(Hp);
			Now.mutable_self_vitals()->set_mp(Mp);
			World.Apply(Now, 0);
		}

		void Learn(std::vector<uint32_t> Ids)
		{
			Packet Learned;
			for (const uint32_t Id : Ids)
			{
				Learned.mutable_learned_skills()->add_skills(Id);
			}
			Skills.Apply(Learned);
		}

		/** 퀵슬롯: 양수는 스킬, 2000대는 물약. */
		void Bar(std::vector<uint32_t> Ids)
		{
			Packet Slots;
			Slots.mutable_quickslots();
			for (const uint32_t Id : Ids)
			{
				portfolio::mmo::Quickslot* Slot = Slots.mutable_quickslots()->add_slots();
				Slot->set_kind(Id >= 1000 ? portfolio::mmo::QUICKSLOT_KIND_ITEM : portfolio::mmo::QUICKSLOT_KIND_SKILL);
				Slot->set_id(Id);
			}
			Skills.Apply(Slots);
		}

		void Bag(std::vector<std::pair<uint32_t, uint32_t>> Items)
		{
			Packet Whole;
			uint32_t Index = 0;
			for (const auto& [Id, Count] : Items)
			{
				portfolio::mmo::ItemSlot* Slot = Whole.mutable_inventory()->add_slots();
				Slot->set_index(Index++);
				Slot->set_item_id(Id);
				Slot->set_count(Count);
			}
			Inventory.Apply(Whole);
		}

		void Monster(uint32_t Id, int32_t XMeters, uint32_t Template = 1)
		{
			Packet Enter;
			portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(portfolio::mmo::ENTITY_KIND_MONSTER);
			Entity->set_template_id(Template);
			Entity->set_x(XMeters * M);
			Entity->set_max_hp(10);
			Entity->set_hp(10);
			World.Apply(Enter, 0);
		}

		void Loot(uint32_t Id, int32_t XMeters, uint32_t ItemId, uint32_t Owner = 0, bool bDropped = false)
		{
			Packet Enter;
			portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(portfolio::mmo::ENTITY_KIND_GROUND_ITEM);
			Entity->set_x(XMeters * M);
			Entity->set_item_id(ItemId);
			Entity->set_count(1);
			Entity->set_dropped_by_player(bDropped);
			if (Owner != 0)
			{
				Entity->set_owner_player_id(Owner);
				Entity->set_owner_only_end_tick(200);
			}
			World.Apply(Enter, 0);
		}

		void SelfEffect(uint32_t EffectId)
		{
			Packet Applied;
			Applied.mutable_effect_applied()->set_id(Me);
			Applied.mutable_effect_applied()->mutable_effect()->set_effect_id(EffectId);
			Applied.mutable_effect_applied()->mutable_effect()->set_end_tick(10000);
			World.Apply(Applied, 0);
		}

		void Cooldown(uint32_t Key)
		{
			portfolio::mmo::Cooldowns Ends;
			portfolio::mmo::Cooldown* Entry = Ends.add_entries();
			if (Key & 0x80000000u)
			{
				Entry->set_potion(Key & 0x7fffffffu);
			}
			else
			{
				Entry->set_skill_id(Key);
			}
			Entry->set_end_tick(10000);
			Cooldowns.Apply(Ends);
		}

		FAutoDecision Decide(double ServerTick = 100)
		{
			return MmoWorld::FAutoHunt::Decide({ World, Game, Field, Inventory, Skills, Cooldowns, Self, { 0, 0 }, Target, bAttacking, bAwaiting, 0, ServerTick, Excluded });
		}
	};

	/** 고를 몬스터도 주울 것도 없으면 기다리고, 범위 밖의 몬스터와 보스는 고르지 않으며, 가장 가까운 몬스터를 고른다. */
	void TargetsAreTheNearestNormalMonstersInRange()
	{
		FScene Scene;
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "nothing to hunt is a wait");
		Scene.Monster(2, 40);
		Scene.Monster(3, 5, 9);
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "monsters beyond 30 m and bosses are not picked");
		Scene.Monster(4, 20);
		Scene.Monster(5, 8);
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::SelectTarget, 5 }), "the nearest normal monster in range is picked");
		Scene.Target = 3;
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::SelectTarget, 5 }), "a boss target is replaced instead of attacked");
		Scene.Target = 2;
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::SelectTarget, 5 }), "a target beyond 30 m is replaced");
		Scene.Excluded = { 5 };
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::SelectTarget, 4 }), "an excluded monster is skipped");
	}

	/** 사거리 밖이면 다가가고(효과가 없는 강화가 먼저), 안이면 공격을 시작한 뒤 쿨다운이 돈 스킬을 앞자리부터 쓴다. 강화 효과가 있으면 쓰지 않고,
	 * 기절 스킬도 쿨다운마다, 자기 중심 범위는 대상이 범위 안일 때만 쓰며, 퀵슬롯에 없는 스킬은 쓰지 않는다. */
	void SkillsFollowTheBarAndTheirRules()
	{
		FScene Scene;
		Scene.Monster(2, 10);
		Scene.Target = 2;
		Scene.Bar({ 103, 102, 101 });
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::UseSkill, 103 }), "a missing buff comes before approaching");
		Scene.SelfEffect(3);
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::Approach, 2 }), "with the buff on it approaches");
		Scene.Self = { 9 * M, 0 };
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::Attack, 2 }), "in range it starts attacking");
		Scene.bAttacking = true;
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::UseSkill, 102 }), "the stun skill is used like a damage skill, front slot first");
		Scene.Cooldown(102);
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::UseSkill, 101 }), "the next slot is used while the first cools down");
		Scene.Cooldown(101);
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "nothing ready is a wait");

		FScene Around;
		Around.Monster(2, 2);
		Around.Target = 2;
		Around.bAttacking = true;
		Around.Bar({ 104 });
		Expect((Around.Decide() == FAutoDecision{ EAutoAction::UseSkill, 104 }), "an area around me is used with the target inside");

		FScene Mage(2);
		Mage.Monster(2, 8);
		Mage.Target = 2;
		Mage.bAttacking = true;
		Mage.Bar({ 104 });
		Expect(Mage.Decide() == FAutoDecision{ EAutoAction::Wait }, "an area around me waits while the target is outside it");
		Mage.Bar({ 104, 101 });
		Expect((Mage.Decide() == FAutoDecision{ EAutoAction::UseSkill, 101 }), "the next slot is used instead");
		Mage.Bar({});
		Expect(Mage.Decide() == FAutoDecision{ EAutoAction::Wait }, "skills not on the bar are not used");
	}

	/** 체력이 기준 아래면 회복 스킬이 먼저이고 쿨다운이면 물약, 회복 스킬이 없는 기사는 물약. 마나가 기준 아래면 마나 물약. 쓸 것이 없으면 사냥을 이어 간다.
	 * 퀵슬롯에 없는 물약과 가진 수 0의 물약은 쓰지 않는다. */
	void HealingComesFirstWhenLow()
	{
		FScene Mage(2);
		Mage.Bar({ 203, 2001, 2003 });
		Mage.Vitals(20, 100);
		Expect((Mage.Decide() == FAutoDecision{ EAutoAction::UseSkill, 203 }), "a low mage heals with the skill first");
		Mage.Cooldown(203);
		Expect((Mage.Decide() == FAutoDecision{ EAutoAction::UsePotion, 2001 }), "a cooling heal falls back to the potion");

		FScene Knight;
		Knight.Bar({ 101, 2001, 2003 });
		Knight.Vitals(20, 10);
		Expect((Knight.Decide() == FAutoDecision{ EAutoAction::UsePotion, 2001 }), "a knight without a heal drinks");
		Knight.Cooldown(0x80000001u);
		Expect((Knight.Decide() == FAutoDecision{ EAutoAction::UsePotion, 2003 }), "low mana drinks the mana potion");
		Knight.Cooldown(0x80000002u);
		Knight.Monster(2, 5);
		Expect((Knight.Decide() == FAutoDecision{ EAutoAction::SelectTarget, 2 }), "with nothing usable it keeps hunting");

		FScene Empty;
		Empty.Bar({ 101 });
		Empty.Vitals(20, 100);
		Expect(Empty.Decide() == FAutoDecision{ EAutoAction::Wait }, "a potion not on the bar is not used");
		Empty.Bar({ 2001 });
		Empty.Bag({ { 2003, 5 } });
		Expect(Empty.Decide() == FAutoDecision{ EAutoAction::Wait }, "a potion with none left is not used");
	}

	/** 기절, 진행 중인 일, 답을 기다리는 동안은 체력이 낮아도 물약을 쓰지 않고 대상이 멀어도 다가가지 않으며 기다린다. 죽으면 끈다. */
	void BusyStatesWait()
	{
		FScene Scene;
		Scene.Bar({ 2001 });
		Scene.Vitals(20, 100);
		Scene.Monster(2, 10);
		Scene.Target = 2;
		Scene.bAwaiting = true;
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "waiting for an answer waits");
		Scene.bAwaiting = false;
		Packet Casting;
		Casting.mutable_progress()->set_id(Me);
		Casting.mutable_progress()->mutable_state()->set_kind(portfolio::mmo::PROGRESS_KIND_CAST);
		Casting.mutable_progress()->mutable_state()->set_end_tick(10000);
		Scene.World.Apply(Casting, 0);
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "casting waits");

		FScene Stunned;
		Stunned.Bar({ 2001 });
		Stunned.Vitals(20, 100);
		Stunned.SelfEffect(1);
		Expect(Stunned.Decide() == FAutoDecision{ EAutoAction::Wait }, "a stun waits");

		FScene Dead;
		Packet Died;
		Died.mutable_died()->set_id(Me);
		Dead.World.Apply(Died, 0);
		Expect(Dead.Decide() == FAutoDecision{ EAutoAction::Stop }, "death stops");
	}

	/** 대상이 죽으면 줍는다. 30 m 밖, 플레이어가 떨어뜨린 것, 남이 주인인 것은 고르지 않고 주인만 줍는 시간이 지나면 고른다. 빈 칸이 없으면 이미 가진 겹치는
	 * 아이템과 골드는 줍고 새 아이템은 둔다. */
	void LootFollowsOwnersAndRoom()
	{
		FScene Scene;
		Scene.Loot(10, 40, 3001);
		Scene.Loot(11, 3, 3001, 0, true);
		Scene.Loot(12, 4, 3001, 99);
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "far, dropped and others' loot is left");
		Expect((Scene.Decide(200) == FAutoDecision{ EAutoAction::PickUp, 12 }), "others' loot is picked after the owner-only time");
		Scene.Monster(2, 6);
		Packet Died;
		Died.mutable_died()->set_id(2);
		Scene.World.Apply(Died, 0);
		Scene.Target = 2;
		Scene.Loot(13, 5, 1001, Me);
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::PickUp, 13 }), "a dead target makes it pick up my loot");
		Scene.Bag({ { 2001, 5 }, { 3001, 1 }, { 2003, 1 } });
		Expect(Scene.Decide() == FAutoDecision{ EAutoAction::Wait }, "a new item without room is left");
		Scene.Loot(14, 7, 3001, Me);
		Scene.Loot(15, 9, 4001, Me);
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::PickUp, 14 }), "a held stackable fits a full bag");
		Scene.Excluded = { 14 };
		Expect((Scene.Decide() == FAutoDecision{ EAutoAction::PickUp, 15 }), "gold always fits");
	}

	/** 후보에서 빼기: "공격할 수 없는 대상"의 실패와 같은 이유의 시전 취소는 그때의 대상을 빼고 다른 이유는 빼지 않는다. 10초가 지나면 돌아온다.
	 * 3초 동안 가까워지지 못하면 빼되, 기다리기 동안은 세지 않는다. */
	void ExclusionsFollowFailuresAndStalls()
	{
		MmoWorld::FAutoHuntState State;
		State.Start({ 0, 0 });
		Packet Failed;
		Failed.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_OUT_OF_RANGE);
		Failed.mutable_action_failed()->set_request(portfolio::mmo::REQUEST_KIND_ATTACK);
		State.OnPacket(Failed, Me, 5, 0, 10);
		Expect(State.Excluded(0).empty(), "another reason does not exclude");
		Failed.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_INVALID_TARGET);
		State.OnPacket(Failed, Me, 5, 0, 10);
		Packet Cancelled;
		Cancelled.mutable_progress_cancelled()->set_id(Me);
		Cancelled.mutable_progress_cancelled()->set_reason(portfolio::mmo::FAIL_REASON_INVALID_TARGET);
		State.OnPacket(Cancelled, Me, 6, 0, 10);
		Expect(State.Excluded(1) == std::set<uint32_t>{ 5, 6 }, "invalid targets and the cancelled cast's target are excluded");
		Expect(State.Excluded(10.5).empty(), "exclusions end after 10 s");

		MmoWorld::FAutoHuntState Stall;
		Stall.Start({ 0, 0 });
		const FAutoDecision Approach{ EAutoAction::Approach, 7 };
		Expect(!Stall.Observe(Approach, 10 * M, 0, 3, 10), "the first approach starts the clock");
		Expect(!Stall.Observe(Approach, 10 * M, 2, 3, 10), "two stalled seconds are not enough");
		Expect(!Stall.Observe({ EAutoAction::Wait }, 10 * M, 2.2, 3, 10), "a wait pauses the clock");
		Expect(!Stall.Observe(Approach, 10 * M, 5, 3, 10), "time spent waiting is not counted");
		Expect(Stall.Observe(Approach, 10 * M, 6, 3, 10) && Stall.Excluded(6) == std::set<uint32_t>{ 7 }, "one more stalled second excludes the target");
		MmoWorld::FAutoHuntState Moving;
		Moving.Start({ 0, 0 });
		Moving.Observe(Approach, 10 * M, 0, 3, 10);
		Moving.Observe(Approach, 8 * M, 2, 3, 10);
		Expect(!Moving.Observe(Approach, 6 * M, 4, 3, 10), "getting closer resets the clock");
	}
}

int main()
{
	TargetsAreTheNearestNormalMonstersInRange();
	SkillsFollowTheBarAndTheirRules();
	HealingComesFirstWhenLow();
	BusyStatesWait();
	LootFollowsOwnersAndRoom();
	ExclusionsFollowFailuresAndStalls();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("AutoHunt tests passed\n");
	return EXIT_SUCCESS;
}
