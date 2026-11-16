using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// AiSystem이 움직이는 개체(몬스터 23, 경비병 44): 수치는 Monsters의 줄이고, 놓인 점(Home)을 기준으로 대기 → 추적 → 공격 → 복귀의 상태를 돌며
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
        /// 놓인 점(1/32 m). 추적 한계와 복귀의 기준이다.
        /// </summary>
        public (int X, int Z) Home { get; }

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
    }
}
