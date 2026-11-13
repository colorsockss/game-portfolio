using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 예약한 일의 큐를 틱을 손으로 돌려 본다. 종류는 시험용 셋(A, B는 바로 하는 일, Strike는 전투 차례로 넘기는 일)이다.
    /// </summary>
    public class SchedulerTests
    {
        private const ScheduledKind A = (ScheduledKind)1;
        private const ScheduledKind B = (ScheduledKind)2;
        private const ScheduledKind Strike = (ScheduledKind)3;

        private readonly Scheduler _scheduler = new Scheduler();
        private readonly Runner _runner = new Runner();

        [Fact]
        public void RunsOnceOnTheDueTickAndNotBefore()
        {
            Owner owner = _runner.Spawn(7);
            _scheduler.Add(5, A, 7, 1, 0, ref owner.Generations[(int)A]);

            Step(4);
            Assert.Empty(_runner.Ran);
            Step(5);
            Assert.Equal(new[] { (A, 7u, 1u) }, _runner.Ran);
            Step(6);
            Assert.Single(_runner.Ran);
            Assert.Equal(0, _scheduler.Count);
        }

        /// <summary>
        /// 같은 틱의 일은 넣은 순서대로, 다른 틱의 일은 틱의 차례대로 나온다(넣은 순서와 상관없이).
        /// </summary>
        [Fact]
        public void SameTickJobsComeOutInTheOrderTheyWereAdded()
        {
            for (uint i = 0; i < 50; i++)
            {
                _scheduler.Add(i % 2 == 0 ? 3u : 2u, A, 0, i);
            }

            Step(3);
            var expected = new List<uint>();
            for (uint i = 1; i < 50; i += 2)
            {
                expected.Add(i);
            }

            for (uint i = 0; i < 50; i += 2)
            {
                expected.Add(i);
            }

            Assert.Equal(expected, _runner.Ran.ConvertAll(ran => ran.A));
        }

        /// <summary>
        /// 끝나는 틱을 뒤로 바꾸면(다시 넣어 세대 번호가 오름) 옛 일은 버려지고 새 일만 한다. 칸을 0으로 두면 취소된다.
        /// </summary>
        [Fact]
        public void RescheduledAndCancelledJobsAreDropped()
        {
            Owner owner = _runner.Spawn(7);
            _scheduler.Add(5, A, 7, 1, 0, ref owner.Generations[(int)A]);
            _scheduler.Add(8, A, 7, 2, 0, ref owner.Generations[(int)A]);

            Step(5);
            Assert.Empty(_runner.Ran);
            Step(8);
            Assert.Equal(new[] { (A, 7u, 2u) }, _runner.Ran);

            _scheduler.Add(10, A, 7, 3, 0, ref owner.Generations[(int)A]);
            owner.Generations[(int)A] = 0;
            Step(10);
            Assert.Single(_runner.Ran);
        }

        /// <summary>
        /// 주인이 사라지면 버리고, 같은 번호의 새 개체가 나와도 옛 일은 그 개체에 걸리지 않는다. 새 개체의 일은 한다.
        /// </summary>
        [Fact]
        public void JobsOfAGoneOrReplacedOwnerAreDropped()
        {
            Owner gone = _runner.Spawn(7);
            Owner replaced = _runner.Spawn(8);
            _scheduler.Add(5, A, 7, 1, 0, ref gone.Generations[(int)A]);
            _scheduler.Add(5, A, 8, 2, 0, ref replaced.Generations[(int)A]);
            _runner.Owners.Remove(7);
            _runner.Owners.Remove(8);

            Owner reborn = _runner.Spawn(8);
            _scheduler.Add(5, A, 8, 3, 0, ref reborn.Generations[(int)A]);

            Step(5);
            Assert.Equal(new[] { (A, 8u, 3u) }, _runner.Ran);
        }

        /// <summary>
        /// 같은 번호의 새 개체가 그 종류의 칸에 아직 아무것도 넣지 않았어도(0) 옛 일이 걸리지 않는다.
        /// </summary>
        [Fact]
        public void AReplacedOwnerWithAnEmptySlotDoesNotTakeOldJobs()
        {
            Owner old = _runner.Spawn(8);
            _scheduler.Add(5, A, 8, 1, 0, ref old.Generations[(int)A]);
            _runner.Owners.Remove(8);
            _runner.Spawn(8);

            Step(5);
            Assert.Empty(_runner.Ran);
        }

        /// <summary>
        /// 틱 번호가 3 건너뛰면(10 다음이 14) 그 사이의 일이 틱과 순번의 차례대로 모두 한 번씩 나온다.
        /// </summary>
        [Fact]
        public void SkippedTicksReleaseEveryJobInTickThenOrder()
        {
            _scheduler.Add(13, A, 0, 1);
            _scheduler.Add(11, A, 0, 2);
            _scheduler.Add(12, A, 0, 3);
            _scheduler.Add(11, A, 0, 4);
            _scheduler.Add(15, A, 0, 5);

            Step(10);
            Assert.Empty(_runner.Ran);
            Step(14);
            Assert.Equal(new uint[] { 2, 4, 3, 1 }, _runner.Ran.ConvertAll(ran => ran.A));
            Step(15);
            Assert.Equal(5u, _runner.Ran[^1].A);
        }

        /// <summary>
        /// 전투 차례의 일은 여기서 하지 않고, 버리는 검사를 거친 뒤 꺼낸 순서대로 CombatJobs에 든다.
        /// </summary>
        [Fact]
        public void CombatJobsAreHandedOverInOrderWithoutRunning()
        {
            Owner owner = _runner.Spawn(7);
            _scheduler.Add(6, Strike, 7, 1, 0, ref owner.Generations[(int)Strike]);
            _scheduler.Add(5, A, 0, 2);
            _scheduler.Add(5, Strike, 0, 3);
            _scheduler.Add(5, Strike, 7, 4, 0, ref owner.Generations[(int)Strike]);

            Step(6);
            Assert.Equal(new[] { (A, 0u, 2u) }, _runner.Ran);
            Assert.Equal(new uint[] { 3, 4 }, _scheduler.CombatJobs.ConvertAll(job => job.A));
        }

        /// <summary>
        /// 데이터의 밀리초는 Units의 올림으로 틱 수가 된다. 300 ms(50 ms 틱 6개)의 예약은 6틱 뒤에 나오고, 301 ms는 7틱 뒤다.
        /// </summary>
        [Fact]
        public void MillisecondsBecomeTicksRoundedUp()
        {
            const uint now = 100;
            _scheduler.Add(now + Units.TicksFromMilliseconds(300), A, 0, 1);
            _scheduler.Add(now + Units.TicksFromMilliseconds(301), A, 0, 2);

            Step(now + 5);
            Assert.Empty(_runner.Ran);
            Step(now + 6);
            Assert.Equal(new uint[] { 1 }, _runner.Ran.ConvertAll(ran => ran.A));
            Step(now + 7);
            Assert.Equal(new uint[] { 1, 2 }, _runner.Ran.ConvertAll(ran => ran.A));
        }

        /// <summary>
        /// 한 주인의 한 종류의 세대 번호를 올려도 같은 주인의 다른 종류의 예약은 버려지지 않는다.
        /// </summary>
        [Fact]
        public void GenerationsAreKeptPerKind()
        {
            Owner owner = _runner.Spawn(7);
            _scheduler.Add(5, A, 7, 1, 0, ref owner.Generations[(int)A]);
            _scheduler.Add(5, B, 7, 2, 0, ref owner.Generations[(int)B]);
            _scheduler.Add(9, A, 7, 3, 0, ref owner.Generations[(int)A]);

            Step(5);
            Assert.Equal(new[] { (B, 7u, 2u) }, _runner.Ran);
        }

        private void Step(uint now)
        {
            _scheduler.Step(now, _runner);
        }

        /// <summary>
        /// 시험용 주인. 종류마다 세대 번호 칸이 하나다.
        /// </summary>
        private sealed class Owner
        {
            public ulong[] Generations { get; } = new ulong[4];
        }

        /// <summary>
        /// 주인 번호 0은 세대 번호를 쓰지 않는 일(늘 한다)이고, 나머지는 있는 주인의 칸과 견준다.
        /// </summary>
        private sealed class Runner : IScheduledRunner
        {
            public Dictionary<uint, Owner> Owners { get; } = new Dictionary<uint, Owner>();

            public List<(ScheduledKind Kind, uint Owner, uint A)> Ran { get; } = new List<(ScheduledKind Kind, uint Owner, uint A)>();

            public Owner Spawn(uint id)
            {
                var owner = new Owner();
                Owners.Add(id, owner);
                return owner;
            }

            public bool IsCurrent(in ScheduledJob job)
            {
                if (job.Owner == 0)
                {
                    return true;
                }

                return Owners.TryGetValue(job.Owner, out Owner? owner) && (owner.Generations[(int)job.Kind] == job.Generation);
            }

            public bool ForCombat(ScheduledKind kind)
            {
                return kind == Strike;
            }

            public void Run(in ScheduledJob job)
            {
                Ran.Add((job.Kind, job.Owner, job.A));
            }
        }
    }
}
