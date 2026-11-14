using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 마을의 NPC(37). 서버가 뜰 때 Npcs의 줄마다 놓인 점의 번호로 놓고, 움직이지 않으며 칸을 막지 않는다. EntityEnter에 템플릿 번호(Npcs의 줄)를 싣는다.
    /// 경비병(44)은 이것을 잇거나 바꾼다.
    /// </summary>
    public sealed class Npc : Entity
    {
        public Npc(uint id, NpcsRow row)
            : base(id, EntityKind.Npc, (row.X * Units.PerMeter) + (Units.PerMeter / 2), (row.Z * Units.PerMeter) + (Units.PerMeter / 2), 0)
        {
            Row = row;
        }

        public NpcsRow Row { get; }

        /// <summary>
        /// 플레이어가 이 NPC 곁인가: range(1/32 m) 안("사거리 밖")이고 선이 트였는가("막힘"). 상점(37)과 창고(75)가 함께 쓴다.
        /// </summary>
        internal FailReason Reach(Player player, FieldMap field, long range)
        {
            long dx = (long)X - player.X;
            long dz = (long)Z - player.Z;
            if ((dx * dx) + (dz * dz) > range * range)
            {
                return FailReason.OutOfRange;
            }

            return field.HasLine(player.X, player.Z, X, Z) ? FailReason.None : FailReason.Blocked;
        }

        protected override void Fill(EntityEnter enter)
        {
            enter.TemplateId = Row.Id;
        }
    }
}
