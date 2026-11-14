using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

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

        /// <summary>
        /// 지금 레벨에서 쌓은 경험치(31). 최대 레벨에서는 0이다. 저장(38) 전에는 들어올 때마다 레벨 1, 경험치 0으로 시작한다.
        /// </summary>
        public uint Exp { get; set; }

        /// <summary>
        /// 인벤토리(32). 월드에 들어올 때 InventorySystem.Enter가 칸 수만큼 만든다.
        /// </summary>
        internal Bag Bag { get; set; } = new Bag(0);

        /// <summary>
        /// 배운 스킬(36). 저장(38) 전에는 들어올 때마다 첫 스킬만 배운 채다.
        /// </summary>
        internal HashSet<uint> Skills { get; } = new HashSet<uint>();

        /// <summary>
        /// 퀵슬롯(36. 자리마다 종류와 번호, 빈 자리는 (Empty, 0)). 서버는 값을 기억만 한다.
        /// </summary>
        internal (QuickslotKind Kind, uint Id)[] Quickslots { get; } = new (QuickslotKind, uint)[(int)Constant.QuickslotCount];

        /// <summary>
        /// 이 틱에 퀵슬롯이 바뀌었다. 시야 차례에 Quickslots를 보낸 뒤 내린다.
        /// </summary>
        internal bool QuickslotsChanged { get; set; }

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
        /// 스킬마다 쿨다운이 끝나는 틱(쓸 때 지금 틱과 견줌). 죽어도 남고 저장하지 않는다.
        /// </summary>
        private readonly Dictionary<uint, uint> _cooldowns = new Dictionary<uint, uint>();

        /// <summary>
        /// 물약의 쓰는 종류(체력 회복, 마나 회복)마다 쿨다운이 끝나는 틱(32).
        /// </summary>
        private readonly Dictionary<ItemUse, uint> _potionCooldowns = new Dictionary<ItemUse, uint>();

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

        /// <summary>
        /// 스킬의 쿨다운이 끝나는 틱. 쓴 적이 없으면 0.
        /// </summary>
        public uint CooldownEnd(uint skillId)
        {
            return _cooldowns.GetValueOrDefault(skillId);
        }

        /// <summary>
        /// 쿨다운이 끝나는 틱을 두고 바뀐 것을 본인에게 Cooldowns로 보낸다.
        /// </summary>
        internal void SetCooldown(uint skillId, uint endTick)
        {
            _cooldowns[skillId] = endTick;
            var cooldowns = new Cooldowns();
            cooldowns.Entries.Add(new Cooldown { SkillId = skillId, EndTick = endTick });
            Session.Send(new Packet { Cooldowns = cooldowns });
        }

        public uint PotionCooldownEnd(ItemUse use)
        {
            return _potionCooldowns.GetValueOrDefault(use);
        }

        /// <summary>
        /// 물약의 쿨다운이 끝나는 틱을 두고 본인에게 Cooldowns(물약의 쓰는 종류)로 보낸다.
        /// </summary>
        internal void SetPotionCooldown(ItemUse use, uint endTick)
        {
            _potionCooldowns[use] = endTick;
            var cooldowns = new Cooldowns();
            cooldowns.Entries.Add(new Cooldown { Potion = (uint)use, EndTick = endTick });
            Session.Send(new Packet { Cooldowns = cooldowns });
        }

        /// <summary>
        /// 주어진 스킬들의 쿨다운 전체를 본인에게 보낸다(월드에 들어올 때, EnterWorldResult 뒤).
        /// </summary>
        internal void SendCooldowns(IEnumerable<uint> skillIds)
        {
            var cooldowns = new Cooldowns();
            foreach (uint skillId in skillIds)
            {
                cooldowns.Entries.Add(new Cooldown { SkillId = skillId, EndTick = CooldownEnd(skillId) });
            }

            Session.Send(new Packet { Cooldowns = cooldowns });
        }

        /// <summary>
        /// 요청 번호가 없는 요청의 실패를 이 연결에 알린다(끊지 않음).
        /// </summary>
        internal void Fail(FailReason reason, RequestKind request)
        {
            Session.Send(new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = request } });
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
