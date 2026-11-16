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
    /// 퀘스트(50). 시험용 퀘스트는 TestData.Quests이고 퀘스트 NPC는 (0, 0) m, 제작 NPC는 (2, 0) m, 몬스터 2는 (4, 0)과 (4, 3) m, 몬스터 1은 (4, −3) m다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 받기와 끝내기는 퀘스트 NPC 곁(3 m, 선)에서만 되고, 진행 중이면 받기가, 받은 것이 없거나 조건을 채우지 않았으면 끝내기가 실패한다. 앞의 것을 끝내야
        /// 다음 차례를 받고, 마지막 뒤에는 남은 퀘스트가 없다. 받으면 본인이 QuestState를 받는다.
        /// </summary>
        [Fact]
        public void QuestsAreTakenOneAtATimeBesideTheGiver()
        {
            World world = QuestWorld(TestData.Draw(64, (-1, 2, 2, 3, '#')));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Place(player, Center(6), Center(0));
            Accept(world, session, 1);
            world.Place(player, Center(0), Center(3));
            Accept(world, session, 2);
            world.Place(player, Center(1), Center(0));
            Complete(world, session, 3);
            Accept(world, session, 4);
            Accept(world, session, 5);
            Complete(world, session, 6);
            Assert.Contains(new Packet { QuestState = new QuestState { Accepted = true } }, session.Outbox);
            Assert.Equal(
                new[]
                {
                    Result(1, FailReason.OutOfRange), Result(2, FailReason.Blocked), Result(3, FailReason.NoQuestAccepted), Result(4, FailReason.None),
                    Result(5, FailReason.QuestInProgress), Result(6, FailReason.QuestNotDone),
                },
                Take(session).Where(IsResult));

            player.Quest = new SavedQuest(3, false, 0);
            world.Growth.SetLevel(player, 2);
            Accept(world, session, 7);
            Complete(world, session, 8);
            Assert.Equal(new SavedQuest(4, false, 0), player.Quest);
            Assert.Equal(7ul, player.Bag.Gold);
            player.Quest = new SavedQuest(5, false, 0);
            Accept(world, session, 9);
            Assert.Equal(new[] { Result(7, FailReason.None), Result(8, FailReason.None), Result(9, FailReason.NoQuestLeft) }, Take(session).Where(IsResult));
        }

        /// <summary>
        /// 잡기는 받은 뒤 그 몬스터의 경험치를 받은 것만 센다: 받기 전과 다른 몬스터는 세지 않고 수를 넘겨 세지 않으며, 파티원이 잡았어도 내가 경험치를 받았으면
        /// 세고 둘레 시야 칸 밖이라 받지 못했으면 세지 않는다. 소환수만 때려 잡은 몬스터는 주인이 센다. 센 수가 바뀌면 QuestState가 간다.
        /// </summary>
        [Fact]
        public void KillsCountOnlyForTheTargetAfterAccepting()
        {
            World world = QuestWorld(TestData.Draw(256));
            Session hunter = Fighter(world, "hero_01", 3, 0);
            Player player = hunter.Player!;
            Monster first = world.Monsters.First(monster => monster.Placed.Spawn.Id == 1);
            Monster second = world.Monsters.First(monster => monster.Placed.Spawn.Id == 2);
            Monster other = world.Monsters.First(monster => monster.Placed.Spawn.Id == 3);
            Kill(world, hunter, first);
            player.Quest = new SavedQuest(0, true, 0);
            world.Place(player, Center(3), Center(-3));
            Kill(world, hunter, other);
            Assert.Equal(0u, player.Quest.Progress);
            world.Place(player, Center(3), Center(3));
            Kill(world, hunter, second);
            Assert.Equal(1u, player.Quest.Progress);
            Assert.Contains(new Packet { QuestState = new QuestState { Accepted = true, Progress = 1 } }, TakeVitals(hunter));

            World party = PartyWorld();
            Session a = Fighter(party, "hero_01", 2, 0);
            Session near = Fighter(party, "hero_02", 4, 0);
            Session far = Fighter(party, "hero_03", 6, 0);
            Form(party, a, near, far);
            party.Place(far.Player!, Center(100), Center(0));
            // a는 이미 다 셌다(수 2를 넘겨 세지 않음).
            a.Player!.Quest = new SavedQuest(0, true, 2);
            near.Player!.Quest = new SavedQuest(0, true, 1);
            far.Player!.Quest = new SavedQuest(0, true, 1);
            Kill(party, a, party.Monsters[0]);
            Assert.Equal((2u, 2u, 1u), (a.Player!.Quest.Progress, near.Player!.Quest.Progress, far.Player!.Quest.Progress));

            World solo = SummonWorld();
            Session mage = Duelist(solo, "hero_01", 9, 0, CharacterClass.Mage);
            mage.Player!.Quest = new SavedQuest(0, true, 0);
            Summon helper = Call(solo, mage);
            Monster prey = solo.Monsters[0];
            prey.Hp = 1;
            helper.Target = prey.Id;
            StepUntil(solo, () => prey.Dead, 80);
            Assert.Equal(1u, mage.Player!.Quest.Progress);
        }

        /// <summary>
        /// 제작은 받은 뒤 그 제작법으로 만든 것만 센다(제작 완료 사건. 48).
        /// </summary>
        [Fact]
        public void CraftsCountOnlyForTheTargetRecipe()
        {
            World world = QuestWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.Add(player, 3001, 20, GainReason.Unspecified);
            player.Bag.Gold = 500;
            CraftAndWait(world, session, 1, 1);
            player.Quest = new SavedQuest(2, true, 0);
            CraftAndWait(world, session, 3, 2);
            Assert.Equal(0u, player.Quest.Progress);
            CraftAndWait(world, session, 1, 3);
            Assert.Equal(1u, player.Quest.Progress);
        }

        /// <summary>
        /// 끝내기: 모으기·레벨·장비 입기는 끝낼 때의 상태로 보고(받기 전에 채웠어도 됨) 모으기의 재료를 빼며, 보상의 골드와 아이템은 새로 얻은 것에 까닭 퀘스트 보상으로
        /// 실리고 경험치로 레벨이 오른다. 보상이 들어갈 자리가 없으면 실패하고 아무것도 바뀌지 않으며, 재료가 빠지며 생긴 자리에는 들어간다. 장비 입기는 그 칸에
        /// 무엇을 입어도 된다.
        /// </summary>
        [Fact]
        public void CompletingChecksTheStateAndGivesTheReward()
        {
            World world = QuestWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            player.Quest = new SavedQuest(0, true, 2);
            Complete(world, session, 1);
            world.Step();
            Assert.Equal((10ul, 5u, 5u), (player.Bag.Gold, player.Bag.CountOf(2001), player.Exp));
            Assert.Equal(
                new[] { new Gain { Reason = GainReason.QuestReward, Gold = 10 }, new Gain { Reason = GainReason.QuestReward, Item = new ItemAmount { ItemId = 2001, Count = 2 } } },
                InventoryChanges(session).SelectMany(changed => changed.Gains));

            // 모으기: 받기 전에 모은 재료로 끝낸다. 모자라면 실패, 자리가 없으면 실패하고 그대로, 재료 칸이 비면 그 자리에 보상 장비가 든다.
            world.Inventory.Add(player, 3001, 2, GainReason.Unspecified);
            Accept(world, session, 2);
            Complete(world, session, 3);
            world.Inventory.Add(player, 3001, 2, GainReason.Unspecified);
            world.Inventory.Add(player, 1002, (uint)player.Bag.Slots.Count(slot => slot.ItemId == 0), GainReason.Unspecified);
            Complete(world, session, 4);
            Assert.Equal((4u, 1u), (player.Bag.CountOf(3001), player.Quest.Completed));
            world.Inventory.Remove(player, SlotOf(player, 3001), 1);
            int materialSlot = SlotOf(player, 3001);
            Complete(world, session, 5);
            Assert.Equal(new[] { Result(2, FailReason.None), Result(3, FailReason.QuestNotDone), Result(4, FailReason.InventoryFull), Result(5, FailReason.None) },
                Take(session).Where(IsResult));
            Assert.Equal((1001u, 0u, 2u), (player.Bag.Slots[materialSlot].ItemId, player.Bag.CountOf(3001), player.Quest.Completed));

            // 레벨 2와 투구 칸: 지금 상태로 본다. 투구 칸에는 어느 투구든 입으면 되고, 보상 경험치로 레벨이 오른다.
            world.Inventory.Remove(player, SlotOf(player, 1002), 1);
            player.Quest = new SavedQuest(3, true, 0);
            Complete(world, session, 6);
            world.Growth.SetLevel(player, 2);
            Complete(world, session, 7);
            Accept(world, session, 8);
            Complete(world, session, 9);
            world.Inventory.Add(player, 1003, 1, GainReason.Unspecified);
            world.Receive(session, new Packet { Equip = new Equip { Slot = (uint)SlotOf(player, 1003), RequestId = 10 } });
            uint level = player.Level;
            Complete(world, session, 11);
            Assert.Equal(
                new[] { Result(6, FailReason.QuestNotDone), Result(7, FailReason.None), Result(8, FailReason.None), Result(9, FailReason.QuestNotDone), Result(10, FailReason.None), Result(11, FailReason.None) },
                Take(session).Where(IsResult));
            Assert.True(player.Level > level);
            Assert.Equal(new SavedQuest(5, false, 0), player.Quest);
        }

        /// <summary>
        /// 받은 퀘스트와 센 수는 다시 들어와도 남고, 들어올 때 QuestState가 온다.
        /// </summary>
        [Fact]
        public void QuestProgressSurvivesARejoin()
        {
            using var store = new CharacterStore(":memory:");
            World world = QuestWorld(TestData.Draw(64), store);
            Session session = Fighter(world, "hero_01", 1, 0);
            long id = session.Player!.CharacterId;
            Accept(world, session, 1);
            session.Player!.Quest = session.Player.Quest with { Progress = 1 };
            world.Step();
            world.Disconnect(session);
            world.CompleteSaves();

            World restarted = QuestWorld(TestData.Draw(64), store);
            Session again = LogIn(restarted, "hero_01");
            Enter(restarted, again, id);
            Assert.Equal(new SavedQuest(0, true, 1), again.Player!.Quest);
            Assert.Contains(new Packet { QuestState = new QuestState { Accepted = true, Progress = 1 } }, again.Outbox);
            restarted.CompleteSaves();
        }

        private static World QuestWorld(string[] rows, CharacterStore? store = null)
        {
            var npcs = new Npcs
            {
                Rows =
                {
                    new NpcsRow { Id = 1, NameKey = "npc.test", Role = NpcRole.Quest, X = 0, Z = 0 },
                    new NpcsRow { Id = 2, NameKey = "npc.test", Role = NpcRole.Craft, X = 2, Z = 0 },
                },
            };
            SpawnsRow[] spawns = { TestData.Spawn(1, 4, 0, 2), TestData.Spawn(2, 4, 3, 2), TestData.Spawn(3, 4, -3, 1) };
            return new World(10, spawnHalfExtent: 0, new Random(1), store ?? new CharacterStore(":memory:"),
                TestData.WithMonsters(spawns, rows, null, null, new[] { TestData.Monster(1, aggressive: false), TestData.Monster(2, aggressive: false) }, TestData.LevelsUpTo(4), npcs));
        }

        private static void CraftAndWait(World world, Session session, uint recipeId, uint requestId)
        {
            Craft(world, session, recipeId, requestId);
            Assert.Contains(Result(requestId, FailReason.None), Take(session));
            StepUntil(world, () => session.Player!.Progress == null, 50);
        }

        private static void Accept(World world, Session session, uint requestId)
        {
            world.Receive(session, new Packet { QuestAccept = new QuestAccept { RequestId = requestId } });
        }

        private static void Complete(World world, Session session, uint requestId)
        {
            world.Receive(session, new Packet { QuestComplete = new QuestComplete { RequestId = requestId } });
        }
    }
}
