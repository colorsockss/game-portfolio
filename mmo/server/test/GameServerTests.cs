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
            var reader = new PacketReader(stream, 64 * 1024);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(reader))!.LoginResult.Result);
            Assert.Empty((await ReadAsync(reader))!.CharacterList.Characters);

            new Packet { CreateCharacter = new CreateCharacter { Name = "Arthur", CharacterClass = CharacterClass.Knight } }.WriteDelimitedTo(stream);
            Assert.Equal(CreateCharacterResultCode.Ok, (await ReadAsync(reader))!.CreateCharacterResult.Result);
            CharacterSummary created = (await ReadAsync(reader))!.CharacterList.Characters.Single();

            new Packet { EnterWorld = new EnterWorld { CharacterId = created.Id } }.WriteDelimitedTo(stream);
            Assert.Equal(EnterWorldResultCode.Ok, (await ReadAsync(reader))!.EnterWorldResult.Result);
            Assert.Equal(0u, (await ReadAsync(reader))!.ExpGained.Exp);
            Assert.Equal(6, (await ReadAsync(reader))!.Cooldowns.Entries.Count);
            Assert.Equal(2, (await ReadAsync(reader))!.Inventory.Slots.Count);
            Assert.Equal(new uint[] { 101 }, (await ReadAsync(reader))!.LearnedSkills.Skills);
            Assert.Equal(8, (await ReadAsync(reader))!.Quickslots.Slots.Count);
            Assert.Equal(new QuestState(), (await ReadAsync(reader))!.QuestState);
            Assert.Equal(0u, (await ReadAsync(reader))!.PetState.PetId);
            Assert.Equal(0, (await ReadAsync(reader))!.Karma.Karma_);
            Assert.Equal(TestData.KnightLevel1.MaxHp, (await ReadAsync(reader))!.SelfStats.MaxHp);
            Assert.Equal(TestData.KnightLevel1.MaxHp, (await ReadAsync(reader))!.SelfVitals.Hp);
            Assert.Equal("Arthur", (await ReadAsync(reader))!.EntitiesEnter.Entities[0].Name);

            // varint 길이 16383. 서버가 받는 상한(256바이트)을 넘는다.
            await stream.WriteAsync(new byte[] { 0xFF, 0x7F });
            Assert.Equal(KickReason.MalformedPacket, (await ReadAsync(reader))!.Kicked.Reason);
            Assert.Null(await ReadAsync(reader));

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
            var reader = new PacketReader(stream, 64 * 1024);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash ^ 1 } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.DataMismatch, (await ReadAsync(reader))!.LoginResult.Result);
            Assert.Null(await ReadAsync(reader));

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
            // 시간 제한 20틱(1초). Ping 간격(0.2초 + 왕복)과 넉넉히 떨어뜨려 붐비는 CI 러너에서 클라이언트가 늦게 돌아도 끊기지 않게 한다.
            var server = new GameServer(
                new IPEndPoint(IPAddress.Loopback, 0), new World(10, 0, new Random(1), new CharacterStore(":memory:"), TestData.Data), idleTimeoutTicks: 20);
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            var reader = new PacketReader(stream, 64 * 1024);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(reader))!.LoginResult.Result);
            await ReadAsync(reader);

            // 시간 제한의 두 배(2초) 동안 0.2초마다 Ping을 보낸다.
            for (int count = 0; count < 10; count++)
            {
                await Task.Delay(200);
                new Packet { Ping = new Ping() }.WriteDelimitedTo(stream);
                Assert.Equal(Packet.BodyOneofCase.Pong, (await ReadAsync(reader))!.BodyCase);
            }

            Assert.Equal(KickReason.IdleTimeout, (await ReadAsync(reader))!.Kicked.Reason);
            Assert.Null(await ReadAsync(reader));

            cancellation.Cancel();
            await running;
        }

        /// <summary>
        /// 틱 루프가 시간 제한보다 오래 멈춘 동안 온 Ping은 루프가 돌아온 틱에 받은 것으로 보아 끊지 않는다(틱 번호는 멈춘 만큼 건너뛴다).
        /// </summary>
        [Fact]
        public async Task KeepsAConnectionWhosePingArrivesWhileTheTickLoopStalls()
        {
            using var cancellation = new CancellationTokenSource();
            var world = new World(10, 0, new Random(1), new CharacterStore(":memory:"), TestData.Data);
            // 시간 제한 10틱(0.5초).
            var server = new GameServer(new IPEndPoint(IPAddress.Loopback, 0), world, idleTimeoutTicks: 10);
            Task running = server.RunAsync(cancellation.Token);

            using var client = new TcpClient();
            await client.ConnectAsync(IPAddress.Loopback, server.Port);
            NetworkStream stream = client.GetStream();
            var reader = new PacketReader(stream, 64 * 1024);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            Assert.Equal(LoginResultCode.Ok, (await ReadAsync(reader))!.LoginResult.Result);
            await ReadAsync(reader);

            // 다음 틱이 1초(20틱) 멈추고, 그 가운데에 Ping을 보낸다.
            int stalls = 0;
            world.StepHook = () =>
            {
                if (Interlocked.Increment(ref stalls) == 1)
                {
                    Thread.Sleep(1000);
                }
            };
            await Task.Delay(500);
            new Packet { Ping = new Ping() }.WriteDelimitedTo(stream);
            Assert.Equal(Packet.BodyOneofCase.Pong, (await ReadAsync(reader))!.BodyCase);
            // 끊었으면 Pong과 같은 틱에 Kicked가 뒤따른다. 한 번 더 보내 연결이 남았는지 본다.
            new Packet { Ping = new Ping() }.WriteDelimitedTo(stream);
            Assert.Equal(Packet.BodyOneofCase.Pong, (await ReadAsync(reader))!.BodyCase);

            // 서버가 내려갈 때 클라이언트가 닫기를 기다리지 않게 먼저 닫는다.
            client.Close();
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
            var reader = new PacketReader(stream, 64 * 1024);
            new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = "hero_01", DataHash = TestData.Hash } }.WriteDelimitedTo(stream);
            new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)id } }.WriteDelimitedTo(stream);
            Packet? entered;
            do
            {
                entered = await ReadAsync(reader);
            }
            while ((entered != null) && (entered.BodyCase != Packet.BodyOneofCase.EnterWorldResult));

            Assert.Equal(EnterWorldResultCode.Ok, entered!.EnterWorldResult.Result);

            cancellation.Cancel();
            Packet? packet;
            do
            {
                packet = await ReadAsync(reader);
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
        private static async Task<Packet?> ReadAsync(PacketReader reader)
        {
            using var timeout = new CancellationTokenSource(s_timeout);
            return await reader.ReadAsync(timeout.Token);
        }
    }
}
