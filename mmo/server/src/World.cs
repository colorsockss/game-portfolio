using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 로그인한 플레이어, 이동 검증, 시야. 틱 스레드 하나만 부르므로 확인과 쓰기가 늘 한 동기 구간에 있다.
    /// </summary>
    public sealed partial class World
    {
        /// <summary>
        /// 최대 이동 속도(m/s).
        /// shortcut: 상수다. 데이터(backlog 4)가 생기면 데이터에서 읽고 클라이언트 예측과 함께 쓴다.
        /// </summary>
        public const double MaxSpeedMetersPerSecond = 6;

        /// <summary>
        /// 틱마다 차오르는 이동 거리(칸). 클라이언트 시계가 조금 빨라도 거절하지 않게 10% 여유를 둔다.
        /// </summary>
        private const double BudgetPerTick = MaxSpeedMetersPerSecond * 1.1 * Units.PerMeter / Units.TicksPerSecond;

        /// <summary>
        /// 쌓아 둘 수 있는 이동 거리(칸). TCP가 1초까지 몰아서 전한 Move를 받아 준다.
        /// </summary>
        private const double MaxBudget = BudgetPerTick * Units.TicksPerSecond;

        /// <summary>
        /// 시야 칸 한 변의 크기를 2의 지수로 적은 것. 2^10칸 = 32 m이고, 둘레 3×3칸(96 m 사방)이 보인다.
        /// </summary>
        private const int CellShift = 10;

        /// <summary>
        /// 동시 접속 상한.
        /// </summary>
        private readonly int _maxPlayers;

        /// <summary>
        /// 처음 들어온 플레이어를 놓을 정사각형의 반 너비(칸). 원점이 가운데다.
        /// shortcut: 저장(backlog 6)이 없어 마지막 위치 대신 쓴다. 저장이 생기면 저장한 위치에서 시작한다.
        /// </summary>
        private readonly int _spawnHalfExtent;

        /// <summary>
        /// 시작 위치를 고르는 난수.
        /// </summary>
        private readonly Random _random;

        /// <summary>
        /// 로그인한 플레이어. 로그인 ID가 키다.
        /// </summary>
        private readonly Dictionary<string, Player> _players = new Dictionary<string, Player>();

        /// <summary>
        /// 시야 칸마다 그 안의 플레이어.
        /// </summary>
        private readonly Dictionary<long, List<Player>> _cells = new Dictionary<long, List<Player>>();

        /// <summary>
        /// 다음 개체 번호. 0은 "없음"이라 1부터 쓴다.
        /// </summary>
        private uint _nextId = 1;

        /// <summary>
        /// 빈 월드를 만든다.
        /// </summary>
        public World(int maxPlayers, int spawnHalfExtent, Random random)
        {
            _maxPlayers = maxPlayers;
            _spawnHalfExtent = spawnHalfExtent;
            _random = random;
        }

        /// <summary>
        /// 지금 계산하는 틱 번호. Step이 끝날 때 1 오른다.
        /// </summary>
        public uint Tick { get; private set; }

        /// <summary>
        /// 로그인한 플레이어 수.
        /// </summary>
        public int PlayerCount => _players.Count;

        /// <summary>
        /// 지난 Step에서 플레이어 하나에게 보인 개체 수의 평균. 부하 측정에 쓴다.
        /// </summary>
        public double AverageVisible
        {
            get
            {
                long total = 0;
                foreach (Player player in _players.Values)
                {
                    total += player.Visible.Count;
                }

                return _players.Count == 0 ? 0 : (double)total / _players.Count;
            }
        }

        /// <summary>
        /// 연결에서 받은 패킷 하나를 처리한다. 순서가 맞지 않거나 클라이언트가 보낼 수 없는 패킷이면 끊는다.
        /// </summary>
        public void Receive(Session session, Packet packet)
        {
            if (session.IsClosing)
            {
                return;
            }

            Player? player = session.Player;
            switch (packet.BodyCase)
            {
                case Packet.BodyOneofCase.Login when player == null:
                    Login(session, packet.Login);
                    break;
                case Packet.BodyOneofCase.Move when player != null:
                    Move(player, packet.Move);
                    break;
                default:
                    Kick(session, KickReason.MalformedPacket);
                    break;
            }
        }

        /// <summary>
        /// Kicked를 보내고 연결을 끊는다. 개체는 월드에서 빠진다.
        /// </summary>
        public void Kick(Session session, KickReason reason)
        {
            if (!session.IsClosing)
            {
                session.Send(new Packet { Kicked = new Kicked { Reason = reason } });
                session.Close();
            }

            Remove(session);
        }

        /// <summary>
        /// 연결이 끊겼다. 개체는 월드에서 빠지고, 주변 플레이어는 다음 Step에서 EntitiesLeave를 받는다.
        /// </summary>
        public void Disconnect(Session session)
        {
            session.Close();
            Remove(session);
        }

        /// <summary>
        /// 틱 하나를 끝낸다. 플레이어마다 시야가 바뀐 것과 움직인 개체를 보내고, 이동 거리를 채운다.
        /// </summary>
        public void Step()
        {
            foreach (Player observer in _players.Values)
            {
                SendView(observer);
            }

            foreach (Player player in _players.Values)
            {
                player.Moved = false;
                player.MoveMessage = null;
                player.MoveBudget = Math.Min(player.MoveBudget + BudgetPerTick, MaxBudget);
            }

            Tick++;
        }

        /// <summary>
        /// 로그인 ID의 형식. 영문 소문자, 숫자, 밑줄 4–16자(\z는 끝의 줄바꿈도 막는다).
        /// </summary>
        [GeneratedRegex(@"^[a-z0-9_]{4,16}\z")]
        private static partial Regex LoginIdPattern();

        /// <summary>
        /// 로그인을 처리한다. 실패하면 LoginResult를 보내고 끊는다. 같은 ID가 이미 있으면 예전 연결을 끊고 그 자리에서 이어 간다.
        /// </summary>
        private void Login(Session session, Login login)
        {
            _players.TryGetValue(login.LoginId, out Player? previous);
            LoginResultCode result = login.ProtocolVersion != ProtocolVersion.Current ? LoginResultCode.VersionMismatch
                : !LoginIdPattern().IsMatch(login.LoginId) ? LoginResultCode.InvalidLoginId
                : (previous == null && _players.Count >= _maxPlayers) ? LoginResultCode.ServerFull
                : LoginResultCode.Ok;
            if (result != LoginResultCode.Ok)
            {
                session.Send(new Packet { LoginResult = new LoginResult { Result = result } });
                session.Close();
                return;
            }

            Player player;
            if (previous != null)
            {
                player = new Player(_nextId++, login.LoginId, session, previous.X, previous.Z, previous.Yaw);
                // 새 개체를 넣기 전에 빼야 같은 키의 새 개체가 지워지지 않는다.
                Kick(previous.Session, KickReason.DuplicateLogin);
            }
            else
            {
                int x = _random.Next(-_spawnHalfExtent, _spawnHalfExtent + 1);
                int z = _random.Next(-_spawnHalfExtent, _spawnHalfExtent + 1);
                player = new Player(_nextId++, login.LoginId, session, x, z, 0);
            }

            _players.Add(player.LoginId, player);
            player.Cell = CellOf(player.X, player.Z);
            CellPlayers(player.Cell).Add(player);
            session.Player = player;
            session.Send(new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok, SelfId = player.Id } });
        }

        /// <summary>
        /// Move를 검증하고 받아들인다. 맵 밖이거나 쌓인 이동 거리보다 멀면 되돌린다.
        /// </summary>
        private void Move(Player player, Move move)
        {
            if (move.Yaw >= Units.YawSteps)
            {
                Kick(player.Session, KickReason.MalformedPacket);
                return;
            }

            // 되돌림을 받기 전에 보낸 Move다.
            if (move.Ack != player.Ack)
            {
                return;
            }

            long deltaX = (long)move.X - player.X;
            long deltaZ = (long)move.Z - player.Z;
            double distance = Math.Sqrt((deltaX * deltaX) + (deltaZ * deltaZ));
            if (!InsideMap(move.X) || !InsideMap(move.Z) || (distance > player.MoveBudget))
            {
                player.Ack++;
                player.Session.Send(new Packet
                {
                    PositionReset = new PositionReset { X = player.X, Z = player.Z, Ack = player.Ack },
                });
                return;
            }

            player.MoveBudget -= distance;
            player.X = move.X;
            player.Z = move.Z;
            player.Yaw = move.Yaw;
            player.Moved = true;
            long cell = CellOf(move.X, move.Z);
            if (cell != player.Cell)
            {
                _cells[player.Cell].Remove(player);
                CellPlayers(cell).Add(player);
                player.Cell = cell;
            }
        }

        /// <summary>
        /// 둘레 3×3칸의 개체를 모아 지난 틱과 비교하고, 나간 것·들어온 것·움직인 것을 보낸다.
        /// </summary>
        private void SendView(Player observer)
        {
            HashSet<Player> visible = observer.NextVisible;
            visible.Clear();
            int cellX = (int)(observer.Cell >> 32);
            int cellZ = (int)observer.Cell;
            for (int offsetX = -1; offsetX <= 1; offsetX++)
            {
                for (int offsetZ = -1; offsetZ <= 1; offsetZ++)
                {
                    if (_cells.TryGetValue(CellKey(cellX + offsetX, cellZ + offsetZ), out List<Player>? players))
                    {
                        visible.UnionWith(players);
                    }
                }
            }

            visible.Remove(observer);

            EntitiesLeave? leave = null;
            foreach (Player other in observer.Visible)
            {
                if (!visible.Contains(other))
                {
                    leave ??= new EntitiesLeave();
                    leave.Ids.Add(other.Id);
                }
            }

            EntitiesEnter? enter = null;
            EntityMoves? moves = null;
            if (observer.JustEntered)
            {
                enter = new EntitiesEnter { Entities = { EnterOf(observer) } };
                observer.JustEntered = false;
            }

            foreach (Player other in visible)
            {
                if (!observer.Visible.Contains(other))
                {
                    enter ??= new EntitiesEnter();
                    enter.Entities.Add(EnterOf(other));
                }
                else if (other.Moved)
                {
                    moves ??= new EntityMoves { Tick = Tick };
                    other.MoveMessage ??= new EntityMove { Id = other.Id, X = other.X, Z = other.Z, Yaw = other.Yaw };
                    moves.Entities.Add(other.MoveMessage);
                }
            }

            if (leave != null)
            {
                observer.Session.Send(new Packet { EntitiesLeave = leave });
            }

            if (enter != null)
            {
                observer.Session.Send(new Packet { EntitiesEnter = enter });
            }

            if (moves != null)
            {
                observer.Session.Send(new Packet { EntityMoves = moves });
            }

            observer.NextVisible = observer.Visible;
            observer.Visible = visible;
        }

        /// <summary>
        /// 연결의 개체를 월드에서 뺀다. 개체가 없으면 아무것도 하지 않는다.
        /// </summary>
        private void Remove(Session session)
        {
            Player? player = session.Player;
            if (player == null)
            {
                return;
            }

            session.Player = null;
            _players.Remove(player.LoginId);
            _cells[player.Cell].Remove(player);
        }

        /// <summary>
        /// 칸의 플레이어 목록. 없으면 만든다.
        /// </summary>
        private List<Player> CellPlayers(long cell)
        {
            if (!_cells.TryGetValue(cell, out List<Player>? players))
            {
                players = new List<Player>();
                _cells.Add(cell, players);
            }

            return players;
        }

        /// <summary>
        /// 시야에 들어온 개체를 알리는 원소.
        /// </summary>
        private static EntityEnter EnterOf(Player player)
        {
            return new EntityEnter { Id = player.Id, X = player.X, Z = player.Z, Yaw = player.Yaw, Name = player.LoginId };
        }

        /// <summary>
        /// 좌표가 든 칸의 키. 산술 시프트라 음수 좌표도 아래로 내린다.
        /// </summary>
        private static long CellOf(int x, int z)
        {
            return CellKey(x >> CellShift, z >> CellShift);
        }

        /// <summary>
        /// 칸 번호 두 개를 키 하나로 묶는다.
        /// </summary>
        private static long CellKey(int cellX, int cellZ)
        {
            return ((long)cellX << 32) | (uint)cellZ;
        }

        /// <summary>
        /// 좌표 하나가 맵 안이다.
        /// </summary>
        private static bool InsideMap(int coordinate)
        {
            return Math.Abs((long)coordinate) <= Units.MapHalfExtent;
        }
    }
}
