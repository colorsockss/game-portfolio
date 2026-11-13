using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 소켓 없이 월드의 로그인, 캐릭터 선택, 이동 검증, 시야를 확인한다. 모든 캐릭터는 원점에서 시작하고,
    /// Join은 로그인 ID에서 밑줄을 뺀 이름의 기사를 만들어 들어간다.
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
        /// 월드에 들어가면 내 번호를 받고, 다음 틱에 나와 주변 개체가 EntitiesEnter로 온다. 주변 플레이어도 나를 받는다.
        /// </summary>
        [Fact]
        public void EnteringShowsSelfAndNeighbors()
        {
            World world = NewWorld();
            Session first = Join(world, "hero_01");
            world.Step();
            Assert.Equal(
                new[] { Entered(1), Enter(Entity(1, "hero01")) },
                Take(first));

            Session second = Join(world, "hero_02", CharacterClass.Mage);
            world.Step();
            Assert.Equal(new[] { Enter(Entity(2, "hero02", characterClass: CharacterClass.Mage)) }, Take(first));
            Assert.Equal(
                new[] { Entered(2, tick: 1), Enter(Entity(2, "hero02", characterClass: CharacterClass.Mage), Entity(1, "hero01")) },
                Take(second));
        }

        /// <summary>
        /// 로그인하면 결과와 캐릭터 목록이 온다. 캐릭터를 만들면 결과와 바뀐 목록이 오고, 목록은 만든 차례다.
        /// </summary>
        [Fact]
        public void LoginListsCharactersAndCreatingAddsThem()
        {
            World world = NewWorld();
            Session session = LogIn(world, "hero_01");
            Assert.Equal(new[] { LoginOk(), List() }, Take(session));

            Create(world, session, "기사01", CharacterClass.Knight);
            Create(world, session, "Merlin", CharacterClass.Mage);
            List<Packet> packets = Take(session);
            Assert.Equal(
                new[]
                {
                    Created(CreateCharacterResultCode.Ok), List(("기사01", CharacterClass.Knight)),
                    Created(CreateCharacterResultCode.Ok), List(("기사01", CharacterClass.Knight), ("Merlin", CharacterClass.Mage)),
                },
                packets.Select(WithoutIds));
            Assert.Equal(0, world.PlayerCount);
        }

        /// <summary>
        /// 이름 형식, 직업, 겹치는 이름(영문 대소문자를 가리지 않음, 다른 계정이어도), 캐릭터 수의 상한을 지킨다.
        /// </summary>
        [Fact]
        public void CreatingCharacterChecksNameClassAndCount()
        {
            World world = NewWorld();
            Session session = LogIn(world, "hero_01");
            Session other = LogIn(world, "hero_02");
            Take(session);
            Take(other);

            foreach (string invalid in new[] { "a", "thirteen_char", "공백 있음", "가나다라마바사아자차카타파", "abc\n" })
            {
                Create(world, session, invalid, CharacterClass.Knight);
                Assert.Equal(new[] { Created(CreateCharacterResultCode.InvalidName) }, Take(session));
            }

            Create(world, session, "Arthur", CharacterClass.Unspecified);
            Assert.Equal(new[] { Created(CreateCharacterResultCode.InvalidClass) }, Take(session));

            Create(world, other, "Arthur", CharacterClass.Knight);
            Take(other);
            Create(world, session, "ARTHUR", CharacterClass.Mage);
            Assert.Equal(new[] { Created(CreateCharacterResultCode.NameTaken) }, Take(session));

            for (int i = 0; i < (int)Constant.MaxCharacters; i++)
            {
                Create(world, session, $"Knight{i}", CharacterClass.Knight);
            }

            Take(session);
            Create(world, session, "OneTooMany", CharacterClass.Knight);
            Assert.Equal(new[] { Created(CreateCharacterResultCode.TooMany) }, Take(session));
            Assert.False(session.IsClosing);
        }

        /// <summary>
        /// 없는 캐릭터와 다른 계정의 캐릭터로는 들어갈 수 없고, 연결은 끊기지 않는다.
        /// </summary>
        [Fact]
        public void EnteringNeedsOwnCharacter()
        {
            World world = NewWorld();
            Session owner = LogIn(world, "hero_01");
            long id = CreateCharacter(world, owner, "Arthur");
            Session thief = LogIn(world, "hero_02");
            Take(thief);

            world.Receive(thief, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)id } });
            world.Receive(thief, new Packet { EnterWorld = new EnterWorld { CharacterId = 999 } });
            var noSuchCharacter = new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.NoSuchCharacter } };
            Assert.Equal(new[] { noSuchCharacter, noSuchCharacter }, Take(thief));
            Assert.Null(thief.Player);
            Assert.False(thief.IsClosing);
        }

        /// <summary>
        /// LeaveWorld는 캐릭터를 월드에서 빼고 목록을 다시 보낸다. 주변은 EntitiesLeave를 받고, 다시 들어가면 그 자리에서 이어 간다.
        /// </summary>
        [Fact]
        public void LeavingTheWorldReturnsToSelectionAndKeepsThePosition()
        {
            World world = NewWorld();
            Session leaver = Join(world, "hero_01");
            Session observer = Join(world, "hero_02");
            long id = leaver.Player!.CharacterId;
            WalkTo(world, leaver, 100, 0);
            Take(leaver);
            Take(observer);

            world.Receive(leaver, new Packet { LeaveWorld = new LeaveWorld() });
            Assert.Equal(new[] { List(("hero01", CharacterClass.Knight)) }, Take(leaver).Select(WithoutIds));
            Assert.Null(leaver.Player);
            world.Step();
            Assert.Equal(new[] { new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 1 } } } }, Take(observer));

            uint tick = world.Tick;
            Enter(world, leaver, id);
            world.Step();
            Assert.Equal(new[] { Entered(3, tick), Enter(Entity(3, "hero01", x: 100), Entity(2, "hero02")) }, Take(leaver));
        }

        /// <summary>
        /// 버전이 다르거나, 데이터 해시가 다르거나, ID 형식이 틀리거나, 동시 접속이 가득 차면 거절하고 끊는다. 이 차례로 본다.
        /// </summary>
        [Theory]
        [InlineData(ProtocolVersion.Unspecified, "abc", false, LoginResultCode.VersionMismatch)]
        [InlineData(ProtocolVersion.Current, "abc", false, LoginResultCode.DataMismatch)]
        [InlineData(ProtocolVersion.Current, "hero_02", false, LoginResultCode.DataMismatch)]
        [InlineData(ProtocolVersion.Current, "abc", true, LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "Hero_01", true, LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "hero_01\n", true, LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "a_seventeen_chars", true, LoginResultCode.InvalidLoginId)]
        [InlineData(ProtocolVersion.Current, "hero_02", true, LoginResultCode.ServerFull)]
        public void LoginRejects(ProtocolVersion version, string loginId, bool sameData, LoginResultCode expected)
        {
            World world = NewWorld(maxPlayers: 1);
            Join(world, "hero_01");
            var session = new Session();
            ulong hash = sameData ? TestData.Hash : TestData.Hash + 1;
            world.Receive(session, new Packet { Login = new Login { ProtocolVersion = version, LoginId = loginId, DataHash = hash } });

            Assert.Equal(new[] { new Packet { LoginResult = new LoginResult { Result = expected } } }, Take(session));
            Assert.True(session.IsClosing);
            Assert.Equal(1, world.PlayerCount);
        }

        /// <summary>
        /// 같은 계정으로 다시 로그인하면 예전 연결은 DUPLICATE_LOGIN으로 끊기고 캐릭터는 월드에서 빠진다. 새 연결이 같은 캐릭터로
        /// 들어가면 그 자리에서 새 번호로 이어 간다. 동시 접속이 가득 차도 자리를 넘겨받는다.
        /// </summary>
        [Fact]
        public void DuplicateLoginKicksTheOldConnectionAndKeepsThePosition()
        {
            World world = NewWorld(maxPlayers: 1);
            Session old = Join(world, "hero_01");
            long id = old.Player!.CharacterId;
            WalkTo(world, old, 100, 0);
            Take(old);

            Session renewed = LogIn(world, "hero_01");
            Assert.Equal(new[] { new Packet { Kicked = new Kicked { Reason = KickReason.DuplicateLogin } } }, Take(old));
            Assert.True(old.IsClosing);
            Assert.Null(old.Player);
            Assert.Equal(0, world.PlayerCount);

            Take(renewed);
            uint tick = world.Tick;
            Enter(world, renewed, id);
            world.Step();
            Assert.Equal(new[] { Entered(2, tick), Enter(Entity(2, "hero01", x: 100)) }, Take(renewed));
        }

        /// <summary>
        /// 쌓인 거리보다 먼 Move는 ack를 올린 PositionReset으로 되돌리고, 되돌림 전의 ack를 실은 Move는 버린다.
        /// </summary>
        [Fact]
        public void TooFarMoveIsResetAndStaleAckMovesAreDropped()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
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
            Session session = Join(world, "hero_01");
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
            Session mover = Join(world, "hero_01");
            Session observer = Join(world, "hero_02");
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
            Session walker = Join(world, "hero_01");
            Session stayer = Join(world, "hero_02");
            world.Step();
            Take(walker);
            Take(stayer);

            WalkTo(world, walker, CellSize * 2, 0);
            Assert.Contains(new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 1 } } }, Take(stayer));
            Assert.Contains(new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 2 } } }, Take(walker));

            WalkTo(world, walker, CellSize * 2 - Stride, 0);
            Assert.Equal(new[] { Enter(Entity(1, "hero01", x: CellSize * 2 - Stride)) }, Take(stayer));
            Assert.Equal(new[] { Enter(Entity(2, "hero02")) }, Take(walker));
        }

        /// <summary>
        /// 연결이 끊기면 다음 틱에 주변 플레이어가 EntitiesLeave를 받는다.
        /// </summary>
        [Fact]
        public void DisconnectLeavesTheView()
        {
            World world = NewWorld();
            Session leaving = Join(world, "hero_01");
            Session observer = Join(world, "hero_02");
            world.Step();
            Take(observer);

            world.Disconnect(leaving);
            world.Step();
            Assert.Equal(new[] { new Packet { EntitiesLeave = new EntitiesLeave { Ids = { 1 } } } }, Take(observer));
            Assert.Equal(1, world.PlayerCount);
        }

        /// <summary>
        /// Ping은 로그인 전이든 뒤든 그 틱에 그 틱 번호를 실은 Pong으로 답한다.
        /// </summary>
        [Fact]
        public void PingIsAnsweredWithPong()
        {
            var pong = new Packet { Pong = new Pong() };
            World world = NewWorld();

            var notLoggedIn = new Session();
            world.Receive(notLoggedIn, new Packet { Ping = new Ping() });
            Assert.Equal(new[] { pong }, Take(notLoggedIn));
            Assert.False(notLoggedIn.IsClosing);

            Session loggedIn = Join(world, "hero_01");
            world.Step();
            Take(loggedIn);
            world.Receive(loggedIn, new Packet { Ping = new Ping() });
            Assert.Equal(new[] { new Packet { Pong = new Pong { Tick = 1 } } }, Take(loggedIn));
        }

        /// <summary>
        /// 상태에 맞지 않는 요청(로그인 전의 캐릭터 요청, 캐릭터 선택 중의 Move와 LeaveWorld, 월드 안의 캐릭터 만들기와 들어가기,
        /// 두 번째 Login), 범위 밖의 yaw, 서버가 보내는 패킷은 MALFORMED_PACKET으로 끊는다.
        /// </summary>
        [Theory]
        [MemberData(nameof(OutOfStateRequests))]
        public void ProtocolViolationsKickAsMalformed(string state, Packet packet)
        {
            World world = NewWorld();
            Session session = state switch
            {
                "connected" => new Session(),
                "selecting" => LogIn(world, "hero_01"),
                _ => Join(world, "hero_01"),
            };
            Take(session);

            world.Receive(session, packet);
            Assert.Equal(new[] { new Packet { Kicked = new Kicked { Reason = KickReason.MalformedPacket } } }, Take(session));
            Assert.True(session.IsClosing);
            Assert.Equal(0, world.PlayerCount);
        }

        /// <summary>
        /// 상태마다 보낼 수 없는 패킷.
        /// </summary>
        public static TheoryData<string, Packet> OutOfStateRequests()
        {
            return new TheoryData<string, Packet>
            {
                { "connected", new Packet { Move = new Move() } },
                { "connected", new Packet { CreateCharacter = new CreateCharacter { Name = "Arthur", CharacterClass = CharacterClass.Knight } } },
                { "connected", new Packet { EnterWorld = new EnterWorld { CharacterId = 1 } } },
                { "selecting", LoginPacket("hero_01") },
                { "selecting", new Packet { Move = new Move() } },
                { "selecting", new Packet { LeaveWorld = new LeaveWorld() } },
                { "playing", LoginPacket("hero_01") },
                { "playing", new Packet { CreateCharacter = new CreateCharacter { Name = "Arthur", CharacterClass = CharacterClass.Knight } } },
                { "playing", new Packet { EnterWorld = new EnterWorld { CharacterId = 1 } } },
                { "playing", new Packet { Move = new Move { Yaw = Units.YawSteps } } },
                { "playing", new Packet { EntitiesLeave = new EntitiesLeave() } },
            };
        }

        /// <summary>
        /// 나간 플레이어의 위치는 그 틱에 저장되고, 서버를 다시 띄운 뒤 같은 캐릭터로 들어오면 그 자리에서 시작한다.
        /// </summary>
        [Fact]
        public void LeavingSavesThePositionForTheNextServer()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            WalkTo(world, session, 100, 0);
            Move(world, session, 100, 0, ack: 0, yaw: 32);
            world.Disconnect(session);
            world.Step();
            Assert.Equal(new SavedPosition(100, 0, 32), store.Load(id)!.Position);

            World restarted = NewWorld(store: store);
            Session again = LogIn(restarted, "hero_01");
            Take(again);
            Enter(restarted, again, id);
            restarted.Step();
            Assert.Equal(
                new[] { Entered(1), Enter(new EntityEnter { Id = 1, X = 100, Yaw = 32, Name = "hero01", CharacterClass = CharacterClass.Knight }) },
                Take(again));
        }

        /// <summary>
        /// 나간 틱 안에 다시 들어오면 아직 저장하지 않은 위치에서 이어 간다.
        /// </summary>
        [Fact]
        public void RejoiningBeforeTheSaveKeepsThePosition()
        {
            World world = NewWorld();
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            WalkTo(world, session, 100, 0);
            world.Disconnect(session);

            uint tick = world.Tick;
            Session again = LogIn(world, "hero_01");
            Take(again);
            Enter(world, again, id);
            world.Step();
            Assert.Equal(new[] { Entered(2, tick), Enter(Entity(2, "hero01", x: 100)) }, Take(again));
        }

        /// <summary>
        /// 틱이 밀려 저장 차례를 여러 번 건너뛰어도 한 번 저장하고, 다음 저장은 원래 위상(간격의 배수)에 온다.
        /// </summary>
        [Fact]
        public void SkippedTicksSaveOnceAndKeepThePhase()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            WalkTo(world, session, 100, 0);

            world.Step(World.SaveIntervalTicks * 2);
            Assert.Equal(new SavedPosition(100, 0, 0), store.Load(id)!.Position);

            Move(world, session, 200, 0, ack: 0);
            while (world.Tick % World.SaveIntervalTicks != World.SaveIntervalTicks - 1)
            {
                world.Step();
            }

            Assert.Equal(new SavedPosition(100, 0, 0), store.Load(id)!.Position);
            world.Step();
            Assert.Equal(new SavedPosition(200, 0, 0), store.Load(id)!.Position);
        }

        /// <summary>
        /// 이동 거리는 다음 틱까지 지날 틱 수만큼 찬다.
        /// </summary>
        [Fact]
        public void TheMoveBudgetFillsForTheElapsedTicks()
        {
            World world = NewWorld();
            Session one = Join(world, "hero_01");
            world.Step();
            Move(world, one, 50, 0, ack: 0);
            Assert.Equal(0, one.Player!.X);

            Session five = Join(world, "hero_02");
            world.Step(5);
            Move(world, five, 50, 0, ack: 0);
            Assert.Equal(50, five.Player!.X);
        }

        /// <summary>
        /// 접속 중인 플레이어는 움직였으면 저장 간격마다 저장된다.
        /// </summary>
        [Fact]
        public void MovedPlayersAreSavedEveryInterval()
        {
            using var store = new CharacterStore(":memory:");
            World world = NewWorld(store: store);
            Session session = Join(world, "hero_01");
            long id = session.Player!.CharacterId;
            WalkTo(world, session, 100, 0);
            Assert.Equal(new SavedPosition(0, 0, 0), store.Load(id)!.Position);

            while (world.Tick % World.SaveIntervalTicks != 0)
            {
                world.Step();
            }

            Assert.Equal(new SavedPosition(100, 0, 0), store.Load(id)!.Position);
        }

        /// <summary>
        /// 모든 플레이어가 원점에서 시작하는 월드.
        /// </summary>
        private static World NewWorld(int maxPlayers = 10, CharacterStore? store = null)
        {
            return new World(maxPlayers, spawnHalfExtent: 0, new Random(1), store ?? new CharacterStore(":memory:"), TestData.Data);
        }

        /// <summary>
        /// 새 연결로 로그인한다(캐릭터 선택에 머문다).
        /// </summary>
        private static Session LogIn(World world, string loginId)
        {
            var session = new Session();
            world.Receive(session, LoginPacket(loginId));
            return session;
        }

        /// <summary>
        /// 새 연결로 로그인해 로그인 ID에서 밑줄을 뺀 이름의 캐릭터를 만들고 월드에 들어간다. 선택 중의 패킷은 비우고
        /// EnterWorldResult만 남긴다.
        /// </summary>
        private static Session Join(World world, string loginId, CharacterClass characterClass = CharacterClass.Knight)
        {
            Session session = LogIn(world, loginId);
            long id = CreateCharacter(world, session, loginId.Replace("_", string.Empty), characterClass);
            Enter(world, session, id);
            return session;
        }

        /// <summary>
        /// 캐릭터를 만들고 그 번호를 낸다(만든 뒤 오는 목록에서 찾는다). 쌓인 패킷은 비운다.
        /// </summary>
        private static long CreateCharacter(World world, Session session, string name, CharacterClass characterClass = CharacterClass.Knight)
        {
            Create(world, session, name, characterClass);
            List<Packet> packets = Take(session);
            Assert.Contains(Created(CreateCharacterResultCode.Ok), packets);
            return (long)packets.Last(p => p.BodyCase == Packet.BodyOneofCase.CharacterList).CharacterList.Characters.Single(c => c.Name == name).Id;
        }

        /// <summary>
        /// CreateCharacter 하나를 보낸다.
        /// </summary>
        private static void Create(World world, Session session, string name, CharacterClass characterClass)
        {
            world.Receive(session, new Packet { CreateCharacter = new CreateCharacter { Name = name, CharacterClass = characterClass } });
        }

        /// <summary>
        /// EnterWorld 하나를 보낸다.
        /// </summary>
        private static void Enter(World world, Session session, long characterId)
        {
            world.Receive(session, new Packet { EnterWorld = new EnterWorld { CharacterId = (ulong)characterId } });
        }

        /// <summary>
        /// 지금 버전의 Login 패킷.
        /// </summary>
        private static Packet LoginPacket(string loginId)
        {
            return new Packet { Login = new Login { ProtocolVersion = ProtocolVersion.Current, LoginId = loginId, DataHash = TestData.Hash } };
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
        private static Packet LoginOk()
        {
            return new Packet { LoginResult = new LoginResult { Result = LoginResultCode.Ok } };
        }

        /// <summary>
        /// 월드에 들어간 패킷. tick은 들어간 틱이다.
        /// </summary>
        private static Packet Entered(uint selfId, uint tick = 0)
        {
            return new Packet { EnterWorldResult = new EnterWorldResult { Result = EnterWorldResultCode.Ok, SelfId = selfId, Tick = tick } };
        }

        /// <summary>
        /// 캐릭터 만들기의 결과 패킷.
        /// </summary>
        private static Packet Created(CreateCharacterResultCode result)
        {
            return new Packet { CreateCharacterResult = new CreateCharacterResult { Result = result } };
        }

        /// <summary>
        /// 캐릭터 목록 패킷. 캐릭터 번호는 비교하지 않도록 0이다(WithoutIds와 함께 쓴다).
        /// </summary>
        private static Packet List(params (string Name, CharacterClass Class)[] characters)
        {
            var list = new CharacterList();
            foreach ((string name, CharacterClass characterClass) in characters)
            {
                list.Characters.Add(new CharacterSummary { Name = name, CharacterClass = characterClass });
            }

            return new Packet { CharacterList = list };
        }

        /// <summary>
        /// 캐릭터 목록의 번호를 0으로 바꾼 사본. 다른 패킷은 그대로다.
        /// </summary>
        private static Packet WithoutIds(Packet packet)
        {
            Packet copy = packet.Clone();
            if (copy.BodyCase == Packet.BodyOneofCase.CharacterList)
            {
                foreach (CharacterSummary character in copy.CharacterList.Characters)
                {
                    character.Id = 0;
                }
            }

            return copy;
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
        private static EntityEnter Entity(uint id, string name, int x = 0, int z = 0, CharacterClass characterClass = CharacterClass.Knight)
        {
            return new EntityEnter { Id = id, X = x, Z = z, Name = name, CharacterClass = characterClass };
        }
    }
}
