using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 예약한 일의 종류. 예약을 넣는 기능의 항목이 줄을 더하고, World의 IScheduledRunner 갈래에 주인 찾기와 실행을 더한다
    /// (효과의 끝 26, 선공 표시의 끝 44, 남은 캐릭터 빼기 46, 진행 중인 일의 끝 26·32·47·48, 타격 24·26, 보스 범위 공격 43,
    /// 리스폰 25·47, 사라짐 25·33, 파티 초대의 만료 42, "닿을 수 없음"의 끝 23, 소환수 95).
    /// </summary>
    public enum ScheduledKind : byte
    {
        /// <summary>
        /// 몬스터(주인)가 대상(A)에 건 "닿을 수 없음"의 끝(23). 세대 번호는 대상마다의 표시에 있다.
        /// </summary>
        UnreachableEnd = 1,

        /// <summary>
        /// 공격자(주인)의 기본 공격이 대상(A)에 맞는 틱(24). 세대 번호는 공격자의 StrikeGeneration이고 전투 차례로 넘긴다.
        /// </summary>
        Strike = 2,

        /// <summary>
        /// 죽은 몬스터(주인)가 사라지는 틱(25). 세대 번호는 몬스터의 LifeGeneration이다.
        /// </summary>
        Despawn = 3,

        /// <summary>
        /// 놓인 점(주인)에 몬스터가 다시 나오는 틱(25). 놓인 점의 리스폰은 한 번만 걸리므로 세대 번호를 쓰지 않는다.
        /// </summary>
        Respawn = 4,

        /// <summary>
        /// 시전 시간이 없는 스킬(A)의 시작(26). 입력 차례에 그 틱으로 넣어 같은 틱의 전투 차례가 SkillUsed를 낸다. 주인은 시전자, B는 대상이고
        /// 세대 번호는 시전자의 StrikeGeneration이다(그 사이에 죽거나 기절하면 버림).
        /// </summary>
        SkillStart = 5,

        /// <summary>
        /// 스킬(A)의 결과가 대상(B)에 적용되는 틱(26). 세대 번호는 시전자의 StrikeGeneration이고 전투 차례로 넘긴다.
        /// </summary>
        SkillHit = 6,

        /// <summary>
        /// 시전(진행 중인 일)의 끝(26). 세대 번호는 진행 중인 일의 것이고 전투 차례로 넘긴다.
        /// </summary>
        CastEnd = 7,

        /// <summary>
        /// 시전이 아닌 진행 중인 일(귀환 32, 채집 47, 제작 48)의 끝. 세대 번호는 진행 중인 일의 것이다.
        /// </summary>
        ProgressEnd = 8,

        /// <summary>
        /// 개체(주인)에 붙은 효과(A)의 끝(26). 세대 번호는 붙은 효과의 것이다.
        /// </summary>
        EffectEnd = 9,

        /// <summary>
        /// 바닥 아이템(주인)이 사라지는 틱(33). 세대 번호는 그 바닥 아이템의 것이다(번호를 다시 쓴 새 아이템을 지우지 않게).
        /// </summary>
        GroundItemExpire = 10,

        /// <summary>
        /// 초대받은 플레이어(주인)가 받은 파티 초대의 만료(42). 세대 번호는 그 초대의 것이다(답했거나 지운 초대의 예약은 버림).
        /// </summary>
        PartyInviteExpire = 11,

        /// <summary>
        /// 보스(주인)의 범위 공격이 피해를 주는 틱(43). A, B는 고정한 중심의 x, z(int를 그대로 담음)이고, 세대 번호는 보스의 AreaGeneration이며 전투 차례로 넘긴다.
        /// </summary>
        AreaHit = 12,

        /// <summary>
        /// 플레이어(주인)의 선공 표시가 끝나는 틱(44). A는 넣을 때의 끝나는 틱이고, 다시 붙어 끝나는 틱이 바뀐 옛 예약은 꺼낼 때 버린다(세대 번호를 쓰지 않음).
        /// </summary>
        AggressorEnd = 13,
    }

    /// <summary>
    /// 예약한 일 하나. 델리게이트 없이 값만 가져 예약마다 할당하지 않는다. 값 둘(대상의 번호, 스킬이나 효과의 번호 등)보다 큰 것은 주인 쪽에 둔다.
    /// </summary>
    /// <param name="Owner">예약의 주인(개체 번호, 놓인 점의 번호 등. 종류가 정함).</param>
    /// <param name="Generation">넣을 때 주인의 세대 번호 칸에 쓴 번호. 세대 번호를 쓰지 않는 종류는 0.</param>
    public readonly record struct ScheduledJob(ScheduledKind Kind, uint Owner, uint A, uint B, ulong Generation);

    /// <summary>
    /// 꺼낸 일을 종류에 따라 시스템에 넘기는 쪽(World). 테스트는 시험용 종류로 따로 만든다.
    /// </summary>
    public interface IScheduledRunner
    {
        /// <summary>
        /// 주인이 아직 있고 그 종류의 세대 번호 칸이 일의 번호와 같은가. 아니면 일을 버린다.
        /// </summary>
        bool IsCurrent(in ScheduledJob job);

        /// <summary>
        /// 스킬과 공격의 결과를 내는 종류(타격의 결과, 시전의 끝, 보스 범위 공격의 피해)인가. 이것은 전투 차례로 넘긴다.
        /// </summary>
        bool ForCombat(ScheduledKind kind);

        /// <summary>
        /// 꺼낸 자리에서 일을 한다(효과의 끝, 리스폰, 사라짐 등).
        /// </summary>
        void Run(in ScheduledJob job);
    }

    /// <summary>
    /// 끝나는 틱에 할 일의 큐(설계의 예약한 일). 틱의 둘째 차례(입력 다음, 몬스터 앞)에 "끝나는 틱 ≤ 지금 틱"인 일을 모두 꺼낸다.
    /// 키가 (끝나는 틱, 넣은 순번)이라 같은 틱의 일은 넣은 순서대로, 틱 번호가 건너뛰어도 밀린 일이 틱과 순번의 차례대로 한 번씩 나온다.
    /// 옛 예약은 큐에서 지우지 않고 세대 번호로 꺼낼 때 버린다. 틱 번호는 서버가 다시 뜨면 0부터라 저장하지 않는다. 틱 스레드에서만 부른다.
    /// </summary>
    public sealed class Scheduler
    {
        private readonly PriorityQueue<ScheduledJob, (uint Due, ulong Order)> _queue = new PriorityQueue<ScheduledJob, (uint Due, ulong Order)>();
        private ulong _order;

        /// <summary>
        /// 마지막으로 준 세대 번호. 서버 전체에서 한 번씩만 주므로, 번호를 다시 쓴 새 개체의 칸이 옛 일의 번호와 같을 수 없다.
        /// </summary>
        private ulong _lastGeneration;

        /// <summary>
        /// 꺼낸 순서대로 넘긴 전투 차례의 일. 전투 차례(24)가 차례대로 실행하고 비운다.
        /// </summary>
        public List<ScheduledJob> CombatJobs { get; } = new List<ScheduledJob>();

        /// <summary>
        /// 큐에 든 일 수(버릴 옛 일 포함).
        /// </summary>
        public int Count => _queue.Count;

        /// <summary>
        /// due 틱에 할 일을 넣고 주인의 그 종류의 세대 번호 칸(generation)에 새 번호를 쓴다. 칸에 있던 번호의 옛 예약은 꺼낼 때 버려진다.
        /// 끝나는 틱을 바꾸려면 다시 넣고, 취소하려면 칸을 0으로 둔다(0은 주지 않는 번호). 시간은 Units.TicksFromMilliseconds로 바꾼 틱 수로 받는다.
        /// </summary>
        public void Add(uint due, ScheduledKind kind, uint owner, uint a, uint b, ref ulong generation)
        {
            generation = ++_lastGeneration;
            Add(due, new ScheduledJob(kind, owner, a, b, generation));
        }

        /// <summary>
        /// 주인의 칸에 이미 있는 세대 번호(generation)로 일을 넣는다. 한 칸의 번호로 여럿이 함께 걸리는 일(공격자의 타격들)이 쓰고,
        /// 버릴 때는 칸에 NewGeneration을 쓴다.
        /// </summary>
        public void Add(uint due, ScheduledKind kind, uint owner, uint a, uint b, ulong generation)
        {
            Add(due, new ScheduledJob(kind, owner, a, b, generation));
        }

        /// <summary>
        /// 아직 준 적 없는 세대 번호. 칸에 써서 그 칸의 옛 일을 모두 버리거나, 번호를 다시 쓴 새 개체의 칸을 처음 채운다.
        /// </summary>
        public ulong NewGeneration()
        {
            return ++_lastGeneration;
        }

        /// <summary>
        /// 세대 번호를 쓰지 않는 일(한 번만 걸리는 놓인 점의 리스폰, 연결로 버리는 남은 캐릭터 빼기)을 넣는다.
        /// </summary>
        public void Add(uint due, ScheduledKind kind, uint owner, uint a = 0, uint b = 0)
        {
            Add(due, new ScheduledJob(kind, owner, a, b, 0));
        }

        /// <summary>
        /// 끝나는 틱이 now 이하인 일을 모두 꺼낸다. 주인이 없거나 세대 번호가 다르면 버리고, 전투 차례의 일은 CombatJobs로 옮기고, 나머지는 바로 한다.
        /// 하는 중에 now 이하로 넣은 일도 이번에 나온다.
        /// </summary>
        public void Step(uint now, IScheduledRunner runner)
        {
            while (_queue.TryPeek(out ScheduledJob job, out (uint Due, ulong Order) key) && (key.Due <= now))
            {
                _queue.Dequeue();
                if (!runner.IsCurrent(job))
                {
                    continue;
                }

                if (runner.ForCombat(job.Kind))
                {
                    CombatJobs.Add(job);
                }
                else
                {
                    runner.Run(job);
                }
            }
        }

        private void Add(uint due, ScheduledJob job)
        {
            _queue.Enqueue(job, (due, _order++));
        }
    }
}
