using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 플레이어의 인벤토리(가방. 32): 칸들(아이템 번호, 수량, 강화 수치)과 골드, 이 틱에 바뀐 칸과 새로 얻은 것.
    /// </summary>
    internal sealed class Bag
    {
        public Bag(int size)
        {
            Slots = new ItemSlot[size];
            for (int index = 0; index < size; index++)
            {
                Slots[index] = new ItemSlot { Place = ItemPlace.Inventory, Index = (uint)index };
            }
        }

        /// <summary>
        /// 칸들. 빈 칸은 아이템 번호가 0이다. 칸의 객체는 바꾸지 않고 값만 고친다(보낼 때 복사함).
        /// </summary>
        public ItemSlot[] Slots { get; }

        public ulong Gold { get; set; }

        /// <summary>
        /// 이 틱에 바뀐 칸의 번호와 골드, 새로 얻은 것. 시야 차례에 InventoryChanged 하나로 보내고 비운다.
        /// </summary>
        public SortedSet<int> Changed { get; } = new SortedSet<int>();

        public bool GoldChanged { get; set; }

        public List<Gain> Gains { get; } = new List<Gain>();

        /// <summary>
        /// 그 아이템을 가진 수의 합.
        /// </summary>
        public uint CountOf(uint itemId)
        {
            return (uint)Slots.Where(slot => slot.ItemId == itemId).Sum(slot => slot.Count);
        }
    }

    /// <summary>
    /// 인벤토리와 아이템 사용(32). 넣기는 다 들어가거나 아무것도 넣지 않는다(겹치는 아이템은 같은 아이템이 든 칸, 없으면 빈 칸 하나. 겹치지 않는
    /// 아이템은 하나에 빈 칸 하나). 바뀐 것은 모았다가 시야 차례(Flush)에 InventoryChanged로 보낸다. 물약은 바로 채우고 쓰는 종류마다의 쿨다운을 걸며,
    /// 귀환 주문서는 진행 중인 일(귀환)을 시작해 끝나는 틱에 마을의 부활 지점으로 옮긴다.
    /// </summary>
    internal sealed class InventorySystem
    {
        private readonly GameData _data;
        private readonly ProgressSystem _progress;
        private readonly MovementSystem _movement;
        private readonly (int X, int Z) _respawn;

        public InventorySystem(GameData data, ProgressSystem progress, MovementSystem movement)
        {
            _data = data;
            _progress = progress;
            _movement = movement;
            ZonesRow town = data.Zones.Rows.First(zone => zone.Kind == ZoneKind.Town);
            _respawn = (town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter);
        }

        /// <summary>
        /// 월드에 들어온 플레이어(EnterWorldResult 뒤): 직업의 처음 상태로 채우고 Inventory로 전체를 보낸다. 저장(38) 전에는 들어올 때마다 처음 상태다.
        /// </summary>
        public void Enter(Player player)
        {
            player.Bag = new Bag((int)_data.Constants.InventorySlots);
            ClassesRow row = _data.Class(player.Class);
            for (int index = 0; index < Math.Min(row.StartItems.Count, row.StartCounts.Count); index++)
            {
                Add(player, row.StartItems[index], row.StartCounts[index], GainReason.Unspecified);
            }

            Bag bag = player.Bag;
            bag.Changed.Clear();
            bag.Gains.Clear();
            bag.GoldChanged = false;
            var whole = new Inventory();
            whole.Slots.Add(bag.Slots.Where(slot => slot.ItemId != 0).Select(slot => slot.Clone()));
            whole.Gold = bag.Gold;
            player.Session.Send(new Packet { Inventory = whole });
        }

        /// <summary>
        /// 아이템을 넣는다. 다 들어가지 않으면 아무것도 넣지 않고 "인벤토리 가득"이다. reason이 Unspecified가 아니면 새로 얻은 것에 든다.
        /// enchant는 겹치지 않는 아이템(장비)의 강화 수치다(주운 장비가 수치를 그대로 가짐. 33, 35).
        /// </summary>
        public FailReason Add(Player player, uint itemId, uint count, GainReason reason, uint enchant = 0)
        {
            ItemsRow item = _data.Item(itemId) ?? throw new ArgumentException($"Items has no row {itemId}.", nameof(itemId));
            Bag bag = player.Bag;
            if (count == 0)
            {
                return FailReason.None;
            }

            if (item.Stackable)
            {
                ItemSlot? target = bag.Slots.FirstOrDefault(slot => slot.ItemId == itemId) ?? bag.Slots.FirstOrDefault(slot => slot.ItemId == 0);
                if (target == null)
                {
                    return FailReason.InventoryFull;
                }

                target.ItemId = itemId;
                target.Count += count;
                bag.Changed.Add((int)target.Index);
            }
            else
            {
                ItemSlot[] empty = bag.Slots.Where(slot => slot.ItemId == 0).Take((int)count).ToArray();
                if (empty.Length < count)
                {
                    return FailReason.InventoryFull;
                }

                foreach (ItemSlot slot in empty)
                {
                    slot.ItemId = itemId;
                    slot.Count = 1;
                    slot.Enchant = enchant;
                    bag.Changed.Add((int)slot.Index);
                }
            }

            if (reason != GainReason.Unspecified)
            {
                bag.Gains.Add(new Gain { Reason = reason, Item = new ItemAmount { ItemId = itemId, Count = count } });
            }

            return FailReason.None;
        }

        /// <summary>
        /// 칸에서 count개를 뺀다(없으면 빈 칸이 됨). 칸에 그만큼 없으면 빼지 않고 false다.
        /// </summary>
        public bool Remove(Player player, int index, uint count)
        {
            ItemSlot slot = player.Bag.Slots[index];
            if ((slot.ItemId == 0) || (slot.Count < count))
            {
                return false;
            }

            slot.Count -= count;
            if (slot.Count == 0)
            {
                slot.ItemId = 0;
                slot.Enchant = 0;
            }

            player.Bag.Changed.Add(index);
            return true;
        }

        /// <summary>
        /// 골드를 더한다. reason이 Unspecified가 아니면 새로 얻은 것에 든다.
        /// </summary>
        public void AddGold(Player player, ulong amount, GainReason reason)
        {
            player.Bag.Gold += amount;
            player.Bag.GoldChanged = true;
            if (reason != GainReason.Unspecified)
            {
                player.Bag.Gains.Add(new Gain { Reason = reason, Gold = amount });
            }
        }

        /// <summary>
        /// UseItem(입력 차례). 진행 중인 일, 빈 칸, 쓰는 종류, 쿨다운(물약), 전투 상태(귀환)를 차례로 본다. 답(RequestResult)은 World가 보낸다.
        /// </summary>
        public FailReason Use(Player player, UseItem request, uint tick)
        {
            if (player.Progress != null)
            {
                return FailReason.Busy;
            }

            if ((request.Slot >= player.Bag.Slots.Length) || (player.Bag.Slots[request.Slot].ItemId == 0))
            {
                return FailReason.NoItem;
            }

            int index = (int)request.Slot;
            ItemsRow item = _data.Item(player.Bag.Slots[index].ItemId)!;
            switch (item.Use)
            {
                case ItemUse.HealHp:
                case ItemUse.HealMp:
                    if (player.PotionCooldownEnd(item.Use) > tick)
                    {
                        return FailReason.Cooldown;
                    }

                    Remove(player, index, 1);
                    player.Restore(item.Use == ItemUse.HealHp ? item.UseValue : 0, item.Use == ItemUse.HealMp ? item.UseValue : 0);
                    player.SetPotionCooldown(item.Use, tick + Units.TicksFromMilliseconds(item.CooldownMs));
                    return FailReason.None;
                case ItemUse.Recall:
                    if (player.InCombat(tick))
                    {
                        return FailReason.InCombat;
                    }

                    _progress.Start(player, ProgressKind.Recall, item.Id, 0, tick + Units.TicksFromMilliseconds(item.UseMs));
                    return FailReason.None;
                default:
                    // 스킬 배우기(36), 강화(35는 따로 요청), 펫 얻기(96)는 그 항목이 잇는다.
                    return FailReason.UnusableItem;
            }
        }

        /// <summary>
        /// 귀환의 끝(꺼낸 자리). 주문서를 아직 가졌고 전투 상태가 아니면 하나를 빼고 마을의 부활 지점으로 옮기며, 아니면 아무것도 빼지 않고 취소한다.
        /// </summary>
        public void FinishRecall(Player player, uint tick)
        {
            ProgressWork work = player.Progress!;
            int index = Array.FindIndex(player.Bag.Slots, slot => slot.ItemId == work.Id);
            FailReason reason = index < 0 ? FailReason.NoItem : player.InCombat(tick) ? FailReason.InCombat : FailReason.None;
            if (reason != FailReason.None)
            {
                _progress.Cancel(player, reason);
                return;
            }

            player.Progress = null;
            Remove(player, index, 1);
            _movement.Teleport(player, _respawn.X, _respawn.Z);
        }

        /// <summary>
        /// 시야 차례: 이 틱에 바뀐 칸, 골드, 새로 얻은 것이 있는 플레이어에게 InventoryChanged 하나를 보낸다.
        /// </summary>
        public void Flush(IEnumerable<Player> players)
        {
            foreach (Player player in players)
            {
                Bag bag = player.Bag;
                if ((bag.Changed.Count == 0) && !bag.GoldChanged && (bag.Gains.Count == 0))
                {
                    continue;
                }

                var changed = new InventoryChanged { Gold = bag.Gold };
                changed.Slots.Add(bag.Changed.Select(index => bag.Slots[index].Clone()));
                changed.Gains.Add(bag.Gains);
                bag.Changed.Clear();
                bag.Gains.Clear();
                bag.GoldChanged = false;
                player.Session.Send(new Packet { InventoryChanged = changed });
            }
        }
    }
}
