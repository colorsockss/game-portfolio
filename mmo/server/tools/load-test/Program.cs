using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;

namespace PortfolioMmo.LoadTest
{
    /// <summary>
    /// 봇 여러 명을 서버에 붙여 틱마다 최대 속도로 걷게 하고, 봇 하나가 받는 양을 잰다. 봇은 서버와 같은 맵(격자)을 읽어
    /// 서버의 FieldMap.CanWalkLine으로 벽을 피하므로 정상 클라이언트처럼 되돌려지지 않는다. --hunt면 가까운 몬스터에 다가가 기본 공격과
    /// 쿨다운이 돈 스킬을 쓰고 죽으면 부활하며(기사), --gather x,z면 그 점(m) 둘레(--gather-radius m)로 모인다(클라이언트 200명 측정).
    /// 서버는 따로 띄우고(--spawn-half-extent를 이 도구의 --half-extent와 같게), 틱 시간·CPU·메모리는 서버 로그에서 읽는다.
    /// </summary>
    public static class Program
    {
        /// <summary>
        /// 측정 전에 봇이 흩어지고 시야가 자리 잡기를 기다리는 시간.
        /// </summary>
        private static readonly TimeSpan s_warmUp = TimeSpan.FromSeconds(5);

        /// <summary>
        /// 인자: --host(기본 127.0.0.1), --port(기본 7777), --bots(기본 1000), --seconds(측정 시간, 기본 30),
        /// --half-extent(봇이 걷는 정사각형의 반 너비, m, 기본 200), --data(Login에 실을 데이터 해시와 맵의 폴더, 기본 실행 파일 옆의 data/),
        /// --hunt(사냥), --gather x,z(모일 점, m), --gather-radius(모이는 반지름, m, 기본 15), --edge(시야 칸의 경계선을 ±6 m로 오감. 78), --straight(틱마다 방향을 흔들지 않고 곧게 걸음. 막히면 돌아섬. 54), --every(걷는 동안 이 틱 수에 한 번만 Move를 보냄. 프레임이 낮거나 패킷이 몰린 클라이언트, 기본 1. 54), --prefix(로그인 ID의 앞, 기본 bot. 같은 서버에 두 무리를 붙일 때),
        /// --demo-bots(앞에서부터 이만큼은 체험 캐릭터(94)로 만들어 기사와 마법사를 번갈아 사냥터 2와 3에서 사냥함. --demo 서버, 기본 0).
        /// --seconds 0이면 끝없이 돌고 끊기면 다시 붙는다(Live의 봇).
        /// 서버와 같은 생성물(mmo/shared/data/files/)을 써야 로그인이 된다.
        /// </summary>
        public static async Task Main(string[] args)
        {
            string host = Option(args, "--host", "127.0.0.1");
            int port = int.Parse(Option(args, "--port", "7777"));
            int botCount = int.Parse(Option(args, "--bots", "1000"));
            int seconds = int.Parse(Option(args, "--seconds", "30"));
            double halfExtent = int.Parse(Option(args, "--half-extent", "200")) * Units.PerMeter;
            GameData data = GameData.Load(Option(args, "--data", GameData.DefaultFolder));
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            string prefix = Option(args, "--prefix", "bot");
            int demoBots = int.Parse(Option(args, "--demo-bots", "0"));
            var behavior = new Behavior(
                Array.IndexOf(args, "--hunt") >= 0,
                Point(Option(args, "--gather", string.Empty)),
                double.Parse(Option(args, "--gather-radius", "15"), System.Globalization.CultureInfo.InvariantCulture) * Units.PerMeter,
                Array.IndexOf(args, "--edge") >= 0,
                Array.IndexOf(args, "--straight") >= 0,
                int.Parse(Option(args, "--every", "1")));

            var bots = new List<Bot>();
            for (int index = 0; index < botCount; index++)
            {
                bots.Add(await Bot.ConnectAsync(host, port, $"{prefix}_{index:D4}", data.Hash, index < demoBots ? index : -1));
            }

            Console.WriteLine($"Connected {bots.Count} bots");
            var random = new Random(1);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / Units.TicksPerSecond));
            var clock = Stopwatch.StartNew();
            long startBytes = 0;
            int startResets = 0;
            bool measuring = false;
            long tick = 0;
            while (await timer.WaitForNextTickAsync())
            {
                tick++;
                for (int index = 0; index < bots.Count; index++)
                {
                    bots[index].Step(random, halfExtent, field, behavior, tick);
                    // 끝없이 도는 봇(Live)은 서버가 다시 뜨면 다시 붙는다(10초마다 한 번 시도).
                    if ((seconds == 0) && !bots[index].IsAlive && (tick % (10 * Units.TicksPerSecond) == index % (10 * Units.TicksPerSecond)))
                    {
                        bots[index].Dispose();
                        try
                        {
                            bots[index] = await Bot.ConnectAsync(host, port, $"{prefix}_{index:D4}", data.Hash, index < demoBots ? index : -1);
                        }
                        catch (SocketException)
                        {
                            // 서버가 아직 뜨지 않았다. 다음 차례에 다시 본다.
                        }
                    }
                }

                if (!measuring && (clock.Elapsed >= s_warmUp))
                {
                    measuring = true;
                    startBytes = bots.Sum(bot => bot.ReceivedBytes);
                    startResets = bots.Sum(bot => bot.Resets);
                    clock.Restart();
                }
                else if (measuring && (seconds > 0) && (clock.Elapsed.TotalSeconds >= seconds))
                {
                    break;
                }
            }

            double elapsed = clock.Elapsed.TotalSeconds;
            long bytes = bots.Sum(bot => bot.ReceivedBytes) - startBytes;
            int alive = bots.Count(bot => bot.IsAlive);
            Console.WriteLine(
                $"bots {alive}/{bots.Count} alive, received {bytes / elapsed / bots.Count:F0} B/s per bot, "
                + $"resets {bots.Sum(bot => bot.Resets) - startResets} in {elapsed:F0} s, kills {bots.Sum(bot => bot.Kills)}, deaths {bots.Sum(bot => bot.Deaths)}");
            foreach (Bot bot in bots)
            {
                bot.Dispose();
            }
        }

        /// <summary>
        /// "x,z"(m) → 좌표. 빈 글이면 null.
        /// </summary>
        private static (double X, double Z)? Point(string text)
        {
            string[] parts = text.Split(',');
            return parts.Length == 2
                ? (double.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture) * Units.PerMeter, double.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture) * Units.PerMeter)
                : null;
        }

        /// <summary>
        /// "--이름 값" 꼴의 인자. 없으면 fallback.
        /// </summary>
        private static string Option(string[] args, string name, string fallback)
        {
            int index = Array.IndexOf(args, name);
            return (index >= 0) && (index + 1 < args.Length) ? args[index + 1] : fallback;
        }
    }

    /// <summary>
    /// 봇의 행동: 사냥, 모일 점(좌표)과 반지름(좌표 단위).
    /// </summary>
    internal readonly record struct Behavior(bool Hunt, (double X, double Z)? Gather, double GatherRadius, bool Edge = false, bool Straight = false, int Every = 1);

    /// <summary>
    /// 로그인하고 걸어 다니는 봇 하나. 받기는 자기 작업에서, 걷기는 Program의 틱 루프에서 하므로 위치는 잠그고 고친다.
    /// </summary>
    internal sealed class Bot : IDisposable
    {
        /// <summary>
        /// 틱마다 걷는 거리(칸). 서버가 받아 주는 최대 속도로 걷는다.
        /// </summary>
        private const double Stride = Units.MaxSpeedMetersPerSecond * Units.PerMeter / Units.TicksPerSecond;

        /// <summary>
        /// 사냥: 대상을 고르는 거리, 서서 치는 거리(기사의 사거리 2 m 안쪽), 쓰는 스킬(기사의 첫째, 쿨다운 4초)과 다시 쓰는 간격(틱), 부활을 다시 보내는 간격(틱).
        /// </summary>
        private const double HuntRange = 25 * Units.PerMeter;
        private const double StrikeRange = 1.5 * Units.PerMeter;
        private const uint SkillId = 101;
        private const long SkillTicks = 4 * Units.TicksPerSecond + 2;

        /// <summary>
        /// 체험 캐릭터의 마법사 봇(94): 첫째 스킬(직선 발사체, 쿨다운 3초), 치는 거리, 소환(95. 시전 2초)과 그동안 서 있는 틱, 소환을 다시 보는 간격.
        /// </summary>
        private const uint MageSkillId = 201;
        private const long MageSkillTicks = 3 * Units.TicksPerSecond + 2;
        private const double MageStrikeRange = 8 * Units.PerMeter;
        private const uint SummonSkillId = 206;
        private const long SummonCastTicks = 3 * Units.TicksPerSecond;
        private const long SummonRetryTicks = 10 * Units.TicksPerSecond;

        /// <summary>
        /// 파티(94): 받은 초대를 수락하고 이만큼(5분) 초대한 플레이어를 따라 걸은 뒤 떠난다. 따라 걷는 거리는 10 m 안이다.
        /// </summary>
        private const long PartyTicks = 5 * 60 * Units.TicksPerSecond;
        private const double FollowRange = 10 * Units.PerMeter;

        /// <summary>
        /// 체험 캐릭터의 차례(0부터. 짝수는 기사로 사냥터 2, 홀수는 마법사로 사냥터 3). -1이면 보통의 기사 봇이다.
        /// </summary>
        private int _demo = -1;
        private bool IsMage => _demo >= 0 && (_demo % 2) == 1;

        /// <summary>
        /// 내 소환수의 번호(0이면 없음), 소환을 시전하느라 서 있는 틱, 다음에 소환을 볼 틱.
        /// </summary>
        private uint _summonId;
        private long _castUntil;
        private long _nextSummonTick;

        /// <summary>
        /// 파티: 초대한 플레이어의 번호(0이면 파티가 아님), 그 자리, 떠나는 틱, 이번 틱에 보낼 수락.
        /// </summary>
        private uint _leader;
        private (int X, int Z)? _leaderAt;
        private long _leaveTick;
        private bool _accept;
        private const long ReviveTicks = 2 * Units.TicksPerSecond;

        /// <summary>
        /// Ping의 간격(틱). 실제 클라이언트와 같다.
        /// </summary>
        private const long PingTicks = (long)Constant.PingIntervalSeconds * Units.TicksPerSecond;

        /// <summary>
        /// 연결.
        /// </summary>
        private readonly TcpClient _client;

        /// <summary>
        /// 연결의 스트림.
        /// </summary>
        private readonly NetworkStream _stream;

        /// <summary>
        /// 위치와 ack를 고칠 때 잡는 잠금.
        /// </summary>
        private readonly object _gate = new object();

        /// <summary>
        /// 내 개체 번호. EnterWorldResult에서 받는다.
        /// </summary>
        private uint _selfId;

        /// <summary>
        /// 처음이면 만들 캐릭터의 이름(로그인 ID에서 밑줄을 뺀 것).
        /// </summary>
        private string _characterName = string.Empty;

        /// <summary>
        /// 내 개체가 EntitiesEnter로 와서 위치를 안다.
        /// </summary>
        private bool _ready;

        /// <summary>
        /// 위치 x(칸).
        /// </summary>
        private double _x;

        /// <summary>
        /// 위치 z(칸).
        /// </summary>
        private double _z;

        /// <summary>
        /// 걷는 방향(라디안).
        /// </summary>
        private double _heading;

        /// <summary>
        /// 걷는 중이라고 보낸 Move가 마지막이다(54). 서서 치기 시작하면 움직이는 중 표시를 끈 Move를 한 번 보낸다(실제 클라이언트처럼).
        /// </summary>
        private bool _walking;

        /// <summary>
        /// 마지막으로 보낸 방향.
        /// </summary>
        private uint _yaw;

        /// <summary>
        /// 마지막으로 받은 PositionReset의 ack.
        /// </summary>
        private uint _ack;

        /// <summary>
        /// 받은 바이트(TCP/IP 머리 제외).
        /// </summary>
        private long _receivedBytes;

        /// <summary>
        /// 받은 PositionReset 수.
        /// </summary>
        private int _resets;

        /// <summary>
        /// 사냥: 받은 몬스터(번호 → 자리와 죽었는지), 내가 죽었는지, 대상, 그 대상에 AttackStart를 보냈는지, 다음 스킬과 부활의 틱, 잡은 수와 죽은 수.
        /// </summary>
        private readonly Dictionary<uint, (int X, int Z, bool Dead)> _monsters = new Dictionary<uint, (int X, int Z, bool Dead)>();
        private bool _dead;
        private uint _target;
        private bool _attacking;
        private long _nextSkillTick;
        private long _nextReviveTick;
        /// <summary>
        /// 길이 막혀 버린 대상과 다시 고를 수 있는 틱. 막힌 대상을 틱마다 다시 고르지 않게 한다.
        /// </summary>
        private uint _skipped;
        private long _skipUntil;
        private int _kills;
        private int _deaths;

        /// <summary>
        /// 마지막으로 돈 틱(파티의 떠나는 틱을 받은 쪽에서 셈).
        /// </summary>
        private long _lastTick;

        /// <summary>
        /// 연결된 봇을 만든다.
        /// </summary>
        private Bot(TcpClient client)
        {
            _client = client;
            _stream = client.GetStream();
        }

        /// <summary>
        /// 받은 바이트(TCP/IP 머리 제외).
        /// </summary>
        public long ReceivedBytes => Interlocked.Read(ref _receivedBytes);

        /// <summary>
        /// 받은 PositionReset 수.
        /// </summary>
        public int Resets => Volatile.Read(ref _resets);

        /// <summary>
        /// 내가 잡은 몬스터 수(Died의 죽인 개체가 나)와 내가 죽은 수.
        /// </summary>
        public int Kills => Volatile.Read(ref _kills);

        public int Deaths => Volatile.Read(ref _deaths);

        /// <summary>
        /// 서버가 아직 끊지 않았다.
        /// </summary>
        public bool IsAlive { get; private set; } = true;

        /// <summary>
        /// 연결하고 로그인을 보낸다. 캐릭터 목록이 오면 첫 캐릭터로(없으면 만들어) 들어간다.
        /// </summary>
        public static async Task<Bot> ConnectAsync(string host, int port, string loginId, ulong dataHash, int demo = -1)
        {
            var client = new TcpClient { NoDelay = true };
            await client.ConnectAsync(host, port);
            var bot = new Bot(client) { _characterName = loginId.Replace("_", string.Empty), _demo = demo };
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = loginId, DataHash = dataHash } }.WriteDelimitedTo(bot._stream);
            _ = bot.ReceiveAsync();
            return bot;
        }

        /// <summary>
        /// 한 틱 걷고 Move를 보낸다. 정사각형 밖으로 나가거나 벽에 막히면 걷지 않고 돌아선다.
        /// 벽은 서버가 가진 지난 위치(보낸 반올림 좌표나 되돌림의 자리)에서 다음 자리까지를 서버와 같은 선 검사로 본다.
        /// 칸만 보면 모서리를 지나는 걸음을 서버가 되돌린다.
        /// </summary>
        public void Step(Random random, double halfExtent, FieldMap field, in Behavior behavior, long tick)
        {
            Move move;
            var requests = new List<Packet>();
            lock (_gate)
            {
                _lastTick = tick;
                if (!_ready || !IsAlive)
                {
                    return;
                }

                // 실제 클라이언트처럼 Ping을 보낸다(서서 치거나 막혀 걷지 못해도 무응답으로 끊기지 않게).
                if (tick % PingTicks == _selfId % PingTicks)
                {
                    requests.Add(new Packet { Ping = new Ping() });
                }

                // 파티(94): 수락하고, 떠날 때가 되면 떠난다. 파티인 동안은 초대한 플레이어에게서 10 m 넘게 떨어지면 그쪽으로 걷는다.
                if (_accept)
                {
                    requests.Add(new Packet { PartyAnswer = new PartyAnswer { Accept = true } });
                    _accept = false;
                }

                if ((_leader != 0) && (tick >= _leaveTick))
                {
                    requests.Add(new Packet { PartyLeave = new PartyLeave() });
                    _leader = 0;
                    _leaderAt = null;
                }

                bool following = (_leaderAt is (int leaderX, int leaderZ)) && (Math.Pow(leaderX - _x, 2) + Math.Pow(leaderZ - _z, 2) > FollowRange * FollowRange);
                if (!following && behavior.Hunt && Hunt(tick, requests))
                {
                    // 죽은 봇은 서버가 이미 세웠다(죽은 동안의 Move는 되돌림).
                    if (_walking && !_dead)
                    {
                        requests.Add(new Packet { Move = new Move { X = (int)Math.Round(_x), Z = (int)Math.Round(_z), Yaw = _yaw, Ack = _ack } });
                    }

                    _walking = false;

                    Send(requests);
                    return;
                }

                if (!behavior.Straight)
                {
                    _heading += (random.NextDouble() - 0.5) * 0.4;
                }
                Behavior here = _demo >= 0 ? behavior with { Gather = (_demo % 2) == 0 ? (-100.0 * Units.PerMeter, 0.0) : (0.0, 190.0 * Units.PerMeter), GatherRadius = 40 * Units.PerMeter } : behavior;
                if (following && _leaderAt is (int towardX, int towardZ))
                {
                    _target = 0;
                    _heading = Math.Atan2(towardZ - _z, towardX - _x);
                }
                else if (_target != 0)
                {
                    // 대상 쪽으로 걷는다(막히면 아래에서 돌아섬).
                    (int X, int Z, bool Dead) goal = _monsters[_target];
                    _heading = Math.Atan2(goal.Z - _z, goal.X - _x);
                }
                else if (here.Gather is (double gatherX, double gatherZ) && (Math.Pow(gatherX - _x, 2) + Math.Pow(gatherZ - _z, 2) > here.GatherRadius * here.GatherRadius))
                {
                    _heading = Math.Atan2(gatherZ - _z, gatherX - _x);
                }
                else if (here.Edge)
                {
                    // 가장 가까운 시야 칸의 경계(x가 32 m의 배수인 선)를 ±6 m로 오간다(78의 측정).
                    double cell = 32.0 * Units.PerMeter;
                    double line = Math.Round(_x / cell) * cell;
                    double swing = 6.0 * Units.PerMeter;
                    _heading = _x > line + swing ? Math.PI : _x < line - swing ? 0 : (Math.Cos(_heading) >= 0 ? 0 : Math.PI);
                }

                double x = _x + (Math.Cos(_heading) * Stride);
                double z = _z + (Math.Sin(_heading) * Stride);
                if (((here.Gather == null) && ((Math.Abs(x) > halfExtent) || (Math.Abs(z) > halfExtent)))
                    || !field.CanWalkLine((int)Math.Round(_x), (int)Math.Round(_z), (int)Math.Round(x), (int)Math.Round(z), Walker.Player))
                {
                    // 막힌 대상은 10초 동안 고르지 않고 돌아선다.
                    if (_target != 0)
                    {
                        _skipped = _target;
                        _skipUntil = tick + (10 * Units.TicksPerSecond);
                    }

                    _target = 0;
                    Send(requests);
                    _heading += Math.PI + ((random.NextDouble() - 0.5) * 1.5);
                    return;
                }

                _x = x;
                _z = z;
                // heading은 +x에서 반시계로 잰 각이고, yaw는 +z(앞)에서 시계로 잰다.
                double turns = ((Math.PI / 2) - _heading) / (2 * Math.PI);
                _yaw = (uint)((turns - Math.Floor(turns)) * Units.YawSteps) % Units.YawSteps;
                _walking = true;
                move = new Move { X = (int)Math.Round(x), Z = (int)Math.Round(z), Yaw = _yaw, Ack = _ack, Moving = true };
            }

            if ((tick + _selfId) % behavior.Every == 0)
            {
                requests.Add(new Packet { Move = move });
            }

            Send(requests);
        }

        /// <summary>
        /// 사냥의 한 틱. 이번 틱에 걷지 않으면(죽음, 서서 침) true다. 걸어야 하면(대상에게 다가감, 대상이 없음) 대상만 정하고 false다.
        /// </summary>
        private bool Hunt(long tick, List<Packet> requests)
        {
            if (_dead)
            {
                if (tick >= _nextReviveTick)
                {
                    requests.Add(new Packet { Revive = new Revive() });
                    _nextReviveTick = tick + ReviveTicks;
                }

                return true;
            }

            // 마법사 봇(94)은 자기 소환수가 없으면 서서 소환한다(95. 시전하는 동안 걷지 않음).
            if (tick < _castUntil)
            {
                return true;
            }

            if (IsMage && (_summonId == 0) && (tick >= _nextSummonTick))
            {
                requests.Add(new Packet { UseSkill = new UseSkill { SkillId = SummonSkillId } });
                _castUntil = tick + SummonCastTicks;
                _nextSummonTick = tick + SummonRetryTicks;
                return true;
            }

            if ((_target == 0) || !_monsters.TryGetValue(_target, out (int X, int Z, bool Dead) target) || target.Dead)
            {
                _target = 0;
                _attacking = false;
                double best = HuntRange * HuntRange;
                foreach ((uint id, (int X, int Z, bool Dead) monster) in _monsters)
                {
                    double distance = Math.Pow(monster.X - _x, 2) + Math.Pow(monster.Z - _z, 2);
                    if (!monster.Dead && (distance < best) && ((id != _skipped) || (tick >= _skipUntil)))
                    {
                        _target = id;
                        best = distance;
                    }
                }

                if (_target == 0)
                {
                    return false;
                }

                target = _monsters[_target];
            }

            double reach = IsMage ? MageStrikeRange : StrikeRange;
            if (Math.Pow(target.X - _x, 2) + Math.Pow(target.Z - _z, 2) > reach * reach)
            {
                return false;
            }

            if (!_attacking)
            {
                requests.Add(new Packet { AttackStart = new AttackStart { TargetId = _target } });
                _attacking = true;
            }

            if (tick >= _nextSkillTick)
            {
                requests.Add(new Packet { UseSkill = new UseSkill { SkillId = IsMage ? MageSkillId : SkillId, TargetId = _target } });
                _nextSkillTick = tick + (IsMage ? MageSkillTicks : SkillTicks);
            }

            return true;
        }

        private void Send(List<Packet> packets)
        {
            try
            {
                foreach (Packet packet in packets)
                {
                    packet.WriteDelimitedTo(_stream);
                }
            }
            catch (IOException)
            {
                IsAlive = false;
            }
        }

        /// <summary>
        /// 연결을 닫는다.
        /// </summary>
        public void Dispose()
        {
            _client.Dispose();
        }

        /// <summary>
        /// 서버가 보낸 패킷을 읽어 바이트를 세고, 내 위치와 되돌림을 반영한다.
        /// </summary>
        private async Task ReceiveAsync()
        {
            var reader = new PacketReader(_stream, 1024 * 1024);
            try
            {
                while (await reader.ReadAsync(CancellationToken.None) is Packet packet)
                {
                    int size = packet.CalculateSize();
                    Interlocked.Add(ref _receivedBytes, CodedOutputStream.ComputeLengthSize(size) + size);
                    Handle(packet);
                }
            }
            catch (IOException)
            {
                // 연결이 끊겼다.
            }
            catch (ObjectDisposedException)
            {
                // 측정이 끝나 닫았다.
            }

            IsAlive = false;
        }

        /// <summary>
        /// 위치에 관한 패킷을 반영한다.
        /// </summary>
        private void Handle(Packet packet)
        {
            lock (_gate)
            {
                switch (packet.BodyCase)
                {
                    // 월드에 들어가기 전에는 이 수신 작업만 쓰고, 들어간 뒤에는 Step만 쓴다(Step은 _ready 전에 쓰지 않는다).
                    case Packet.BodyOneofCase.CharacterList when packet.CharacterList.Characters.Count == 0:
                        new Packet
                        {
                            CreateCharacter = new CreateCharacter { Name = _characterName, CharacterClass = IsMage ? CharacterClass.Mage : CharacterClass.Knight, Demo = _demo >= 0 },
                        }.WriteDelimitedTo(_stream);
                        break;
                    case Packet.BodyOneofCase.CharacterList:
                        new Packet { EnterWorld = new EnterWorld { CharacterId = packet.CharacterList.Characters[0].Id } }.WriteDelimitedTo(_stream);
                        break;
                    case Packet.BodyOneofCase.CreateCharacterResult when packet.CreateCharacterResult.Result != CreateCharacterResultCode.Ok:
                        Console.Error.WriteLine($"Bot {_characterName} could not create a character: {packet.CreateCharacterResult.Result}");
                        IsAlive = false;
                        break;
                    case Packet.BodyOneofCase.EnterWorldResult:
                        _selfId = packet.EnterWorldResult.SelfId;
                        break;
                    case Packet.BodyOneofCase.EntitiesEnter:
                        foreach (EntityEnter entity in packet.EntitiesEnter.Entities)
                        {
                            if (entity.Id == _selfId)
                            {
                                _x = entity.X;
                                _z = entity.Z;
                                _dead = entity.Dead;
                                _ready = true;
                            }
                            else if (entity.Kind == EntityKind.Monster)
                            {
                                _monsters[entity.Id] = (entity.X, entity.Z, entity.Dead);
                            }
                            else if ((entity.Kind == EntityKind.Summon) && (entity.SummonOwnerId == _selfId))
                            {
                                _summonId = entity.Id;
                            }
                            else if (entity.Id == _leader)
                            {
                                _leaderAt = (entity.X, entity.Z);
                            }
                        }

                        break;
                    case Packet.BodyOneofCase.EntityMoves:
                        foreach (EntityMove moved in packet.EntityMoves.Entities)
                        {
                            if (_monsters.TryGetValue(moved.Id, out (int X, int Z, bool Dead) monster))
                            {
                                _monsters[moved.Id] = (moved.X, moved.Z, monster.Dead);
                            }
                            else if (moved.Id == _leader)
                            {
                                _leaderAt = (moved.X, moved.Z);
                            }
                        }

                        break;
                    case Packet.BodyOneofCase.EntitiesLeave:
                        foreach (uint id in packet.EntitiesLeave.Ids)
                        {
                            _monsters.Remove(id);
                            _summonId = id == _summonId ? 0 : _summonId;
                        }

                        break;
                    case Packet.BodyOneofCase.Died when packet.Died.Id == _selfId:
                        _dead = true;
                        _deaths++;
                        _target = 0;
                        _attacking = false;
                        break;
                    case Packet.BodyOneofCase.Died:
                        if (_monsters.TryGetValue(packet.Died.Id, out (int X, int Z, bool Dead) died))
                        {
                            _monsters[packet.Died.Id] = (died.X, died.Z, true);
                        }

                        _kills += packet.Died.KillerId == _selfId ? 1 : 0;
                        break;
                    case Packet.BodyOneofCase.Revived when packet.Revived.Id == _selfId:
                        _dead = false;
                        break;
                    case Packet.BodyOneofCase.ActionFailed when packet.ActionFailed.Request == RequestKind.Attack:
                        // 칠 수 없는 대상(안전 지대, 복귀 중)은 버리고 다른 대상을 고른다.
                        _attacking = false;
                        _target = 0;
                        break;
                    case Packet.BodyOneofCase.PartyInvited when _leader == 0:
                        // 초대를 수락하고 5분 동안 초대한 플레이어를 따라 걸으며 그가 치는 몬스터를 함께 친다(플레이어는 치지 않음).
                        _accept = true;
                        _leader = packet.PartyInvited.InviterId;
                        _leaveTick = long.MaxValue;
                        break;
                    case Packet.BodyOneofCase.PartyState when (_leader != 0) && (_leaveTick == long.MaxValue) && packet.PartyState.Members.Count > 0:
                        _leaveTick = _lastTick + PartyTicks;
                        break;
                    case Packet.BodyOneofCase.AttackSwing when (_leader != 0) && (packet.AttackSwing.AttackerId == _leader) && _monsters.ContainsKey(packet.AttackSwing.TargetId):
                        if (_target != packet.AttackSwing.TargetId)
                        {
                            _target = packet.AttackSwing.TargetId;
                            _attacking = false;
                        }

                        break;
                    case Packet.BodyOneofCase.PositionReset:
                        _x = packet.PositionReset.X;
                        _z = packet.PositionReset.Z;
                        _ack = packet.PositionReset.Ack;
                        _resets++;
                        break;
                    case Packet.BodyOneofCase.Kicked:
                        Console.Error.WriteLine($"Bot {_selfId} kicked: {packet.Kicked.Reason}");
                        IsAlive = false;
                        break;
                }
            }
        }
    }
}
