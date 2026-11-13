using System;
using System.IO;
using System.Linq;
using System.Text;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 벽, 걷는 쪽, 두 선 검사의 가장자리(모서리, 변, 끝점, 길이 0, 음수 좌표, 격자 밖)를 글자로 그린 맵에서 확인하고,
    /// 같은 맵과 선으로 비교 벡터(shared/vectors/walls.tsv)를 낸다. 클라이언트의 엔진 없는 테스트가 그 파일로 자기 FieldMap의 답을 맞춘다.
    /// </summary>
    public class FieldMapWallTests
    {
        /// <summary>
        /// 1 m의 좌표 단위 수.
        /// </summary>
        private const int M = Units.PerMeter;

        /// <summary>
        /// 16 m 필드(-8 m 이상 8 m 미만). 세로 벽 (-5, 3..5), 대각선으로 맞닿은 두 벽 (1, 1)과 (2, 0), 홀로 선 벽 (-2, -3).
        /// </summary>
        private static readonly string[] s_rows =
        {
            "................", // z = 7
            "................",
            "...#............", // z = 5
            "...#............",
            "...#............", // z = 3
            "................",
            ".........#......", // z = 1
            "..........#.....", // z = 0
            "................",
            "................",
            "......#.........", // z = -3
            "................",
            "................",
            "................",
            "................",
            "................", // z = -8
        };

        /// <summary>
        /// 점(1/32 m)과 기대하는 "걸을 수 있는지"(플레이어 쪽).
        /// </summary>
        private static readonly (int X, int Z, bool Walkable, string Why)[] s_points =
        {
            (0, 0, true, "an open cell"),
            (-5 * M, 4 * M, false, "the small corner of a wall cell is in the wall"),
            ((-4 * M) - 1, 4 * M, false, "the last unit of a wall cell"),
            (-4 * M, 4 * M, true, "the next cell is open"),
            ((-2 * M) + 5, (-3 * M) + 5, false, "inside the lone wall"),
            (-1, -1, true, "negative coordinates round down to cell -1"),
            ((8 * M) - 1, 0, true, "the last cell of the field"),
            (8 * M, 0, false, "exactly +8 m is outside the grid and walls"),
            (-8 * M, -8 * M, true, "exactly -8 m is inside"),
            ((-8 * M) - 1, 0, false, "below -8 m is outside"),
        };

        /// <summary>
        /// 선(1/32 m)과 기대하는 HasLine. 플레이어 쪽의 CanWalkLine도 같다.
        /// </summary>
        private static readonly (int Ax, int Az, int Bx, int Bz, bool Clear, string Why)[] s_lines =
        {
            (M / 2, M / 2, M / 2, (3 * M) + (M / 2), true, "an open column"),
            ((6 * M) + 16, -16, (7 * M) + 16, -16, true, "crossing one open boundary"),
            ((-6 * M) - 16, (4 * M) + 16, (-3 * M) - 16, (4 * M) + 16, false, "through the vertical wall"),
            ((M * 3) / 2, M / 2, (M * 5) / 2, (M * 3) / 2, false, "exactly through the corner between two diagonal walls"),
            ((M * 5) / 2, (M * 3) / 2, (M * 3) / 2, M / 2, false, "the same corner, drawn the other way"),
            ((M * 3) / 2, M / 2, (M * 5) / 2, (M * 3) / 2 + 1, false, "just above the corner it enters the wall at (1, 1)"),
            ((-3 * M) / 2, M, M / 2, M, true, "along an edge with open cells on both sides"),
            ((M * 5) / 4, M, (M * 7) / 4, M, false, "along an edge with a wall on one side"),
            ((-3 * M) / 2, M, M, M, false, "ending on the corner of a wall"),
            (-4 * M, (3 * M) + 16, -4 * M, (4 * M) + 16, false, "along the side of the vertical wall"),
            ((-3 * M) - 16, (4 * M) + 16, -4 * M, (4 * M) + 16, true, "walking up to the side of the wall from the open cell"),
            (-4 * M, (4 * M) + 16, (-3 * M) - 16, (4 * M) + 16, true, "walking away from the side of the wall"),
            ((-3 * M) - 16, (5 * M) + 16, -4 * M, 5 * M, true, "ending on the corner of the wall, coming from the open side"),
            ((-4 * M) + 4, (3 * M) + 16, (-4 * M) + 4, (5 * M) + 16, true, "beside the vertical wall, 1/8 m away"),
            (M / 2, (-5 * M) / 2, (-3 * M) / 2, (-5 * M) / 2, false, "ending inside a wall"),
            ((-5 * M) / 2, (-7 * M) / 2, -M / 2, (-3 * M) / 2, false, "a diagonal through the lone wall"),
            (0, 0, 0, 0, true, "a line of length 0 in an open cell"),
            (2 * M, M, 2 * M, M, true, "a line of length 0 on the corner of two walls sees only its own cell (2, 1)"),
            ((-2 * M) + 5, (-3 * M) + 5, (-2 * M) + 5, (-3 * M) + 5, false, "a line of length 0 in a wall"),
            (-1, -1, -M - 1, -1, true, "negative coordinates crossing the boundary at -1 m"),
            ((7 * M) + 16, 16, (8 * M) + 16, 16, false, "leaving the grid"),
            ((7 * M) + 16, 16, 8 * M, 16, false, "ending on the max edge touches the cell outside"),
            (-8 * M, 16, -8 * M, M + 16, false, "along the min edge touches the cells outside"),
            ((-8 * M) + 1, 16, (-8 * M) + 1, M + 16, true, "one unit inside the min edge"),
            (-7 * M, -7 * M, 7 * M, 7 * M, false, "a long diagonal through cell corners touches the wall at (1, 1)"),
            (-7 * M, -6 * M, 7 * M, -6 * M, true, "a long open line along a cell edge"),
        };

        [Fact]
        public void WallsComeFromTheGridAndOutsideIsAWall()
        {
            FieldMap field = Field();
            foreach ((int x, int z, bool walkable, string why) in s_points)
            {
                Assert.True(walkable == field.CanWalk(x, z, Walker.Player), $"({x}, {z}): {why}");
                Assert.True(walkable == !field.IsWall(x, z), $"({x}, {z}) wall: {why}");
            }
        }

        [Fact]
        public void LinesFollowTheEdgeRules()
        {
            FieldMap field = Field();
            foreach ((int ax, int az, int bx, int bz, bool clear, string why) in s_lines)
            {
                Assert.True(clear == field.HasLine(ax, az, bx, bz), $"({ax}, {az}) → ({bx}, {bz}): {why}");
                Assert.True(clear == field.HasLine(bx, bz, ax, az), $"({bx}, {bz}) → ({ax}, {az}) reversed: {why}");
            }
        }

        /// <summary>
        /// 플레이어 쪽의 CanWalkLine은 벡터의 모든 줄(정한 줄과 무작위 줄)에서 HasLine과 같다.
        /// </summary>
        [Fact]
        public void PlayersWalkWhereTheLineIsClear()
        {
            FieldMap field = Field();
            foreach ((int ax, int az, int bx, int bz) in Lines())
            {
                Assert.Equal(field.HasLine(ax, az, bx, bz), field.CanWalkLine(ax, az, bx, bz, Walker.Player));
            }
        }

        /// <summary>
        /// 안전 지대의 칸은 HasLine과 플레이어를 막지 않고 몬스터만 막는다. 벽은 둘 다 막는다.
        /// </summary>
        [Fact]
        public void SafeCellsStopOnlyMonsters()
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = TestData.Map(
                "....",
                ".ss.",
                ".#..",
                "....");
            var field = new FieldMap(size, zones, grid);
            (int ax, int az, int bx, int bz) across = ((-2 * M) + 16, 16, (2 * M) - 16, 16); // z = 0 줄을 가로지름(안전 지대 둘)
            Assert.True(field.HasLine(across.ax, across.az, across.bx, across.bz));
            Assert.True(field.CanWalkLine(across.ax, across.az, across.bx, across.bz, Walker.Player));
            Assert.False(field.CanWalkLine(across.ax, across.az, across.bx, across.bz, Walker.Monster));
            Assert.True(field.CanWalk(16, 16, Walker.Player));
            Assert.False(field.CanWalk(16, 16, Walker.Monster));

            (int ax, int az, int bx, int bz) wall = ((-2 * M) + 16, -16, (2 * M) - 16, -16); // z = -1 줄의 벽 (-1, -1)
            Assert.False(field.HasLine(wall.ax, wall.az, wall.bx, wall.bz));
            Assert.False(field.CanWalkLine(wall.ax, wall.az, wall.bx, wall.bz, Walker.Player));
            Assert.False(field.CanWalkLine(wall.ax, wall.az, wall.bx, wall.bz, Walker.Monster));
        }

        [Fact]
        public void RejectsAGridOfAnotherSize()
        {
            Assert.Throws<ArgumentException>(() => new FieldMap(16, Array.Empty<ZonesRow>(), TestData.EmptyGrid(18)));
            MapGrid shifted = TestData.EmptyGrid(16);
            shifted.OriginX = 0;
            Assert.Throws<ArgumentException>(() => new FieldMap(16, Array.Empty<ZonesRow>(), shifted));
        }

        /// <summary>
        /// 서버 구현의 답을 적은 비교 벡터가 커밋된 파일과 같다. MMO_UPDATE_VECTORS=1이면 파일을 고쳐 쓴다.
        /// </summary>
        [Fact]
        public void TheWallVectorsMatchTheCommittedFile()
        {
            FieldMap field = Field();
            var text = new StringBuilder();
            text.Append("# 벽의 비교 벡터. 서버의 FieldMapWallTests가 서버 구현의 답으로 만든다(직접 고치지 않음, MMO_UPDATE_VECTORS=1로 다시 씀).\n");
            text.Append("# field\t필드 한 변(m)\n# row\t격자의 한 줄. 첫 row가 가장 큰 z, 첫 글자가 가장 작은 x이고 '#'이 벽\n");
            text.Append("# point\tx\tz(1/32 m)\t걸을 수 있는지(플레이어 쪽, 0, 1)\n");
            text.Append("# line\tax\taz\tbx\tbz(1/32 m)\tHasLine\tCanWalkLine(플레이어 쪽)\n");
            text.Append($"field\t{s_rows.Length}\n");
            foreach (string row in s_rows)
            {
                text.Append($"row\t{row}\n");
            }

            foreach ((int x, int z, _, _) in s_points)
            {
                text.Append($"point\t{x}\t{z}\t{(field.CanWalk(x, z, Walker.Player) ? 1 : 0)}\n");
            }

            foreach ((int ax, int az, int bx, int bz) in Lines())
            {
                text.Append($"line\t{ax}\t{az}\t{bx}\t{bz}\t{(field.HasLine(ax, az, bx, bz) ? 1 : 0)}\t{(field.CanWalkLine(ax, az, bx, bz, Walker.Player) ? 1 : 0)}\n");
            }

            string path = TestData.Shared("vectors/walls.tsv");
            if (Environment.GetEnvironmentVariable("MMO_UPDATE_VECTORS") == "1")
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, text.ToString());
            }

            Assert.Equal(text.ToString(), File.ReadAllText(path));
        }

        private static FieldMap Field()
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = TestData.Map(s_rows);
            return new FieldMap(size, zones, grid);
        }

        /// <summary>
        /// 정한 줄과, 필드 안팎을 고루 지나는 무작위 줄(시드 고정). 무작위 줄의 반은 칸의 경계(1 m의 배수)에 끝점을 둔다.
        /// </summary>
        private static (int Ax, int Az, int Bx, int Bz)[] Lines()
        {
            var random = new Random(65);
            int Coordinate(bool onBoundary) => onBoundary ? random.Next(-9, 10) * M : random.Next(-9 * M, (9 * M) + 1);
            var randomLines = Enumerable.Range(0, 60).Select(i => (Coordinate(i % 2 == 0), Coordinate(i % 2 == 0), Coordinate(i % 4 == 0), Coordinate(i % 4 == 0)));
            return s_lines.Select(line => (line.Ax, line.Az, line.Bx, line.Bz)).Concat(randomLines).ToArray();
        }
    }
}
