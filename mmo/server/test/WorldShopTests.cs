using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// NPC와 상점(37). 상점 NPC는 칸 (0, 0)에 서고, 상점은 TestData.Shops(2001 20골드, 2002 30골드, 2005 50골드, 1003 100골드)다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 산 아이템은 새로 얻은 것에 까닭 구매로 실리고 골드와 수량이 같은 InventoryChanged로 함께 바뀐다. 산 물약은 빈 퀵슬롯에 오른다(36).
        /// 상점에 없는 아이템과 0개는 "아이템 없음", 골드가 모자라면 "골드 부족"이고 아무것도 바뀌지 않는다. NPC는 시야에 템플릿 번호와 함께 들어온다.
        /// </summary>
        [Fact]
        public void BuyingTakesGoldAndAddsPurchases()
        {
            World world = ShopWorld(TestData.Draw(64));
            Session session = Join(world, "hero_01");
            world.Step();
            Assert.Contains(Take(session).Where(packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesEnter).SelectMany(packet => packet.EntitiesEnter.Entities),
                entity => entity is { Kind: EntityKind.Npc, TemplateId: 1 });

            world.Place(session.Player!, Center(2), Center(0));
            Player player = session.Player!;
            world.Inventory.AddGold(player, 200, GainReason.Unspecified);
            world.Step();
            TakeVitals(session);
            BuyItem(world, session, 2002, 3, 1);
            BuyItem(world, session, 3001, 1, 2);
            BuyItem(world, session, 2001, 0, 3);
            BuyItem(world, session, 2005, 3, 4);
            Assert.Equal(
                new[] { Result(1, FailReason.None), Result(2, FailReason.NoItem), Result(3, FailReason.NoItem), Result(4, FailReason.NotEnoughGold) },
                Take(session).Where(IsResult));
            Assert.Equal((110ul, 3u, 0u), (player.Bag.Gold, player.Bag.CountOf(2002), player.Bag.CountOf(2005)));

            world.Step();
            var packets = TakeVitals(session);
            InventoryChanged changed = packets.Single(packet => packet.BodyCase == Packet.BodyOneofCase.InventoryChanged).InventoryChanged;
            Assert.Equal(110ul, changed.Gold);
            Assert.Equal(new Gain { Reason = GainReason.Buy, Item = new ItemAmount { ItemId = 2002, Count = 3 } }, changed.Gains.Single());
            Assert.Equal(new Quickslot { Kind = QuickslotKind.Item, Id = 2002 }, packets.Single(packet => packet.BodyCase == Packet.BodyOneofCase.Quickslots).Quickslots.Slots[3]);
        }

        /// <summary>
        /// 3 m 밖은 "사거리 밖", 거리 안이어도 벽 너머의 NPC는 "막힘"이다. 인벤토리가 가득이면 "인벤토리 가득"이고 골드가 그대로다.
        /// </summary>
        [Fact]
        public void BuyingNeedsTheMerchantAndRoom()
        {
            World world = ShopWorld(TestData.Draw(64, (1, -10, 2, 10, '#')));
            Session session = Fighter(world, "hero_01", 5, 0);
            Player player = session.Player!;
            world.Inventory.AddGold(player, 1000, GainReason.Unspecified);
            BuyItem(world, session, 2001, 1, 1);
            world.Place(player, Center(2), Center(0));
            BuyItem(world, session, 2001, 1, 2);
            world.Place(player, Center(0), Center(1));
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            BuyItem(world, session, 1003, 1, 3);
            Assert.Equal(new[] { Result(1, FailReason.OutOfRange), Result(2, FailReason.Blocked), Result(3, FailReason.InventoryFull) }, Take(session).Where(IsResult));
            Assert.Equal(1000ul, player.Bag.Gold);
        }

        /// <summary>
        /// 팔면 Items의 파는 값 × 수량만큼 골드가 늘고 새로 얻은 것에는 들지 않는다. 겹친 아이템의 일부만 팔 수 있고, 파는 값이 없는 아이템은 "팔 수 없음",
        /// 가진 수보다 많으면 "아이템 없음"이다.
        /// </summary>
        [Fact]
        public void SellingPaysTheItemsPrice()
        {
            World world = ShopWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            SellSlot(world, session, SlotOf(player, 2001), 2, 1);
            SellSlot(world, session, SlotOf(player, 2001), 5, 2);
            SellSlot(world, session, SlotOf(player, 1001), 1, 3);
            Assert.Equal(new[] { Result(1, FailReason.None), Result(2, FailReason.NoItem), Result(3, FailReason.Unsellable) }, Take(session).Where(IsResult));
            Assert.Equal((10ul, 1u, 1u), (player.Bag.Gold, player.Bag.CountOf(2001), player.Bag.CountOf(1001)));

            world.Step();
            InventoryChanged changed = InventoryChanges(session).Single();
            Assert.Equal(10ul, changed.Gold);
            Assert.Empty(changed.Gains);
        }

        private static World ShopWorld(string[] rows)
        {
            var npcs = new Npcs { Rows = { new NpcsRow { Id = 1, NameKey = "npc.test", Role = NpcRole.Shop, X = 0, Z = 0 } } };
            return new World(10, spawnHalfExtent: 0, new System.Random(1), new CharacterStore(":memory:"),
                TestData.WithMonsters(new SpawnsRow[0], rows, null, null, null, null, npcs));
        }

        private static void BuyItem(World world, Session session, uint itemId, uint count, uint requestId)
        {
            world.Receive(session, new Packet { Buy = new Buy { ItemId = itemId, Count = count, RequestId = requestId } });
        }

        private static void SellSlot(World world, Session session, int slot, uint count, uint requestId)
        {
            world.Receive(session, new Packet { Sell = new Sell { Slot = (uint)slot, Count = count, RequestId = requestId } });
        }
    }
}
