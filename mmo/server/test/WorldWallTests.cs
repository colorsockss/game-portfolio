using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 벽이 있는 월드: 이동 검증(벽을 지나거나 막힌 칸으로 가는 Move의 되돌림)과 들어오는 자리(마을의 부활 지점, 막힌 자리에서 옮김,
    /// --spawn-half-extent). 맵은 글자로 그린 16 m 필드다.
    /// </summary>
    public partial class WorldTests
    {
        private const int M = Units.PerMeter;

        /// <summary>
        /// x = 1 m 칸의 세로 벽(z = -2..2 m). 원점의 플레이어 오른쪽에 있다.
        /// </summary>
        private static readonly string[] s_wallRows =
        {
            "................",
            "................",
            "................",
            "................",
            "................",
            ".........#......", // z = 2
            ".........#......",
            ".........#......", // z = 0
            ".........#......",
            ".........#......", // z = -2
            "................",
            "................",
            "................",
            "................",
            "................",
            "................",
        };

        [Fact]
        public void MovesThroughOrIntoAWallAreReset()
        {
            World world = WallWorld();
            Session session = Join(world, "hero_01");
            Fill(world);
            Take(session);

            Move(world, session, (2 * M) + 16, 16, ack: 0);
            Assert.Equal(new[] { Reset(0, 0, ack: 1) }, Take(session));

            Move(world, session, M + 16, 16, ack: 1);
            Assert.Equal(new[] { Reset(0, 0, ack: 2) }, Take(session));
            Assert.Equal((0, 0), (session.Player!.X, session.Player.Z));
        }

        /// <summary>
        /// 벽 곁의 칸 안에서 벽을 따라 걷는 Move는 되돌리지 않는다(서버는 캐릭터를 점으로 본다).
        /// </summary>
        [Fact]
        public void WalkingBesideAWallIsAccepted()
        {
            World world = WallWorld();
            Session session = Join(world, "hero_01");
            Fill(world);
            Take(session);

            Move(world, session, M - 1, 0, ack: 0);
            Move(world, session, M - 1, 3 * M, ack: 0);
            Assert.DoesNotContain(Take(session), packet => packet.BodyCase == Packet.BodyOneofCase.PositionReset);
            Assert.Equal((M - 1, 3 * M), (session.Player!.X, session.Player.Z));
        }

        [Fact]
        public void NewCharactersStartAtTheTownRespawnPoint()
        {
            World world = new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMap(-3, 2, s_wallRows));
            Session session = Join(world, "hero_01");
            Assert.Equal((-3 * M, 2 * M), (session.Player!.X, session.Player.Z));
        }

        /// <summary>
        /// 저장된 자리가 막힌 칸이거나 필드 밖이면 들어올 때 마을의 부활 지점으로 옮기고, 옮긴 자리를 저장한다.
        /// </summary>
        [Theory]
        [InlineData(M + 16, 16, "a wall")]
        [InlineData(100 * M, 0, "outside the 16 m field")]
        public void BlockedSavedPositionsMoveToTheRespawnPoint(int x, int z, string why)
        {
            var store = new CharacterStore(":memory:");
            long id = store.Create("hero_01", "hero01", CharacterClass.Knight, x, z).Character!.Id;
            World world = new World(10, spawnHalfExtent: 0, new Random(1), store, TestData.WithMap(-3, 2, s_wallRows));
            Session session = LogIn(world, "hero_01");
            Enter(world, session, id);
            Assert.True((-3 * M, 2 * M) == (session.Player!.X, session.Player.Z), why);

            world.SaveAll();
            Assert.Equal((-3 * M, 2 * M), (store.Load(id)!.Position.X, store.Load(id)!.Position.Z));
        }

        /// <summary>
        /// --spawn-half-extent를 주면 새 캐릭터는 정사각형 안의 걸을 수 있는 칸에서 시작한다. 반은 벽인 맵에서 여러 번 본다.
        /// </summary>
        [Fact]
        public void SpawnHalfExtentPicksWalkableCellsInTheSquare()
        {
            string[] rows = Enumerable.Repeat(string.Concat(Enumerable.Repeat(".#", 8)), 16).ToArray();
            GameData data = TestData.WithMap(0, 0, rows);
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            World world = new World(100, spawnHalfExtent: 6 * M, new Random(7), new CharacterStore(":memory:"), data);
            for (int i = 0; i < 30; i++)
            {
                Player player = Join(world, $"hero_{i:D2}").Player!;
                Assert.True(field.CanWalk(player.X, player.Z, Walker.Player), $"({player.X}, {player.Z}) is walkable");
                Assert.InRange(player.X, -6 * M, 6 * M);
                Assert.InRange(player.Z, -6 * M, 6 * M);
            }
        }

        private static World WallWorld()
        {
            return new World(10, spawnHalfExtent: 0, new Random(1), new CharacterStore(":memory:"), TestData.WithMap(0, 0, s_wallRows));
        }

        /// <summary>
        /// 1초를 지나 이동 거리를 가득 채운다.
        /// </summary>
        private static void Fill(World world)
        {
            for (uint i = 0; i < Units.TicksPerSecond; i++)
            {
                world.Step();
            }
        }

        private static Packet Reset(int x, int z, uint ack)
        {
            return new Packet { PositionReset = new PositionReset { X = x, Z = z, Ack = ack } };
        }
    }
}
