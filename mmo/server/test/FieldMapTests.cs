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
    /// 필드의 칸과 구역(경계, 음수 좌표, 겹친 구역, 구역 0, 필드 밖)을 확인하고, 같은 점들로 비교 벡터(shared/vectors/zones.tsv)를 낸다.
    /// 클라이언트의 엔진 없는 테스트가 그 파일로 자기 FieldMap의 답을 맞춘다.
    /// </summary>
    public class FieldMapTests
    {
        /// <summary>
        /// 벡터가 쓰는 필드의 크기(m).
        /// </summary>
        private const uint FieldSize = 600;

        /// <summary>
        /// 1 m의 좌표 단위 수.
        /// </summary>
        private const int M = Units.PerMeter;

        /// <summary>
        /// 시험용 구역. 3과 4가 겹치고(뒤 줄인 4가 이김), 5는 필드 밖으로 걸친다.
        /// </summary>
        private static readonly ZonesRow[] s_zones =
        {
            new ZonesRow { Id = 1, MinX = -40, MinZ = -40, MaxX = 40, MaxZ = 40, Safe = true },
            new ZonesRow { Id = 2, MinX = 40, MinZ = -100, MaxX = 160, MaxZ = 100 },
            new ZonesRow { Id = 3, MinX = -100, MinZ = 100, MaxX = 100, MaxZ = 280 },
            new ZonesRow { Id = 4, MinX = -30, MinZ = 220, MaxX = 30, MaxZ = 280 },
            new ZonesRow { Id = 5, MinX = 250, MinZ = 250, MaxX = 400, MaxZ = 400 },
        };

        /// <summary>
        /// 점(좌표 단위 1/32 m)과 기대하는 답(구역, 안전 지대, 격자 안).
        /// </summary>
        private static readonly (int X, int Z, uint Zone, bool Safe, bool Inside, string Why)[] s_points =
        {
            (0, 0, 1, true, true, "the middle of the town"),
            (-1, 0, 1, true, true, "-1/32 m is cell -1, still the town"),
            ((40 * M) - 1, 0, 1, true, true, "the last cell of the town"),
            (40 * M, 0, 2, false, true, "the max corner belongs to the next zone"),
            (-40 * M, 0, 1, true, true, "the min corner belongs to the town"),
            ((-40 * M) - 1, 0, 0, false, true, "one unit left of the town is cell -41"),
            (0, (-40 * M) - 1, 0, false, true, "one unit below the town"),
            (200 * M, 0, 0, false, true, "no zone covers this cell"),
            (0, (220 * M) - 1, 3, false, true, "just before the overlap"),
            (0, 220 * M, 4, false, true, "the later row wins where zones overlap"),
            (0, 280 * M, 0, false, true, "the max corner of the overlap"),
            ((300 * M) - 1, (300 * M) - 1, 5, false, true, "a zone clipped by the field edge"),
            (300 * M, 0, 0, false, false, "exactly +300 m is outside the grid"),
            (0, 300 * M, 0, false, false, "exactly +300 m on z is outside the grid"),
            (-300 * M, -300 * M, 0, false, true, "exactly -300 m is inside the grid"),
            ((-300 * M) - 1, 0, 0, false, false, "below -300 m is outside the grid"),
        };

        [Fact]
        public void CellsRoundDown()
        {
            Assert.Equal(new[] { -2, -1, -1, 0, 0, 1 }, new[] { -M - 1, -M, -1, 0, M - 1, M }.Select(FieldMap.CellOf));
        }

        [Fact]
        public void ZonesFollowTheRules()
        {
            var field = new FieldMap(FieldSize, s_zones, TestData.EmptyGrid(FieldSize));
            foreach ((int x, int z, uint zone, bool safe, bool inside, string why) in s_points)
            {
                Assert.True((zone, safe, inside) == (field.ZoneAt(x, z), field.IsSafe(x, z), field.Contains(x, z)), $"({x}, {z}): {why}");
            }
        }

        [Fact]
        public void RejectsBadFieldsAndZoneIds()
        {
            Assert.Throws<ArgumentOutOfRangeException>(() => new FieldMap(601, s_zones, TestData.EmptyGrid(601)));
            Assert.Throws<ArgumentOutOfRangeException>(() => new FieldMap(FieldSize, new[] { new ZonesRow { Id = 0 } }, TestData.EmptyGrid(FieldSize)));
            Assert.Throws<ArgumentOutOfRangeException>(() => new FieldMap(FieldSize, new[] { new ZonesRow { Id = 256 } }, TestData.EmptyGrid(FieldSize)));
        }

        /// <summary>
        /// 서버 구현의 답을 적은 비교 벡터가 커밋된 파일과 같다. MMO_UPDATE_VECTORS=1이면 파일을 고쳐 쓴다.
        /// </summary>
        [Fact]
        public void TheZoneVectorsMatchTheCommittedFile()
        {
            var field = new FieldMap(FieldSize, s_zones, TestData.EmptyGrid(FieldSize));
            var text = new StringBuilder();
            text.Append("# 구역의 비교 벡터. 서버의 FieldMapTests가 서버 구현의 답으로 만든다(직접 고치지 않음, MMO_UPDATE_VECTORS=1로 다시 씀).\n");
            text.Append("# field\t필드 한 변(m)\n# zone\t번호\t작은 x\t작은 z\t큰 x\t큰 z(m)\t안전 지대(0, 1). 줄의 차례대로 펴서 뒤 줄이 이긴다\n");
            text.Append("# point\tx\tz(1/32 m)\t구역\t안전 지대\t격자 안(0, 1)\n");
            text.Append($"field\t{FieldSize}\n");
            foreach (ZonesRow zone in s_zones)
            {
                text.Append($"zone\t{zone.Id}\t{zone.MinX}\t{zone.MinZ}\t{zone.MaxX}\t{zone.MaxZ}\t{(zone.Safe ? 1 : 0)}\n");
            }

            foreach ((int x, int z, _, _, _, _) in s_points)
            {
                text.Append($"point\t{x}\t{z}\t{field.ZoneAt(x, z)}\t{(field.IsSafe(x, z) ? 1 : 0)}\t{(field.Contains(x, z) ? 1 : 0)}\n");
            }

            string path = TestData.Shared("vectors/zones.tsv");
            if (Environment.GetEnvironmentVariable("MMO_UPDATE_VECTORS") == "1")
            {
                Directory.CreateDirectory(Path.GetDirectoryName(path)!);
                File.WriteAllText(path, text.ToString());
            }

            Assert.Equal(text.ToString(), File.ReadAllText(path));
        }
    }
}
