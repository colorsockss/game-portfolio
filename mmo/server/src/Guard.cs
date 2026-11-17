using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 마을의 경비병(44). Npcs의 줄(역할이 경비병)마다 놓인 점에 서 있다가, 인식 범위에 든 선공 표시나 무법자인 플레이어를 쫓아가 친다.
    /// 수치는 그 줄이 가리키는 Monsters의 줄(공격력과 기본 공격, 이동 속도, 인식 범위, 추적 한계)이고 체력이 없어 공격 대상이 아니다.
    /// 시야에는 NPC로 들어가고(템플릿은 Npcs의 줄) 움직임은 몬스터처럼 알린다.
    /// </summary>
    public sealed class Guard : AiCreature
    {
        public Guard(uint id, NpcsRow row, MonstersRow template)
            : base(id, EntityKind.Npc, (row.X * Units.PerMeter) + (Units.PerMeter / 2), (row.Z * Units.PerMeter) + (Units.PerMeter / 2), template)
        {
            Row = row;
            SetStats(new Stats(0, 0, template.Attack, 0));
        }

        public NpcsRow Row { get; }

        internal override Walker WalkerKind => Walker.Player;

        /// <summary>
        /// 쫓는 플레이어(0이면 없음). 쫓는 동안에는 더 가까운 후보가 와도 바꾸지 않는다.
        /// </summary>
        internal uint Target { get; set; }

        protected override void Fill(EntityEnter enter)
        {
            FillMotion(enter);
            enter.TemplateId = Row.Id;
        }
    }
}
