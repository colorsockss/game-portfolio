using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 소환수(95). 마법사의 소환 스킬이 주인의 자리에 부르고, 남는 시간 동안 주인을 따라다니며 주인이 친 대상을 친다. 체력·능력치·효과는 몬스터처럼
    /// Monsters의 줄이고, 걷는 쪽은 플레이어이며, 길을 찾는 중심(Home)은 지금 주인의 자리다. 저장하지 않는다.
    /// </summary>
    public sealed class Summon : AiCreature
    {
        public Summon(uint id, Player owner, MonstersRow template, uint endTick)
            : base(id, EntityKind.Summon, owner.X, owner.Z, template)
        {
            Owner = owner;
            EndTick = endTick;
            SetStats(new Stats(template.MaxHp, 0, template.Attack, template.Defense));
            Hp = MaxHp;
        }

        public Player Owner { get; }

        /// <summary>
        /// 남는 시간이 끝나는 틱(EntityEnter에 실음).
        /// </summary>
        public uint EndTick { get; }

        /// <summary>
        /// 치는 대상(0이면 따라가기). 주인이 기본 공격이나 단일 대상 스킬을 시작한 대상이 들어온다.
        /// </summary>
        internal uint Target { get; set; }

        /// <summary>
        /// 이 소환수의 수명의 세대 번호(끝과 죽은 뒤 빼기의 예약). 번호를 다시 쓴 새 소환수에 옛 예약이 걸리지 않는다.
        /// </summary>
        internal ulong LifeGeneration { get; set; }

        public override (int X, int Z) Home => (Owner.X, Owner.Z);

        internal override Walker WalkerKind => Walker.Player;

        protected override void Fill(EntityEnter enter)
        {
            base.Fill(enter);
            enter.TemplateId = Template.Id;
            enter.SummonOwnerId = Owner.Id;
            enter.SummonEndTick = EndTick;
        }
    }
}
