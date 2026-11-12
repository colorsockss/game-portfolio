using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 주기로 하는 일이 정한 위상에 돌고, 틱 번호가 건너뛰어도 한 번만 돌고 위상을 지키는지 확인한다.
    /// </summary>
    public class PeriodicTests
    {
        [Fact]
        public void RunsOnThePhase()
        {
            var periodic = new Periodic(first: 3, interval: 10);
            Assert.False(periodic.Due(2));
            Assert.True(periodic.Due(3));
            Assert.False(periodic.Due(3));
            Assert.False(periodic.Due(12));
            Assert.True(periodic.Due(13));
        }

        /// <summary>
        /// 차례를 여러 번 건너뛰면 한 번만 돌고, 다음 차례는 원래 위상(3 + 10의 배수)에 온다.
        /// </summary>
        [Fact]
        public void MissedRunsCountOnceAndKeepThePhase()
        {
            var periodic = new Periodic(first: 3, interval: 10);
            Assert.True(periodic.Due(37));
            Assert.Equal(43u, periodic.Next);
            Assert.False(periodic.Due(42));
            Assert.True(periodic.Due(43));
        }
    }
}
