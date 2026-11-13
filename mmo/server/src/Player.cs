using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 월드에 들어온 플레이어 개체 하나. 연결(Session) 하나가 움직이고, 시야를 보는 쪽이다. 틱 스레드만 읽고 쓴다.
    /// </summary>
    public sealed class Player : Creature
    {
        /// <summary>
        /// 연결이 고른 캐릭터로 월드에 들어온 개체를 만든다.
        /// </summary>
        public Player(uint id, CharacterRecord character, Session session, SavedPosition position)
            : base(id, EntityKind.Player, position.X, position.Z, position.Yaw)
        {
            CharacterId = character.Id;
            Name = character.Name;
            Class = character.Class;
            Session = session;
        }

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
        /// 표시 상태: 레벨(31. 그 전에는 모두 1), 이름 색(44), 입은 무기(34. Items의 번호, 없으면 0).
        /// </summary>
        public uint Level { get; private set; } = 1;

        public NameColor NameColor { get; private set; }

        public uint WeaponItemId { get; private set; }

        /// <summary>
        /// 마지막으로 보낸 PositionReset의 ack. 이 값을 실은 Move만 받는다.
        /// </summary>
        public uint Ack { get; internal set; }

        /// <summary>
        /// 지금 더 움직일 수 있는 거리(칸). 틱마다 차오르고 받아들인 Move가 쓴다.
        /// </summary>
        internal double MoveBudget { get; set; }

        /// <summary>
        /// 마지막으로 저장한 뒤에 움직였다.
        /// </summary>
        internal bool Dirty { get; set; }

        /// <summary>
        /// 로그인한 뒤 아직 자기 EntityEnter를 보내지 않았다.
        /// </summary>
        internal bool JustEntered { get; set; } = true;

        /// <summary>
        /// 마지막으로 본인에게 보낸 SelfVitals. null이면 아직 보내지 않았다(월드에 들어온 틱).
        /// </summary>
        internal SelfVitals? SentVitals { get; set; }

        /// <summary>
        /// 능력치를 다시 구했다. 이 틱의 VitalsSystem이 본인에게 SelfStats를 보낸 뒤 내린다.
        /// </summary>
        internal bool StatsChanged { get; set; }

        /// <summary>
        /// 지난 틱까지 이 플레이어에게 보였던 개체.
        /// </summary>
        internal HashSet<Entity> Visible { get; set; } = new HashSet<Entity>();

        /// <summary>
        /// 이번 틱의 시야를 모으는 집합. 다 모으면 Visible과 바꾼다.
        /// </summary>
        internal HashSet<Entity> NextVisible { get; set; } = new HashSet<Entity>();

        /// <summary>
        /// 표시 상태를 바꾼다. 하나라도 바뀌면 이 틱의 시야 차례에 받은 연결과 본인에게 EntityState가 간다.
        /// </summary>
        public void SetDisplayState(uint level, NameColor nameColor, uint weaponItemId)
        {
            if ((level == Level) && (nameColor == NameColor) && (weaponItemId == WeaponItemId))
            {
                return;
            }

            Level = level;
            NameColor = nameColor;
            WeaponItemId = weaponItemId;
            StateChanged = true;
        }

        protected override void Fill(EntityEnter enter)
        {
            base.Fill(enter);
            enter.Name = Name;
            enter.CharacterClass = Class;
            enter.Level = Level;
            enter.NameColor = NameColor;
            enter.WeaponItemId = WeaponItemId;
        }

        internal override EntityState StateMessage()
        {
            return new EntityState { Id = Id, NameColor = NameColor, WeaponItemId = WeaponItemId, Level = Level };
        }
    }
}
