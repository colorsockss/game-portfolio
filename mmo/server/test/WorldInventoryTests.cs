using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 인벤토리와 아이템 사용(32). 시험 아이템은 TestData.Items이고 모든 직업이 체력 물약(2001) 3개와 마나 물약(2003) 2개로 시작한다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 들어오면 직업의 처음 상태로 채운 인벤토리 전체를 받는다.
        /// </summary>
        [Fact]
        public void EnteringFillsTheClassStartItems()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Join(world, "hero_01");
            Inventory inventory = session.Outbox.Single(packet => packet.BodyCase == Packet.BodyOneofCase.Inventory).Inventory;
            Assert.Equal(new[] { (2001u, 3u), (2003u, 2u) }, inventory.Slots.Select(slot => (slot.ItemId, slot.Count)));
            Assert.Equal(0ul, inventory.Gold);
        }

        /// <summary>
        /// 겹치는 아이템은 같은 칸에 쌓이고 겹치지 않는 아이템은 하나에 칸 하나를 쓴다. 빈 칸이 없어도 이미 가진 겹치는 아이템은 들어오고, 새 아이템은
        /// "인벤토리 가득"으로 아무것도 들어가지 않는다. 까닭 없이 넣은 변화는 새로 얻은 것의 목록이 빈다.
        /// </summary>
        [Fact]
        public void ItemsStackOrTakeOneSlotEach()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            Assert.Equal(FailReason.None, world.Inventory.Add(player, 3001, 5, GainReason.Unspecified));
            Assert.Equal(FailReason.None, world.Inventory.Add(player, 3001, 5, GainReason.Unspecified));
            Assert.Equal(FailReason.None, world.Inventory.Add(player, 1001, 2, GainReason.Unspecified));
            Assert.Equal(10u, player.Bag.Slots.Single(slot => slot.ItemId == 3001).Count);
            Assert.Equal(2, player.Bag.Slots.Count(slot => slot.ItemId == 1001));
            world.Step();
            InventoryChanged changed = InventoryChanges(session).Single();
            Assert.Equal(3, changed.Slots.Count);
            Assert.Empty(changed.Gains);

            int empty = player.Bag.Slots.Count(slot => slot.ItemId == 0);
            Assert.Equal(FailReason.InventoryFull, world.Inventory.Add(player, 1001, (uint)empty + 1, GainReason.Unspecified));
            Assert.Equal(empty, player.Bag.Slots.Count(slot => slot.ItemId == 0));
            Assert.Equal(FailReason.None, world.Inventory.Add(player, 1001, (uint)empty, GainReason.Unspecified));
            Assert.Equal(FailReason.None, world.Inventory.Add(player, 2001, 1, GainReason.Unspecified));
            Assert.Equal(4u, player.Bag.CountOf(2001));
            Assert.Equal(FailReason.InventoryFull, world.Inventory.Add(player, 2005, 1, GainReason.Unspecified));
        }

        /// <summary>
        /// 개발 명령으로 준 아이템과 골드는 InventoryChanged의 새로 얻은 것에 까닭 "개발 명령"으로 실린다. 가득 찬 인벤토리에서는 ActionFailed이고 들어가지 않는다.
        /// </summary>
        [Fact]
        public void DevGiftsAreGainsWithTheirReason()
        {
            World world = DevWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Dev(world, session, "item 3001 4");
            Dev(world, session, "gold 50");
            Dev(world, session, "item 9999");
            Assert.Equal(new[] { DevFailed(FailReason.InvalidCommand) }, Take(session));
            world.Step();
            InventoryChanged changed = InventoryChanges(session).Single();
            Assert.Equal(50ul, changed.Gold);
            Assert.Equal(
                new[] { new Gain { Reason = GainReason.DevCommand, Item = new ItemAmount { ItemId = 3001, Count = 4 } }, new Gain { Reason = GainReason.DevCommand, Gold = 50 } },
                changed.Gains);

            Player player = session.Player!;
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            world.Step();
            TakeVitals(session);
            Dev(world, session, "item 2005");
            Assert.Equal(new[] { DevFailed(FailReason.InventoryFull) }, Take(session));
            Assert.Equal(0u, player.Bag.CountOf(2005));
        }

        /// <summary>
        /// RequestResult는 보낸 요청 번호를 그대로 싣는다(번호가 건너뛰어도 끊지 않음). 재료는 쓸 수 없고, 빈 칸은 "아이템 없음"이며, 죽었거나 기절한 동안과
        /// 빈도 제한으로 버려진 요청에도 실패 답이 간다.
        /// </summary>
        [Fact]
        public void RequestResultsEchoTheRequestId()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 3001, 1, GainReason.Unspecified);
            Use(world, session, SlotOf(player, 3001), 7);
            Use(world, session, 59, 3);
            Assert.Equal(new[] { Result(7, FailReason.UnusableItem), Result(3, FailReason.NoItem) }, Take(session));
            Assert.False(session.IsClosing);

            player.Dead = true;
            Use(world, session, SlotOf(player, 2001), 8);
            List<Packet> results = Take(session).Where(IsResult).ToList();
            player.Dead = false;
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            Use(world, session, SlotOf(player, 2001), 9);
            results.AddRange(Take(session).Where(IsResult));
            Assert.Equal(new[] { Result(8, FailReason.Dead), Result(9, FailReason.Stunned) }, results);
            Assert.Equal(3u, player.Bag.CountOf(2001));

            Session flooder = Fighter(world, "hero_02", 3, 0);
            for (int i = 0; i < 40; i++)
            {
                world.Receive(flooder, new Packet { Ping = new Ping() });
            }

            Take(flooder);
            Use(world, flooder, SlotOf(flooder.Player!, 2001), 11);
            Assert.Equal(new[] { Result(11, FailReason.TooFast) }, Take(flooder));
        }

        /// <summary>
        /// 물약은 바로 채우고(최대를 넘지 않음) 수량을 하나 빼며 쓰는 종류의 쿨다운을 건다. 쿨다운 중에는 실패하고 수량이 그대로이며, 단계가 다른 체력 물약도
        /// 같은 쿨다운에 걸리지만 마나 물약은 걸리지 않는다. 본인은 Cooldowns(물약의 쓰는 종류)와 SelfVitals를 받는다.
        /// </summary>
        [Fact]
        public void PotionsHealAndShareACooldownPerKind()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 2002, 1, GainReason.Unspecified);
            player.Hp = player.MaxHp - 20;
            player.Mp = 0;
            Use(world, session, SlotOf(player, 2001), 1);
            Assert.Equal((player.MaxHp, 2u), (player.Hp, player.Bag.CountOf(2001)));
            uint endTick = world.Tick + Units.TicksFromMilliseconds(10000);
            Assert.Contains(session.Outbox, packet => packet.Cooldowns?.Entries.Contains(new Cooldown { Potion = (uint)ItemUse.HealHp, EndTick = endTick }) == true);

            player.Hp = 1;
            Use(world, session, SlotOf(player, 2001), 2);
            Use(world, session, SlotOf(player, 2002), 3);
            Use(world, session, SlotOf(player, 2003), 4);
            Assert.Equal(new[] { Result(1, FailReason.None), Result(2, FailReason.Cooldown), Result(3, FailReason.Cooldown), Result(4, FailReason.None) }, Take(session).Where(IsResult));
            Assert.Equal((1u, 2u, 1u), (player.Hp, player.Bag.CountOf(2001), player.Bag.CountOf(2002)));
            Assert.Equal(40u, player.Mp);
            world.Step();
            Assert.Contains(TakeVitals(session), packet => packet.SelfVitals is { Hp: 1, Mp: 40 });
        }

        /// <summary>
        /// 귀환은 3초 뒤 주문서 하나를 빼고 부활 지점으로 옮긴다. 전투 상태면 시작하지 않고, 자리를 벗어나면 취소되어 주문서가 남으며, 귀환 중의 다른 UseItem은
        /// "진행 중"이다. 귀환 중에 주문서가 없어지면 끝나는 틱에 ProgressCancelled("아이템 없음")가 간다.
        /// </summary>
        [Fact]
        public void RecallTakesTheScrollAndMovesToTown()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 5, 5);
            Player player = session.Player!;
            world.Inventory.Add(player, 2005, 3, GainReason.Unspecified);

            player.CombatEndTick = world.Tick + 100;
            Use(world, session, SlotOf(player, 2005), 1);
            player.CombatEndTick = 0;
            Use(world, session, SlotOf(player, 2005), 2);
            Use(world, session, SlotOf(player, 2001), 3);
            Assert.Equal(new[] { Result(1, FailReason.InCombat), Result(2, FailReason.None), Result(3, FailReason.Busy) }, Take(session).Where(IsResult));
            Assert.Equal(ProgressKind.Recall, player.Progress!.Kind);
            StepFor(world, 61);
            Assert.Null(player.Progress);
            Assert.Equal((-32 * M, -32 * M, 2u), (player.X, player.Z, player.Bag.CountOf(2005)));

            world.Place(player, Center(5), Center(5));
            Use(world, session, SlotOf(player, 2005), 4);
            Move(world, session, Center(5) + 10, Center(5), player.Ack);
            Assert.Null(player.Progress);
            Assert.Equal(2u, player.Bag.CountOf(2005));

            Use(world, session, SlotOf(player, 2005), 5);
            world.Inventory.Remove(player, SlotOf(player, 2005), 2);
            Take(session);
            StepFor(world, 61);
            Assert.Contains(Take(session), packet => packet.ProgressCancelled is { Reason: FailReason.NoItem });
        }

        private static void Use(World world, Session session, int slot, uint requestId)
        {
            world.Receive(session, new Packet { UseItem = new UseItem { Slot = (uint)slot, RequestId = requestId } });
        }

        private static int SlotOf(Player player, uint itemId)
        {
            return System.Array.FindIndex(player.Bag.Slots, slot => slot.ItemId == itemId);
        }

        private static Packet Result(uint requestId, FailReason result)
        {
            return new Packet { RequestResult = new RequestResult { RequestId = requestId, Result = result } };
        }

        private static bool IsResult(Packet packet)
        {
            return packet.BodyCase == Packet.BodyOneofCase.RequestResult;
        }

        private static List<InventoryChanged> InventoryChanges(Session session)
        {
            return TakeVitals(session).Where(packet => packet.BodyCase == Packet.BodyOneofCase.InventoryChanged).Select(packet => packet.InventoryChanged).ToList();
        }
    }
}
