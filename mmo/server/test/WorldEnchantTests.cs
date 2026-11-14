using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 강화(35). 시험 강화 단계는 TestData.Enchants(+4만 늘 실패), 주문서는 2006이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 입은 장비를 강화하면 수치가 오르고 능력치가 Items의 값 × 그 단계의 비율이 된다. 같은 틱에 RequestResult와 EnchantResult가 가고 주문서가 하나 준다.
        /// +9에서는 실패하고 주문서가 그대로이며, 주문서가 아니거나 장비가 아니면 실패한다.
        /// </summary>
        [Fact]
        public void EnchantingRaisesTheLevelAndScalesStats()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            world.Inventory.Add(player, 2006, 5, GainReason.Unspecified);
            EquipItem(world, session, SlotOf(player, 1001), 1);
            int scroll = SlotOf(player, 2006);
            Take(session);
            for (uint request = 2; request <= 4; request++)
            {
                EnchantItem(world, session, ItemPlace.Equipment, 0, scroll, request);
            }

            Assert.Equal(3u, player.Bag.Equipment[0].Enchant);
            Assert.Equal(TestData.KnightLevel1.Attack + (uint)Math.Floor(5 * 1.3), player.Stats.Attack);
            Assert.Equal(2u, player.Bag.CountOf(2006));
            var packets = session.Outbox.Where(packet => packet.BodyCase is Packet.BodyOneofCase.RequestResult or Packet.BodyOneofCase.EnchantResult).ToList();
            Assert.Equal(new[] { 1u, 2u, 3u }, packets.Where(packet => packet.EnchantResult != null).Select(packet => packet.EnchantResult.Enchant));
            Assert.Equal(6, packets.Count);
            Take(session);

            player.Bag.Equipment[0].Enchant = 9;
            EnchantItem(world, session, ItemPlace.Equipment, 0, scroll, 5);
            EnchantItem(world, session, ItemPlace.Inventory, SlotOf(player, 2001), scroll, 6);
            EnchantItem(world, session, ItemPlace.Equipment, 0, SlotOf(player, 2001), 7);
            Assert.Equal(new[] { Result(5, FailReason.MaxEnchant), Result(6, FailReason.UnusableItem), Result(7, FailReason.UnusableItem) }, Take(session).Where(IsResult));
            Assert.Equal(2u, player.Bag.CountOf(2006));
        }

        /// <summary>
        /// 실패하면 장비가 사라지고 주문서가 하나 준다. 입은 무기가 깨지면 다른 연결이 EntityState로 무기 없음을 받는다.
        /// </summary>
        [Fact]
        public void AFailedEnchantDestroysTheWeapon()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 3, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            world.Inventory.Add(player, 2006, 2, GainReason.Unspecified);
            EquipItem(world, session, SlotOf(player, 1001), 1);
            world.Step();
            Take(watcher);
            player.Bag.Equipment[0].Enchant = 3;
            Take(session);
            EnchantItem(world, session, ItemPlace.Equipment, 0, SlotOf(player, 2006), 2);
            Assert.Equal(new EnchantResult { Success = false, Enchant = 0 }, session.Outbox.Single(packet => packet.EnchantResult != null).EnchantResult);
            Assert.Equal((0u, 1u, TestData.KnightLevel1.Attack), (player.Bag.Equipment[0].ItemId, player.Bag.CountOf(2006), player.Stats.Attack));
            world.Step();
            Assert.Equal(0u, Assert.Single(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntityState).EntityState.WeaponItemId);
        }

        /// <summary>
        /// 강화한 장비를 떨어뜨렸다 주워도 수치가 남는다(33에서 미룬 것).
        /// </summary>
        [Fact]
        public void EnchantSurvivesDroppingAndPickingUp()
        {
            World world = LootWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 5, 5);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            world.Inventory.Add(player, 2006, 2, GainReason.Unspecified);
            EnchantItem(world, session, ItemPlace.Inventory, SlotOf(player, 1001), SlotOf(player, 2006), 1);
            EnchantItem(world, session, ItemPlace.Inventory, SlotOf(player, 1001), SlotOf(player, 2006), 2);
            Drop(world, session, SlotOf(player, 1001), 1, 3);
            GroundItem dropped = world.GroundItems.Single();
            Assert.Equal(2u, dropped.Enchant);
            PickUp(world, session, dropped.Id, 4);
            Assert.Equal(2u, player.Bag.Slots[SlotOf(player, 1001)].Enchant);
        }

        /// <summary>
        /// 실제 Enchants의 확률로 단계마다 10만 번 굴린 성공률이 그 확률과 맞는다(±1%).
        /// </summary>
        [Fact]
        public void SuccessRatesFollowTheTable()
        {
            GameData real = GameData.Load(GameData.DefaultFolder);
            GameData data = new GameData(TestData.Hash, TestData.Constants(64), new Zones { Rows = { TestData.Town(0, 0) } }, TestData.EmptyGrid(64), TestData.Classes, TestData.Levels,
                new Monsters(), new Spawns(), TestData.Skills, TestData.Effects, TestData.Items, TestData.DropGroups, new Enchants { Rows = { Enumerable.Range(1, 9).Select(level => real.Enchant((uint)level)!) } });
            World world = new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), data);
            Session session = Join(world, "hero_01");
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            for (uint level = 1; level <= 9; level++)
            {
                int wins = 0;
                const int Trials = 100_000;
                for (int trial = 0; trial < Trials; trial++)
                {
                    ItemSlot target = player.Bag.Slots[SlotOf(player, 1001) is var index and >= 0 ? index : 0];
                    (target.ItemId, target.Count, target.Enchant) = (1001u, 1u, level - 1);
                    world.Inventory.Add(player, 2006, 1, GainReason.Unspecified);
                    world.Inventory.Enchant(player, new Enchant { Place = ItemPlace.Inventory, Slot = target.Index, ScrollSlot = (uint)SlotOf(player, 2006) });
                    wins += target.Enchant == level ? 1 : 0;
                    session.Outbox.Clear();
                }

                Assert.InRange((double)wins / Trials, real.Enchant(level)!.Chance - 0.01, real.Enchant(level)!.Chance + 0.01);
            }
        }

        private static void EnchantItem(World world, Session session, ItemPlace place, int slot, int scrollSlot, uint requestId)
        {
            world.Receive(session, new Packet { Enchant = new Enchant { Place = place, Slot = (uint)slot, ScrollSlot = (uint)scrollSlot, RequestId = requestId } });
        }
    }
}
