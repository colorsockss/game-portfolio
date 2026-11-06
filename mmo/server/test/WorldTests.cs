using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 소켓 없이 월드의 로그인, 이동 검증, 시야를 확인한다. 모든 플레이어는 원점에서 시작한다.
    /// </summary>
    public class WorldTests
    {
        /// <summary>
        /// 시야 칸 한 변(칸). 둘레 3×3칸이 보이므로 두 칸 떨어지면 보이지 않는다.
        /// </summary>
        private const int CellSize = 1024;

        /// <summary>
        /// 한 틱에 확실히 받아들여지는 이동 거리(칸). 틱마다 차오르는 거리(10.56칸)보다 조금 짧다.
        /// </summary>
        private const int Stride = 10;

        /// <summary>
        /// 로그인하면 내 번호를 받고, 다음 틱에 나와 주변 개체가 EntitiesEnter로 온다. 주변 플레이어도 나를 받는다.
        /// </summary>
        [Fact]
        public void LoginEntersSelfAndNeighbors()
        {
            World world = NewWorld();
            Session first = LogIn(world, "hero_01");
            world.Step();
            Assert.Equal(
                new[] { LoginOk(1), Enter(Entity(1, "hero_01")) },
                Take(first));

            Session second = LogIn(world, "hero_02");
            world.Step();
            Assert.Equal(new[] { Enter(Entity(2, "hero_02")) }, Take(first));
            Assert.Equal(
                new[] { LoginOk(2), Enter(Entity(2, "hero_02"), Entity(1, "hero_01")) },
                Take(second));
        }

        /// <summary>
        /// 버전이 다르거나, ID 형식이 틀리거나, 동시 접속이 가득 차면 거절하고 끊는다.
        /// </summary>
        [Theory]
        [InlineData(ProtocolVersion.Unspecified, "hero_01", LoginResultCode.VersionMismatch)]
        [InlineData(ProtocolVersion.Current, "abc", LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "Hero_01", LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "hero_01\n", LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "a_seventeen_chars", LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "hero_02", LoginResultCode.ServerFull)]
        public void LoginRejects(ProtocolVersion version, string loginId, LoginResultCode expected)
        {
            World world = NewWorld(maxPlayers: 1);
            LogIn(world, "hero_01");
            var session = new Session();
            world.Receive(session, new Packet { Login = new Login { ProtocolVersion = version, LoginId = loginId } });

            Assert.Equal(new[] { new Packet { LoginResult = new LoginResult { Result = expected } } }, Take(session));
            Assert.True(session.IsClosing);
            Assert.Equal(1, world.PlayerCount);
        }

        /// <summary>
        /// 같은 ID로 다시 로그인하면 예전 연결은 DUPLICATE_LOGIN으로 끊기고, 새 연결이 그 자리에서 새 번호로 이어 간다.
        /// 동시 접속이 가득 차도 자리를 넘겨받는다.
        /// </summary>
        [Fact]
        public void DuplicateLoginKicksTheOldConnectionAndKeepsThePosition()
        {
            World world = NewWorld(maxPlayers: 1);
            Session old = LogIn(world, "hero_01");
            WalkTo(world, old, 100, 0);
            Take(old);

            Session renewed = LogIn(world, "hero_01");
            world.Step();
            Assert.Equal(new[] { new Packet { Kicked = new Kicked { Reason = KickReason.DuplicateLogin } } }, Take(old));
            Assert.True(old.IsClosing);
            Assert.Null(old.Player);
            Assert.Equal(new[] { LoginOk(2), Enter(Entity(2, "hero_01", x: 100)) }, Take(renewed));
        }

        /// <summary>
        /// 쌓인 거리보다 먼 Move는 ack를 올린 PositionReset으로 되돌리고, 되돌림 전의 ack를 실은 Move는 버린다.
        /// </summary>
        [Fact]
        public void TooFarMoveIsResetAndStaleAckMovesAreDropped()
        {
            World world = NewWorld();
            Session session = LogIn(world, "hero_01");
            world.Step();
            Take(session);

            Move(world, session, Stride * 2, 0, ack: 0);
            Assert.Equal(
                new[] { new Packet { PositionReset = new PositionReset { X = 0, Z = 0, Ack = 1 } } },
                Take(session));

            Move(world, session, Stride, 0, ack: 0);
            Assert.Equal(0, session.Player!.X);

            Move(world, session, Stride, 0, ack: 1);
            Assert.Equal(Stride, session.Player.X);
            Assert.Empty(Take(session));
        }

        /// <summary>
        /// 맵 밖으로 가는 Move는 거리가 맞아도 되돌린다.
        /// </summary>
        [Fact]
        public void MoveOutsideTheMapIsReset()
        {
            World world = NewWorld();
            Session session = LogIn(world, "hero_01");
            WalkTo(world, session, Units.MapHalfExtent, 0);
            Take(session);

            Move(world, session, Units.MapHalfExtent + 1, 0, ack: 0);
            Assert.Equal(
                new[] { new Packet { PositionReset = new PositionReset { X = Units.MapHalfExtent, Z = 0, Ack = 1 } } },
                Take(session));
        }

        /// <summary>
        /// 움직인 개체는 그 틱의 EntityMoves로 주변 플레이어에게 가고, 움직인 본인은 받지 않는다.
        /// </summary>
        [Fact]
        public void MovesReachObserversButNotTheMover()
        {
            World world = NewWorld();
            Session mover = LogIn(world, "hero_01");
            Session observer = LogIn(world, "hero_02");
            world.Step();
            Take(mover);
            Take(observer);

            uint tick = world.Tick;
            Move(world, mover, 8, -6, ack: 0, yaw: 64);
            world.Step();
            Assert.Empty(Take(mover));
            Assert.Equal(
                new[]
                {
                    new Packet
                    {
                        EntityMoves = new EntityMoves
                        {
                            Tick = tick,
                            Entities = { new EntityMove { Id = 1, X = 8, Z = -6, Yaw = 64 } },
                        },
                    },
                },
                Take(observer));
        }

        /// <summary>
        /// 두 칸 넘게 멀어지면 EntitiesLeave, 다시 다가오면 EntitiesEnter가 양쪽에 간다.
        /// </summary>
        [Fact]
        public void PlayersLeaveAndEnterTheViewAsTheyWalk()
        {
            World world = NewWorld();
            Session walker = LogIn(world, "hero_01");
            Session stayer = LogIn(world, "hero_02");
            world.Step();
            Take(walker);
            Take(stayer);

            WalkTo(world, walker, CellSize * 2, 0);
            Assert.Contains(new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 1 } } }, Take(stayer));
            Assert.Contains(new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 2 } } }, Take(walker));

            WalkTo(world, walker, CellSize * 2 - Stride, 0);
            Assert.Equal(new[] { Enter(Entity(1, "hero_01", x: CellSize * 2 - Stride)) }, Take(stayer));
            Assert.Equal(new[] { Enter(Entity(2, "hero_02")) }, Take(walker));
        }

        /// <summary>
        /// 연결이 끊기면 다음 틱에 주변 플레이어가 EntitiesLeave를 받는다.
        /// </summary>
        [Fact]
        public void DisconnectLeavesTheView()
        {
            World world = NewWorld();
            Session leaving = LogIn(world, "hero_01");
            Session observer = LogIn(world, "hero_02");
            world.Step();
            Take(observer);

            world.Disconnect(leaving);
            world.Step();
            Assert.Equal(new[] { new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 1 } } } }, Take(observer));
            Assert.Equal(1, world.PlayerCount);
        }

        /// <summary>
        /// 로그인 전의 Move, 두 번째 Login, 범위 밖의 yaw, 서버가 보내는 패킷은 MALFORMED_PACKET으로 끊는다.
        /// </summary>
        [Fact]
        public void ProtocolViolationsKickAsMalformed()
        {
            var malformed = new Packet { Kicked = new Kicked { Reason = KickReason.MalformedPacket } };
            World world = NewWorld();

            var notLoggedIn = new Session();
            world.Receive(notLoggedIn, new Packet { Move = new Move() });
            Assert.Equal(new[] { malformed }, Take(notLoggedIn));
            Assert.True(notLoggedIn.IsClosing);

            Session twice = LogIn(world, "hero_01");
            Take(twice);
            world.Receive(twice, LoginPacket("hero_01"));
            Assert.Equal(new[] { malformed }, Take(twice));

            Session badYaw = LogIn(world, "hero_02");
            Take(badYaw);
            Move(world, badYaw, 0, 0, ack: 0, yaw: Units.YawSteps);
            Assert.Equal(new[] { malformed }, Take(badYaw));

            Session serverPacket = LogIn(world, "hero_03");
            Take(serverPacket);
            world.Receive(serverPacket, new Packet { EntitiesLeave = new EntitiesLeave() });
            Assert.Equal(new[] { malformed }, Take(serverPacket));
            Assert.Equal(0, world.PlayerCount);
        }

        /// <summary>
        /// 모든 플레이어가 원점에서 시작하는 월드.
        /// </summary>
        private static World NewWorld(int maxPlayers = 10)
        {
            return new World(maxPlayers, spawnHalfExtent: 0, new Random(1));
        }

        /// <summary>
        /// 새 연결로 로그인한다.
        /// </summary>
        private static Session LogIn(World world, string loginId)
        {
            var session = new Session();
            world.Receive(session, LoginPacket(loginId));
            return session;
        }

        /// <summary>
        /// 지금 버전의 Login 패킷.
        /// </summary>
        private static Packet LoginPacket(string loginId)
        {
            return new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = loginId } };
        }

        /// <summary>
        /// Move 하나를 보낸다.
        /// </summary>
        private static void Move(World world, Session session, int x, int z, uint ack, uint yaw = 0)
        {
            world.Receive(session, new Packet { Move = new Move { X = x, Z = z, Yaw = yaw, Ack = ack } });
        }

        /// <summary>
        /// 틱마다 Stride씩 x 축으로 걸어 (x, z)에 닿는다. 출발할 때 한 틱을 진행해 거리를 채운다.
        /// </summary>
        private static void WalkTo(World world, Session session, int x, int z)
        {
            Player player = session.Player!;
            world.Step();
            while (player.X != x)
            {
                int next = player.X + Math.Clamp(x - player.X, -Stride, Stride);
                Move(world, session, next, z, player.Ack);
                world.Step();
            }
        }

        /// <summary>
        /// 쌓인 패킷을 꺼내고 비운다.
        /// </summary>
        private static List<Packet> Take(Session session)
        {
            List<Packet> packets = session.Outbox.ToList();
            session.Outbox.Clear();
            return packets;
        }

        /// <summary>
        /// 로그인 성공 패킷.
        /// </summary>
        private static Packet LoginOk(uint selfId)
        {
            return new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok, SelfId = selfId } };
        }

        /// <summary>
        /// 시야에 들어온 개체들의 패킷.
        /// </summary>
        private static Packet Enter(params EntityEnter[] entities)
        {
            return new Packet { EntitiesEnter = new EntitiesEnter { Entities = { entities } } };
        }

        /// <summary>
        /// 시야에 들어온 개체 하나.
        /// </summary>
        private static EntityEnter Entity(uint id, string name, int x = 0, int z = 0)
        {
            return new EntityEnter { Id = id, X = x, Z = z, Name = name };
        }
    }
}
