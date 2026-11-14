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
    /// 드롭과 바닥 아이템(33). 시험 몬스터 2(비선공)는 드롭 묶음 1(재료 3001 둘과 골드 10)을 늘 떨어뜨린다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 몬스터가 죽으면 골드와 재료가 흩는 거리 안에 놓이고, 주인은 잡은 플레이어이며 주인만 줍는 시간은 10초다. 보는 쪽의 EntityEnter에 실린다.
        /// </summary>
        [Fact]
        public void MonstersDropGoldAndLootForTheKiller()
        {
            World world = LootWorld(TestData.Draw(64));
            Session killer = Fighter(world, "hero_01", 1, 0);
            Monster monster = world.Monsters[0];
            Kill(world, killer, monster);
            uint tick = world.Tick;
            List<GroundItem> items = world.GroundItems.ToList();
            Assert.Equal(new[] { (4001u, 10u), (3001u, 2u) }, items.Select(item => (item.ItemId, item.Count)));
            Assert.All(items, item => Assert.True(Math.Abs(item.X - monster.X) <= 1.5 * M + 1 && Math.Abs(item.Z - monster.Z) <= 1.5 * M + 1));
            Assert.All(items, item => Assert.Equal(killer.Player!.Id, item.OwnerPlayerId));
            Assert.All(items, item => Assert.InRange(item.OwnerOnlyEndTick, tick + 190, tick + 200));

            world.Step();
            EntityEnter enter = Take(killer).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter)
                .SelectMany(packet => packet.EntitiesEnter.Entities).First(entity => entity.Kind == EntityKind.GroundItem);
            Assert.Equal((killer.Player!.Id, false), (enter.OwnerPlayerId, enter.DroppedByPlayer));
        }

        /// <summary>
        /// 주인만 줍는 시간 안에는 남이 줍지 못하고 지나면 줍는다. 주운 것은 새로 얻은 것에 까닭 줍기로 실리고, 골드는 수로 더해진다. 같은 틱의 두 줍기는
        /// 먼저 온 것만 되고 뒤의 것은 "이미 없음"이다. 3 m 밖은 "사거리 밖"이다.
        /// </summary>
        [Fact]
        public void PickingUpFollowsOwnerAndOrder()
        {
            World world = LootWorld(TestData.Draw(64));
            Session killer = Fighter(world, "hero_01", 1, 0);
            Session other = Fighter(world, "hero_02", -1, 0);
            Kill(world, killer, world.Monsters[0]);
            GroundItem gold = world.GroundItems.Single(item => item.ItemId == 4001);
            GroundItem loot = world.GroundItems.Single(item => item.ItemId == 3001);
            Take(other);
            PickUp(world, other, gold.Id, 1);
            Assert.Equal(new[] { Result(1, FailReason.NotYours) }, Take(other).Where(IsResult));

            Take(killer);
            PickUp(world, killer, gold.Id, 2);
            PickUp(world, other, gold.Id, 3);
            Assert.Equal(new[] { Result(2, FailReason.None) }, Take(killer).Where(IsResult));
            Assert.Equal(new[] { Result(3, FailReason.AlreadyGone) }, Take(other).Where(IsResult));
            Assert.Equal(10ul, killer.Player!.Bag.Gold);

            StepFor(world, 200);
            Take(other);
            world.Place(other.Player!, loot.X + (5 * M), loot.Z);
            PickUp(world, other, loot.Id, 4);
            world.Place(other.Player!, loot.X + M, loot.Z);
            PickUp(world, other, loot.Id, 5);
            Assert.Equal(new[] { Result(4, FailReason.OutOfRange), Result(5, FailReason.None) }, Take(other).Where(IsResult));
            Assert.Equal(2u, other.Player!.Bag.CountOf(3001));
            world.Step();
            Gain gain = InventoryChanges(other).SelectMany(changed => changed.Gains).Single();
            Assert.Equal(new Gain { Reason = GainReason.PickUp, Item = new ItemAmount { ItemId = 3001, Count = 2 } }, gain);
        }

        /// <summary>
        /// 인벤토리가 가득이면 줍지 못하고 바닥 개체가 남지만 골드는 줍는다. 벽 너머는 거리 안이어도 "막힘"이다.
        /// </summary>
        [Fact]
        public void FullBagsAndWallsStopPickingUp()
        {
            World world = LootWorld(TestData.Draw(64, (2, -10, 3, 10, '#')));
            Session killer = Fighter(world, "hero_01", 1, 0);
            Kill(world, killer, world.Monsters[0]);
            Player player = killer.Player!;
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            GroundItem loot = world.GroundItems.Single(item => item.ItemId == 3001);
            GroundItem gold = world.GroundItems.Single(item => item.ItemId == 4001);
            Take(killer);
            PickUp(world, killer, loot.Id, 1);
            PickUp(world, killer, gold.Id, 2);
            Assert.Equal(new[] { Result(1, FailReason.InventoryFull), Result(2, FailReason.None) }, Take(killer).Where(IsResult));
            Assert.Contains(loot, world.GroundItems);

            world.Place(player, Center(3) + (M / 2), loot.Z);
            PickUp(world, killer, loot.Id, 3);
            Assert.Equal(new[] { Result(3, FailReason.Blocked) }, Take(killer).Where(IsResult));
        }

        /// <summary>
        /// 벽 옆에서 죽은 몬스터의 드롭은 막힌 칸이나 벽 너머에 놓이지 않는다.
        /// </summary>
        [Fact]
        public void DropsBesideWallsStayReachable()
        {
            string[] rows = TestData.Draw(64, (1, -10, 2, 10, '#'));
            World world = LootWorld(rows);
            var field = new FieldMap(64, TestData.Map(rows).Zones, TestData.Map(rows).Grid);
            Session killer = Fighter(world, "hero_01", -1, 0);
            for (int round = 0; round < 10; round++)
            {
                Monster monster = world.Monsters[0];
                StepUntil(world, () => !monster.Dead, 40 * 20);
                world.Place(monster, Center(0), Center(0));
                Kill(world, killer, monster);
            }

            Assert.All(world.GroundItems, item => Assert.True(field.CanWalk(item.X, item.Z, Walker.Player) && field.HasLine(Center(0), Center(0), item.X, item.Z)));
        }

        /// <summary>
        /// 바닥 아이템은 60초 뒤에 사라지고, 사라진 번호는 10초 뒤에 다시 쓰인다.
        /// </summary>
        [Fact]
        public void GroundItemsExpireAndTheirIdsComeBack()
        {
            World world = LootWorld(TestData.Draw(64));
            Session killer = Fighter(world, "hero_01", 1, 0);
            Kill(world, killer, world.Monsters[0]);
            uint[] ids = world.GroundItems.Select(item => item.Id).ToArray();
            StepFor(world, 60 * 20);
            Assert.Empty(world.GroundItems);

            StepFor(world, 10 * 20);
            Monster monster = world.Monsters[0];
            StepUntil(world, () => !monster.Dead, 40 * 20);
            Kill(world, killer, monster);
            Assert.Equal(ids, world.GroundItems.Select(item => item.Id).OrderBy(id => Array.IndexOf(ids, id)));
        }

        /// <summary>
        /// 떨어뜨린 것은 자기 자리에 주인 없이 놓여 바로 누구나 줍고, 겹친 아이템의 일부만 떨어뜨릴 수 있으며 EntityEnter에 그 표시가 실린다.
        /// 가진 수보다 많거나 0개는 "아이템 없음"이다.
        /// </summary>
        [Fact]
        public void DroppedItemsLieAtTheDroppersFeet()
        {
            World world = LootWorld(TestData.Draw(64));
            Session dropper = Fighter(world, "hero_01", 5, 5);
            Session other = Fighter(world, "hero_02", 6, 5);
            Player player = dropper.Player!;
            int slot = SlotOf(player, 2001);
            Drop(world, dropper, slot, 4, 1);
            Drop(world, dropper, slot, 0, 2);
            Drop(world, dropper, slot, 2, 3);
            Assert.Equal(new[] { Result(1, FailReason.NoItem), Result(2, FailReason.NoItem), Result(3, FailReason.None) }, Take(dropper).Where(IsResult));
            GroundItem dropped = world.GroundItems.Single();
            Assert.Equal((player.X, player.Z, 2u, 0u, true), (dropped.X, dropped.Z, dropped.Count, dropped.OwnerPlayerId, dropped.DroppedByPlayer));
            Assert.Equal(1u, player.Bag.CountOf(2001));

            world.Step();
            Assert.True(Take(other).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter).SelectMany(packet => packet.EntitiesEnter.Entities)
                .Single(entity => entity.Id == dropped.Id).DroppedByPlayer);
            PickUp(world, other, dropped.Id, 9);
            Assert.Equal(new[] { Result(9, FailReason.None) }, Take(other).Where(IsResult));
            Assert.Equal(5u, other.Player!.Bag.CountOf(2001));
        }

        private static World LootWorld(string[] rows, CharacterStore? store = null)
        {
            MonstersRow dropper = TestData.Monster(2, aggressive: false);
            dropper.DropGroup = 1;
            return new World(10, spawnHalfExtent: 0, new Random(1), store ?? new CharacterStore(":memory:"),
                TestData.WithMonsters(new[] { TestData.Spawn(1, 0, 0, 2, respawnMs: 1000) }, rows, null, null, new[] { TestData.Monster(1, aggressive: true), dropper }));
        }

        private static void Kill(World world, Session session, Monster monster)
        {
            monster.Hp = 1;
            Attack(world, session, monster.Id);
            StepUntil(world, () => monster.Dead, 40);
            Assert.True(monster.Dead);
            world.Receive(session, new Packet { AttackStop = new AttackStop() });
        }

        private static void PickUp(World world, Session session, uint entityId, uint requestId)
        {
            world.Receive(session, new Packet { PickUp = new PickUp { EntityId = entityId, RequestId = requestId } });
        }

        private static void Drop(World world, Session session, int slot, uint count, uint requestId)
        {
            world.Receive(session, new Packet { DropItem = new DropItem { Slot = (uint)slot, Count = count, RequestId = requestId } });
        }
    }
}
