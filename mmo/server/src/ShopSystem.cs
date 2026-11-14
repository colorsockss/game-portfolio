using System;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 상점(37). 상점 NPC가 하나라 요청에 NPC를 싣지 않고, 두 요청 모두 그 NPC까지 3 m 안이고 선이 트였는지를 먼저 본다(죽음과 기절은 World가 먼저 막음).
    /// 골드와 아이템은 한 요청 안에서 함께 바뀌어 그 틱의 InventoryChanged 하나로 간다. 산 것은 새로 얻은 것에 까닭 구매로 들고, 판 값은 들지 않는다.
    /// </summary>
    internal sealed class ShopSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly InventorySystem _inventory;
        private readonly Npc? _shop;
        private readonly long _interactRange;

        public ShopSystem(GameData data, FieldMap field, InventorySystem inventory, Npc? shop)
        {
            _data = data;
            _field = field;
            _inventory = inventory;
            _shop = shop;
            _interactRange = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        /// <summary>
        /// Buy(입력 차례): NPC 곁, Shops에 있는 아이템이고 1개 이상("아이템 없음"), 골드가 값 × 수량 이상("골드 부족"), 다 들어가는지("인벤토리 가득")를 보고
        /// 아이템을 넣으며 골드를 뺀다.
        /// </summary>
        public FailReason Buy(Player player, Buy request)
        {
            FailReason near = Near(player);
            if (near != FailReason.None)
            {
                return near;
            }

            if ((_data.ShopItem(request.ItemId) is not ShopsRow row) || (request.Count == 0))
            {
                return FailReason.NoItem;
            }

            ulong cost = (ulong)row.Price * request.Count;
            if (player.Bag.Gold < cost)
            {
                return FailReason.NotEnoughGold;
            }

            FailReason added = _inventory.Add(player, row.ItemId, request.Count, GainReason.Buy);
            if (added == FailReason.None)
            {
                player.Bag.Gold -= cost;
                player.Bag.GoldChanged = true;
            }

            return added;
        }

        /// <summary>
        /// Sell(입력 차례): NPC 곁, 인벤토리 칸의 아이템을 1개 이상 가진 수 이하로("아이템 없음"), 파는 값이 있는지("팔 수 없음")를 보고 빼며 골드를 더한다.
        /// 입은 장비는 인벤토리 칸이 아니라 벗어야 판다.
        /// </summary>
        public FailReason Sell(Player player, Sell request)
        {
            FailReason near = Near(player);
            if (near != FailReason.None)
            {
                return near;
            }

            ItemSlot[] slots = player.Bag.Slots;
            if ((request.Slot >= slots.Length) || (slots[request.Slot].ItemId == 0) || (request.Count == 0) || (slots[request.Slot].Count < request.Count))
            {
                return FailReason.NoItem;
            }

            uint price = _data.Item(slots[request.Slot].ItemId)!.SellPrice;
            if (price == 0)
            {
                return FailReason.Unsellable;
            }

            _inventory.Remove(player, (int)request.Slot, request.Count);
            _inventory.AddGold(player, (ulong)price * request.Count, GainReason.Unspecified);
            return FailReason.None;
        }

        /// <summary>
        /// 상점 NPC까지 3 m 안("사거리 밖")이고 선이 트였는가("막힘"). 상점 NPC가 없는 데이터(시험)면 "사거리 밖"이다.
        /// </summary>
        private FailReason Near(Player player)
        {
            if (_shop == null)
            {
                return FailReason.OutOfRange;
            }

            long dx = (long)_shop.X - player.X;
            long dz = (long)_shop.Z - player.Z;
            if ((dx * dx) + (dz * dz) > _interactRange * _interactRange)
            {
                return FailReason.OutOfRange;
            }

            return _field.HasLine(player.X, player.Z, _shop.X, _shop.Z) ? FailReason.None : FailReason.Blocked;
        }
    }
}
