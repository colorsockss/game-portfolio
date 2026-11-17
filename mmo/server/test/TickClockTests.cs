using System.Linq;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 틱 루프가 실제 시간으로 지난 틱 수를 구하는 TickClock(79). 시간은 1 ms = 1,000 타임스탬프로 준다.
    /// </summary>
    public class TickClockTests
    {
        private const long Frequency = 1_000_000;

        /// <summary>
        /// 50 ms마다 오면(타이머가 몇 ms씩 흔들려도) 늘 1이고, 120 ms가 걸린 틱 다음은 2, 260 ms 뒤에는 5로 실제 시간을 따라간다.
        /// </summary>
        [Fact]
        public void ElapsedTicksFollowRealTime()
        {
            var clock = new TickClock(Frequency);
            uint[] steady = new long[] { 0, 51, 99, 152, 200, 248, 301 }.Select(ms => clock.Advance(ms * 1000)).ToArray();
            Assert.Equal(new uint[] { 1, 1, 1, 1, 1, 1, 1 }, steady);

            Assert.Equal(2u, clock.Advance(421 * 1000));
            Assert.Equal(1u, clock.Advance(451 * 1000));
            Assert.Equal(5u, clock.Advance(700 * 1000));
            Assert.Equal(1u, clock.Advance(751 * 1000));
        }

        /// <summary>
        /// 타이머가 일찍 와 차례가 그대로여도 1을 내고(멈추지 않음), 그만큼 앞선 월드는 실제 시간이 따라잡을 때까지 1씩만 간다.
        /// </summary>
        [Fact]
        public void EarlyTicksStepOnceAndDoNotRunAhead()
        {
            var clock = new TickClock(Frequency);
            clock.Advance(0);
            Assert.Equal(1u, clock.Advance(50 * 1000));
            Assert.Equal(1u, clock.Advance(60 * 1000));
            Assert.Equal(1u, clock.Advance(150 * 1000));
            Assert.Equal(1u, clock.Advance(200 * 1000));
            Assert.Equal(2u, clock.Advance(300 * 1000));
        }
    }
}
