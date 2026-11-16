using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 기본 공격(틱의 넷째 차례). 공격 상태인 개체가 다음 공격 틱에 대상이 사거리 안이고 선이 트였으면 AttackSwing을 내고 타격을 예약하며,
    /// 타격할 틱에 피해를 준다(Damaged, 체력이 0이면 Died). 사건은 TickEvents에 쌓아 시야 차례 뒤에 보낸다. 스킬의 일(시작, 결과, 시전의 끝)은
    /// 같은 차례에서 SkillSystem에 넘기고, 피해는 이곳의 Hit을 함께 쓴다.
    /// </summary>
    internal sealed class CombatSystem
    {
        private readonly PartySystem _party;
        private readonly EntityTable _entities;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly StatSystem _stats;
        private readonly GameData _data;
        private readonly TickEvents _events;
        private readonly ProgressSystem _progress;
        private readonly PkSystem _pk;
        private readonly uint _combatTicks;

        /// <summary>
        /// 이 틱에 죽은 개체(죽은 차례). 전투 차례의 끝에서 DeathSystem이 정리한다.
        /// </summary>
        private readonly List<Creature> _died = new List<Creature>();

        /// <summary>
        /// 죽음을 정리하는 쪽. World가 만든 뒤에 잇는다(둘이 서로를 부름).
        /// </summary>
        public DeathSystem? Deaths { get; set; }

        /// <summary>
        /// 스킬의 일을 하는 쪽. World가 만든 뒤에 잇는다(스킬이 이곳의 피해를 씀).
        /// </summary>
        public SkillSystem? Skills { get; set; }

        /// <summary>
        /// 보스의 범위 공격(43). 피해를 주는 예약을 전투 차례에 넘긴다.
        /// </summary>
        public BossSystem? Bosses { get; set; }

        /// <summary>
        /// 직선 발사체를 옮기는 쪽(83). World가 만든 뒤에 잇는다(발사체가 이곳의 피해를 씀).
        /// </summary>
        public ProjectileSystem? Projectiles { get; set; }

        public CombatSystem(EntityTable entities, FieldMap field, Scheduler scheduler, StatSystem stats, GameData data, TickEvents events, ProgressSystem progress, PartySystem party, PkSystem pk)
        {
            _pk = pk;
            _entities = entities;
            _field = field;
            _scheduler = scheduler;
            _party = party;
            _stats = stats;
            _data = data;
            _events = events;
            _progress = progress;
            _combatTicks = Units.TicksFromMilliseconds(data.Constants.CombatDurationMs);
        }

        /// <summary>
        /// 공격할 수 있는 사이인지(설계의 PK와 안전 지대). 플레이어와 몬스터 사이는 플레이어가 안전 지대 밖이어야 하고(플레이어는 안에서 밖의 몬스터를 치지 못하고,
        /// 몬스터는 안의 플레이어를 치지 못함), 플레이어 사이는 PkSystem의 규칙이다(44). 경비병은 선공 표시가 있거나 무법자인 플레이어를 안전 지대에서도 치고,
        /// 경비병은 누구의 대상도 아니다.
        /// </summary>
        public bool CanAttack(Creature attacker, Creature target)
        {
            return AttackFailure(attacker, target) == FailReason.None;
        }

        /// <summary>
        /// CanAttack이 거짓인 까닭(참이면 NONE). 플레이어 사이는 "레벨 10 미만", "파티원"이 따로 있고 나머지는 "공격할 수 없는 대상"이다.
        /// </summary>
        public FailReason AttackFailure(Creature attacker, Creature target)
        {
            // 소환수가 치면 주인의 것으로 본다(95). 소환수가 맞으면 누구인지는 주인으로, 안전 지대의 자리는 소환수의 자리로 본다.
            return (PkSystem.Responsible(attacker) ?? attacker, target) switch
            {
                (Player player, Monster) => _field.IsSafe(player.X, player.Z) ? FailReason.InvalidTarget : FailReason.None,
                (Monster, Player player) => _field.IsSafe(player.X, player.Z) ? FailReason.InvalidTarget : FailReason.None,
                (Monster, Summon summon) => _field.IsSafe(summon.X, summon.Z) ? FailReason.InvalidTarget : FailReason.None,
                (Player player, Player victim) => _pk.PlayerFailure(player, victim),
                (Player player, Summon summon) => summon.Owner == player ? FailReason.InvalidTarget : _pk.PlayerFailure(player, summon.Owner, (summon.X, summon.Z)),
                (Guard, Player player) => PkSystem.IsNormal(player) ? FailReason.InvalidTarget : FailReason.None,
                _ => FailReason.InvalidTarget,
            };
        }

        /// <summary>
        /// AttackStart(입력 차례): 대상이 있고 살아 있고 그 연결이 받은 개체인지, CanAttack, 복귀 중인 몬스터가 아닌지를 보고 공격 상태를 켠다.
        /// 이미 공격 중이면 대상만 바꾼다. 어긋나면 실패다(방금 죽었거나 나간 대상은 정상 클라이언트도 보낼 수 있어 끊지 않음).
        /// 죽은 동안과 기절한 동안은 World.Receive가 먼저 막는다.
        /// </summary>
        public Outcome Start(Player player, AttackStart request)
        {
            if (player.Progress != null)
            {
                return Outcome.Fail(FailReason.Busy);
            }

            Entity? found = _entities.Find(request.TargetId);
            if ((found == null) || !player.Visible.Contains(found) || (found is Creature { Dead: true }))
            {
                return Outcome.Fail(FailReason.NoTarget);
            }

            if (found is not Creature target)
            {
                return Outcome.Fail(FailReason.InvalidTarget);
            }

            FailReason reason = IsReturning(target) ? FailReason.InvalidTarget : AttackFailure(player, target);
            if (reason != FailReason.None)
            {
                return Outcome.Fail(reason);
            }

            player.AttackTarget = target.Id;
            return Outcome.Done;
        }

        public void Stop(Player player)
        {
            player.AttackTarget = 0;
            SummonSystem.Release(player);
        }

        /// <summary>
        /// 타격(스킬의 시작과 결과도)의 예약이 아직 걸려 있는가: 공격자가 그대로 있고 살아 있으며 타격의 세대 번호가 같다(죽거나 기절해 버리지 않음).
        /// </summary>
        public bool IsStrikeCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Creature { Dead: false } attacker) && (attacker.StrikeGeneration == job.Generation);
        }

        /// <summary>
        /// 전투 차례: 예약한 일이 넘긴 이 틱의 타격과 스킬의 일을 차례대로 하고, 직선 발사체를 옮기며(83), 공격 상태인 개체 가운데 다음 공격 틱이 된 것의 공격을 시작한다.
        /// 기절했거나 진행 중인 일이 있는 개체의 기본 공격은 끄지 않고 쉰다. 앞의 일로 이 차례에 죽거나 기절한 공격자의 일은 다시 보고 버린다.
        /// </summary>
        public void Step(uint tick)
        {
            foreach (ScheduledJob job in _scheduler.CombatJobs)
            {
                if (job.Kind == ScheduledKind.CastEnd)
                {
                    Skills!.FinishCast(job, tick);
                }
                else if (job.Kind == ScheduledKind.AreaHit)
                {
                    Bosses!.Hit(job, tick);
                }
                else if (!IsStrikeCurrent(job))
                {
                    continue;
                }
                else if (job.Kind == ScheduledKind.Strike)
                {
                    Strike((Creature)_entities.Find(job.Owner)!, job.A, tick);
                }
                else
                {
                    Skills!.Run(job, tick);
                }
            }

            _scheduler.CombatJobs.Clear();
            Projectiles?.Step(tick);
            foreach (Entity entity in _entities.All)
            {
                if ((entity is Creature { Dead: false, Progress: null } attacker) && (attacker.AttackTarget != 0) && (attacker.NextAttackTick <= tick)
                    && !attacker.Stunned)
                {
                    TrySwing(attacker, tick);
                }
            }

            foreach (Creature dead in _died)
            {
                Deaths?.Died(dead, tick);
            }

            _died.Clear();
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

            FailReason reason = IsReturning(target) ? FailReason.InvalidTarget : AttackFailure(attacker, target);
            if (reason != FailReason.None)
            {
                attacker.AttackTarget = 0;
                if (attacker is Player player)
                {
                    player.Fail(reason, RequestKind.Attack);
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
            _pk.Attacked(attacker, target, tick);
            SummonSystem.Assist(attacker, target);
            attacker.NextAttackTick = tick + attack.IntervalTicks;
            attacker.CombatEndTick = tick + _combatTicks;
            // 소환수가 친 틱에 주인의 전투 상태도 새로 시작한다(95).
            if (attacker is Summon summon)
            {
                summon.Owner.CombatEndTick = tick + _combatTicks;
            }
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
        /// 타격: 대상이 결과를 받을 수 있으면 계수 1의 피해를 준다. 사거리 밖으로 나간 대상과 공격을 멈춘 공격자의 타격도 맞는다.
        /// </summary>
        private void Strike(Creature attacker, uint targetId, uint tick)
        {
            if (Hittable(attacker, targetId) is Creature target)
            {
                Hit(attacker, target, 1, tick);
            }
        }

        /// <summary>
        /// 결과를 받을 수 있는 대상(살아 있고 월드에 있으며 CanAttack이 참이고 복귀 중인 몬스터가 아님). 아니면 null이다.
        /// </summary>
        public Creature? Hittable(Creature attacker, uint targetId)
        {
            return (_entities.Find(targetId) is Creature { Dead: false } target) && CanAttack(attacker, target) && !IsReturning(target) ? target : null;
        }

        /// <summary>
        /// 공격자가 몬스터를 때린 것으로 친다: 플레이어를 그 몬스터의 피해 표에 더한다(피해 0인 상태 이상도. 비선공 몬스터도 표에 든 플레이어를
        /// 쫓으며, 맞아서 시작하는 추적은 선과 상관없음).
        /// </summary>
        public static void Engage(Creature attacker, Creature target, uint damage)
        {
            // 소환수의 피해는 소환수의 줄에 쌓인다(95. 편은 주인의 것).
            if ((attacker is Player or Summon) && (target is Monster monster))
            {
                monster.Damage.Add(attacker.Id, damage);
            }
        }

        /// <summary>
        /// 피해: 공식의 피해를 빼고 맞은 쪽을 전투 상태로 두며 Damaged를 낸다. 피해로 취소되는 진행 중인 일을 취소하고, 체력이 0이면 죽인다.
        /// 기본 공격과 스킬(26)이 함께 쓴다.
        /// </summary>
        public void Hit(Creature attacker, Creature target, double coefficient, uint tick)
        {
            (uint damage, bool critical) = _stats.Damage(attacker, target, coefficient);
            target.Hp -= Math.Min(damage, target.Hp);
            target.CombatEndTick = tick + _combatTicks;
            Engage(attacker, target, damage);
            _events.Damaged(attacker, target, damage, critical);
            if ((target.Progress is { } work) && ProgressSystem.CancelledByDamage(work.Kind))
            {
                _progress.Cancel(target, FailReason.Cancelled);
            }

            if (target.Hp == 0)
            {
                target.Dead = true;
                target.AttackTarget = 0;
                target.StrikeGeneration = _scheduler.NewGeneration();
                if (target is Monster dead)
                {
                    dead.Killer = dead.Damage.Killer(_party.SideOf);
                }

                // 죽은 쪽이 일반 플레이어였는지는 죽은 차례가 선공 표시를 떼기 전에 본다(44).
                _pk.Killed(target, attacker);

                _events.Died(target, attacker);
                _died.Add(target);
            }
        }

        public static bool IsReturning(Creature target)
        {
            return target is Monster { State: MonsterState.Return };
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
                AiCreature mob => Of(mob.Template),
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
