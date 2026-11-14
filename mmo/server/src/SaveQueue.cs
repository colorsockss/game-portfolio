using System;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 저장 스레드의 일 하나(38). Run은 저장 스레드에서 데이터베이스를 읽고 쓰고, Complete는 틱 스레드의 입력 차례에서 그 결과를 월드에 반영한다(쓰기는 할 일이 없음).
    /// </summary>
    internal abstract class StoreJob
    {
        /// <summary>
        /// Run이 던진 예외. 실패의 규칙(다시 쓰기, 내려가기)은 39가 정하고, 지금은 로그만 남긴다.
        /// </summary>
        public Exception? Failure { get; set; }

        public abstract void Run(CharacterStore store);

        public virtual void Complete()
        {
        }
    }

    /// <summary>
    /// 틱이 넣은 일을 들어온 순서대로 하나씩 하는 저장 스레드(38). 틱은 넣기만 하고 디스크를 기다리지 않는다. 일이 있을 때만 스레드 풀의 스레드 하나가
    /// 돌며 큐를 비우므로 한 번에 하나씩, 넣은 차례대로 돈다. 끝난 일은 완료 큐에 쌓였다가 틱의 입력 차례(CompleteFinished)에서 Complete가 불린다.
    /// </summary>
    internal sealed class SaveQueue
    {
        private readonly CharacterStore _store;
        private readonly ConcurrentQueue<StoreJob> _jobs = new ConcurrentQueue<StoreJob>();
        private readonly ConcurrentQueue<StoreJob> _finished = new ConcurrentQueue<StoreJob>();
        private int _running;
        private int _pending;
        private readonly object _statsLock = new object();
        private int _statsJobs;
        private TimeSpan _statsTotal;
        private TimeSpan _statsMax;

        public SaveQueue(CharacterStore store)
        {
            _store = store;
        }

        /// <summary>
        /// 시험이 저장 스레드를 일부러 늦춘다(일마다 Run 앞에서 기다림).
        /// </summary>
        internal TimeSpan Delay { get; set; }

        /// <summary>
        /// 아직 끝나지 않은 일의 수.
        /// </summary>
        public int Pending => Volatile.Read(ref _pending);

        /// <summary>
        /// 지난번에 꺼낸 뒤로 끝난 일의 수, 든 시간의 합과 가장 긴 것(10초 통계 줄. 측정용).
        /// </summary>
        public (int Jobs, TimeSpan Total, TimeSpan Max) TakeStats()
        {
            lock (_statsLock)
            {
                (int, TimeSpan, TimeSpan) stats = (_statsJobs, _statsTotal, _statsMax);
                (_statsJobs, _statsTotal, _statsMax) = (0, TimeSpan.Zero, TimeSpan.Zero);
                return stats;
            }
        }

        public void Enqueue(StoreJob job)
        {
            Interlocked.Increment(ref _pending);
            _jobs.Enqueue(job);
            if (Interlocked.CompareExchange(ref _running, 1, 0) == 0)
            {
                Task.Run(Pump);
            }
        }

        /// <summary>
        /// 틱 스레드: 끝난 일의 결과를 끝난 차례대로 반영한다.
        /// </summary>
        public void CompleteFinished()
        {
            while (_finished.TryDequeue(out StoreJob? job))
            {
                if (job.Failure != null)
                {
                    Console.Error.WriteLine($"{job.GetType().Name} failed: {job.Failure.Message}");
                }

                job.Complete();
            }
        }

        /// <summary>
        /// 큐가 빌 때까지 기다린다(내려갈 때와 시험). 한도를 넘으면 false다.
        /// </summary>
        public bool WaitIdle(TimeSpan timeout)
        {
            var watch = Stopwatch.StartNew();
            var spin = new SpinWait();
            while (Pending > 0)
            {
                if (watch.Elapsed > timeout)
                {
                    return false;
                }

                spin.SpinOnce();
            }

            return true;
        }

        private void Pump()
        {
            while (true)
            {
                while (_jobs.TryDequeue(out StoreJob? job))
                {
                    if (Delay > TimeSpan.Zero)
                    {
                        Thread.Sleep(Delay);
                    }

                    long started = Stopwatch.GetTimestamp();
                    try
                    {
                        job.Run(_store);
                    }
                    catch (Exception exception)
                    {
                        job.Failure = exception;
                    }

                    TimeSpan elapsed = Stopwatch.GetElapsedTime(started);
                    lock (_statsLock)
                    {
                        _statsJobs++;
                        _statsTotal += elapsed;
                        _statsMax = elapsed > _statsMax ? elapsed : _statsMax;
                    }

                    _finished.Enqueue(job);
                    Interlocked.Decrement(ref _pending);
                }

                Volatile.Write(ref _running, 0);
                // 내리는 사이에 들어온 일은 그것을 넣은 쪽이 새로 돌리거나(내린 뒤), 여기서 다시 잡는다(내리기 전).
                if (_jobs.IsEmpty || (Interlocked.CompareExchange(ref _running, 1, 0) != 0))
                {
                    return;
                }
            }
        }
    }
}
