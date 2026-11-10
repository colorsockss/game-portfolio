using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드에 들어온 플레이어 개체 하나. 틱 스레드만 읽고 쓴다.
    /// </summary>
    public sealed class Player
    {
        /// <summary>
        /// 연결이 고른 캐릭터로 월드에 들어온 개체를 만든다.
        /// </summary>
        public Player(uint id, CharacterRecord character, Session session, SavedPosition position)
        {
            Id = id;
            CharacterId = character.Id;
            Name = character.Name;
            Class = character.Class;
            Session = session;
            X = position.X;
            Z = position.Z;
            Yaw = position.Yaw;
        }

        /// <summary>
        /// 개체 번호. 개체가 사라질 때까지 바뀌지 않고 다시 쓰지 않는다.
        /// </summary>
        public uint Id { get; }

        /// <summary>
        /// 저장소의 캐릭터 번호. 개체 번호와 달리 다시 들어와도 같다.
        /// </summary>
        public long CharacterId { get; }

        /// <summary>
        /// 캐릭터 이름. 머리 위에 보인다.
        /// </summary>
        public string Name { get; }

        /// <summary>
        /// 직업.
        /// </summary>
        public CharacterClass Class { get; }

        /// <summary>
        /// 이 개체를 움직이는 연결.
        /// </summary>
        public Session Session { get; }

        /// <summary>
        /// 서버가 받아들인 지면 좌표 x(칸).
        /// </summary>
        public int X { get; internal set; }

        /// <summary>
        /// 서버가 받아들인 지면 좌표 z(칸).
        /// </summary>
        public int Z { get; internal set; }

        /// <summary>
        /// 방향(0 이상 Units.YawSteps 미만).
        /// </summary>
        public uint Yaw { get; internal set; }

        /// <summary>
        /// 마지막으로 보낸 PositionReset의 ack. 이 값을 실은 Move만 받는다.
        /// </summary>
        public uint Ack { get; internal set; }

        /// <summary>
        /// 지금 더 움직일 수 있는 거리(칸). 틱마다 차오르고 받아들인 Move가 쓴다.
        /// </summary>
        internal double MoveBudget { get; set; }

        /// <summary>
        /// 이번 틱에 받아들인 Move가 있다.
        /// </summary>
        internal bool Moved { get; set; }

        /// <summary>
        /// 마지막으로 저장한 뒤에 움직였다.
        /// </summary>
        internal bool Dirty { get; set; }

        /// <summary>
        /// 로그인한 뒤 아직 자기 EntityEnter를 보내지 않았다.
        /// </summary>
        internal bool JustEntered { get; set; } = true;

        /// <summary>
        /// 들어 있는 시야 칸의 키.
        /// </summary>
        internal long Cell { get; set; }

        /// <summary>
        /// 지난 틱까지 이 플레이어에게 보였던 개체.
        /// </summary>
        internal HashSet<Player> Visible { get; set; } = new HashSet<Player>();

        /// <summary>
        /// 이번 틱의 시야를 모으는 집합. 다 모으면 Visible과 바꾼다.
        /// </summary>
        internal HashSet<Player> NextVisible { get; set; } = new HashSet<Player>();

        /// <summary>
        /// 이번 틱의 EntityMove. 이 개체를 보는 모든 플레이어의 EntityMoves가 같은 객체를 담는다.
        /// </summary>
        internal EntityMove? MoveMessage { get; set; }
    }
}
