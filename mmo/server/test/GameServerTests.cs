using System;
using System.Linq;
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
        /// 로그인하고 캐릭터를 만들어 들어가면 내 능력치와 상태(SelfStats, SelfVitals), 내 EntitiesEnter가 차례로 오고, 상한을 넘는 길이를 보내면 MALFORMED_PACKET을 받고 끊긴다.
        /// </summary>
        [Fact]
        public async Task LogsInOverTcpAndKicksAnOversizedFrame()
        {
            using var cancellation = new CancellationTokenSource();
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new CharacterStore(":memory:"), TestData.Data));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(stream))!.LoginResult.Result);
            Assert.Empty((await ReadAsync(stream))!.CharacterList.Characters);

            new Packet { CreateCharacter = new CreateCharacter { Name = "Arthur", CharacterClass = CharacterClass.Knight } }.WriteDelimitedTo(stream);
            Assert.Equal(CreateCharacterResultCode.Ok, (await ReadAsync(stream))!.CreateCharacterResult.Result);
            CharacterSummary created = (await ReadAsync(stream))!.CharacterList.Characters.Single();

            new Packet { EnterWorld = new EnterWorld { CharacterId = created.Id } }.WriteDelimitedTo(stream);
            Assert.Equal(EnterWorldResultCode.Ok, (await ReadAsync(stream))!.EnterWorldResult.Result);
            Assert.Equal(0u, (await ReadAsync(stream))!.ExpGained.Exp);
            Assert.Equal(6, (await ReadAsync(stream))!.Cooldowns.Entries.Count);
            Assert.Equal(2, (await ReadAsync(stream))!.Inventory.Slots.Count);
            Assert.Equal(new uint[] { 101 }, (await ReadAsync(stream))!.LearnedSkills.Skills);
            Assert.Equal(8, (await ReadAsync(stream))!.Quickslots.Slots.Count);
            Assert.Equal(0u, (await ReadAsync(stream))!.PetState.PetId);
            Assert.Equal(0, (await ReadAsync(stream))!.Karma.Karma_);
            Assert.Equal(TestData.KnightLevel1.MaxHp, (await ReadAsync(stream))!.SelfStats.MaxHp);
            Assert.Equal(TestData.KnightLevel1.MaxHp, (await ReadAsync(stream))!.SelfVitals.Hp);
            Assert.Equal("Arthur", (await ReadAsync(stream))!.EntitiesEnter.Entities[0].Name);

            // varint 길이 16383. 서버가 받는 상한(256바이트)을 넘는다.
            await stream.WriteAsync(new byte[] { 0xFF, 0x7F });
            Assert.Equal(KickReason.MalformedPacket, (await ReadAsync(stream))!.Kicked.Reason);
            Assert.Null(await ReadAsync(stream));

            cancellation.Cancel();
            await running;
        }

        /// <summary>
        /// 데이터 해시가 다른 Login은 DATA_MISMATCH를 받고 끊긴다.
        /// </summary>
        [Fact]
        public async Task RejectsAnotherDataHashOverTcp()
        {
            using var cancellation = new CancellationTokenSource();
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new CharacterStore(":memory:"), TestData.Data));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash ^ 1 } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.DataMismatch, (await ReadAsync(stream))!.LoginResult.Result);
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
                new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new CharacterStore(":memory:"), TestData.Data), idleTimeoutTicks: 10);
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
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
            using var store = new CharacterStore(":memory:");
            long id = store.Create("hero_01", "Arthur", CharacterClass.Knight, TestData.Saved(0, 0)).Id;
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), store, TestData.Data));
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)id } }.WriteDelimitedTo(stream);
            Packet? entered;
            do
            {
                entered = await ReadAsync(stream);
            }
            while ((entered != null) && (entered.BodyCase != Packet.BodyOneofCase.EnterWorldResult));

            Assert.Equal(EnterWorldResultCode.Ok, entered!.EnterWorldResult.Result);

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
            Assert.Equal(new SavedPosition(0, 0, 0), store.Load(id)!.State.Position);
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
