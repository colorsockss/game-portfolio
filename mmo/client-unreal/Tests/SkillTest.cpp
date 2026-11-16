// 스킬 쓰기, 쿨다운, 효과, 진행 중인 일(World/의 CombatState, Cooldowns, WorldState)을 UE 없이 본다. 쿨다운의 규칙은 서버의
// WorldSkillTests가 낸 비교 벡터(mmo/shared/vectors/cooldowns.tsv)로 맞춘다. run.mjs가 빌드하고 실행한다.
#include <cmath>
#include <tuple>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "World/Party.h"
#include "World/CombatState.h"
#include "World/DevCommand.h"
#include "World/Latency.h"
#include "World/SkillBook.h"

namespace
{
	using MmoWorld::ECombatEventKind;
	using MmoWorld::FCombatState;
	using MmoWorld::FSkillStep;
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
	constexpr uint32_t Monster = 2;
	/** 시험의 서버 틱(EnterWorldResult). 내 시간 0초가 이 틱이다. */
	constexpr uint32_t Start = 100;

	/**
	 * 시험용 데이터: 101 단일(2 m), 103 강화(그 자리), 104 자기 중심 범위, 201 직선 발사체(12 m, 20 m/s), 202 대상 중심 범위(12 m, 시전 1.5초),
	 * 205 단일(12 m, 시전 2초).
	 * 쿨다운은 1초, 마나는 10이다. 효과 1은 기절, 2는 감속 50%다.
	 */
	MmoData::FGameData Data()
	{
		MmoData::FGameData Result;
		auto Skill = [&](uint32_t Id, portfolio::mmo::data::SkillKind Kind, portfolio::mmo::data::SkillCenter Center, double Range, uint32_t CastMs)
		{
			portfolio::mmo::data::SkillsRow* Row = Result.Skills.add_rows();
			Row->set_id(Id);
			Row->set_kind(Kind);
			Row->set_center(Center);
			Row->set_range(Range);
			Row->set_cast_ms(CastMs);
			Row->set_cooldown_ms(1000);
			Row->set_mp(10);
		};
		Skill(101, portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 2, 0);
		Skill(103, portfolio::mmo::data::SKILL_KIND_BUFF, portfolio::mmo::data::SKILL_CENTER_SELF, 0, 0);
		Skill(104, portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE, portfolio::mmo::data::SKILL_CENTER_SELF, 0, 0);
		Skill(201, portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 12, 0);
		Result.Skills.mutable_rows(Result.Skills.rows_size() - 1)->set_projectile_speed(20);
		Skill(202, portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 12, 1500);
		Skill(205, portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 12, 2000);
		Skill(203, portfolio::mmo::data::SKILL_KIND_HEAL, portfolio::mmo::data::SKILL_CENTER_SELF, 12, 0);
		portfolio::mmo::data::EffectsRow* Stun = Result.Effects.add_rows();
		Stun->set_id(1);
		Stun->set_kind(portfolio::mmo::data::EFFECT_KIND_STUN);
		portfolio::mmo::data::EffectsRow* Slow = Result.Effects.add_rows();
		Slow->set_id(2);
		Slow->set_kind(portfolio::mmo::data::EFFECT_KIND_SLOW);
		Slow->set_value(50);
		return Result;
	}

	Packet Enter(uint32_t Id, portfolio::mmo::EntityKind Kind, int32_t X, int32_t Z)
	{
		Packet Result;
		portfolio::mmo::EntityEnter* Entity = Result.mutable_entities_enter()->add_entities();
		Entity->set_id(Id);
		Entity->set_kind(Kind);
		Entity->set_x(X);
		Entity->set_z(Z);
		Entity->set_hp(100);
		Entity->set_max_hp(100);
		return Result;
	}

	Packet Effect(uint32_t Id, uint32_t EffectId, uint32_t EndTick)
	{
		Packet Result;
		Result.mutable_effect_applied()->set_id(Id);
		Result.mutable_effect_applied()->mutable_effect()->set_effect_id(EffectId);
		Result.mutable_effect_applied()->mutable_effect()->set_end_tick(EndTick);
		return Result;
	}

	Packet Cast(uint32_t Id, uint32_t SkillId, uint32_t EndTick)
	{
		Packet Result;
		Result.mutable_progress()->set_id(Id);
		Result.mutable_progress()->mutable_state()->set_kind(portfolio::mmo::PROGRESS_KIND_CAST);
		Result.mutable_progress()->mutable_state()->set_id(SkillId);
		Result.mutable_progress()->mutable_state()->set_end_tick(EndTick);
		return Result;
	}

	Packet Failed(portfolio::mmo::RequestKind Request)
	{
		Packet Result;
		Result.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_COOLDOWN);
		Result.mutable_action_failed()->set_request(Request);
		return Result;
	}

	Packet Used(uint32_t Caster, uint32_t SkillId, uint32_t Target)
	{
		Packet Result;
		Result.mutable_skill_used()->set_caster_id(Caster);
		Result.mutable_skill_used()->set_skill_id(SkillId);
		Result.mutable_skill_used()->set_target_id(Target);
		return Result;
	}

	Packet Cooldown(uint32_t SkillId, uint32_t EndTick)
	{
		Packet Result;
		portfolio::mmo::Cooldown* Entry = Result.mutable_cooldowns()->add_entries();
		Entry->set_skill_id(SkillId);
		Entry->set_end_tick(EndTick);
		return Result;
	}

	/** 월드에 든 마법사(나, 1, 원점)와 몬스터(2, MonsterX m 동쪽). 마나는 100이고 서버 틱은 Start다. */
	struct FScene
	{
		MmoData::FGameData GameData = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;

		explicit FScene(int32_t MonsterX = 1)
		{
			Packet Entered;
			Entered.mutable_enter_world_result()->set_self_id(Me);
			Entered.mutable_enter_world_result()->set_tick(Start);
			Apply(Entered);
			Apply(Enter(Me, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0));
			Apply(Enter(Monster, portfolio::mmo::ENTITY_KIND_MONSTER, MonsterX * M, 0));
			Packet Vitals;
			Vitals.mutable_self_vitals()->set_hp(100);
			Vitals.mutable_self_vitals()->set_mp(100);
			Apply(Vitals);
			Combat.SetTarget(Monster);
		}

		std::optional<Packet> Apply(const Packet& Packet, double Now = 0)
		{
			World.Apply(Packet, Now);
			return Combat.Apply(Packet, World, GameData, Now);
		}

		/** 스킬을 누르고 원점에서 바로 보낸다. 보낸 패킷이다(실패하면 비었음). */
		MmoWorld::FSkillFire Fire(uint32_t SkillId, const MmoWorld::FFieldMap& Field)
		{
			MmoWorld::FMoveSender Sender;
			if (Combat.PressSkill(SkillId, World, GameData, 0) != portfolio::mmo::FAIL_REASON_NONE || Combat.UpdateSkill(World, Field, GameData, 0, 0).Kind != FSkillStep::EKind::Fire)
			{
				return {};
			}
			return Combat.FireSkill(World, GameData, Sender, 0, 0, 0, 0);
		}
	};

	/** 빈 Size m 필드. Safe의 x 칸(m)들은 안전 지대이고, Walls의 x 칸(m)들은 z 전체가 벽이다. */
	MmoWorld::FFieldMap Field(uint32_t Size, std::vector<int32_t> Safe = {}, std::vector<int32_t> Walls = {})
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		const int32_t Min = -static_cast<int32_t>(Size) / 2;
		Grid.set_origin_x(Min);
		Grid.set_origin_z(Min);
		std::string Cells(static_cast<size_t>(Size) * Size, '\0');
		for (const int32_t X : Walls)
		{
			for (uint32_t Row = 0; Row < Size; ++Row)
			{
				Cells[Row * Size + static_cast<uint32_t>(X - Min)] = 1;
			}
		}
		Grid.set_cells(Cells);
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		for (const int32_t X : Safe)
		{
			portfolio::mmo::data::ZonesRow* Zone = Zones.Add();
			Zone->set_id(1);
			Zone->set_min_x(X);
			Zone->set_max_x(X + 1);
			Zone->set_min_z(Min);
			Zone->set_max_z(-Min);
			Zone->set_safe(true);
		}
		return *MmoWorld::FFieldMap::Make(Size, Zones, Grid);
	}

	/** 서버가 낸 쿨다운의 비교 벡터(쿨다운 ms, 쓴 틱, 묻는 틱, 쓸 수 있는지, 끝나는 틱)와 같은 답을 낸다. */
	void MatchesTheServerVectors(const std::string& Folder)
	{
		std::ifstream File(Folder + "/cooldowns.tsv");
		Expect(File.good(), "the cooldown vectors exist");
		int Rows = 0;
		std::string Line;
		while (std::getline(File, Line))
		{
			if (Line.empty() || Line[0] == '#')
			{
				continue;
			}
			std::istringstream Fields(Line);
			uint32_t CooldownMs = 0, Used = 0, Asked = 0, Ready = 0, End = 0;
			Fields >> CooldownMs >> Used >> Asked >> Ready >> End;
			++Rows;
			if (MmoWorld::FCooldowns::EndTick(Used, CooldownMs) != End || MmoWorld::FCooldowns::Ready(End, Asked) != (Ready == 1))
			{
				std::printf("FAIL: cooldown %u ms used at %u asked at %u\n", CooldownMs, Used, Asked);
				++Failures;
			}
		}
		Expect(Rows > 0, "the cooldown vectors have rows");
	}

	/** 미리 돌린 쿨다운은 스킬의 실패로 되돌아가고, 다른 요청의 실패로는 그대로이며, Cooldowns가 오면 서버의 값으로 맞춰진다. */
	void PredictedCooldownsRevertOnlyOnSkillFailures()
	{
		const MmoWorld::FFieldMap Map = Field(32);
		FScene Scene;
		const MmoWorld::FSkillFire Fire = Scene.Fire(101, Map);
		Expect(Fire.Packets.size() == 1 && Fire.Packets[0].use_skill().skill_id() == 101 && Fire.Packets[0].use_skill().target_id() == Monster, "the skill is sent at the target");
		Expect(Scene.Combat.Cooldowns().End(101) == Start + 20, "the cooldown turns when the skill is sent");
		Expect(Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_BUSY, "a second skill waits for the answer");
		Scene.Apply(Failed(portfolio::mmo::REQUEST_KIND_ATTACK));
		Expect(Scene.Combat.Cooldowns().End(101) == Start + 20, "an attack failure keeps the predicted cooldown");
		Scene.Combat.TakeEvents();
		Scene.Apply(Failed(portfolio::mmo::REQUEST_KIND_SKILL));
		Expect(Scene.Combat.Cooldowns().End(101) == 0, "a skill failure turns the cooldown back");
		const std::vector<MmoWorld::FCombatEvent> Events = Scene.Combat.TakeEvents();
		Expect(Events.size() == 1 && Events[0].Kind == ECombatEventKind::Interrupt && Events[0].Target == Me, "a skill failure interrupts my motion");

		Scene.Fire(101, Map);
		Scene.Apply(Cooldown(101, Start + 30));
		Scene.Apply(Failed(portfolio::mmo::REQUEST_KIND_SKILL));
		Expect(Scene.Combat.Cooldowns().End(101) == Start + 30, "the server's cooldown wins over the prediction");
		Expect(Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_COOLDOWN, "the cooldown blocks the skill");
		Expect(Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 30.0 / 20) == portfolio::mmo::FAIL_REASON_NONE, "the skill is ready at its end tick");
	}

	/** 내 스킬의 동작은 보낼 때 한 번만 쌓이고 SkillUsed나 Progress가 와도 다시 쌓이지 않는다. 남의 사건과 ProgressCancelled는 쌓인다. */
	void MySkillMotionStartsOnce()
	{
		const MmoWorld::FFieldMap Map = Field(32);
		FScene Scene;
		Scene.Fire(101, Map);
		Scene.Apply(Used(Me, 101, Monster));
		Scene.Apply(Used(0, 101, Monster));
		std::vector<MmoWorld::FCombatEvent> Events = Scene.Combat.TakeEvents();
		Expect(Events.size() == 2 && Events[0].Kind == ECombatEventKind::Skill && Events[0].Attacker == Me && Events[0].bMine && Events[1].Attacker == 0,
			"my skill starts once and others' skills come in");

		Scene.Fire(205, Map);
		Scene.Apply(Cast(Me, 205, Start + 40));
		Scene.Apply(Cast(Monster, 205, Start + 40));
		Packet Cancelled;
		Cancelled.mutable_progress_cancelled()->set_id(Me);
		Cancelled.mutable_progress_cancelled()->set_reason(portfolio::mmo::FAIL_REASON_CANCELLED);
		Scene.Apply(Cancelled);
		Events = Scene.Combat.TakeEvents();
		Expect(Events.size() == 3 && Events[0].Kind == ECombatEventKind::ProgressStart && Events[0].Target == Me && Events[1].Kind == ECombatEventKind::ProgressStart
				&& Events[1].Target == Monster
				&& Events[2].Kind == ECombatEventKind::Interrupt && Events[2].Target == Me,
			"my cast starts once, others' casts and cancels come in");
		Expect(!Scene.World.SelfEntity()->Info.has_progress() && Scene.World.Entities().at(Monster).Info.has_progress(), "ProgressCancelled clears my cast");
	}

	/** 끝나는 틱이 지난 효과와 진행 중인 일은 패킷 없이 빠지고, 같은 효과는 끝나는 틱만 바뀌며, Died를 받은 개체의 효과는 빈다. */
	void EffectsAndProgressExpireOnTheirOwn()
	{
		FScene Scene;
		Scene.Apply(Effect(Monster, 2, Start + 10));
		Scene.Apply(Effect(Monster, 2, Start + 12));
		Scene.Apply(Cast(Monster, 202, Start + 30));
		const MmoWorld::FEntity& Target = Scene.World.Entities().at(Monster);
		Expect(Target.Info.effects_size() == 1 && Target.Info.effects(0).end_tick() == Start + 12, "the same effect only renews its end");
		const std::optional<double> Half = Scene.World.ProgressRatio(Target, Scene.GameData, 15.0 / 20);
		Expect(Half && *Half > 0.49 && *Half < 0.51, "half of a 30 tick cast has passed after 15 ticks");
		{
			// 귀환(32)의 길이는 쓴 아이템의 쓰는 시간이다(3초 = 60틱).
			FScene Recall;
			portfolio::mmo::data::ItemsRow* Scroll = Recall.GameData.Items.add_rows();
			Scroll->set_id(2005);
			Scroll->set_use_ms(3000);
			Packet Started = Cast(Monster, 2005, Start + 60);
			Started.mutable_progress()->mutable_state()->set_kind(portfolio::mmo::PROGRESS_KIND_RECALL);
			Recall.Apply(Started);
			const std::optional<double> Quarter = Recall.World.ProgressRatio(Recall.World.Entities().at(Monster), Recall.GameData, 15.0 / 20);
			Expect(Quarter && *Quarter > 0.24 && *Quarter < 0.26, "a recall's length is its item's use time");
		}
		Scene.World.Expire(11.0 / 20);
		Expect(Target.Info.effects_size() == 1, "the effect stays before its end tick");
		Scene.World.Expire(12.0 / 20);
		Expect(Target.Info.effects_size() == 0 && Target.Info.has_progress(), "the effect leaves at its end tick");
		Scene.World.Expire(30.0 / 20);
		Expect(!Target.Info.has_progress(), "the cast leaves at its end tick");

		Scene.Apply(Effect(Monster, 1, Start + 100));
		Scene.Apply(Cast(Monster, 202, Start + 30));
		Packet Died;
		Died.mutable_died()->set_id(Monster);
		Scene.Apply(Died);
		Expect(Target.Info.effects_size() == 0 && !Target.Info.has_progress(), "Died clears effects and progress");
	}

	/** 내게 걸린 감속의 값과 기절을 답하고, 기절한 동안에는 스킬을 누를 수 없다. 공격 중에 기절한 동안 대상이 풀리면 AttackStop을 보낸다. */
	void MySlowAndStunAreAnswered()
	{
		FScene Scene;
		Expect(!Scene.World.SelfEffect(Scene.GameData, portfolio::mmo::data::EFFECT_KIND_SLOW, 0), "no slow at first");
		Scene.Apply(Effect(Me, 2, Start + 60));
		Expect(Scene.World.SelfEffect(Scene.GameData, portfolio::mmo::data::EFFECT_KIND_SLOW, 0).value_or(0) == 50, "my slow is 50%");
		Expect(!Scene.World.SelfEffect(Scene.GameData, portfolio::mmo::data::EFFECT_KIND_SLOW, 3), "the slow ends at its end tick");

		Scene.Combat.StartAttack(Me);
		Scene.Apply(Effect(Me, 1, Start + 40));
		Expect(Scene.World.SelfEffect(Scene.GameData, portfolio::mmo::data::EFFECT_KIND_STUN, 0).has_value(), "I am stunned");
		Expect(Scene.Combat.PressSkill(104, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_STUNNED, "a stunned player cannot press skills");
		const std::optional<Packet> Stop = Scene.Combat.SetTarget(0);
		Expect(Stop && Stop->has_attack_stop(), "releasing the target while stunned still stops the attack");
	}

	/**
	 * 사거리 밖의 대상에게는 다가간 뒤에 보내고, 안전 지대 안에서 사거리 안의 몬스터에게는 안전 지대 밖으로 나간 뒤에 보낸다.
	 * 대상을 잡은 채 회복·강화·자기 중심 범위 스킬은 다가가지 않고 바로 보낸다. 대상이 필요한 스킬은 대상이 없으면 보내지 않는다.
	 */
	void TargetSkillsApproachAndSelfSkillsFireInPlace()
	{
		const MmoWorld::FFieldMap Map = Field(32, { -1, 0 });
		FScene Scene(5);
		Expect(Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_NONE, "the skill is pressed");
		const FSkillStep Far = Scene.Combat.UpdateSkill(Scene.World, Map, Scene.GameData, 0, 0);
		Expect(Far.Kind == FSkillStep::EKind::Approach && Far.Goal.X == 5 * M, "an out of range target is approached");
		const FSkillStep Safe = Scene.Combat.UpdateSkill(Scene.World, Map, Scene.GameData, 4 * M - M / 2, 0);
		Expect(Safe.Kind == FSkillStep::EKind::Fire, "it fires within range outside the safe zone");
		Scene.Apply(Enter(Monster, portfolio::mmo::ENTITY_KIND_MONSTER, M + M / 2, 0));
		const FSkillStep Inside = Scene.Combat.UpdateSkill(Scene.World, Map, Scene.GameData, M / 2, 0);
		Expect(Inside.Kind == FSkillStep::EKind::Approach, "inside the safe zone a monster in range is still approached");
		Expect(Scene.Combat.UpdateSkill(Scene.World, Map, Scene.GameData, M + 4, 0).Kind == FSkillStep::EKind::Fire, "it fires once outside the safe zone");

		FScene Far20(20);
		const MmoWorld::FSkillFire Area = Far20.Fire(104, Map);
		Expect(Area.Packets.size() == 1 && Area.Packets[0].use_skill().target_id() == 0, "a self centered area skill fires in place without a target");
		Far20.Apply(Cooldown(104, 0));
		Far20.Apply(Used(Me, 104, Me));
		const MmoWorld::FSkillFire Buff = Far20.Fire(103, Map);
		Expect(Buff.Packets.size() == 1 && Buff.Packets[0].use_skill().target_id() == Monster, "a buff fires in place with the target held");

		FScene None;
		None.Combat.SetTarget(0);
		Expect(None.Combat.PressSkill(101, None.World, None.GameData, 0) == portfolio::mmo::FAIL_REASON_NO_TARGET, "a target skill needs a target");
	}

	/**
	 * 강제 공격(44): 꺼져 있으면 플레이어 대상의 공격과 피해 스킬을 보내지 않고 강제 공격의 알림을 쌓는다. 켜져 있으면 UseSkill에 표시가 실린다.
	 * 회복 스킬과, 플레이어를 대상으로 잡은 채 쓰는 자기 중심의 범위 스킬은 꺼져 있어도 다가가지 않고 표시 없이 보낸다.
	 */
	void PlayersNeedForceAttack()
	{
		constexpr uint32_t Other = 3;
		const MmoWorld::FFieldMap Map = Field(32);
		FScene Scene;
		Scene.Apply(Enter(Other, portfolio::mmo::ENTITY_KIND_PLAYER, M, 0));
		Scene.Combat.SetTarget(Other);
		Expect(!Scene.Combat.MayAttack(Scene.World, Other) && Scene.Combat.TakeForceNotice() && !Scene.Combat.TakeForceNotice(), "a player is not attacked without force");
		Expect(Scene.Combat.MayAttack(Scene.World, Monster), "a monster needs no force");
		Expect(Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_INVALID_TARGET && Scene.Combat.PendingSkill() == 0
			&& Scene.Combat.TakeForceNotice() && Scene.Combat.TakeNotices().empty(), "a damage skill on a player waits for force and shows its own notice");

		const MmoWorld::FSkillFire Heal = Scene.Fire(203, Map);
		Expect(Heal.Packets.size() == 1 && !Heal.Packets[0].use_skill().force_attack(), "a heal is sent without force");
		Scene.Apply(Used(Me, 203, Me));
		const MmoWorld::FSkillFire Area = Scene.Fire(104, Map);
		Expect(Area.Packets.size() == 1 && Area.Packets[0].use_skill().target_id() == 0 && !Area.Packets[0].use_skill().force_attack(),
			"a self centered area skill fires in place without force");
		Scene.Apply(Used(Me, 104, Me));

		Scene.Combat.SetForceAttack(true);
		Expect(Scene.Combat.MayAttack(Scene.World, Other) && !Scene.Combat.TakeForceNotice(), "force allows attacking a player");
		const MmoWorld::FSkillFire Hit = Scene.Fire(101, Map);
		Expect(Hit.Packets.size() == 1 && Hit.Packets[0].use_skill().target_id() == Other && Hit.Packets[0].use_skill().force_attack(), "the skill carries the force flag");
	}

	/**
	 * 소환수(95): 남의 소환수는 강제 공격을 켜야 치고, 내 소환수와 파티원의 소환수는 치지 않는다. 내 소환수가 있으면 공격 중이 아니어도 대상이 풀리거나 바뀔 때
	 * AttackStop을 보내고, 내가 죽어서 풀린 때는 보내지 않는다. 내 소환수가 주거나 받은 피해는 내 것이다.
	 */
	void SummonsChangeTargetingAndStops()
	{
		FScene Scene;
		const auto Summon = [&Scene](uint32_t Id, uint32_t Owner)
		{
			Packet Enter;
			portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(portfolio::mmo::ENTITY_KIND_SUMMON);
			Entity->set_summon_owner_id(Owner);
			Entity->set_hp(10);
			Entity->set_max_hp(10);
			Scene.Apply(Enter);
		};
		Scene.Apply(Enter(5, portfolio::mmo::ENTITY_KIND_PLAYER, 3 * M, 0));
		Summon(7, Me);
		Summon(8, 5);
		Expect(!Scene.Combat.MayAttack(Scene.World, 7) && !Scene.Combat.TakeForceNotice(), "my own summon is never attacked");
		Expect(!Scene.Combat.MayAttack(Scene.World, 8) && Scene.Combat.TakeForceNotice(), "another player's summon needs force");
		MmoWorld::FParty Party;
		Packet State;
		State.mutable_party_state()->set_party_id(1);
		State.mutable_party_state()->add_members()->set_id(Me);
		State.mutable_party_state()->add_members()->set_id(5);
		Party.Apply(State);
		Scene.Combat.SetForceAttack(true);
		Expect(Scene.Combat.MayAttack(Scene.World, 8) && !Scene.Combat.MayAttack(Scene.World, 8, &Party), "a party member's summon is never attacked");
		Expect(Scene.World.MySummon() && Scene.World.MySummon()->Id == 7, "the model knows my summon");

		Scene.Combat.SetTarget(Monster);
		const std::optional<Packet> Stop = Scene.Combat.SetTarget(0);
		Expect(Stop && Stop->has_attack_stop() && !Scene.Combat.IsAttacking(), "with a summon out releasing the target sends AttackStop");
		Packet Hit;
		Hit.mutable_damaged()->set_attacker_id(7);
		Hit.mutable_damaged()->set_target_id(Monster);
		Hit.mutable_damaged()->set_damage(4);
		Scene.Apply(Hit);
		const std::vector<MmoWorld::FCombatEvent> Events = Scene.Combat.TakeEvents();
		Expect(!Events.empty() && Events.back().bMine, "my summon's damage is mine");

		Scene.Combat.SetTarget(Monster);
		Packet Died;
		Died.mutable_died()->set_id(Me);
		const std::optional<Packet> AfterDeath = Scene.Apply(Died);
		Expect(!AfterDeath && Scene.Combat.Target() == 0, "my death releases the target without AttackStop");
	}

	/** 죽은 채 넘겨받은 내 개체(46): EntityEnter가 죽었다고 오면 내 상태가 죽음이 되고 사망 화면의 사건이 한 번 나며, 공격과 스킬을 보내지 않는다. */
	void ADeadTakeOverStartsDead()
	{
		FScene Scene;
		Packet Dead = Enter(Me, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0);
		Dead.mutable_entities_enter()->mutable_entities(0)->set_dead(true);
		Scene.Apply(Dead);
		Expect(Scene.World.SelfState().bDead && Scene.World.TakeDiedOnEnter() && !Scene.World.TakeDiedOnEnter(), "a dead self entity starts the death screen once");
		Expect(!Scene.Combat.StartAttack(Me) && Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0) == portfolio::mmo::FAIL_REASON_DEAD, "a dead takeover sends no requests");
	}

	/** 이동 입력을 쥔 채 시전 시간이 있는 스킬을 보내면 세우고 밀린 위치를 먼저 보내며, 쥐고 있던 입력은 한 번 놓을 때까지 막는다. */
	void CastsStopAndIgnoreTheHeldMove()
	{
		const MmoWorld::FFieldMap Map = Field(32);
		FScene Scene;
		MmoWorld::FMoveSender Sender;
		Packet Move;
		Sender.Update(1, 0, 0, 0, 0, *Move.mutable_move());
		Expect(Scene.Combat.AllowMove(true), "moving is allowed at first");
		Scene.Combat.PressSkill(205, Scene.World, Scene.GameData, 0);
		Expect(Scene.Combat.UpdateSkill(Scene.World, Map, Scene.GameData, 10, 0).Kind == FSkillStep::EKind::Fire, "the cast is ready");
		const MmoWorld::FSkillFire Fire = Scene.Combat.FireSkill(Scene.World, Scene.GameData, Sender, 10, 0, 0, 0);
		Expect(Fire.bStop && Fire.Packets.size() == 2 && Fire.Packets[0].move().x() == 10 && Fire.Packets[1].use_skill().skill_id() == 205,
			"a cast stops, flushes the position, then sends UseSkill");
		Expect(Scene.Combat.Cooldowns().End(205) == 0, "a cast does not predict its cooldown");
		Expect(!Scene.Combat.AllowMove(true), "the held move is ignored");
		Expect(Scene.Combat.AllowMove(false) && Scene.Combat.AllowMove(true), "a new move after letting go is allowed");
	}
}

namespace
{
	Packet Launched(uint32_t Id, uint32_t Caster, int32_t X, int32_t Z, uint32_t Tick, uint32_t Yaw, uint32_t Speed)
	{
		Packet Result;
		portfolio::mmo::ProjectileLaunched* Launch = Result.mutable_projectile_launched();
		Launch->set_id(Id);
		Launch->set_caster_id(Caster);
		Launch->set_x(X);
		Launch->set_z(Z);
		Launch->set_tick(Tick);
		Launch->set_yaw(Yaw);
		Launch->set_speed(Speed);
		return Result;
	}

	Packet Ended(uint32_t Id)
	{
		Packet Result;
		Result.mutable_projectile_ended()->set_id(Id);
		return Result;
	}

	bool Near(double A, double B)
	{
		return std::abs(A - B) < 1e-6;
	}

	/** 직선 발사체는 사건의 나간 자리와 틱에서 서버 틱에 따라 나아가고, 끝 사건과 쏜 쪽의 나감으로 지워지며, 모르는 번호의 끝은 버린다. */
	void LineProjectilesFollowTheirLaunch()
	{
		FScene Scene;
		Scene.Apply(Launched(7, Monster, 320, -64, Start + 2, 64, 640));
		Scene.Apply(Launched(8, Monster, 0, 0, Start + 3, 0, 640));
		Expect(Scene.Combat.LineProjectiles().size() == 2, "launched line projectiles are kept");
		const MmoWorld::FLineProjectile& Line = Scene.Combat.LineProjectiles()[0];
		const MmoWorld::FPose Before = Line.At(Start + 1);
		const MmoWorld::FPose Later = Line.At(Start + 12);
		Expect(Near(Before.X, 320) && Near(Before.Z, -64), "before its tick it waits where it left");
		Expect(Near(Later.X, 320 + 320) && Near(Later.Z, -64), "it moves speed × ticks ÷ 20 along its yaw");
		Expect(Near(Scene.Combat.LineProjectiles()[1].At(Start + 5.5).Z, 80), "fractional server ticks move it smoothly");

		Scene.Apply(Ended(99));
		Expect(Scene.Combat.LineProjectiles().size() == 2, "an unknown end is ignored");
		Scene.Apply(Ended(7));
		Expect(Scene.Combat.LineProjectiles().size() == 1 && Scene.Combat.LineProjectiles()[0].Id == 8, "an end removes that projectile");
		Packet Leave;
		Leave.mutable_entities_leave()->add_ids(Monster);
		Scene.Apply(Leave);
		Expect(Scene.Combat.LineProjectiles().empty(), "the caster leaving removes its projectiles");
	}

	/** 사거리(12 m) 밖의 파티원에게 쓰는 회복은 다가간 뒤 보내고, 파티원이 아닌 대상(몬스터)을 잡은 채 쓰면 그 자리에서 보낸다(42). */
	void HealsApproachPartyMembers()
	{
		const MmoWorld::FFieldMap Open = Field(64);
		FScene Scene(5);
		Scene.Apply(Enter(3, portfolio::mmo::ENTITY_KIND_PLAYER, 20 * M, 0));
		MmoWorld::FParty Party;
		Packet State;
		State.mutable_party_state()->set_party_id(1);
		State.mutable_party_state()->set_leader_id(Me);
		State.mutable_party_state()->add_members()->set_id(Me);
		State.mutable_party_state()->add_members()->set_id(3);
		Party.Apply(State);
		Scene.Combat.SetTarget(3);
		Scene.Combat.PressSkill(203, Scene.World, Scene.GameData, 0);
		const FSkillStep Far = Scene.Combat.UpdateSkill(Scene.World, Open, Scene.GameData, 0, 0, &Party);
		Expect(Far.Kind == FSkillStep::EKind::Approach && Far.Goal.X == 20 * M, "a far party member is approached before the heal");
		Expect(Scene.Combat.UpdateSkill(Scene.World, Open, Scene.GameData, 10 * M, 0, &Party).Kind == FSkillStep::EKind::Fire, "a member in range gets the heal");

		Scene.Combat.SetTarget(Monster);
		Expect(Scene.Combat.UpdateSkill(Scene.World, Open, Scene.GameData, 0, 0, &Party).Kind == FSkillStep::EKind::Fire, "a non-member target heals in place");
	}

	/**
	 * 직선 발사체의 스킬은 대상 없이 바로 보내고, 살아 있는 대상이 있으면 사거리 밖이거나 선이 막혔을 때 다가간 뒤 보낸다. 보내기 직전에
	 * 밀린 위치와 방향을 먼저 보내고(세우지는 않음), 대상은 살아 있을 때만 싣는다.
	 */
	void LineSkillsFireWithOrWithoutATarget()
	{
		const MmoWorld::FFieldMap Open = Field(64);
		FScene None;
		None.Combat.SetTarget(0);
		Expect(None.Combat.PressSkill(201, None.World, None.GameData, 0) == portfolio::mmo::FAIL_REASON_NONE, "a line skill needs no target");
		Expect(None.Combat.UpdateSkill(None.World, Open, None.GameData, 0, 0).Kind == FSkillStep::EKind::Fire, "without a target it fires at once");
		MmoWorld::FMoveSender Sender;
		Packet Move;
		Sender.Update(1, 0, 0, 0, 0, *Move.mutable_move());
		const MmoWorld::FSkillFire Fire = None.Combat.FireSkill(None.World, None.GameData, Sender, 10, 0, 64, 0);
		Expect(!Fire.bStop && Fire.Packets.size() == 2 && Fire.Packets[0].move().x() == 10 && Fire.Packets[0].move().yaw() == 64
			&& Fire.Packets[1].use_skill().skill_id() == 201 && Fire.Packets[1].use_skill().target_id() == 0,
			"it flushes the position and facing first, then sends UseSkill without a target");

		FScene Far(20);
		Expect(Far.Combat.PressSkill(201, Far.World, Far.GameData, 0) == portfolio::mmo::FAIL_REASON_NONE, "a line skill takes a far target");
		const FSkillStep Step = Far.Combat.UpdateSkill(Far.World, Open, Far.GameData, 0, 0);
		Expect(Step.Kind == FSkillStep::EKind::Approach && Step.Goal.X == 20 * M, "it walks toward a target out of range");
		const MmoWorld::FSkillFire Near5 = FScene(5).Fire(201, Open);
		Expect(!Near5.Packets.empty() && Near5.Packets.back().use_skill().target_id() == Monster, "a target in range gets the skill with its id");

		FScene Walled(5);
		Walled.Combat.PressSkill(201, Walled.World, Walled.GameData, 0);
		Expect(Walled.Combat.UpdateSkill(Walled.World, Field(64, {}, { 2 }), Walled.GameData, 0, 0).Kind == FSkillStep::EKind::Approach,
			"it walks around a wall before a target behind it");

		FScene Dead(5);
		Packet Died;
		Died.mutable_died()->set_id(Monster);
		Dead.Apply(Died);
		Dead.Combat.SetTarget(Monster);
		const MmoWorld::FSkillFire Facing = Dead.Fire(201, Open);
		Expect(!Facing.Packets.empty() && Facing.Packets.back().use_skill().target_id() == 0, "a dead target is not sent");
	}
}

namespace
{
	/** ActionFailed, 내 ProgressCancelled 가운데 "취소됨"이 아닌 것, 보내기 전에 걸린 스킬 누르기가 알림이 된다. "취소됨"과 남의 것은 되지 않는다. */
	void FailuresBecomeNotices()
	{
		FScene Scene;
		Packet Failed;
		Failed.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_OUT_OF_RANGE);
		Failed.mutable_action_failed()->set_request(portfolio::mmo::REQUEST_KIND_ATTACK);
		Scene.Apply(Failed);
		auto Cancel = [](uint32_t Id, portfolio::mmo::FailReason Reason)
		{
			Packet Result;
			Result.mutable_progress_cancelled()->set_id(Id);
			Result.mutable_progress_cancelled()->set_reason(Reason);
			return Result;
		};
		Scene.Apply(Cancel(Me, portfolio::mmo::FAIL_REASON_BLOCKED));
		Scene.Apply(Cancel(Me, portfolio::mmo::FAIL_REASON_CANCELLED));
		Scene.Apply(Cancel(Monster, portfolio::mmo::FAIL_REASON_BLOCKED));
		Packet Drained;
		Drained.mutable_self_vitals()->set_hp(100);
		Drained.mutable_self_vitals()->set_mp(0);
		Scene.Apply(Drained);
		Scene.Combat.PressSkill(101, Scene.World, Scene.GameData, 0);
		const std::vector<portfolio::mmo::FailReason> Notices = Scene.Combat.TakeNotices();
		Expect(Notices == std::vector<portfolio::mmo::FailReason>{ portfolio::mmo::FAIL_REASON_OUT_OF_RANGE, portfolio::mmo::FAIL_REASON_BLOCKED,
			portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MP }, "failed requests, my cast that failed its end check and a refused press are notices");
		Expect(Scene.Combat.TakeNotices().empty(), "notices are taken once");
	}

	/** LeaveWorld를 보내면(월드를 비움) 월드 밖이라 월드의 요청을 만들지 않는다. */
	void LeavingTheWorldStopsRequests()
	{
		FScene Scene;
		Expect(Scene.World.InWorld(), "inside the world after EnterWorldResult");
		Scene.World.Reset();
		Expect(!Scene.World.InWorld(), "outside the world after leaving");
	}

	/** 지연은 Ping을 보내고 Pong을 받기까지의 시간이고, 기다리던 Ping이 없는 Pong은 버린다. */
	void LatencyIsPingToPong()
	{
		MmoWorld::FLatency Latency;
		Latency.Received(1.0);
		Expect(!Latency.Milliseconds(), "a pong without a ping is ignored");
		Latency.Sent(10.0);
		Latency.Received(10.25);
		Expect(Latency.Milliseconds() && Near(*Latency.Milliseconds(), 250.0), "the latency is the time from ping to pong");
		Latency.Received(11.0);
		Expect(Near(*Latency.Milliseconds(), 250.0), "a second pong does not change it");
	}

	/** 개발 명령의 글 한 줄은 앞뒤 빈칸을 뺀 채 DevCommand로 나간다. */
	void DevCommandsCarryTheLine()
	{
		const Packet Command = MmoWorld::DevCommandPacket("  tp 100 -20 ");
		Expect(Command.has_dev_command() && Command.dev_command().line() == "tp 100 -20", "a dev command line is sent trimmed");
		Expect(MmoWorld::DevCommandPacket("   ").dev_command().line().empty(), "a blank line is sent empty");
	}

	/** 배운 스킬과 퀵슬롯(36): 전체와 하나의 반영, 배운 것만 사건, 퀵슬롯은 Quickslots가 와야 바뀜, 직업의 스킬은 테이블에서 번호 차례, 비우기 요청. */
	void SkillBookFollowsTheServer()
	{
		MmoData::FGameData Data;
		for (const auto& [Id, Class, Level] : { std::tuple<uint32_t, uint32_t, uint32_t>{ 102, 1, 5 }, { 201, 2, 1 }, { 101, 1, 1 } })
		{
			portfolio::mmo::data::SkillsRow* Row = Data.Skills.add_rows();
			Row->set_id(Id);
			Row->set_class_(Class);
			Row->set_level(Level);
		}
		const std::vector<const portfolio::mmo::data::SkillsRow*> Knight = MmoWorld::FSkillBook::ClassSkills(Data, 1);
		Expect(Knight.size() == 2 && Knight[0]->id() == 101 && Knight[1]->id() == 102 && Knight[1]->level() == 5, "class skills come from the table in id order");

		MmoWorld::FSkillBook Book;
		Expect(Book.Slots().size() == portfolio::mmo::CONSTANT_QUICKSLOT_COUNT && !Book.IsLearned(101), "an empty book has empty quickslots");
		Packet Whole;
		Whole.mutable_learned_skills()->add_skills(101);
		Book.Apply(Whole);
		Expect(Book.IsLearned(101) && !Book.IsLearned(102) && Book.TakeLearned().empty(), "LearnedSkills fills the set without an event");

		const uint32_t Version = Book.Version();
		Packet Learned;
		Learned.mutable_skill_learned()->set_skill(102);
		Book.Apply(Learned);
		const std::vector<uint32_t> Events = Book.TakeLearned();
		Expect(Book.IsLearned(102) && Events.size() == 1 && Events[0] == 102 && Book.Version() != Version, "SkillLearned adds the skill and an event");

		const Packet Request = MmoWorld::FSkillBook::SetQuickslot(3, portfolio::mmo::QUICKSLOT_KIND_SKILL, 102);
		Expect(Request.set_quickslot().index() == 3 && Request.set_quickslot().slot().id() == 102, "SetQuickslot carries the slot");
		Expect(Book.Slots()[3].kind() == portfolio::mmo::QUICKSLOT_KIND_EMPTY, "the quickslots wait for the server");
		Expect(MmoWorld::FSkillBook::SetQuickslot(3, portfolio::mmo::QUICKSLOT_KIND_EMPTY, 102).set_quickslot().slot().id() == 0, "clearing sends no id");

		Packet Slots;
		portfolio::mmo::Quickslot* Slot = Slots.mutable_quickslots()->add_slots();
		Slot->set_kind(portfolio::mmo::QUICKSLOT_KIND_ITEM);
		Slot->set_id(2001);
		Book.Apply(Slots);
		Expect(Book.Slots().size() == portfolio::mmo::CONSTANT_QUICKSLOT_COUNT && Book.Slots()[0].id() == 2001 && Book.Slots()[1].kind() == portfolio::mmo::QUICKSLOT_KIND_EMPTY,
			"Quickslots replaces the bar and pads it");
		Book.Reset();
		Expect(!Book.IsLearned(101) && Book.Slots()[0].id() == 0, "leaving the world clears the book");
	}
}

int main(int ArgumentCount, char** Arguments)
{
	if (ArgumentCount < 3)
	{
		std::printf("FAIL: run.mjs passes the data and vectors folders\n");
		return EXIT_FAILURE;
	}

	MatchesTheServerVectors(Arguments[2]);
	PredictedCooldownsRevertOnlyOnSkillFailures();
	MySkillMotionStartsOnce();
	EffectsAndProgressExpireOnTheirOwn();
	MySlowAndStunAreAnswered();
	TargetSkillsApproachAndSelfSkillsFireInPlace();
	PlayersNeedForceAttack();
	ADeadTakeOverStartsDead();
	SummonsChangeTargetingAndStops();
	CastsStopAndIgnoreTheHeldMove();
	LineProjectilesFollowTheirLaunch();
	LineSkillsFireWithOrWithoutATarget();
	HealsApproachPartyMembers();
	FailuresBecomeNotices();
	LeavingTheWorldStopsRequests();
	DevCommandsCarryTheLine();
	LatencyIsPingToPong();
	SkillBookFollowsTheServer();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Skill tests passed\n");
	return EXIT_SUCCESS;
}
