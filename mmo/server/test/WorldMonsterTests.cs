using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 몬스터의 놓기, 인식, 추적, 복귀, 배회를 글자 맵(64 m, 원점이 가운데)에서 틱을 손으로 돌려 본다. 시험용 몬스터 1은 선공, 2는 비선공이고
    /// 3 m/s, 인식 8 m, 추적 한계 20 m, 사거리 2 m다. 플레이어는 맵의 가장 작은 모서리(마을)에서 들어와 테스트가 옮긴다.
    /// 무리의 자리 (x, z) m의 몬스터는 그 칸의 가운데 (x × 32 + 16, z × 32 + 16)에 선다(흩는 반경 0).
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 놓인 점은 모두 무리의 자리에서 흩는 반경 안이고 몬스터가 곧게 걸어갈 수 있는 점이다. 같은 씨앗이면 같은 자리다.
        /// </summary>
        [Fact]
        public void SpawnsScatterInsideTheRadiusOnWalkableLines()
        {
            string[] rows = TestData.Draw(64, (2, -3, 3, 4, '#'), (-3, 2, 2, 3, '#'), (-2, -4, -1, -1, 's'));
            World first = MonsterWorld(rows, 7, TestData.Spawn(1, 0, 0, 2, count: 30, scatter: 5));
            var field = new FieldMap(64, TestData.WithMonsters(Array.Empty<Data.SpawnsRow>(), rows).Zones.Rows, TestData.Map(rows).Grid);
            Assert.Equal(30, first.Monsters.Count);
            foreach (Monster monster in first.Monsters)
            {
                Assert.InRange(Distance(monster.X, monster.Z, Center(0), Center(0)), 0, 5 * M);
                Assert.True(field.CanWalkLine(Center(0), Center(0), monster.X, monster.Z, Walker.Monster));
            }

            World second = MonsterWorld(rows, 7, TestData.Spawn(1, 0, 0, 2, count: 30, scatter: 5));
            Assert.Equal(first.Monsters.Select(m => (m.Id, m.X, m.Z)), second.Monsters.Select(m => (m.Id, m.X, m.Z)));
            Assert.Equal(Enumerable.Range(1, 30).Select(i => (uint)i), first.Monsters.Select(m => m.Id));
        }

        /// <summary>
        /// 선공 몬스터는 인식 범위 안의 플레이어를 피해 0으로 표에 넣고 쫓아 사거리에서 서고, 비선공 몬스터는 쫓지 않는다.
        /// </summary>
        [Fact]
        public void AggressiveMonstersChaseAndPassiveOnesDoNot()
        {
            World world = MonsterWorld(TestData.Draw(64), 1, TestData.Spawn(1, -10, 0, 1), TestData.Spawn(2, 10, 0, 2));
            Monster aggressive = world.Monsters[0];
            Monster passive = world.Monsters[1];
            Player near = Enter(world, "hero_01", Center(-4), Center(0));
            Player other = Enter(world, "hero_02", Center(13), Center(0));

            StepFor(world, 100);
            Assert.True(aggressive.Damage.Contains(near.Id));
            Assert.Equal(MonsterState.Attack, aggressive.State);
            Assert.InRange(Distance(aggressive.X, aggressive.Z, near.X, near.Z), 0, 2 * M);
            Assert.Equal(0, passive.Damage.Count);
            Assert.Equal((Center(10), Center(0)), (passive.X, passive.Z));
            Assert.Equal(MonsterState.Idle, passive.State);
            Assert.False(passive.Damage.Contains(other.Id));
        }

        /// <summary>
        /// 범위 안이어도 벽 너머의 플레이어와 안전 지대 안의 플레이어는 인식하지 않는다.
        /// </summary>
        [Fact]
        public void WallsAndSafeZonesHidePlayersFromDetection()
        {
            string[] rows = TestData.Draw(64, (3, -5, 4, 6, '#'), (-6, -3, -4, 3, 's'));
            World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 1));
            Monster monster = world.Monsters[0];
            Enter(world, "hero_01", Center(6), Center(0));
            Enter(world, "hero_02", Center(-5), Center(0));

            StepFor(world, 30);
            Assert.Equal(0, monster.Damage.Count);
            Assert.Equal(MonsterState.Idle, monster.State);
        }

        /// <summary>
        /// 인식은 5틱마다이고, 개체 번호를 5로 나눈 나머지가 다른 몬스터는 다른 틱에 인식한다.
        /// </summary>
        [Fact]
        public void DetectionRunsEveryFiveTicksStaggeredById()
        {
            World world = MonsterWorld(TestData.Draw(64), 1, TestData.Spawn(1, 0, 0, 1), TestData.Spawn(2, 0, 4, 1));
            Player player = Enter(world, "hero_01", Center(-30), Center(-30));
            StepTo(world, 11);
            world.Place(player, Center(-3), Center(2));

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

            Assert.Equal(new Dictionary<uint, uint> { [1] = 11, [2] = 12 }, first);
        }

        /// <summary>
        /// 피해 표: 인식은 0으로 들고, 합이 같으면 먼저 든 줄, 크면 그 줄을 고른다. 건너뛰는 줄은 고르지 않는다. 잡은 편도 같은 차례다.
        /// </summary>
        [Fact]
        public void TheDamageTablePicksTheLargestSumAndTheFirstOnTies()
        {
            var table = new DamageTable();
            table.Add(7, 0);
            table.Add(3, 0);
            Assert.Equal(7u, table.Pick(_ => true, Solo));
            Assert.Equal(7ul, table.Killer(Solo));

            table.Add(3, 5);
            Assert.Equal(3u, table.Pick(_ => true, Solo));
            Assert.Equal(7u, table.Pick(id => id != 3, Solo));
            Assert.Equal(3ul, table.Killer(Solo));

            table.Add(7, 5);
            Assert.Equal(7u, table.Pick(_ => true, Solo));
            Assert.Null(table.Pick(_ => false, Solo));

            table.RemoveWhere(id => id == 7);
            Assert.Equal(3ul, table.Killer(Solo));
        }

        /// <summary>
        /// 걷는 선이 트이면 곧게 쫓는다(z가 그대로). 벽에 막히면 벽을 돌아 쫓아 사거리에 서고, 그동안 막힌 칸에 서지 않는다.
        /// 맞아서 시작한 추적이라 선과 상관없이 쫓는다(때린 것은 표에 피해를 넣어 대신함).
        /// </summary>
        [Fact]
        public void ChasesStraightWhenOpenAndAroundWallsWhenBlocked()
        {
            string[] rows = TestData.Draw(64, (3, -6, 4, 7, '#'));
            World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 2), TestData.Spawn(2, 0, -15, 2));
            Monster blocked = world.Monsters[0];
            Monster open = world.Monsters[1];
            Player target = Enter(world, "hero_01", Center(6), Center(0));
            Player straight = Enter(world, "hero_02", Center(8), Center(-15));
            blocked.Damage.Add(target.Id, 10);
            open.Damage.Add(straight.Id, 10);
            var field = new FieldMap(64, TestData.WithMonsters(Array.Empty<Data.SpawnsRow>(), rows).Zones.Rows, TestData.Map(rows).Grid);

            for (int i = 0; i < 200 && blocked.State != MonsterState.Attack; i++)
            {
                world.Step();
                Assert.True(field.CanWalk(blocked.X, blocked.Z, Walker.Monster));
                Assert.Equal(Center(-15), open.Z);
            }

            Assert.Equal(MonsterState.Attack, blocked.State);
            Assert.InRange(Distance(blocked.X, blocked.Z, target.X, target.Z), 0, 2 * M);
            Assert.Equal(MonsterState.Attack, open.State);
        }

        /// <summary>
        /// 길을 따라가는 동안 대상이 길을 찾은 때의 자리에서 3 m 넘게 옮기기 전에는 길을 다시 찾지 않는다.
        /// </summary>
        [Fact]
        public void ThePathIsKeptUntilTheTargetMovesThreeMeters()
        {
            World world = MonsterWorld(TestData.Draw(64, (3, -12, 4, 13, '#')), 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Player target = Enter(world, "hero_01", Center(6), Center(0));
            monster.Damage.Add(target.Id, 10);

            world.Step();
            (int X, int Z) goal = monster.PathGoal;
            Assert.Equal((target.X, target.Z), goal);
            world.Place(target, target.X, target.Z + (2 * M));
            world.Step();
            Assert.Equal(goal, monster.PathGoal);
            world.Place(target, target.X, target.Z + (2 * M));
            world.Step();
            Assert.Equal((target.X, target.Z), monster.PathGoal);
        }

        /// <summary>
        /// 추적 한계 안에 길이 없는 대상은 "닿을 수 없음"으로 5초 동안 건너뛰고(그동안 다음 대상을 쫓음), 5초 뒤에 다시 고른다.
        /// </summary>
        [Fact]
        public void UnreachableTargetsAreSkippedForFiveSeconds()
        {
            string[] rows = TestData.Draw(64, (8, -3, 13, 3, '#'), (9, -2, 12, 2, '.'));
            World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Player boxed = Enter(world, "hero_01", Center(10), Center(0));
            Player open = Enter(world, "hero_02", Center(-12), Center(0));
            monster.Damage.Add(boxed.Id, 50);
            monster.Damage.Add(open.Id, 10);

            uint marked = world.Tick;
            world.Step();
            ulong generation = monster.Unreachable[boxed.Id];
            StepTo(world, marked + 100);
            Assert.Equal(generation, monster.Unreachable[boxed.Id]);
            Assert.True(monster.X < Center(0), "the monster chased the reachable player meanwhile");
            Assert.True(monster.Damage.Contains(boxed.Id));

            world.Step();
            Assert.NotEqual(generation, monster.Unreachable[boxed.Id]);
        }

        /// <summary>
        /// 안전 지대에 든 대상은 건너뛰되 표에 남는다. 표의 대상이 모두 안전 지대 안이면 복귀하고 표를 비운다.
        /// </summary>
        [Fact]
        public void TargetsInSafeZonesAreSkippedAndAllSkippedMeansReturn()
        {
            string[] rows = TestData.Draw(64, (-8, -3, -5, 3, 's'));
            World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Player safe = Enter(world, "hero_01", Center(-6), Center(0));
            Player open = Enter(world, "hero_02", Center(5), Center(0));
            monster.Damage.Add(safe.Id, 50);
            monster.Damage.Add(open.Id, 10);

            StepFor(world, 3);
            Assert.True(monster.X > Center(0), "the monster chased the player outside");
            Assert.True(monster.Damage.Contains(safe.Id));

            world.Place(open, Center(-7), Center(1));
            world.Step();
            Assert.Equal(MonsterState.Return, monster.State);
            Assert.Equal(0, monster.Damage.Count);
        }

        /// <summary>
        /// 놓인 점에서의 직선거리가 추적 한계를 넘으면 복귀하고 표를 비우며, 곧게 걸어 놓인 점에서 대기로 돌아간다.
        /// </summary>
        [Fact]
        public void BeyondTheChaseLimitTheMonsterReturnsAndClearsTheTable()
        {
            World world = MonsterWorld(TestData.Draw(64), 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Player player = Enter(world, "hero_01", Center(25), Center(0));
            monster.Damage.Add(player.Id, 10);
            world.Place(monster, Center(21), Center(0));

            world.Step();
            Assert.Equal(MonsterState.Return, monster.State);
            Assert.Equal(0, monster.Damage.Count);
            StepUntilIdle(world, monster, 300);
            Assert.Equal((Center(0), Center(0)), (monster.X, monster.Z));
        }

        /// <summary>
        /// 추적 한계를 막 넘은 자리에서 벽에 가려 곧게 갈 수 없으면 "지금 거리 + 4 m" 안의 칸으로 벽을 돌아 걸어서 돌아간다(순간 이동하지 않음).
        /// </summary>
        [Fact]
        public void ReturningWalksAroundWallsFromJustBeyondTheLimit()
        {
            World world = MonsterWorld(TestData.Draw(64, (10, -3, 11, 4, '#')), 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            world.Place(monster, Center(21), Center(0));

            world.Step();
            Assert.Equal(MonsterState.Return, monster.State);
            int lastX = monster.X;
            int lastZ = monster.Z;
            for (int i = 0; i < 300 && monster.State != MonsterState.Idle; i++)
            {
                world.Step();
                Assert.InRange(Distance(lastX, lastZ, monster.X, monster.Z), 0, 6);
                (lastX, lastZ) = (monster.X, monster.Z);
            }

            Assert.Equal((Center(0), Center(0), MonsterState.Idle), (monster.X, monster.Z, monster.State));
        }

        /// <summary>
        /// 복귀할 길이 없으면 놓인 점으로 순간 이동하고, 보는 연결은 순간 이동 표시가 있는 움직임을 받는다.
        /// </summary>
        [Fact]
        public void WithoutAWayBackTheMonsterTeleportsWithTheFlag()
        {
            World world = MonsterWorld(TestData.Draw(64, (20, -2, 25, 3, '#'), (21, -1, 24, 2, '.')), 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session observer = Join(world, "hero_01");
            world.Place(observer.Player!, Center(-3), Center(0));
            world.Step();
            world.Place(monster, Center(22), Center(0));
            Take(observer);

            world.Step();
            Assert.Equal((Center(0), Center(0), MonsterState.Idle), (monster.X, monster.Z, monster.State));
            EntityMove move = Take(observer).Single(packet => packet.BodyCase == Packet.BodyOneofCase.EntityMoves).EntityMoves.Entities.Single();
            Assert.Equal((monster.Id, Center(0), Center(0), true), (move.Id, move.X, move.Z, move.Teleport));
        }

        /// <summary>
        /// 복귀 중에는 1초마다 최대 체력의 20%가 차고, 복귀 중이 아닌 몬스터는 차지 않는다.
        /// </summary>
        [Fact]
        public void OnlyReturningMonstersRegenerate()
        {
            World world = MonsterWorld(TestData.Draw(64), 1, TestData.Spawn(1, 0, 0, 2), TestData.Spawn(2, -20, 10, 2));
            Monster returning = world.Monsters[0];
            Monster idle = world.Monsters[1];
            world.Place(returning, Center(21), Center(0));
            returning.Hp = 10;
            idle.Hp = 10;

            StepTo(world, 20);
            Assert.Equal(MonsterState.Return, returning.State);
            Assert.Equal(10u, returning.Hp);
            world.Step();
            Assert.Equal((30u, 10u), (returning.Hp, idle.Hp));
            StepTo(world, 40);
            world.Step();
            Assert.Equal((50u, 10u), (returning.Hp, idle.Hp));
        }

        /// <summary>
        /// 배회는 놓인 점에서 배회 반경 안이고 걷는 선이 트인 점으로만 가고, 닿으면 3–6초 선다. 둘레 9개의 시야 칸에 플레이어가 없으면 서 있다.
        /// </summary>
        [Fact]
        public void WanderingStaysInTheRadiusPausesAndSleepsWithoutPlayers()
        {
            // 시야 칸(32 m) 둘을 떨어지려면 64 m보다 넓은 맵이 필요하다.
            string[] rows = TestData.Draw(128, (2, -2, 3, 3, '#'));
            World world = MonsterWorld(rows, 3, TestData.Spawn(1, 0, 0, 2, wander: 5));
            Monster monster = world.Monsters[0];
            var field = new FieldMap(128, TestData.WithMonsters(Array.Empty<Data.SpawnsRow>(), rows).Zones.Rows, TestData.Map(rows).Grid);
            Player player = Enter(world, "hero_01", Center(-20), Center(-20));

            var pauses = new List<uint>();
            int goals = 0;
            uint arrived = 0;
            bool wasWandering = false;
            for (int i = 0; i < 3000; i++)
            {
                (int x, int z) = (monster.X, monster.Z);
                uint tick = world.Tick;
                world.Step();
                if (monster.Wandering && !wasWandering)
                {
                    goals++;
                    Assert.InRange(Distance(monster.WanderGoal.X, monster.WanderGoal.Z, Center(0), Center(0)), 0, 5 * M);
                    Assert.True(field.CanWalkLine(x, z, monster.WanderGoal.X, monster.WanderGoal.Z, Walker.Monster));
                    if (arrived > 0)
                    {
                        pauses.Add(tick - arrived);
                    }
                }

                if (!monster.Wandering && wasWandering)
                {
                    arrived = tick;
                }

                wasWandering = monster.Wandering;
            }

            Assert.True(goals >= 5, $"wandered to {goals} points");
            Assert.All(pauses, pause => Assert.InRange(pause, 60u, 121u));

            world.Place(player, Center(-60), Center(-60));
            StepFor(world, 10);
            (int X, int Z) still = (monster.X, monster.Z);
            StepFor(world, 400);
            Assert.Equal(still, (monster.X, monster.Z));
        }

        /// <summary>
        /// 곧게 가는 길과 A*의 길 모두 안전 지대에 들어가지 않는다(안전 지대의 띠에 난 틈으로 돌아 감).
        /// </summary>
        [Fact]
        public void MonstersNeverStepIntoSafeZones()
        {
            string[] rows = TestData.Draw(64, (3, -12, 5, 12, 's'), (3, 8, 5, 10, '.'));
            World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Player player = Enter(world, "hero_01", Center(8), Center(0));
            monster.Damage.Add(player.Id, 10);
            var field = new FieldMap(64, TestData.WithMonsters(Array.Empty<Data.SpawnsRow>(), rows).Zones.Rows, TestData.Map(rows).Grid);

            for (int i = 0; i < 300 && monster.State != MonsterState.Attack; i++)
            {
                world.Step();
                Assert.False(field.IsSafe(monster.X, monster.Z));
            }

            Assert.Equal(MonsterState.Attack, monster.State);
        }

        /// <summary>
        /// 두 틱을 건너뛴 틱(지난 틱 수 3)에서는 세 틱 치의 거리를 꺾이는 점을 따라 간다(한 틱씩 세 번 돌린 것과 같은 자리).
        /// </summary>
        [Fact]
        public void SkippedTicksMoveTheWholeDistanceAlongThePath()
        {
            string[] rows = TestData.Draw(64, (3, -6, 4, 7, '#'));
            (World world, Monster monster) Setup()
            {
                World world = MonsterWorld(rows, 1, TestData.Spawn(1, 0, 0, 2));
                Monster monster = world.Monsters[0];
                Player target = Enter(world, "hero_01", Center(6), Center(0));
                monster.Damage.Add(target.Id, 10);
                StepFor(world, 20);
                return (world, monster);
            }

            (World single, Monster stepped) = Setup();
            (World skipped, Monster jumped) = Setup();
            Assert.NotEmpty(stepped.Path);
            StepFor(single, 3);
            skipped.Step(3);
            Assert.InRange(Distance(stepped.X, stepped.Z, jumped.X, jumped.Z), 0, 3);
        }

        /// <summary>
        /// 월드에서 빠진 플레이어는 다음 틱에 표에서 빠진다.
        /// </summary>
        [Fact]
        public void PlayersLeavingTheWorldLeaveTheTable()
        {
            World world = MonsterWorld(TestData.Draw(64), 1, TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session session = Join(world, "hero_01");
            world.Place(session.Player!, Center(5), Center(0));
            monster.Damage.Add(session.Player!.Id, 10);
            world.Disconnect(session);

            world.Step();
            Assert.Equal(0, monster.Damage.Count);
        }

        private static World MonsterWorld(string[] rows, int seed, params Data.SpawnsRow[] spawns)
        {
            return new World(10, spawnHalfExtent: 0, new Random(seed), new CharacterStore(":memory:"), TestData.WithMonsters(spawns, rows));
        }

        /// <summary>
        /// 들어와 한 틱을 돌린 뒤 (x, z)로 옮긴 플레이어.
        /// </summary>
        private static Player Enter(World world, string loginId, int x, int z)
        {
            Session session = Join(world, loginId);
            world.Step();
            world.Place(session.Player!, x, z);
            return session.Player!;
        }

        /// <summary>
        /// 칸 (m)의 가운데(1/32 m).
        /// </summary>
        private static int Center(int meters)
        {
            return (meters * M) + (M / 2);
        }

        private static double Distance(int ax, int az, int bx, int bz)
        {
            return Math.Sqrt(Math.Pow(ax - bx, 2) + Math.Pow(az - bz, 2));
        }

        private static void StepFor(World world, int ticks)
        {
            for (int i = 0; i < ticks; i++)
            {
                world.Step();
            }
        }

        private static void StepUntilIdle(World world, Monster monster, int limit)
        {
            for (int i = 0; i < limit && monster.State != MonsterState.Idle; i++)
            {
                world.Step();
            }
        }
    }
}
