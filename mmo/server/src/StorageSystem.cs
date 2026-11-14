using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 창고(75). 캐릭터마다 인벤토리와 같은 칸의 창고(Bag.Storage)를 두고, 열기·맡기기·찾기는 모두 창고 NPC까지 3 m 안이고 선이 트였는지를 먼저 본다(창고 NPC가 하나라
    /// 요청에 NPC를 싣지 않음). 두 배열 사이를 한 요청 안에서 옮기고(받는 쪽에 자리가 없으면 아무것도 옮기지 않음), 바뀐 칸은 InventoryChanged와 StorageChanged로 간다.
    /// 찾은 것은 새로 얻은 것이 아니라 알림과 퀵슬롯에 오르지 않는다. 골드는 맡기지 않는다.
    /// </summary>
    internal sealed class StorageSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly InventorySystem _inventory;
        private readonly Npc? _keeper;
        private readonly long _interactRange;

        public StorageSystem(GameData data, FieldMap field, InventorySystem inventory, Npc? keeper)
        {
            _data = data;
            _field = field;
            _inventory = inventory;
            _keeper = keeper;
            _interactRange = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        /// <summary>
        /// StorageOpen(입력 차례): 곁이면 Storage로 전체를 보내고, 아니면 ActionFailed(창고)다.
        /// </summary>
        public Outcome Open(Player player)
        {
            FailReason near = Near(player);
            if (near != FailReason.None)
            {
                return Outcome.Fail(near);
            }

            var whole = new Storage();
            whole.Slots.Add(player.Bag.Storage.Where(slot => slot.ItemId != 0).Select(slot => slot.Clone()));
            player.Session.Send(new Packet { Storage = whole });
            return Outcome.Done;
        }

        /// <summary>
        /// StorageDeposit(입력 차례): 인벤토리 칸의 아이템 1개 이상 가진 수 이하("아이템 없음")를 창고에 넣는다. 창고에 자리가 없으면 "창고 가득"이다.
        /// </summary>
        public FailReason Deposit(Player player, StorageDeposit request)
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

            ItemSlot from = slots[request.Slot];
            ItemSlot? into = Place(player.Bag.Storage, from.ItemId);
            if (into == null)
            {
                return FailReason.StorageFull;
            }

            (into.ItemId, into.Count, into.Enchant) = (from.ItemId, into.Count + request.Count, from.Enchant);
            player.Bag.ChangedStorage.Add((int)into.Index);
            _inventory.Remove(player, (int)request.Slot, request.Count);
            return FailReason.None;
        }

        /// <summary>
        /// StorageWithdraw(입력 차례): 창고 칸의 아이템을 인벤토리에 넣는다(까닭 없음). 인벤토리에 자리가 없으면 "인벤토리 가득"이다.
        /// </summary>
        public FailReason Withdraw(Player player, StorageWithdraw request)
        {
            FailReason near = Near(player);
            if (near != FailReason.None)
            {
                return near;
            }

            ItemSlot[] storage = player.Bag.Storage;
            if ((request.Slot >= storage.Length) || (storage[request.Slot].ItemId == 0) || (request.Count == 0) || (storage[request.Slot].Count < request.Count))
            {
                return FailReason.NoItem;
            }

            ItemSlot from = storage[request.Slot];
            FailReason added = _inventory.Add(player, from.ItemId, request.Count, GainReason.Unspecified, from.Enchant);
            if (added != FailReason.None)
            {
                return added;
            }

            from.Count -= request.Count;
            if (from.Count == 0)
            {
                (from.ItemId, from.Enchant) = (0u, 0u);
            }

            player.Bag.ChangedStorage.Add((int)from.Index);
            return FailReason.None;
        }

        /// <summary>
        /// 창고에서 그 아이템이 들어갈 칸: 겹치는 아이템은 같은 아이템이 든 칸이나 빈 칸, 겹치지 않는 아이템은 빈 칸. 없으면 null.
        /// </summary>
        private ItemSlot? Place(ItemSlot[] storage, uint itemId)
        {
            ItemSlot? same = _data.Item(itemId)!.Stackable ? storage.FirstOrDefault(slot => slot.ItemId == itemId) : null;
            return same ?? storage.FirstOrDefault(slot => slot.ItemId == 0);
        }

        /// <summary>
        /// 창고 NPC 곁인가. 창고 NPC가 없는 데이터(시험)면 "사거리 밖"이다.
        /// </summary>
        private FailReason Near(Player player)
        {
            return _keeper?.Reach(player, _field, _interactRange) ?? FailReason.OutOfRange;
        }
    }
}
