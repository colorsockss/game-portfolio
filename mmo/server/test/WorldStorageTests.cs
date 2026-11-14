using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 창고(75). 창고 NPC는 칸 (0, 0)에 서고, 시험 창고는 3칸이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 창고의 내용은 StorageOpen 전에는 가지 않고, 곁에서 열면 Storage로 전체가 간다. 3 m 밖은 ActionFailed(사거리 밖, 창고), 벽 너머는 "막힘"이다.
        /// </summary>
        [Fact]
        public void TheStorageOpensOnlyBesideTheKeeper()
        {
            World world = StorageWorld(TestData.Draw(64, (1, -10, 2, 10, '#')));
            Session session = Fighter(world, "hero_01", 0, 1);
            Assert.DoesNotContain(session.Outbox, packet => packet.BodyCase == Packet.BodyOneofCase.Storage);
            world.Receive(session, new Packet { StorageOpen = new StorageOpen() });
            Assert.Empty(Take(session).Single(packet => packet.BodyCase == Packet.BodyOneofCase.Storage).Storage.Slots);

            world.Place(session.Player!, Center(5), Center(0));
            world.Receive(session, new Packet { StorageOpen = new StorageOpen() });
            world.Place(session.Player!, Center(2), Center(0));
            Deposit(world, session, SlotOf(session.Player!, 2001), 1, 1);
            System.Collections.Generic.List<Packet> answers = Take(session);
            Assert.Equal(new Packet { ActionFailed = new ActionFailed { Reason = FailReason.OutOfRange, Request = RequestKind.Storage } }, answers.First());
            Assert.Equal(new[] { Result(1, FailReason.Blocked) }, answers.Where(IsResult));
        }

        /// <summary>
        /// 맡기고 찾으면 두 곳이 한 요청에서 함께 바뀌고(겹친 것은 일부만, 강화 수치는 남음) InventoryChanged와 StorageChanged로 간다. 찾은 것은 새로 얻은 것에 들지 않고
        /// 퀵슬롯에도 오르지 않는다.
        /// </summary>
        [Fact]
        public void DepositingAndWithdrawingMoveBetweenBagAndStorage()
        {
            World world = StorageWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 2002, 2, GainReason.Unspecified);
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified, enchant: 3);
            Deposit(world, session, SlotOf(player, 2001), 2, 1);
            Deposit(world, session, SlotOf(player, 2002), 2, 2);
            Deposit(world, session, SlotOf(player, 1001), 1, 3);
            Assert.Equal(new[] { Result(1, FailReason.None), Result(2, FailReason.None), Result(3, FailReason.None) }, Take(session).Where(IsResult));
            Assert.Equal((1u, 0u, 0u), (player.Bag.CountOf(2001), player.Bag.CountOf(2002), player.Bag.CountOf(1001)));
            Assert.Equal((2001u, 2u), (player.Bag.Storage[0].ItemId, player.Bag.Storage[0].Count));
            world.Step();
            System.Collections.Generic.List<Packet> changes = session.Outbox.ToList();
            session.Outbox.Clear();
            Assert.Single(changes, packet => packet.BodyCase == Packet.BodyOneofCase.InventoryChanged);
            Assert.Equal(3, changes.Single(packet => packet.BodyCase == Packet.BodyOneofCase.StorageChanged).StorageChanged.Slots.Count);

            Withdraw(world, session, 1, 2, 4);
            Withdraw(world, session, 2, 1, 5);
            Assert.Equal(new[] { Result(4, FailReason.None), Result(5, FailReason.None) }, Take(session).Where(IsResult));
            Assert.Equal((2u, 0u), (player.Bag.CountOf(2002), player.Bag.Storage[1].ItemId));
            Assert.Equal(3u, player.Bag.Slots.Single(slot => slot.ItemId == 1001).Enchant);
            world.Step();
            var packets = TakeVitals(session);
            Assert.Empty(packets.Single(packet => packet.BodyCase == Packet.BodyOneofCase.InventoryChanged).InventoryChanged.Gains);
            Assert.DoesNotContain(packets, packet => packet.BodyCase == Packet.BodyOneofCase.Quickslots);
        }

        /// <summary>
        /// 가득 찬 창고에 맡기기는 "창고 가득", 가득 찬 인벤토리로 찾기는 "인벤토리 가득"이고 아무것도 옮겨지지 않는다.
        /// </summary>
        [Fact]
        public void FullSidesMoveNothing()
        {
            World world = StorageWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 1001, 4, GainReason.Unspecified);
            for (uint request = 1; request <= 4; request++)
            {
                Deposit(world, session, SlotOf(player, 1001), 1, request);
            }

            Assert.Equal(FailReason.StorageFull, Take(session).Where(IsResult).Last().RequestResult.Result);
            Assert.Equal(1u, player.Bag.CountOf(1001));
            world.Inventory.Add(player, 1003, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            Withdraw(world, session, 0, 1, 5);
            Assert.Equal(new[] { Result(5, FailReason.InventoryFull) }, Take(session).Where(IsResult));
            Assert.Equal(1001u, player.Bag.Storage[0].ItemId);
        }

        /// <summary>
        /// 저장한 뒤 다시 들어와도 창고의 아이템이 남는다.
        /// </summary>
        [Fact]
        public void TheStorageSurvivesARestart()
        {
            using var store = new CharacterStore(":memory:");
            World world = StorageWorld(TestData.Draw(64), store);
            Session session = Fighter(world, "hero_01", 1, 0);
            long id = session.Player!.CharacterId;
            Deposit(world, session, SlotOf(session.Player, 2003), 2, 1);
            world.Disconnect(session);
            world.CompleteSaves();

            World restarted = StorageWorld(TestData.Draw(64), store);
            Session again = LogIn(restarted, "hero_01");
            Enter(restarted, again, id);
            Assert.Equal((2003u, 2u, 0u), (again.Player!.Bag.Storage[0].ItemId, again.Player.Bag.Storage[0].Count, again.Player.Bag.CountOf(2003)));
        }

        private static World StorageWorld(string[] rows, CharacterStore? store = null)
        {
            var npcs = new Npcs { Rows = { new NpcsRow { Id = 1, NameKey = "npc.test", Role = NpcRole.Storage, X = 0, Z = 0 } } };
            return new World(10, spawnHalfExtent: 0, new System.Random(1), store ?? new CharacterStore(":memory:"),
                TestData.WithMonsters(new SpawnsRow[0], rows, null, null, null, null, npcs));
        }

        private static void Deposit(World world, Session session, int slot, uint count, uint requestId)
        {
            world.Receive(session, new Packet { StorageDeposit = new StorageDeposit { Slot = (uint)slot, Count = count, RequestId = requestId } });
        }

        private static void Withdraw(World world, Session session, uint slot, uint count, uint requestId)
        {
            world.Receive(session, new Packet { StorageWithdraw = new StorageWithdraw { Slot = slot, Count = count, RequestId = requestId } });
        }
    }
}
