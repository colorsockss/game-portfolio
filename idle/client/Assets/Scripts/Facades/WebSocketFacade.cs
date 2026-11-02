using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Puerts;
using UnityEngine.Scripting;

namespace PortfolioIdleRpg.Facades
{
    /// <summary>
    /// TypeScript가 쓰는 WebSocket(src/unity/bridge.ts). C#은 바이트만 옮기고, 재연결, 재개, 타임아웃은
    /// TypeScript가 맡는다(src/adapters/net/game-server.ts). 소켓은 백그라운드 스레드에서 돌며 일어난
    /// 일을 큐에 쌓고, TypeScript가 메인 스레드에서 Poll로 이벤트를 가져간다. C#은 JavaScript를
    /// 부르지 않으므로, 스크립트 환경을 재시작해도 허공에 매달리는 JavaScript 함수를 쥐지 않는다.
    /// </summary>
    [Preserve]
    public static class WebSocketFacade
    {
        /// <summary>이벤트 종류: 연결됐다.</summary>
        [Preserve]
        public const int Opened = 0;

        /// <summary>이벤트 종류: 메시지 하나를 받았다.</summary>
        [Preserve]
        public const int Message = 1;

        /// <summary>이벤트 종류: 연결이 끝났다. 소켓의 마지막 이벤트다.</summary>
        [Preserve]
        public const int Closed = 2;

        /// <summary>소켓 id별 열린 소켓. 백그라운드 스레드도 읽으므로 동시성 사전이다.</summary>
        private static readonly ConcurrentDictionary<int, Socket> s_sockets =
            new ConcurrentDictionary<int, Socket>();

        /// <summary>마지막으로 내준 소켓 id.</summary>
        private static int s_lastId;

        /// <summary>
        /// <paramref name="url"/>(ws:// 또는 wss://)에 연결을 시작하고 소켓 id를 돌려준다. 이어서 Opened나
        /// Closed가 온다.
        /// </summary>
        /// <param name="url">서버 주소.</param>
        /// <returns>소켓 id.</returns>
        [Preserve]
        public static int Open(string url)
        {
            int id = Interlocked.Increment(ref s_lastId);
            var socket = new Socket();
            s_sockets[id] = socket;
            socket.Start(new Uri(url));
            return id;
        }

        /// <summary>바이너리 메시지 하나를 보낸다. 메시지는 건넨 순서대로 나간다.</summary>
        /// <param name="id">소켓 id.</param>
        /// <param name="data">보낼 바이트.</param>
        [Preserve]
        public static void Send(int id, ArrayBuffer data)
        {
            if (s_sockets.TryGetValue(id, out Socket socket))
                socket.Send(new ArraySegment<byte>(data.Bytes, 0, data.Count));
        }

        /// <summary>종료 핸드셰이크를 시작한다. 서버가 답하거나 응답이 끊기면 Closed가 이어진다.</summary>
        /// <param name="id">소켓 id.</param>
        /// <param name="code">WebSocket 종료 코드.</param>
        /// <param name="reason">종료 사유. UTF-8로 123바이트를 넘으면 자른다.</param>
        [Preserve]
        public static void Close(int id, int code, string reason)
        {
            if (s_sockets.TryGetValue(id, out Socket socket))
                socket.Close(code, reason);
        }

        /// <summary>소켓의 다음 이벤트를 꺼낸다. Closed를 내준 뒤에는 그 id를 잊는다.</summary>
        /// <param name="id">소켓 id.</param>
        /// <returns>다음 이벤트, 아직 없으면 null.</returns>
        [Preserve]
        public static SocketEvent Poll(int id)
        {
            if (!s_sockets.TryGetValue(id, out Socket socket)
                || !socket.Events.TryDequeue(out SocketEvent next))
            {
                return null;
            }
            if ((next.Kind == Closed) && s_sockets.TryRemove(id, out _))
                socket.Dispose();
            return next;
        }

        /// <summary>
        /// 소켓을 모두 버린다. 소켓을 연 스크립트 환경이 사라질 때(재시작, 끝) 쓴다. 서버가 비정상 종료(1006)로 보지 않게
        /// 종료 핸드셰이크(1001)를 한 뒤 백그라운드에서 폐기한다. C#이 부르고 TypeScript는 부르지 않으므로 internal이다.
        /// </summary>
        internal static void CloseAll()
        {
            foreach (int id in s_sockets.Keys)
            {
                if (s_sockets.TryRemove(id, out Socket socket))
                    socket.CloseAndDispose((int)WebSocketCloseStatus.EndpointUnavailable, "The client is restarting.");
            }
        }

        /// <summary>
        /// ClientWebSocket 하나. 백그라운드 스레드에서 받고 보내며, 일어난 일을 Events에 쌓는다.
        /// </summary>
        private sealed class Socket : IDisposable
        {
            /// <summary>종료 사유의 최대 길이. 종료 사유는 UTF-8로 최대 123바이트다.</summary>
            private const int MaxReasonBytes = 123;

            /// <summary>종료할 때 서버의 답을 기다리는 최대 시간.</summary>
            private static readonly TimeSpan s_closeWait = TimeSpan.FromSeconds(2);

            /// <summary>Poll이 꺼내 갈 이벤트. 백그라운드 스레드가 넣고 메인 스레드가 꺼낸다.</summary>
            public readonly ConcurrentQueue<SocketEvent> Events = new ConcurrentQueue<SocketEvent>();

            /// <summary>실제 연결.</summary>
            private readonly ClientWebSocket _webSocket = new ClientWebSocket();

            /// <summary>연결, 수신, 전송을 멈추는 토큰의 출처.</summary>
            private readonly CancellationTokenSource _stop = new CancellationTokenSource();

            /// <summary>
            /// 마지막 전송. ClientWebSocket은 한 번에 하나씩만 보낼 수 있으므로 각 전송은 앞의 전송을
            /// 기다린다. 메인 스레드만 이것을 건드린다.
            /// </summary>
            private Task _sending = Task.CompletedTask;

            /// <summary>Closed를 큐에 넣으면 끝나는 작업. Closed를 한 번만 넣게 한다.</summary>
            private readonly TaskCompletionSource<bool> _finished = new TaskCompletionSource<bool>();

            /// <summary>연결하고 Opened를 넣은 뒤 연결이 끝날 때까지 받는다.</summary>
            /// <param name="uri">서버 주소.</param>
            public async void Start(Uri uri)
            {
                try
                {
                    await _webSocket.ConnectAsync(uri, _stop.Token).ConfigureAwait(false);
                    Events.Enqueue(new SocketEvent(Opened));
                    await ReceiveAsync().ConfigureAwait(false);
                }
                catch (Exception error)
                {
                    // async void의 끝이라 놓친 예외는 호출자에게 가지 않고, Closed도 오지 않는다.
                    // 무엇이든 받아 Closed로 바꾼다.
                    Finish(1006, error.Message);
                }
            }

            /// <summary>연결이 끝날 때까지 메시지를 모아 Message 이벤트로 넣는다.</summary>
            private async Task ReceiveAsync()
            {
                var buffer = new byte[8 * 1024];
                using var message = new MemoryStream();
                while (true)
                {
                    WebSocketReceiveResult result = await _webSocket
                        .ReceiveAsync(new ArraySegment<byte>(buffer), _stop.Token)
                        .ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        Finish((int?)_webSocket.CloseStatus ?? 1005, _webSocket.CloseStatusDescription ?? "");
                        // 서버가 시작한 종료 핸드셰이크를 마무리한다. 아무도 이것을 기다리지 않는다.
                        if (_webSocket.State == WebSocketState.CloseReceived)
                        {
                            _ = _webSocket.CloseOutputAsync(
                                WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
                        }
                        return;
                    }
                    message.Write(buffer, 0, result.Count);
                    if (!result.EndOfMessage)
                        continue;
                    Events.Enqueue(new SocketEvent(Message) { Data = new ArrayBuffer(message.ToArray()) });
                    message.SetLength(0);
                }
            }

            /// <summary>앞의 전송이 끝난 뒤 보내도록 메시지를 줄 세운다.</summary>
            /// <param name="data">보낼 바이트.</param>
            public void Send(ArraySegment<byte> data)
            {
                _sending = SendAfterAsync(_sending, data);
            }

            /// <summary><paramref name="previous"/>가 끝나면 메시지를 보낸다. 실패하면 연결을 끝낸다.</summary>
            /// <param name="previous">앞의 전송.</param>
            /// <param name="data">보낼 바이트.</param>
            private async Task SendAfterAsync(Task previous, ArraySegment<byte> data)
            {
                await previous.ConfigureAwait(false);
                try
                {
                    await _webSocket.SendAsync(data, WebSocketMessageType.Binary, true, _stop.Token)
                        .ConfigureAwait(false);
                }
                catch (Exception error)
                {
                    // 백그라운드 작업의 끝이다. 다음 전송이 기다리기만 하고 아무도 예외를 보지 않으므로,
                    // 놓치면 사라지고 Closed도 오지 않는다. 무엇이든 받아 Closed로 바꾼다.
                    Finish(1006, error.Message);
                    Abort();
                }
            }

            /// <summary>종료 핸드셰이크를 하고, 답이 없어도 잠시 뒤 연결을 끊는다.</summary>
            /// <param name="code">WebSocket 종료 코드.</param>
            /// <param name="reason">종료 사유.</param>
            public void Close(int code, string reason) => _ = CloseAsync(code, reason);

            /// <summary>종료 핸드셰이크를 하고(답은 잠시만 기다린다) 소켓을 폐기한다. 아무도 이벤트를 꺼내지 않을 때 쓴다.</summary>
            /// <param name="code">WebSocket 종료 코드.</param>
            /// <param name="reason">종료 사유.</param>
            public async void CloseAndDispose(int code, string reason)
            {
                await CloseAsync(code, reason).ConfigureAwait(false);
                Dispose();
            }

            /// <summary>종료 핸드셰이크를 하고, 답이 없어도 잠시 뒤 연결을 끊는다. 실패해도 던지지 않는다.</summary>
            /// <param name="code">WebSocket 종료 코드.</param>
            /// <param name="reason">종료 사유.</param>
            /// <returns>끊을 때까지의 작업.</returns>
            private async Task CloseAsync(int code, string reason)
            {
                try
                {
                    if ((_webSocket.State == WebSocketState.Open)
                        || (_webSocket.State == WebSocketState.CloseReceived))
                    {
                        using var wait = new CancellationTokenSource(s_closeWait);
                        await _webSocket
                            .CloseOutputAsync((WebSocketCloseStatus)code, Shorten(reason), wait.Token)
                            .ConfigureAwait(false);
                        // 서버가 답하면 수신 루프가 Closed를 보고한다. 죽은 네트워크에서는 답이 오지 않는다.
                        await Task.WhenAny(_finished.Task, Task.Delay(s_closeWait)).ConfigureAwait(false);
                    }
                }
                catch (Exception)
                {
                    // 망가진 소켓은 닫는 데 실패한다. 아무도 기다리지 않는 작업의 끝이라 여기서 놓치면 아래의 Finish에
                    // 닿지 못해 Closed가 오지 않으므로 무엇이든 받는다. 어느 쪽이든 아래에서 중단된다.
                }
                Finish(code, reason);
                Abort();
            }

            /// <summary>수신, 전송, 종료 중 무엇이 먼저 실패하든 Closed를 정확히 한 번만 큐에 넣는다.</summary>
            /// <param name="code">WebSocket 종료 코드.</param>
            /// <param name="reason">종료 사유.</param>
            private void Finish(int code, string reason)
            {
                if (_finished.TrySetResult(true))
                    Events.Enqueue(new SocketEvent(Closed) { Code = code, Reason = reason });
            }

            /// <summary>진행 중인 작업을 멈추고 연결을 바로 끊는다.</summary>
            private void Abort()
            {
                try
                {
                    _stop.Cancel();
                    _webSocket.Abort();
                }
                catch (ObjectDisposedException)
                {
                    // Poll이 Closed를 내준 뒤라 이미 폐기됐다.
                }
            }

            /// <summary>연결을 끊고 소켓을 폐기한다.</summary>
            public void Dispose()
            {
                Abort();
                _webSocket.Dispose();
                _stop.Dispose();
            }

            /// <summary>종료 사유를 UTF-8로 MaxReasonBytes 바이트 안으로 자른다.</summary>
            /// <param name="reason">종료 사유.</param>
            /// <returns>잘린 사유. null이면 빈 문자열.</returns>
            private static string Shorten(string reason)
            {
                if (string.IsNullOrEmpty(reason) || (Encoding.UTF8.GetByteCount(reason) <= MaxReasonBytes))
                    return reason ?? "";
                byte[] bytes = Encoding.UTF8.GetBytes(reason);
                int length = MaxReasonBytes;
                // 문자를 반으로 자르지 않는다: 문자의 시작까지 물러난다.
                while ((length > 0) && ((bytes[length] & 0xC0) == 0x80))
                    length--;
                return Encoding.UTF8.GetString(bytes, 0, length);
            }
        }
    }

    /// <summary>Poll이 TypeScript에 건네는 것. 평범한 필드이고 하나씩 한 번만 읽는다.</summary>
    [Preserve]
    public sealed class SocketEvent
    {
        /// <summary>이벤트 종류. WebSocketFacade의 Opened, Message, Closed 중 하나다.</summary>
        [Preserve]
        public readonly int Kind;

        /// <summary>메시지의 바이트. Message일 때 쓴다.</summary>
        [Preserve]
        public ArrayBuffer Data;

        /// <summary>종료 코드. Closed일 때 쓰며, 연결에 실패했거나 끊겼으면 1006이다.</summary>
        [Preserve]
        public int Code;

        /// <summary>종료 사유. Closed일 때 쓴다.</summary>
        [Preserve]
        public string Reason;

        /// <summary>종류만 정한 이벤트를 만든다.</summary>
        /// <param name="kind">이벤트 종류.</param>
        public SocketEvent(int kind)
        {
            Kind = kind;
        }
    }
}
