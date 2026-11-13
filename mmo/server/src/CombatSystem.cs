using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 기본 공격(틱의 넷째 차례). 공격 상태인 개체가 다음 공격 틱에 대상이 사거리 안이고 선이 트였으면 AttackSwing을 내고 타격을 예약하며,
    /// 타격할 틱에 피해를 준다(Damaged, 체력이 0이면 Died). 사건은 TickEvents에 쌓아 시야 차례 뒤에 보낸다. 스킬은 26이 더한다.
    /// </summary>
    internal sealed class CombatSystem
    {
        private readonly EntityTable _entities;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly StatSystem _stats;
        private readonly GameData _data;
        private readonly TickEvents _events;
        private readonly uint _combatTicks;

        public CombatSystem(EntityTable entities, FieldMap field, Scheduler scheduler, StatSystem stats, GameData data, TickEvents events)
        {
            _entities = entities;
            _field = field;
            _scheduler = scheduler;
            _stats = stats;
            _data = data;
            _events = events;
            _combatTicks = Units.TicksFromMilliseconds(data.Constants.CombatDurationMs);
        }

        /// <summary>
        /// 공격할 수 있는 사이인지(설계의 PK와 안전 지대). 지금은 플레이어와 몬스터 사이만 참이고, 플레이어가 안전 지대 안에 있으면 거짓이다
        /// (플레이어는 안에서 밖의 몬스터를 치지 못하고, 몬스터는 안의 플레이어를 치지 못함). 플레이어 사이와 파티원은 44가 넓힌다.
        /// </summary>
        public bool CanAttack(Creature attacker, Creature target)
        {
            return (attacker, target) switch
            {
                (Player player, Monster) => !_field.IsSafe(player.X, player.Z),
                (Monster, Player player) => !_field.IsSafe(player.X, player.Z),
                _ => false,
            };
        }

        /// <summary>
        /// AttackStart(입력 차례): 대상이 있고 살아 있고 그 연결이 받은 개체인지, CanAttack, 복귀 중인 몬스터가 아닌지를 보고 공격 상태를 켠다.
        /// 이미 공격 중이면 대상만 바꾼다. 어긋나면 ActionFailed로 답한다(방금 죽었거나 나간 대상은 정상 클라이언트도 보낼 수 있어 끊지 않음).
        /// </summary>
        public void Start(Player player, AttackStart request)
        {
            Entity? found = _entities.Find(request.TargetId);
            if ((found == null) || !player.Visible.Contains(found) || (found is Creature { Dead: true }))
            {
                Fail(player, FailReason.NoTarget);
                return;
            }

            if ((found is not Creature target) || !CanAttack(player, target) || IsReturning(target))
            {
                Fail(player, FailReason.InvalidTarget);
                return;
            }

            player.AttackTarget = target.Id;
        }

        public void Stop(Player player)
        {
            player.AttackTarget = 0;
        }

        /// <summary>
        /// 타격의 예약이 아직 걸려 있는가: 공격자가 그대로 있고 살아 있으며 타격의 세대 번호가 같다(죽거나 기절해 버리지 않음).
        /// </summary>
        public bool IsStrikeCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Creature { Dead: false } attacker) && (attacker.StrikeGeneration == job.Generation);
        }

        /// <summary>
        /// 전투 차례: 예약한 일이 넘긴 이 틱의 타격을 차례대로 적용하고, 공격 상태인 개체 가운데 다음 공격 틱이 된 것의 공격을 시작한다.
        /// </summary>
        public void Step(uint tick)
        {
            foreach (ScheduledJob job in _scheduler.CombatJobs)
            {
                Strike(_entities.Find(job.Owner) as Creature, job.A, tick);
            }

            _scheduler.CombatJobs.Clear();
            foreach (Entity entity in _entities.All)
            {
                if ((entity is Creature { Dead: false } attacker) && (attacker.AttackTarget != 0) && (attacker.NextAttackTick <= tick))
                {
                    TrySwing(attacker, tick);
                }
            }
        }

        /// <summary>
        /// 공격을 시작할 수 있으면 시작한다. 대상이 죽었거나 월드에서 빠졌으면 조용히, CanAttack이 거짓이 됐거나 대상인 몬스터가 복귀를
        /// 시작했으면 ActionFailed와 함께 공격 상태를 끈다. 사거리 밖이거나 선이 막혔으면 끄지 않고 기다린다(걷는 중에도 사거리 안이면 시작).
        /// </summary>
        private void TrySwing(Creature attacker, uint tick)
        {
            if (_entities.Find(attacker.AttackTarget) is not Creature { Dead: false } target)
            {
                attacker.AttackTarget = 0;
                return;
            }

            if (!CanAttack(attacker, target) || IsReturning(target))
            {
                attacker.AttackTarget = 0;
                if (attacker is Player player)
                {
                    Fail(player, FailReason.InvalidTarget);
                }

                return;
            }

            Attack attack = AttackOf(attacker);
            long distanceSquared = DistanceSquared(attacker, target);
            if ((distanceSquared > (long)attack.Range * attack.Range) || !_field.HasLine(attacker.X, attacker.Z, target.X, target.Z))
            {
                return;
            }

            _events.Swing(attacker, target);
            attacker.NextAttackTick = tick + attack.IntervalTicks;
            attacker.CombatEndTick = tick + _combatTicks;
            uint hitTick = tick + attack.HitDelayTicks;
            if (attack.ProjectileUnitsPerTick > 0)
            {
                // 대상을 따라가는 발사체: 시작한 틱의 거리 ÷ 속도(틱 수로 올림). 날아가는 동안 선을 다시 보지 않는다.
                hitTick += (uint)Math.Ceiling(Math.Sqrt(distanceSquared) / attack.ProjectileUnitsPerTick);
            }

            if (hitTick == tick)
            {
                Strike(attacker, target.Id, tick);
                return;
            }

            _scheduler.Add(hitTick, ScheduledKind.Strike, attacker.Id, target.Id, 0, attacker.StrikeGeneration);
        }

        /// <summary>
        /// 타격: 공격자가 살아 있고, 대상이 살아 있고 월드에 있으며 CanAttack이 참이고 복귀 중인 몬스터가 아니면 피해를 준다.
        /// 사거리 밖으로 나간 대상과 공격을 멈춘 공격자의 타격도 맞는다.
        /// </summary>
        private void Strike(Creature? attacker, uint targetId, uint tick)
        {
            if ((attacker == null) || attacker.Dead || (_entities.Find(targetId) is not Creature { Dead: false } target)
                || !CanAttack(attacker, target) || IsReturning(target))
            {
                return;
            }

            (uint damage, bool critical) = _stats.Damage(attacker, target, 1);
            target.Hp -= Math.Min(damage, target.Hp);
            target.CombatEndTick = tick + _combatTicks;
            if ((attacker is Player player) && (target is Monster monster))
            {
                // 비선공 몬스터도 표에 든 플레이어를 쫓는다(맞아서 시작하는 추적은 선과 상관없음).
                monster.Damage.Add(player.Id, damage);
            }

            _events.Damaged(attacker, target, damage, critical);
            if (target.Hp == 0)
            {
                target.Dead = true;
                target.AttackTarget = 0;
                target.StrikeGeneration = _scheduler.NewGeneration();
                _events.Died(target, attacker);
            }
        }

        private static bool IsReturning(Creature target)
        {
            return target is Monster { State: MonsterState.Return };
        }

        private static void Fail(Player player, FailReason reason)
        {
            player.Session.Send(new Packet { ActionFailed = new ActionFailed { Reason = reason, Request = RequestKind.Attack } });
        }

        /// <summary>
        /// 기본 공격의 수치(사거리 1/32 m, 간격과 타격까지의 시간은 틱, 발사체는 틱마다의 거리. 없으면 0). 플레이어는 Classes, 몬스터는 Monsters다.
        /// </summary>
        private readonly record struct Attack(int Range, uint IntervalTicks, uint HitDelayTicks, double ProjectileUnitsPerTick);

        private Attack AttackOf(Creature attacker)
        {
            return attacker switch
            {
                Player player => Of(_data.Class(player.Class)),
                Monster monster => Of(monster.Template),
                _ => throw new ArgumentException($"{attacker.Kind} has no basic attack.", nameof(attacker)),
            };
        }

        private static Attack Of(ClassesRow row)
        {
            return Of(row.AttackRange, row.AttackIntervalMs, row.HitDelayMs, row.HasProjectileSpeed ? row.ProjectileSpeed : 0);
        }

        private static Attack Of(MonstersRow row)
        {
            return Of(row.AttackRange, row.AttackIntervalMs, row.HitDelayMs, row.HasProjectileSpeed ? row.ProjectileSpeed : 0);
        }

        private static Attack Of(double range, uint intervalMs, uint hitDelayMs, double projectileSpeed)
        {
            return new Attack(
                (int)Math.Round(range * Units.PerMeter),
                Units.TicksFromMilliseconds(intervalMs),
                Units.TicksFromMilliseconds(hitDelayMs),
                projectileSpeed * Units.PerMeter / Units.TicksPerSecond);
        }

        private static long DistanceSquared(Entity a, Entity b)
        {
            long dx = a.X - b.X;
            long dz = a.Z - b.Z;
            return (dx * dx) + (dz * dz);
        }
    }
}
