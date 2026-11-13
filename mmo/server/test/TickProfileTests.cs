using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 틱 측정의 집계를 시계 없이 본다. 주파수를 1000으로 두어 타임스탬프 1이 1 ms다.
    /// </summary>
    public class TickProfileTests
    {
        [Fact]
        public void PhasesAverageAndPeakOverTheInterval()
        {
            var profile = new TickProfile(1000);
            Tick(profile, 1, input: 2, view: 4, save: 0, send: 6);
            Tick(profile, 2, input: 4, view: 8, save: 10, send: 2);

            string report = profile.Report();
            Assert.Contains("input 3.00/4.00 scheduled 0.00/0.00 monsters 0.00/0.00 combat 0.00/0.00 vitals 0.00/0.00 view 6.00/8.00 save 5.00/10.00 send 4.00/6.00, sum 18.00 of tick 18.00", report);

            // 보고하면 구간이 다시 시작한다.
            Assert.Contains("input 0.00/0.00", profile.Report());
        }

        [Fact]
        public void OnlyTicksOverFiftyMillisecondsLeaveALineAtOnce()
        {
            var profile = new TickProfile(1000);
            Assert.Null(Tick(profile, 1, input: 10, view: 20, save: 0, send: 20));
            Assert.Equal("slow tick 2: 51.00 ms (input 1.00, scheduled 0.00, monsters 0.00, combat 0.00, vitals 0.00, view 40.00, save 0.00, send 10.00)", Tick(profile, 2, input: 1, view: 40, save: 0, send: 10));
            Assert.Contains("view 30.00/40.00", profile.Report());
        }

        /// <summary>
        /// 늦게 시작한 시간은 지난 틱의 차례에서 한 틱 뒤를 기준으로 재고, 한 틱 넘게 늦으면 건너뛴 틱을 세고 다시 맞춘다.
        /// </summary>
        [Fact]
        public void LateStartsAndSkippedTicksFollowTheSchedule()
        {
            var profile = new TickProfile(1000);
            foreach (long started in new long[] { 0, 50, 103, 150, 330, 380 })
            {
                profile.TickStarted(started);
                profile.TickEnded(0, 1);
            }

            // 늦음: 0, 3, 0, 130 → 건너뛴 2틱과 30, 다시 맞춘 뒤 0. 틱 6개의 평균 33/6.
            Assert.Contains("late avg 5.50 ms max 30.00 ms, skipped 2", profile.Report());
        }

        /// <summary>
        /// 첫 틱이 늦게 시작해 기준이 늦게 잡혀도, 더 일찍 온 틱으로 기준을 당긴다.
        /// </summary>
        [Fact]
        public void AnEarlierStartMovesTheScheduleBack()
        {
            var profile = new TickProfile(1000);
            foreach (long started in new long[] { 0, 52, 100, 153 })
            {
                profile.TickStarted(started);
                profile.TickEnded(0, 1);
            }

            // 늦음: 0, 2, (102보다 이른 100이라 기준을 당김) 0, 3.
            Assert.Contains("late avg 1.25 ms max 3.00 ms, skipped 0", profile.Report());
        }

        [Fact]
        public void PacketsAndTheSendQueueAreCountedByKind()
        {
            var profile = new TickProfile(1000);
            profile.Sent(Packet.BodyOneofCase.EntityMoves, 30);
            profile.Sent(Packet.BodyOneofCase.EntityMoves, 20);
            profile.Sent(Packet.BodyOneofCase.Pong, 7);
            profile.Queued(1);
            profile.Queued(4);
            profile.Queued(2);

            string report = profile.Report();
            Assert.Contains("send queue max 4 frames", report);
            Assert.Contains("packets: Pong 1/7 B EntityMoves 2/50 B, total 57 B", report);
            Assert.Contains("packets: none", profile.Report());
        }

        private static string? Tick(TickProfile profile, uint tick, long input, long view, long save, long send)
        {
            profile.Add(TickPhase.Input, input);
            profile.Add(TickPhase.View, view);
            profile.Add(TickPhase.Save, save);
            profile.Add(TickPhase.Send, send);
            return profile.TickEnded(tick, input + view + save + send);
        }
    }
}
