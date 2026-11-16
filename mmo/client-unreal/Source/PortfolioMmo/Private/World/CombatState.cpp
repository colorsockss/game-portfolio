#include "World/CombatState.h"

#include "World/Party.h"

#include <algorithm>
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
		else if (Id != TargetId && TargetId != 0 && MySummonId != 0)
		{
			Stop = StopPacket();
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

	bool FCombatState::MayAttack(const FWorldState& World, uint32_t Id, const FParty* Party)
	{
		const auto Target = World.Entities().find(Id);
		const bool bSummon = Target != World.Entities().end() && Target->second.Info.kind() == portfolio::mmo::ENTITY_KIND_SUMMON;
		if (bSummon && (Target->second.Info.summon_owner_id() == World.SelfId() || (Party && Party->Contains(Target->second.Info.summon_owner_id()))))
		{
			return false;
		}
		if (bForceAttack || Target == World.Entities().end() || (Target->second.Info.kind() != portfolio::mmo::ENTITY_KIND_PLAYER && !bSummon) || Id == World.SelfId())
		{
			return true;
		}
		bForceNotice = true;
		return false;
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
				Projectile.Id = ++LastProjectile;
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
			// 내 소환수가 주거나 받은 피해도 내 것이다(95).
			const auto Mine = [this, Me](uint32_t Id) { return Id == Me || (Id != 0 && Id == MySummonId); };
			Events.push_back({ ECombatEventKind::Damage, Damaged.attacker_id(), Damaged.target_id(), Damaged.damage(), Damaged.critical(),
				Mine(Damaged.attacker_id()) || Mine(Damaged.target_id()) });
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
				Pending = 0;
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
		case portfolio::mmo::Packet::kEntitiesEnter:
			// 죽은 채 넘겨받은 내 개체(46): 부활할 때까지 요청을 만들지 않는다.
			bSelfDead |= World.SelfState().bDead;
			for (const portfolio::mmo::EntityEnter& Enter : Packet.entities_enter().entities())
			{
				if (Enter.kind() == portfolio::mmo::ENTITY_KIND_SUMMON && Enter.summon_owner_id() == Me)
				{
					MySummonId = Enter.id();
				}
			}
			break;
		case portfolio::mmo::Packet::kEntitiesLeave:
			for (const uint32_t Id : Packet.entities_leave().ids())
			{
				if (Id == MySummonId)
				{
					MySummonId = 0;
				}
				if (Id == TargetId)
				{
					Release(Stop);
				}
				// 나간 쪽의 직선 발사체는 끝을 받지 못하므로 여기서 지운다.
				std::erase_if(Lines, [Id](const FLineProjectile& Line) { return Line.Caster == Id; });
			}
			break;
		case portfolio::mmo::Packet::kProjectileLaunched:
		{
			const portfolio::mmo::ProjectileLaunched& Launched = Packet.projectile_launched();
			Lines.push_back({ Launched.id(), Launched.caster_id(), Launched.x(), Launched.z(), Launched.tick(), Launched.yaw(), Launched.speed() });
			break;
		}
		case portfolio::mmo::Packet::kProjectileEnded:
			// 모르는 번호(나간 뒤에 받은 끝 등)는 지울 것이 없다.
			std::erase_if(Lines, [Id = Packet.projectile_ended().id()](const FLineProjectile& Line) { return Line.Id == Id; });
			break;
		case portfolio::mmo::Packet::kActionFailed:
			Notices.push_back(Packet.action_failed().reason());
			// 다른 요청의 실패는 공격도 스킬도 건드리지 않는다.
			if (Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_ATTACK)
			{
				bAttacking = false;
				bPredicted = false;
			}
			else if (Packet.action_failed().request() == portfolio::mmo::REQUEST_KIND_SKILL && Awaiting != 0)
			{
				SkillCooldowns.Revert();
				Events.push_back({ ECombatEventKind::Interrupt, 0, Me, 0, false, true });
				Awaiting = 0;
			}
			break;
		case portfolio::mmo::Packet::kSkillUsed:
		{
			const portfolio::mmo::SkillUsed& Used = Packet.skill_used();
			// 미리 시작한 내 스킬의 답이면 동작을 다시 시작하지 않는다.
			if (Awaiting != 0 && Used.caster_id() == Me && Used.skill_id() == Awaiting)
			{
				Awaiting = 0;
			}
			else
			{
				Events.push_back({ ECombatEventKind::Skill, Used.caster_id(), Used.target_id(), 0, false, Used.caster_id() == Me || Used.target_id() == Me, Used.skill_id() });
			}
			break;
		}
		case portfolio::mmo::Packet::kProgress:
		{
			const portfolio::mmo::Progress& Progress = Packet.progress();
			if (Awaiting != 0 && Progress.id() == Me && Progress.state().kind() == portfolio::mmo::PROGRESS_KIND_CAST && Progress.state().id() == Awaiting)
			{
				Awaiting = 0;
			}
			else
			{
				Events.push_back({ ECombatEventKind::ProgressStart, 0, Progress.id(), 0, false, Progress.id() == Me, Progress.state().id() });
			}
			break;
		}
		case portfolio::mmo::Packet::kProgressCancelled:
			// 중간에 취소된 것은 내가 움직였거나 맞은 것이라 알리지 않고, 끝나는 틱의 확인에서 걸린 것만 알린다.
			if (Packet.progress_cancelled().id() == Me && Packet.progress_cancelled().reason() != portfolio::mmo::FAIL_REASON_CANCELLED)
			{
				Notices.push_back(Packet.progress_cancelled().reason());
			}
			Events.push_back({ ECombatEventKind::Interrupt, 0, Packet.progress_cancelled().id(), 0, false, Packet.progress_cancelled().id() == Me });
			break;
		case portfolio::mmo::Packet::kCooldowns:
			SkillCooldowns.Apply(Packet.cooldowns());
			break;
		default:
			break;
		}
		return Stop;
	}

	void FCombatState::Release(std::optional<portfolio::mmo::Packet>& Stop)
	{
		Stop = StopAttack();
		// 내 소환수가 있으면 공격 중이 아니어도 소환수가 풀린 대상을 계속 치지 않게 한다(95).
		if (!Stop && MySummonId != 0)
		{
			Stop = StopPacket();
		}
		TargetId = 0;
	}

	std::vector<FCombatEvent> FCombatState::TakeEvents()
	{
		return std::exchange(Events, {});
	}

	std::vector<portfolio::mmo::FailReason> FCombatState::TakeNotices()
	{
		return std::exchange(Notices, {});
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
				// 화면이 공격자를 그리는 자리에서 나간다(나는 내 캐릭터의 자리, 남은 보간한 자리).
				const FPose From = World.DrawnPose(Attacker->second, Projectile.LaunchSeconds);
				Projectile.bLaunched = true;
				Projectile.X = From.X;
				Projectile.Z = From.Z;
				Projectile.LastSeconds = Projectile.LaunchSeconds;
			}

			const FPose To = World.DrawnPose(Target->second, NowSeconds);
			const double DX = To.X - Projectile.X;
			const double DZ = To.Z - Projectile.Z;
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
		Pending = 0;
		Awaiting = 0;
		bHoldMove = false;
		SkillCooldowns.Reset();
		MySummonId = 0;
		Events.clear();
		Notices.clear();
		Flying.clear();
		Lines.clear();
	}

	FPose FLineProjectile::At(double ServerTick) const
	{
		double DX = 0;
		double DZ = 0;
		Units::Direction(Yaw, DX, DZ);
		const double Distance = Speed * std::max(0.0, ServerTick - Tick) / Units::TicksPerSecond;
		return { X + DX * Distance, Z + DZ * Distance, static_cast<double>(Yaw) };
	}

	bool FCombatState::TargetsOther(const portfolio::mmo::data::SkillsRow& Skill)
	{
		return Skill.kind() == portfolio::mmo::data::SKILL_KIND_SINGLE_DAMAGE || Skill.kind() == portfolio::mmo::data::SKILL_KIND_DEBUFF
			|| (Skill.kind() == portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE && Skill.center() == portfolio::mmo::data::SKILL_CENTER_TARGET);
	}

	bool FCombatState::Launches(const portfolio::mmo::data::SkillsRow& Skill)
	{
		return Skill.has_projectile_speed();
	}

	portfolio::mmo::FailReason FCombatState::PressSkill(uint32_t SkillId, const FWorldState& World, const MmoData::FGameData& Data, double NowSeconds)
	{
		const portfolio::mmo::FailReason Reason = CheckSkill(SkillId, World, Data, NowSeconds);
		if (Reason != portfolio::mmo::FAIL_REASON_NONE)
		{
			Notices.push_back(Reason);
			return Reason;
		}
		// 플레이어를 대상으로 잡은 채 대상에게 쓰는 스킬은 강제 공격이 켜져 있어야 한다(알림은 MayAttack이 쌓음).
		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(SkillId);
		if (TargetsOther(*Skill) && !MayAttack(World, TargetId))
		{
			return portfolio::mmo::FAIL_REASON_INVALID_TARGET;
		}
		Pending = SkillId;
		return Reason;
	}

	portfolio::mmo::FailReason FCombatState::CheckSkill(uint32_t SkillId, const FWorldState& World, const MmoData::FGameData& Data, double NowSeconds) const
	{
		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(SkillId);
		const FEntity* Me = World.SelfEntity();
		if (!Skill || !Me || World.SelfState().bDead)
		{
			return portfolio::mmo::FAIL_REASON_DEAD;
		}
		if (World.SelfEffect(Data, portfolio::mmo::data::EFFECT_KIND_STUN, NowSeconds))
		{
			return portfolio::mmo::FAIL_REASON_STUNNED;
		}
		if (Me->Info.has_progress() || Awaiting != 0)
		{
			return portfolio::mmo::FAIL_REASON_BUSY;
		}
		if (!SkillCooldowns.IsReady(SkillId, World.Clock().Now(NowSeconds)))
		{
			return portfolio::mmo::FAIL_REASON_COOLDOWN;
		}
		if (World.SelfState().Mp < Skill->mp())
		{
			return portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MP;
		}
		if (TargetsOther(*Skill) && !Launches(*Skill))
		{
			const auto Target = World.Entities().find(TargetId);
			if (Target == World.Entities().end() || Target->second.Info.dead())
			{
				return portfolio::mmo::FAIL_REASON_NO_TARGET;
			}
		}
		return portfolio::mmo::FAIL_REASON_NONE;
	}

	FSkillStep FCombatState::UpdateSkill(const FWorldState& World, const FFieldMap& Field, const MmoData::FGameData& Data, int32_t X, int32_t Z, const FParty* Party)
	{
		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Pending);
		if (!Skill)
		{
			Pending = 0;
			return {};
		}
		if (!TargetsOther(*Skill))
		{
			// 대상이 시야 안의 파티원이면 회복과 강화는 그 파티원에게 쓰는 스킬이라, 사거리 밖이거나 선이 막혔으면 다가간다(42).
			const bool bSupport = Skill->kind() == portfolio::mmo::data::SKILL_KIND_HEAL || Skill->kind() == portfolio::mmo::data::SKILL_KIND_BUFF;
			if (bSupport && Party && TargetId != World.SelfId() && Party->IsTargetable(World, TargetId))
			{
				const FEntity& Member = World.Entities().at(TargetId);
				if (!CanStrikeFrom(Field, X, Z, Member, Skill->range()))
				{
					return { FSkillStep::EKind::Approach, { Member.X, Member.Z } };
				}
			}
			return { FSkillStep::EKind::Fire };
		}

		const auto Target = World.Entities().find(TargetId);
		if (Target == World.Entities().end() || Target->second.Info.dead())
		{
			if (Launches(*Skill))
			{
				return { FSkillStep::EKind::Fire };
			}
			Pending = 0;
			return {};
		}
		if (CanStrikeFrom(Field, X, Z, Target->second, Skill->range()))
		{
			return { FSkillStep::EKind::Fire };
		}
		return { FSkillStep::EKind::Approach, { Target->second.X, Target->second.Z } };
	}

	FSkillFire FCombatState::FireSkill(const FWorldState& World, const MmoData::FGameData& Data, FMoveSender& Sender, int32_t X, int32_t Z, uint32_t Yaw, double NowSeconds)
	{
		FSkillFire Fire;
		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Pending);
		if (!Skill)
		{
			return Fire;
		}

		if (Skill->cast_ms() > 0)
		{
			Fire.bStop = true;
			bHoldMove = true;
		}
		else
		{
			SkillCooldowns.Predict(Skill->id(), static_cast<uint32_t>(std::max(0.0, std::floor(World.Clock().Now(NowSeconds)))), Skill->cooldown_ms());
		}
		// 서버가 보는 자리와 쪽을 화면과 같게 한다(시전은 선 자리, 직선 발사체는 대상이 없을 때 쏘는 쪽).
		if (Skill->cast_ms() > 0 || Launches(*Skill))
		{
			portfolio::mmo::Packet Move;
			if (Sender.Flush(X, Z, Yaw, World.Ack(), *Move.mutable_move()))
			{
				Fire.Packets.push_back(Move);
			}
		}

		// 그 자리에서 쓰는 스킬도 대상을 싣는다(파티원에게 쓰는 회복과 강화는 42). 자기 중심의 범위 피해는 대상이 없다.
		// 직선 발사체는 살아 있는 대상만 싣는다(없으면 보는 쪽으로 나감).
		const auto Held = World.Entities().find(TargetId);
		const bool bLiveTarget = Held != World.Entities().end() && !Held->second.Info.dead();
		const uint32_t Target = Launches(*Skill) ? (bLiveTarget ? TargetId : 0)
			: TargetsOther(*Skill) || Skill->kind() != portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE ? TargetId : 0;
		portfolio::mmo::Packet Use;
		Use.mutable_use_skill()->set_skill_id(Skill->id());
		Use.mutable_use_skill()->set_target_id(Target);
		Use.mutable_use_skill()->set_force_attack(bForceAttack);
		Fire.Packets.push_back(Use);
		// 시전은 시전 동작(Progress와 같은 사건)을, 나머지는 스킬 동작을 미리 시작한다.
		if (Skill->cast_ms() > 0)
		{
			Events.push_back({ ECombatEventKind::ProgressStart, 0, World.SelfId(), 0, false, true, Skill->id() });
		}
		else
		{
			Events.push_back({ ECombatEventKind::Skill, World.SelfId(), Target != 0 ? Target : World.SelfId(), 0, false, true, Skill->id() });
		}
		Awaiting = Skill->id();
		Pending = 0;
		return Fire;
	}

	bool FCombatState::AllowMove(bool bHasInput)
	{
		if (bHoldMove && !bHasInput)
		{
			bHoldMove = false;
		}
		return !bHoldMove;
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
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER || Info.kind() == portfolio::mmo::ENTITY_KIND_SUMMON)
		{
			if (const portfolio::mmo::data::MonstersRow* Row = Data.Monster(Info.template_id()))
			{
				return FAttack{ Row->attack_range(), Row->hit_delay_ms(), Row->has_projectile_speed() ? Row->projectile_speed() : 0 };
			}
		}
		return std::nullopt;
	}
}
