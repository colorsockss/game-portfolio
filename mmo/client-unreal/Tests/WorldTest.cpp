// World/의 엔진 없는 코드(단위, Move 보내기, 월드 모델)를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>

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

		portfolio::mmo::Packet Login;
		Login.mutable_login_result()->set_self_id(7);
		World.Apply(Login, 0);
		World.Apply(Enter(7, 32, -64, "hero_01"), 0);
		World.Apply(Enter(8, 0, 0, "hero_02"), 0);
		Expect(World.SelfId() == 7, "LoginResult sets the self id");
		Expect(World.SelfEntity() != nullptr && World.SelfEntity()->Name == "hero_01" && World.SelfEntity()->Z == -64, "the self entity comes from EntitiesEnter");
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

	void WorldClockComesFromLoginPongAndMoves()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Login;
		Login.mutable_login_result()->set_self_id(1);
		Login.mutable_login_result()->set_tick(500);
		World.Apply(Login, 1);
		Expect(Near(World.Clock().Now(1), 500), "LoginResult sets the clock");
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
}

int main()
{
	UnitsConvert();
	MoveSenderSendsChangesAtTheTickRate();
	MoveSenderFlushesBeforeActions();
	LoginAndViewAreKept();
	EnteredAndLeftAreQueuedForTheScreen();
	ClockFollowsTheEarliestArrival();
	WorldClockComesFromLoginPongAndMoves();
	TrackInterpolates();
	TrackYawTurnsTheShortWay();
	TrackKeepsWalkersSmoothAndStartsStillOnes();
	EnteredEntitiesStartAtTheLastTick();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("World tests passed\n");
	return EXIT_SUCCESS;
}
