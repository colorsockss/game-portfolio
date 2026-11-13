using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 생성한 기획 데이터가 빌드에 실려 읽히는지, 파일이 없으면 서버가 뜨지 않는지, 밀리초를 틱으로 올림하는지 확인한다.
    /// </summary>
    public class GameDataTests
    {
        /// <summary>
        /// 실행 파일 옆의 data/에 생성물이 실리고, 해시가 생성한 파일(mmo/shared/data/files/data.hash)과 같다.
        /// </summary>
        [Fact]
        public void LoadsTheGeneratedDataNextToTheExecutable()
        {
            string generated = File.ReadAllText(TestData.Shared(Path.Combine("data/files", GameData.HashFile))).Trim();
            GameData data = GameData.Load(GameData.DefaultFolder);
            Assert.Equal(generated, data.Hash.ToString("x16"));

            // 클라이언트의 엔진 없는 테스트(GameDataTest)가 같은 생성물에서 같은 값을 읽는다.
            Assert.Equal(600u, data.Constants.FieldSize);
            Assert.Equal(new uint[] { 1, 2, 3, 4, 5, 6 }, data.Zones.Rows.Select(zone => zone.Id));
            ZonesRow town = data.Zones.Rows[0];
            Assert.Equal(("zone.town", ZoneKind.Town, true, -40, 40), (town.NameKey, town.Kind, town.Safe, town.MinX, town.MaxX));
            Assert.Equal((0, -10), (town.RespawnX, town.RespawnZ));
            Assert.False(data.Zones.Rows[1].HasRespawnX);

            // 맵 생성기의 격자가 필드와 같은 크기로 읽히고 FieldMap이 받아들인다.
            Assert.Equal((600u, 600u, -300, -300, 360_000), (data.Grid.Width, data.Grid.Depth, data.Grid.OriginX, data.Grid.OriginZ, data.Grid.Cells.Length));
            var field = new FieldMap(data.Constants.FieldSize, data.Zones.Rows, data.Grid);
            Assert.True(field.IsWall(-300 * Units.PerMeter, 0));
            Assert.True(field.CanWalk(town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter, Walker.Player));
        }

        /// <summary>
        /// 해시 파일이 없거나 16진수 16자가 아니면 읽지 못한다. 테이블의 파일이 없어도 읽지 못한다.
        /// </summary>
        [Fact]
        public void RejectsAMissingOrBrokenHash()
        {
            string folder = Directory.CreateTempSubdirectory("mmo-data-").FullName;
            try
            {
                Assert.Throws<FileNotFoundException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c442\n");
                Assert.Throws<InvalidDataException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c1g\n");
                Assert.Throws<InvalidDataException>(() => GameData.ReadHash(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c14\n");
                Assert.Equal(0xe3b0c44298fc1c14, GameData.ReadHash(folder));
                Assert.Throws<FileNotFoundException>(() => GameData.Load(folder));
            }
            finally
            {
                Directory.Delete(folder, recursive: true);
            }
        }

        /// <summary>
        /// 데이터 폴더를 읽지 못하면 서버가 포트를 열기 전에 1로 끝난다.
        /// </summary>
        [Fact]
        public async Task TheServerDoesNotStartWithoutData()
        {
            string folder = Path.Combine(Path.GetTempPath(), $"mmo-no-data-{Guid.NewGuid():N}");
            Assert.Equal(1, await Program.Main(new[] { "--data", folder, "--port", "0", "--database", ":memory:" }));
        }

        /// <summary>
        /// 밀리초 → 틱은 올림이다(틱 하나 50 ms).
        /// </summary>
        [Theory]
        [InlineData(0u, 0u)]
        [InlineData(1u, 1u)]
        [InlineData(50u, 1u)]
        [InlineData(51u, 2u)]
        [InlineData(uint.MaxValue, 85899346u)]
        public void MillisecondsRoundUpToTicks(uint milliseconds, uint ticks)
        {
            Assert.Equal(ticks, Units.TicksFromMilliseconds(milliseconds));
        }
    }
}
