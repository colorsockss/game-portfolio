#include "World/WorldState.h"

#include <cmath>
#include <utility>

#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		/**
		 * 늦게 도착한 틱 쪽으로 시계를 내리는 비율(받을 때마다). 초당 20번 받으면 지연이 계속 늘어난 쪽으로 몇 초에 걸쳐 따라간다.
		 * 서버 틱 루프가 밀리거나 두 기계의 시계 속도가 다를 때 따라가려는 것이다.
		 */
		constexpr double SlowDownRate = 0.02;
	}

	void FServerClock::Observe(uint32_t Tick, double NowSeconds)
	{
		const double Candidate = Tick - NowSeconds * Units::TicksPerSecond;
		if (!bKnown || Candidate > Offset)
		{
			bKnown = true;
			Offset = Candidate;
			return;
		}
		Offset += (Candidate - Offset) * SlowDownRate;
	}

	double FServerClock::Now(double NowSeconds) const
	{
		return bKnown ? Offset + NowSeconds * Units::TicksPerSecond : 0;
	}

	void FEntityTrack::Push(const FTrackSample& Sample)
	{
		if (!Samples.empty())
		{
			const FTrackSample Last = Samples.back();
			if (Sample.Tick <= Last.Tick)
			{
				Samples.back() = { Last.Tick, Sample.X, Sample.Z, Sample.Yaw };
				return;
			}
			if (Sample.Tick - Last.Tick > RestartGapTicks)
			{
				Samples.push_back({ Sample.Tick - 1, Last.X, Last.Z, Last.Yaw });
			}
		}
		Samples.push_back(Sample);
		if (Samples.size() > Capacity)
		{
			Samples.erase(Samples.begin(), Samples.end() - Capacity);
		}
	}

	FPose FEntityTrack::Sample(double RenderTick) const
	{
		if (Samples.empty())
		{
			return {};
		}
		const FTrackSample& First = Samples.front();
		const FTrackSample& Last = Samples.back();
		if (RenderTick <= First.Tick)
		{
			return { double(First.X), double(First.Z), double(First.Yaw) };
		}
		if (RenderTick >= Last.Tick)
		{
			return { double(Last.X), double(Last.Z), double(Last.Yaw) };
		}

		size_t Next = 1;
		while (Samples[Next].Tick <= RenderTick)
		{
			++Next;
		}
		const FTrackSample& A = Samples[Next - 1];
		const FTrackSample& B = Samples[Next];
		const double T = (RenderTick - A.Tick) / double(B.Tick - A.Tick);

		// 방향은 가까운 쪽으로 돈다: 차이를 -반 바퀴 이상 반 바퀴 미만으로 감는다.
		const int32_t Half = Units::YawSteps / 2;
		const int32_t Turn = ((int32_t(B.Yaw) - int32_t(A.Yaw) + Half) % Units::YawSteps + Units::YawSteps) % Units::YawSteps - Half;
		double Yaw = std::fmod(A.Yaw + Turn * T, double(Units::YawSteps));
		if (Yaw < 0)
		{
			Yaw += Units::YawSteps;
		}
		return { A.X + (B.X - A.X) * T, A.Z + (B.Z - A.Z) * T, Yaw };
	}

	void FWorldState::Reset()
	{
		for (const auto& [Id, Entity] : Visible)
		{
			Left.push_back(Id);
		}
		Self = 0;
		LastAck = 0;
		LastTick = 0;
		ServerClock.Reset();
		Visible.clear();
		Entered.clear();
	}

	void FWorldState::Apply(const portfolio::mmo::Packet& Packet, double NowSeconds)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kLoginResult:
			Self = Packet.login_result().self_id();
			ObserveTick(Packet.login_result().tick(), NowSeconds);
			break;
		case portfolio::mmo::Packet::kPong:
			ObserveTick(Packet.pong().tick(), NowSeconds);
			break;
		case portfolio::mmo::Packet::kEntitiesEnter:
			for (const portfolio::mmo::EntityEnter& Enter : Packet.entities_enter().entities())
			{
				FEntity& Entity = Visible[Enter.id()];
				Entity = { Enter.id(), Enter.x(), Enter.z(), Enter.yaw(), Enter.name(), {} };
				Entity.Track.Push({ LastTick, Enter.x(), Enter.z(), Enter.yaw() });
				Entered.push_back(Enter.id());
			}
			break;
		case portfolio::mmo::Packet::kEntitiesLeave:
			for (uint32_t Id : Packet.entities_leave().ids())
			{
				if (Visible.erase(Id) > 0)
				{
					Left.push_back(Id);
				}
			}
			break;
		case portfolio::mmo::Packet::kEntityMoves:
			ObserveTick(Packet.entity_moves().tick(), NowSeconds);
			for (const portfolio::mmo::EntityMove& Move : Packet.entity_moves().entities())
			{
				// 서버는 Enter를 보낸 개체만 움직인다고 알린다. 모르는 번호는 만들지 않는다(이름이 없다).
				if (const auto Found = Visible.find(Move.id()); Found != Visible.end())
				{
					Found->second.X = Move.x();
					Found->second.Z = Move.z();
					Found->second.Yaw = Move.yaw();
					Found->second.Track.Push({ Packet.entity_moves().tick(), Move.x(), Move.z(), Move.yaw() });
				}
			}
			break;
		case portfolio::mmo::Packet::kPositionReset:
			LastAck = Packet.position_reset().ack();
			if (const auto Found = Visible.find(Self); Found != Visible.end())
			{
				Found->second.X = Packet.position_reset().x();
				Found->second.Z = Packet.position_reset().z();
			}
			break;
		default:
			break;
		}
	}

	const FEntity* FWorldState::SelfEntity() const
	{
		const auto Found = Visible.find(Self);
		return Found == Visible.end() ? nullptr : &Found->second;
	}

	std::vector<uint32_t> FWorldState::TakeLeft()
	{
		return std::exchange(Left, {});
	}

	std::vector<uint32_t> FWorldState::TakeEntered()
	{
		return std::exchange(Entered, {});
	}

	void FWorldState::ObserveTick(uint32_t Tick, double NowSeconds)
	{
		LastTick = Tick;
		ServerClock.Observe(Tick, NowSeconds);
	}
}
