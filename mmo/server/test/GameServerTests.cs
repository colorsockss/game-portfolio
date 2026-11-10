using System;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using Google.Protobuf;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 루프백 TCP로 서버를 돌려 프레임, 로그인, 끊기를 확인한다.
    /// </summary>
    public class GameServerTests
    {
        /// <summary>
        /// 응답 하나를 기다리는 시간.
        /// </summary>
        private static readonly TimeSpan s_timeout = TimeSpan.FromSeconds(5);

        /// <summary>
        /// 로그인하면 LoginResult와 내 EntitiesEnter가 오고, 상한을 넘는 길이를 보내면 MALFORMED_PACKET을 받고 끊긴다.
        /// </summary>
        [Fact]
        public async Task LogsInOverTcpAndKicksAnOversizedFrame()
        {
            using var cancellation = new CancellationTokenSource();
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new PlayerStore(":memory:")));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01" } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(stream))!.LoginResult.Result);
            Assert.Equal("hero_01", (await ReadAsync(stream))!.EntitiesEnter.Entities[0].Name);

            // varint 길이 16383. 서버가 받는 상한(256바이트)을 넘는다.
            await stream.WriteAsync(new byte[] { 0xFF, 0x7F });
            Assert.Equal(KickReason.MalformedPacket, (await ReadAsync(stream))!.Kicked.Reason);
            Assert.Null(await ReadAsync(stream));

            cancellation.Cancel();
            await running;
        }

        /// <summary>
        /// Ping을 보내는 동안은 연결이 유지되고, 아무것도 보내지 않으면 IDLE_TIMEOUT을 받고 끊긴다.
        /// </summary>
        [Fact]
        public async Task KicksAConnectionThatSendsNothing()
        {
            using var cancellation = new CancellationTokenSource();
            // 시간 제한 10틱(0.5초).
            var server = new GameServer(
                new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new PlayerStore(":memory:")), idleTimeoutTicks: 10);
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01" } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(stream))!.LoginResult.Result);
            await ReadAsync(stream);

            // 시간 제한의 두 배(1초) 동안 0.2초마다 Ping을 보낸다.
            for (int count = 0; count < 5; count++)
            {
                await Task.Delay(200);
                new Packet { Ping = new Ping() }.WriteDelimitedTo(stream);
                Assert.Equal(Packet.BodyOneofCase.Pong, (await ReadAsync(stream))!.BodyCase);
            }

            Assert.Equal(KickReason.IdleTimeout, (await ReadAsync(stream))!.Kicked.Reason);
            Assert.Null(await ReadAsync(stream));

            cancellation.Cancel();
            await running;
        }

        /// <summary>
        /// 서버가 내려가면 연결마다 SERVER_SHUTDOWN을 보내고, 위치를 저장하고 닫는다.
        /// </summary>
        [Fact]
        public async Task ShutdownKicksEveryConnectionAndSaves()
        {
            using var cancellation = new CancellationTokenSource();
            using var store = new PlayerStore(":memory:");
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), store));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01" } }.WriteDelimitedTo(stream);
            await ReadAsync(stream);

            cancellation.Cancel();
            Packet? packet;
            do
            {
                packet = await ReadAsync(stream);
            }
            while ((packet != null) && (packet.BodyCase != Packet.BodyOneofCase.Kicked));

            Assert.Equal(KickReason.ServerShutdown, packet!.Kicked.Reason);
            client.Close();
            await running.WaitAsync(s_timeout);
            Assert.Equal(new SavedPosition(0, 0, 0), store.Load("hero_01"));
        }

        /// <summary>
        /// 서버가 보낸 패킷 하나를 읽는다. 서버가 닫았으면 null.
        /// </summary>
        private static async Task<Packet?> ReadAsync(NetworkStream stream)
        {
            using var timeout = new CancellationTokenSource(s_timeout);
            return await PacketReader.ReadAsync(stream, new byte[64 * 1024], timeout.Token);
        }
    }
}
