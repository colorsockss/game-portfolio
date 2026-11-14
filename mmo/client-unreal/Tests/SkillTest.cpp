// 스킬 쓰기, 쿨다운, 효과, 진행 중인 일(World/의 CombatState, Cooldowns, WorldState)을 UE 없이 본다. 쿨다운의 규칙은 서버의
// WorldSkillTests가 낸 비교 벡터(mmo/shared/vectors/cooldowns.tsv)로 맞춘다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "World/CombatState.h"

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
	 * 시험용 데이터: 101 단일(2 m), 103 강화(그 자리), 104 자기 중심 범위, 202 대상 중심 범위(12 m, 시전 1.5초), 205 단일(12 m, 시전 2초).
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
		Skill(202, portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 12, 1500);
		Skill(205, portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE, portfolio::mmo::data::SKILL_CENTER_TARGET, 12, 2000);
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

	/** 빈 Size m 필드. Safe의 x 칸(m)들은 안전 지대다. */
	MmoWorld::FFieldMap Field(uint32_t Size, std::vector<int32_t> Safe = {})
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		const int32_t Min = -static_cast<int32_t>(Size) / 2;
		Grid.set_origin_x(Min);
		Grid.set_origin_z(Min);
		Grid.set_cells(std::string(static_cast<size_t>(Size) * Size, '\0'));
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
	CastsStopAndIgnoreTheHeldMove();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Skill tests passed\n");
	return EXIT_SUCCESS;
}
