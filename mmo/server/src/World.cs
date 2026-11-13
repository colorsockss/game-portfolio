using System;
using System.Diagnostics;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드의 데이터(EntityTable, Grid)와 시스템을 묶고, 틱을 정해진 차례로 돌린다. 틱 스레드 하나만 부르므로 확인과 쓰기가 늘 한 동기 구간에 있다.
    /// 차례: 1. 입력(Receive. GameServer가 큐를 비우며 부름) → 2. 예약한 일 → 3. 몬스터 → 4. 전투 → 5. 회복과 효과 → 6. 시야 → 7. 저장 → 8. 보내기(GameServer).
    /// 2–5는 그 기능이 생길 때 Step에 더한다. 입력의 요청은 자기 플레이어의 상태만 고치고, 남을 고치는 결과는 전투 차례로 넘긴다.
    /// </summary>
    public sealed class World
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

        /// <summary>
        /// 빈 월드를 만든다.
        /// </summary>
        public World(int maxPlayers, int spawnHalfExtent, Random random, CharacterStore store, GameData data)
        {
            _save = new SaveSystem(store, _entities, SaveIntervalTicks);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            _login = new LoginSystem(maxPlayers, spawnHalfExtent, random, store, data, field, _entities, _grid, _save);
            _movement = new MovementSystem(_entities, _grid, field);
            _view = new ViewSystem(_entities, _grid);
        }

        /// <summary>
        /// 지금 계산하는 틱 번호. Step이 끝날 때 지난 틱 수만큼 오른다.
        /// </summary>
        public uint Tick { get; private set; }

        /// <summary>
        /// 월드에 들어온 플레이어 수.
        /// </summary>
        public int PlayerCount => _entities.PlayerCount;

        /// <summary>
        /// 지난 Step에서 플레이어 하나에게 보인 개체 수의 평균. 부하 측정에 쓴다.
        /// </summary>
        public double AverageVisible => _view.AverageVisible;

        /// <summary>
        /// 연결에서 받은 패킷 하나를 처리한다(입력 차례). 세션의 상태에 맞지 않거나 클라이언트가 보낼 수 없는 패킷이면 끊는다.
        /// </summary>
        public void Receive(Session session, Packet packet)
        {
            if (session.IsClosing)
            {
                return;
            }

            Player? player = session.Player;
            bool selecting = (session.LoginId != null) && (player == null);
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
                    if (!_movement.Move(player, packet.Move))
                    {
                        Kick(session, KickReason.MalformedPacket);
                    }

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
            _view.Step(Tick);
            long viewed = Stopwatch.GetTimestamp();
            _movement.Step(elapsedTicks);
            Tick += elapsedTicks;
            long filled = Stopwatch.GetTimestamp();

            // 저장 주기는 다음 틱 번호로 센다. Tick이 간격의 배수가 되는 Step에서 저장한다.
            _save.Step(Tick);
            long saved = Stopwatch.GetTimestamp();

            profile?.Add(TickPhase.View, viewed - started);
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

        /// <summary>
        /// 나간 플레이어와 움직인 플레이어의 위치를 지금 저장한다. 서버가 내려갈 때 부른다.
        /// </summary>
        public void SaveAll()
        {
            _save.SaveAll();
        }
    }
}
