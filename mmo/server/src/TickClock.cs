using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 틱 루프가 이번 틱에 지난 틱 수를 실제 시간으로 구한다(79). 첫 틱의 때부터 지난 시간을 틱 길이로 나눠(반 틱을 더해 타이머의 흔들림을 넘김)
    /// 지금의 틱 차례를 구하고, 지난 차례와의 차이를 낸다. 100 ms가 걸린 틱 다음은 2다. 타이머가 일찍 와 차례가 그대로면 1을 내고(월드는 한 틱 앞서고),
    /// 실제 시간이 따라잡을 때까지 1을 낸다. 시간은 인자로 받아(Stopwatch의 타임스탬프와 그 주파수) 시계 없이 테스트한다.
    /// </summary>
    public sealed class TickClock
    {
        /// <summary>
        /// 틱 하나의 길이(타임스탬프).
        /// </summary>
        private readonly long _period;

        /// <summary>
        /// 첫 틱의 때. 첫 Advance 전에는 null.
        /// </summary>
        private long? _first;

        /// <summary>
        /// 지금까지 센 틱 차례(첫 틱이 0).
        /// </summary>
        private long _counted;

        /// <param name="frequency">타임스탬프의 1초(Stopwatch.Frequency).</param>
        public TickClock(long frequency)
        {
            _period = frequency / Units.TicksPerSecond;
        }

        /// <summary>
        /// 이번 틱이 시작한 때에 지난 틱 수(1 이상). 첫 틱은 1이다.
        /// </summary>
        public uint Advance(long now)
        {
            if (_first is not long first)
            {
                _first = now;
                return 1;
            }

            long due = (now - first + (_period / 2)) / _period;
            long elapsed = due > _counted ? due - _counted : 1;
            _counted += elapsed;
            return (uint)elapsed;
        }
    }
}
