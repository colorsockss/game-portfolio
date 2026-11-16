using System;
using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 채집(47). 서버가 뜰 때 Spawns의 채집물 줄마다 놓인 점을 고르고 채집물을 놓는다. 채집은 진행 중인 일(26)이고, 시작과 끝나는 틱에 같은 확인
    /// (채집물이 있음, 3 m 안, 선이 트임, 필요 레벨, 재료가 들어갈 자리)을 한다. 횟수를 다 쓰면 채집물을 빼고 Spawns의 다시 나오는 시간 뒤에 같은 번호로 놓으며,
    /// 그 채집물을 채집하던 다른 플레이어의 일은 그 틱에 취소한다.
    /// </summary>
    internal sealed class GatherSystem
    {
        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly Scheduler _scheduler;
        private readonly ProgressSystem _progress;
        private readonly InventorySystem _inventory;
        private readonly long _range;
        private readonly Dictionary<uint, GatherPoint> _points = new Dictionary<uint, GatherPoint>();

        public GatherSystem(GameData data, FieldMap field, EntityTable entities, Grid grid, Scheduler scheduler, ProgressSystem progress, InventorySystem inventory)
        {
            _data = data;
            _field = field;
            _entities = entities;
            _grid = grid;
            _scheduler = scheduler;
            _progress = progress;
            _inventory = inventory;
            _range = (long)Math.Round(data.Constants.InteractRange * Units.PerMeter);
        }

        public Dictionary<uint, GatherPoint>.ValueCollection Points => _points.Values;

        /// <summary>
        /// 채집물을 모두 놓는다. 놓인 점은 무리의 자리에서 흩는 반경 안이고 플레이어 쪽의 걷는 선이 트인 점이다(SpawnSystem의 흩기). 서버가 뜰 때 한 번만 부른다.
        /// </summary>
        public void PlaceAll(SpawnSystem spawn)
        {
            foreach (SpawnsRow row in _data.Spawns.Rows.Where(row => row.HasGatherNodeId))
            {
                GatherNodesRow node = _data.GatherNode(row.GatherNodeId);
                int centerX = (row.X * Units.PerMeter) + (Units.PerMeter / 2);
                int centerZ = (row.Z * Units.PerMeter) + (Units.PerMeter / 2);
                for (uint i = 0; i < row.Count; i++)
                {
                    (int x, int z) = spawn.Scatter(centerX, centerZ, row.ScatterRadius * Units.PerMeter, Walker.Player);
                    var point = new GatherPoint(_entities.ReservePlacedId(), x, z, node, row);
                    _points.Add(point.Id, point);
                    Place(point);
                }
            }
        }

        /// <summary>
        /// Gather(입력 차례). 진행 중인 일이 없을 때 시작할 때의 확인을 통과하면 채집을 시작한다(Progress의 번호는 GatherNodes의 줄, 대상은 채집물).
        /// 죽은 동안과 기절한 동안은 World가 먼저 막는다.
        /// </summary>
        public FailReason Start(Player player, Gather request, uint tick)
        {
            if (player.Progress != null)
            {
                return FailReason.Busy;
            }

            if (_entities.Find(request.EntityId) is not GatherNode node)
            {
                return FailReason.AlreadyGone;
            }

            FailReason reason = Check(player, node);
            if (reason == FailReason.None)
            {
                _progress.Start(player, ProgressKind.Gather, node.Row.Id, node.Id, tick + Units.TicksFromMilliseconds(node.Row.GatherMs));
            }

            return reason;
        }

        /// <summary>
        /// 채집의 끝(예약한 일의 차례, 꺼낸 자리). 확인을 다시 해 걸리면 아무것도 바꾸지 않고 그 이유로 취소한다. 통과하면 재료를 넣고(새로 얻은 것, 까닭 채집)
        /// 횟수를 하나 줄이며, 다 쓰면 채집물을 뺀다.
        /// </summary>
        public void Finish(Player player, uint tick)
        {
            ProgressWork work = player.Progress!;
            if (_entities.Find(work.Target) is not GatherNode node)
            {
                _progress.Cancel(player, FailReason.AlreadyGone);
                return;
            }

            FailReason reason = Check(player, node);
            if (reason != FailReason.None)
            {
                _progress.Cancel(player, reason);
                return;
            }

            player.Progress = null;
            _inventory.Add(player, node.Row.ItemId, node.Row.Count, GainReason.Gather);
            node.UsesLeft--;
            if (node.UsesLeft == 0)
            {
                Deplete(node, tick);
            }
        }

        public bool IsRespawnCurrent(in ScheduledJob job)
        {
            return _points.ContainsKey(job.Owner) && (_entities.Find(job.Owner) == null);
        }

        /// <summary>
        /// 다시 나오기(예약한 일의 차례): 같은 번호와 자리에 횟수가 가득한 채집물을 놓는다.
        /// </summary>
        public void Respawn(in ScheduledJob job)
        {
            Place(_points[job.Owner]);
        }

        /// <summary>
        /// 시작할 때와 끝나는 틱의 확인: 3 m 안("사거리 밖"), 선이 트임("막힘"), 필요 레벨("레벨 부족"), 재료가 들어갈 자리("인벤토리 가득").
        /// </summary>
        private FailReason Check(Player player, GatherNode node)
        {
            long dx = (long)node.X - player.X;
            long dz = (long)node.Z - player.Z;
            if ((dx * dx) + (dz * dz) > _range * _range)
            {
                return FailReason.OutOfRange;
            }

            if (!_field.HasLine(player.X, player.Z, node.X, node.Z))
            {
                return FailReason.Blocked;
            }

            if (player.Level < node.Row.Level)
            {
                return FailReason.LevelTooLow;
            }

            return _inventory.HasRoom(player, node.Row.ItemId, node.Row.Count) ? FailReason.None : FailReason.InventoryFull;
        }

        private void Place(GatherPoint point)
        {
            var node = new GatherNode(point);
            _entities.Add(node);
            _grid.Add(node);
        }

        /// <summary>
        /// 횟수를 다 쓴 채집물을 빼고(다음 시야 차례에 EntitiesLeave) 다시 나오기를 예약한다. 그 채집물을 채집하던 다른 플레이어의 일은 "취소됨"으로 끝낸다.
        /// 같은 틱에 끝나는 다른 플레이어의 예약은 일이 없어져 버려진다.
        /// </summary>
        private void Deplete(GatherNode node, uint tick)
        {
            _entities.Remove(node);
            _grid.Remove(node);
            _scheduler.Add(tick + Units.TicksFromMilliseconds(node.Point.Spawn.RespawnMs), ScheduledKind.GatherRespawn, node.Id);
            foreach (Player other in _entities.Players.Where(other => other.Progress is { Kind: ProgressKind.Gather } work && (work.Target == node.Id)).ToArray())
            {
                _progress.Cancel(other, FailReason.Cancelled);
            }
        }
    }
}
