using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// AiSystem이 움직이는 개체(몬스터 23, 경비병 44, 소환수 95): 수치는 Monsters의 줄이고, 놓인 점(Home)을 기준으로 대기 → 추적 → 공격 → 복귀의 상태를 돌며
    /// 길을 따라 걷는다. 걷는 쪽(Walker)이 몬스터는 몬스터 쪽, 경비병은 플레이어 쪽이라 경비병만 안전 지대의 칸을 걷는다.
    /// </summary>
    public abstract class AiCreature : Creature
    {
        protected AiCreature(uint id, EntityKind kind, int x, int z, MonstersRow template)
            : base(id, kind, x, z, 0)
        {
            Template = template;
            Home = (x, z);
            Detect = new Periodic(id % DetectIntervalTicks, DetectIntervalTicks);
        }

        /// <summary>
        /// 인식하는 간격(틱). 개체 번호를 이것으로 나눈 나머지가 같은 틱에 인식해 한 틱에 몰리지 않는다.
        /// </summary>
        public const uint DetectIntervalTicks = 5;

        public MonstersRow Template { get; }

        /// <summary>
        /// 놓인 점(1/32 m). 추적 한계와 복귀, 길을 찾는 범위의 중심이다. 소환수(95)는 지금 주인의 자리다.
        /// </summary>
        public virtual (int X, int Z) Home { get; }

        public MonsterState State { get; internal set; }

        /// <summary>
        /// 걷는 선과 길찾기가 쓰는 걷는 쪽.
        /// </summary>
        internal abstract Walker WalkerKind { get; }

        /// <summary>
        /// 인식할 차례(선공 몬스터와 경비병).
        /// </summary>
        internal Periodic Detect { get; }

        /// <summary>
        /// 따라가는 길의 꺾이는 점(1/32 m)과 다음 점의 차례. 비었으면 곧게 간다.
        /// </summary>
        internal List<(int X, int Z)> Path { get; } = new List<(int X, int Z)>();

        internal int PathIndex { get; set; }

        /// <summary>
        /// 길을 찾은 때의 대상 자리. 대상이 여기서 다시 찾는 거리(Constants)를 넘게 옮기면 길을 다시 찾는다.
        /// </summary>
        internal (int X, int Z) PathGoal { get; set; }

        /// <summary>
        /// 이번 틱에 걸었다(54). AI 차례의 처음에 내리고 걸음이 켠다. 걷는 동안의 빠르기는 MoveNotifier가 속도와 감속으로 구한다.
        /// </summary>
        internal bool Walked { get; set; }

        /// <summary>
        /// 걸어가는 다음 꺾이는 점(54): 길의 점, 배회의 점, 놓인 점, 쫓는 대상 앞의 설 자리. 걸은 틱에 MoveToward가 남기고, 곧게 쫓을 때의 설 자리는 구한 틱에 남긴다.
        /// 걷지 않은 틱의 값은 알리지 않는다.
        /// </summary>
        internal (int X, int Z) Next { get; set; }

        /// <summary>
        /// 이번 틱의 다음 꺾이는 점은 바뀌면 알림의 간격을 기다리지 않고 알린다(54). 지난 틱에 쫓던 대상을 이번 틱에도 쫓아 그 대상 앞의 설 자리나 새로 찾은
        /// 길의 첫 점으로 간 것(대상이 움직여 바뀐 점)만 거짓이다. 길의 둘째 점부터(앞 점에 닿아 넘어감), 배회, 복귀, 쫓기 시작함, 대상이 바뀜은 참이다.
        /// </summary>
        internal bool NextImmediate { get; set; }

        /// <summary>
        /// 이번 틱과 지난 틱에 쫓은 대상(0이면 쫓지 않음). NextImmediate를 정한다.
        /// </summary>
        internal uint Chased { get; set; }

        internal uint PreviousChased { get; set; }

        /// <summary>
        /// 곧게 쫓을 때 설 자리(Next)를 구한 대상의 자리(54). 같은 대상이 그 자리에 있으면 설 자리를 다시 구하지 않는다(지금 자리에서 다시 구하면 반올림으로
        /// 한 칸씩 흔들려 알림이 늘고, 보는 쪽이 이어 그리는 점과도 어긋남).
        /// </summary>
        internal (int X, int Z) StopFor { get; set; }
    }
}
