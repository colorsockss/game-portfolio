using System;
using System.Collections.Generic;
using System.Diagnostics;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드의 데이터(EntityTable, Grid)와 시스템을 묶고, 틱을 정해진 차례로 돌린다. 틱 스레드 하나만 부르므로 확인과 쓰기가 늘 한 동기 구간에 있다.
    /// 차례: 1. 입력(Receive. GameServer가 큐를 비우며 부름) → 2. 예약한 일 → 3. 몬스터 → 4. 전투 → 5. 회복과 효과 → 6. 시야 → 7. 저장 → 8. 보내기(GameServer).
    /// 차례마다의 시스템은 아래의 Step에 있다. 입력의 요청은 자기 플레이어의 상태만 고치고, 남을 고치는 결과는 전투 차례로 넘긴다.
    /// </summary>
    public sealed class World : IScheduledRunner
    {
        /// <summary>
        /// 움직인 플레이어의 위치를 저장하는 간격(틱, 60초). 서버가 죽으면 이만큼의 이동을 잃는다. 나간 플레이어는 그 틱에 저장한다.
        /// </summary>
        public const uint SaveIntervalTicks = 60 * Units.TicksPerSecond;

        private readonly EntityTable _entities = new EntityTable();
        private readonly Grid _grid = new Grid();
        private readonly LoginSystem _login;
        private readonly MovementSystem _movement;
        private readonly ViewSystem _view;
        private readonly SaveSystem _save;
        private readonly Scheduler _scheduler = new Scheduler();
        private readonly VitalsSystem _vitals;
        private readonly AiSystem _ai;
        private readonly CombatSystem _combat;
        private readonly TickEvents _events;
        private readonly SpawnSystem _spawn;
        private readonly DeathSystem _deaths;
        private readonly GrowthSystem _growth;
        private readonly ProgressSystem _progress;
        private readonly EffectSystem _effects;
        private readonly SkillSystem _skills;
        private readonly ProjectileSystem _projectiles;
        private readonly RateLimiter.Limits _rateLimits;
        private readonly DevSystem? _dev;

        /// <summary>
        /// 빈 월드를 만든다. dev면 개발 명령(DevCommand)을 실행한다(서버의 --dev).
        /// </summary>
        public World(int maxPlayers, int spawnHalfExtent, Random random, CharacterStore store, GameData data, bool dev = false)
        {
            _save = new SaveSystem(store, _entities, SaveIntervalTicks);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            var stats = new StatSystem(data, random);
            _login = new LoginSystem(maxPlayers, spawnHalfExtent, random, store, data, field, _entities, _grid, _save, stats);
            _vitals = new VitalsSystem(_entities, data);
            _ai = new AiSystem(_entities, _grid, field, _scheduler, data, random);
            _events = new TickEvents(_grid);
            _progress = new ProgressSystem(_entities, _scheduler, _events);
            _effects = new EffectSystem(_entities, _scheduler, _events, stats, _progress, data);
            _combat = new CombatSystem(_entities, field, _scheduler, stats, data, _events, _progress);
            _projectiles = new ProjectileSystem(_entities, _grid, field, data, _events, _combat, _effects);
            _skills = new SkillSystem(_entities, _grid, field, _scheduler, data, _events, _combat, _effects, _progress, _projectiles);
            _combat.Skills = _skills;
            _combat.Projectiles = _projectiles;
            // 놓인 점의 번호는 플레이어보다 먼저 받는다.
            _spawn = new SpawnSystem(data, field, _entities, _grid, _ai, _scheduler, random);
            _spawn.PlaceAll();
            _movement = new MovementSystem(_entities, _grid, field);
            _growth = new GrowthSystem(_entities, stats, data);
            _deaths = new DeathSystem(_entities, _grid, _scheduler, _movement, _events, _effects, _progress, _growth, data);
            _combat.Deaths = _deaths;
            _view = new ViewSystem(_entities, _grid);
            _rateLimits = RateLimiter.Limits.From(data.Constants);
            _dev = dev ? new DevSystem(data, field, _entities, _grid, _movement, _progress, _spawn, _growth) : null;
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
        /// 연결에서 받은 패킷 하나를 처리한다(입력 차례). 요청을 처리하는 함수가 결과(Outcome)를 돌려주고, 무엇을 보내고 끊을지는 여기서 정한다:
        /// 실패는 ActionFailed, 되돌림은 PositionReset, 잘못된 패킷(세션의 상태에 맞지 않거나 클라이언트가 보낼 수 없는 패킷)은 끊기다.
        /// 받기 전에 빈도 제한의 토큰을 쓰고, 없으면 버리거나(버리는 일이 이어지면) 끊는다. 죽은 동안과 기절한 동안의 요청은 한 자리(Blocked)에서 막는다.
        /// </summary>
        public void Receive(Session session, Packet packet)
        {
            if (session.IsClosing)
            {
                return;
            }

            switch (session.Limiter.Take(Tick, _rateLimits))
            {
                case RateLimiter.Verdict.Drop:
                    return;
                case RateLimiter.Verdict.Kick:
                    Kick(session, KickReason.RateLimited);
                    return;
            }

            Player? player = session.Player;
            bool selecting = (session.LoginId != null) && (player == null);
            if ((player != null) && RequestOf(packet.BodyCase) is RequestKind request && (Blocked(player, packet.BodyCase) is var blocked) && (blocked != FailReason.None))
            {
                player.Fail(blocked, request);
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
                    _login.EnterWorld(session, packet.EnterWorld, Tick);
                    break;
                case Packet.BodyOneofCase.LeaveWorld when player != null:
                    _login.LeaveWorld(session);
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
                case Packet.BodyOneofCase.AttackStart when player != null:
                    Answer(player, _combat.Start(player, packet.AttackStart), RequestKind.Attack);
                    break;
                // 개발 명령은 죽은 동안과 기절한 동안에도 실행한다(Blocked가 막지 않음). --dev가 아니면 끊지 않고 실패로 답한다.
                case Packet.BodyOneofCase.DevCommand when player != null:
                    Answer(player, _dev?.Run(player, packet.DevCommand.Line) ?? Outcome.Fail(FailReason.InvalidCommand), RequestKind.Chat);
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
                _ => null,
            };
        }

        /// <summary>
        /// 죽은 동안과 기절한 동안 막는 요청의 이유. 둘 다 연결 확인, 나가기, 공격 멈춤(그만두는 것이라 받음), 개발 명령을 받고, 죽은 동안에는 부활도 받는다.
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
            _growth.Rewarded.Clear();
            _scheduler.Step(Tick, this);
            long scheduled = Stopwatch.GetTimestamp();
            _ai.Step(Tick, elapsedTicks);
            long monsters = Stopwatch.GetTimestamp();
            _combat.Step(Tick);
            long combat = Stopwatch.GetTimestamp();
            _vitals.Step(Tick);
            long vitals = Stopwatch.GetTimestamp();
            _view.Step(Tick);
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
                ScheduledKind.Respawn => _spawn.PlacedAt(job.Owner) != null,
                _ => throw UnknownKind(job.Kind),
            };
        }

        bool IScheduledRunner.ForCombat(ScheduledKind kind)
        {
            return kind switch
            {
                ScheduledKind.UnreachableEnd => false,
                ScheduledKind.Strike or ScheduledKind.SkillStart or ScheduledKind.SkillHit or ScheduledKind.CastEnd => true,
                ScheduledKind.Despawn or ScheduledKind.Respawn or ScheduledKind.ProgressEnd or ScheduledKind.EffectEnd => false,
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
                case ScheduledKind.ProgressEnd:
                    _progress.End(job);
                    break;
                case ScheduledKind.EffectEnd:
                    _effects.End(job);
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
        /// 나간 플레이어와 움직인 플레이어의 위치를 지금 저장한다. 서버가 내려갈 때 부른다.
        /// </summary>
        public void SaveAll()
        {
            _save.SaveAll();
        }
    }
}
