using System;
using System.Linq;
using System.Text;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 틱의 차례. 입력은 World.Receive(GameServer가 큐를 비움)와 다음 입력의 이동 거리를 채우는 것, 보내기는 GameServer.Flush이고
    /// 그 사이는 World.Step이 부르는 차례다. 아직 없는 차례(예약한 일, 몬스터, 전투, 회복)는 그 기능이 World.Step에 들어올 때 더한다.
    /// </summary>
    public enum TickPhase
    {
        Input,
        View,
        Save,
        Send,
    }

    /// <summary>
    /// 10초 구간의 틱 측정(차례별 시간, 패킷 종류별 수와 바이트, 보내기 큐, 늦게 시작한 시간과 건너뛴 틱)을 모은다.
    /// 시간은 인자로 받아(Stopwatch의 타임스탬프와 그 주파수) 시계 없이 테스트한다. 틱 스레드에서만 부른다.
    /// </summary>
    public sealed class TickProfile
    {
        /// <summary>
        /// 이보다 오래 걸린 틱은 구간을 기다리지 않고 바로 한 줄을 남긴다(ms. 틱 하나의 길이).
        /// </summary>
        public const double SlowTickMilliseconds = 1000.0 / Units.TicksPerSecond;

        private static readonly TickPhase[] s_phases = Enum.GetValues<TickPhase>();

        /// <summary>
        /// 타임스탬프의 1초.
        /// </summary>
        private readonly long _frequency;

        /// <summary>
        /// 틱 하나의 길이(타임스탬프).
        /// </summary>
        private readonly long _period;

        /// <summary>
        /// 이번 틱의 차례별 시간(타임스탬프).
        /// </summary>
        private readonly long[] _tick = new long[s_phases.Length];

        /// <summary>
        /// 구간의 차례별 합과 최대.
        /// </summary>
        private readonly long[] _sum = new long[s_phases.Length];
        private readonly long[] _max = new long[s_phases.Length];

        /// <summary>
        /// 구간의 패킷 종류별 수와 바이트(길이 머리 포함). 칸 번호가 종류(oneof의 필드 번호)다. 패킷마다 부르므로 사전 대신 배열이다.
        /// </summary>
        private static readonly int s_kinds = (int)Enum.GetValues<Packet.BodyOneofCase>().Max() + 1;
        private readonly long[] _packetCounts = new long[s_kinds];
        private readonly long[] _packetBytes = new long[s_kinds];

        /// <summary>
        /// 지난 틱이 시작했어야 할 때. 첫 틱 전에는 null.
        /// </summary>
        private long? _due;

        private int _ticks;
        private long _totalSum;
        private long _lateSum;
        private long _lateMax;
        private long _skipped;
        private int _maxQueue;

        /// <param name="frequency">타임스탬프의 1초(Stopwatch.Frequency).</param>
        public TickProfile(long frequency)
        {
            _frequency = frequency;
            _period = frequency / Units.TicksPerSecond;
        }

        /// <summary>
        /// 틱이 now에 시작했다. 지난 틱이 시작했어야 할 때보다 한 틱 뒤가 이번 차례이고, 그보다 늦은 만큼이 늦게 시작한 시간이다.
        /// 차례보다 일찍 오면 기준을 그쪽으로 당긴다(기준이 가장 이른 시작에 맞춰짐). 한 틱 넘게 늦으면 타이머(PeriodicTimer)가 그 사이의
        /// 틱을 건너뛴 것이라 건너뛴 수를 세고 이번 시작을 기준으로 다시 맞춘다.
        /// </summary>
        public void TickStarted(long now)
        {
            if (_due == null)
            {
                _due = now;
                return;
            }

            // 기준(첫 틱)보다 일찍 왔으면 타이머의 차례가 더 이르다는 뜻이라 기준을 당긴다.
            long late = now - (_due.Value + _period);
            if (late < 0)
            {
                _due = now;
                late = 0;
            }
            else if (late >= _period)
            {
                _skipped += late / _period;
                _due = now;
                late %= _period;
            }
            else
            {
                _due += _period;
            }

            _lateSum += late;
            _lateMax = Math.Max(_lateMax, late);
        }

        /// <summary>
        /// 이번 틱의 그 차례에 elapsed(타임스탬프)가 들었다.
        /// </summary>
        public void Add(TickPhase phase, long elapsed)
        {
            _tick[(int)phase] += elapsed;
        }

        /// <summary>
        /// 패킷 하나를 bytes(길이 머리 포함)로 보냈다.
        /// </summary>
        public void Sent(Packet.BodyOneofCase kind, int bytes)
        {
            _packetCounts[(int)kind]++;
            _packetBytes[(int)kind] += bytes;
        }

        /// <summary>
        /// 이번 틱이 끝날 때 한 연결의 보내기 큐 길이(프레임 수).
        /// </summary>
        public void Queued(int frames)
        {
            _maxQueue = Math.Max(_maxQueue, frames);
        }

        /// <summary>
        /// 틱이 total(타임스탬프) 걸려 끝났다. 구간에 더하고, 50 ms를 넘었으면 그 틱의 차례별 시간을 담은 한 줄을 낸다.
        /// </summary>
        public string? TickEnded(uint tick, long total)
        {
            _ticks++;
            _totalSum += total;
            for (int i = 0; i < s_phases.Length; i++)
            {
                _sum[i] += _tick[i];
                _max[i] = Math.Max(_max[i], _tick[i]);
            }

            string? slow = null;
            if (Milliseconds(total) > SlowTickMilliseconds)
            {
                var line = new StringBuilder($"slow tick {tick}: {Milliseconds(total):F2} ms (");
                for (int i = 0; i < s_phases.Length; i++)
                {
                    line.Append(i == 0 ? string.Empty : ", ").Append($"{Name(s_phases[i])} {Milliseconds(_tick[i]):F2}");
                }

                slow = line.Append(')').ToString();
            }

            Array.Clear(_tick);
            return slow;
        }

        /// <summary>
        /// 구간의 차례별 평균·최대, 늦은 시작, 건너뛴 틱, 보내기 큐, 패킷 종류별 수·바이트를 줄들로 내고 구간을 다시 시작한다.
        /// </summary>
        public string Report()
        {
            int ticks = Math.Max(_ticks, 1);
            var text = new StringBuilder("  phases avg/max ms:");
            for (int i = 0; i < s_phases.Length; i++)
            {
                text.Append($" {Name(s_phases[i])} {Milliseconds(_sum[i]) / ticks:F2}/{Milliseconds(_max[i]):F2}");
            }

            long phaseSum = 0;
            foreach (long sum in _sum)
            {
                phaseSum += sum;
            }

            text.Append($", sum {Milliseconds(phaseSum) / ticks:F2} of tick {Milliseconds(_totalSum) / ticks:F2}\n");
            text.Append($"  timer: late avg {Milliseconds(_lateSum) / ticks:F2} ms max {Milliseconds(_lateMax):F2} ms, skipped {_skipped}, send queue max {_maxQueue} frames\n");
            text.Append("  packets:");
            long bytes = 0;
            for (int kind = 0; kind < s_kinds; kind++)
            {
                if (_packetCounts[kind] > 0)
                {
                    text.Append($" {(Packet.BodyOneofCase)kind} {_packetCounts[kind]}/{_packetBytes[kind]} B");
                    bytes += _packetBytes[kind];
                }
            }

            text.Append(bytes == 0 ? " none" : $", total {bytes} B");

            Array.Clear(_sum);
            Array.Clear(_max);
            Array.Clear(_packetCounts);
            Array.Clear(_packetBytes);
            _ticks = 0;
            _totalSum = 0;
            _lateSum = 0;
            _lateMax = 0;
            _skipped = 0;
            _maxQueue = 0;
            return text.ToString();
        }

        private static string Name(TickPhase phase)
        {
            return phase.ToString().ToLowerInvariant();
        }

        private double Milliseconds(long elapsed)
        {
            return elapsed * 1000.0 / _frequency;
        }
    }
}
