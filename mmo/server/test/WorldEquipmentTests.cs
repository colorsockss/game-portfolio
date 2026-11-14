using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 장비(34). 시험 장비는 TestData.Items의 1001–1004다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 장비가 아닌 아이템, 레벨이 모자란 장비, 다른 직업의 무기는 입지 못하고, 공용 방어구는 두 직업이 모두 입는다.
        /// </summary>
        [Fact]
        public void EquippingChecksKindLevelAndClass()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session knight = Fighter(world, "hero_01", 1, 0);
            Session mage = Fighter(world, "hero_02", 3, 0, CharacterClass.Mage);
            foreach (uint item in new uint[] { 3001, 1004, 1002, 1003 })
            {
                world.Inventory.Add(knight.Player!, item, 1, GainReason.Unspecified);
            }

            world.Inventory.Add(mage.Player!, 1003, 1, GainReason.Unspecified);
            Take(knight);
            Take(mage);
            EquipItem(world, knight, SlotOf(knight.Player!, 3001), 1);
            EquipItem(world, knight, SlotOf(knight.Player!, 1004), 2);
            EquipItem(world, knight, SlotOf(knight.Player!, 1002), 3);
            EquipItem(world, knight, SlotOf(knight.Player!, 1003), 4);
            EquipItem(world, mage, SlotOf(mage.Player!, 1003), 5);
            Assert.Equal(
                new[] { Result(1, FailReason.UnusableItem), Result(2, FailReason.LevelTooLow), Result(3, FailReason.WrongClass), Result(4, FailReason.None) },
                Take(knight).Where(IsResult));
            Assert.Equal(new[] { Result(5, FailReason.None) }, Take(mage).Where(IsResult));
            Assert.Equal((1003u, 1003u), (knight.Player!.Bag.Equipment[1].ItemId, mage.Player!.Bag.Equipment[1].ItemId));
        }

        /// <summary>
        /// 바꿔 입으면 벗은 것이 같은 인벤토리 칸에 오고, 능력치가 바뀌어 본인이 SelfStats를 받는다. 인벤토리가 가득이면 벗지 못한다.
        /// </summary>
        [Fact]
        public void SwappingAndUnequippingMoveThroughTheBag()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 2, GainReason.Unspecified);
            int first = SlotOf(player, 1001);
            EquipItem(world, session, first, 1);
            Assert.Equal((1001u, 0u), (player.Bag.Equipment[0].ItemId, player.Bag.Slots[first].ItemId));
            Assert.Equal(TestData.KnightLevel1.Attack + 5, player.Stats.Attack);
            world.Step();
            Assert.Contains(TakeVitals(session), packet => packet.SelfStats?.Attack == TestData.KnightLevel1.Attack + 5);

            int second = SlotOf(player, 1001);
            EquipItem(world, session, second, 2);
            Assert.Equal((1001u, 1001u), (player.Bag.Equipment[0].ItemId, player.Bag.Slots[second].ItemId));

            world.Inventory.Add(player, 1003, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            Take(session);
            world.Receive(session, new Packet { Unequip = new Unequip { EquipSlot = 1, RequestId = 3 } });
            Assert.Equal(new[] { Result(3, FailReason.InventoryFull) }, Take(session).Where(IsResult));
            world.Inventory.Remove(player, second, 1);
            world.Receive(session, new Packet { Unequip = new Unequip { EquipSlot = 1, RequestId = 4 } });
            Assert.Equal(new[] { Result(4, FailReason.None) }, Take(session).Where(IsResult));
            Assert.Equal((0u, 1001u, TestData.KnightLevel1.Attack), (player.Bag.Equipment[0].ItemId, player.Bag.Slots[second].ItemId, player.Stats.Attack));
        }

        /// <summary>
        /// 다른 연결은 무기를 EntityEnter와 EntityState로 받고, 방어구를 바꿔도 EntityState가 가지 않는다. 들어온 캐릭터는 기본 무기를 입은 채다.
        /// </summary>
        [Fact]
        public void OthersSeeTheWeaponButNotArmor()
        {
            Classes classes = TestData.Classes;
            classes.Rows[0].StartWeapon = 1001;
            World world = CombatWorld(TestData.Draw(64), classes);
            Session hero = Fighter(world, "hero_01", 1, 0);
            Player player = hero.Player!;
            Assert.Equal(1001u, player.Bag.Equipment[0].ItemId);
            Assert.Equal(TestData.KnightLevel1.Attack + 5, player.Stats.Attack);

            Session watcher = Join(world, "hero_02");
            world.Step();
            Assert.Equal(1001u, watcher.Outbox.Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter)
                .SelectMany(packet => packet.EntitiesEnter.Entities).Single(entity => entity.Id == player.Id).WeaponItemId);
            Take(watcher);

            world.Inventory.Add(player, 1003, 1, GainReason.Unspecified);
            EquipItem(world, hero, SlotOf(player, 1003), 1);
            world.Step();
            Assert.DoesNotContain(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntityState);
            world.Receive(hero, new Packet { Unequip = new Unequip { EquipSlot = 1, RequestId = 2 } });
            world.Step();
            Assert.Equal(0u, Assert.Single(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntityState).EntityState.WeaponItemId);
        }

        private static void EquipItem(World world, Session session, int slot, uint requestId)
        {
            world.Receive(session, new Packet { Equip = new Equip { Slot = (uint)slot, RequestId = requestId } });
        }
    }
}
