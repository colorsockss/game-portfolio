using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Balance;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 실제 데이터가 수치의 기준(72)을 지키는지 수치 표 도구(server/tools/balance)와 같은 값(200번, 씨앗 1)으로 본다.
    /// </summary>
    public class BalanceTests
    {
        [Fact]
        public void TheDataMeetsTheBalanceTargets()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            List<Row> sameLevel = Report.SameLevel(data, 200, 1);
            List<Row> zoneEntry = Report.ZoneEntry(data, 200, 1);

            // 두 직업 × 놓인 몬스터 9종, 사냥터 3곳 × 두 직업 × 사냥터의 3종.
            Assert.Equal(18, sameLevel.Count);
            Assert.Equal(18, zoneEntry.Count);
            Assert.Empty(Report.Problems(sameLevel, zoneEntry));
        }

        /// <summary>
        /// 1레벨에서 최대 레벨까지 두 직업 모두 2시간쯤(105–135분) 걸린다(성장 표, 수치 표 도구와 같은 40번).
        /// </summary>
        [Fact]
        public void BothClassesReachTheMaxLevelInAboutTwoHours()
        {
            List<GrowthRow> growth = Growth.Table(GameData.Load(GameData.DefaultFolder), 40, 1);
            Assert.Equal(58, growth.Count);
            Assert.Empty(Growth.Problems(growth));
        }

        /// <summary>
        /// 같은 씨앗이면 같은 표가 나오고, 기준에 어긋난 줄은 이유와 함께 적힌다.
        /// </summary>
        [Fact]
        public void TheTableIsRepeatableAndReportsMisses()
        {
            GameData data = GameData.Load(GameData.DefaultFolder);
            Data.MonstersRow slime = data.Monster(1);
            Row first = Report.Measure(data, CharacterClass.Knight, 2, slime, 50, 7);
            Assert.Equal(first, Report.Measure(data, CharacterClass.Knight, 2, slime, 50, 7));

            // 30레벨 기사는 슬라임을 너무 빨리 잡고, 1레벨 기사는 트롤을 연달아 잡지 못한다.
            Row easy = Report.Measure(data, CharacterClass.Knight, 30, slime, 50, 7);
            Row hard = Report.Measure(data, CharacterClass.Knight, 1, data.Monster(9), 50, 7);
            List<string> problems = Report.Problems(new[] { easy }, new[] { hard });
            Assert.Contains(problems, problem => problem.Contains("hits to kill"));
            Assert.Contains(problems, problem => problem.Contains("in a row before dying"));
            Assert.True(hard.Deaths > 0);
        }
    }
}
