using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 몬스터 재우기(56). 256 m 맵(시야 칸 8×8)에서 몬스터의 둘레 9개 시야 칸에 플레이어를 들이고 빼며 몬스터 차례가 건너뛰는지 본다.
    /// 플레이어는 맵의 가장 작은 모서리(시야 칸 (-4, -4))에서 들어온다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 잠든 선공 몬스터는 둘레에 플레이어가 들어오면 깨어나 인식한다. 처음부터 함께 잠들었던 두 몬스터의 첫 인식은 깨어난 틱에 몰리지 않고
        /// 저마다 번호 % 5의 위상에서 한다.
        /// </summary>
        [Fact]
        public void WokenMonstersDetectOnTheirOwnPhase()
        {
            World world = MonsterWorld(TestData.Draw(256), 1, TestData.Spawn(1, 60, 60, 1), TestData.Spawn(2, 60, 64, 1));
            Player player = Enter(world, "hero_01", Center(-100), Center(-100));
            StepFor(world, 23);
            Assert.All(world.Monsters, monster => Assert.True(monster.Asleep));
            Assert.All(world.Monsters, monster => Assert.Equal(0, monster.Damage.Count));

            world.Place(player, Center(57), Center(62));
            uint woke = world.Tick;
            var first = new Dictionary<uint, uint>();
            for (int i = 0; i < 10; i++)
            {
                uint tick = world.Tick;
                world.Step();
                foreach (Monster monster in world.Monsters.Where(m => m.Damage.Contains(player.Id) && !first.ContainsKey(m.Id)))
                {
                    first.Add(monster.Id, tick);
                }
            }

            Assert.Equal(2, first.Count);
            Assert.All(world.Monsters, monster =>
            {
                Assert.False(monster.Asleep);
                Assert.Equal(monster.Id % AiCreature.DetectIntervalTicks, first[monster.Id] % AiCreature.DetectIntervalTicks);
                Assert.InRange(first[monster.Id], woke, woke + AiCreature.DetectIntervalTicks - 1);
            });
            Assert.Equal(2, first.Values.Distinct().Count());
        }

        /// <summary>
        /// 마지막 플레이어가 끊겨 빠지면 그다음 틱부터 배회하던 몬스터를 계산하지 않는다. 전투 중에 끊겨 월드에 남은 캐릭터만 있어도 깨어 있다.
        /// </summary>
        [Fact]
        public void MonstersSleepOnceTheLastPlayerLeavesUnlessACharacterLingers()
        {
            World world = MonsterWorld(TestData.Draw(256), 3, TestData.Spawn(1, 60, 60, 2, wander: 5));
            Monster monster = world.Monsters[0];
            Session session = Join(world, "hero_01");
            world.Step();
            world.Place(session.Player!, Center(50), Center(60));
            StepFor(world, 5);
            Assert.False(monster.Asleep);

            world.Disconnect(session);
            world.Step();
            Assert.True(monster.Asleep);
            (int X, int Z) still = (monster.X, monster.Z);
            StepFor(world, 400);
            Assert.Equal(still, (monster.X, monster.Z));

            Session fighter = Join(world, "hero_02");
            world.Step();
            world.Place(fighter.Player!, Center(50), Center(60));
            fighter.Player!.CombatEndTick = world.Tick + 300;
            world.Disconnect(fighter);
            Assert.Equal(1, world.Lingering.Count);
            for (int i = 0; i < 200; i++)
            {
                world.Step();
                Assert.False(monster.Asleep);
            }

            Assert.NotEqual(still, (monster.X, monster.Z));
        }

        /// <summary>
        /// 둘레에 플레이어가 없어 잠든 동안에도 예약한 일은 돈다: 쓰러진 몬스터가 3초 뒤 사라지고 5초 뒤 다시 나온다.
        /// </summary>
        [Fact]
        public void RespawnsRunWhileAsleep()
        {
            World world = MonsterWorld(TestData.Draw(256), 1, TestData.Spawn(1, 60, 60, 2, respawnMs: 5000));
            Monster monster = world.Monsters[0];
            monster.Hp = 1;
            Session knight = Fighter(world, "hero_01", 59, 60);
            Attack(world, knight, monster.Id);
            StepUntil(world, () => monster.Dead, 10);
            uint died = world.Tick;
            world.Place(knight.Player!, Center(-100), Center(-100));
            world.Step();
            Assert.True(monster.Asleep);

            StepTo(world, died + Units.TicksPerSecond * 5);
            Monster reborn = Assert.Single(world.Monsters);
            Assert.NotSame(monster, reborn);
            Assert.False(reborn.Dead);
            world.Step();
            Assert.True(reborn.Asleep);
        }

        /// <summary>
        /// 복귀하며 걷던 몬스터가 잠들면 여유 목록(78)으로 아직 받는 연결에 멈춤(빠르기 0)이 가고, 자는 동안 그 자리에 서 있다가 깨어나면 복귀를 잇는다.
        /// </summary>
        [Fact]
        public void AWalkingMonsterSendsAStopWhenItSleepsAndKeepsReturningWhenWoken()
        {
            World world = MarginWorld(TestData.Spawn(1, -55, 0, 2));
            Monster monster = world.Monsters[0];
            Session observer = Join(world, "hero_01");
            world.Step();
            world.Place(observer.Player!, Center(-20), Center(0));
            StepFor(world, 2);
            Take(observer);
            // 놓인 점에서 21 m(추적 한계 20 m 밖)라 복귀를 시작한다. 시야 칸 -2의 오른쪽 끝이다.
            world.Place(monster, Center(-34), Center(0));
            StepFor(world, 3);
            Assert.Equal(MonsterState.Return, monster.State);
            Assert.Contains(TakeMoves(observer, monster.Id), move => move.Speed > 0);

            // 보는 쪽이 시야 칸 0으로 가면 몬스터의 둘레(-3..-1)에 플레이어가 없고, 몬스터는 보는 쪽의 시야(-1..1)의 8 m 여유 안이다.
            world.Place(observer.Player!, Center(1), Center(0));
            world.Step();
            Assert.True(monster.Asleep);
            Assert.Contains(monster, observer.Player!.Visible);
            Assert.Equal(0u, TakeMoves(observer, monster.Id).Single().Speed);
            (int X, int Z) still = (monster.X, monster.Z);
            StepFor(world, 40);
            Assert.Equal((still, MonsterState.Return), ((monster.X, monster.Z), monster.State));
            Assert.Empty(TakeMoves(observer, monster.Id));

            world.Place(observer.Player!, Center(-20), Center(0));
            world.Step();
            Assert.Contains(TakeMoves(observer, monster.Id), move => move.Speed > 0);
            StepUntilIdle(world, monster, 200);
            Assert.Equal((monster.Placed.X, monster.Placed.Z), (monster.X, monster.Z));
        }

        /// <summary>
        /// 쫓던 몬스터는 대상이 멀리 가 잠든 동안 추적 상태 그대로 서 있고, 대상이 돌아오면 그대로 쫓는다.
        /// </summary>
        [Fact]
        public void AChasingMonsterKeepsChasingAfterSleeping()
        {
            World world = MonsterWorld(TestData.Draw(256), 1, TestData.Spawn(1, 60, 60, 1));
            Monster monster = world.Monsters[0];
            Player player = Enter(world, "hero_01", Center(55), Center(60));
            StepUntil(world, () => monster.State == MonsterState.Chase, 10);
            Assert.Equal(MonsterState.Chase, monster.State);

            world.Place(player, Center(-100), Center(-100));
            world.Step();
            (int X, int Z) still = (monster.X, monster.Z);
            StepFor(world, 200);
            Assert.True(monster.Asleep);
            Assert.Equal((still, MonsterState.Chase), ((monster.X, monster.Z), monster.State));

            world.Place(player, Center(70), Center(60));
            double before = Distance(monster.X, monster.Z, player.X, player.Z);
            StepFor(world, 5);
            Assert.Equal(MonsterState.Chase, monster.State);
            Assert.True(Distance(monster.X, monster.Z, player.X, player.Z) < before);
        }

        /// <summary>
        /// 둘레에 플레이어가 없는 경비병도 계산하지 않는다: 놓인 점 밖에서 복귀 상태로 서 있다가, 플레이어가 들어오면 돌아간다.
        /// </summary>
        [Fact]
        public void GuardsWithoutPlayersAroundAreNotComputed()
        {
            World world = GuardWorld();
            Guard guard = world.Guards.Single();
            world.Place(guard, Center(20), Center(0));
            guard.State = MonsterState.Return;
            StepFor(world, 40);
            Assert.True(guard.Asleep);
            Assert.Equal((Center(20), Center(0)), (guard.X, guard.Z));

            Fighter(world, "hero_01", -20, -20);
            StepUntil(world, () => guard.State == MonsterState.Idle, 200);
            Assert.Equal(guard.Home, (guard.X, guard.Z));
        }

        /// <summary>
        /// 쌓인 패킷을 비우고 그 가운데 개체 id의 EntityMove를 모두 낸다.
        /// </summary>
        private static List<EntityMove> TakeMoves(Session observer, uint id)
        {
            return Take(observer).Where(packet => packet.EntityMoves != null).SelectMany(packet => packet.EntityMoves.Entities).Where(move => move.Id == id).ToList();
        }
    }
}
