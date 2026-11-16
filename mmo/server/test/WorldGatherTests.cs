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
    /// 채집(47). 시험용 채집물은 TestData.GatherNodes이고(1은 재료 3001을 하나씩, 3초, 횟수 2, 레벨 1. 2는 레벨 5), 채집 시간은 60틱이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 채집물은 개체로 보이고(종류 채집물, 템플릿 번호) 시작할 때 필요 레벨, 3 m, 벽, 인벤토리의 자리, 진행 중인 일을 본다. 통과하면 본인과 받은 연결이
        /// Progress(종류 채집, 번호는 GatherNodes의 줄)를 받고, 나중에 들어온 연결은 EntityEnter의 진행 중인 일로 받는다.
        /// </summary>
        [Fact]
        public void GatheringStartsOnlyWhenNearOpenLevelledAndWithRoom()
        {
            World world = GatherWorld(TestData.Draw(64, (1, 4, 2, 7, '#')), TestData.GatherSpawn(1, 2, 0, 1), TestData.GatherSpawn(2, -4, 0, 2), TestData.GatherSpawn(3, 2, 5, 1));
            GatherNode near = Node(world, 1);
            GatherNode levelled = Node(world, 2);
            GatherNode walled = Node(world, 3);
            Session watcher = Join(world, "watch_01");
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            Assert.Contains(world.GatherNodes, node => node.Id == near.Id);

            world.Place(player, Center(-3), Center(0));
            Gather(world, session, levelled.Id);
            world.Place(player, Center(7), Center(0));
            Gather(world, session, near.Id);
            world.Place(player, Center(0), Center(5));
            Gather(world, session, walled.Id);
            world.Place(player, Center(1), Center(0));
            Gather(world, session, 9999);
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            Gather(world, session, near.Id);
            Assert.Equal(
                new[] { FailReason.LevelTooLow, FailReason.OutOfRange, FailReason.Blocked, FailReason.AlreadyGone, FailReason.InventoryFull },
                Take(session).Where(packet => packet.ActionFailed?.Request == RequestKind.Gather).Select(packet => packet.ActionFailed.Reason));

            world.Inventory.Remove(player, SlotOf(player, 1001), 1);
            Gather(world, session, near.Id);
            Gather(world, session, near.Id);
            Assert.Equal(new ProgressWork(ProgressKind.Gather, 1, near.Id, world.Tick + 60, player.X, player.Z, player.Progress!.Generation), player.Progress);
            Assert.Equal(FailReason.Busy, Assert.Single(Take(session), packet => packet.ActionFailed != null).ActionFailed.Reason);
            world.Step();
            var progress = new Packet { Progress = new Progress { Id = player.Id, State = new ProgressState { Kind = ProgressKind.Gather, Id = 1, EndTick = player.Progress!.EndTick } } };
            Assert.Contains(progress, Take(session));
            Assert.Contains(progress, Take(watcher));

            Session late = Join(world, "late_01");
            world.Step();
            List<EntityEnter> seen = Take(late).Where(packet => packet.EntitiesEnter != null).SelectMany(packet => packet.EntitiesEnter.Entities).ToList();
            Assert.Equal(ProgressKind.Gather, seen.Single(entity => entity.Id == player.Id).Progress.Kind);
            Assert.Contains(seen, entity => entity.Id == near.Id && entity.Kind == EntityKind.GatherNode && entity.TemplateId == 1);
        }

        /// <summary>
        /// 채집 시간(60틱)이 지난 틱에 재료가 들어오고(새로 얻은 것, 까닭 채집) 횟수가 준다. 자리를 옮기면 취소되고(방향만 바꾸면 이어짐) 횟수는 그대로이며,
        /// 기절과 피해로도 취소된다. 채집하는 동안 다른 요청(아이템, 스킬, 공격)은 "진행 중"이다.
        /// </summary>
        [Fact]
        public void GatheringGivesTheMaterialAfterItsTimeUnlessCancelled()
        {
            World world = GatherWorld(TestData.Draw(64), TestData.GatherSpawn(1, 2, 0, 1), TestData.Spawn(2, -2, 0, 2));
            GatherNode node = Node(world, 1);
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;

            Gather(world, session, node.Id);
            uint end = player.Progress!.EndTick;
            Use(world, session, SlotOf(player, 2001), 1);
            UseSkill(world, session, 101, world.Monsters[0].Id);
            Attack(world, session, world.Monsters[0].Id);
            List<Packet> refused = Take(session);
            Assert.Contains(Result(1, FailReason.Busy), refused);
            Assert.Equal(new[] { RequestKind.Skill, RequestKind.Attack }, refused.Where(packet => packet.ActionFailed?.Reason == FailReason.Busy).Select(packet => packet.ActionFailed.Request));

            Move(world, session, player.X, player.Z, player.Ack, 64);
            StepUntil(world, () => player.Progress == null, 70);
            // Step은 그 틱을 돌린 뒤 틱 번호를 올린다: 끝나는 틱에 재료가 들어왔다.
            Assert.Equal(end + 1, world.Tick);
            Assert.Equal(1u, player.Bag.CountOf(3001));
            Assert.Equal(1u, node.UsesLeft);
            Assert.Contains(new Gain { Reason = GainReason.Gather, Item = new ItemAmount { ItemId = 3001, Count = 1 } }, InventoryChanges(session).SelectMany(changed => changed.Gains));

            Gather(world, session, node.Id);
            Move(world, session, player.X + 10, player.Z, player.Ack);
            Assert.Null(player.Progress);
            world.Step();
            Gather(world, session, node.Id);
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            world.Step();
            Assert.Null(player.Progress);
            StepFor(world, 70);
            Gather(world, session, node.Id);
            world.Monsters[0].Damage.Add(player.Id, 1);
            StepUntil(world, () => player.Progress == null, 50);
            Assert.Null(player.Progress);
            Assert.Equal((1u, 1u), (player.Bag.CountOf(3001), node.UsesLeft));
            Assert.Equal(3, Take(session).Count(packet => packet.ProgressCancelled is { Reason: FailReason.Cancelled }));
        }

        /// <summary>
        /// 채집하는 동안 인벤토리가 가득 차면 끝나는 틱에 ProgressCancelled("인벤토리 가득")가 가고 횟수가 줄지 않는다. 채집물이 그 사이에 없어지면 "이미 없음"이다.
        /// </summary>
        [Fact]
        public void TheEndTickChecksAgainAndKeepsTheUsesOnFailure()
        {
            World world = GatherWorld(TestData.Draw(64), TestData.GatherSpawn(1, 2, 0, 1));
            GatherNode node = Node(world, 1);
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            Gather(world, session, node.Id);
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            StepUntil(world, () => player.Progress == null, 70);
            Assert.Contains(Take(session), packet => packet.ProgressCancelled is { Reason: FailReason.InventoryFull });
            Assert.Equal((0u, 2u), (player.Bag.CountOf(3001), node.UsesLeft));
        }

        /// <summary>
        /// 횟수를 다 쓴 채집물은 EntitiesLeave로 빠지고, 같은 틱에 끝나는 다른 플레이어는 재료 없이 "취소됨"을 받는다. Spawns의 시간 뒤에 같은 번호로 다시 나온다.
        /// </summary>
        [Fact]
        public void ADepletedNodeLeavesCancelsOthersAndComesBack()
        {
            World world = GatherWorld(TestData.Draw(64), TestData.GatherSpawn(1, 2, 0, 1, respawnMs: 1000));
            GatherNode node = Node(world, 1);
            Session first = Fighter(world, "hero_01", 1, 0);
            Session second = Fighter(world, "hero_02", 3, 0);
            Gather(world, first, node.Id);
            StepUntil(world, () => first.Player!.Progress == null, 70);
            Assert.Equal(1u, node.UsesLeft);

            Gather(world, first, node.Id);
            Gather(world, second, node.Id);
            Assert.Equal(first.Player!.Progress!.EndTick, second.Player!.Progress!.EndTick);
            Take(first);
            Take(second);
            StepUntil(world, () => first.Player!.Progress == null, 70);
            Assert.Null(second.Player!.Progress);
            Assert.Equal((2u, 0u), (first.Player!.Bag.CountOf(3001), second.Player!.Bag.CountOf(3001)));
            Assert.Contains(Take(second), packet => packet.ProgressCancelled is { Reason: FailReason.Cancelled });
            Assert.DoesNotContain(world.GatherNodes, other => other.Id == node.Id);
            world.Step();
            Assert.Contains(Take(first), packet => packet.EntitiesLeave?.Ids.Contains(node.Id) == true);

            StepUntil(world, () => world.GatherNodes.Any(other => other.Id == node.Id), 25);
            GatherNode again = Node(world, 1);
            Assert.Equal((node.Id, node.X, node.Z, 2u), (again.Id, again.X, again.Z, again.UsesLeft));
            world.Step();
            Assert.Contains(Take(first), packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == node.Id && entity.Kind == EntityKind.GatherNode && entity.TemplateId == 1) == true);
        }

        /// <summary>
        /// 채집물의 놓인 점은 모두 흩는 반경 안이고 무리의 자리에서 플레이어 쪽의 걷는 선이 트인 점이다.
        /// </summary>
        [Fact]
        public void GatherNodesScatterWhereAPlayerCanWalkStraight()
        {
            string[] map = TestData.Draw(64, (3, -6, 4, 6, '#'));
            World world = GatherWorld(map, TestData.GatherSpawn(1, 2, 0, 1, count: 12, scatter: 4));
            GameData data = TestData.WithMonsters(new SpawnsRow[0], map);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            int center = Center(2);
            Assert.Equal(12, world.GatherPoints.Count());
            Assert.All(world.GatherPoints, point =>
            {
                Assert.True(Math.Sqrt(Math.Pow(point.X - center, 2) + Math.Pow(point.Z - Center(0), 2)) <= 4 * M);
                Assert.True(field.CanWalkLine(center, Center(0), point.X, point.Z, Walker.Player));
            });
        }

        private static World GatherWorld(string[] rows, params SpawnsRow[] spawns)
        {
            GameData data = TestData.WithMonsters(spawns, rows, null, null, null, gatherNodes: TestData.GatherNodes);
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
        }

        private static GatherNode Node(World world, uint spawnId)
        {
            return world.GatherNodes.First(node => node.Point.Spawn.Id == spawnId);
        }

        private static void Gather(World world, Session session, uint entityId)
        {
            world.Receive(session, new Packet { Gather = new Gather { EntityId = entityId } });
        }
    }
}
