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
    /// 봇 여러 명을 서버에 붙여 틱마다 최대 속도로 걷게 하고, 봇 하나가 받는 양을 잰다.
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
        /// --half-extent(봇이 걷는 정사각형의 반 너비, m, 기본 200).
        /// </summary>
        public static async Task Main(string[] args)
        {
            string host = Option(args, "--host", "127.0.0.1");
            int port = int.Parse(Option(args, "--port", "7777"));
            int botCount = int.Parse(Option(args, "--bots", "1000"));
            int seconds = int.Parse(Option(args, "--seconds", "30"));
            double halfExtent = int.Parse(Option(args, "--half-extent", "200")) * Units.PerMeter;

            var bots = new List<Bot>();
            for (int index = 0; index < botCount; index++)
            {
                bots.Add(await Bot.ConnectAsync(host, port, $"bot_{index:D4}"));
            }

            Console.WriteLine($"Connected {bots.Count} bots");
            var random = new Random(1);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / Units.TicksPerSecond));
            var clock = Stopwatch.StartNew();
            long startBytes = 0;
            int startResets = 0;
            bool measuring = false;
            while (await timer.WaitForNextTickAsync())
            {
                foreach (Bot bot in bots)
                {
                    bot.Step(random, halfExtent);
                }

                if (!measuring && (clock.Elapsed >= s_warmUp))
                {
                    measuring = true;
                    startBytes = bots.Sum(bot => bot.ReceivedBytes);
                    startResets = bots.Sum(bot => bot.Resets);
                    clock.Restart();
                }
                else if (measuring && (clock.Elapsed.TotalSeconds >= seconds))
                {
                    break;
                }
            }

            double elapsed = clock.Elapsed.TotalSeconds;
            long bytes = bots.Sum(bot => bot.ReceivedBytes) - startBytes;
            int alive = bots.Count(bot => bot.IsAlive);
            Console.WriteLine(
                $"bots {alive}/{bots.Count} alive, received {bytes / elapsed / bots.Count:F0} B/s per bot, "
                + $"resets {bots.Sum(bot => bot.Resets) - startResets} in {elapsed:F0} s");
            foreach (Bot bot in bots)
            {
                bot.Dispose();
            }
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
    /// 로그인하고 걸어 다니는 봇 하나. 받기는 자기 작업에서, 걷기는 Program의 틱 루프에서 하므로 위치는 잠그고 고친다.
    /// </summary>
    internal sealed class Bot : IDisposable
    {
        /// <summary>
        /// 틱마다 걷는 거리(칸). 서버가 받아 주는 최대 속도로 걷는다.
        /// </summary>
        private const double Stride = World.MaxSpeedMetersPerSecond * Units.PerMeter / Units.TicksPerSecond;

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
        /// 내 개체 번호. LoginResult에서 받는다.
        /// </summary>
        private uint _selfId;

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
        /// 서버가 아직 끊지 않았다.
        /// </summary>
        public bool IsAlive { get; private set; } = true;

        /// <summary>
        /// 연결하고 로그인을 보낸다.
        /// </summary>
        public static async Task<Bot> ConnectAsync(string host, int port, string loginId)
        {
            var client = new TcpClient { NoDelay = true };
            await client.ConnectAsync(host, port);
            var bot = new Bot(client);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = loginId } }.WriteDelimitedTo(bot._stream);
            _ = bot.ReceiveAsync();
            return bot;
        }

        /// <summary>
        /// 한 틱 걷고 Move를 보낸다. 정사각형 밖으로 나가려 하면 돌아선다.
        /// </summary>
        public void Step(Random random, double halfExtent)
        {
            Move move;
            lock (_gate)
            {
                if (!_ready || !IsAlive)
                {
                    return;
                }

                _heading += (random.NextDouble() - 0.5) * 0.4;
                double x = _x + (Math.Cos(_heading) * Stride);
                double z = _z + (Math.Sin(_heading) * Stride);
                if ((Math.Abs(x) > halfExtent) || (Math.Abs(z) > halfExtent))
                {
                    _heading += Math.PI;
                    return;
                }

                _x = x;
                _z = z;
                double turns = _heading / (2 * Math.PI);
                uint yaw = (uint)((turns - Math.Floor(turns)) * Units.YawSteps) % Units.YawSteps;
                move = new Move { X = (int)Math.Round(x), Z = (int)Math.Round(z), Yaw = yaw, Ack = _ack };
            }

            try
            {
                new Packet { Move = move }.WriteDelimitedTo(_stream);
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
            var stream = new BufferedStream(_stream);
            byte[] buffer = new byte[1024 * 1024];
            try
            {
                while (await PacketReader.ReadAsync(stream, buffer, CancellationToken.None) is Packet packet)
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
                    case Packet.BodyOneofCase.LoginResult:
                        _selfId = packet.LoginResult.SelfId;
                        break;
                    case Packet.BodyOneofCase.EntitiesEnter:
                        foreach (EntityEnter entity in packet.EntitiesEnter.Entities.Where(entity => entity.Id == _selfId))
                        {
                            _x = entity.X;
                            _z = entity.Z;
                            _ready = true;
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
