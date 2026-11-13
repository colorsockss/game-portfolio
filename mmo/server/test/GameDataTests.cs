using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using PortfolioMmo.Contract;
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
            string generated = File.ReadAllText(Path.Combine(TestFolder(), "../../shared/data/files", GameData.HashFile)).Trim();
            Assert.Equal(generated, GameData.Load(GameData.DefaultFolder).Hash.ToString("x16"));
        }

        /// <summary>
        /// 해시 파일이 없거나 16진수 16자가 아니면 읽지 못한다.
        /// </summary>
        [Fact]
        public void RejectsAMissingOrBrokenHash()
        {
            string folder = Directory.CreateTempSubdirectory("mmo-data-").FullName;
            try
            {
                Assert.Throws<FileNotFoundException>(() => GameData.Load(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c442\n");
                Assert.Throws<InvalidDataException>(() => GameData.Load(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c1g\n");
                Assert.Throws<InvalidDataException>(() => GameData.Load(folder));
                File.WriteAllText(Path.Combine(folder, GameData.HashFile), "e3b0c44298fc1c14\n");
                Assert.Equal(0xe3b0c44298fc1c14, GameData.Load(folder).Hash);
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
        /// 이 파일이 있는 폴더(mmo/server/test).
        /// </summary>
        private static string TestFolder([CallerFilePath] string path = "")
        {
            return Path.GetDirectoryName(path)!;
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
