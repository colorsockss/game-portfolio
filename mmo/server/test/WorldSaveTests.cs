using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 캐릭터 저장(38). 같은 저장소로 새 World를 만드는 것이 서버를 다시 띄우는 것(메모리를 잃음)이다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 다시 띄운 서버에 들어오면 위치, 레벨, 경험치, 체력, 마나, 골드, 아이템(칸과 강화 수치), 입은 장비, 배운 스킬, 퀵슬롯이 남아 있고 쿨다운과 효과는 없다.
        /// 새 캐릭터의 처음 상태는 한 번만 받아 다시 들어와도 늘지 않는다.
        /// </summary>
        [Fact]
        public void EverythingSurvivesARestart()
        {
            using var store = new CharacterStore(":memory:");
            World world = CombatWorld(TestData.Draw(64), store: store);
            Session session = Fighter(world, "hero_01", 3, 0, learnAll: false);
            Player player = session.Player!;
            long id = player.CharacterId;
            world.Growth.SetLevel(player, 2);
            player.Exp = 30;
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified, enchant: 4);
            world.Receive(session, new Packet { Equip = new Equip { Slot = (uint)SlotOf(player, 1001), RequestId = 1 } });
            world.Inventory.Add(player, 3001, 7, GainReason.Unspecified);
            world.Inventory.AddGold(player, 77, GainReason.Unspecified);
            world.Quickslots.Learn(player, 102);
            SetSlot(world, session, 7, Skill(102));
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 3), world.Tick);
            UseSkill(world, session, 101, world.Monsters[0].Id);
            (player.Hp, player.Mp) = (100u, 7u);
            world.Step();
            world.Disconnect(session);
            world.CompleteSaves();

            World restarted = CombatWorld(TestData.Draw(64), store: store);
            Session again = LogIn(restarted, "hero_01");
            Enter(restarted, again, id);
            Player loaded = again.Player!;
            Assert.Equal((Center(3), Center(0), 2u, 30u, 100u, 7u, 77ul), (loaded.X, loaded.Z, loaded.Level, loaded.Exp, loaded.Hp, loaded.Mp, loaded.Bag.Gold));
            Assert.Equal((1001u, 4u), (loaded.Bag.Equipment[0].ItemId, loaded.Bag.Equipment[0].Enchant));
            Assert.Equal((3u, 2u, 7u), (loaded.Bag.CountOf(2001), loaded.Bag.CountOf(2003), loaded.Bag.CountOf(3001)));
            Assert.Equal(new uint[] { 101, 102 }, loaded.Skills.OrderBy(skill => skill));
            Assert.Equal((QuickslotKind.Skill, 102u), loaded.Quickslots[7]);
            Assert.Equal(0u, loaded.CooldownEnd(101));
            Assert.Empty(loaded.EnterMessage().Effects);
        }

        /// <summary>
        /// CharacterList에 레벨과 입은 무기가 실리고, LeaveWorld 뒤의 목록은 나갈 때의 사본 뒤에 읽혀 방금 오른 레벨이 실린다.
        /// </summary>
        [Fact]
        public void TheListAfterLeavingShowsTheNewLevelAndWeapon()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Growth.SetLevel(player, 2);
            world.Inventory.Add(player, 1001, 1, GainReason.Unspecified);
            world.Receive(session, new Packet { Equip = new Equip { Slot = (uint)SlotOf(player, 1001), RequestId = 1 } });
            Take(session);
            world.Receive(session, new Packet { LeaveWorld = new LeaveWorld() });
            world.CompleteSaves();
            CharacterSummary listed = Take(session).Single(packet => packet.BodyCase == Packet.BodyOneofCase.CharacterList).CharacterList.Characters.Single();
            Assert.Equal((2u, 1001u), (listed.Level, listed.WeaponItemId));
        }

        /// <summary>
        /// 체력 0으로 빠진 캐릭터는 마을의 부활 지점에서 부활할 때의 체력(30%)과 저장된 마나로 시작하고 EnterWorldResult의 표시가 켜진다.
        /// </summary>
        [Fact]
        public void CharactersThatLeftDeadReviveInTown()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            WalkTo(world, session, 100, 0);
            (session.Player!.Hp, session.Player.Mp) = (0u, 33u);
            session.Player.Dead = true;
            world.Disconnect(session);

            Session again = LogIn(world, "hero_01");
            Take(again);
            Enter(world, again, id);
            Assert.True(again.Outbox.Single(packet => packet.BodyCase == Packet.BodyOneofCase.EnterWorldResult).EnterWorldResult.Revived);
            Assert.Equal((0, 0, 45u, 33u, false), (again.Player!.X, again.Player.Z, again.Player.Hp, again.Player.Mp, again.Player.Dead));
        }

        /// <summary>
        /// 아이템이 바뀐 플레이어의 사본은 5초 주기에, 걷기만 한 플레이어의 사본은 60초 주기에 들어가고, 바뀐 것이 없는 플레이어는 묶음에 들지 않는다.
        /// 사본을 넣으면 두 표시가 함께 내려간다.
        /// </summary>
        [Fact]
        public void SnapshotsGoInOnTheirOwnPeriod()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session trader = Join(world, "hero_01");
            Session walker = Join(world, "hero_02");
            Session idle = Join(world, "hero_03");
            world.Step();
            while (world.Tick % SaveSystem.SlowIntervalTicks != 0)
            {
                world.Step();
            }

            world.CompleteSaves();
            store.Write(new[] { SaveSystem.Snapshot(idle.Player!) with { Gold = 999 } });
            world.Inventory.AddGold(trader.Player!, 50, GainReason.Unspecified);
            trader.Player!.DirtySlow = true;
            WalkTo(world, walker, 40, 0);
            while (world.Tick % SaveSystem.FastIntervalTicks != 0)
            {
                world.Step();
            }

            world.CompleteSaves();
            Assert.Equal(50ul, store.Load(trader.Player.CharacterId)!.State.Gold);
            Assert.Equal((false, false), (trader.Player.DirtyFast, trader.Player.DirtySlow));
            Assert.Equal(0, store.Load(walker.Player!.CharacterId)!.State.Position.X);
            while (world.Tick % SaveSystem.SlowIntervalTicks != 0)
            {
                world.Step();
            }

            world.CompleteSaves();
            Assert.Equal(40, store.Load(walker.Player.CharacterId)!.State.Position.X);
            Assert.Equal(999ul, store.Load(idle.Player!.CharacterId)!.State.Gold);
        }

        /// <summary>
        /// 물약 90개를 사고 곧 1개를 떨어뜨린 뒤 서버가 죽어도, 떨어뜨릴 때 넣은 사본에 산 물약과 낸 골드가 함께 있다.
        /// </summary>
        [Fact]
        public void DroppingSavesThePurchaseBeforeIt()
        {
            using var store = new CharacterStore(":memory:");
            World world = ShopWorld(TestData.Draw(64), store);
            Session session = Fighter(world, "hero_01", 1, 0);
            Player player = session.Player!;
            world.Inventory.AddGold(player, 2000, GainReason.Unspecified);
            BuyItem(world, session, 2001, 90, 1);
            Drop(world, session, SlotOf(player, 2001), 1, 2);
            world.CompleteSaves();

            World restarted = ShopWorld(TestData.Draw(64), store);
            Session again = LogIn(restarted, "hero_01");
            Enter(restarted, again, player.CharacterId);
            Assert.Equal((92u, 200ul), (again.Player!.Bag.CountOf(2001), again.Player.Bag.Gold));
        }

        /// <summary>
        /// 내놓은 아이템을 다른 플레이어가 주운 뒤 주운 쪽이 저장되기 전에 서버가 죽으면, 아이템은 두 곳에 있지 않고 사라질 뿐이다.
        /// </summary>
        [Fact]
        public void APickedUpDropIsNeverInTwoPlaces()
        {
            using var store = new CharacterStore(":memory:");
            World world = LootWorld(TestData.Draw(64), store);
            Session dropper = Fighter(world, "hero_01", 5, 5);
            Session picker = Fighter(world, "hero_02", 6, 5);
            Drop(world, dropper, SlotOf(dropper.Player!, 2001), 3, 1);
            PickUp(world, picker, world.GroundItems.Single().Id, 2);
            Assert.Equal(6u, picker.Player!.Bag.CountOf(2001));
            world.CompleteSaves();

            World restarted = LootWorld(TestData.Draw(64), store);
            Session first = LogIn(restarted, "hero_01");
            Enter(restarted, first, dropper.Player!.CharacterId);
            Session second = LogIn(restarted, "hero_02");
            Enter(restarted, second, picker.Player.CharacterId);
            Assert.Equal((0u, 3u), (first.Player!.Bag.CountOf(2001), second.Player!.Bag.CountOf(2001)));
        }

        /// <summary>
        /// 접속한 채 같은 계정으로 다시 로그인해 같은 캐릭터로 들어와도, 예전 연결이 빠지며 넣은 사본 뒤에 읽혀 방금 얻은 아이템이 남아 있다.
        /// </summary>
        [Fact]
        public void LoggingInAgainKeepsWhatWasJustGained()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            world.Inventory.Add(session.Player, 3001, 5, GainReason.Unspecified);
            Session again = LogIn(world, "hero_01");
            Assert.True(session.IsClosing);
            Enter(world, again, id);
            Assert.Equal(5u, again.Player!.Bag.CountOf(3001));
        }

        /// <summary>
        /// 불러오는 중에 같은 캐릭터의 EnterWorld가 또 오면 읽기를 다시 넣지 않고 뒤의 연결이 결과를 받으며 개체는 하나다. 불러오는 중에 끊긴 연결의 결과는 버린다.
        /// </summary>
        [Fact]
        public void LoadingFollowsTheLastConnection()
        {
            World world = NewWorld();
            Session first = LogIn(world, "hero_01");
            long id = CreateCharacter(world, first, "Arthur");
            world.Receive(first, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)id } });
            Session second = LogIn(world, "hero_01");
            Take(second);
            world.Receive(second, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)id } });
            world.CompleteSaves();
            Assert.Null(first.Player);
            Assert.NotNull(second.Player);
            Assert.Equal(1, world.PlayerCount);

            Session third = LogIn(world, "hero_02");
            long other = CreateCharacter(world, third, "Merlin");
            world.Receive(third, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)other } });
            world.Disconnect(third);
            world.CompleteSaves();
            Assert.Equal(1, world.PlayerCount);
        }

        /// <summary>
        /// 저장 스레드의 쓰기와 읽기를 일부러 늦춰도 틱은 기다리지 않는다.
        /// </summary>
        /// <summary>
        /// 쓰기 묶음마다 저장 스레드가 WAL 체크포인트를 따로 돌리고, 큐가 비기를 기다리면 체크포인트까지 끝나 있다(57). 큐의 가장 긴 길이도 센다.
        /// </summary>
        [Fact]
        public void WriteBatchesAreCheckpointedOnTheSaveThread()
        {
            string path = Path.Combine(Path.GetTempPath(), $"mmo-save-{Guid.NewGuid():N}.sqlite");
            try
            {
                using (var store = new CharacterStore(path))
                {
                    World world = NewWorld(store: store);
                    Session first = Join(world, "hero_01");
                    Session second = Join(world, "hero_02");
                    Assert.True(world.Saves.WaitIdle(TimeSpan.FromSeconds(5)));
                    world.Saves.TakeStats();

                    world.Saves.Delay = TimeSpan.FromMilliseconds(30);
                    world.Receive(first, new Packet { LeaveWorld = new LeaveWorld() });
                    world.Receive(second, new Packet { LeaveWorld = new LeaveWorld() });
                    world.Step();
                    Assert.True(world.Saves.WaitIdle(TimeSpan.FromSeconds(5)));
                    SaveStats stats = world.Saves.TakeStats();
                    Assert.Equal(2, stats.Checkpoints);
                    Assert.True(stats.CheckpointPages > 0);
                    Assert.True(stats.MaxPending >= 2, $"queue max {stats.MaxPending}");
                    world.Saves.Delay = TimeSpan.Zero;
                }
            }
            finally
            {
                foreach (string suffix in new[] { string.Empty, "-wal", "-shm" })
                {
                    File.Delete(path + suffix);
                }
            }
        }

        [Fact]
        public void ASlowSaveThreadDoesNotSlowTheTick()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            world.Saves.Delay = TimeSpan.FromMilliseconds(300);
            world.Receive(session, new Packet { LeaveWorld = new LeaveWorld() });
            world.Receive(session, new Packet { EnterWorld = new EnterWorld { CharacterId = 1 } });
            var watch = Stopwatch.StartNew();
            for (int i = 0; i < 5; i++)
            {
                world.Step();
            }

            Assert.True(watch.ElapsedMilliseconds < 200, $"5 ticks took {watch.ElapsedMilliseconds} ms");
            Assert.True(world.Saves.Pending > 0);
            world.Saves.Delay = TimeSpan.Zero;
            world.CompleteSaves();
            Assert.NotNull(session.Player);
        }
    }
}
