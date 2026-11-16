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
    /// 제작(48). 시험용 제작법은 TestData.Recipes이고 제작 NPC는 (0, 0) m, 상점 NPC는 (8, 0) m에 선다. 제작 시간은 40틱이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 시작할 때 재료, 골드, 필요 레벨, 재료를 뺀 뒤의 자리, 제작 NPC 곁(상점 NPC 곁은 아님), 벽, 진행 중을 보고 RequestResult의 실패로 답한다.
        /// 통과하면 RequestResult(성공) 뒤에 Progress가 가고 그때는 재료와 골드가 그대로다.
        /// </summary>
        [Fact]
        public void CraftingStartsOnlyBesideTheCrafterWithEverythingNeeded()
        {
            World world = CraftWorld(TestData.Draw(64, (-3, 2, 4, 3, '#')));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            Craft(world, session, 1, 1);
            world.Inventory.Add(player, 3001, 5, GainReason.Unspecified);
            Craft(world, session, 1, 2);
            player.Bag.Gold = 100;
            Craft(world, session, 2, 3);
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            Craft(world, session, 3, 4);
            world.Inventory.Remove(player, SlotOf(player, 1001), 1);
            world.Place(player, Center(8), Center(1));
            Craft(world, session, 3, 5);
            world.Place(player, Center(0), Center(3));
            Craft(world, session, 3, 6);
            Craft(world, session, 99, 7);
            Assert.Equal(
                new[]
                {
                    Result(1, FailReason.NotEnoughMaterials), Result(2, FailReason.NotEnoughGold), Result(3, FailReason.LevelTooLow), Result(4, FailReason.InventoryFull),
                    Result(5, FailReason.OutOfRange), Result(6, FailReason.Blocked), Result(7, FailReason.NoItem),
                },
                Take(session).Where(IsResult));

            world.Place(player, Center(1), Center(0));
            Craft(world, session, 1, 8);
            Craft(world, session, 1, 9);
            Assert.Equal(new[] { Result(8, FailReason.None), Result(9, FailReason.Busy) }, Take(session).Where(IsResult));
            Assert.Equal((ProgressKind.Craft, 1u, world.Tick + 40), (player.Progress!.Kind, player.Progress.Id, player.Progress.EndTick));
            world.Step();
            Assert.Contains(Take(session), packet => packet.Progress is { State.Kind: ProgressKind.Craft, State.Id: 1 });
            Assert.Equal((5u, 100ul), (player.Bag.CountOf(3001), player.Bag.Gold));
        }

        /// <summary>
        /// 제작 시간이 지난 틱에 재료와 골드가 빠지고 결과가 들어오며(새로 얻은 것, 까닭 제작) 제작 완료 사건이 난다. 재료의 칸이 비면서 생긴 자리에 결과가
        /// 들어간다. 자리를 옮기거나 피해를 받으면 취소되고 잃는 것이 없다.
        /// </summary>
        [Fact]
        public void CraftingTakesTheCostAndGivesTheResultAtTheEnd()
        {
            World world = CraftWorld(TestData.Draw(64), TestData.Spawn(1, -3, 0, 2));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            var crafted = new List<(uint Player, uint Recipe)>();
            world.Craft.Crafted = (who, recipe) => crafted.Add((who.Id, recipe.Id));
            world.Inventory.Add(player, 3001, 3, GainReason.Unspecified);
            player.Bag.Gold = 70;
            Craft(world, session, 1, 1);
            uint end = player.Progress!.EndTick;
            StepUntil(world, () => player.Progress == null, 50);
            Assert.Equal(end + 1, world.Tick);
            Assert.Equal((0u, 20ul, 2u), (player.Bag.CountOf(3001), player.Bag.Gold, player.Bag.CountOf(2002)));
            Assert.Contains(new Gain { Reason = GainReason.Craft, Item = new ItemAmount { ItemId = 2002, Count = 2 } }, InventoryChanges(session).SelectMany(changed => changed.Gains));
            Assert.Equal(new[] { (player.Id, 1u) }, crafted);

            // 빈 칸이 없어도 재료 둘이 든 칸이 비면 투구가 그 칸에 들어간다.
            world.Inventory.Add(player, 3001, 2, GainReason.Unspecified);
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            int materialSlot = SlotOf(player, 3001);
            Craft(world, session, 3, 2);
            StepUntil(world, () => player.Progress == null, 50);
            Assert.Equal((1003u, 0u), (player.Bag.Slots[materialSlot].ItemId, player.Bag.CountOf(3001)));

            world.Inventory.Remove(player, SlotOf(player, 1001), 1);
            world.Inventory.Add(player, 3001, 6, GainReason.Unspecified);
            player.Bag.Gold = 100;
            Take(session);
            Craft(world, session, 1, 3);
            Move(world, session, player.X + 10, player.Z, player.Ack);
            world.Step();
            Assert.Null(player.Progress);
            Craft(world, session, 1, 4);
            world.Monsters[0].Damage.Add(player.Id, 1);
            StepUntil(world, () => player.Progress == null, 45);
            Assert.Equal((6u, 100ul, 2u), (player.Bag.CountOf(3001), player.Bag.Gold, player.Bag.CountOf(2002)));
            Assert.Equal(2, Take(session).Count(packet => packet.ProgressCancelled is { Reason: FailReason.Cancelled }));
        }

        /// <summary>
        /// 끝나는 틱에 같은 확인을 다시 본다: 그 사이에 재료가 줄었으면 "재료 부족", 인벤토리가 가득 찼으면 "인벤토리 가득"으로 ProgressCancelled이고
        /// 아무것도 빠지지 않는다. 진행 중의 떨어뜨리기는 "진행 중"으로 막히므로 재료는 바로 뺀다.
        /// </summary>
        [Fact]
        public void TheCraftEndTickChecksAgainAndTakesNothingOnFailure()
        {
            World world = CraftWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 3001, 3, GainReason.Unspecified);
            player.Bag.Gold = 100;
            Craft(world, session, 1, 1);
            world.Receive(session, new Packet { DropItem = new DropItem { Slot = (uint)SlotOf(player, 3001), Count = 1, RequestId = 2 } });
            Assert.Contains(Result(2, FailReason.Busy), Take(session));
            world.Inventory.Remove(player, SlotOf(player, 3001), 1);
            StepUntil(world, () => player.Progress == null, 50);
            Assert.Contains(Take(session), packet => packet.ProgressCancelled is { Reason: FailReason.NotEnoughMaterials });
            Assert.Equal((2u, 100ul), (player.Bag.CountOf(3001), player.Bag.Gold));

            world.Inventory.Add(player, 3001, 3, GainReason.Unspecified);
            Craft(world, session, 1, 3);
            world.Inventory.Add(player, 1001, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            StepUntil(world, () => player.Progress == null, 50);
            Assert.Contains(Take(session), packet => packet.ProgressCancelled is { Reason: FailReason.InventoryFull });
            Assert.Equal((5u, 100ul, 0u), (player.Bag.CountOf(3001), player.Bag.Gold, player.Bag.CountOf(2002)));
        }

        /// <summary>
        /// 장비의 등급은 제작법의 확률을 따른다(고정한 씨앗으로 10만 번 굴려 등급마다의 몫이 확률에서 0.5%p 안).
        /// </summary>
        [Fact]
        public void EquipmentGradesFollowTheRecipeChances()
        {
            double[] chances = { 0.6, 0.3, 0.08, 0.02 };
            var random = new Random(7);
            var counts = new int[4];
            const int Rolls = 100000;
            for (int i = 0; i < Rolls; i++)
            {
                counts[(int)CraftSystem.RollGrade(chances, random) - 1]++;
            }

            for (int grade = 0; grade < 4; grade++)
            {
                Assert.InRange((double)counts[grade] / Rolls, chances[grade] - 0.005, chances[grade] + 0.005);
            }
        }

        private static World CraftWorld(string[] rows, params SpawnsRow[] spawns)
        {
            var npcs = new Npcs
            {
                Rows =
                {
                    new NpcsRow { Id = 1, NameKey = "npc.test", Role = NpcRole.Craft, X = 0, Z = 0 },
                    new NpcsRow { Id = 2, NameKey = "npc.test", Role = NpcRole.Shop, X = 8, Z = 0 },
                },
            };
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMonsters(spawns, rows, null, null, null, null, npcs));
        }

        private static void Craft(World world, Session session, uint recipeId, uint requestId)
        {
            world.Receive(session, new Packet { Craft = new Craft { RecipeId = recipeId, RequestId = requestId } });
        }
    }
}
