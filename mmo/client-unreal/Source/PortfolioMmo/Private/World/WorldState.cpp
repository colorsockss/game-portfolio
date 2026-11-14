#include "World/WorldState.h"

#include <algorithm>
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
		Mine = {};
		Visible.clear();
		Entered.clear();
		Growth.clear();
	}

	void FWorldState::Apply(const portfolio::mmo::Packet& Packet, double NowSeconds)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kEnterWorldResult:
			Self = Packet.enter_world_result().self_id();
			ObserveTick(Packet.enter_world_result().tick(), NowSeconds);
			break;
		case portfolio::mmo::Packet::kPong:
			ObserveTick(Packet.pong().tick(), NowSeconds);
			break;
		case portfolio::mmo::Packet::kEntitiesEnter:
			for (const portfolio::mmo::EntityEnter& Enter : Packet.entities_enter().entities())
			{
				FEntity& Entity = Visible[Enter.id()];
				Entity = { Enter.id(), Enter.x(), Enter.z(), Enter.yaw(), Enter, {} };
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
					// 옮겨진 개체(순간 이동)는 옛 자리에서 미끄러지지 않게 기록을 비우고 그 자리에 바로 놓는다.
					if (Move.teleport())
					{
						Found->second.Track.Clear();
					}
					Found->second.Track.Push({ Packet.entity_moves().tick(), Move.x(), Move.z(), Move.yaw() });
				}
			}
			break;
		case portfolio::mmo::Packet::kEntityState:
			// 받지 않은 개체의 것은 버린다(서버는 받은 연결에만 보내지만, 나간 뒤에 도착할 수 있다).
			if (const auto Found = Visible.find(Packet.entity_state().id()); Found != Visible.end())
			{
				const portfolio::mmo::EntityState& State = Packet.entity_state();
				Found->second.Info.set_name_color(State.name_color());
				Found->second.Info.set_weapon_item_id(State.weapon_item_id());
				if (State.level() > Found->second.Info.level())
				{
					Growth.push_back({ FGrowthEvent::EKind::LevelUp, State.id(), static_cast<int32_t>(State.level()), State.id() == Self });
				}
				Found->second.Info.set_level(State.level());
			}
			break;
		case portfolio::mmo::Packet::kDamaged:
			// 받지 않은 개체의 것은 버린다. 내 체력은 SelfVitals가 따로 온다.
			if (const auto Found = Visible.find(Packet.damaged().target_id()); Found != Visible.end())
			{
				Found->second.Info.set_hp(Packet.damaged().hp());
			}
			break;
		case portfolio::mmo::Packet::kDied:
			if (const auto Found = Visible.find(Packet.died().id()); Found != Visible.end())
			{
				Found->second.Info.set_dead(true);
				Found->second.Info.set_hp(0);
				// 죽을 때 떼이는 효과와 취소되는 일은 따로 오지 않는다.
				Found->second.Info.clear_effects();
				Found->second.Info.clear_progress();
			}
			Mine.bDead |= Packet.died().id() == Self;
			break;
		case portfolio::mmo::Packet::kRevived:
			if (const auto Found = Visible.find(Packet.revived().id()); Found != Visible.end())
			{
				Found->second.Info.set_dead(false);
				Found->second.Info.set_hp(Packet.revived().hp());
				Found->second.Info.set_max_hp(Packet.revived().max_hp());
			}
			Mine.bDead &= Packet.revived().id() != Self;
			break;
		case portfolio::mmo::Packet::kEffectApplied:
			if (const auto Found = Visible.find(Packet.effect_applied().id()); Found != Visible.end())
			{
				const portfolio::mmo::EffectState& Effect = Packet.effect_applied().effect();
				auto& Effects = *Found->second.Info.mutable_effects();
				const auto Same = std::find_if(Effects.begin(), Effects.end(), [&](const portfolio::mmo::EffectState& Each) { return Each.effect_id() == Effect.effect_id(); });
				*(Same != Effects.end() ? &*Same : Effects.Add()) = Effect;
			}
			break;
		case portfolio::mmo::Packet::kProgress:
			if (const auto Found = Visible.find(Packet.progress().id()); Found != Visible.end())
			{
				*Found->second.Info.mutable_progress() = Packet.progress().state();
			}
			break;
		case portfolio::mmo::Packet::kProgressCancelled:
			if (const auto Found = Visible.find(Packet.progress_cancelled().id()); Found != Visible.end())
			{
				Found->second.Info.clear_progress();
			}
			break;
		case portfolio::mmo::Packet::kSelfVitals:
			Mine.Hp = Packet.self_vitals().hp();
			Mine.Mp = Packet.self_vitals().mp();
			Mine.CombatEndTick = Packet.self_vitals().combat_end_tick();
			Mine.AggressorEndTick = Packet.self_vitals().aggressor_end_tick();
			break;
		case portfolio::mmo::Packet::kExpGained:
			Mine.Exp = Packet.exp_gained().exp();
			if (Packet.exp_gained().amount() > 0)
			{
				Growth.push_back({ FGrowthEvent::EKind::ExpGained, Self, Packet.exp_gained().amount(), true });
			}
			break;
		case portfolio::mmo::Packet::kSelfStats:
			Mine.MaxHp = Packet.self_stats().max_hp();
			Mine.MaxMp = Packet.self_stats().max_mp();
			Mine.Attack = Packet.self_stats().attack();
			Mine.Defense = Packet.self_stats().defense();
			break;
		case portfolio::mmo::Packet::kEntityVitals:
			// 받지 않은 개체의 것은 버린다(EntityState와 같음).
			for (const portfolio::mmo::EntityVital& Vital : Packet.entity_vitals().entities())
			{
				if (const auto Found = Visible.find(Vital.id()); Found != Visible.end())
				{
					Found->second.Info.set_hp(Vital.hp());
					Found->second.Info.set_max_hp(Vital.max_hp());
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

	void FWorldState::SetSelfPosition(int32_t X, int32_t Z, uint32_t Yaw)
	{
		if (const auto Found = Visible.find(Self); Found != Visible.end())
		{
			Found->second.X = X;
			Found->second.Z = Z;
			Found->second.Yaw = Yaw;
		}
	}

	FPose FWorldState::DrawnPose(const FEntity& Entity, double NowSeconds) const
	{
		if (Entity.Id == Self || Entity.Track.History().empty())
		{
			return { static_cast<double>(Entity.X), static_cast<double>(Entity.Z), static_cast<double>(Entity.Yaw) };
		}
		return Entity.Track.Sample(RenderTick(NowSeconds));
	}

	void FWorldState::Expire(double NowSeconds)
	{
		const double Tick = ServerClock.Now(NowSeconds);
		for (auto& [Id, Entity] : Visible)
		{
			auto& Effects = *Entity.Info.mutable_effects();
			Effects.erase(std::remove_if(Effects.begin(), Effects.end(), [Tick](const portfolio::mmo::EffectState& Effect) { return Effect.end_tick() <= Tick; }), Effects.end());
			if (Entity.Info.has_progress() && Entity.Info.progress().end_tick() <= Tick)
			{
				Entity.Info.clear_progress();
			}
		}
	}

	std::optional<uint32_t> FWorldState::SelfEffect(const MmoData::FGameData& Data, portfolio::mmo::data::EffectKind Kind, double NowSeconds) const
	{
		const FEntity* Me = SelfEntity();
		if (!Me)
		{
			return std::nullopt;
		}

		const double Tick = ServerClock.Now(NowSeconds);
		std::optional<uint32_t> Value;
		for (const portfolio::mmo::EffectState& Effect : Me->Info.effects())
		{
			const portfolio::mmo::data::EffectsRow* Row = Data.Effect(Effect.effect_id());
			if (Row && Row->kind() == Kind && Tick < Effect.end_tick())
			{
				Value = std::max(Value.value_or(0), Row->value());
			}
		}
		return Value;
	}

	std::optional<double> FWorldState::ProgressRatio(const FEntity& Entity, const MmoData::FGameData& Data, double NowSeconds) const
	{
		if (!Entity.Info.has_progress() || Entity.Info.progress().kind() != portfolio::mmo::PROGRESS_KIND_CAST)
		{
			return std::nullopt;
		}

		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Entity.Info.progress().id());
		const double Length = Skill ? Units::TicksFromMilliseconds(Skill->cast_ms()) : 0;
		if (Length <= 0)
		{
			return std::nullopt;
		}
		return std::clamp(1.0 - (Entity.Info.progress().end_tick() - ServerClock.Now(NowSeconds)) / Length, 0.0, 1.0);
	}

	double FWorldState::ExpRatio(const MmoData::FGameData& Data) const
	{
		const FEntity* Me = SelfEntity();
		if (!Me)
		{
			return 0.0;
		}
		const uint32_t Class = static_cast<uint32_t>(Me->Info.character_class());
		const portfolio::mmo::data::LevelsRow* Row = Data.Level(Class, Me->Info.level());
		// 다음 레벨의 줄이 없으면 최대 레벨이다(그 줄의 필요 경험치는 쓰지 않음).
		if (!Row || !Data.Level(Class, Me->Info.level() + 1) || Row->exp() == 0)
		{
			return 1.0;
		}
		return std::min(1.0, static_cast<double>(Mine.Exp) / Row->exp());
	}

	std::vector<FGrowthEvent> FWorldState::TakeGrowth()
	{
		return std::exchange(Growth, {});
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
