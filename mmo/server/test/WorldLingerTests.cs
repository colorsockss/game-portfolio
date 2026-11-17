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
    /// 월드에 남는 캐릭터와 넘겨받기(46). 시험 맵은 64 m이고, 따로 말하지 않으면 비선공 몬스터 2가 (0, 0)에 서 있다.
    /// </summary>
    public partial class WorldTests
    {
        /// <summary>
        /// 전투 상태에서 끊긴 캐릭터는 월드에 남아 다른 연결에 그대로 보이고(나감이 가지 않음) 기본 공격을 멈춘다. 전투 상태가 끝나는 틱에 빠지며 사본이 들어가고
        /// 그때 다른 연결이 나감을 받는다. 전투 상태도 선공 표시도 없으면 그 틱에 빠진다.
        /// </summary>
        /// <summary>
        /// 다시 연결(64)로 같은 캐릭터가 들어올 때 받는 상태: 처음 들어올 때와 남아 있던 캐릭터를 넘겨받을 때 모두 경험치, 쿨다운 전체, 인벤토리(장비, 골드),
        /// 배운 스킬, 퀵슬롯, 퀘스트 진행, 펫, 성향, 능력치, 내 상태(체력, 마나, 전투 상태와 선공 표시가 끝나는 틱), 내 개체(레벨, 걸린 효과, 죽었는지)를 받는다.
        /// </summary>
        [Fact]
        public void EnteringAndTakingOverSendTheSameState()
        {
            World world = CombatWorld(TestData.Draw(64));
            Session first = Join(world, "hero_01");
            world.Step();
            HashSet<Packet.BodyOneofCase> entered = first.Outbox.Select(packet => packet.BodyCase).ToHashSet();
            Player player = first.Player!;
            long characterId = player.CharacterId;
            world.Effects.Apply(player, TestData.Effects.Rows.Single(row => row.Id == 1), world.Tick);
            player.CombatEndTick = world.Tick + 200;

            world.Disconnect(first);
            Assert.Equal(1, world.Lingering.Count);
            Session again = LogIn(world, "hero_01");
            again.Outbox.Clear();
            Enter(world, again, characterId);
            world.Step();
            HashSet<Packet.BodyOneofCase> resumed = again.Outbox.Select(packet => packet.BodyCase).ToHashSet();

            Packet.BodyOneofCase[] expected =
            {
                Packet.BodyOneofCase.EnterWorldResult, Packet.BodyOneofCase.ExpGained, Packet.BodyOneofCase.Cooldowns, Packet.BodyOneofCase.Inventory,
                Packet.BodyOneofCase.LearnedSkills, Packet.BodyOneofCase.Quickslots, Packet.BodyOneofCase.QuestState, Packet.BodyOneofCase.PetState,
                Packet.BodyOneofCase.Karma, Packet.BodyOneofCase.SelfStats, Packet.BodyOneofCase.SelfVitals, Packet.BodyOneofCase.EntitiesEnter,
            };
            Assert.All(expected, kind => Assert.Contains(kind, entered));
            Assert.All(expected, kind => Assert.Contains(kind, resumed));
            Assert.Same(player, again.Player);
            EntityEnter self = again.Outbox.Where(packet => packet.EntitiesEnter != null).SelectMany(packet => packet.EntitiesEnter.Entities).Single(entity => entity.Id == player.Id);
            Assert.Single(self.Effects);
            Assert.Equal(player.CombatEndTick, again.Outbox.Last(packet => packet.SelfVitals != null).SelfVitals.CombatEndTick);
        }

        [Fact]
        public void FightersStayUntilTheirCombatEnds()
        {
            using var store = new CharacterStore(":memory:");
            World world = CombatWorld(TestData.Draw(64), store: store);
            Session leaver = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 4, 0);
            Player player = leaver.Player!;
            // 몬스터가 되받아 치면 전투 상태가 이어지므로 공격 상태와 전투 상태만 둔다.
            player.AttackTarget = world.Monsters[0].Id;
            player.CombatEndTick = world.Tick + 60;
            world.Inventory.Add(player, 3001, 2, GainReason.Unspecified);
            uint end = player.CombatEndTick;
            Take(watcher);

            world.Disconnect(leaver);
            Assert.Equal((1, 2, 0u), (world.Lingering.Count, world.PlayerCount, player.AttackTarget));
            world.Step();
            Assert.DoesNotContain(Take(watcher), packet => packet.BodyCase == Packet.BodyOneofCase.EntitiesLeave);

            StepTo(world, end);
            Assert.Equal(1, world.Lingering.Count);
            world.Step();
            world.Step();
            Assert.Equal((0, 1), (world.Lingering.Count, world.PlayerCount));
            Assert.Contains(Take(watcher), packet => packet.EntitiesLeave?.Ids.Contains(player.Id) == true);
            world.CompleteSaves();
            Assert.Contains(store.Load(player.CharacterId)!.State.Items, item => item is { ItemId: 3001, Count: 2 });

            Session calm = Fighter(world, "hero_03", 10, 10);
            world.Disconnect(calm);
            Assert.Equal((0, 1), (world.Lingering.Count, world.PlayerCount));
        }

        /// <summary>
        /// 남은 캐릭터가 계속 맞으면 빠지는 틱이 늦춰지고, 맞아서 죽으면 죽은 다음 틱에 빠진다(받은 연결은 죽음을 먼저 받음).
        /// 선공 표시만 남은 채 끊으면 표시가 끝나는 틱까지 남는다.
        /// </summary>
        [Fact]
        public void LingeringCharactersCanBeHitAndKilled()
        {
            MonstersRow brute = TestData.Monster(1, aggressive: true);
            brute.Attack = 20;
            World world = CombatWorld(TestData.Draw(64), monsters: new[] { brute, TestData.Monster(2, aggressive: false) }, spawns: new[] { TestData.Spawn(1, 0, 0, 1) });
            Session leaver = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 2, 0);
            Player player = leaver.Player!;
            StepUntil(world, () => player.Hp < player.MaxHp, 60);
            uint first = player.CombatEndTick;
            world.Disconnect(leaver);
            StepUntil(world, () => player.CombatEndTick > first, 60);
            Assert.True(player.CombatEndTick > first);
            StepTo(world, first + 1);
            Assert.Equal(1, world.Lingering.Count);

            StepUntil(world, () => player.Dead, 600);
            Assert.True(player.Dead);
            List<Packet> died = Take(watcher);
            Assert.Contains(died, packet => packet.Died?.Id == player.Id);
            Assert.DoesNotContain(died, packet => packet.EntitiesLeave?.Ids.Contains(player.Id) == true);
            world.Step();
            world.Step();
            Assert.Equal(0, world.Lingering.Count);
            Assert.Contains(Take(watcher), packet => packet.EntitiesLeave?.Ids.Contains(player.Id) == true);

            World marked = CombatWorld(TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 30, 30, 2) });
            Session aggressor = Fighter(marked, "hero_01", 1, 0);
            Player marker = aggressor.Player!;
            marker.AggressorEndTick = marked.Tick + 40;
            marked.Disconnect(aggressor);
            StepTo(marked, marker.AggressorEndTick - 1);
            Assert.Equal(1, marked.Lingering.Count);
            marked.Step();
            marked.Step();
            marked.Step();
            Assert.Equal(0, marked.Lingering.Count);
        }

        /// <summary>
        /// 전투 중의 로그아웃과 LeaveWorld도 캐릭터를 남기고(LeaveWorld를 보낸 연결은 CharacterList를 받음), 재로그인으로 끊긴 예전 연결의 캐릭터도 남는다.
        /// 떼는 틱에 시전이 취소되어 받은 연결이 ProgressCancelled를 받고 파티에서 빠진다.
        /// </summary>
        [Fact]
        public void EveryWayOfLeavingLeavesAFighterBehind()
        {
            World world = CombatWorld(TestData.Draw(64), spawns: new[] { TestData.Spawn(1, 30, 30, 2) });
            Session logout = Fighter(world, "hero_01", 1, 0);
            Session leave = Fighter(world, "hero_02", 2, 0, CharacterClass.Mage);
            Session again = Fighter(world, "hero_03", 3, 0);
            Session watcher = Fighter(world, "hero_04", 4, 0);
            Form(world, watcher, leave);
            foreach (Session session in new[] { logout, leave, again })
            {
                session.Player!.CombatEndTick = world.Tick + 200;
            }

            UseSkill(world, leave, 203, leave.Player!.Id);
            Assert.NotNull(leave.Player!.Progress);
            Player cast = leave.Player!;
            world.Step();
            Take(watcher);

            world.Receive(logout, new Packet { Logout = new Logout() });
            world.Receive(leave, new Packet { LeaveWorld = new LeaveWorld() });
            world.CompleteSaves();
            Session newer = LogIn(world, "hero_03");
            Assert.True(logout.IsClosing && again.IsClosing);
            Assert.Contains(Take(leave), packet => packet.BodyCase == Packet.BodyOneofCase.CharacterList);
            Assert.Equal((3, 4), (world.Lingering.Count, world.PlayerCount));
            Assert.Null(cast.Progress);
            Assert.Equal(0u, cast.PartyId);
            world.Step();
            Assert.Contains(Take(watcher), packet => packet.ProgressCancelled?.Id == cast.Id);
        }

        /// <summary>
        /// 남아 있는 캐릭터로 다시 들어오면 저장소를 읽지 않고 같은 개체 번호, 체력, 마지막 저장 뒤에 얻은 아이템, 쿨다운, 선공 표시로 이어지고, 상태를 처음부터 다시 받는다
        /// (EnterWorldResult, 인벤토리, 성향, 내 개체와 주변 개체). 다른 연결은 들어옴과 나감을 받지 않고, 예약된 빼기는 버려진다.
        /// </summary>
        [Fact]
        public void ComingBackTakesOverTheLingeringCharacter()
        {
            using var store = new CharacterStore(":memory:");
            World world = CombatWorld(TestData.Draw(64), store: store, spawns: new[] { TestData.Spawn(1, 30, 30, 2) });
            Session leaver = Fighter(world, "hero_01", 1, 0);
            Session watcher = Fighter(world, "hero_02", 2, 0);
            Player player = leaver.Player!;
            uint id = player.Id;
            player.Hp = 77;
            player.CombatEndTick = world.Tick + 100;
            player.AggressorEndTick = world.Tick + 300;
            uint cooldown = world.Tick + 500;
            player.SetCooldown(101, cooldown);
            world.Disconnect(leaver);
            world.Inventory.Add(player, 3001, 3, GainReason.Unspecified);
            world.Step();
            Take(watcher);

            Session back = LogIn(world, "hero_01");
            Take(back);
            world.Receive(back, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)player.CharacterId } });
            Assert.Same(player, back.Player);
            Assert.Equal((id, 77u, 3u, 0u, 0), (player.Id, player.Hp, player.Bag.CountOf(3001), player.Ack, world.Lingering.Count));
            Assert.Equal(cooldown, player.CooldownEnd(101));
            Assert.NotEqual(0u, player.AggressorEndTick);
            world.Step();
            List<Packet> resent = back.Outbox.ToList();
            Assert.Equal(Packet.BodyOneofCase.EnterWorldResult, resent[0].BodyCase);
            Assert.Equal((EnterWorldResultCode.Ok, id), (resent[0].EnterWorldResult.Result, resent[0].EnterWorldResult.SelfId));
            Assert.Contains(resent, packet => packet.Inventory?.Slots.Any(slot => slot.ItemId == 3001) == true);
            Assert.Contains(resent, packet => packet.BodyCase == Packet.BodyOneofCase.Karma);
            Assert.Contains(resent, packet => packet.SelfVitals?.Hp == 77);
            Assert.Contains(resent, packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == id) == true
                && packet.EntitiesEnter.Entities.Any(entity => entity.Id == watcher.Player!.Id));
            Assert.DoesNotContain(Take(watcher), packet => packet.BodyCase is Packet.BodyOneofCase.EntitiesEnter or Packet.BodyOneofCase.EntitiesLeave);

            StepTo(world, player.AggressorEndTick + 5);
            Assert.Equal(2, world.PlayerCount);
            Assert.Same(player, back.Player);
        }

        /// <summary>
        /// 몬스터는 넘겨받은 뒤에도 같은 대상을 친다. 남아 있다 죽은 캐릭터를 죽은 다음 틱의 입력 차례에 넘겨받으면 빠지지 않고 죽은 채 이어져 Revive를 받는다.
        /// </summary>
        [Fact]
        public void MonstersKeepTheirTargetAndTheDeadCanBeTakenOver()
        {
            MonstersRow brute = TestData.Monster(1, aggressive: true);
            World world = CombatWorld(TestData.Draw(64), monsters: new[] { brute, TestData.Monster(2, aggressive: false) }, spawns: new[] { TestData.Spawn(1, 0, 0, 1) });
            Session leaver = Fighter(world, "hero_01", 1, 0);
            Player player = leaver.Player!;
            Monster monster = world.Monsters[0];
            StepUntil(world, () => monster.AttackTarget == player.Id, 60);
            Assert.Equal(player.Id, monster.AttackTarget);
            StepUntil(world, () => player.InCombat(world.Tick), 60);
            world.Disconnect(leaver);
            Assert.Equal(1, world.Lingering.Count);
            Session back = LogIn(world, "hero_01");
            world.Receive(back, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)player.CharacterId } });
            world.Step();
            Assert.Equal(player.Id, monster.AttackTarget);

            world.Disconnect(back);
            Assert.Equal(1, world.Lingering.Count);
            player.Hp = 1;
            StepUntil(world, () => player.Dead, 100);
            Assert.True(player.Dead);
            Session dead = LogIn(world, "hero_01");
            world.Receive(dead, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)player.CharacterId } });
            world.Step();
            world.Step();
            Assert.Same(player, dead.Player);
            Assert.Contains(dead.Outbox, packet => packet.EntitiesEnter?.Entities.Any(entity => entity.Id == player.Id && entity.Dead) == true);
            world.Receive(dead, new Packet { Revive = new Revive() });
            Assert.False(player.Dead);
        }

        /// <summary>
        /// 남은 캐릭터가 있는 동안 같은 계정의 다른 캐릭터는 "다른 캐릭터가 아직 월드에 있음"이고, 빠진 뒤에는 들어가진다. 남아 있다 죽은 무법자는 다음에 들어올 때
        /// 무법자의 부활 지점에서 부활한 채 시작한다.
        /// </summary>
        [Fact]
        public void OtherCharactersWaitAndTheDeadComeBackRevived()
        {
            using var store = new CharacterStore(":memory:");
            GameData data = TestData.WithMonsters(new[] { TestData.Spawn(1, 30, 30, 2) }, TestData.Draw(64), null, null, null);
            data.Zones.Rows[0].OutlawRespawnX = -20;
            data.Zones.Rows[0].OutlawRespawnZ = 20;
            var world = new World(10, spawnHalfExtent: 0, new Random(1), store, data);
            Session first = LogIn(world, "hero_01");
            long main = CreateCharacter(world, first, "Arthur");
            long second = CreateCharacter(world, first, "Lancelot");
            Enter(world, first, main);
            world.Step();
            Player player = first.Player!;
            player.CombatEndTick = world.Tick + 100;
            player.Karma = -1;
            world.Disconnect(first);

            Session back = LogIn(world, "hero_01");
            Take(back);
            world.Receive(back, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)second } });
            world.CompleteSaves();
            Assert.Equal(new[] { new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.OtherCharacterInWorld } } }, Take(back));
            Assert.Null(back.Player);

            player.Hp = 0;
            player.Dead = true;
            world.Lingering.Died(player, world.Tick);
            world.Step();
            world.Step();
            Assert.Equal(0, world.Lingering.Count);
            world.CompleteSaves();
            world.Receive(back, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)player.CharacterId } });
            world.CompleteSaves();
            Assert.Equal((-20 * Units.PerMeter, 20 * Units.PerMeter, false), (back.Player!.X, back.Player.Z, back.Player.Dead));
        }

        /// <summary>
        /// 예외로 끊긴 플레이어는 전투 상태여도 남지 않고, 서버가 내려갈 때는 남아 있는 캐릭터도 저장된다. 남은 캐릭터는 동접 상한에 세지 않고,
        /// 귓속말과 파티 초대를 받지 못한다.
        /// </summary>
        [Fact]
        public void LingeringHasItsLimits()
        {
            using var store = new CharacterStore(":memory:");
            var world = new World(2, spawnHalfExtent: 0, new Random(1), store, TestData.WithMonsters(new[] { TestData.Spawn(1, 30, 30, 2) }, TestData.Draw(64), null, null, null));
            Session broken = Fighter(world, "hero_01", 1, 0);
            broken.Player!.CombatEndTick = world.Tick + 100;
            world.ReceiveHook = packet =>
            {
                if (packet.BodyCase == Packet.BodyOneofCase.AttackStop)
                {
                    throw new InvalidOperationException("test");
                }
            };
            world.Receive(broken, new Packet { AttackStop = new AttackStop() });
            world.ReceiveHook = null;
            Assert.Equal((0, 0), (world.Lingering.Count, world.PlayerCount));

            Session stayer = Fighter(world, "hero_02", 1, 0);
            Player kept = stayer.Player!;
            kept.CombatEndTick = world.Tick + 1000;
            world.Inventory.Add(kept, 3001, 6, GainReason.Unspecified);
            world.Disconnect(stayer);
            Session a = Fighter(world, "hero_03", 2, 0);
            Session b = Fighter(world, "hero_04", 3, 0);
            Assert.False(a.IsClosing || b.IsClosing);

            world.Receive(a, new Packet { Chat = new Chat { Channel = ChatChannel.Whisper, To = kept.Name, Text = "hi" } });
            Assert.Contains(Take(a), packet => packet.ActionFailed?.Reason == FailReason.NoRecipient);
            world.Receive(a, new Packet { PartyInvite = new PartyInvite { TargetId = kept.Id } });
            Assert.Contains(Take(a), packet => packet.ActionFailed?.Reason == FailReason.NoTarget);

            world.SaveAll();
            Assert.Contains(store.Load(kept.CharacterId)!.State.Items, item => item is { ItemId: 3001, Count: 6 });
        }
    }
}
