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
    /// 이동을 바뀔 때만 알리기(54). 기준은 TestData.Constants의 실제 값이다: 방향 8칸, 방향 간격 4틱, 확인·멈춤·다음 점 간격 10틱.
    /// 걷는 플레이어의 빠르기는 6 m/s(192칸/초), 시험 몬스터는 3 m/s(96칸/초)다.
    /// </summary>
    public partial class WorldTests
    {
        private const uint WalkSpeed = 192;

        /// <summary>
        /// 곧게 걷는 플레이어는 출발과 10틱마다의 확인만 간다.
        /// </summary>
        [Fact]
        public void AStraightWalkerIsSentOnStartAndEveryConfirmation()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 5, 0);
            Take(observer);

            var sent = new List<int>();
            for (int i = 0; i <= 30; i++)
            {
                if (StepWalk(world, walker, observer, 9, 64) is EntityMove move)
                {
                    Assert.Equal((WalkSpeed, 64u, walker.Player!.X), (move.Speed, move.Yaw, move.X));
                    sent.Add(i);
                }
            }

            Assert.Equal(new[] { 0, 10, 20, 30 }, sent);
        }

        /// <summary>
        /// 방향은 알린 값에서 8칸 넘게 바뀐 틱에 가고(8칸은 가지 않음), 매 틱 돌아도 4틱에 한 번만 간다.
        /// </summary>
        [Fact]
        public void TurnsAreSentPastEightStepsAtMostEveryFourTicks()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 5, 0);
            Take(observer);

            // 0: 출발, 5: 8칸(가지 않음), 6: 9칸, 7부터 매 틱 16칸씩 → 10, 14.
            uint[] yaws = { 64, 64, 64, 64, 64, 72, 73, 89, 105, 121, 137, 153, 169, 185, 201 };
            var sent = new List<int>();
            for (int i = 0; i < yaws.Length; i++)
            {
                if (StepWalk(world, walker, observer, 9, yaws[i]) is EntityMove move)
                {
                    Assert.Equal(yaws[i], move.Yaw);
                    sent.Add(i);
                }
            }

            Assert.Equal(new[] { 0, 6, 10, 14 }, sent);
        }

        /// <summary>
        /// 멈춤이 가는 때: 움직이는 중 표시가 꺼진 Move, 표시가 켜졌는데 바로 앞의 Move와 같은 자리, 10틱 동안 Move가 없음, 서버가 세움(기절).
        /// </summary>
        [Fact]
        public void StopsAreSentForStopMovesBlockedMovesSilenceAndStuns()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 5, 0);
            uint id = walker.Player!.Id;
            Take(observer);

            Assert.Equal(WalkSpeed, StepWalk(world, walker, observer, 9, 64)!.Speed);
            Assert.Null(StepWalk(world, walker, observer, 9, 64));
            EntityMove stop = StepWalk(world, walker, observer, 9, 64, moving: false)!;
            Assert.Equal((0u, walker.Player!.X), (stop.Speed, stop.X));

            Assert.Equal(WalkSpeed, StepWalk(world, walker, observer, 9, 64)!.Speed);
            Assert.Equal(0u, StepWalk(world, walker, observer, 0, 64)!.Speed);

            Assert.Equal(WalkSpeed, StepWalk(world, walker, observer, 9, 64)!.Speed);
            for (int i = 0; i < 9; i++)
            {
                world.Step();
                Assert.Null(MoveOf(observer, id));
            }

            world.Step();
            Assert.Equal(0u, MoveOf(observer, id)!.Speed);

            Assert.Equal(WalkSpeed, StepWalk(world, walker, observer, 9, 64)!.Speed);
            world.Effects.Apply(walker.Player!, TestData.Effects.Rows.Single(row => row.Kind == EffectKind.Stun), world.Tick);
            world.Step();
            Assert.Equal(0u, MoveOf(observer, id)!.Speed);
        }

        /// <summary>
        /// 한 틱 걸러 Move를 보내며 걷는 플레이어(프레임이 낮은 클라이언트)에게서 멈춤과 출발이 되풀이되지 않는다.
        /// </summary>
        [Fact]
        public void AWalkerSkippingTicksIsNotStoppedAndRestarted()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 5, 0);
            uint id = walker.Player!.Id;
            Take(observer);

            var sent = new List<int>();
            for (int i = 0; i < 40; i++)
            {
                EntityMove? move = (i % 2) == 0 ? StepWalk(world, walker, observer, 18, 64) : StepAndTake(world, observer, id);
                if (move != null)
                {
                    Assert.Equal(WalkSpeed, move.Speed);
                    sent.Add(i);
                }
            }

            Assert.Equal(new[] { 0, 10, 20, 30 }, sent);
        }

        /// <summary>
        /// 감속이 붙은 틱과 떨어진 틱에 새 빠르기가 간다.
        /// </summary>
        [Fact]
        public void SlowsChangeTheSentSpeed()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 5, 0);
            Take(observer);

            Assert.Equal(WalkSpeed, StepWalk(world, walker, observer, 4, 64)!.Speed);
            world.Effects.Apply(walker.Player!, TestData.Effects.Rows.Single(row => row.Kind == EffectKind.Slow), world.Tick);
            uint end = walker.Player!.Effects.Single().EndTick;
            Assert.Equal(WalkSpeed / 2, StepWalk(world, walker, observer, 4, 64)!.Speed);

            while (StepWalk(world, walker, observer, 4, 64) is var move && (move?.Speed != WalkSpeed))
            {
                Assert.True(world.Tick <= end + 1, "the slow ended without a new speed");
            }

            Assert.Equal(end, world.Tick - 1);
        }

        /// <summary>
        /// 걷는 중에 시야에 든 연결은 EntityEnter로 빠르기와 방향을 받는다.
        /// </summary>
        [Fact]
        public void LateWatchersGetTheMotionInTheEnter()
        {
            World world = NoticeWorld();
            Session observer = Fighter(world, "hero_01", 0, 0);
            Session walker = Fighter(world, "hero_02", 70, 0);
            uint id = walker.Player!.Id;
            Take(observer);

            EntityEnter? entered = null;
            for (int i = 0; (i < 40) && (entered == null); i++)
            {
                StepWalk(world, walker, walker, -9, 192);
                entered = Take(observer).Where(packet => packet.EntitiesEnter != null).SelectMany(packet => packet.EntitiesEnter.Entities).SingleOrDefault(entity => entity.Id == id);
            }

            Assert.NotNull(entered);
            Assert.Equal((WalkSpeed, 192u, walker.Player!.X), (entered!.Speed, entered.Yaw, entered.X));
        }

        /// <summary>
        /// 쫓기 시작한 몬스터는 설 자리(사거리 0.25 m 안쪽)와 빠르기를 알리고, 사거리에 들어 선 틱에 멈춤을 알린다. 그 사이에는 가지 않는다.
        /// 걷는 동안 시야에 든 연결은 EntityEnter로 같은 점과 빠르기를 받는다.
        /// </summary>
        [Fact]
        public void AChasingMonsterSendsItsStopPointAndItsStop()
        {
            World world = NoticeWorld(TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session hunter = Fighter(world, "hero_01", 10, 0);
            monster.Damage.Add(hunter.Player!.Id, 10);
            Take(hunter);

            var sent = new List<EntityMove>();
            for (int i = 0; (i < 120) && (monster.State != MonsterState.Attack); i++)
            {
                if (StepAndTake(world, hunter, monster.Id) is EntityMove move)
                {
                    sent.Add(move);
                }

                if (i == 5)
                {
                    Session late = Join(world, "hero_02");
                    world.Step();
                    Take(late);
                    world.Place(late.Player!, Center(-60), Center(0));
                    world.Step();
                    Take(late);
                    world.Place(late.Player!, Center(0), Center(5));
                    world.Step();
                    EntityEnter enter = Take(late).Where(packet => packet.EntitiesEnter != null).SelectMany(packet => packet.EntitiesEnter.Entities).Single(entity => entity.Id == monster.Id);
                    Assert.Equal((96u, Center(10) - 56, Center(0)), (enter.Speed, enter.NextX, enter.NextZ));
                    if (MoveOf(hunter, monster.Id) is EntityMove skipped)
                    {
                        sent.Add(skipped);
                    }
                }
            }

            Assert.Equal(MonsterState.Attack, monster.State);
            Assert.Equal(2, sent.Count);
            Assert.Equal((96u, Center(10) - 56, Center(0)), (sent[0].Speed, sent[0].NextX, sent[0].NextZ));
            Assert.Equal((0u, monster.X, monster.Z), (sent[1].Speed, sent[1].X, sent[1].Z));
        }

        /// <summary>
        /// 쫓는 대상이 움직여 설 자리가 매 틱 바뀌어도 10틱에 한 번만 간다.
        /// </summary>
        [Fact]
        public void AMovingTargetSendsTheStopPointAtMostEveryTenTicks()
        {
            World world = NoticeWorld(TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session hunter = Fighter(world, "hero_01", 15, 0);
            monster.Damage.Add(hunter.Player!.Id, 10);
            Take(hunter);

            var sent = new List<int>();
            for (int i = 0; i <= 30; i++)
            {
                world.Place(hunter.Player!, hunter.Player!.X, hunter.Player!.Z + 4);
                if (StepAndTake(world, hunter, monster.Id) is EntityMove move)
                {
                    Assert.Equal(monster.Next, (move.NextX, move.NextZ));
                    sent.Add(i);
                }
            }

            Assert.Equal(new[] { 0, 10, 20, 30 }, sent);
        }

        /// <summary>
        /// 벽을 돌아가는 몬스터는 꺾이는 점에 닿을 때마다(길에서 곧은 추적으로 바뀔 때도) 그 틱에 다음 점을 알리고, 그 알림은 10틱 간격에 걸리지 않는다.
        /// 몬스터는 6 m/s이고 첫 꺾이는 점(벽 끝)에서 2 m 떨어진 곳에서 출발해, 출발을 알린 뒤 10틱 안에 첫 점에 닿는다.
        /// </summary>
        [Fact]
        public void PathCornersAreSentWhenReached()
        {
            MonstersRow fast = TestData.Monster(2, aggressive: false);
            fast.Speed = 6;
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 2, -5, 2) }, TestData.Draw(64, (3, -6, 4, 7, '#')), null, null, new[] { TestData.Monster(1, aggressive: true), fast });
            World world = new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
            Monster monster = world.Monsters[0];
            Session hunter = Fighter(world, "hero_01", 6, 0);
            monster.Damage.Add(hunter.Player!.Id, 10);
            Take(hunter);

            int corners = 0;
            var sentTicks = new List<uint>();
            for (int i = 0; (i < 200) && (monster.State != MonsterState.Attack); i++)
            {
                int index = monster.PathIndex;
                bool onPath = monster.Path.Count > 0;
                EntityMove? move = StepAndTake(world, hunter, monster.Id);
                if (move != null)
                {
                    sentTicks.Add(world.Tick - 1);
                }

                bool advanced = (monster.Path.Count > 0) && (monster.PathIndex > index) && (monster.PathIndex < monster.Path.Count);
                bool leftPath = onPath && (monster.Path.Count == 0) && monster.Walked;
                if (advanced || leftPath)
                {
                    corners++;
                    Assert.NotNull(move);
                    Assert.Equal(monster.Next, (move!.NextX, move.NextZ));
                }
            }

            Assert.Equal(MonsterState.Attack, monster.State);
            Assert.True(corners >= 1, "the monster never turned a corner");
            Assert.Contains(sentTicks.Zip(sentTicks.Skip(1)), pair => pair.Second - pair.First < 10);
        }

        /// <summary>
        /// 쫓던 대상을 잃은 몬스터는 선 틱에 멈춤을 알린다(배회를 쉬는 중이라 섬).
        /// </summary>
        [Fact]
        public void LosingTheTargetSendsTheStop()
        {
            World world = NoticeWorld(TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session watcher = Fighter(world, "hero_01", -5, 5);
            Session hunter = Fighter(world, "hero_02", 15, 0);
            monster.Damage.Add(hunter.Player!.Id, 10);
            Take(watcher);
            StepFor(world, 12);
            Assert.Equal(MonsterState.Chase, monster.State);
            Take(watcher);

            world.Disconnect(hunter);
            EntityMove move = StepAndTake(world, watcher, monster.Id)!;
            Assert.Equal((MonsterState.Idle, 0u, monster.X, monster.Z), (monster.State, move.Speed, move.X, move.Z));
        }

        /// <summary>
        /// 추적 한계를 넘어 복귀하는 몬스터는 그 틱에 놓인 점을 알린다(쫓는 대상이 움직여 바뀐 점이 아니라 간격에 걸리지 않음).
        /// </summary>
        [Fact]
        public void ReturningSendsTheHomeAtOnce()
        {
            World world = NoticeWorld(TestData.Spawn(1, 0, 0, 2));
            Monster monster = world.Monsters[0];
            Session hunter = Fighter(world, "hero_01", 30, 0);
            monster.Damage.Add(hunter.Player!.Id, 10);
            Take(hunter);

            EntityMove? move = null;
            for (int i = 0; (i < 200) && (monster.State != MonsterState.Return); i++)
            {
                move = StepAndTake(world, hunter, monster.Id);
            }

            Assert.Equal(MonsterState.Return, monster.State);
            Assert.Equal((96u, Center(0), Center(0)), (move!.Speed, move.NextX, move.NextZ));
        }

        /// <summary>
        /// 주인을 따라가는 소환수(95)도 설 자리와 빠르기를 알리고, 선 틱에 멈춤을 알린다.
        /// </summary>
        [Fact]
        public void SummonsSendTheSameNotices()
        {
            World world = SummonWorld();
            Session mage = Duelist(world, "hero_01", 30, 0, CharacterClass.Mage);
            Summon summon = Call(world, mage);
            StepFor(world, 20);
            Take(mage);

            world.Place(mage.Player!, Center(36), Center(0));
            EntityMove start = StepAndTake(world, mage, summon.Id)!;
            Assert.Equal((uint)Math.Round(summon.Template.Speed * Units.PerMeter), start.Speed);
            double fromOwner = Math.Sqrt(Math.Pow(start.NextX - mage.Player!.X, 2) + Math.Pow(start.NextZ - mage.Player!.Z, 2));
            Assert.InRange(fromOwner, (1.75 * Units.PerMeter) - 1, (1.75 * Units.PerMeter) + 1);

            EntityMove? stop = null;
            for (int i = 0; (i < 40) && (stop == null); i++)
            {
                stop = StepAndTake(world, mage, summon.Id);
            }

            Assert.Equal((0u, summon.X, summon.Z), (stop!.Speed, stop.X, stop.Z));
        }

        /// <summary>
        /// 경비병(44)도 쫓기 시작할 때 설 자리와 빠르기(5 m/s)를 알린다.
        /// </summary>
        [Fact]
        public void GuardsSendTheSameNotices()
        {
            World world = GuardWorld();
            Guard guard = world.Guards.Single();
            Session runner = Duelist(world, "hero_01", 2, 6);
            runner.Player!.Karma = -1;
            Take(runner);

            EntityMove? start = null;
            for (int i = 0; (i < 10) && (start == null); i++)
            {
                start = StepAndTake(world, runner, guard.Id);
            }

            Assert.Equal(MonsterState.Chase, guard.State);
            Assert.Equal((160u, guard.Next), (start!.Speed, (start.NextX, start.NextZ)));
        }

        /// <summary>
        /// 시험 몬스터들과 256 m 필드. 이동 알림의 기준은 실제 값이다.
        /// </summary>
        private static World NoticeWorld(params SpawnsRow[] spawns)
        {
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMonsters(spawns, TestData.Draw(256)));
        }

        /// <summary>
        /// 걷는 플레이어의 한 틱: x로 dx만큼 옮긴 Move를 보내고 틱을 돌린 뒤 보는 쪽이 받은 그 플레이어의 EntityMove를 낸다(없으면 null).
        /// </summary>
        private static EntityMove? StepWalk(World world, Session walker, Session observer, int dx, uint yaw, bool moving = true)
        {
            Player player = walker.Player!;
            world.Receive(walker, new Packet { Move = new Move { X = player.X + dx, Z = player.Z, Yaw = yaw, Ack = player.Ack, Moving = moving } });
            return StepAndTake(world, observer, player.Id);
        }

        private static EntityMove? StepAndTake(World world, Session observer, uint id)
        {
            world.Step();
            return MoveOf(observer, id);
        }

        /// <summary>
        /// 쌓인 패킷을 비우고 그 가운데 개체 id의 EntityMove를 낸다(없으면 null).
        /// </summary>
        private static EntityMove? MoveOf(Session observer, uint id)
        {
            return Take(observer).Where(packet => packet.EntityMoves != null).SelectMany(packet => packet.EntityMoves.Entities).SingleOrDefault(move => move.Id == id);
        }
    }
}
