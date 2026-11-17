using System;
using System.Buffers;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 연결이 넘겨받은 틱 버퍼(ArrayPool에서 빌림)를 모두 돌려주는지 루프백 TCP로 본다(53).
    /// </summary>
    public class ConnectionTests
    {
        private static readonly TimeSpan s_timeout = TimeSpan.FromSeconds(5);

        /// <summary>
        /// 보낸 버퍼는 보낸 뒤에 돌아오고, 닫힌 뒤의 TrySend는 실패하며 그 버퍼도 돌아온다(빌린 수와 돌려준 수가 같음).
        /// </summary>
        [Fact]
        public async Task FramesReturnAfterSendingAndClosing()
        {
            (Connection connection, TcpClient client) = await PairAsync();
            using (client)
            {
                connection.Start(new ConcurrentQueue<Inbound>());
                for (int i = 0; i < 10; i++)
                {
                    Assert.True(connection.TrySend(Frame(100, (byte)i)));
                }

                byte[] received = new byte[1000];
                await client.GetStream().ReadExactlyAsync(received).AsTask().WaitAsync(s_timeout);
                Assert.Equal(9, received[999]);

                connection.Close();
                client.Close();
                await connection.Closed.WaitAsync(s_timeout);
                Assert.Equal(0, connection.HeldFrames);
                Assert.False(connection.TrySend(Frame(10, 0)));
                Assert.Equal(0, connection.HeldFrames);
            }
        }

        /// <summary>
        /// 읽지 않는 상대에게 큐가 찰 때까지 넣은 뒤 바로 끊어도(따라오지 못하는 연결을 끊을 때) 보내던 것과 큐에 남은 버퍼가 모두 돌아온다.
        /// </summary>
        [Fact]
        public async Task QueuedFramesReturnWhenAborted()
        {
            (Connection connection, TcpClient client) = await PairAsync();
            using (client)
            {
                connection.Start(new ConcurrentQueue<Inbound>());
                for (int i = 0; (i < 2000) && connection.TrySend(Frame(64 * 1024, 1)); i++)
                {
                }

                Assert.True(connection.HeldFrames > 0);
                connection.Abort();
                await connection.Closed.WaitAsync(s_timeout);
                Assert.Equal(0, connection.HeldFrames);
            }
        }

        private static ArraySegment<byte> Frame(int size, byte fill)
        {
            byte[] buffer = ArrayPool<byte>.Shared.Rent(size);
            buffer.AsSpan(0, size).Fill(fill);
            return new ArraySegment<byte>(buffer, 0, size);
        }

        private static async Task<(Connection Connection, TcpClient Client)> PairAsync()
        {
            var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            try
            {
                var client = new TcpClient();
                Task connecting = client.ConnectAsync(IPAddress.Loopback, ((IPEndPoint)listener.LocalEndpoint).Port);
                Socket socket = await listener.AcceptSocketAsync().WaitAsync(s_timeout);
                await connecting.WaitAsync(s_timeout);
                return (new Connection(socket), client);
            }
            finally
            {
                listener.Stop();
            }
        }
    }
}
