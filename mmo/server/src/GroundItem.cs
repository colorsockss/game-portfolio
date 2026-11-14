using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 바닥 아이템(33): 아이템 번호, 수량(골드면 금액), 강화 수치, 주인(플레이어의 개체 번호, 없으면 0. 파티는 42), 주인만 줍는 시간이 끝나는 틱,
    /// 플레이어가 떨어뜨렸는지. 움직이지 않고, 남는 시간이 지나면 LootSystem이 지운다.
    /// </summary>
    public sealed class GroundItem : Entity
    {
        public GroundItem(uint id, int x, int z, uint itemId, uint count, uint enchant, uint ownerPlayerId, uint ownerOnlyEndTick, bool droppedByPlayer, ulong generation)
            : base(id, EntityKind.GroundItem, x, z, 0)
        {
            ItemId = itemId;
            Count = count;
            Enchant = enchant;
            OwnerPlayerId = ownerPlayerId;
            OwnerOnlyEndTick = ownerOnlyEndTick;
            DroppedByPlayer = droppedByPlayer;
            Generation = generation;
        }

        public uint ItemId { get; }

        public uint Count { get; }

        public uint Enchant { get; }

        public uint OwnerPlayerId { get; }

        public uint OwnerOnlyEndTick { get; }

        public bool DroppedByPlayer { get; }

        /// <summary>
        /// 사라짐의 예약과 견주는 세대 번호.
        /// </summary>
        internal ulong Generation { get; }

        /// <summary>
        /// 이 플레이어가 지금 주울 수 있는가: 주인이 없거나 그 플레이어이거나 주인만 줍는 시간이 지났다.
        /// </summary>
        public bool CanPickUp(uint playerId, uint tick)
        {
            return (OwnerPlayerId == 0) || (OwnerPlayerId == playerId) || (tick >= OwnerOnlyEndTick);
        }

        protected override void Fill(EntityEnter enter)
        {
            enter.ItemId = ItemId;
            enter.Count = Count;
            enter.Enchant = Enchant;
            if (OwnerPlayerId != 0)
            {
                enter.OwnerPlayerId = OwnerPlayerId;
            }

            enter.OwnerOnlyEndTick = OwnerOnlyEndTick;
            enter.DroppedByPlayer = DroppedByPlayer;
        }
    }
}
