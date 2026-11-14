using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 스킬(26). 입력 차례에 UseSkill을 확인하고 비용까지만 하며(시전 시간이 있으면 시전을 시작), 발동(SkillUsed)과 결과는 전투 차례에서 한다.
    /// 피해는 CombatSystem.Hit을, 효과는 EffectSystem을, 시전은 ProgressSystem을, 발사체의 속도가 있는 스킬의 결과는 ProjectileSystem(83)을 쓴다.
    /// 임시 상태: 스킬 배우기(36) 전에는 자기 직업의 스킬을 모두 배운 것으로 본다. 파티(42) 전에는 회복과 강화가 늘 자기에게 쓰인다.
    /// </summary>
    internal sealed class SkillSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly GameData _data;
        private readonly TickEvents _events;
        private readonly CombatSystem _combat;
        private readonly EffectSystem _effects;
        private readonly ProgressSystem _progress;
        private readonly ProjectileSystem _projectiles;
        private readonly uint _combatTicks;
        private readonly List<Entity> _query = new List<Entity>();

        public SkillSystem(
            EntityTable entities, Grid grid, FieldMap field, Scheduler scheduler, GameData data, TickEvents events, CombatSystem combat, EffectSystem effects, ProgressSystem progress,
            ProjectileSystem projectiles)
        {
            _entities = entities;
            _grid = grid;
            _field = field;
            _scheduler = scheduler;
            _data = data;
            _events = events;
            _combat = combat;
            _effects = effects;
            _progress = progress;
            _projectiles = projectiles;
            _combatTicks = Units.TicksFromMilliseconds(data.Constants.CombatDurationMs);
        }

        /// <summary>
        /// 대상에게 쓰는 스킬인가(단일 피해, 상태 이상, 대상 중심의 범위 피해). 아니면 그 자리에서 쓴다(자기 중심의 범위 피해, 회복, 강화).
        /// </summary>
        public static bool TargetsOther(SkillsRow skill)
        {
            return skill.Kind is SkillKind.SingleDamage or SkillKind.Debuff || ((skill.Kind == SkillKind.AreaDamage) && (skill.Center == SkillCenter.Target));
        }

        /// <summary>
        /// 서버가 옮기는 직선 발사체로 나가는 스킬인가(83). 대상, 사거리, 선을 미리 보지 않고 실려 온 대상은 방향만 정한다.
        /// </summary>
        public static bool Launches(SkillsRow skill)
        {
            return skill.HasProjectileSpeed;
        }

        /// <summary>
        /// 피해나 상태 이상을 주는 스킬인가. 이 스킬만 전투 상태를 만든다.
        /// </summary>
        public static bool Offensive(SkillsRow skill)
        {
            return skill.Kind is SkillKind.SingleDamage or SkillKind.AreaDamage or SkillKind.Debuff;
        }

        /// <summary>
        /// 쿨다운의 규칙(클라이언트와 비교 벡터로 맞춤): 쓴 틱 + 쿨다운의 틱 수(밀리초를 올림)에 끝나고, 그 틱부터 다시 쓸 수 있다.
        /// </summary>
        public static uint CooldownEndTick(uint usedTick, uint cooldownMs)
        {
            return usedTick + Units.TicksFromMilliseconds(cooldownMs);
        }

        public static bool Ready(uint endTick, uint tick)
        {
            return tick >= endTick;
        }

        /// <summary>
        /// UseSkill(입력 차례). 없는 스킬 번호면 잘못된 패킷(끊음), 확인에 어긋나면 실패다. 시전 시간이 없으면 비용을 빼고 그 틱의 전투 차례에
        /// 시작을 넘기고, 있으면 시전을 시작한다(비용은 발동할 때). 죽은 동안과 기절한 동안은 World.Receive가 먼저 막는다.
        /// </summary>
        public Outcome Use(Player player, UseSkill request, uint tick)
        {
            if (_data.Skill(request.SkillId) is not SkillsRow skill)
            {
                return Outcome.Malformed;
            }

            FailReason reason = Check(player, skill, request.TargetId, tick, out uint targetId);
            if (reason != FailReason.None)
            {
                return Outcome.Fail(reason);
            }

            if (skill.CastMs == 0)
            {
                Pay(player, skill, tick);
                // 입력은 예약한 일 앞의 차례라 같은 틱의 예약으로 나온다.
                _scheduler.Add(tick, ScheduledKind.SkillStart, player.Id, skill.Id, targetId, player.StrikeGeneration);
                return Outcome.Done;
            }

            _progress.Start(player, ProgressKind.Cast, skill.Id, targetId, tick + Units.TicksFromMilliseconds(skill.CastMs));
            if (Offensive(skill))
            {
                player.CombatEndTick = tick + _combatTicks;
            }

            return Outcome.Done;
        }

        /// <summary>
        /// 요청의 확인을 차례대로 본다: 진행 중, 배웠는지, 쿨다운, 마나, 대상과 사거리와 선. targetId는 스킬을 쓸 개체다.
        /// </summary>
        private FailReason Check(Player player, SkillsRow skill, uint requested, uint tick, out uint targetId)
        {
            targetId = player.Id;
            if (player.Progress != null)
            {
                return FailReason.Busy;
            }

            if (skill.Class != (uint)player.Class)
            {
                return FailReason.NotLearned;
            }

            if (!Ready(player.CooldownEnd(skill.Id), tick))
            {
                return FailReason.Cooldown;
            }

            if (player.Mp < skill.Mp)
            {
                return FailReason.NotEnoughMp;
            }

            return CheckTarget(player, skill, requested, out targetId);
        }

        /// <summary>
        /// 대상의 확인: 대상에게 쓰는 스킬은 대상이 있고 살아 있고 받은 개체인지, CanAttack, 복귀 중이 아닌지, 사거리, 선(사거리 안인데 막혔으면 막힘).
        /// 그 자리에서 쓰는 스킬은 보지 않고 시전자에게 쓴다(회복과 강화의 파티원은 42). 직선 발사체의 스킬은 보지 않고 실려 온 번호를 그대로 둔다.
        /// </summary>
        private FailReason CheckTarget(Player player, SkillsRow skill, uint requested, out uint targetId)
        {
            targetId = player.Id;
            if (Launches(skill))
            {
                targetId = requested;
                return FailReason.None;
            }

            if (!TargetsOther(skill))
            {
                return FailReason.None;
            }

            Entity? found = _entities.Find(requested);
            if ((found == null) || !player.Visible.Contains(found) || (found is Creature { Dead: true }))
            {
                return FailReason.NoTarget;
            }

            if ((found is not Creature target) || !_combat.CanAttack(player, target) || CombatSystem.IsReturning(target))
            {
                return FailReason.InvalidTarget;
            }

            long dx = (long)target.X - player.X;
            long dz = (long)target.Z - player.Z;
            long range = (long)Math.Round(skill.Range * Units.PerMeter);
            if ((dx * dx) + (dz * dz) > range * range)
            {
                return FailReason.OutOfRange;
            }

            if (!_field.HasLine(player.X, player.Z, target.X, target.Z))
            {
                return FailReason.Blocked;
            }

            targetId = target.Id;
            return FailReason.None;
        }

        /// <summary>
        /// 비용: 마나를 빼고 쿨다운이 끝나는 틱을 두며 바뀐 쿨다운을 본인에게 보낸다. 체력·마나는 이 틱의 VitalsSystem이 보낸다.
        /// </summary>
        private void Pay(Player player, SkillsRow skill, uint tick)
        {
            player.Mp -= skill.Mp;
            player.SetCooldown(skill.Id, CooldownEndTick(tick, skill.CooldownMs));
        }

        /// <summary>
        /// 전투 차례의 스킬의 일(시작, 결과). 시전자가 그대로이고 살아 있으며 세대 번호가 같은 것은 CombatSystem이 봤다.
        /// </summary>
        public void Run(in ScheduledJob job, uint tick)
        {
            var caster = (Creature)_entities.Find(job.Owner)!;
            SkillsRow skill = _data.Skill(job.A)!;
            if (job.Kind == ScheduledKind.SkillStart)
            {
                Begin(caster, skill, job.B, tick);
            }
            else
            {
                Apply(caster, skill, job.B, tick);
            }
        }

        /// <summary>
        /// 시전의 끝(전투 차례): 요청 때의 확인(대상, 사거리, 선, 마나)을 다시 보고, 걸리면 아무것도 빼지 않고 그 이유로 ProgressCancelled를 보낸다.
        /// 통과하면 비용을 빼고 발동한다(SkillUsed와 결과가 같은 틱).
        /// </summary>
        public void FinishCast(in ScheduledJob job, uint tick)
        {
            // 앞의 일로 이 차례에 죽거나 기절한 시전자는 그때 일이 취소됐다.
            if ((_entities.Find(job.Owner) is not Player { Dead: false, Progress: { } work } caster) || (work.Generation != job.Generation))
            {
                return;
            }

            SkillsRow skill = _data.Skill(work.Id)!;
            FailReason reason = CheckTarget(caster, skill, work.Target, out uint targetId);
            if ((reason == FailReason.None) && (caster.Mp < skill.Mp))
            {
                reason = FailReason.NotEnoughMp;
            }

            if (reason != FailReason.None)
            {
                _progress.Cancel(caster, reason);
                return;
            }

            caster.Progress = null;
            Pay(caster, skill, tick);
            Begin(caster, skill, targetId, tick);
        }

        /// <summary>
        /// 발동: SkillUsed를 내고, 피해나 상태 이상을 주는 스킬이면 시전자를 전투 상태로 두며, 결과를 타격까지의 시간 뒤에 적용한다(0이면 지금).
        /// 직선 발사체의 스킬은 결과 대신 발사체가 나간다.
        /// </summary>
        private void Begin(Creature caster, SkillsRow skill, uint targetId, uint tick)
        {
            if (Launches(skill))
            {
                _events.SkillUsedByCaster(caster, skill.Id, targetId != 0 ? targetId : caster.Id);
            }
            else
            {
                _events.SkillUsed(caster, skill.Id, _entities.Find(targetId) ?? caster);
            }

            if (Offensive(skill))
            {
                caster.CombatEndTick = tick + _combatTicks;
            }

            if ((targetId != caster.Id) && (_entities.Find(targetId) != null))
            {
                caster.LastSkillTarget = targetId;
            }

            uint hitTick = tick + Units.TicksFromMilliseconds(skill.HitDelayMs);
            if (hitTick == tick)
            {
                Apply(caster, skill, targetId, tick);
                return;
            }

            _scheduler.Add(hitTick, ScheduledKind.SkillHit, caster.Id, skill.Id, targetId, caster.StrikeGeneration);
        }

        /// <summary>
        /// 결과. 대상에게 쓰는 스킬은 대상이 결과를 받을 수 없게 됐으면(죽음, 월드에서 빠짐, CanAttack 거짓, 복귀 중) 아무것도 하지 않는다.
        /// 직선 발사체의 스킬은 발사체를 내고, 결과는 발사체가 닿을 때 준다.
        /// </summary>
        private void Apply(Creature caster, SkillsRow skill, uint targetId, uint tick)
        {
            if (Launches(skill))
            {
                _projectiles.Launch(caster, skill, targetId, tick);
                return;
            }

            switch (skill.Kind)
            {
                case SkillKind.SingleDamage:
                    if (_combat.Hittable(caster, targetId) is Creature single)
                    {
                        _combat.Hit(caster, single, skill.Coefficient, tick);
                        AddEffect(skill, single, tick);
                    }

                    break;
                case SkillKind.Debuff:
                    if (_combat.Hittable(caster, targetId) is Creature debuffed)
                    {
                        CombatSystem.Engage(caster, debuffed, 0);
                        AddEffect(skill, debuffed, tick);
                    }

                    break;
                case SkillKind.AreaDamage:
                    Area(caster, skill, targetId, tick);
                    break;
                case SkillKind.Buff:
                    AddEffect(skill, caster, tick);
                    break;
                case SkillKind.Heal:
                    caster.Restore((uint)Math.Floor(caster.Stats.Attack * skill.Coefficient), 0);
                    break;
                default:
                    throw new InvalidOperationException($"Skill {skill.Id} has unknown kind {skill.Kind}.");
            }
        }

        /// <summary>
        /// 범위 피해: 중심(대상이나 시전자)에서 범위 안의 적(살아 있고 CanAttack이 참이고 복귀 중이 아닌 몬스터) 가운데 중심에서 선이 트인 것마다
        /// 피해와 거는 효과를 준다. 플레이어는 맞지 않는다(강제 공격은 44).
        /// </summary>
        private void Area(Creature caster, SkillsRow skill, uint targetId, uint tick)
        {
            Creature? center = skill.Center == SkillCenter.Self ? caster : _combat.Hittable(caster, targetId);
            if (center == null)
            {
                return;
            }

            int radius = (int)Math.Round(skill.Radius * Units.PerMeter);
            _grid.Query(center.X, center.Z, radius, entity => entity is Monster, _query);
            foreach (Entity entity in _query)
            {
                var monster = (Monster)entity;
                if (!monster.Dead && _combat.CanAttack(caster, monster) && !CombatSystem.IsReturning(monster) && _field.HasLine(center.X, center.Z, monster.X, monster.Z))
                {
                    _combat.Hit(caster, monster, skill.Coefficient, tick);
                    AddEffect(skill, monster, tick);
                }
            }
        }

        private void AddEffect(SkillsRow skill, Creature target, uint tick)
        {
            if (skill.HasEffect && !target.Dead)
            {
                _effects.Apply(target, _data.Effect(skill.Effect), tick);
            }
        }
    }
}
