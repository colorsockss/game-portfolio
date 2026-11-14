// World/CombatState와 월드의 피해·죽음 반영을 UE 없이 확인한다. run.mjs가 빌드하고 실행한다.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "World/CombatState.h"
#include "World/PathFinder.h"

namespace
{
	using MmoWorld::ECombatEventKind;
	using MmoWorld::FCombatState;
	using MmoWorld::FPoint;

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

	/** 시험용 데이터: 기사(1, 근접 2 m)와 마법사(2, 12 m, 300 ms, 20 m/s), 몬스터 1(근접)과 2(선공, 원거리 10 m, 15 m/s). */
	MmoData::FGameData Data()
	{
		MmoData::FGameData Result;
		portfolio::mmo::data::ClassesRow* Knight = Result.Classes.add_rows();
		Knight->set_id(1);
		Knight->set_attack_range(2);
		Knight->set_hit_delay_ms(300);
		portfolio::mmo::data::ClassesRow* Mage = Result.Classes.add_rows();
		Mage->set_id(2);
		Mage->set_attack_range(12);
		Mage->set_hit_delay_ms(300);
		Mage->set_projectile_speed(20);
		portfolio::mmo::data::MonstersRow* Melee = Result.Monsters.add_rows();
		Melee->set_id(1);
		Melee->set_attack_range(2);
		portfolio::mmo::data::MonstersRow* Archer = Result.Monsters.add_rows();
		Archer->set_id(2);
		Archer->set_attack_range(10);
		Archer->set_hit_delay_ms(300);
		Archer->set_projectile_speed(15);
		return Result;
	}

	portfolio::mmo::Packet Entered(uint32_t SelfId)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_enter_world_result()->set_self_id(SelfId);
		return Packet;
	}

	portfolio::mmo::Packet Enter(uint32_t Id, portfolio::mmo::EntityKind Kind, int32_t X, int32_t Z, uint32_t Template = 0, bool bDead = false)
	{
		portfolio::mmo::Packet Packet;
		portfolio::mmo::EntityEnter* Entity = Packet.mutable_entities_enter()->add_entities();
		Entity->set_id(Id);
		Entity->set_kind(Kind);
		Entity->set_x(X);
		Entity->set_z(Z);
		Entity->set_template_id(Template);
		Entity->set_character_class(portfolio::mmo::CHARACTER_CLASS_MAGE);
		Entity->set_hp(100);
		Entity->set_max_hp(100);
		Entity->set_dead(bDead);
		return Packet;
	}

	portfolio::mmo::Packet Swing(uint32_t Attacker, uint32_t Target)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_attack_swing()->set_attacker_id(Attacker);
		Packet.mutable_attack_swing()->set_target_id(Target);
		return Packet;
	}

	portfolio::mmo::Packet Damaged(uint32_t Attacker, uint32_t Target, uint32_t Damage, uint32_t Hp, bool bCritical = false)
	{
		portfolio::mmo::Packet Packet;
		portfolio::mmo::Damaged* Body = Packet.mutable_damaged();
		Body->set_attacker_id(Attacker);
		Body->set_target_id(Target);
		Body->set_damage(Damage);
		Body->set_hp(Hp);
		Body->set_critical(bCritical);
		return Packet;
	}

	portfolio::mmo::Packet Died(uint32_t Id, uint32_t Killer)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_died()->set_id(Id);
		Packet.mutable_died()->set_killer_id(Killer);
		return Packet;
	}

	/** 월드와 전투 모델에 차례로 반영한다. 돌려받은 요청(AttackStop)을 낸다. */
	std::optional<portfolio::mmo::Packet> Apply(MmoWorld::FWorldState& World, FCombatState& Combat, const MmoData::FGameData& Data, const portfolio::mmo::Packet& Packet, double Now = 0)
	{
		World.Apply(Packet, Now);
		return Combat.Apply(Packet, World, Data, Now);
	}

	/** 줄들(첫 줄이 가장 큰 z, 첫 글자가 가장 작은 x, '#'은 벽, 's'는 안전 지대)로 Size m 필드를 만든다. */
	std::optional<MmoWorld::FFieldMap> Field(uint32_t Size, const std::vector<std::string>& Rows)
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		const int32_t Min = -static_cast<int32_t>(Size) / 2;
		Grid.set_origin_x(Min);
		Grid.set_origin_z(Min);
		std::string Cells(static_cast<size_t>(Size) * Size, '\0');
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		for (size_t Row = 0; Row < Rows.size(); ++Row)
		{
			for (size_t Column = 0; Column < Rows[Row].size(); ++Column)
			{
				const int32_t CellX = Min + static_cast<int32_t>(Column);
				const int32_t CellZ = Min + static_cast<int32_t>(Size - 1 - Row);
				Cells[(Size - 1 - Row) * Size + Column] = Rows[Row][Column] == '#' ? 1 : 0;
				if (Rows[Row][Column] == 's')
				{
					portfolio::mmo::data::ZonesRow* Zone = Zones.Add();
					Zone->set_id(1);
					Zone->set_min_x(CellX);
					Zone->set_min_z(CellZ);
					Zone->set_max_x(CellX + 1);
					Zone->set_max_z(CellZ + 1);
					Zone->set_safe(true);
				}
			}
		}
		Grid.set_cells(Cells);
		return MmoWorld::FFieldMap::Make(Size, Zones, Grid);
	}

	/** Damaged와 Died가 개체의 체력과 죽음 표시에 들고, 사건이 받은 순서대로 나온다. 공격자 번호 0의 사건은 대상 쪽만 고친다. */
	void DamageAndDeathAreApplied()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Apply(World, Combat, Info, Swing(1, 5));
		Apply(World, Combat, Info, Damaged(1, 5, 30, 70, true));
		Apply(World, Combat, Info, Damaged(0, 5, 20, 50));
		Apply(World, Combat, Info, Damaged(9, 7, 20, 50));
		Apply(World, Combat, Info, Died(5, 0));

		const MmoWorld::FEntity& Monster = World.Entities().at(5);
		Expect(Monster.Info.dead() && Monster.Info.hp() == 0, "Died marks the entity dead");
		const std::vector<MmoWorld::FCombatEvent> Events = Combat.TakeEvents();
		Expect(Events.size() == 5, "five events");
		Expect(Events.size() == 5 && Events[0].Kind == ECombatEventKind::Swing && Events[1].Kind == ECombatEventKind::Damage
				&& Events[2].Attacker == 0 && Events[4].Kind == ECombatEventKind::Death,
			"events come out in the received order");
		Expect(Events.size() == 5 && Events[1].bCritical && Events[1].Damage == 30 && Events[1].bMine && !Events[2].bMine, "damage numbers carry the critical mark and whether they are mine");
		Expect(World.Entities().count(7) == 0, "a Damaged of an unknown entity creates nothing");
		Expect(Combat.TakeEvents().empty(), "taking empties the events");

		MmoWorld::FWorldState Other;
		FCombatState Quiet;
		Apply(Other, Quiet, Info, Entered(1));
		Apply(Other, Quiet, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Apply(Other, Quiet, Info, Damaged(0, 5, 20, 80));
		Expect(Other.Entities().at(5).Info.hp() == 80, "an unknown attacker still updates the target's hp");
	}

	/** 가장 가까운 적은 받은 개체 가운데 살아 있는 몬스터다(플레이어와 죽은 몬스터는 고르지 않음). */
	void NearestEnemyIsALivingMonster()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(2, portfolio::mmo::ENTITY_KIND_PLAYER, 10, 0));
		Apply(World, Combat, Info, Enter(3, portfolio::mmo::ENTITY_KIND_MONSTER, 20, 0, 1, true));
		Apply(World, Combat, Info, Enter(4, portfolio::mmo::ENTITY_KIND_MONSTER, 100, 0, 1));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, -60, 0, 1));
		Expect(FCombatState::NearestEnemy(World, 0, 0) == 5, "the nearest living monster");
		Expect(FCombatState::NearestEnemy(MmoWorld::FWorldState(), 0, 0) == 0, "no enemy gives 0");
	}

	/** 대상이 죽거나 나가면 풀리고, 공격 중이었으면 AttackStop을 낸다. 공격 중에 대상을 바꿔도 AttackStop을 낸다. */
	void TargetsAreReleasedOnDeathAndLeave()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Apply(World, Combat, Info, Enter(6, portfolio::mmo::ENTITY_KIND_MONSTER, 96, 0, 1));

		Combat.SetTarget(5);
		Expect(!Apply(World, Combat, Info, Died(5, 0)).has_value() && Combat.Target() == 0, "a dead target is released without a stop when not attacking");

		Combat.SetTarget(6);
		Combat.StartAttack(1);
		portfolio::mmo::Packet Leave;
		Leave.mutable_entities_leave()->add_ids(6);
		const std::optional<portfolio::mmo::Packet> Stop = Apply(World, Combat, Info, Leave);
		Expect(Stop && Stop->has_attack_stop() && Combat.Target() == 0 && !Combat.IsAttacking(), "a target leaving while attacked sends AttackStop");

		Apply(World, Combat, Info, Enter(7, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Apply(World, Combat, Info, Enter(8, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Combat.SetTarget(7);
		Combat.StartAttack(1);
		const std::optional<portfolio::mmo::Packet> Switched = Combat.SetTarget(8);
		Expect(Switched && Switched->has_attack_stop() && Combat.Target() == 8, "switching targets while attacking sends AttackStop");
		Expect(!Combat.SetTarget(0).has_value(), "releasing without attacking sends nothing");
	}

	/** 내 첫 공격의 동작은 AttackStart를 보낼 때 한 번만 시작하고 그 AttackSwing으로 다시 시작하지 않는다. 둘째부터는 AttackSwing에서 시작한다.
	 * 공격의 ActionFailed는 미리 시작함과 공격 중 표시를 내리고, 다른 요청의 실패는 건드리지 않는다. */
	void TheFirstSwingIsPredictedOnce()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Combat.SetTarget(5);
		const std::optional<portfolio::mmo::Packet> Start = Combat.StartAttack(1);
		Expect(Start && Start->attack_start().target_id() == 5 && Combat.IsPredicted(), "AttackStart predicts the first swing");
		Expect(!Combat.StartAttack(1).has_value(), "starting again while attacking sends nothing");
		Apply(World, Combat, Info, Swing(1, 5));
		Apply(World, Combat, Info, Swing(1, 5));
		std::vector<MmoWorld::FCombatEvent> Events = Combat.TakeEvents();
		Expect(Events.size() == 2 && Events[0].Attacker == 1 && Events[1].Attacker == 1 && !Combat.IsPredicted(), "the predicted swing is not repeated and the second comes from AttackSwing");

		portfolio::mmo::Packet Other;
		Other.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_NO_TARGET);
		Other.mutable_action_failed()->set_request(portfolio::mmo::REQUEST_KIND_UNSPECIFIED);
		Apply(World, Combat, Info, Other);
		Expect(Combat.IsAttacking(), "another request's failure leaves the attack");

		Combat.StopAttack();
		Combat.StartAttack(1);
		portfolio::mmo::Packet Failed;
		Failed.mutable_action_failed()->set_reason(portfolio::mmo::FAIL_REASON_INVALID_TARGET);
		Failed.mutable_action_failed()->set_request(portfolio::mmo::REQUEST_KIND_ATTACK);
		Apply(World, Combat, Info, Failed);
		Expect(!Combat.IsAttacking() && !Combat.IsPredicted(), "the attack's failure clears the prediction and the attacking mark");
	}

	/** 발사체는 AttackSwing에서 타격까지의 시간(0.3초) 뒤에 공격자의 자리에서 나가 대상 쪽으로 속도대로 가고, 닿으면 지워진다. 근접 공격은 발사체가 없다. */
	void ProjectilesLaunchAfterTheHitDelay()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 320, 0, 2));
		Apply(World, Combat, Info, Enter(6, portfolio::mmo::ENTITY_KIND_MONSTER, -64, 0, 1));
		Apply(World, Combat, Info, Swing(1, 5), 10.0);
		Apply(World, Combat, Info, Swing(6, 1), 10.0);
		Expect(Combat.Projectiles().size() == 1, "only the mage's swing makes a projectile");

		Combat.UpdateProjectiles(World, 10.2);
		Expect(Combat.Projectiles().size() == 1 && !Combat.Projectiles()[0].bLaunched, "the projectile waits for the hit delay");
		Combat.UpdateProjectiles(World, 10.3);
		Combat.UpdateProjectiles(World, 10.5);
		Expect(Combat.Projectiles().size() == 1 && std::abs(Combat.Projectiles()[0].X - 128) < 1e-6, "20 m/s for 0.2 s is 4 m toward the target");
		Combat.UpdateProjectiles(World, 10.9);
		Expect(Combat.Projectiles().empty(), "the projectile disappears when it reaches the target");

		Apply(World, Combat, Info, Swing(1, 5), 20.0);
		portfolio::mmo::Packet Leave;
		Leave.mutable_entities_leave()->add_ids(5);
		Apply(World, Combat, Info, Leave, 20.1);
		Combat.UpdateProjectiles(World, 20.4);
		Expect(Combat.Projectiles().empty(), "a projectile whose target left disappears");
	}

	/**
	 * 발사체는 화면이 개체를 그리는 자리에서 나가고 그쪽으로 간다: 내 공격은 들어올 때의 자리가 아니라 화면이 넣은 내 캐릭터의 자리에서 나가고,
	 * 나를 노린 발사체는 그 자리로 온다. 다른 개체는 서버 틱보다 2틱 늦게 보간한 자리다.
	 */
	void ProjectilesStartWhereTheShooterIsDrawn()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 960, 0, 2));
		World.SetSelfPosition(640, 0, 64);
		Apply(World, Combat, Info, Swing(1, 5), 10.0);
		Combat.UpdateProjectiles(World, 10.3);
		Expect(Combat.Projectiles().size() == 1 && Combat.Projectiles()[0].X == 640, "my projectile leaves from where my character is drawn");

		FCombatState Archer;
		Apply(World, Archer, Info, Swing(5, 1), 20.0);
		Archer.UpdateProjectiles(World, 20.3);
		Archer.UpdateProjectiles(World, 20.4);
		// 15 m/s로 0.1 s면 1.5 m(48칸)를 내 캐릭터 쪽(-x)으로 간다.
		Expect(Archer.Projectiles().size() == 1 && std::abs(Archer.Projectiles()[0].X - (960 - 48)) < 1e-6, "a projectile at me flies toward my drawn position");
		World.SetSelfPosition(940, 0, 64);
		Archer.UpdateProjectiles(World, 20.5);
		Expect(Archer.Projectiles().empty(), "it hits when it reaches where I am drawn now");

		// 다른 개체: 틱 10에 x = 0, 틱 12에 x = 64를 받았고 지금 서버 틱이 13이면 틱 11의 자리(32)에서 나간다.
		MmoWorld::FWorldState Others;
		FCombatState Watcher;
		// 들어온 때(틱 0)를 내 시간 29.5초로 두어 시계가 틱 10을 30초로 본다.
		Apply(Others, Watcher, Info, Entered(1), 29.5);
		Apply(Others, Watcher, Info, Enter(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 640));
		Apply(Others, Watcher, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 0, 0, 2));
		portfolio::mmo::Packet Moves;
		Moves.mutable_entity_moves()->set_tick(10);
		portfolio::mmo::EntityMove* First = Moves.mutable_entity_moves()->add_entities();
		First->set_id(5);
		Apply(Others, Watcher, Info, Moves, 30.0);
		Moves.mutable_entity_moves()->set_tick(12);
		Moves.mutable_entity_moves()->mutable_entities(0)->set_x(64);
		Apply(Others, Watcher, Info, Moves, 30.1);
		// 나가는 때(받은 때 + 300 ms)가 30.15초다. 0.0001초 뒤에 옮겨 나간 자리를 본다.
		Apply(Others, Watcher, Info, Swing(5, 1), 29.85);
		Watcher.UpdateProjectiles(Others, 30.1501);
		Expect(Watcher.Projectiles().size() == 1 && Watcher.Projectiles()[0].bLaunched && std::abs(Watcher.Projectiles()[0].X - 32) < 0.1,
			"another entity's projectile leaves from its interpolated position");
	}

	/** 다가가기: 벽 너머의 대상에게 길을 따라 걷다가 사거리 안이고 선이 트인 첫 자리에서 멈춘다. 안전 지대 안에서 밖의 몬스터를 치러 갈 때는
	 * 사거리 안이어도 안전 지대 밖으로 나간 뒤에 멈춘다. */
	void ApproachStopsWhereTheStrikeIsAllowed()
	{
		std::vector<std::string> Rows(32, std::string(32, '.'));
		for (int Row = 10; Row < 20; ++Row)
		{
			Rows[Row][18] = '#';
		}
		for (int Row = 0; Row < 32; ++Row)
		{
			for (int Column = 4; Column < 8; ++Column)
			{
				Rows[Row][Column] = 's';
			}
		}
		const std::optional<MmoWorld::FFieldMap> Map = Field(32, Rows);
		Expect(Map.has_value(), "the test map is valid");
		if (!Map)
		{
			return;
		}

		auto Walk = [&](FPoint From, const MmoWorld::FEntity& Target, double Range, bool& bStopped) -> FPoint
		{
			MmoWorld::FPathFinder Finder(*Map);
			std::vector<FPoint> Path;
			bStopped = false;
			if (!Finder.Find(From, { Target.X, Target.Z }, Path))
			{
				return From;
			}
			MmoWorld::FPathFollower Follower;
			Follower.Start(Path);
			FPoint At = From;
			for (int Step = 0; Step < 2000; ++Step)
			{
				if (FCombatState::CanStrikeFrom(*Map, At.X, At.Z, Target, Range))
				{
					bStopped = true;
					return At;
				}
				const std::optional<std::pair<double, double>> Direction = Follower.Direction(At);
				if (!Direction)
				{
					return At;
				}
				At = { At.X + static_cast<int32_t>(std::lround(Direction->first * 4)), At.Z + static_cast<int32_t>(std::lround(Direction->second * 4)) };
			}
			return At;
		};

		MmoWorld::FEntity Behind;
		Behind.X = 5 * M;
		Behind.Z = 0;
		Behind.Info.set_kind(portfolio::mmo::ENTITY_KIND_MONSTER);
		bool bStopped = false;
		const FPoint Stop = Walk({ -2 * M, 0 }, Behind, 2, bStopped);
		const double Distance = std::hypot(Stop.X - Behind.X, Stop.Z - Behind.Z);
		Expect(bStopped && Distance <= 2 * M && Map->HasLine(Stop.X, Stop.Z, Behind.X, Behind.Z), "the walk around the wall stops in range with an open line");
		Expect(Distance > 1.5 * M, "it stops at the first allowed spot, not on the target");

		MmoWorld::FEntity Outside;
		Outside.X = -4 * M;
		Outside.Z = 0;
		Outside.Info.set_kind(portfolio::mmo::ENTITY_KIND_MONSTER);
		const FPoint FromSafe = Walk({ -11 * M + 16, 0 }, Outside, 12, bStopped);
		Expect(bStopped && !Map->IsSafe(FromSafe.X, FromSafe.Z), "from inside the safe zone it stops only after leaving it");
		Expect(FCombatState::CanStrikeFrom(*Map, -11 * M + 16, 0, MmoWorld::FEntity{ 0, -11 * M, 0, 0, {}, {} }, 2), "a target that is not a monster can be struck from a safe zone");
	}
	/** Died와 Revived가 개체와 내 상태에 든다. 내가 죽으면 대상이 풀리고 공격 중 표시가 내려가되 AttackStop은 만들지 않고, 죽은 동안 공격을 만들지 않으며,
	 * 부활 뒤에는 다시 만든다. */
	void MyDeathStopsRequestsUntilRevived()
	{
		const MmoData::FGameData Info = Data();
		MmoWorld::FWorldState World;
		FCombatState Combat;
		Apply(World, Combat, Info, Entered(1));
		Apply(World, Combat, Info, Enter(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0, 0));
		Apply(World, Combat, Info, Enter(5, portfolio::mmo::ENTITY_KIND_MONSTER, 64, 0, 1));
		Combat.SetTarget(5);
		Combat.StartAttack(1);
		Combat.TakeEvents();

		const std::optional<portfolio::mmo::Packet> Stop = Apply(World, Combat, Info, Died(1, 5));
		Expect(!Stop.has_value() && Combat.Target() == 0 && !Combat.IsAttacking(), "my death releases the target without AttackStop");
		Expect(World.SelfState().bDead && World.Entities().at(1).Info.dead(), "my death is kept");
		Combat.SetTarget(5);
		Expect(!Combat.StartAttack(1).has_value(), "no attack while dead");

		portfolio::mmo::Packet Revived;
		Revived.mutable_revived()->set_id(1);
		Revived.mutable_revived()->set_hp(45);
		Revived.mutable_revived()->set_max_hp(150);
		Apply(World, Combat, Info, Revived);
		Expect(!World.SelfState().bDead && !World.Entities().at(1).Info.dead() && World.Entities().at(1).Info.hp() == 45, "Revived stands the entity up with its hp");
		Expect(Combat.StartAttack(1).has_value(), "attacks are made again after reviving");
		const std::vector<MmoWorld::FCombatEvent> Events = Combat.TakeEvents();
		Expect(Events.size() >= 2 && Events[0].Kind == ECombatEventKind::Death && Events[1].Kind == ECombatEventKind::Revive, "death and revive come out as events");
	}
}

int main()
{
	DamageAndDeathAreApplied();
	NearestEnemyIsALivingMonster();
	TargetsAreReleasedOnDeathAndLeave();
	TheFirstSwingIsPredictedOnce();
	ProjectilesLaunchAfterTheHitDelay();
	ProjectilesStartWhereTheShooterIsDrawn();
	ApproachStopsWhereTheStrikeIsAllowed();
	MyDeathStopsRequestsUntilRevived();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Combat tests passed\n");
	return EXIT_SUCCESS;
}
