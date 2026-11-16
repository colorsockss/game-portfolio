using System;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 죽음과 부활(25). 전투 차례의 끝에서 그 틱에 죽은 개체를 정리하고(죽은 플레이어를 피해 표에서 뺌, 죽은 몬스터의 사라짐과 리스폰을 예약),
    /// 죽은 몬스터의 경험치를 GrowthSystem에 넘기며(31), Revive를 받으면 마을의 부활 지점(무법자는 무법자의 부활 지점. 44)에서 일으킨다. 효과를 떼고(알리지 않음)
    /// 진행 중인 일을 취소하며(26) 선공 표시를 뗀다(44). 죽은 플레이어에게는 누가 죽였든 사망 페널티(45)를 준다.
    /// 쿨다운과 성향은 남긴다.
    /// </summary>
    internal sealed class DeathSystem
    {
        private readonly EntityTable _entities;
        private readonly Scheduler _scheduler;
        private readonly MovementSystem _movement;
        private readonly TickEvents _events;
        private readonly EffectSystem _effects;
        private readonly ProgressSystem _progress;
        private readonly GrowthSystem _growth;
        private readonly LootSystem _loot;
        private readonly PkSystem _pk;

        /// <summary>
        /// 월드에 남은 캐릭터(46). 죽으면 다음 틱에 뺀다.
        /// </summary>
        public LingerSystem? Lingering { get; set; }
        private readonly uint _deadMonsterTicks;
        private readonly uint _reviveHpPercent;
        private readonly uint _expPercent;
        private readonly uint _outlawExpPercent;

        /// <summary>
        /// 보스의 죽음 알림(43).
        /// </summary>
        public BossSystem? Bosses { get; set; }

        public DeathSystem(EntityTable entities, Scheduler scheduler, MovementSystem movement, TickEvents events, EffectSystem effects, ProgressSystem progress, GrowthSystem growth, LootSystem loot, PkSystem pk, GameData data)
        {
            _pk = pk;
            _entities = entities;
            _scheduler = scheduler;
            _movement = movement;
            _events = events;
            _effects = effects;
            _progress = progress;
            _growth = growth;
            _loot = loot;
            _deadMonsterTicks = Units.TicksFromMilliseconds(data.Constants.DeadMonsterMs);
            _reviveHpPercent = data.Constants.ReviveHpPercent;
            _expPercent = data.Constants.DeathExpPercent;
            _outlawExpPercent = data.Constants.OutlawDeathExpPercent;
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
                    Penalize(player, tick);
                    _pk.Died(player);
                    Lingering?.Died(player, tick);
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
                    _growth.Killed(monster);
                    _loot.Killed(monster, tick);
                    Bosses?.Died(monster);
                    // 쓰러진 채 남았다가 사라지고, 다시 나오는 시간은 죽은 틱부터 센다.
                    _scheduler.Add(tick + _deadMonsterTicks, ScheduledKind.Despawn, monster.Id, 0, 0, monster.LifeGeneration);
                    // 개발 명령으로 부른 몬스터는 다시 나오지 않는다(68).
                    if (!monster.Placed.Summoned)
                    {
                        _scheduler.Add(tick + Units.TicksFromMilliseconds(monster.Placed.Spawn.RespawnMs), ScheduledKind.Respawn, monster.Placed.Id);
                    }
                    break;
            }
        }

        /// <summary>
        /// 사망 페널티(45): 경험치를 잃고(일반과 선공 5%, 무법자 10%), 무법자는 아이템도 떨어뜨린다. 무법자인지는 죽는 순간의 성향이다.
        /// 잃은 것을 DeathPenalty로 본인에게 보낸다.
        /// </summary>
        private void Penalize(Player player, uint tick)
        {
            bool outlaw = PkSystem.IsOutlaw(player);
            var penalty = new DeathPenalty { ExpLost = _growth.Lose(player, outlaw ? _outlawExpPercent : _expPercent) };
            if (outlaw)
            {
                penalty.Items.Add(_loot.OutlawDied(player, tick));
            }

            player.Session.Send(new Packet { DeathPenalty = penalty });
        }

        /// <summary>
        /// 사라짐의 예약이 아직 그 몬스터의 것인가(같은 번호로 다시 나온 몬스터가 아님).
        /// </summary>
        public bool IsDespawnCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Monster { Dead: true } monster) && (monster.LifeGeneration == job.Generation);
        }

        /// <summary>
        /// Revive: 죽었으면 마을의 부활 지점(무법자는 무법자의 부활 지점)으로 옮기고 체력을 최대 체력의 일부로 채운다(마나는 그대로). 보는 쪽에는 순간 이동 표시가 있는 움직임과
        /// Revived가, 본인에게는 PositionReset과 Revived, SelfVitals가 간다. 살아 있으면 ActionFailed(NOT_DEAD).
        /// </summary>
        public Outcome Revive(Player player)
        {
            if (!player.Dead)
            {
                return Outcome.Fail(FailReason.NotDead);
            }

            player.Dead = false;
            player.Hp = Math.Max(1, (uint)((ulong)player.MaxHp * _reviveHpPercent / 100));
            (int x, int z) = _pk.Respawn(player.Karma);
            _movement.Teleport(player, x, z);
            _events.Revived(player);
            return Outcome.Done;
        }
    }
}
