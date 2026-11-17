using System;
using System.Buffers;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// TCP 연결 하나의 받기와 보내기. 받은 패킷은 큐에 넣기만 하고, 보낼 것은 틱 스레드가 틱마다 버퍼 하나로 넘긴다.
    /// 넘겨받은 버퍼는 ArrayPool&lt;byte&gt;.Shared에서 빌린 것이고, 보낸 뒤나 보내지 못하고 닫을 때 이 연결이 돌려준다(53).
    /// </summary>
    internal sealed class Connection
    {
        /// <summary>
        /// 클라이언트가 보내는 패킷의 크기 상한(바이트). 지금 Login과 Move는 30바이트를 넘지 않는다.
        /// </summary>
        public const int MaxPacketBytes = 256;

        /// <summary>
        /// 보내지 못하고 쌓아 둘 틱 버퍼 수(2초). 넘으면 클라이언트가 따라오지 못하는 것으로 보고 끊는다.
        /// </summary>
        private const int MaxQueuedFrames = 2 * Units.TicksPerSecond;

        /// <summary>
        /// 다 보낸 뒤 상대가 연결을 닫기를 기다리는 시간.
        /// </summary>
        private static readonly TimeSpan s_closeTimeout = TimeSpan.FromSeconds(5);

        /// <summary>
        /// 연결된 소켓.
        /// </summary>
        private readonly Socket _socket;

        /// <summary>
        /// 소켓의 스트림. 닫으면 소켓도 닫힌다.
        /// </summary>
        private readonly NetworkStream _stream;

        /// <summary>
        /// 틱마다 보낼 버퍼. 틱 스레드가 쓰고 보내기 작업이 읽는다. 보내기 작업도 끝날 때 닫으므로(남은 버퍼를 돌려주려고) 쓰는 쪽이 둘이다.
        /// </summary>
        private readonly Channel<ArraySegment<byte>> _frames = Channel.CreateBounded<ArraySegment<byte>>(
            new BoundedChannelOptions(MaxQueuedFrames) { SingleReader = true });

        /// <summary>
        /// 이 연결이 넘겨받고 아직 풀에 돌려주지 않은 버퍼 수(테스트가 봄).
        /// </summary>
        private int _heldFrames;

        /// <summary>
        /// 받은 연결을 감싼다.
        /// </summary>
        public Connection(Socket socket)
        {
            _socket = socket;
            // 틱마다 한 번 보내므로 Nagle이 모아 보내려고 기다릴 필요가 없다.
            _socket.NoDelay = true;
            _stream = new NetworkStream(socket, ownsSocket: true);
        }

        /// <summary>
        /// 이 연결에서 월드가 보는 상태.
        /// </summary>
        public Session Session { get; } = new Session();

        /// <summary>
        /// 소켓이 닫히면 끝나는 작업.
        /// </summary>
        public Task Closed { get; private set; } = Task.CompletedTask;

        /// <summary>
        /// 받기와 보내기를 시작한다. 받은 것은 일어난 순서대로 inbound에 넣는다.
        /// </summary>
        public void Start(ConcurrentQueue<Inbound> inbound)
        {
            Task receiving = ReceiveAsync(inbound);
            Closed = SendAsync(receiving);
        }

        /// <summary>
        /// 보내기를 기다리는 프레임 수(측정용).
        /// </summary>
        public int QueuedFrames => _frames.Reader.Count;

        /// <summary>
        /// 넘겨받고 아직 풀에 돌려주지 않은 버퍼 수.
        /// </summary>
        internal int HeldFrames => Volatile.Read(ref _heldFrames);

        /// <summary>
        /// 틱 하나의 버퍼(풀에서 빌린 배열의 앞부분)를 보내기 큐에 넣는다. 버퍼는 넣지 못해도 이 연결이 맡아 돌려준다.
        /// 큐가 가득 찼거나 닫혔으면 false.
        /// </summary>
        public bool TrySend(ArraySegment<byte> frame)
        {
            Interlocked.Increment(ref _heldFrames);
            if (_frames.Writer.TryWrite(frame))
            {
                return true;
            }

            Release(frame);
            return false;
        }

        /// <summary>
        /// 큐에 든 것을 다 보낸 뒤 연결을 닫는다.
        /// </summary>
        public void Close()
        {
            _frames.Writer.TryComplete();
        }

        /// <summary>
        /// 보내지 않은 것을 버리고 바로 닫는다.
        /// </summary>
        public void Abort()
        {
            _frames.Writer.TryComplete();
            _stream.Dispose();
        }

        /// <summary>
        /// 패킷을 받아 큐에 넣는다. 끝나면 늘 Disconnected를 넣는다.
        /// </summary>
        private async Task ReceiveAsync(ConcurrentQueue<Inbound> inbound)
        {
            var reader = new PacketReader(_stream, MaxPacketBytes);
            try
            {
                while (await reader.ReadAsync(CancellationToken.None) is Packet packet)
                {
                    inbound.Enqueue(new Inbound(this, InboundKind.Received, packet));
                }
            }
            catch (InvalidDataException)
            {
                inbound.Enqueue(new Inbound(this, InboundKind.Malformed));
            }
            catch (IOException)
            {
                // 상대가 끊었거나 패킷 중간에 연결이 끝났다.
            }
            catch (ObjectDisposedException)
            {
                // 이쪽에서 닫았다.
            }

            inbound.Enqueue(new Inbound(this, InboundKind.Disconnected));
        }

        /// <summary>
        /// 큐의 버퍼를 차례로 보낸다. 큐가 닫히면 FIN을 보내고, 상대가 닫거나 시간이 지나면 소켓을 닫는다.
        /// </summary>
        private async Task SendAsync(Task receiving)
        {
            try
            {
                await foreach (ArraySegment<byte> frame in _frames.Reader.ReadAllAsync())
                {
                    try
                    {
                        await _stream.WriteAsync(frame.AsMemory());
                    }
                    finally
                    {
                        Release(frame);
                    }
                }

                // 바로 닫으면 상대가 아직 읽지 않은 마지막 패킷(Kicked 등)을 RST로 잃을 수 있다.
                _socket.Shutdown(SocketShutdown.Send);
                await receiving.WaitAsync(s_closeTimeout);
            }
            catch (IOException)
            {
                // 상대가 끊었다.
            }
            catch (SocketException)
            {
                // 상대가 끊었다.
            }
            catch (ObjectDisposedException)
            {
                // Abort가 닫았다.
            }
            catch (TimeoutException)
            {
                // 상대가 닫지 않는다.
            }
            finally
            {
                // 보내지 못한 버퍼를 돌려준다. 닫은 뒤의 TrySend는 실패하고 그 버퍼는 TrySend가 돌려준다.
                _frames.Writer.TryComplete();
                while (_frames.Reader.TryRead(out ArraySegment<byte> left))
                {
                    Release(left);
                }

                _stream.Dispose();
            }
        }

        private void Release(ArraySegment<byte> frame)
        {
            ArrayPool<byte>.Shared.Return(frame.Array!);
            Interlocked.Decrement(ref _heldFrames);
        }
    }
}
