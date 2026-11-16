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
        /// Run이 던진 예외. 쓰기의 실패는 저장 스레드를 멈추고(SaveQueue.WriteFailed) 서버가 끝난다. 읽기의 실패는 그 일의 Complete가 실패로 답한다(39).
        /// </summary>
        public Exception? Failure { get; set; }

        /// <summary>
        /// 쓰기 묶음인가(실패하면 뒤의 일을 하지 않음).
        /// </summary>
        public virtual bool IsWrite => false;

        /// <summary>
        /// 이 일을 부른 연결. Complete에서 예외가 나면 이 연결만 끊는다(39).
        /// </summary>
        public Session? Owner { get; init; }

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
        private int _pendingWrites;
        private volatile bool _writeFailed;
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
        /// 아직 쓰지 못한 쓰기 묶음의 수(내려갈 때의 로그).
        /// </summary>
        public int PendingWrites => Volatile.Read(ref _pendingWrites);

        /// <summary>
        /// 쓰기 묶음 하나가 실패했다. 그 묶음과 뒤의 일은 하지 않고(앞에서부터 쓴 만큼만 남아 아이템이 복사되지 않음), 서버는 새 사본 없이 끝난다(39).
        /// </summary>
        public bool WriteFailed => _writeFailed;

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
            if (job.IsWrite)
            {
                Interlocked.Increment(ref _pendingWrites);
            }

            _jobs.Enqueue(job);
            if (Interlocked.CompareExchange(ref _running, 1, 0) == 0)
            {
                Task.Run(Pump);
            }
        }

        /// <summary>
        /// 틱 스레드: 끝난 일의 결과를 끝난 차례대로 반영한다. 결과를 반영하다 난 예외는 onError로 넘기고 다음 일을 이어 한다(39).
        /// </summary>
        public void CompleteFinished(Action<StoreJob, Exception> onError)
        {
            while (_finished.TryDequeue(out StoreJob? job))
            {
                if (job.Failure != null)
                {
                    Console.Error.WriteLine($"{job.GetType().Name} failed: {job.Failure}");
                }

                try
                {
                    job.Complete();
                }
                catch (Exception exception)
                {
                    onError(job, exception);
                }
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

        private void Done(StoreJob job)
        {
            if (job.IsWrite)
            {
                Interlocked.Decrement(ref _pendingWrites);
            }

            Interlocked.Decrement(ref _pending);
        }

        private void Pump()
        {
            while (true)
            {
                while (_jobs.TryDequeue(out StoreJob? job))
                {
                    if (_writeFailed)
                    {
                        // 쓰기가 실패한 뒤의 일은 하지 않는다(뒤의 묶음이 앞의 실패를 건너뛰어 쓰이지 않게).
                        Done(job);
                        continue;
                    }

                    if (Delay > TimeSpan.Zero)
                    {
                        Thread.Sleep(Delay);
                    }

                    long started = Stopwatch.GetTimestamp();
                    try
                    {
                        // 저장소를 닫는 쪽(CharacterStore.Dispose)이 같은 잠금을 잡아, 쓰는 도중의 트랜잭션을 닫지 않는다.
                        lock (_store)
                        {
                            job.Run(_store);
                        }
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

                    if ((job.Failure != null) && job.IsWrite)
                    {
                        Console.Error.WriteLine($"Writing a save batch failed; later jobs are dropped: {job.Failure}");
                        _writeFailed = true;
                    }

                    _finished.Enqueue(job);
                    Done(job);
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
