using System;
using System.Collections.Generic;
using System.Diagnostics;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드의 데이터(EntityTable, Grid)와 시스템을 묶고, 틱을 정해진 차례로 돌린다. 틱 스레드 하나만 부르므로 확인과 쓰기가 늘 한 동기 구간에 있다.
    /// 차례: 1. 입력(Receive. GameServer가 큐를 비우며 부름) → 2. 예약한 일 → 3. 몬스터 → 4. 전투 → 5. 회복과 효과 → 6. 시야 → 7. 저장 → 8. 보내기(GameServer).
    /// 차례마다의 시스템은 아래의 Step에 있다. 입력의 요청은 자기 플레이어의 상태만 고치고, 남을 고치는 결과는 전투 차례로 넘긴다.
    /// </summary>
    public sealed class World : IScheduledRunner
    {
        private readonly EntityTable _entities = new EntityTable();
        private readonly Grid _grid = new Grid();
        private readonly LoginSystem _login;
        private readonly MovementSystem _movement;
        private readonly ViewSystem _view;
        private readonly SaveQueue _queue;
        private readonly SaveSystem _save;
        private readonly Scheduler _scheduler = new Scheduler();
        private readonly VitalsSystem _vitals;
        private readonly AiSystem _ai;
        private readonly CombatSystem _combat;
        private readonly TickEvents _events;
        private readonly SpawnSystem _spawn;
        private readonly DeathSystem _deaths;
        private readonly GrowthSystem _growth;
        private readonly InventorySystem _inventory;
        private readonly QuickslotSystem _quickslots;
        private readonly ShopSystem _shop;
        private readonly StorageSystem _storage;
        private readonly ChatSystem _chat;
        private readonly PartySystem _party;
        private readonly BossSystem _bosses;
        private readonly PkSystem _pk;
        private readonly LingerSystem _lingering;
        private readonly SummonSystem _summons;
        private readonly LootSystem _loot;
        private readonly GatherSystem _gather;
        private readonly CraftSystem _craft;
        private readonly QuestSystem _quests;
        private readonly ProgressSystem _progress;
        private readonly EffectSystem _effects;
        private readonly SkillSystem _skills;
        private readonly ProjectileSystem _projectiles;
        private readonly RateLimiter.Limits _rateLimits;
        private readonly DevSystem? _dev;

        /// <summary>
        /// 빈 월드를 만든다. dev면 개발 명령(DevCommand)을 실행하고(서버의 --dev), demo면 체험 캐릭터를 만든다(--demo. 94).
        /// </summary>
        public World(int maxPlayers, int spawnHalfExtent, Random random, CharacterStore store, GameData data, bool dev = false, bool demo = false)
        {
            _queue = new SaveQueue(store);
            _save = new SaveSystem(_queue, _entities);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            var stats = new StatSystem(data, random);
            _party = new PartySystem(data, _entities, _scheduler);
            _pk = new PkSystem(data, field, _scheduler);
            _login = new LoginSystem(maxPlayers, spawnHalfExtent, random, _queue, data, field, _entities, _grid, _save, stats, _pk, () => Tick, demo);
            _vitals = new VitalsSystem(_entities, data);
            _ai = new AiSystem(_entities, _grid, field, _scheduler, data, random, _party);
            _events = new TickEvents();
            _progress = new ProgressSystem(_entities, _scheduler, _events);
            _effects = new EffectSystem(_entities, _scheduler, _events, stats, _progress, data);
            _combat = new CombatSystem(_entities, field, _scheduler, stats, data, _events, _progress, _party, _pk);
            _projectiles = new ProjectileSystem(_entities, _grid, field, data, _events, _combat, _effects, _pk);
            _skills = new SkillSystem(_entities, _grid, field, _scheduler, data, _events, _combat, _effects, _progress, _projectiles, _pk);
            _combat.Skills = _skills;
            _combat.Projectiles = _projectiles;
            _bosses = new BossSystem(data, _entities, _grid, field, _scheduler, _events, _combat);
            _combat.Bosses = _bosses;
            _ai.Bosses = _bosses;
            // 놓인 점의 번호는 플레이어보다 먼저 받는다.
            _spawn = new SpawnSystem(data, field, _entities, _grid, _ai, _scheduler, random);
            _spawn.Spawned = _bosses.Spawned;
            _spawn.PlaceAll();
            _movement = new MovementSystem(_entities, _grid, field, Units.TicksFromMilliseconds(data.Constants.MoveStopMs));
            _growth = new GrowthSystem(_entities, stats, data, _party);
            _quickslots = new QuickslotSystem(data);
            _inventory = new InventorySystem(data, _progress, _movement, stats, _quickslots, _pk, random);
            _loot = new LootSystem(data, _entities, _grid, field, _scheduler, _inventory, _save, random);
            // 채집물도 놓인 점의 번호를 플레이어보다 먼저 받는다(47).
            _gather = new GatherSystem(data, field, _entities, _grid, _scheduler, _progress, _inventory);
            _gather.PlaceAll(_spawn);
            // NPC도 놓인 점의 번호를 플레이어보다 먼저 받는다(37). 움직이지 않고 칸을 막지 않는다. 경비병(44)은 AiSystem이 움직인다.
            Npc? shop = null;
            Npc? keeper = null;
            Npc? crafter = null;
            Npc? giver = null;
            foreach (NpcsRow row in data.Npcs.Rows)
            {
                if (row.Role == NpcRole.Guard)
                {
                    var guard = new Guard(_entities.ReservePlacedId(), row, data.Monster(row.MonsterId)!) { StrikeGeneration = _scheduler.NewGeneration() };
                    _entities.Add(guard);
                    _grid.Add(guard);
                    _ai.Add(guard);
                    continue;
                }

                var npc = new Npc(_entities.ReservePlacedId(), row);
                _entities.Add(npc);
                _grid.Add(npc);
                shop = row.Role == NpcRole.Shop ? npc : shop;
                keeper = row.Role == NpcRole.Storage ? npc : keeper;
                crafter = row.Role == NpcRole.Craft ? npc : crafter;
                giver = row.Role == NpcRole.Quest ? npc : giver;
            }

            _shop = new ShopSystem(data, field, _inventory, shop);
            _storage = new StorageSystem(data, field, _inventory, keeper);
            _craft = new CraftSystem(data, field, _progress, _inventory, crafter, random);
            _quests = new QuestSystem(data, field, _inventory, _growth, giver);
            _craft.Crafted = _quests.Crafted;
            _login.Entered = (player, state, revived) =>
            {
                _inventory.Enter(player, state, revived);
                _quests.Enter(player, state.Quest);
                player.SendPet();
                _pk.Entered(player);
                _bosses.Entered(player);
            };
            _chat = new ChatSystem(data, _entities, _grid, _party);
            _deaths = new DeathSystem(_entities, _scheduler, _movement, _events, _effects, _progress, _growth, _loot, _pk, data);
            _combat.Deaths = _deaths;
            _deaths.Bosses = _bosses;
            _lingering = new LingerSystem(_entities, _grid, _scheduler, _progress, _save);
            _summons = new SummonSystem(data, _entities, _grid, _scheduler, _ai);
            _skills.Summons = _summons;
            _ai.Combat = _combat;
            _deaths.Summons = _summons;
            // 연결이 캐릭터에서 떨어지면 파티에서 빼고 소환수를 바로 뺀다(42, 95).
            _login.Leaving = player =>
            {
                _party.Leaving(player);
                _summons.Dismiss(player, Tick);
            };
            _login.Lingering = _lingering;
            _deaths.Lingering = _lingering;
            _login.Resumed = player =>
            {
                _inventory.SendWhole(player);
                _quickslots.SendWhole(player);
                QuestSystem.Send(player);
                player.SendPet();
                _pk.Entered(player);
                _bosses.Entered(player);
            };
            _view = new ViewSystem(_entities, _grid, new MoveNotifier(data.Constants), data.Constants.ViewMargin, (int)data.Constants.ViewPlayerLimit);
            _rateLimits = RateLimiter.Limits.From(data.Constants);
            _dev = dev ? new DevSystem(data, field, _entities, _movement, _progress, _spawn, _growth, _inventory, _pk) : null;
        }

        /// <summary>
        /// 지금 계산하는 틱 번호. Step이 끝날 때 지난 틱 수만큼 오른다.
        /// </summary>
        public uint Tick { get; private set; }

        /// <summary>
        /// 몬스터들(테스트와 부하 측정이 본다).
        /// </summary>
        internal IReadOnlyList<Monster> Monsters => _ai.Monsters;

        /// <summary>
        /// 진행 중인 일과 효과(테스트가 시험용 종류를 시작하거나 플레이어에 효과를 붙임).
        /// </summary>
        internal ProgressSystem Progress => _progress;

        internal EffectSystem Effects => _effects;

        internal GrowthSystem Growth => _growth;

        internal InventorySystem Inventory => _inventory;

        internal QuickslotSystem Quickslots => _quickslots;

        internal PartySystem Party => _party;

        /// <summary>
        /// 월드에 남은 캐릭터(46. 테스트가 수를 봄).
        /// </summary>
        internal LingerSystem Lingering => _lingering;

        /// <summary>
        /// 월드의 소환수(95. 테스트가 봄).
        /// </summary>
        /// <summary>
        /// 월드의 모든 개체(52의 시야 테스트가 옛 규칙과 견줌).
        /// </summary>
        internal System.Collections.Generic.IEnumerable<Entity> AllEntities => _entities.All;

        internal System.Collections.Generic.IEnumerable<Summon> Summons() => System.Linq.Enumerable.OfType<Summon>(_entities.All);

        /// <summary>
        /// 경비병들(44. 테스트가 상태와 자리를 봄).
        /// </summary>
        internal System.Collections.Generic.IEnumerable<Guard> Guards => System.Linq.Enumerable.OfType<Guard>(_entities.All);

        internal System.Collections.Generic.IEnumerable<GroundItem> GroundItems => System.Linq.Enumerable.OfType<GroundItem>(_entities.All);

        /// <summary>
        /// 월드에 있는 채집물과 놓인 점(47. 테스트가 봄).
        /// </summary>
        internal System.Collections.Generic.IEnumerable<GatherNode> GatherNodes => System.Linq.Enumerable.OfType<GatherNode>(_entities.All);

        internal System.Collections.Generic.IEnumerable<GatherPoint> GatherPoints => _gather.Points;

        /// <summary>
        /// 제작(48. 테스트가 제작 완료 사건을 듣고 등급의 굴림을 봄).
        /// </summary>
        internal CraftSystem Craft => _craft;

        /// <summary>
        /// 날고 있는 직선 발사체(테스트가 수를 봄).
        /// </summary>
        internal ProjectileSystem Projectiles => _projectiles;

        /// <summary>
        /// 개체를 옮긴다(테스트가 플레이어를 둠).
        /// </summary>
        internal void Place(Entity entity, int x, int z)
        {
            entity.X = x;
            entity.Z = z;
            _grid.Moved(entity);
        }

        /// <summary>
        /// 월드에 들어온 플레이어 수.
        /// </summary>
        public int PlayerCount => _entities.PlayerCount;

        /// <summary>
        /// 지난 Step에서 플레이어 하나에게 보인 개체 수의 평균. 부하 측정에 쓴다.
        /// </summary>
        public double AverageVisible => _view.AverageVisible;

        /// <summary>
        /// 바이트로 쓴 한 연결의 패킷에서 다시 쓸 것을 돌려받는다(53). 틱 스레드에서 Outbox를 비우기 전에 부른다.
        /// </summary>
        public void Recycle(List<Packet> sent)
        {
            _view.Recycle(sent);
        }

        /// <summary>
        /// 연결에서 받은 패킷 하나를 처리한다(입력 차례). 요청을 처리하는 함수가 결과(Outcome)를 돌려주고, 무엇을 보내고 끊을지는 여기서 정한다:
        /// 실패는 ActionFailed, 되돌림은 PositionReset, 잘못된 패킷(세션의 상태에 맞지 않거나 클라이언트가 보낼 수 없는 패킷)은 끊기다.
        /// 받기 전에 빈도 제한의 토큰을 쓰고, 없으면 버리거나(버리는 일이 이어지면) 끊는다. 죽은 동안과 기절한 동안의 요청은 한 자리(Blocked)에서 막는다.
        /// 처리하다 예외가 나면 그 연결만 KICK_REASON_SERVER_ERROR로 끊고 다른 연결의 틱은 이어진다(39).
        /// </summary>
        public void Receive(Session session, Packet packet)
        {
            if (session.IsClosing)
            {
                return;
            }

            try
            {
                ReceiveHook?.Invoke(packet);
                Handle(session, packet);
            }
            catch (Exception exception)
            {
                Fail(session, exception);
            }
        }

        /// <summary>
        /// 시험이 요청의 처리 안에서 예외를 내는 자리(39). 서버에서는 비어 있다.
        /// </summary>
        internal Action<Packet>? ReceiveHook { get; set; }

        /// <summary>
        /// 시험이 입력 밖의 차례에서 예외를 내는 자리(39). 서버에서는 비어 있다.
        /// </summary>
        internal Action? StepHook { get; set; }

        /// <summary>
        /// 요청 하나의 예외(39): 로그를 남기고 그 연결의 캐릭터를 사본 없이 빼며 KICK_REASON_SERVER_ERROR로 끊는다.
        /// </summary>
        private void Fail(Session session, Exception exception)
        {
            Console.Error.WriteLine($"A request from {session.LoginId ?? "(not logged in)"} failed; kicking it: {exception}");
            _login.Fail(session);
        }

        private void Handle(Session session, Packet packet)
        {
            switch (session.Limiter.Take(Tick, _rateLimits))
            {
                case RateLimiter.Verdict.Drop:
                    // 요청 번호가 있는 요청은 버려도 답한다(클라이언트가 그 칸을 계속 기다리지 않게).
                    if ((session.Player is Player dropped) && (RequestIdOf(packet) is uint droppedId))
                    {
                        Respond(dropped, droppedId, FailReason.TooFast);
                    }

                    return;
                case RateLimiter.Verdict.Kick:
                    Kick(session, KickReason.RateLimited);
                    return;
            }

            Player? player = session.Player;
            bool selecting = (session.LoginId != null) && (player == null);
            if ((player != null) && RequestOf(packet.BodyCase) is RequestKind request && (Blocked(player, packet.BodyCase) is var blocked) && (blocked != FailReason.None))
            {
                // 기절한 동안의 AttackStop도 소환수의 대상은 버린다(95).
                if (packet.BodyCase == Packet.BodyOneofCase.AttackStop)
                {
                    SummonSystem.Release(player);
                }

                player.Fail(blocked, request);
                return;
            }

            if ((player != null) && (RequestIdOf(packet) is uint requestId) && (Blocked(player, packet.BodyCase) is var refused) && (refused != FailReason.None))
            {
                Respond(player, requestId, refused);
                return;
            }

            switch (packet.BodyCase)
            {
                case Packet.BodyOneofCase.Login when session.LoginId == null:
                    _login.Login(session, packet.Login);
                    break;
                case Packet.BodyOneofCase.CreateCharacter when selecting:
                    _login.CreateCharacter(session, packet.CreateCharacter);
                    break;
                case Packet.BodyOneofCase.EnterWorld when selecting:
                    _login.EnterWorld(session, packet.EnterWorld);
                    break;
                case Packet.BodyOneofCase.LeaveWorld when player != null:
                    _login.LeaveWorld(session);
                    break;
                // 로그아웃(77)은 죽은 동안과 기절한 동안에도 받는다(Blocked가 막지 않음). 캐릭터를 빼며 사본을 넣고 남은 패킷을 보낸 뒤 닫는다.
                case Packet.BodyOneofCase.Logout when session.LoginId != null:
                    _login.LogOut(session);
                    session.Close();
                    break;
                case Packet.BodyOneofCase.Move when player != null:
                    Answer(player, _movement.Move(player, packet.Move), RequestKind.Unspecified);
                    _progress.Moved(player);
                    break;
                case Packet.BodyOneofCase.UseSkill when player != null:
                    Answer(player, _skills.Use(player, packet.UseSkill, Tick), RequestKind.Skill);
                    break;
                case Packet.BodyOneofCase.Revive when player != null:
                    Answer(player, _deaths.Revive(player), RequestKind.Revive);
                    break;
                case Packet.BodyOneofCase.UseItem when player != null:
                    Respond(player, packet.UseItem.RequestId, _inventory.Use(player, packet.UseItem, Tick));
                    break;
                case Packet.BodyOneofCase.Gather when player != null:
                    Answer(player, Outcome.From(_gather.Start(player, packet.Gather, Tick)), RequestKind.Gather);
                    break;
                case Packet.BodyOneofCase.QuestAccept when player != null:
                    Respond(player, packet.QuestAccept.RequestId, _quests.Accept(player));
                    break;
                case Packet.BodyOneofCase.QuestComplete when player != null:
                    Respond(player, packet.QuestComplete.RequestId, _quests.Complete(player));
                    break;
                case Packet.BodyOneofCase.Craft when player != null:
                    Respond(player, packet.Craft.RequestId, _craft.Start(player, packet.Craft, Tick));
                    break;
                case Packet.BodyOneofCase.PickUp when player != null:
                    Respond(player, packet.PickUp.RequestId, _loot.PickUp(player, packet.PickUp, Tick));
                    break;
                case Packet.BodyOneofCase.DropItem when player != null:
                    Respond(player, packet.DropItem.RequestId, _loot.Drop(player, packet.DropItem, Tick));
                    break;
                case Packet.BodyOneofCase.Equip when player != null:
                    Respond(player, packet.Equip.RequestId, _inventory.Equip(player, packet.Equip));
                    break;
                case Packet.BodyOneofCase.Unequip when player != null:
                    Respond(player, packet.Unequip.RequestId, _inventory.Unequip(player, packet.Unequip));
                    break;
                case Packet.BodyOneofCase.Enchant when player != null:
                    Respond(player, packet.Enchant.RequestId, _inventory.Enchant(player, packet.Enchant));
                    break;
                // 퀵슬롯은 화면의 배치라 죽은 동안과 기절한 동안에도 바꾼다(Blocked가 막지 않음).
                case Packet.BodyOneofCase.SetQuickslot when player != null:
                    Answer(player, _quickslots.Set(player, packet.SetQuickslot), RequestKind.Quickslot);
                    break;
                case Packet.BodyOneofCase.Buy when player != null:
                    Respond(player, packet.Buy.RequestId, _shop.Buy(player, packet.Buy));
                    break;
                case Packet.BodyOneofCase.Sell when player != null:
                    Respond(player, packet.Sell.RequestId, _shop.Sell(player, packet.Sell));
                    break;
                case Packet.BodyOneofCase.StorageOpen when player != null:
                    Answer(player, _storage.Open(player), RequestKind.Storage);
                    break;
                case Packet.BodyOneofCase.StorageDeposit when player != null:
                    Respond(player, packet.StorageDeposit.RequestId, _storage.Deposit(player, packet.StorageDeposit));
                    break;
                case Packet.BodyOneofCase.StorageWithdraw when player != null:
                    Respond(player, packet.StorageWithdraw.RequestId, _storage.Withdraw(player, packet.StorageWithdraw));
                    break;
                case Packet.BodyOneofCase.AttackStart when player != null:
                    Answer(player, _combat.Start(player, packet.AttackStart), RequestKind.Attack);
                    break;
                // 개발 명령은 죽은 동안과 기절한 동안에도 실행한다(Blocked가 막지 않음). --dev가 아니면 끊지 않고 실패로 답한다.
                case Packet.BodyOneofCase.DevCommand when player != null:
                    Answer(player, _dev?.Run(player, packet.DevCommand.Line) ?? Outcome.Fail(FailReason.InvalidCommand), RequestKind.Chat);
                    break;
                // 채팅(41)은 죽은 동안과 기절한 동안에도 받는다(Blocked가 막지 않음).
                case Packet.BodyOneofCase.Chat when player != null:
                    Answer(player, _chat.Send(player, packet.Chat, Tick), RequestKind.Chat);
                    break;
                case Packet.BodyOneofCase.PartyInvite when player != null:
                    Answer(player, Outcome.From(_party.Invite(player, packet.PartyInvite.TargetId, Tick)), RequestKind.Party);
                    break;
                case Packet.BodyOneofCase.PartyAnswer when player != null:
                    Answer(player, Outcome.From(_party.Answer(player, packet.PartyAnswer.Accept)), RequestKind.Party);
                    break;
                case Packet.BodyOneofCase.PartyLeave when player != null:
                    Answer(player, Outcome.From(_party.Leave(player)), RequestKind.Party);
                    break;
                case Packet.BodyOneofCase.PartyKick when player != null:
                    Answer(player, Outcome.From(_party.Kick(player, packet.PartyKick.TargetId)), RequestKind.Party);
                    break;
                case Packet.BodyOneofCase.SetPetOut when player != null:
                    // 펫 부르기와 넣기(96). 가진 펫이 없으면 실패, 그대로면 아무것도 하지 않는다.
                    if (player.PetId == 0)
                    {
                        player.Fail(FailReason.NoPet, RequestKind.Pet);
                    }
                    else if (player.SetPet(player.PetId, packet.SetPetOut.Out))
                    {
                        player.DirtyFast = true;
                        player.SendPet();
                    }

                    break;
                case Packet.BodyOneofCase.AttackStop when player != null:
                    _combat.Stop(player);
                    break;
                case Packet.BodyOneofCase.Ping:
                    session.Send(new Packet { Pong = new Pong { Tick = Tick } });
                    break;
                default:
                    Kick(session, KickReason.MalformedPacket);
                    break;
            }
        }

        /// <summary>
        /// 요청 번호가 없는 요청(ActionFailed로 답함)의 종류. 그 밖의 패킷은 null이다.
        /// </summary>
        private static RequestKind? RequestOf(Packet.BodyOneofCase body)
        {
            return body switch
            {
                Packet.BodyOneofCase.AttackStart => RequestKind.Attack,
                Packet.BodyOneofCase.UseSkill => RequestKind.Skill,
                Packet.BodyOneofCase.Revive => RequestKind.Revive,
                Packet.BodyOneofCase.StorageOpen => RequestKind.Storage,
                Packet.BodyOneofCase.Gather => RequestKind.Gather,
                Packet.BodyOneofCase.PartyInvite or Packet.BodyOneofCase.PartyAnswer or Packet.BodyOneofCase.PartyLeave or Packet.BodyOneofCase.PartyKick => RequestKind.Party,
                _ => null,
            };
        }

        /// <summary>
        /// 요청 번호가 있는 요청(RequestResult로 답함)의 번호. 그 밖의 패킷은 null이다. 인벤토리를 바꾸는 요청은 그 항목이 더한다.
        /// </summary>
        private static uint? RequestIdOf(Packet packet)
        {
            return packet.BodyCase switch
            {
                Packet.BodyOneofCase.UseItem => packet.UseItem.RequestId,
                Packet.BodyOneofCase.PickUp => packet.PickUp.RequestId,
                Packet.BodyOneofCase.DropItem => packet.DropItem.RequestId,
                Packet.BodyOneofCase.Equip => packet.Equip.RequestId,
                Packet.BodyOneofCase.Unequip => packet.Unequip.RequestId,
                Packet.BodyOneofCase.Enchant => packet.Enchant.RequestId,
                Packet.BodyOneofCase.Buy => packet.Buy.RequestId,
                Packet.BodyOneofCase.Sell => packet.Sell.RequestId,
                Packet.BodyOneofCase.StorageDeposit => packet.StorageDeposit.RequestId,
                Packet.BodyOneofCase.StorageWithdraw => packet.StorageWithdraw.RequestId,
                Packet.BodyOneofCase.Craft => packet.Craft.RequestId,
                Packet.BodyOneofCase.QuestAccept => packet.QuestAccept.RequestId,
                Packet.BodyOneofCase.QuestComplete => packet.QuestComplete.RequestId,
                _ => null,
            };
        }

        /// <summary>
        /// 요청 번호가 있는 요청의 답: 받은 번호를 그대로 싣고, 성공이면 NONE이다. 번호의 순서는 보지 않는다.
        /// </summary>
        private static void Respond(Player player, uint requestId, FailReason result)
        {
            player.Session.Send(new Packet { RequestResult = new RequestResult { RequestId = requestId, Result = result } });
        }

        /// <summary>
        /// 죽은 동안과 기절한 동안 막는 요청의 이유. 둘 다 연결 확인, 나가기, 공격 멈춤(그만두는 것이라 받음), 개발 명령, 채팅, 퀵슬롯을 받고, 죽은 동안에는 부활도 받는다.
        /// Move는 MovementSystem이 되돌린다. 막지 않으면 None이다.
        /// </summary>
        private static FailReason Blocked(Player player, Packet.BodyOneofCase body)
        {
            if (player.Dead)
            {
                return body == Packet.BodyOneofCase.Revive ? FailReason.None : FailReason.Dead;
            }

            return player.Stunned ? FailReason.Stunned : FailReason.None;
        }

        /// <summary>
        /// 요청의 결과를 보낸다: 실패는 ActionFailed(요청의 종류와 함께), 되돌림은 PositionReset, 잘못된 패킷은 끊기다.
        /// </summary>
        private void Answer(Player player, Outcome outcome, RequestKind request)
        {
            switch (outcome.Kind)
            {
                case Outcome.Kinds.Failed:
                    player.Fail(outcome.Reason, request);
                    break;
                case Outcome.Kinds.Reset:
                    _movement.Reset(player);
                    break;
                case Outcome.Kinds.Malformed:
                    Kick(player.Session, KickReason.MalformedPacket);
                    break;
            }
        }

        /// <summary>
        /// Kicked를 보내고 연결을 끊는다. 개체는 월드에서 빠지고 계정은 로그아웃한다.
        /// </summary>
        public void Kick(Session session, KickReason reason)
        {
            _login.Kick(session, reason);
        }

        /// <summary>
        /// 연결이 끊겼다. 개체는 월드에서 빠지고, 주변 플레이어는 다음 Step에서 EntitiesLeave를 받는다.
        /// </summary>
        public void Disconnect(Session session)
        {
            session.Close();
            _login.LogOut(session);
        }

        /// <summary>
        /// 입력 뒤의 차례를 돌려 틱 하나를 끝낸다. elapsedTicks는 다음 틱까지 지날 틱 수다(보통 1, 틱이 밀리면 더 큼. backlog 79).
        /// 지난 틱 수만큼 진행하는 계산(이동 거리)은 그만큼 진행하고, 주기로 하는 일(저장)은 밀려도 한 번만 한다.
        /// profile이 있으면 차례마다 든 시간을 넘긴다(이동 거리 채우기는 다음 입력의 일이라 입력에 넣음).
        /// </summary>
        public void Step(uint elapsedTicks = 1, TickProfile? profile = null)
        {
            long started = Stopwatch.GetTimestamp();
            // 저장 스레드에서 돌아온 결과(목록, 만들기, 캐릭터 읽기)를 입력 차례에 반영한다(38). 반영하다 난 예외는 그 일을 부른 연결만 끊는다(39).
            _queue.CompleteFinished(OnJobFailed);
            StepHook?.Invoke();
            _growth.Rewarded.Clear();
            _scheduler.Step(Tick, this);
            long scheduled = Stopwatch.GetTimestamp();
            _ai.Step(Tick, elapsedTicks);
            long monsters = Stopwatch.GetTimestamp();
            _combat.Step(Tick);
            // 몬스터의 경험치를 받은 플레이어의 성향을 올린다(44).
            foreach ((Monster _, Player rewarded) in _growth.Rewarded)
            {
                _pk.Rewarded(rewarded);
            }

            _quests.Killed(_growth.Rewarded);

            long combat = Stopwatch.GetTimestamp();
            _vitals.Step(Tick);
            _loot.PetStep(_entities.Players, Tick);
            long vitals = Stopwatch.GetTimestamp();
            _view.Step(Tick);
            _inventory.Flush(_entities.Players);
            _quickslots.Flush(_entities.Players);
            _party.Step(Tick);
            // 사건은 같은 틱의 들어옴·나감·움직임 뒤에 간다.
            _events.Deliver();
            long viewed = Stopwatch.GetTimestamp();
            _movement.Step(elapsedTicks);
            Tick += elapsedTicks;
            long filled = Stopwatch.GetTimestamp();

            // 저장 주기는 다음 틱 번호로 센다. Tick이 간격의 배수가 되는 Step에서 저장한다.
            _save.Step(Tick);
            long saved = Stopwatch.GetTimestamp();

            profile?.Add(TickPhase.Scheduled, scheduled - started);
            profile?.Add(TickPhase.Monsters, monsters - scheduled);
            profile?.Add(TickPhase.Combat, combat - monsters);
            profile?.Add(TickPhase.Vitals, vitals - combat);
            profile?.Add(TickPhase.View, viewed - vitals);
            profile?.Add(TickPhase.Input, filled - viewed);
            profile?.Add(TickPhase.Save, saved - filled);
        }

        /// <summary>
        /// 놓인 점(몬스터와 채집물의 자리) 하나의 개체 번호. 서버가 뜰 때 플레이어보다 먼저 받고, 그 자리의 개체가 다시 나올 때도 쓴다.
        /// </summary>
        public uint ReservePlacedId()
        {
            return _entities.ReservePlacedId();
        }

        /// <summary>
        /// 새 바닥 아이템의 개체 번호. 사라진 지 10초가 지난 번호를 다시 쓴다.
        /// </summary>
        public uint NextGroundItemId()
        {
            return _entities.NextGroundItemId(Tick);
        }

        /// <summary>
        /// 플레이어가 아닌 개체를 월드에 넣는다. 다음 시야 차례에 둘레의 플레이어가 EntitiesEnter로 받는다.
        /// 플레이어는 LoginSystem이 연결과 함께 넣고 뺀다.
        /// </summary>
        public void AddEntity(Entity entity)
        {
            if (entity is Player)
            {
                throw new ArgumentException("Players enter the world through EnterWorld.", nameof(entity));
            }

            _entities.Add(entity);
            _grid.Add(entity);
        }

        /// <summary>
        /// 플레이어가 아닌 개체를 월드에서 뺀다. 다음 시야 차례에 받은 플레이어가 EntitiesLeave로 받는다.
        /// </summary>
        public void RemoveEntity(Entity entity)
        {
            if (entity is Player)
            {
                throw new ArgumentException("Players leave the world through LeaveWorld or a disconnect.", nameof(entity));
            }

            _entities.Remove(entity);
            _grid.Remove(entity);
            if (entity.Kind == EntityKind.GroundItem)
            {
                _entities.FreeGroundItemId(entity.Id, Tick);
            }
        }

        // 예약한 일의 종류마다의 갈래(주인 찾기와 세대 번호 비교, 전투 차례인지, 실행)는 예약을 넣는 항목이 더한다.
        bool IScheduledRunner.IsCurrent(in ScheduledJob job)
        {
            return job.Kind switch
            {
                ScheduledKind.UnreachableEnd => _ai.IsUnreachableCurrent(job),
                ScheduledKind.Strike or ScheduledKind.SkillStart or ScheduledKind.SkillHit => _combat.IsStrikeCurrent(job),
                ScheduledKind.CastEnd or ScheduledKind.ProgressEnd => _progress.IsCurrent(job),
                ScheduledKind.EffectEnd => _effects.IsEndCurrent(job),
                ScheduledKind.Despawn => _deaths.IsDespawnCurrent(job),
                ScheduledKind.GroundItemExpire => _loot.IsExpireCurrent(job),
                ScheduledKind.PartyInviteExpire => _party.IsInviteCurrent(job),
                ScheduledKind.AreaHit => _bosses.IsAreaCurrent(job),
                ScheduledKind.AggressorEnd => PkSystem.IsAggressorEndCurrent(_entities, job),
                ScheduledKind.LingerEnd => _lingering.IsEndCurrent(job),
                ScheduledKind.SummonEnd => _summons.IsEndCurrent(job),
                ScheduledKind.Respawn => _spawn.PlacedAt(job.Owner) != null,
                ScheduledKind.GatherRespawn => _gather.IsRespawnCurrent(job),
                _ => throw UnknownKind(job.Kind),
            };
        }

        bool IScheduledRunner.ForCombat(ScheduledKind kind)
        {
            return kind switch
            {
                ScheduledKind.UnreachableEnd => false,
                ScheduledKind.Strike or ScheduledKind.SkillStart or ScheduledKind.SkillHit or ScheduledKind.CastEnd or ScheduledKind.AreaHit => true,
                ScheduledKind.Despawn or ScheduledKind.Respawn or ScheduledKind.ProgressEnd or ScheduledKind.EffectEnd or ScheduledKind.GroundItemExpire
                    or ScheduledKind.PartyInviteExpire or ScheduledKind.AggressorEnd or ScheduledKind.LingerEnd or ScheduledKind.SummonEnd or ScheduledKind.GatherRespawn => false,
                _ => throw UnknownKind(kind),
            };
        }

        void IScheduledRunner.Run(in ScheduledJob job)
        {
            switch (job.Kind)
            {
                case ScheduledKind.UnreachableEnd:
                    _ai.EndUnreachable(job);
                    break;
                case ScheduledKind.Despawn:
                    _spawn.Despawn((Monster)_entities.Find(job.Owner)!);
                    break;
                case ScheduledKind.Respawn:
                    _spawn.Respawn(_spawn.PlacedAt(job.Owner)!);
                    break;
                case ScheduledKind.ProgressEnd when _entities.Find(job.Owner) is Player { Progress.Kind: ProgressKind.Recall } recalling:
                    _inventory.FinishRecall(recalling, Tick);
                    break;
                case ScheduledKind.ProgressEnd when _entities.Find(job.Owner) is Player { Progress.Kind: ProgressKind.Gather } gathering:
                    _gather.Finish(gathering, Tick);
                    break;
                case ScheduledKind.ProgressEnd when _entities.Find(job.Owner) is Player { Progress.Kind: ProgressKind.Craft } crafting:
                    _craft.Finish(crafting);
                    break;
                case ScheduledKind.GatherRespawn:
                    _gather.Respawn(job);
                    break;
                case ScheduledKind.ProgressEnd:
                    _progress.End(job);
                    break;
                case ScheduledKind.EffectEnd:
                    _effects.End(job);
                    break;
                case ScheduledKind.GroundItemExpire:
                    _loot.Expire(job, Tick);
                    break;
                case ScheduledKind.PartyInviteExpire:
                    _party.ExpireInvite(job);
                    break;
                case ScheduledKind.AggressorEnd:
                    _pk.EndAggressor((Player)_entities.Find(job.Owner)!);
                    break;
                case ScheduledKind.LingerEnd:
                    _lingering.End(job, Tick);
                    break;
                case ScheduledKind.SummonEnd:
                    _summons.End(job, Tick);
                    break;
                default:
                    throw UnknownKind(job.Kind);
            }
        }

        private static InvalidOperationException UnknownKind(ScheduledKind kind)
        {
            return new InvalidOperationException($"Unknown scheduled kind {kind}.");
        }

        /// <summary>
        /// 내려갈 때(39): 접속한 모두의 사본을 한 묶음으로 넣고 큐를 다 쓸 때까지 한도(기본 10초)만큼 기다린다. 넘으면 쓰지 못한 묶음의 수를 로그에 남기고 false다.
        /// </summary>
        public bool SaveAll(TimeSpan? limit = null)
        {
            _save.SaveAll();
            return WaitForSaves(limit ?? ShutdownSaveLimit);
        }

        /// <summary>
        /// 내려갈 때 저장 스레드의 큐를 기다리는 한도. 유닛의 TimeoutStopSec(30초)보다 짧다.
        /// </summary>
        public static readonly TimeSpan ShutdownSaveLimit = TimeSpan.FromSeconds(10);

        /// <summary>
        /// 새 사본을 넣지 않고 이미 큐에 든 일만 한도 안에서 마저 쓴다(틱의 예외 뒤. 39). 넘으면 쓰지 못한 묶음의 수를 로그에 남기고 false다.
        /// </summary>
        public bool WaitForSaves(TimeSpan limit)
        {
            if (_queue.WaitIdle(limit))
            {
                return true;
            }

            Console.Error.WriteLine($"Stopping with {_queue.PendingWrites} save batch(es) not written after {limit.TotalSeconds:0} s.");
            return false;
        }

        /// <summary>
        /// 저장 스레드의 쓰기가 실패했다(39). 서버는 새 사본을 만들지 않고 끝난다.
        /// </summary>
        public bool SaveFailed => _queue.WriteFailed;

        private void OnJobFailed(StoreJob job, Exception exception)
        {
            if (job.Owner is Session session)
            {
                Fail(session, exception);
            }
            else
            {
                Console.Error.WriteLine($"Completing {job.GetType().Name} failed: {exception}");
            }
        }

        /// <summary>
        /// 저장 스레드의 큐가 빌 때까지 기다리고 돌아온 결과를 지금 반영한다(시험이 목록·만들기·들어오기의 답을 틱 없이 받음).
        /// </summary>
        internal void CompleteSaves()
        {
            _queue.WaitIdle(TimeSpan.FromSeconds(10));
            _queue.CompleteFinished(OnJobFailed);
        }

        /// <summary>
        /// 10초 통계의 저장 스레드 줄: 끝난 일의 수, 평균과 가장 긴 시간, 큐의 가장 긴 길이, 체크포인트(57)의 수와 평균·가장 긴 시간과 옮긴 쪽 수, 남은 일.
        /// </summary>
        public string SaveReport()
        {
            SaveStats stats = _queue.TakeStats();
            return $"save: {stats.Jobs} jobs, avg {(stats.Jobs == 0 ? 0 : stats.Total.TotalMilliseconds / stats.Jobs):F2} ms max {stats.Max.TotalMilliseconds:F2} ms, "
                + $"queue max {stats.MaxPending}, checkpoint {stats.Checkpoints} avg {(stats.Checkpoints == 0 ? 0 : stats.CheckpointTotal.TotalMilliseconds / stats.Checkpoints):F2} ms "
                + $"max {stats.CheckpointMax.TotalMilliseconds:F2} ms {stats.CheckpointPages} pages, pending {_queue.Pending}";
        }

        /// <summary>
        /// 저장 스레드의 큐(시험이 늦추거나 묶음의 시간을 봄).
        /// </summary>
        internal SaveQueue Saves => _queue;
    }
}
