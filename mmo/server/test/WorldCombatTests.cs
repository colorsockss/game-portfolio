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
    /// 기본 공격(시작과 타격, 사거리와 선, 끝나는 때, 실패, 피해와 죽음, 전투 상태, 사건을 받는 연결)을 틱을 손으로 돌려 본다.
    /// 기사는 사거리 2 m, 간격 1초(20틱), 타격까지 300 ms(6틱)이고 마법사는 사거리 12 m에 발사체 20 m/s(틱마다 1 m)다.
    /// 시험용 몬스터 2(비선공, 체력 100)를 원점 칸 (0, 0) m의 가운데에 놓는다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// AttackSwing은 시작한 틱에, Damaged는 타격까지의 시간(6틱) 뒤에 간다. 타격까지의 시간이 0이면 같은 틱이다.
        /// </summary>
        [Fact]
        public void TheSwingGoesAtStartAndTheHitSixTicksLater()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, monster.Id);

            world.Step();
            Assert.Equal(new[] { Swing(knight.Player!.Id, monster.Id) }, Combat(knight).Where(IsSwing));
            for (int i = 1; i < 6; i++)
            {
                world.Step();
                Assert.DoesNotContain(Combat(knight), IsDamaged);
            }

            world.Step();
            Damaged damaged = Assert.Single(Combat(knight), IsDamaged).Damaged;
            Assert.Equal((knight.Player!.Id, monster.Id, monster.Hp), (damaged.AttackerId, damaged.TargetId, damaged.Hp));
            Assert.Equal(100 - damaged.Damage, monster.Hp);

            Classes instant = TestData.Classes;
            instant.Rows[0].HitDelayMs = 0;
            World same = CombatWorld(TestData.Draw(64), classes: instant);
            Session fast = Fighter(same, "hero_01", 1, 0);
            Attack(same, fast, same.Monsters[0].Id);
            same.Step();
            List<Packet> packets = Combat(fast);
            Assert.Contains(packets, IsSwing);
            Assert.Contains(packets, IsDamaged);
        }

        /// <summary>
        /// 다음 공격은 시작한 틱에서 간격(20틱) 뒤이고, 멈췄다 다시 켜도 그보다 빨리 치지 못한다.
        /// </summary>
        [Fact]
        public void StoppingAndRestartingDoesNotBeatTheInterval()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            monster.SetStats(new Stats(10000, 0, 0, 0));
            monster.Hp = 10000;
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, monster.Id);
            uint started = world.Tick;
            world.Step();
            world.Receive(knight, new Packet { AttackStop = new AttackStop() });
            world.Step();
            Attack(world, knight, monster.Id);
            Take(knight);

            var swings = new List<uint>();
            for (int i = 0; i < 45; i++)
            {
                uint tick = world.Tick;
                world.Step();
                if (Combat(knight).Any(packet => IsSwing(packet) && packet.AttackSwing.AttackerId == knight.Player!.Id))
                {
                    swings.Add(tick);
                }
            }

            Assert.Equal(new[] { started + 20, started + 40 }, swings);
        }

        /// <summary>
        /// 사거리 밖에서는 시작하지 않고 기다리다가 들어오는 틱에 시작한다(걷는 중이어도). 사거리 안이어도 선이 막혔으면 기다리고, 트이면 시작한다.
        /// 사거리 밖에서 AttackStart만 보낸 플레이어는 전투 상태가 되지 않는다.
        /// </summary>
        [Fact]
        public void AttacksWaitForRangeAndLine()
        {
            World world = CombatWorld(TestData.Draw(64, (1, 0, 2, 1, '#')));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 5, 0);
            Attack(world, knight, monster.Id);
            StepFor(world, 10);
            Assert.DoesNotContain(Combat(knight), IsSwing);
            Assert.Equal(0u, knight.Player!.CombatEndTick);

            // 사거리 안(2 m)이지만 벽 (1, 0)에 선이 막힌다.
            world.Place(knight.Player!, Center(2), Center(0));
            StepFor(world, 5);
            Assert.DoesNotContain(Combat(knight), IsSwing);

            // 걷는 중(틱마다 자리가 바뀜)에 선이 트인 사거리 안으로 들어오면 그 틱에 시작한다.
            world.Place(knight.Player!, Center(2), Center(1) + 8);
            world.Step();
            // 대각선은 벽 칸의 모서리에 닿아 막히므로 곧게 위에서 친다.
            world.Place(knight.Player!, Center(0), Center(1));
            uint tick = world.Tick;
            world.Step();
            Assert.Contains(Combat(knight), IsSwing);
            Assert.Equal(tick + 100, knight.Player!.CombatEndTick);
        }

        /// <summary>
        /// 시작한 뒤 사거리 밖으로 나간 대상도 맞고, 시작한 뒤 AttackStop을 보내도 맞는다.
        /// </summary>
        [Fact]
        public void StartedSwingsHitEvenOutOfRangeOrAfterStopping()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, monster.Id);
            world.Step();
            world.Place(knight.Player!, Center(10), Center(0));
            world.Receive(knight, new Packet { AttackStop = new AttackStop() });
            StepFor(world, 6);
            Assert.True(monster.Hp < 100);
            Assert.Equal(0u, knight.Player!.AttackTarget);
        }

        /// <summary>
        /// 타격할 틱에 대상이 죽었거나, 월드에서 빠졌거나, 복귀 중인 몬스터이거나, 공격자가 그 사이에 죽었거나 월드에서 빠졌으면 맞지 않는다.
        /// </summary>
        [Fact]
        public void StrikesAreDroppedWhenTheTargetOrAttackerChanged()
        {
            foreach (Action<World, Monster, Session> change in new Action<World, Monster, Session>[]
            {
                (world, monster, knight) => monster.Dead = true,
                (world, monster, knight) => world.RemoveEntity(monster),
                (world, monster, knight) => Return(world, monster),
                (world, monster, knight) => knight.Player!.Dead = true,
                (world, monster, knight) => LeaveNow(knight, () => world.Disconnect(knight)),
            })
            {
                World world = CombatWorld(TestData.Draw(64));
                Monster monster = world.Monsters[0];
                Session knight = Fighter(world, "hero_01", 1, 0);
                Attack(world, knight, monster.Id);
                world.Step();
                change(world, monster, knight);
                StepFor(world, 8);
                Assert.Equal(100u, monster.Hp);
            }
        }

        /// <summary>
        /// 몬스터의 타격할 틱에 대상이 안전 지대에 들어갔으면 맞지 않고, 안전 지대 안의 플레이어는 처음부터 치지 않는다.
        /// </summary>
        [Fact]
        public void MonstersDoNotHitPlayersInSafeZones()
        {
            World world = CombatWorld(TestData.Draw(64, (-6, -3, -3, 3, 's')));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", -1, 0);
            monster.Damage.Add(knight.Player!.Id, 1);
            StepUntil(world, () => monster.AttackTarget == knight.Player!.Id, 10);
            world.Step();
            world.Place(knight.Player!, Center(-4), Center(0));
            StepFor(world, 60);
            Assert.Equal(150u, knight.Player!.Hp);
        }

        /// <summary>
        /// 따라가는 발사체의 타격할 틱은 "타격까지의 시간 + 거리 ÷ 속도(올림)"이다: 마법사가 10 m에서 치면 6 + 10 = 16틱 뒤.
        /// </summary>
        [Fact]
        public void HomingProjectilesLandAfterTheFlight()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session mage = Fighter(world, "hero_01", -10, 0, CharacterClass.Mage);
            Attack(world, mage, monster.Id);
            world.Step();
            Assert.Contains(Combat(mage), IsSwing);
            StepFor(world, 15);
            Assert.DoesNotContain(Combat(mage), IsDamaged);
            world.Step();
            Assert.Contains(Combat(mage), IsDamaged);
        }

        /// <summary>
        /// 원거리 몬스터(사거리 10 m, 발사체 15 m/s = 틱마다 24단위)는 자기 사거리에서 쏘고, 8 m에서 쏜 것은 6 + 11틱 뒤에 맞는다.
        /// 날아가는 동안 대상이 벽 뒤로 가도 맞는다.
        /// </summary>
        [Fact]
        public void RangedMonstersShootFromTheirRangeAndHitBehindWalls()
        {
            MonstersRow archer = TestData.Monster(2, aggressive: false);
            archer.AttackRange = 10;
            archer.ProjectileSpeed = 15;
            World world = CombatWorld(TestData.Draw(64, (9, 2, 10, 5, '#')), monsters: new[] { TestData.Monster(1, true), archer });
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 8, 0);
            monster.Damage.Add(knight.Player!.Id, 1);

            uint swung = 0;
            for (int i = 0; i < 10 && swung == 0; i++)
            {
                uint tick = world.Tick;
                world.Step();
                swung = Combat(knight).Any(IsSwing) ? tick : 0;
            }

            Assert.NotEqual(0u, swung);
            Assert.Equal((Center(0), Center(0)), (monster.X, monster.Z));
            world.Place(knight.Player!, Center(10), Center(3));
            StepTo(world, swung + 17);
            Assert.Equal(150u, knight.Player!.Hp);
            world.Step();
            Assert.True(knight.Player!.Hp < 150);
        }

        /// <summary>
        /// 공격 상태는 대상의 죽음과 대상이 월드에서 빠짐에 조용히 끝나고, CanAttack이 거짓이 되거나(안전 지대에 들어감) 대상인 몬스터가
        /// 복귀를 시작하면 ActionFailed(공격할 수 없는 대상)와 함께 끝난다.
        /// </summary>
        [Fact]
        public void AttackStatesEndWithOrWithoutAFailure()
        {
            foreach ((Action<World, Monster, Session> change, FailReason? failure) in new (Action<World, Monster, Session>, FailReason?)[]
            {
                ((world, monster, knight) => monster.Dead = true, null),
                ((world, monster, knight) => world.RemoveEntity(monster), null),
                ((world, monster, knight) => world.Place(knight.Player!, Center(-4), Center(0)), FailReason.InvalidTarget),
                ((world, monster, knight) => Return(world, monster), FailReason.InvalidTarget),
            })
            {
                World world = CombatWorld(TestData.Draw(64, (-6, -3, -3, 3, 's')));
                Monster monster = world.Monsters[0];
                monster.SetStats(new Stats(10000, 0, 0, 0));
                monster.Hp = 10000;
                Session knight = Fighter(world, "hero_01", -1, 0);
                Attack(world, knight, monster.Id);
                world.Step();
                change(world, monster, knight);
                Take(knight);
                StepFor(world, 21);
                Assert.Equal(0u, knight.Player!.AttackTarget);
                IEnumerable<Packet> failures = Take(knight).Where(packet => packet.BodyCase == Packet.BodyOneofCase.ActionFailed);
                Assert.Equal(failure == null ? Array.Empty<Packet>() : new[] { Failed(failure.Value) }, failures);
            }
        }

        /// <summary>
        /// 없는 번호, 죽은 대상, 받지 않은 개체는 "대상이 없음", 레벨 10 미만의 플레이어는 "레벨 10 미만"(44), 복귀 중인 몬스터, 안전 지대 안에서 보낸 AttackStart는 "공격할 수 없는 대상"으로
        /// ActionFailed(공격)를 받고 끊기지 않는다. AttackStop은 공격 상태를 끈다.
        /// </summary>
        [Fact]
        public void InvalidAttackStartsFailWithoutAKick()
        {
            World world = CombatWorld(TestData.Draw(128, (-6, -3, -3, 3, 's')), spawns: new[] { TestData.Spawn(1, 0, 0, 2), TestData.Spawn(2, -60, -60, 2), TestData.Spawn(3, 4, 4, 2) });
            Monster near = world.Monsters[0];
            Monster far = world.Monsters[1];
            Monster dead = world.Monsters[2];
            dead.Dead = true;
            Session knight = Fighter(world, "hero_01", 1, 0);
            Session other = Fighter(world, "hero_02", 2, 0);
            Take(knight);

            foreach ((uint target, FailReason reason) in new[]
            {
                (999u, FailReason.NoTarget), (dead.Id, FailReason.NoTarget), (far.Id, FailReason.NoTarget), (other.Player!.Id, FailReason.PkLevelTooLow),
            })
            {
                Attack(world, knight, target);
                Assert.Equal(new[] { Failed(reason) }, Take(knight));
            }

            Return(world, near);
            Attack(world, knight, near.Id);
            Assert.Equal(new[] { Failed(FailReason.InvalidTarget) }, Take(knight));
            world.Step();
            near.State = MonsterState.Idle;
            world.Place(near, Center(0), Center(0));
            world.Place(knight.Player!, Center(-4), Center(0));
            Take(knight);
            Attack(world, knight, near.Id);
            Assert.Equal(new[] { Failed(FailReason.InvalidTarget) }, Take(knight));
            Assert.False(knight.IsClosing);
            Assert.Equal(0u, knight.Player!.AttackTarget);

            world.Place(knight.Player!, Center(1), Center(0));
            Attack(world, knight, near.Id);
            Assert.Equal(near.Id, knight.Player!.AttackTarget);
            world.Receive(knight, new Packet { AttackStop = new AttackStop() });
            Assert.Equal(0u, knight.Player!.AttackTarget);
        }

        /// <summary>
        /// 치명타의 확률이 1이면 Damaged에 치명타 표시가 실린다(피해는 배수를 곱한 값).
        /// </summary>
        [Fact]
        public void CriticalHitsAreMarked()
        {
            Constants constants = TestData.Constants(64);
            constants.CritChance = 1;
            World world = CombatWorld(TestData.Draw(64), constants: constants);
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, world.Monsters[0].Id);
            StepFor(world, 7);
            Assert.True(Assert.Single(Combat(knight), IsDamaged).Damaged.Critical);
        }

        /// <summary>
        /// 맞은 비선공 몬스터는 벽 너머에서 맞아도 쫓고, 피해의 합이 더 큰 플레이어로 대상을 바꾼다.
        /// </summary>
        [Fact]
        public void HitMonstersChaseThroughWallsAndSwitchToTheBiggerDamage()
        {
            World world = CombatWorld(TestData.Draw(64, (-4, 2, -3, 6, '#')));
            Monster monster = world.Monsters[0];
            monster.SetStats(new Stats(10000, 0, 0, 0));
            monster.Hp = 10000;
            Session mage = Fighter(world, "hero_01", -10, 0, CharacterClass.Mage);
            Attack(world, mage, monster.Id);
            world.Step();
            world.Receive(mage, new Packet { AttackStop = new AttackStop() });
            // 발사체가 나는 동안 벽 (-4, 2..5) 뒤로 간다. 몬스터에서 선이 막힌 자리다.
            world.Place(mage.Player!, Center(-6), Center(4));
            StepFor(world, 17);
            Assert.True(monster.Damage.Contains(mage.Player!.Id));
            Assert.False(world.Monsters[0].State == MonsterState.Idle);
            StepUntil(world, () => monster.State == MonsterState.Attack, 200);
            Assert.Equal(mage.Player!.Id, monster.AttackTarget);

            Session knight = Fighter(world, "hero_02", (int)Math.Floor((double)monster.X / M), (int)Math.Floor((double)monster.Z / M));
            monster.Damage.Add(knight.Player!.Id, 100000);
            world.Step();
            Assert.Equal(knight.Player!.Id, monster.AttackTarget);
        }

        /// <summary>
        /// 공격을 시작한 쪽과 맞은 쪽의 전투 상태가 그 틱 + 5초(100틱)로 미뤄지고, 전투 상태에서 회복은 1%다.
        /// </summary>
        [Fact]
        public void SwingsAndHitsStartCombatAndSlowRegeneration()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", 1, 0);
            monster.Damage.Add(knight.Player!.Id, 1);
            uint swung = 0;
            for (int i = 0; i < 10 && swung == 0; i++)
            {
                uint tick = world.Tick;
                world.Step();
                swung = Combat(knight).Any(IsSwing) ? tick : 0;
            }

            Assert.Equal(swung + 100, monster.CombatEndTick);
            StepTo(world, swung + 6);
            world.Step();
            Assert.Equal(swung + 106, knight.Player!.CombatEndTick);
            // 몬스터가 더 치지 않게 표를 비운다(회복만 본다).
            monster.Damage.Clear();
            uint hp = knight.Player!.Hp;
            StepTo(world, ((world.Tick / 20) + 1) * 20);
            world.Step();
            Assert.Equal(hp + 1, knight.Player!.Hp);
        }

        /// <summary>
        /// 체력이 0이 되면 Died(죽인 개체)가 가고, 죽은 개체는 더 치지도 맞지도 회복하지도 않는다.
        /// </summary>
        [Fact]
        public void DeadCreaturesNeitherFightNorHeal()
        {
            World world = CombatWorld(TestData.Draw(64));
            Monster monster = world.Monsters[0];
            monster.Hp = 1;
            Session knight = Fighter(world, "hero_01", 1, 0);
            Attack(world, knight, monster.Id);
            StepFor(world, 7);
            List<Packet> packets = Combat(knight);
            Assert.Contains(new Packet { Died = new Died { Id = monster.Id, KillerId = knight.Player!.Id } }, packets);
            Assert.True(monster.Dead);
            (int, int) at = (monster.X, monster.Z);
            Attack(world, knight, monster.Id);
            Assert.Equal(new[] { Failed(FailReason.NoTarget) }, Take(knight));

            Monster killer = world.Monsters[0];
            World other = CombatWorld(TestData.Draw(64));
            Monster attacker = other.Monsters[0];
            Session victim = Fighter(other, "hero_01", 1, 0);
            victim.Player!.Hp = 1;
            attacker.Damage.Add(victim.Player!.Id, 1);
            StepFor(other, 10);
            Assert.True(victim.Player!.Dead);
            Assert.Equal(0u, attacker.AttackTarget);
            StepFor(other, 60);
            Assert.Equal(0u, victim.Player!.Hp);
            Assert.Equal(at, (killer.X, killer.Z));
        }

        /// <summary>
        /// 사건은 대상을 받은 연결과 대상 자신에게만 가고, 공격자를 받지 않은 연결에는 공격자 번호 0으로 간다(AttackSwing과 Damaged 모두).
        /// 같은 틱에 시야에 들어온 대상의 사건은 EntitiesEnter 뒤에 온다.
        /// </summary>
        [Fact]
        public void EventsGoToReceiversOfTheTargetWithUnknownAttackersAsZero()
        {
            World world = CombatWorld(TestData.Draw(128));
            Monster monster = world.Monsters[0];
            Session knight = Fighter(world, "hero_01", -1, 0);
            Session beyond = Fighter(world, "hero_02", 40, 0);
            Session away = Fighter(world, "hero_03", -60, 0);
            Session late = Fighter(world, "hero_04", -60, -60);
            Attack(world, knight, monster.Id);
            world.Place(late.Player!, Center(10), Center(0));
            world.Step();

            Assert.Contains(Swing(knight.Player!.Id, monster.Id), Combat(knight));
            Assert.Contains(Swing(0, monster.Id), Combat(beyond));
            Assert.DoesNotContain(Combat(away), IsSwing);
            List<Packet> arrived = Take(late);
            int entered = arrived.FindIndex(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter && packet.EntitiesEnter.Entities.Any(e => e.Id == monster.Id));
            Assert.InRange(entered, 0, arrived.FindIndex(IsSwing) - 1);

            StepFor(world, 6);
            Assert.Equal(knight.Player!.Id, Assert.Single(Combat(knight), IsDamaged).Damaged.AttackerId);
            Assert.Equal(0u, Assert.Single(Combat(beyond), IsDamaged).Damaged.AttackerId);
            Assert.DoesNotContain(Combat(away), IsDamaged);
        }

        private static World CombatWorld(
            string[] rows, Classes? classes = null, Constants? constants = null, IEnumerable<MonstersRow>? monsters = null, IEnumerable<SpawnsRow>? spawns = null, CharacterStore? store = null)
        {
            GameData data = TestData.WithMonsters(spawns ?? new[] { TestData.Spawn(1, 0, 0, 2) }, rows, classes, constants, monsters);
            return new World(10, spawnHalfExtent: 0, new Random(1), store ?? new CharacterStore(":memory:"), data);
        }

        /// <summary>
        /// 칸 (x, z) m의 가운데에 선 플레이어. 둘레를 받은 뒤(시야 차례가 한 번 돈 뒤)이고 쌓인 패킷은 비운다.
        /// </summary>
        /// <summary>
        /// 월드에 들어와 칸 (x, z)에 선 캐릭터. learnAll이면 직업의 스킬을 모두 배운 채다(스킬의 테스트가 스킬북 없이 씀. 36).
        /// </summary>
        private static Session Fighter(World world, string loginId, int x, int z, CharacterClass characterClass = CharacterClass.Knight, bool learnAll = true)
        {
            Session session = Join(world, loginId, characterClass);
            if (learnAll)
            {
                session.Player!.Skills.UnionWith(TestData.Skills.Rows.Where(skill => skill.Class == (uint)characterClass).Select(skill => skill.Id));
            }

            world.Step();
            world.Place(session.Player!, Center(x), Center(z));
            world.Step();
            Take(session);
            return session;
        }

        private static void Attack(World world, Session session, uint targetId)
        {
            world.Receive(session, new Packet { AttackStart = new AttackStart { TargetId = targetId } });
        }

        /// <summary>
        /// 몬스터를 놓인 점에서 8 m 떨어진 자리에 두고 복귀하게 한다(약 53틱 동안 복귀 중).
        /// </summary>
        private static void Return(World world, Monster monster)
        {
            world.Place(monster, monster.Placed.X, monster.Placed.Z - (8 * M));
            monster.State = MonsterState.Return;
        }

        /// <summary>
        /// 쌓인 패킷 가운데 전투의 사건(AttackSwing, Damaged, Died)만 꺼낸다(나머지도 비움).
        /// </summary>
        private static List<Packet> Combat(Session session)
        {
            return Take(session).Where(packet => packet.BodyCase is Packet.BodyOneofCase.AttackSwing or Packet.BodyOneofCase.Damaged or Packet.BodyOneofCase.Died).ToList();
        }

        private static bool IsSwing(Packet packet)
        {
            return packet.BodyCase == Packet.BodyOneofCase.AttackSwing;
        }

        private static bool IsDamaged(Packet packet)
        {
            return packet.BodyCase == Packet.BodyOneofCase.Damaged;
        }

        private static Packet Swing(uint attackerId, uint targetId)
        {
            return new Packet { AttackSwing = new AttackSwing { AttackerId = attackerId, TargetId = targetId } };
        }

        private static Packet Failed(FailReason reason)
        {
            return new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = RequestKind.Attack } };
        }

        private static void StepUntil(World world, Func<bool> done, int limit)
        {
            for (int i = 0; i < limit && !done(); i++)
            {
                world.Step();
            }
        }
    }
}
