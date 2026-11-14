#include "World/CombatState.h"

#include <cmath>
#include <limits>
#include <utility>

#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		portfolio::mmo::Packet StopPacket()
		{
			portfolio::mmo::Packet Packet;
			Packet.mutable_attack_stop();
			return Packet;
		}
	}

	std::optional<portfolio::mmo::Packet> FCombatState::SetTarget(uint32_t Id)
	{
		std::optional<portfolio::mmo::Packet> Stop;
		if (Id != TargetId && bAttacking)
		{
			Stop = StopAttack();
		}
		TargetId = Id;
		return Stop;
	}

	std::optional<portfolio::mmo::Packet> FCombatState::StartAttack(uint32_t SelfId)
	{
		if (TargetId == 0 || bAttacking || bSelfDead)
		{
			return std::nullopt;
		}

		bAttacking = true;
		bPredicted = true;
		Self = SelfId;
		Events.push_back({ ECombatEventKind::Swing, SelfId, TargetId, 0, false, true });
		portfolio::mmo::Packet Packet;
		Packet.mutable_attack_start()->set_target_id(TargetId);
		return Packet;
	}

	std::optional<portfolio::mmo::Packet> FCombatState::StopAttack()
	{
		if (!bAttacking)
		{
			return std::nullopt;
		}

		bAttacking = false;
		bPredicted = false;
		return StopPacket();
	}

	std::optional<portfolio::mmo::Packet> FCombatState::Apply(const portfolio::mmo::Packet& Packet, const FWorldState& World, const MmoData::FGameData& Data, double NowSeconds)
	{
		const uint32_t Me = World.SelfId();
		std::optional<portfolio::mmo::Packet> Stop;
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kAttackSwing:
		{
			const portfolio::mmo::AttackSwing& Swing = Packet.attack_swing();
			// 미리 시작한 내 첫 공격의 AttackSwing이면 동작을 다시 시작하지 않는다.
			if (bPredicted && Swing.attacker_id() == Me)
			{
				bPredicted = false;
			}
			else
			{
				Events.push_back({ ECombatEventKind::Swing, Swing.attacker_id(), Swing.target_id(), 0, false, Swing.attacker_id() == Me || Swing.target_id() == Me });
			}

			const auto Attacker = World.Entities().find(Swing.attacker_id());
			const std::optional<FAttack> Attack = Attacker != World.Entities().end() ? AttackOf(Attacker->second.Info, Data) : std::nullopt;
			if (Attack && Attack->ProjectileSpeed > 0)
			{
				FProjectile Projectile;
				Projectile.Attacker = Swing.attacker_id();
				Projectile.Target = Swing.target_id();
				Projectile.LaunchSeconds = NowSeconds + Attack->HitDelayMs / 1000.0;
				Projectile.Speed = Attack->ProjectileSpeed * Units::PerMeter;
				Flying.push_back(Projectile);
			}
			break;
		}
		case portfolio::mmo::Packet::kDamaged:
		{
			const portfolio::mmo::Damaged& Damaged = Packet.damaged();
			Events.push_back({ ECombatEventKind::Damage, Damaged.attacker_id(), Damaged.target_id(), Damaged.damage(), Damaged.critical(),
				Damaged.attacker_id() == Me || Damaged.target_id() == Me });
			break;
		}
		case portfolio::mmo::Packet::kDied:
			Events.push_back({ ECombatEventKind::Death, Packet.died().killer_id(), Packet.died().id(), 0, false, Packet.died().id() == Me });
			if (Packet.died().id() == Me)
			{
				// 서버가 내 공격 상태를 이미 끝냈으므로 AttackStop을 보내지 않고 대상과 공격 중 표시만 내린다.
				bSelfDead = true;
				bAttacking = false;
				bPredicted = false;
				TargetId = 0;
			}
			else if (Packet.died().id() == TargetId)
			{
				Release(Stop);
			}
			break;
		case portfolio::mmo::Packet::kRevived:
			Events.push_back({ ECombatEventKind::Revive, 0, Packet.revived().id(), 0, false, Packet.revived().id() == Me });
			bSelfDead &= Packet.revived().id() != Me;
			break;
		case portfolio::mmo::Packet::kEntitiesLeave:
			for (const uint32_t Id : Packet.entities_leave().ids())
			{
				if (Id == TargetId)
				{
					Release(Stop);
				}
			}
			break;
		case portfolio::mmo::Packet::kActionFailed:
			// 다른 요청의 실패는 공격을 건드리지 않는다.
			if (Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_ATTACK)
			{
				bAttacking = false;
				bPredicted = false;
			}
			break;
		default:
			break;
		}
		return Stop;
	}

	void FCombatState::Release(std::optional<portfolio::mmo::Packet>& Stop)
	{
		Stop = StopAttack();
		TargetId = 0;
	}

	std::vector<FCombatEvent> FCombatState::TakeEvents()
	{
		return std::exchange(Events, {});
	}

	void FCombatState::UpdateProjectiles(const FWorldState& World, double NowSeconds)
	{
		const auto& Entities = World.Entities();
		std::erase_if(Flying, [&](FProjectile& Projectile)
		{
			const auto Target = Entities.find(Projectile.Target);
			if (Target == Entities.end())
			{
				return true;
			}
			if (!Projectile.bLaunched)
			{
				const auto Attacker = Entities.find(Projectile.Attacker);
				if (NowSeconds < Projectile.LaunchSeconds)
				{
					return Attacker == Entities.end();
				}
				if (Attacker == Entities.end())
				{
					return true;
				}
				Projectile.bLaunched = true;
				Projectile.X = Attacker->second.X;
				Projectile.Z = Attacker->second.Z;
				Projectile.LastSeconds = Projectile.LaunchSeconds;
			}

			const double DX = Target->second.X - Projectile.X;
			const double DZ = Target->second.Z - Projectile.Z;
			const double Distance = std::sqrt(DX * DX + DZ * DZ);
			const double Step = Projectile.Speed * (NowSeconds - Projectile.LastSeconds);
			Projectile.LastSeconds = NowSeconds;
			if (Distance <= Step)
			{
				return true;
			}
			Projectile.X += DX / Distance * Step;
			Projectile.Z += DZ / Distance * Step;
			return false;
		});
	}

	void FCombatState::Reset()
	{
		TargetId = 0;
		bAttacking = false;
		bPredicted = false;
		bSelfDead = false;
		Events.clear();
		Flying.clear();
	}

	uint32_t FCombatState::NearestEnemy(const FWorldState& World, int32_t X, int32_t Z)
	{
		uint32_t Best = 0;
		double BestDistance = std::numeric_limits<double>::max();
		for (const auto& [Id, Entity] : World.Entities())
		{
			if (Entity.Info.kind() != portfolio::mmo::ENTITY_KIND_MONSTER || Entity.Info.dead())
			{
				continue;
			}
			const double DX = Entity.X - X;
			const double DZ = Entity.Z - Z;
			const double Distance = DX * DX + DZ * DZ;
			// 거리가 같으면 번호가 작은 쪽(맵의 차례와 상관없이 늘 같은 답).
			if (Distance < BestDistance || (Distance == BestDistance && Id < Best))
			{
				Best = Id;
				BestDistance = Distance;
			}
		}
		return Best;
	}

	bool FCombatState::CanStrikeFrom(const FFieldMap& Field, int32_t X, int32_t Z, const FEntity& Target, double RangeMeters)
	{
		const double DX = Target.X - X;
		const double DZ = Target.Z - Z;
		const double Range = RangeMeters * Units::PerMeter;
		if (DX * DX + DZ * DZ > Range * Range || !Field.HasLine(X, Z, Target.X, Target.Z))
		{
			return false;
		}
		return Target.Info.kind() != portfolio::mmo::ENTITY_KIND_MONSTER || !Field.IsSafe(X, Z);
	}

	std::optional<FCombatState::FAttack> FCombatState::AttackOf(const portfolio::mmo::EntityEnter& Info, const MmoData::FGameData& Data)
	{
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			if (const portfolio::mmo::data::ClassesRow* Row = Data.Class(Info.character_class()))
			{
				return FAttack{ Row->attack_range(), Row->hit_delay_ms(), Row->has_projectile_speed() ? Row->projectile_speed() : 0 };
			}
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER)
		{
			if (const portfolio::mmo::data::MonstersRow* Row = Data.Monster(Info.template_id()))
			{
				return FAttack{ Row->attack_range(), Row->hit_delay_ms(), Row->has_projectile_speed() ? Row->projectile_speed() : 0 };
			}
		}
		return std::nullopt;
	}
}
