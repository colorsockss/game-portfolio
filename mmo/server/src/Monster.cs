using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터의 상태(설계의 몬스터): 대기(배회) → 추적 → 공격 → 복귀.
    /// </summary>
    public enum MonsterState
    {
        Idle,
        Chase,
        Attack,
        Return,
    }

    /// <summary>
    /// 놓인 점. 서버가 뜰 때 Spawns의 무리마다 흩어 고른 자리이고, 개체 번호를 하나 받아 다시 나올 때도 쓴다.
    /// 추적 한계, 복귀, 배회, 리스폰의 기준이다. 리스폰의 주인이 개체가 아니라 이것이다(개체는 그 전에 사라짐).
    /// </summary>
    public sealed class PlacedPoint
    {
        public PlacedPoint(uint id, int x, int z, SpawnsRow spawn, MonstersRow template, bool summoned = false)
        {
            Id = id;
            X = x;
            Z = z;
            Spawn = spawn;
            Template = template;
            Summoned = summoned;
        }

        /// <summary>
        /// 개발 명령으로 부른 몬스터의 자리(68). 죽으면 다시 나오지 않는다.
        /// </summary>
        public bool Summoned { get; }

        public uint Id { get; }

        /// <summary>
        /// 자리(1/32 m).
        /// </summary>
        public int X { get; }

        public int Z { get; }

        public SpawnsRow Spawn { get; }

        public MonstersRow Template { get; }
    }

    /// <summary>
    /// 몬스터 하나. 수치는 Monsters의 줄이고 놓인 점이 기준이다. 틱 스레드의 AiSystem만 움직인다.
    /// </summary>
    public sealed class Monster : AiCreature
    {
        public Monster(PlacedPoint placed)
            : base(placed.Id, EntityKind.Monster, placed.X, placed.Z, placed.Template)
        {
            Placed = placed;
        }

        public PlacedPoint Placed { get; }

        internal override Walker WalkerKind => Walker.Monster;

        /// <summary>
        /// 플레이어마다 준 피해의 합. 인식한 플레이어는 0으로 든다.
        /// </summary>
        internal DamageTable Damage { get; } = new DamageTable();

        /// <summary>
        /// "닿을 수 없음"으로 표시한 플레이어 → 그 표시를 지우는 예약의 세대 번호. 지우는 일은 예약한 일(20)이 5초 뒤에 한다.
        /// </summary>
        internal Dictionary<uint, ulong> Unreachable { get; } = new Dictionary<uint, ulong>();

        /// <summary>
        /// 배회: 걷는 중인 점이 있는지, 그 점, 다음에 걷기 시작할 틱.
        /// </summary>
        internal bool Wandering { get; set; }

        internal (int X, int Z) WanderGoal { get; set; }

        internal uint WanderResumeTick { get; set; }

        /// <summary>
        /// 이 몬스터의 수명의 세대 번호(사라짐의 예약). 놓일 때 새 번호를 받아, 같은 번호로 다시 나온 몬스터에 옛 예약이 걸리지 않는다.
        /// </summary>
        internal ulong LifeGeneration { get; set; }

        /// <summary>
        /// 범위 공격(43)을 다시 걸 수 있는 틱(쿨다운의 끝)과 걸린 범위 공격의 예약과 견주는 세대 번호(0이면 아직 받지 않음. 복귀를 시작하면 0으로 돌림).
        /// </summary>
        internal uint AreaReadyTick { get; set; }

        internal ulong AreaGeneration { get; set; }

        /// <summary>
        /// 죽는 순간 피해 표에서 합이 가장 큰 편(잡은 편. 그 순간의 파티, 없으면 플레이어. PartySystem.SideOf). 경험치(31)와 드롭의 주인(33)이 쓴다. 표가 비었으면 null.
        /// </summary>
        public ulong? Killer { get; internal set; }

        protected override void Fill(EntityEnter enter)
        {
            base.Fill(enter);
            enter.TemplateId = Template.Id;
        }
    }
}
