using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 체력이 있어 싸우는 개체(플레이어, 몬스터). 능력치(22), 걸린 효과와 진행 중인 일(26), 전투 상태(24)는 그 항목이 더한다.
    /// </summary>
    public abstract class Creature : Entity
    {
        protected Creature(uint id, EntityKind kind, int x, int z, uint yaw)
            : base(id, kind, x, z, yaw)
        {
        }

        /// <summary>
        /// 체력. 값을 채우는 것은 능력치(22)다.
        /// </summary>
        public uint Hp { get; internal set; }

        public uint MaxHp { get; internal set; }

        /// <summary>
        /// 죽어 있다(25).
        /// </summary>
        public bool Dead { get; internal set; }

        protected override void Fill(EntityEnter enter)
        {
            enter.Hp = Hp;
            enter.MaxHp = MaxHp;
            enter.Dead = Dead;
        }
    }
}
