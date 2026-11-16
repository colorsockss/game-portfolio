using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 드롭과 바닥 아이템(33). 몬스터가 죽으면 드롭 묶음을 주입한 Random으로 굴려 나온 골드와 아이템마다 바닥 아이템을 죽은 자리 둘레(흩는 거리 안이고
    /// 걸을 수 있으며 죽은 자리에서 선이 트인 점, 아니면 죽은 자리)에 놓는다. 주인은 잡은 편의 플레이어이고 주인만 줍는 시간 동안 그만 줍는다.
    /// 줍기와 떨어뜨리기는 요청 번호가 있는 요청이고, 바닥 아이템은 남는 시간이 지나면 사라진다.
    /// </summary>
    internal sealed class LootSystem
    {
        private readonly SaveSystem _save;
        private readonly GameData _data;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly InventorySystem _inventory;
        private readonly Random _random;
        private readonly uint _lifetimeTicks;
        private readonly uint _ownerOnlyTicks;
        private readonly long _interactRange;
        private readonly List<ItemSlot> _slots = new List<ItemSlot>();

        public LootSystem(GameData data, EntityTable entities, Grid grid, FieldMap field, Scheduler scheduler, InventorySystem inventory, SaveSystem save, Random random)
        {
            _save = save;
            _data = data;
            _entities = entities;
            _grid = grid;
            _field = field;
            _scheduler = scheduler;
            _inventory = inventory;
            _random = random;
            _lifetimeTicks = Units.TicksFromMilliseconds(data.Constants.DropLifetimeMs);
            _ownerOnlyTicks = Units.TicksFromMilliseconds(data.Constants.OwnerOnlyMs);
            _interactRange = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        /// <summary>
        /// 몬스터가 죽었다(죽은 차례): 드롭 묶음을 굴려 바닥 아이템을 놓는다.
        /// </summary>
        public void Killed(Monster monster, uint tick)
        {
            if (!monster.Template.HasDropGroup || (_data.DropGroup(monster.Template.DropGroup) is not DropGroupsRow group))
            {
                return;
            }

            // 잡은 편이 파티면 그 파티가, 플레이어면 아직 월드에 있을 때 그 플레이어가 주인이다(42).
            uint ownerParty = monster.Killer is ulong side ? PartySystem.PartyOfSide(side) : 0;
            uint ownerPlayer = (monster.Killer is ulong solo) && (ownerParty == 0) && (_entities.Find((uint)solo) is Player) ? (uint)solo : 0;
            var owner = new Owner(ownerPlayer, ownerParty, (ownerPlayer != 0) || (ownerParty != 0) ? tick + _ownerOnlyTicks : 0);
            if ((group.GoldMax > 0) && (_random.NextDouble() < group.GoldChance))
            {
                Drop(monster, GoldItemId(), (uint)_random.Next((int)group.GoldMin, (int)group.GoldMax + 1), owner, tick);
            }

            for (int index = 0; index < group.Items.Count; index++)
            {
                if (_random.NextDouble() < group.Chances[index])
                {
                    Drop(monster, group.Items[index], (uint)_random.Next((int)group.MinCounts[index], (int)group.MaxCounts[index] + 1), owner, tick);
                }
            }
        }

        private void Drop(Monster monster, uint itemId, uint count, Owner owner, uint tick)
        {
            if (count == 0)
            {
                return;
            }

            (int x, int z) = Scatter(monster);
            Place(itemId, count, 0, x, z, owner, false, tick);
        }

        /// <summary>
        /// 흩는 거리 안의 무작위 점. 막혔거나 죽은 자리에서 선이 막혔으면 죽은 자리(벽 안이나 너머에 떨어져 줍지 못하는 일이 없게).
        /// </summary>
        private (int X, int Z) Scatter(Entity dead)
        {
            double angle = _random.NextDouble() * Math.PI * 2;
            double distance = Math.Sqrt(_random.NextDouble()) * _data.Constants.DropScatter * Units.PerMeter;
            int x = dead.X + (int)Math.Round(Math.Cos(angle) * distance);
            int z = dead.Z + (int)Math.Round(Math.Sin(angle) * distance);
            return _field.CanWalk(x, z, Walker.Player) && _field.HasLine(dead.X, dead.Z, x, z) ? (x, z) : (dead.X, dead.Z);
        }

        /// <summary>
        /// 무법자가 죽었다(죽은 차례. 45): 인벤토리(차 있는 칸 하나를 통째로)와 입은 장비(하나)를 따로 굴려 떨어뜨린다. 창고는 뽑지 않는다.
        /// 칸에서 빼기 → 사본을 큐에 넣기 → 죽은 자리 둘레에 바닥 아이템 놓기(38)이고, 바닥 아이템은 주인이 없고 "플레이어가 떨어뜨림"이 아니다.
        /// 떨어뜨린 칸(빼기 전의 값)을 낸다.
        /// </summary>
        public List<ItemSlot> OutlawDied(Player player, uint tick)
        {
            var dropped = new List<ItemSlot>();
            Constants constants = _data.Constants;
            if (_random.NextDouble() * 100 < constants.OutlawDropInventoryPercent)
            {
                _slots.Clear();
                _slots.AddRange(player.Bag.Slots.Where(slot => slot.ItemId != 0));
                if (_slots.Count > 0)
                {
                    ItemSlot slot = _slots[_random.Next(_slots.Count)];
                    dropped.Add(slot.Clone());
                    _inventory.Remove(player, (int)slot.Index, slot.Count);
                }
            }

            if (_random.NextDouble() * 100 < constants.OutlawDropEquipmentPercent)
            {
                _slots.Clear();
                _slots.AddRange(player.Bag.Equipment.Where(slot => slot.ItemId != 0));
                if (_slots.Count > 0)
                {
                    ItemSlot worn = _slots[_random.Next(_slots.Count)];
                    dropped.Add(worn.Clone());
                    _inventory.RemoveWorn(player, (int)worn.Index);
                }
            }

            if (dropped.Count > 0)
            {
                _save.SaveNow(player);
                foreach (ItemSlot item in dropped)
                {
                    (int x, int z) = Scatter(player);
                    Place(item.ItemId, item.Count, item.Enchant, x, z, default, false, tick);
                }
            }

            return dropped;
        }

        private void Place(uint itemId, uint count, uint enchant, int x, int z, Owner owner, bool droppedByPlayer, uint tick)
        {
            ulong generation = _scheduler.NewGeneration();
            var item = new GroundItem(_entities.NextGroundItemId(tick), x, z, itemId, count, enchant, owner.Player, owner.Party, owner.EndTick, droppedByPlayer, generation);
            _entities.Add(item);
            _grid.Add(item);
            _scheduler.Add(tick + _lifetimeTicks, ScheduledKind.GroundItemExpire, item.Id, 0, 0, generation);
        }

        /// <summary>
        /// PickUp(입력 차례, 받은 차례대로라 같은 틱의 두 요청 가운데 먼저 온 것만 성공). 개체 → 거리 → 선 → 주인 → 인벤토리의 차례로 보고,
        /// 다 들어간 뒤에 바닥 개체를 지운다. 골드는 자리가 필요 없다.
        /// </summary>
        public FailReason PickUp(Player player, PickUp request, uint tick)
        {
            if (_entities.Find(request.EntityId) is not GroundItem item)
            {
                return FailReason.AlreadyGone;
            }

            long dx = (long)item.X - player.X;
            long dz = (long)item.Z - player.Z;
            if ((dx * dx) + (dz * dz) > _interactRange * _interactRange)
            {
                return FailReason.OutOfRange;
            }

            if (!_field.HasLine(player.X, player.Z, item.X, item.Z))
            {
                return FailReason.Blocked;
            }

            if (!item.CanPickUp(player, tick))
            {
                return FailReason.NotYours;
            }

            if (item.ItemId == GoldItemId())
            {
                _inventory.AddGold(player, item.Count, GainReason.PickUp);
            }
            else
            {
                FailReason added = _inventory.Add(player, item.ItemId, item.Count, GainReason.PickUp, item.Enchant);
                if (added != FailReason.None)
                {
                    return added;
                }
            }

            Remove(item, tick);
            return FailReason.None;
        }

        /// <summary>
        /// DropItem(입력 차례): 칸의 아이템을 count개(1 이상, 가진 수 이하) 빼고 플레이어의 자리에 바닥 아이템으로 놓는다(강화 수치 그대로).
        /// 안전 지대에서도 된다. 파티가 있으면 주인을 그 파티로 두어 주인만 줍는 시간 동안 본인과 파티원만 줍고(42), 없으면 주인 없이 바로 누구나 줍는다.
        /// </summary>
        public FailReason Drop(Player player, DropItem request, uint tick)
        {
            if (player.Progress != null)
            {
                return FailReason.Busy;
            }

            if ((request.Slot >= player.Bag.Slots.Length) || (player.Bag.Slots[request.Slot].ItemId == 0) || (request.Count == 0)
                || (player.Bag.Slots[request.Slot].Count < request.Count))
            {
                return FailReason.NoItem;
            }

            ItemSlot slot = player.Bag.Slots[request.Slot];
            uint itemId = slot.ItemId;
            uint enchant = slot.Enchant;
            // 인벤토리에서 빼기 → 사본을 큐에 넣기 → 바닥 개체 놓기(38). 내놓은 쪽의 사본이 주운 쪽의 사본보다 먼저 큐에 들어가 아이템이 두 곳에 저장되지 않는다.
            _inventory.Remove(player, (int)request.Slot, request.Count);
            _save.SaveNow(player);
            Place(itemId, request.Count, enchant, player.X, player.Z, new Owner(0, player.PartyId, player.PartyId != 0 ? tick + _ownerOnlyTicks : 0), true, tick);
            return FailReason.None;
        }

        /// <summary>
        /// 사라짐의 예약이 아직 그 바닥 아이템의 것인가(주워졌거나 번호를 다시 쓴 새 아이템이 아님).
        /// </summary>
        public bool IsExpireCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is GroundItem item) && (item.Generation == job.Generation);
        }

        public void Expire(in ScheduledJob job, uint tick)
        {
            Remove((GroundItem)_entities.Find(job.Owner)!, tick);
        }

        private void Remove(GroundItem item, uint tick)
        {
            _entities.Remove(item);
            _grid.Remove(item);
            _entities.FreeGroundItemId(item.Id, tick);
        }

        private uint GoldItemId()
        {
            return _data.GoldItemId;
        }

        /// <summary>
        /// 바닥 아이템의 주인(플레이어나 파티 둘 중 하나, 없으면 둘 다 0)과 주인만 줍는 시간이 끝나는 틱.
        /// </summary>
        private readonly record struct Owner(uint Player, uint Party, uint EndTick);
    }
}
