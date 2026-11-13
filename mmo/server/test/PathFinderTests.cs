using System;
using System.Collections.Generic;
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
    /// 글자로 그린 맵에서 A*(벽 돌아가기, 대각선 모서리, 걷는 쪽, 살피는 범위, 길 없음)를 확인하고, 같은 맵과 질의로 비교 벡터
    /// (shared/vectors/paths.tsv)를 낸다. 클라이언트의 엔진 없는 테스트가 길이 있는지와 자기 길의 구간마다의 선 검사를 맞춘다.
    /// </summary>
    public class PathFinderTests
    {
        private const int M = Units.PerMeter;

        /// <summary>
        /// 16 m 필드. 닫힌 상자(x -5..1, z 1..5. 안은 닿지 않음), 대각선으로 맞닿은 두 벽 (5, -1)과 (6, -2), 긴 벽(z -4, x -6..5).
        /// </summary>
        private static readonly string[] s_rows =
        {
            "................", // z = 7
            "................",
            "...#######......", // z = 5
            "...#.....#......",
            "...#.....#......",
            "...#.....#......",
            "...#######......", // z = 1
            "................", // z = 0
            ".............#..", // z = -1
            "..............#.",
            "................",
            "..############..", // z = -4
            "................",
            "................",
            "................",
            "................", // z = -8
        };

        /// <summary>
        /// 질의(1/32 m)와 기대하는 "길이 있는지". 범위는 필드 전체다.
        /// </summary>
        private static readonly (int FromX, int FromZ, int ToX, int ToZ, bool Found, string Why)[] s_queries =
        {
            (16, (-6 * M) + 16, 16, (-3 * M) + 16, true, "around the long wall"),
            ((5 * M) + 16, (-2 * M) + 16, (6 * M) + 16, -M + 16, true, "around two walls touching at a corner, not between them"),
            (16, 16, (-3 * M) + 16, (3 * M) + 16, false, "into a closed box"),
            ((-3 * M) + 16, (3 * M) + 16, 16, 16, false, "out of a closed box"),
            ((-5 * M) + 16, (5 * M) + 16, 16, 16, false, "starting in a wall"),
            (16, 16, (-5 * M) + 16, (5 * M) + 16, false, "ending in a wall"),
            (6, 6, 22, 22, true, "inside one cell"),
            ((-8 * M) + 16, (7 * M) + 16, (7 * M) + 16, (-8 * M) + 16, true, "corner to corner"),
            (16, 16, (8 * M) + 16, 16, false, "ending outside the grid"),
        };

        [Fact]
        public void PathsGoAroundWallsAndEverySegmentIsClear()
        {
            FieldMap field = Field(s_rows);
            var finder = new PathFinder(field);
            var path = new List<(int X, int Z)>();
            foreach ((int fromX, int fromZ, int toX, int toZ, bool found, string why) in s_queries)
            {
                Assert.True(found == Find(finder, fromX, fromZ, toX, toZ, Walker.Player, path), why);
                if (found)
                {
                    Assert.Equal((toX, toZ), path[^1]);
                    AssertClear(field, (fromX, fromZ), path, Walker.Player, why);
                }
            }

            Assert.False(field.CanWalkLine(16, (-6 * M) + 16, 16, (-3 * M) + 16, Walker.Player));
            Assert.True(Find(finder, 16, (-6 * M) + 16, 16, (-3 * M) + 16, Walker.Player, path));
            Assert.True(path.Count >= 2, "the path bends around the long wall");
            Assert.True(Find(finder, 6, 6, 22, 22, Walker.Player, path));
            Assert.Equal(new[] { (22, 22) }, path);
        }

        /// <summary>
        /// 몬스터의 길은 안전 지대를 돌아가고, 플레이어의 길은 곧게 지나간다.
        /// </summary>
        [Fact]
        public void MonstersGoAroundSafeCells()
        {
            FieldMap field = Field(
                "........",
                "....s...", // z = 2
                "....s...",
                "....s...", // z = 0
                "....s...",
                "....s...", // z = -2
                "........",
                "........");
            var finder = new PathFinder(field);
            var path = new List<(int X, int Z)>();
            (int X, int Z) from = ((-2 * M) + 16, 16);
            (int X, int Z) to = ((2 * M) + 16, 16);

            Assert.True(Find(finder, from.X, from.Z, to.X, to.Z, Walker.Player, path));
            Assert.Equal(new[] { to }, path);

            Assert.True(Find(finder, from.X, from.Z, to.X, to.Z, Walker.Monster, path));
            Assert.True(path.Count >= 2, "the monster bends around the safe zone");
            AssertClear(field, from, path, Walker.Monster, "monster");
        }

        /// <summary>
        /// 범위 밖으로만 이어지는 길은 없고, 범위를 넓히면 나온다. 범위 끝에 걸쳐 밖이 된 출발 칸도 반지름을 4 m 넓히면 길이 나온다.
        /// </summary>
        [Fact]
        public void TheSearchStaysInsideItsRange()
        {
            var finder = new PathFinder(Field(s_rows));
            var path = new List<(int X, int Z)>();
            (int X, int Z) below = (16, (-6 * M) + 16);
            (int X, int Z) above = (16, (-3 * M) + 16);
            Assert.False(finder.Find(below.X, below.Z, above.X, above.Z, Walker.Player, 0, -4 * M, 3 * M, path));
            Assert.True(finder.Find(below.X, below.Z, above.X, above.Z, Walker.Player, 0, -4 * M, 10 * M, path));

            // 출발 칸 (5, 0)의 가운데는 원점에서 약 5.5 m라 반지름 5 m의 밖이다.
            (int X, int Z) edge = ((5 * M) + 16, 16);
            Assert.False(finder.Find(edge.X, edge.Z, 16, 16, Walker.Player, 0, 0, 5 * M, path));
            Assert.True(finder.Find(edge.X, edge.Z, 16, 16, Walker.Player, 0, 0, 9 * M, path));
            Assert.True(finder.ClosedCells > 0);
        }

        /// <summary>
        /// 서버 구현의 답을 적은 비교 벡터가 커밋된 파일과 같다. MMO_UPDATE_VECTORS=1이면 파일을 고쳐 쓴다.
        /// </summary>
        [Fact]
        public void ThePathVectorsMatchTheCommittedFile()
        {
            var finder = new PathFinder(Field(s_rows));
            var path = new List<(int X, int Z)>();
            var text = new StringBuilder();
            text.Append("# 길찾기의 비교 벡터. 서버의 PathFinderTests가 서버 구현의 답으로 만든다(직접 고치지 않음, MMO_UPDATE_VECTORS=1로 다시 씀).\n");
            text.Append("# field\t필드 한 변(m)\n# row\t격자의 한 줄. 첫 row가 가장 큰 z, 첫 글자가 가장 작은 x이고 '#'이 벽\n");
            text.Append("# query\t출발 x\tz\t도착 x\tz(1/32 m)\t길이 있는지(플레이어 쪽, 범위는 필드 전체, 0, 1)\n");
            text.Append($"field\t{s_rows.Length}\n");
            foreach (string row in s_rows)
            {
                text.Append($"row\t{row}\n");
            }

            foreach ((int fromX, int fromZ, int toX, int toZ) in Queries())
            {
                text.Append($"query\t{fromX}\t{fromZ}\t{toX}\t{toZ}\t{(Find(finder, fromX, fromZ, toX, toZ, Walker.Player, path) ? 1 : 0)}\n");
            }

            string file = TestData.Shared("vectors/paths.tsv");
            if (Environment.GetEnvironmentVariable("MMO_UPDATE_VECTORS") == "1")
            {
                File.WriteAllText(file, text.ToString());
            }

            Assert.Equal(text.ToString(), File.ReadAllText(file));
        }

        /// <summary>
        /// 범위를 필드 전체(가운데에서 한 변)로 두고 찾는다.
        /// </summary>
        private static bool Find(PathFinder finder, int fromX, int fromZ, int toX, int toZ, Walker walker, List<(int X, int Z)> path)
        {
            return finder.Find(fromX, fromZ, toX, toZ, walker, 0, 0, 16 * M, path);
        }

        private static void AssertClear(FieldMap field, (int X, int Z) from, List<(int X, int Z)> path, Walker walker, string why)
        {
            (int X, int Z) previous = from;
            foreach ((int X, int Z) point in path)
            {
                Assert.True(field.CanWalkLine(previous.X, previous.Z, point.X, point.Z, walker), $"{why}: {previous} → {point}");
                previous = point;
            }
        }

        private static FieldMap Field(params string[] rows)
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = TestData.Map(rows);
            return new FieldMap(size, zones, grid);
        }

        /// <summary>
        /// 정한 질의와, 필드 안의 칸 가운데를 고르는 무작위 질의(시드 고정).
        /// </summary>
        private static (int FromX, int FromZ, int ToX, int ToZ)[] Queries()
        {
            var random = new Random(86);
            int Coordinate() => (random.Next(-8, 8) * M) + random.Next(0, M);
            var randomQueries = Enumerable.Range(0, 40).Select(_ => (Coordinate(), Coordinate(), Coordinate(), Coordinate()));
            return s_queries.Select(query => (query.FromX, query.FromZ, query.ToX, query.ToZ)).Concat(randomQueries).ToArray();
        }
    }
}
