using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 필드의 채집물(47). 놓인 점의 번호로 놓고, 움직이지 않으며 칸을 막지 않는다. EntityEnter에 템플릿 번호(GatherNodes의 줄)를 싣고, 남은 횟수는 보내지 않는다.
    /// </summary>
    public sealed class GatherNode : Entity
    {
        internal GatherNode(GatherPoint point)
            : base(point.Id, EntityKind.GatherNode, point.X, point.Z, 0)
        {
            Point = point;
            UsesLeft = point.Row.Uses;
        }

        internal GatherPoint Point { get; }

        public GatherNodesRow Row => Point.Row;

        /// <summary>
        /// 남은 횟수. 0이 되면 월드에서 빠진다.
        /// </summary>
        public uint UsesLeft { get; internal set; }

        protected override void Fill(EntityEnter enter)
        {
            enter.TemplateId = Row.Id;
        }
    }

    /// <summary>
    /// 채집물의 놓인 점(47): 번호, 자리(1/32 m), 채집물의 줄, 스폰의 줄(다시 나오는 시간). 다시 나올 때도 같은 번호와 자리를 쓴다.
    /// </summary>
    internal sealed record GatherPoint(uint Id, int X, int Z, GatherNodesRow Row, SpawnsRow Spawn);
}
