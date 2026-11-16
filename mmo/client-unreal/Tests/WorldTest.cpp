// World/의 엔진 없는 코드(단위, Move 보내기, 월드 모델)를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

#include "Data/GameData.h"
#include "World/MoveSender.h"
#include "World/Units.h"
#include "World/WorldState.h"

namespace
{
	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	bool Near(double A, double B)
	{
		return std::abs(A - B) < 1e-9;
	}

	portfolio::mmo::Packet Enter(uint32_t Id, int32_t X, int32_t Z, const char* Name)
	{
		portfolio::mmo::Packet Packet;
		portfolio::mmo::EntityEnter* Entity = Packet.mutable_entities_enter()->add_entities();
		Entity->set_id(Id);
		Entity->set_x(X);
		Entity->set_z(Z);
		Entity->set_name(Name);
		Entity->set_character_class(portfolio::mmo::CHARACTER_CLASS_MAGE);
		return Packet;
	}

	portfolio::mmo::Packet Moves(uint32_t Tick, uint32_t Id, int32_t X, int32_t Z, uint32_t Yaw = 0)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_entity_moves()->set_tick(Tick);
		portfolio::mmo::EntityMove* Move = Packet.mutable_entity_moves()->add_entities();
		Move->set_id(Id);
		Move->set_x(X);
		Move->set_z(Z);
		Move->set_yaw(Yaw);
		return Packet;
	}

	void UnitsConvert()
	{
		using namespace MmoWorld::Units;
		Expect(Near(ToMeters(32), 1) && FromMeters(1) == 32, "32 cells are 1 m");
		Expect(FromMeters(ToMeters(-12345)) == -12345, "cells round-trip through meters");
		Expect(FromMeters(0.5 / PerMeter) == 1 && FromMeters(-0.5 / PerMeter) == -1 && FromMeters(0.49 / PerMeter) == 0, "meters round to the nearest cell");
		Expect(Near(YawToDegrees(64), 90) && YawFromDegrees(90) == 64, "yaw 64 is 90 degrees");
		Expect(YawFromDegrees(360) == 0 && YawFromDegrees(-90) == 192 && YawFromDegrees(359.9) == 0, "degrees wrap into one turn");
	}

	void MoveSenderSendsChangesAtTheTickRate()
	{
		MmoWorld::FMoveSender Sender;
		portfolio::mmo::Move Move;
		Expect(!Sender.Update(0.02, 10, 0, 0, 0, Move), "nothing is sent before 50 ms");
		Expect(!Sender.Update(0.02, 20, 0, 0, 0, Move), "still nothing at 40 ms");
		Expect(Sender.Update(0.02, 30, 0, 0, 0, Move) && Move.x() == 30, "the latest position goes out at 50 ms");

		// 30 fps(33 ms)에서도 평균 50 ms 간격이 된다: 1초(30 프레임) 걸으면 20번 나간다.
		int Sent = 0;
		for (int Frame = 1; Frame <= 30; ++Frame)
		{
			Sent += Sender.Update(1.0 / 30, 30 + Frame, 0, 0, 0, Move) ? 1 : 0;
		}
		Expect(Sent == 20, "walking for one second at 30 fps sends 20 moves");

		Expect(!Sender.Update(0.05, 60, 0, 0, 0, Move), "the same position is not sent again");
		Expect(!Sender.Update(0.05, 60, 0, 0, 0, Move), "standing still sends nothing");
		Expect(Sender.Update(0.01, 61, 0, 0, 0, Move), "moving again after standing sends on the first frame");

		// 멈추면: 걷다가 선 자리가 다음 간격에 한 번 가고 그 뒤로는 없다.
		Sender.Update(0.02, 70, 0, 0, 0, Move);
		Expect(Sender.Update(0.05, 75, 0, 0, 0, Move) && Move.x() == 75, "the stop position is sent once");
		Expect(!Sender.Update(0.05, 75, 0, 0, 0, Move), "nothing after the stop position");

		Expect(Sender.Update(0.05, 75, 0, 64, 0, Move) && Move.yaw() == 64, "turning in place is sent");
		Expect(Sender.Update(0.05, 75, 0, 64, 3, Move) && Move.ack() == 3, "a new ack is sent");
	}

	void MoveSenderFlushesBeforeActions()
	{
		MmoWorld::FMoveSender Sender;
		portfolio::mmo::Move Move;
		Sender.Update(0.02, 5, 6, 7, 0, Move);
		Expect(Sender.Flush(5, 6, 7, 0, Move) && Move.x() == 5 && Move.z() == 6 && Move.yaw() == 7, "Flush sends a pending position now");
		Expect(!Sender.Flush(5, 6, 7, 0, Move), "Flush sends nothing when everything is sent");
		Expect(!Sender.Update(0.05, 5, 6, 7, 0, Move), "the flushed move is not sent again");

		Sender.Reset();
		Expect(Sender.Flush(5, 6, 7, 0, Move), "Reset forgets the sent move");
	}

	void LoginAndViewAreKept()
	{
		MmoWorld::FWorldState World;
		Expect(World.SelfId() == 0 && World.SelfEntity() == nullptr, "a new world is not logged in");

		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(7);
		World.Apply(Entered, 0);
		World.Apply(Enter(7, 32, -64, "hero_01"), 0);
		World.Apply(Enter(8, 0, 0, "hero_02"), 0);
		Expect(World.SelfId() == 7, "EnterWorldResult sets the self id");
		Expect(World.SelfEntity() != nullptr && World.SelfEntity()->Info.name() == "hero_01" && World.SelfEntity()->Z == -64, "the self entity comes from EntitiesEnter");
		Expect(World.SelfEntity()->Info.character_class() == portfolio::mmo::CHARACTER_CLASS_MAGE, "the class comes from EntitiesEnter");
		Expect(World.Entities().size() == 2, "entered entities are visible");

		portfolio::mmo::Packet Moved = Moves(1, 8, 96, 0, 64);
		Moved.mutable_entity_moves()->add_entities()->set_id(99);
		World.Apply(Moved, 0);
		Expect(World.Entities().at(8).X == 96 && World.Entities().at(8).Yaw == 64, "EntityMoves moves a visible entity");
		Expect(World.Entities().count(99) == 0, "EntityMoves does not create an unknown entity");

		portfolio::mmo::Packet Reset;
		Reset.mutable_position_reset()->set_x(1);
		Reset.mutable_position_reset()->set_z(2);
		Reset.mutable_position_reset()->set_ack(3);
		World.Apply(Reset, 0);
		Expect(World.Ack() == 3 && World.SelfEntity()->X == 1 && World.SelfEntity()->Z == 2, "PositionReset moves the self entity and sets the ack");

		portfolio::mmo::Packet Leave;
		Leave.mutable_entities_leave()->add_ids(8);
		World.Apply(Leave, 0);
		Expect(World.Entities().size() == 1, "EntitiesLeave removes the entity");

		World.Reset();
		Expect(World.SelfId() == 0 && World.Ack() == 0 && World.Entities().empty() && !World.Clock().IsKnown(), "Reset clears everything");
	}

	void EnteredAndLeftAreQueuedForTheScreen()
	{
		MmoWorld::FWorldState World;
		World.Apply(Enter(1, 0, 0, "a"), 0);
		World.Apply(Enter(2, 0, 0, "b"), 0);
		portfolio::mmo::Packet Leave;
		Leave.mutable_entities_leave()->add_ids(2);
		Leave.mutable_entities_leave()->add_ids(99);
		World.Apply(Leave, 0);
		Expect(World.TakeLeft() == std::vector<uint32_t>{ 2 }, "only known entities are queued as left");
		Expect(World.TakeEntered() == (std::vector<uint32_t>{ 1, 2 }), "entered ids are queued in order, even if they left since");
		Expect(World.TakeLeft().empty() && World.TakeEntered().empty(), "taking empties the queues");

		World.Reset();
		Expect(World.TakeLeft() == std::vector<uint32_t>{ 1 }, "Reset queues every visible entity as left");
	}

	void ClockFollowsTheEarliestArrival()
	{
		MmoWorld::FServerClock Clock;
		Expect(Clock.Now(5) == 0, "an unknown clock reads 0");

		Clock.Observe(100, 10);
		Expect(Near(Clock.Now(10), 100) && Near(Clock.Now(11), 120), "the clock runs at 20 ticks per second from the last tick");

		// 늦게 온 패킷(TCP가 몰아 전함)은 시계를 조금만 내린다.
		Clock.Observe(101, 10.2);
		Expect(Clock.Now(10.2) > 103.9 && Clock.Now(10.2) < 104, "a late tick only nudges the clock down");

		// 더 빨리 온 패킷은 바로 따른다.
		Clock.Observe(110, 10.4);
		Expect(Near(Clock.Now(10.4), 110), "an early tick is followed at once");

		// 아무도 움직이지 않아 Pong만 올 때도 시계는 계속 간다.
		Expect(Near(Clock.Now(15.4), 210), "the clock keeps running without packets");
	}

	void WorldClockComesFromEnterPongAndMoves()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		Entered.mutable_enter_world_result()->set_tick(500);
		World.Apply(Entered, 1);
		Expect(Near(World.Clock().Now(1), 500), "EnterWorldResult sets the clock");
		Expect(Near(World.RenderTick(1), 498), "entities are drawn two ticks behind the server");

		portfolio::mmo::Packet Pong;
		Pong.mutable_pong()->set_tick(700);
		World.Apply(Pong, 2);
		Expect(Near(World.Clock().Now(2), 700), "Pong moves the clock");

		World.Apply(Moves(800, 9, 0, 0), 3);
		Expect(Near(World.Clock().Now(3), 800), "EntityMoves moves the clock");
	}

	void TrackInterpolates()
	{
		MmoWorld::FEntityTrack Track;
		Expect(Near(Track.Sample(5).X, 0), "an empty track samples at the origin");

		Track.Push({ 10, 0, 0, 0 });
		MmoWorld::FPose Pose = Track.Sample(50);
		Expect(Near(Pose.X, 0) && Near(Pose.Z, 0), "a single sample stands still");

		Track.Push({ 11, 10, -20, 0 });
		Track.Push({ 12, 20, -40, 0 });
		Pose = Track.Sample(11.5);
		Expect(Near(Pose.X, 15) && Near(Pose.Z, -30), "between two samples is linear");
		Expect(Near(Track.Sample(9).X, 0), "before the first sample stands at the first");
		Expect(Near(Track.Sample(13).X, 20), "after the last sample stands at the last, never ahead");

		for (int64_t Tick = 13; Tick < 30; ++Tick)
		{
			Track.Push({ Tick, 0, 0, 0 });
		}
		Expect(Track.History().size() == MmoWorld::FEntityTrack::Capacity, "the history keeps only the latest samples");

		Track.Push({ 29, 5, 5, 0 });
		Expect(Track.History().back().Tick == 29 && Track.History().back().X == 5, "a sample at the same tick replaces the last");
	}

	void TrackYawTurnsTheShortWay()
	{
		MmoWorld::FEntityTrack Track;
		Track.Push({ 0, 0, 0, 250 });
		Track.Push({ 1, 0, 0, 6 });
		Expect(Near(Track.Sample(0.5).Yaw, 0), "255 to 0 turns forward across the wrap");
		Expect(Near(Track.Sample(0.25).Yaw, 253), "a quarter of the way is before the wrap");

		MmoWorld::FEntityTrack Back;
		Back.Push({ 0, 0, 0, 6 });
		Back.Push({ 1, 0, 0, 250 });
		Expect(Near(Back.Sample(0.75).Yaw, 253), "0 to 255 turns backward across the wrap");
	}

	void TrackKeepsWalkersSmoothAndStartsStillOnes()
	{
		// 계속 걷는 개체: 한두 틱이 빠져도 끼워 넣는 기록이 없어 멈칫하지 않는다.
		MmoWorld::FEntityTrack Walker;
		Walker.Push({ 10, 0, 0, 0 });
		Walker.Push({ 12, 20, 0, 0 });
		Walker.Push({ 15, 50, 0, 0 });
		Expect(Walker.History().size() == 3, "a walker missing a few ticks gets no extra samples");
		Expect(Near(Walker.Sample(11).X, 10) && Near(Walker.Sample(13.5).X, 35), "a walker moves at a steady speed across missing ticks");

		// 오래 서 있던 개체: 출발 한 틱 앞에 옛 자리를 끼워 넣어, 서 있던 시간 동안 미끄러지지 않는다.
		MmoWorld::FEntityTrack Still;
		Still.Push({ 10, 0, 0, 0 });
		Still.Push({ 100, 10, 0, 0 });
		Expect(Still.History().size() == 3 && Still.History()[1].Tick == 99, "a restart inserts the old position one tick before");
		Expect(Near(Still.Sample(50).X, 0) && Near(Still.Sample(99.5).X, 5), "a restarting entity does not slide while it stood");
	}

	void EnteredEntitiesStartAtTheLastTick()
	{
		MmoWorld::FWorldState World;
		World.Apply(Moves(40, 1, 0, 0), 0);
		World.Apply(Enter(2, 64, 0, "b"), 0);
		World.Apply(Moves(41, 2, 70, 0), 0);
		const MmoWorld::FEntityTrack& Track = World.Entities().at(2).Track;
		Expect(Track.History().size() == 2 && Track.History()[0].Tick == 40, "an entering entity is recorded at the last known tick");
		Expect(Near(Track.Sample(40.5).X, 67), "an entering entity that keeps walking moves smoothly");
	}

	void KindsAndDisplayStatesAreKept()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		portfolio::mmo::EntityEnter* Npc = Entered.mutable_entities_enter()->add_entities();
		Npc->set_id(3);
		Npc->set_kind(portfolio::mmo::ENTITY_KIND_NPC);
		Npc->set_template_id(2);
		portfolio::mmo::EntityEnter* Player = Entered.mutable_entities_enter()->add_entities();
		Player->set_id(4);
		Player->set_kind(portfolio::mmo::ENTITY_KIND_PLAYER);
		Player->set_level(5);
		Player->set_hp(90);
		Player->set_max_hp(120);
		World.Apply(Entered, 0);
		Expect(World.Entities().at(3).Info.kind() == portfolio::mmo::ENTITY_KIND_NPC && World.Entities().at(3).Info.template_id() == 2, "an entering NPC keeps its kind and template");
		Expect(World.Entities().at(4).Info.hp() == 90 && World.Entities().at(4).Info.max_hp() == 120, "an entering player keeps its health");

		portfolio::mmo::Packet State;
		State.mutable_entity_state()->set_id(4);
		State.mutable_entity_state()->set_level(6);
		State.mutable_entity_state()->set_name_color(portfolio::mmo::NAME_COLOR_OUTLAW);
		State.mutable_entity_state()->set_weapon_item_id(1001);
		World.Apply(State, 0);
		const portfolio::mmo::EntityEnter& Info = World.Entities().at(4).Info;
		Expect(Info.level() == 6 && Info.name_color() == portfolio::mmo::NAME_COLOR_OUTLAW && Info.weapon_item_id() == 1001, "EntityState updates the display state");
		Expect(Info.hp() == 90, "EntityState keeps the rest of the entity");

		State.mutable_entity_state()->set_id(99);
		World.Apply(State, 0);
		Expect(World.Entities().count(99) == 0, "EntityState of an unknown entity is dropped");
	}
	/** SelfVitals와 SelfStats가 내 상태에 그대로 들고, 떠나면 비운다. EntityVitals는 받은 개체의 체력만 고친다. */
	void VitalsAndStatsAreKept()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		World.Apply(Entered, 0);
		World.Apply(Enter(2, 0, 0, "other"), 0);

		portfolio::mmo::Packet Stats;
		Stats.mutable_self_stats()->set_max_hp(150);
		Stats.mutable_self_stats()->set_max_mp(50);
		Stats.mutable_self_stats()->set_attack(12);
		Stats.mutable_self_stats()->set_defense(10);
		portfolio::mmo::Packet Vitals;
		Vitals.mutable_self_vitals()->set_hp(140);
		Vitals.mutable_self_vitals()->set_mp(20);
		Vitals.mutable_self_vitals()->set_combat_end_tick(500);
		Vitals.mutable_self_vitals()->set_aggressor_end_tick(900);
		World.Apply(Stats, 0);
		World.Apply(Vitals, 0);
		const MmoWorld::FSelfState& Self = World.SelfState();
		Expect(Self.MaxHp == 150 && Self.MaxMp == 50 && Self.Attack == 12 && Self.Defense == 10, "SelfStats fills the stats");
		Expect(Self.Hp == 140 && Self.Mp == 20 && Self.CombatEndTick == 500 && Self.AggressorEndTick == 900, "SelfVitals fills hp, mp and end ticks");

		// 성향(44)과 사망 페널티(45): 페널티는 내가 부활하면 지운다(남의 부활은 상관없음).
		portfolio::mmo::Packet Karma;
		Karma.mutable_karma()->set_karma(-30);
		portfolio::mmo::Packet Penalty;
		Penalty.mutable_death_penalty()->set_exp_lost(8);
		Penalty.mutable_death_penalty()->add_items()->set_item_id(1001);
		World.Apply(Karma, 0);
		World.Apply(Penalty, 0);
		Expect(Self.Karma == -30 && Self.Penalty && Self.Penalty->exp_lost() == 8 && Self.Penalty->items_size() == 1, "Karma and DeathPenalty are kept");
		portfolio::mmo::Packet OtherRevived;
		OtherRevived.mutable_revived()->set_id(2);
		World.Apply(OtherRevived, 0);
		portfolio::mmo::Packet Revived;
		Revived.mutable_revived()->set_id(1);
		Revived.mutable_revived()->set_hp(50);
		Revived.mutable_revived()->set_max_hp(150);
		Expect(Self.Penalty.has_value(), "another player's revive keeps my penalty");
		World.Apply(Revived, 0);
		Expect(!Self.Penalty, "my revive clears the penalty");

		portfolio::mmo::Packet Others;
		portfolio::mmo::EntityVital* Known = Others.mutable_entity_vitals()->add_entities();
		Known->set_id(2);
		Known->set_hp(70);
		Known->set_max_hp(90);
		portfolio::mmo::EntityVital* Unknown = Others.mutable_entity_vitals()->add_entities();
		Unknown->set_id(3);
		Unknown->set_hp(1);
		World.Apply(Others, 0);
		const MmoWorld::FEntity& Other = World.Entities().at(2);
		Expect(Other.Info.hp() == 70 && Other.Info.max_hp() == 90, "EntityVitals updates a known entity");
		Expect(World.Entities().count(3) == 0, "EntityVitals does not create unknown entities");

		World.Reset();
		Expect(World.SelfState().Hp == 0 && World.SelfState().MaxHp == 0, "leaving the world clears my state");
	}

	/**
	 * 경험치(31): ExpGained가 지금 경험치를 채우고 얻은 양이 0보다 크면 사건을 쌓는다(들어올 때의 0은 쌓지 않음). 비율은 지금 경험치 ÷ 필요 경험치이고
	 * 최대 레벨(다음 줄이 없음)이면 가득이다. EntityState로 레벨이 오른 개체마다 레벨 업 사건이 쌓이고 내 것인지가 붙는다.
	 */
	void ExpAndLevelUpsAreKept()
	{
		MmoData::FGameData Data;
		for (uint32_t Level = 1; Level <= 3; ++Level)
		{
			portfolio::mmo::data::LevelsRow* Row = Data.Levels.add_rows();
			Row->set_class_(portfolio::mmo::CHARACTER_CLASS_MAGE);
			Row->set_level(Level);
			Row->set_exp(200);
		}
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		World.Apply(Entered, 0);
		Expect(World.ExpRatio(Data) == 0.0, "no ratio before my entity arrives");
		portfolio::mmo::Packet Me = Enter(1, 0, 0, "me");
		Me.mutable_entities_enter()->mutable_entities(0)->set_level(1);
		World.Apply(Me, 0);
		portfolio::mmo::Packet Other = Enter(2, 0, 0, "other");
		Other.mutable_entities_enter()->mutable_entities(0)->set_level(5);
		World.Apply(Other, 0);

		portfolio::mmo::Packet Start;
		Start.mutable_exp_gained();
		World.Apply(Start, 0);
		Expect(World.TakeGrowth().empty(), "the zero ExpGained on entering is not an event");
		portfolio::mmo::Packet Gained;
		Gained.mutable_exp_gained()->set_amount(50);
		Gained.mutable_exp_gained()->set_exp(50);
		World.Apply(Gained, 0);
		Expect(World.SelfState().Exp == 50 && Near(World.ExpRatio(Data), 0.25), "ExpGained fills my exp and the ratio");

		const auto LevelTo = [&World](uint32_t Id, uint32_t Level)
		{
			portfolio::mmo::Packet State;
			State.mutable_entity_state()->set_id(Id);
			State.mutable_entity_state()->set_level(Level);
			World.Apply(State, 0);
		};
		LevelTo(1, 3);
		LevelTo(2, 6);
		LevelTo(2, 6);
		const std::vector<MmoWorld::FGrowthEvent> Events = World.TakeGrowth();
		Expect(Events.size() == 3 && Events[0].Kind == MmoWorld::FGrowthEvent::EKind::ExpGained && Events[0].Value == 50,
			"the gain comes first");
		Expect(Events.size() == 3 && Events[1].Kind == MmoWorld::FGrowthEvent::EKind::LevelUp && Events[1].bMine && Events[1].Value == 3
			&& Events[2].Id == 2 && !Events[2].bMine, "each raised level is one event and an unchanged state is none");
		Expect(World.ExpRatio(Data) == 1.0, "the max level is full");
	}

	/** 전투 상태는 어림한 서버 틱이 끝나는 틱 앞일 때만이다. 틱 100을 0초에 받았으니 1초 뒤는 틱 120이다. */
	void CombatFollowsTheServerClock()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		Entered.mutable_enter_world_result()->set_tick(100);
		World.Apply(Entered, 0);
		Expect(!World.InCombat(0), "no combat before any SelfVitals");

		portfolio::mmo::Packet Vitals;
		Vitals.mutable_self_vitals()->set_combat_end_tick(120);
		World.Apply(Vitals, 0);
		Expect(World.InCombat(0.5), "in combat before the end tick");
		Expect(!World.InCombat(1.0), "out of combat from the end tick");
		Expect(!World.InCombat(2.0), "out of combat after the end tick");
	}
	/** 순간 이동 표시가 있는 움직임 뒤에는 옛 자리에서 미끄러지지 않고 새 자리에 바로 선다. 표시가 없으면 보간한다. */
	void TeleportsDoNotSlide()
	{
		MmoWorld::FWorldState World;
		World.Apply(Enter(5, 0, 0, "monster"), 0);
		World.Apply(Moves(10, 5, 0, 0), 0);
		World.Apply(Moves(11, 5, 32, 0), 0);
		portfolio::mmo::Packet Teleport = Moves(12, 5, 3200, 0);
		Teleport.mutable_entity_moves()->mutable_entities(0)->set_teleport(true);
		World.Apply(Teleport, 0);
		const MmoWorld::FEntity& Entity = World.Entities().at(5);
		Expect(Entity.Track.History().size() == 1, "a teleport keeps only the new sample");
		Expect(Near(Entity.Track.Sample(11.5).X, 3200) && Near(Entity.Track.Sample(12).X, 3200), "a teleported entity stands at the new spot");

		World.Apply(Moves(13, 5, 3232, 0), 0);
		Expect(Near(Entity.Track.Sample(12.5).X, 3216), "walking after a teleport interpolates again");
	}
}

namespace
{
	/** 죽은 채 빠졌다가 들어온 표시(38)는 한 번만 꺼내지고, 표시가 없으면 사건도 없다. */
	void RevivedOnEnterIsTakenOnce()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(3);
		Entered.mutable_enter_world_result()->set_revived(true);
		World.Apply(Entered, 0.0);
		Expect(World.TakeRevivedOnEnter() && !World.TakeRevivedOnEnter(), "the revived mark is taken once");
		Entered.mutable_enter_world_result()->set_revived(false);
		World.Apply(Entered, 0.0);
		Expect(!World.TakeRevivedOnEnter(), "a normal entry is not an event");
	}
}

int main()
{
	RevivedOnEnterIsTakenOnce();
	UnitsConvert();
	MoveSenderSendsChangesAtTheTickRate();
	MoveSenderFlushesBeforeActions();
	LoginAndViewAreKept();
	EnteredAndLeftAreQueuedForTheScreen();
	ClockFollowsTheEarliestArrival();
	WorldClockComesFromEnterPongAndMoves();
	TrackInterpolates();
	TrackYawTurnsTheShortWay();
	TrackKeepsWalkersSmoothAndStartsStillOnes();
	EnteredEntitiesStartAtTheLastTick();
	KindsAndDisplayStatesAreKept();
	VitalsAndStatsAreKept();
	ExpAndLevelUpsAreKept();
	CombatFollowsTheServerClock();
	TeleportsDoNotSlide();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("World tests passed\n");
	return EXIT_SUCCESS;
}
