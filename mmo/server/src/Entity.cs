using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 필드 위의 것 하나(플레이어, 몬스터, NPC, 채집물, 바닥 아이템). 모두 같은 개체 번호 공간과 시야 칸을 쓰고,
    /// 시야에 들어올 때 보낼 것은 개체가 스스로 채운다(종류마다 싣는 것이 다름). 틱 스레드만 읽고 쓴다.
    /// 종류마다의 클래스는 그 기능의 항목이 만든다: 몬스터(23)는 Creature를, NPC(37), 채집물(47), 바닥 아이템(33)은 Entity를 잇는다.
    /// </summary>
    public abstract class Entity
    {
        protected Entity(uint id, EntityKind kind, int x, int z, uint yaw)
        {
            Id = id;
            Kind = kind;
            X = x;
            Z = z;
            Yaw = yaw;
        }

        /// <summary>
        /// 개체 번호. 개체가 사라질 때까지 바뀌지 않는다. 다시 쓰는 규칙은 EntityTable에 있다.
        /// </summary>
        public uint Id { get; }

        public EntityKind Kind { get; }

        /// <summary>
        /// 지면 좌표 x(칸).
        /// </summary>
        public int X { get; internal set; }

        /// <summary>
        /// 지면 좌표 z(칸).
        /// </summary>
        public int Z { get; internal set; }

        /// <summary>
        /// 방향(0 이상 Units.YawSteps 미만).
        /// </summary>
        public uint Yaw { get; internal set; }

        /// <summary>
        /// 들어 있는 시야 칸의 키.
        /// </summary>
        internal long Cell { get; set; }

        /// <summary>
        /// 이번 틱에 움직였다. 시야 차례가 EntityMoves에 넣은 뒤 내린다.
        /// </summary>
        internal bool Moved { get; set; }

        /// <summary>
        /// 이번 틱의 움직임이 걸은 것이 아니라 옮겨진 것이다(EntityMove.teleport). 시야 차례가 Moved와 함께 내린다.
        /// </summary>
        internal bool Teleported { get; set; }

        /// <summary>
        /// 이번 틱의 EntityMove. 이 개체를 보는 모든 연결의 EntityMoves가 같은 객체를 담는다.
        /// </summary>
        internal EntityMove? MoveMessage { get; set; }

        /// <summary>
        /// 이번 틱에 표시 상태가 바뀌었다. 시야 차례가 그 개체를 받은 연결과 본인에게 EntityState를 보낸 뒤 내린다.
        /// </summary>
        internal bool StateChanged { get; set; }

        /// <summary>
        /// 나를 받은 연결(52): EntitiesEnter를 보낸 뒤 EntitiesLeave를 보내기 전까지의 플레이어. 그 플레이어의 Visible에 내가 든 것과 늘 같고 ViewSystem만 바꾼다.
        /// 움직임, 표시 상태, 사건, 체력은 시야 칸을 돌지 않고 이 목록으로 보낸다.
        /// </summary>
        internal HashSet<Player> Watchers { get; } = new HashSet<Player>();

        /// <summary>
        /// 시야에 들어올 때 보낼 원소. 모두가 싣는 것(번호, 종류, 위치와 방향)을 채운 뒤 종류마다의 것을 더한다.
        /// </summary>
        internal EntityEnter EnterMessage()
        {
            var enter = new EntityEnter { Id = Id, Kind = Kind, X = X, Z = Z, Yaw = Yaw };
            Fill(enter);
            return enter;
        }

        /// <summary>
        /// 이 종류가 EntityEnter에 싣는 것을 채운다.
        /// </summary>
        protected abstract void Fill(EntityEnter enter);

        /// <summary>
        /// 표시 상태 변화. 표시 상태가 있는 종류(플레이어)가 채운다.
        /// </summary>
        internal virtual EntityState StateMessage()
        {
            return new EntityState { Id = Id };
        }
    }
}
