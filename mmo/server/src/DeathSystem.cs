using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 죽음과 부활(25). 전투 차례의 끝에서 그 틱에 죽은 개체를 정리하고(죽은 플레이어를 피해 표에서 뺌, 죽은 몬스터의 사라짐과 리스폰을 예약),
    /// Revive를 받으면 마을의 부활 지점에서 일으킨다. 효과를 떼고(알리지 않음) 진행 중인 일을 취소한다(26). 선공 표시(44)는 그 항목이 Died에 잇는다.
    /// 쿨다운과 성향은 남긴다. 사망 페널티는 45다.
    /// </summary>
    internal sealed class DeathSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly Scheduler _scheduler;
        private readonly MovementSystem _movement;
        private readonly TickEvents _events;
        private readonly EffectSystem _effects;
        private readonly ProgressSystem _progress;
        private readonly uint _deadMonsterTicks;
        private readonly uint _reviveHpPercent;
        private readonly (int X, int Z) _respawn;

        public DeathSystem(EntityTable entities, Grid grid, Scheduler scheduler, MovementSystem movement, TickEvents events, EffectSystem effects, ProgressSystem progress, GameData data)
        {
            _entities = entities;
            _grid = grid;
            _scheduler = scheduler;
            _movement = movement;
            _events = events;
            _effects = effects;
            _progress = progress;
            _deadMonsterTicks = Units.TicksFromMilliseconds(data.Constants.DeadMonsterMs);
            _reviveHpPercent = data.Constants.ReviveHpPercent;
            ZonesRow town = data.Zones.Rows.First(zone => zone.Kind == ZoneKind.Town);
            _respawn = (town.RespawnX * Units.PerMeter, town.RespawnZ * Units.PerMeter);
        }

        /// <summary>
        /// 이 틱에 죽은 개체를 정리한다(죽은 차례). 공격 상태와 걸린 타격은 죽는 순간에 CombatSystem이 이미 끝냈다.
        /// </summary>
        public void Died(Creature dead, uint tick)
        {
            _effects.Clear(dead);
            _progress.Cancel(dead, FailReason.Cancelled);
            switch (dead)
            {
                case Player player:
                    // 몬스터는 표의 다른 대상을 고르거나, 고를 대상이 없으면 복귀한다.
                    foreach (Entity entity in _entities.All)
                    {
                        if (entity is Monster monster)
                        {
                            monster.Damage.RemoveWhere(id => id == player.Id);
                        }
                    }

                    break;
                case Monster monster:
                    // 쓰러진 채 남았다가 사라지고, 다시 나오는 시간은 죽은 틱부터 센다.
                    _scheduler.Add(tick + _deadMonsterTicks, ScheduledKind.Despawn, monster.Id, 0, 0, monster.LifeGeneration);
                    _scheduler.Add(tick + Units.TicksFromMilliseconds(monster.Placed.Spawn.RespawnMs), ScheduledKind.Respawn, monster.Placed.Id);
                    break;
            }
        }

        /// <summary>
        /// 사라짐의 예약이 아직 그 몬스터의 것인가(같은 번호로 다시 나온 몬스터가 아님).
        /// </summary>
        public bool IsDespawnCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Monster { Dead: true } monster) && (monster.LifeGeneration == job.Generation);
        }

        /// <summary>
        /// Revive: 죽었으면 마을의 부활 지점으로 옮기고 체력을 최대 체력의 일부로 채운다(마나는 그대로). 보는 쪽에는 순간 이동 표시가 있는 움직임과
        /// Revived가, 본인에게는 PositionReset과 Revived, SelfVitals가 간다. 살아 있으면 ActionFailed(NOT_DEAD).
        /// </summary>
        public void Revive(Player player)
        {
            if (!player.Dead)
            {
                player.Fail(FailReason.NotDead, RequestKind.Revive);
                return;
            }

            player.Dead = false;
            player.Hp = Math.Max(1, (uint)((ulong)player.MaxHp * _reviveHpPercent / 100));
            player.X = _respawn.X;
            player.Z = _respawn.Z;
            player.Moved = true;
            player.Teleported = true;
            player.Dirty = true;
            player.MoveBudget = 0;
            _grid.Moved(player);
            _movement.Reset(player);
            _events.Revived(player);
        }
    }
}
