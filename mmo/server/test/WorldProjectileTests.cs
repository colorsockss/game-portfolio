using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 직선 발사체(83). 시험용 201은 사거리 12 m, 20 m/s(틱마다 1 m), 타격까지 6틱이고 감속을 건다. 시험용 몬스터의 반지름은 0.5 m(16칸)다.
    /// yaw 0(+z)의 방향은 (0, 1)로 정확해서 원의 가장자리를 스치는 경우를 칸 하나 차이로 본다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 발사체는 SkillUsed 뒤 6틱이 지난 틱에 쏜 쪽의 자리에서 나가고, 방향은 UseSkill을 받은 틱이 아니라 나가는 틱의 대상 쪽이다.
        /// ProjectileLaunched는 나간 자리와 틱, 256단위의 방향, 좌표 단위의 초당 속도를 싣는다. 처음 닿는 틱에 피해와 감속이 가고 끝난다.
        /// </summary>
        [Fact]
        public void ALineProjectileLeavesAfterTheDelayTowardWhereTheTargetIsThen()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
            Player player = mage.Player!;
            uint used = world.Tick;
            UseSkill(world, mage, 201, monster.Id);
            world.Step();
            Assert.Equal(new[] { Used(player.Id, 201, monster.Id) }, Skills(mage));
            StepFor(world, 2);
            world.Place(monster, Center(6), Center(6));
            for (int i = 3; i < 6; i++)
            {
                world.Step();
                Assert.Empty(Launches(mage));
            }

            world.Step();
            ProjectileLaunched launched = Assert.Single(Launches(mage)).ProjectileLaunched;
            Assert.Equal(new ProjectileLaunched { Id = launched.Id, CasterId = player.Id, X = player.X, Z = player.Z, Tick = used + 6, Yaw = 0, Speed = 20 * M }, launched);

            // 6 m 앞의 원(반지름 0.5 m)에는 여섯째 틱의 선분(5–6 m)이 닿는다.
            for (int i = 1; i < 6; i++)
            {
                world.Step();
                Assert.DoesNotContain(Take(mage), IsDamaged);
            }

            world.Step();
            List<Packet> packets = Take(mage);
            Assert.Contains(packets, packet => IsDamaged(packet) && (packet.Damaged.AttackerId == player.Id) && (packet.Damaged.TargetId == monster.Id));
            Assert.Contains(Ended(launched.Id), packets);
            Assert.True(monster.Hp < 100);
            Assert.Equal(50u, monster.SlowPercent);
            Assert.Equal(0, world.Projectiles.Count);
        }

        /// <summary>
        /// 대상 없이 쓰면 캐릭터가 보는 쪽으로 나가 사거리 끝(12틱)에서 끝나고 SkillUsed의 대상은 쏜 쪽이다. 대상과 사거리와 선을 미리 보지 않아 벽 너머의
        /// 대상에게도 쏠 수 있고, 발사체는 벽에 닿아 사라지며 벽 뒤의 대상은 맞지 않는다. 실려 온 대상이 나가는 틱에 죽어 있으면 보는 쪽으로 나간다.
        /// </summary>
        [Fact]
        public void ALineProjectileFliesWhereTheCasterFacesAndStopsAtWalls()
        {
            World world = CombatWorld(TestData.Draw(64, (3, -2, 4, 3, '#')));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
            Player player = mage.Player!;
            player.Yaw = 0;
            UseSkill(world, mage, 201, 0);
            world.Step();
            Assert.Equal(new[] { Used(player.Id, 201, player.Id) }, Skills(mage));
            StepFor(world, 6);
            ProjectileLaunched launched = Assert.Single(Launches(mage)).ProjectileLaunched;
            Assert.Equal(0u, launched.Yaw);
            StepFor(world, 11);
            Assert.Empty(Launches(mage));
            world.Step();
            Assert.Equal(new[] { Ended(launched.Id) }, Launches(mage));

            StepFor(world, 20);
            UseSkill(world, mage, 201, monster.Id);
            Assert.DoesNotContain(Take(mage), packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed);
            StepFor(world, 7);
            launched = Assert.Single(Launches(mage)).ProjectileLaunched;
            Assert.Equal(192u, launched.Yaw);
            StepUntil(world, () => world.Projectiles.Count == 0, 20);
            Assert.Equal(0, world.Projectiles.Count);
            Assert.Equal(100u, monster.Hp);
            Assert.Contains(Ended(launched.Id), Launches(mage));

            StepFor(world, 20);
            UseSkill(world, mage, 201, monster.Id);
            world.Step();
            monster.Dead = true;
            player.Yaw = 64;
            StepFor(world, 6);
            Assert.Equal(64u, Assert.Single(Launches(mage)).ProjectileLaunched.Yaw);
        }

        /// <summary>
        /// 나간 뒤 대상이 비켜서면 맞지 않고 사거리 끝에서 사라진다.
        /// </summary>
        [Fact]
        public void ATargetThatSidestepsIsMissed()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
            UseSkill(world, mage, 201, monster.Id);
            StepFor(world, 7);
            ProjectileLaunched launched = Assert.Single(Launches(mage)).ProjectileLaunched;
            world.Place(monster, Center(0), Center(3));
            StepFor(world, 12);
            Assert.Contains(Ended(launched.Id), Launches(mage));
            Assert.Equal(100u, monster.Hp);
            Assert.Equal(0, world.Projectiles.Count);
        }

        /// <summary>
        /// 경로에 적이 둘이면 처음 닿는 하나만 맞고 사라진다. 원의 가장자리를 스치면 맞고 반지름 바로 밖(한 칸)을 지나면 맞지 않는다.
        /// </summary>
        [Fact]
        public void OnlyTheFirstEnemyTouchedIsHitIncludingAGraze()
        {
            World world = CombatWorld(TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 0, 0, 2), TestData.Spawn(2, -3, 0, 2) });
            Monster near = world.Monsters.Single(monster => monster.X == Center(0));
            Monster far = world.Monsters.Single(monster => monster.X == Center(-3));
            Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
            UseSkill(world, mage, 201, far.Id);
            StepUntil(world, () => world.Projectiles.Count > 0, 10);
            StepUntil(world, () => world.Projectiles.Count == 0, 20);
            Assert.True(near.Hp < 100);
            Assert.Equal(100u, far.Hp);

            foreach ((int offset, bool hit) in new[] { (16, true), (17, false) })
            {
                World grazed = CombatWorld(TestData.Draw(64));
                Monster monster = grazed.Monsters[0];
                Session shooter = Fighter(grazed, "hero_01", 0, -6, CharacterClass.Mage);
                grazed.Place(shooter.Player!, monster.X + offset, Center(-6));
                shooter.Player!.Yaw = 0;
                UseSkill(grazed, shooter, 201, 0);
                StepUntil(grazed, () => grazed.Projectiles.Count > 0, 10);
                StepUntil(grazed, () => grazed.Projectiles.Count == 0, 20);
                Assert.Equal(hit, monster.Hp < 100);
            }
        }

        /// <summary>
        /// 틱이 밀려 여러 틱 치를 한 번에 가도 그 선분 위의 적과 벽을 지나치지 않는다: 같은 선분에서 적이 벽보다 앞이면 맞고, 벽이 앞이면 맞지 않고 사라진다.
        /// </summary>
        [Fact]
        public void ASkippedTickTravelsTheWholeSegmentAgainstWallsAndEnemies()
        {
            foreach ((int wallX, bool hit) in new[] { (-3, true), (2, false) })
            {
                World world = CombatWorld(TestData.Draw(64, (wallX, -2, wallX + 1, 3, '#')));
                Monster monster = world.Monsters[0];
                Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
                UseSkill(world, mage, 201, monster.Id);
                StepFor(world, 7);
                Assert.Equal(1, world.Projectiles.Count);
                world.Step(10);
                Assert.Equal(1, world.Projectiles.Count);
                world.Step();
                Assert.Equal(0, world.Projectiles.Count);
                Assert.Equal(hit, monster.Hp < 100);
            }
        }

        /// <summary>
        /// 플레이어, 죽은 몬스터, 복귀 중인 몬스터는 지나가고 그 뒤의 적이 맞는다.
        /// </summary>
        [Fact]
        public void LineProjectilesPassPlayersAndDeadOrReturningMonsters()
        {
            World world = CombatWorld(
                TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 0, 6, 2), TestData.Spawn(2, 0, 1, 2), TestData.Spawn(3, 0, 4, 2) });
            Monster returning = world.Monsters.Single(monster => monster.Z == Center(6));
            Monster dead = world.Monsters.Single(monster => monster.Z == Center(1));
            Monster target = world.Monsters.Single(monster => monster.Z == Center(4));
            Session mage = Fighter(world, "hero_01", 0, -6, CharacterClass.Mage);
            Session knight = Fighter(world, "hero_02", 0, -4);
            Return(world, returning);
            dead.Dead = true;
            mage.Player!.Yaw = 0;
            uint knightHp = knight.Player!.Hp;
            UseSkill(world, mage, 201, 0);
            StepUntil(world, () => world.Projectiles.Count > 0, 10);
            StepUntil(world, () => world.Projectiles.Count == 0, 20);
            Assert.True(target.Hp < 100);
            Assert.Equal((100u, 100u, knightHp), (returning.Hp, dead.Hp, knight.Player!.Hp));
        }

        /// <summary>
        /// 나가기 전에 쏜 쪽이 죽거나 기절하거나 월드에서 빠지면 발사체가 나가지 않고, 날아가는 동안 그렇게 되면 사라진다(빠진 쪽은 끝을 보내지 않음).
        /// 어느 쪽이든 아무것도 맞지 않는다.
        /// </summary>
        [Fact]
        public void ACasterThatDiesIsStunnedOrLeavesStopsItsProjectile()
        {
            foreach (bool flying in new[] { false, true })
            {
                foreach (Action<World, Session> change in new Action<World, Session>[]
                {
                    (world, mage) => mage.Player!.Dead = true,
                    (world, mage) => world.Effects.Apply(mage.Player!, Effect(1), world.Tick),
                    (world, mage) => world.Receive(mage, new Packet { LeaveWorld = new LeaveWorld() }),
                })
                {
                    World world = CombatWorld(TestData.Draw(64));
                    Monster monster = world.Monsters[0];
                    Session mage = Fighter(world, "hero_01", 6, 0, CharacterClass.Mage);
                    UseSkill(world, mage, 201, monster.Id);
                    StepFor(world, flying ? 8 : 1);
                    List<Packet> before = Launches(mage);
                    change(world, mage);
                    bool leaves = mage.Player == null;
                    StepFor(world, 12);
                    List<Packet> after = Launches(mage);
                    Assert.Equal(100u, monster.Hp);
                    Assert.Equal(0, world.Projectiles.Count);
                    Assert.Equal(flying ? 1 : 0, before.Count);
                    Assert.Equal(flying && !leaves ? 1 : 0, after.Count(packet => packet.BodyCase == Packet.BodyOneofCase.ProjectileEnded));
                    Assert.DoesNotContain(after, packet => packet.BodyCase == Packet.BodyOneofCase.ProjectileLaunched);
                }
            }
        }

        /// <summary>
        /// SkillUsed, ProjectileLaunched, ProjectileEnded는 쏜 쪽을 받은 연결과 쏜 쪽 자신에게만 가고, SkillUsed의 대상 번호는 그 연결이 받지 않은 개체여도
        /// 그대로다. 쏜 쪽은 받지 않았지만 맞은 쪽을 받은 연결은 Damaged만 쏜 쪽 번호 0으로 받는다.
        /// </summary>
        [Fact]
        public void LineProjectileEventsGoToReceiversOfTheCaster()
        {
            World world = CombatWorld(TestData.Draw(128), spawns: new[] { TestData.Spawn(1, 4, 0, 2) });
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", -6, 0, CharacterClass.Mage);
            Session casterSide = Fighter(world, "hero_02", -60, 0);
            Session targetSide = Fighter(world, "hero_03", 40, 0);
            uint id = mage.Player!.Id;
            UseSkill(world, mage, 201, monster.Id);
            StepUntil(world, () => world.Projectiles.Count > 0, 10);
            StepUntil(world, () => world.Projectiles.Count == 0, 20);
            Assert.True(monster.Hp < 100);

            foreach (Session session in new[] { mage, casterSide })
            {
                List<Packet> packets = Take(session);
                Assert.Contains(Used(id, 201, monster.Id), packets);
                Assert.Single(packets, packet => packet.BodyCase == Packet.BodyOneofCase.ProjectileLaunched);
                Assert.Single(packets, packet => packet.BodyCase == Packet.BodyOneofCase.ProjectileEnded);
                Assert.Equal(session == mage, packets.Any(IsDamaged));
            }

            List<Packet> seen = Take(targetSide);
            Assert.DoesNotContain(seen, packet => packet.BodyCase is Packet.BodyOneofCase.SkillUsed or Packet.BodyOneofCase.ProjectileLaunched
                or Packet.BodyOneofCase.ProjectileEnded);
            Assert.Equal(0u, Assert.Single(seen, IsDamaged).Damaged.AttackerId);
        }

        /// <summary>
        /// 선분이 원에 처음 닿는 비율: 앞에서 닿는 점, 시작이 원 안이면 0, 스침, 반지름 밖, 선분이 원에 못 미침.
        /// </summary>
        [Fact]
        public void FirstTouchFindsWhereASegmentEntersACircle()
        {
            Assert.Equal(0.5, ProjectileSystem.FirstTouch(0, 0, 0, 32, 0, 32, 16));
            Assert.Equal(0, ProjectileSystem.FirstTouch(0, 0, 0, 32, 0, 8, 16));
            Assert.Equal(1, ProjectileSystem.FirstTouch(0, 0, 0, 32, 16, 32, 16));
            Assert.Equal(-1, ProjectileSystem.FirstTouch(0, 0, 0, 32, 17, 32, 16));
            Assert.Equal(-1, ProjectileSystem.FirstTouch(0, 0, 0, 32, 0, 49, 16));
        }

        /// <summary>
        /// 쌓인 패킷 가운데 직선 발사체의 사건(ProjectileLaunched, ProjectileEnded)만 꺼낸다(나머지도 비움).
        /// </summary>
        private static List<Packet> Launches(Session session)
        {
            return Take(session).Where(packet => packet.BodyCase is Packet.BodyOneofCase.ProjectileLaunched or Packet.BodyOneofCase.ProjectileEnded).ToList();
        }

        private static Packet Ended(uint id)
        {
            return new Packet { ProjectileEnded = new ProjectileEnded { Id = id } };
        }
    }
}
