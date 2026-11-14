using System;
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

            uint owner = (monster.Damage.Killer() is uint side) && (_entities.Find(side) is Player) ? side : 0;
            uint ownerEnd = owner != 0 ? tick + _ownerOnlyTicks : 0;
            if ((group.GoldMax > 0) && (_random.NextDouble() < group.GoldChance))
            {
                Drop(monster, GoldItemId(), (uint)_random.Next((int)group.GoldMin, (int)group.GoldMax + 1), owner, ownerEnd, tick);
            }

            for (int index = 0; index < group.Items.Count; index++)
            {
                if (_random.NextDouble() < group.Chances[index])
                {
                    Drop(monster, group.Items[index], (uint)_random.Next((int)group.MinCounts[index], (int)group.MaxCounts[index] + 1), owner, ownerEnd, tick);
                }
            }
        }

        private void Drop(Monster monster, uint itemId, uint count, uint owner, uint ownerEnd, uint tick)
        {
            if (count == 0)
            {
                return;
            }

            // 흩는 거리 안의 무작위 점. 막혔거나 죽은 자리에서 선이 막혔으면 죽은 자리(벽 안이나 너머에 떨어져 줍지 못하는 일이 없게).
            double angle = _random.NextDouble() * Math.PI * 2;
            double distance = Math.Sqrt(_random.NextDouble()) * _data.Constants.DropScatter * Units.PerMeter;
            int x = monster.X + (int)Math.Round(Math.Cos(angle) * distance);
            int z = monster.Z + (int)Math.Round(Math.Sin(angle) * distance);
            if (!_field.CanWalk(x, z, Walker.Player) || !_field.HasLine(monster.X, monster.Z, x, z))
            {
                (x, z) = (monster.X, monster.Z);
            }

            Place(itemId, count, 0, x, z, owner, ownerEnd, false, tick);
        }

        private void Place(uint itemId, uint count, uint enchant, int x, int z, uint owner, uint ownerEnd, bool droppedByPlayer, uint tick)
        {
            ulong generation = _scheduler.NewGeneration();
            var item = new GroundItem(_entities.NextGroundItemId(tick), x, z, itemId, count, enchant, owner, ownerEnd, droppedByPlayer, generation);
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

            if (!item.CanPickUp(player.Id, tick))
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
        /// DropItem(입력 차례): 칸의 아이템을 count개(1 이상, 가진 수 이하) 빼고 플레이어의 자리에 주인 없는 바닥 아이템으로 놓는다(강화 수치 그대로).
        /// 안전 지대에서도 된다. 파티원만 10초 줍는 것은 42가 더한다.
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
            Place(itemId, request.Count, enchant, player.X, player.Z, 0, 0, true, tick);
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
    }
}
