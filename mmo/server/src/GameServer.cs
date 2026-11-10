using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 연결을 받고 20Hz 틱 루프를 돌린다. 틱마다 받은 패킷을 월드에 넘기고, 월드를 한 틱 진행하고,
    /// 연결마다 이번 틱의 패킷을 한 버퍼로 보낸다. 월드는 이 루프에서만 고친다.
    /// </summary>
    public sealed class GameServer
    {
        /// <summary>
        /// 로그인하지 않고 버틸 수 있는 틱 수(10초).
        /// </summary>
        private const uint LoginTimeoutTicks = 10 * Units.TicksPerSecond;

        /// <summary>
        /// 아무것도 받지 못하고 버틸 수 있는 틱 수의 기본값. 클라이언트는 그보다 짧은 간격으로 Ping을 보낸다.
        /// </summary>
        private const uint IdleTimeoutTicks = (uint)Constant.IdleTimeoutSeconds * Units.TicksPerSecond;

        /// <summary>
        /// 통계를 찍는 간격(틱, 10초).
        /// </summary>
        private const uint StatsIntervalTicks = 10 * Units.TicksPerSecond;

        /// <summary>
        /// 내려갈 때 클라이언트가 연결을 닫기를 기다리는 시간.
        /// </summary>
        private static readonly TimeSpan s_shutdownTimeout = TimeSpan.FromSeconds(5);

        /// <summary>
        /// 연결을 받는 소켓.
        /// </summary>
        private readonly TcpListener _listener;

        /// <summary>
        /// 월드. 틱 루프에서만 부른다.
        /// </summary>
        private readonly World _world;

        /// <summary>
        /// 아무것도 받지 못하고 버틸 수 있는 틱 수. 넘으면 IDLE_TIMEOUT으로 끊는다.
        /// </summary>
        private readonly uint _idleTimeoutTicks;

        /// <summary>
        /// 소켓 쪽에서 틱 루프로 넘기는 일.
        /// </summary>
        private readonly ConcurrentQueue<Inbound> _inbound = new ConcurrentQueue<Inbound>();

        /// <summary>
        /// 열려 있는 연결. 틱 루프에서만 고친다.
        /// </summary>
        private readonly List<Connection> _connections = new List<Connection>();

        /// <summary>
        /// 이번 통계 구간의 틱 수.
        /// </summary>
        private int _statsTicks;

        /// <summary>
        /// 이번 통계 구간에서 틱을 처리한 시간의 합.
        /// </summary>
        private TimeSpan _statsTickTime;

        /// <summary>
        /// 이번 통계 구간에서 가장 오래 걸린 틱.
        /// </summary>
        private TimeSpan _statsMaxTickTime;

        /// <summary>
        /// 이번 통계 구간에 보낸 바이트(TCP/IP 머리 제외).
        /// </summary>
        private long _statsSentBytes;

        /// <summary>
        /// 이번 통계 구간이 시작된 때.
        /// </summary>
        private long _statsStarted = Stopwatch.GetTimestamp();

        /// <summary>
        /// 이번 통계 구간이 시작될 때 프로세스가 쓴 CPU 시간.
        /// </summary>
        private TimeSpan _statsCpuStarted = Environment.CpuUsage.TotalTime;

        /// <summary>
        /// 이번 통계 구간이 시작될 때까지 할당한 바이트.
        /// </summary>
        private long _statsAllocatedStarted = GC.GetTotalAllocatedBytes();

        /// <summary>
        /// endpoint에서 연결을 받을 서버를 만든다. 포트가 0이면 RunAsync를 부른 뒤 Port에서 실제 포트를 읽는다.
        /// idleTimeoutTicks는 테스트가 짧게 줄 때만 넘긴다.
        /// </summary>
        public GameServer(IPEndPoint endpoint, World world, uint idleTimeoutTicks = IdleTimeoutTicks)
        {
            _listener = new TcpListener(endpoint);
            _world = world;
            _idleTimeoutTicks = idleTimeoutTicks;
        }

        /// <summary>
        /// 연결을 받는 포트.
        /// </summary>
        public int Port => ((IPEndPoint)_listener.LocalEndpoint).Port;

        /// <summary>
        /// cancellationToken이 취소될 때까지 서버를 돌린다. 취소되면 모두에게 SERVER_SHUTDOWN을 보내고, 위치를 저장하고 닫는다.
        /// </summary>
        public async Task RunAsync(CancellationToken cancellationToken)
        {
            _listener.Start();
            Task accepting = AcceptAsync(cancellationToken);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1.0 / Units.TicksPerSecond));
            try
            {
                while (await timer.WaitForNextTickAsync(cancellationToken))
                {
                    RunTick();
                }
            }
            catch (OperationCanceledException)
            {
                // 내려간다.
            }

            _listener.Stop();
            await accepting;
            Drain();
            foreach (Connection connection in _connections)
            {
                _world.Kick(connection.Session, KickReason.ServerShutdown);
            }

            _world.SaveAll();

            Task[] closed = _connections.Select(connection => connection.Closed).ToArray();
            Flush();
            try
            {
                await Task.WhenAll(closed).WaitAsync(s_shutdownTimeout);
            }
            catch (TimeoutException)
            {
                // 닫지 않는 클라이언트는 더 기다리지 않는다.
            }
        }

        /// <summary>
        /// 이번 틱의 패킷을 한 버퍼에 이어 쓴다(길이 구분 프레임).
        /// </summary>
        private static byte[] Serialize(List<Packet> packets)
        {
            int size = 0;
            foreach (Packet packet in packets)
            {
                int packetSize = packet.CalculateSize();
                size += CodedOutputStream.ComputeLengthSize(packetSize) + packetSize;
            }

            byte[] frame = new byte[size];
            var output = new CodedOutputStream(frame);
            foreach (Packet packet in packets)
            {
                output.WriteMessage(packet);
            }

            output.CheckNoSpaceLeft();
            return frame;
        }

        /// <summary>
        /// 연결을 받아 큐에 알리고 받기·보내기를 시작한다.
        /// </summary>
        private async Task AcceptAsync(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                Socket socket;
                try
                {
                    socket = await _listener.AcceptSocketAsync(cancellationToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
                catch (SocketException exception)
                {
                    // 파일 핸들이 모자라는 등 잠깐의 실패로 받기를 멈추지 않는다.
                    Console.Error.WriteLine($"Accept failed: {exception.SocketErrorCode}");
                    await Task.Delay(100, CancellationToken.None);
                    continue;
                }

                var connection = new Connection(socket);
                _inbound.Enqueue(new Inbound(connection, InboundKind.Connected));
                connection.Start(_inbound);
            }
        }

        /// <summary>
        /// 틱 하나: 받은 일 처리 → 월드 진행 → 보내기.
        /// </summary>
        private void RunTick()
        {
            long started = Stopwatch.GetTimestamp();
            Drain();
            _world.Step();
            _statsSentBytes += Flush();

            TimeSpan elapsed = Stopwatch.GetElapsedTime(started);
            _statsTicks++;
            _statsTickTime += elapsed;
            _statsMaxTickTime = elapsed > _statsMaxTickTime ? elapsed : _statsMaxTickTime;
            if (_world.Tick % StatsIntervalTicks == 0)
            {
                ReportStats();
            }
        }

        /// <summary>
        /// 소켓 쪽에서 넘어온 일을 들어온 순서대로 월드에 넘긴다.
        /// </summary>
        private void Drain()
        {
            while (_inbound.TryDequeue(out Inbound item))
            {
                Session session = item.Connection.Session;
                switch (item.Kind)
                {
                    case InboundKind.Connected:
                        session.ConnectedTick = _world.Tick;
                        session.LastReceivedTick = _world.Tick;
                        _connections.Add(item.Connection);
                        break;
                    case InboundKind.Received:
                        session.LastReceivedTick = _world.Tick;
                        _world.Receive(session, item.Packet!);
                        break;
                    case InboundKind.Malformed:
                        _world.Kick(session, KickReason.MalformedPacket);
                        break;
                    case InboundKind.Disconnected:
                        _world.Disconnect(session);
                        break;
                }
            }
        }

        /// <summary>
        /// 연결마다 이번 틱의 패킷을 한 버퍼로 보내고, 끊기로 한 연결을 닫는다. 보낸 바이트 수를 돌려준다.
        /// </summary>
        private int Flush()
        {
            int sent = 0;
            for (int index = _connections.Count - 1; index >= 0; index--)
            {
                Connection connection = _connections[index];
                Session session = connection.Session;
                if ((session.Player == null) && !session.IsClosing && (_world.Tick - session.ConnectedTick > LoginTimeoutTicks))
                {
                    session.Close();
                }

                // 연결이 끊긴 것을 TCP가 알려 주지 않는 경우(망이 바뀐 휴대폰, 멈춘 앱)에 개체가 월드에 남지 않게 한다.
                if (!session.IsClosing && (_world.Tick - session.LastReceivedTick > _idleTimeoutTicks))
                {
                    _world.Kick(session, KickReason.IdleTimeout);
                }

                if (session.Outbox.Count > 0)
                {
                    byte[] frame = Serialize(session.Outbox);
                    session.Outbox.Clear();
                    if (connection.TrySend(frame))
                    {
                        sent += frame.Length;
                    }
                    else
                    {
                        // 클라이언트가 2초 넘게 따라오지 못한다. 쌓인 것을 버리고 끊는다.
                        _world.Disconnect(session);
                        connection.Abort();
                    }
                }

                if (session.IsClosing)
                {
                    connection.Close();
                    _connections[index] = _connections[^1];
                    _connections.RemoveAt(_connections.Count - 1);
                }
            }

            return sent;
        }

        /// <summary>
        /// 지난 통계 구간의 틱 시간, 송신량, CPU, 메모리를 찍고 구간을 다시 시작한다.
        /// </summary>
        private void ReportStats()
        {
            double seconds = Stopwatch.GetElapsedTime(_statsStarted).TotalSeconds;
            TimeSpan cpu = Environment.CpuUsage.TotalTime;
            long allocated = GC.GetTotalAllocatedBytes();
            int players = _world.PlayerCount;
            double sentPerSecond = _statsSentBytes / seconds;
            Console.WriteLine(
                $"tick {_world.Tick}: players {players}, visible {_world.AverageVisible:F1}, "
                + $"tick avg {_statsTickTime.TotalMilliseconds / _statsTicks:F2} ms max {_statsMaxTickTime.TotalMilliseconds:F2} ms, "
                + $"sent {sentPerSecond / 1e6:F2} MB/s ({(players == 0 ? 0 : sentPerSecond / players):F0} B/s per player), "
                + $"cpu {(cpu - _statsCpuStarted).TotalSeconds / seconds * 100:F0}%, "
                + $"heap {GC.GetTotalMemory(false) / 1e6:F0} MB, working set {Environment.WorkingSet / 1e6:F0} MB, "
                + $"alloc {(allocated - _statsAllocatedStarted) / seconds / 1e6:F1} MB/s, "
                + $"gc {GC.CollectionCount(0)}/{GC.CollectionCount(1)}/{GC.CollectionCount(2)}");

            _statsTicks = 0;
            _statsTickTime = TimeSpan.Zero;
            _statsMaxTickTime = TimeSpan.Zero;
            _statsSentBytes = 0;
            _statsStarted = Stopwatch.GetTimestamp();
            _statsCpuStarted = cpu;
            _statsAllocatedStarted = allocated;
        }
    }
}
