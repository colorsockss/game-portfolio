using System;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 능력치 넷. 플레이어는 레벨의 기본값(Levels) + 장비와 강화(34, 35) + 효과(26)이고, 몬스터는 Monsters의 줄(23)이다.
    /// </summary>
    public readonly record struct Stats(uint MaxHp, uint MaxMp, uint Attack, uint Defense);

    /// <summary>
    /// 체력이 있어 싸우는 개체(플레이어, 몬스터). 걸린 효과와 진행 중인 일(26)은 그 항목이 더한다.
    /// 공식(Formulas)이 능력치를 읽는 쪽이다.
    /// </summary>
    public abstract class Creature : Entity, IAbilityOwner
    {
        protected Creature(uint id, EntityKind kind, int x, int z, uint yaw)
            : base(id, kind, x, z, yaw)
        {
        }

        /// <summary>
        /// 능력치. StatSystem이 다시 구해 SetStats로 넣는다.
        /// </summary>
        public Stats Stats { get; private set; }

        public uint Hp { get; internal set; }

        public uint MaxHp => Stats.MaxHp;

        public uint Mp { get; internal set; }

        public uint MaxMp => Stats.MaxMp;

        /// <summary>
        /// 전투 상태가 끝나는 틱(그 틱부터 전투 상태가 아님). 미루는 것은 공격과 피해(24), 상태 이상(26)이다. 쓸 때 지금 틱과 견준다(예약하지 않음).
        /// </summary>
        public uint CombatEndTick { get; internal set; }

        /// <summary>
        /// 죽어 있다(25).
        /// </summary>
        public bool Dead { get; internal set; }

        /// <summary>
        /// 피해가 아닌 까닭으로 체력이나 최대 체력이 바뀌었다. VitalsSystem이 1초마다 이 개체를 받은 연결에 EntityVitals로 보낸 뒤 내린다.
        /// </summary>
        internal bool VitalsChanged { get; set; }

        public bool InCombat(uint tick)
        {
            return tick < CombatEndTick;
        }

        /// <summary>
        /// 다시 구한 능력치를 넣는다. 최대값이 줄어 지금 체력이나 마나가 넘으면 최대값으로 맞춘다.
        /// </summary>
        internal void SetStats(Stats stats)
        {
            if (stats.MaxHp != Stats.MaxHp)
            {
                VitalsChanged = true;
            }

            Stats = stats;
            Hp = Math.Min(Hp, stats.MaxHp);
            Mp = Math.Min(Mp, stats.MaxMp);
        }

        /// <summary>
        /// 피해가 아닌 회복. 최대값까지 채우고, 체력이 바뀌었으면 EntityVitals에 싣는다.
        /// </summary>
        internal void Restore(uint hp, uint mp)
        {
            uint before = Hp;
            Hp = (uint)Math.Min((ulong)Hp + hp, MaxHp);
            Mp = (uint)Math.Min((ulong)Mp + mp, MaxMp);
            VitalsChanged |= Hp != before;
        }

        public double Get(AbilityType type)
        {
            return type switch
            {
                AbilityType.Attack => Stats.Attack,
                AbilityType.Defense => Stats.Defense,
                _ => throw new ArgumentOutOfRangeException(nameof(type), type, null),
            };
        }

        protected override void Fill(EntityEnter enter)
        {
            enter.Hp = Hp;
            enter.MaxHp = MaxHp;
            enter.Dead = Dead;
        }
    }
}
