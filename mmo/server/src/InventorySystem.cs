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

            for (int index = 0; index < Equipment.Length; index++)
            {
                Equipment[index] = new ItemSlot { Place = ItemPlace.Equipment, Index = (uint)index };
            }
        }

        /// <summary>
        /// 입은 장비(34). 칸 번호는 장비 칸(EquipSlot 값) − 1이다.
        /// </summary>
        public ItemSlot[] Equipment { get; } = new ItemSlot[6];

        /// <summary>
        /// 이 틱에 바뀐 장비 칸의 번호.
        /// </summary>
        public SortedSet<int> ChangedEquipment { get; } = new SortedSet<int>();

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
        private readonly StatSystem _stats;
        private readonly Random _random;
        private readonly (int X, int Z) _respawn;

        public InventorySystem(GameData data, ProgressSystem progress, MovementSystem movement, StatSystem stats, Random random)
        {
            _data = data;
            _stats = stats;
            _random = random;
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

            // 기본 무기는 입힌 채로 준다(34). 능력치를 다시 구하고 체력과 마나를 채운다(들어올 때는 가득).
            if (row.StartWeapon != 0)
            {
                ItemSlot weapon = player.Bag.Equipment[(int)_data.Item(row.StartWeapon)!.Slot - 1];
                weapon.ItemId = row.StartWeapon;
                weapon.Count = 1;
                EquipmentChanged(player);
                player.Hp = player.MaxHp;
                player.Mp = player.MaxMp;
                // 아직 아무도 받지 않은 개체라 EntityState 대신 EntityEnter가 무기를 싣는다.
                player.StateChanged = false;
            }

            Bag bag = player.Bag;
            bag.Changed.Clear();
            bag.ChangedEquipment.Clear();
            bag.Gains.Clear();
            bag.GoldChanged = false;
            var whole = new Inventory();
            whole.Slots.Add(bag.Slots.Concat(bag.Equipment).Where(slot => slot.ItemId != 0).Select(slot => slot.Clone()));
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
        /// Equip(입력 차례): 칸의 아이템이 장비인지, 필요 레벨, 직업(비우면 공용)을 보고 그 장비 칸에 입힌다. 그 장비 칸에 있던 것은 그 인벤토리 칸으로 온다.
        /// </summary>
        public FailReason Equip(Player player, Equip request)
        {
            if ((request.Slot >= player.Bag.Slots.Length) || (player.Bag.Slots[request.Slot].ItemId == 0))
            {
                return FailReason.NoItem;
            }

            ItemSlot slot = player.Bag.Slots[request.Slot];
            ItemsRow item = _data.Item(slot.ItemId)!;
            if (item.Kind != ItemKind.Equipment)
            {
                return FailReason.UnusableItem;
            }

            if (item.HasLevel && (player.Level < item.Level))
            {
                return FailReason.LevelTooLow;
            }

            if (item.HasClass && (item.Class != (uint)player.Class))
            {
                return FailReason.WrongClass;
            }

            int index = (int)item.Slot - 1;
            ItemSlot worn = player.Bag.Equipment[index];
            (worn.ItemId, slot.ItemId) = (slot.ItemId, worn.ItemId);
            (worn.Count, slot.Count) = (slot.Count, worn.Count);
            (worn.Enchant, slot.Enchant) = (slot.Enchant, worn.Enchant);
            player.Bag.Changed.Add((int)request.Slot);
            player.Bag.ChangedEquipment.Add(index);
            EquipmentChanged(player);
            return FailReason.None;
        }

        /// <summary>
        /// Unequip(입력 차례): 장비 칸(EquipSlot 값)의 장비를 인벤토리의 첫 빈 칸에 넣는다. 빈 칸이 없으면 "인벤토리 가득"이다.
        /// </summary>
        public FailReason Unequip(Player player, Unequip request)
        {
            if ((request.EquipSlot < 1) || (request.EquipSlot > player.Bag.Equipment.Length) || (player.Bag.Equipment[request.EquipSlot - 1].ItemId == 0))
            {
                return FailReason.NoItem;
            }

            ItemSlot? empty = player.Bag.Slots.FirstOrDefault(slot => slot.ItemId == 0);
            if (empty == null)
            {
                return FailReason.InventoryFull;
            }

            int index = (int)request.EquipSlot - 1;
            ItemSlot worn = player.Bag.Equipment[index];
            (empty.ItemId, empty.Count, empty.Enchant) = (worn.ItemId, worn.Count, worn.Enchant);
            (worn.ItemId, worn.Count, worn.Enchant) = (0u, 0u, 0u);
            player.Bag.Changed.Add((int)empty.Index);
            player.Bag.ChangedEquipment.Add(index);
            EquipmentChanged(player);
            return FailReason.None;
        }

        /// <summary>
        /// Enchant(입력 차례): 대상이 장비인지, 주문서 칸이 강화 주문서인지, +9보다 낮은지를 보고(어긋나면 아무것도 빼지 않음), 주문서 하나를 빼고
        /// 다음 단계의 확률(100%면 굴리지 않음)로 성공하면 수치를 올리고 실패하면 장비를 지운다. 결과는 본인에게 EnchantResult로 간다.
        /// </summary>
        public FailReason Enchant(Player player, Enchant request)
        {
            ItemSlot[] place = request.Place == ItemPlace.Equipment ? player.Bag.Equipment : player.Bag.Slots;
            if ((request.Slot >= place.Length) || (place[request.Slot].ItemId == 0) || (request.ScrollSlot >= player.Bag.Slots.Length)
                || (player.Bag.Slots[request.ScrollSlot].ItemId == 0))
            {
                return FailReason.NoItem;
            }

            ItemSlot target = place[request.Slot];
            if ((_data.Item(target.ItemId)!.Kind != ItemKind.Equipment) || (_data.Item(player.Bag.Slots[request.ScrollSlot].ItemId)!.Use != ItemUse.Enchant))
            {
                return FailReason.UnusableItem;
            }

            if (_data.Enchant(target.Enchant + 1) is not EnchantsRow next)
            {
                return FailReason.MaxEnchant;
            }

            Remove(player, (int)request.ScrollSlot, 1);
            bool success = (next.Chance >= 1.0) || (_random.NextDouble() < next.Chance);
            if (success)
            {
                target.Enchant++;
            }
            else
            {
                (target.ItemId, target.Count, target.Enchant) = (0u, 0u, 0u);
            }

            if (request.Place == ItemPlace.Equipment)
            {
                player.Bag.ChangedEquipment.Add((int)request.Slot);
                EquipmentChanged(player);
            }
            else
            {
                player.Bag.Changed.Add((int)request.Slot);
            }

            player.Session.Send(new Packet { EnchantResult = new EnchantResult { Success = success, Enchant = target.Enchant } });
            return FailReason.None;
        }

        /// <summary>
        /// 입은 장비가 바뀌었다: 능력치를 다시 구하고(본인에게 SelfStats), 무기가 바뀌었으면 표시 상태(EntityState)를 바꾼다. 방어구는 모습을 바꾸지 않는다.
        /// </summary>
        private void EquipmentChanged(Player player)
        {
            _stats.Recalculate(player);
            player.SetDisplayState(player.Level, player.NameColor, player.Bag.Equipment[(int)EquipSlot.Weapon - 1].ItemId);
        }

        /// <summary>
        /// 시야 차례: 이 틱에 바뀐 칸, 골드, 새로 얻은 것이 있는 플레이어에게 InventoryChanged 하나를 보낸다.
        /// </summary>
        public void Flush(IEnumerable<Player> players)
        {
            foreach (Player player in players)
            {
                Bag bag = player.Bag;
                if ((bag.Changed.Count == 0) && (bag.ChangedEquipment.Count == 0) && !bag.GoldChanged && (bag.Gains.Count == 0))
                {
                    continue;
                }

                var changed = new InventoryChanged { Gold = bag.Gold };
                changed.Slots.Add(bag.Changed.Select(index => bag.Slots[index].Clone()));
                changed.Slots.Add(bag.ChangedEquipment.Select(index => bag.Equipment[index].Clone()));
                changed.Gains.Add(bag.Gains);
                bag.Changed.Clear();
                bag.ChangedEquipment.Clear();
                bag.Gains.Clear();
                bag.GoldChanged = false;
                player.Session.Send(new Packet { InventoryChanged = changed });
            }
        }
    }
}
