using System.Collections.Generic;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 필드 보스(43): 범위 공격의 예고와 피해, 등장·죽음·나와 있음의 필드 알림. 보스는 Monsters의 종류가 보스인 몬스터이고 그 밖은 일반 몬스터와 같다
    /// (AI, 기본 공격, 피해 표, 보상). 범위 공격은 AiSystem이 추적·공격 상태에서 걸고, 예고 시간 뒤의 피해는 전투 차례가 이것을 부른다.
    /// </summary>
    internal sealed class BossSystem
    {
        private readonly GameData _data;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly TickEvents _events;
        private readonly CombatSystem _combat;
        private readonly List<Entity> _query = new List<Entity>();

        public BossSystem(GameData data, EntityTable entities, Grid grid, FieldMap field, Scheduler scheduler, TickEvents events, CombatSystem combat)
        {
            _data = data;
            _entities = entities;
            _grid = grid;
            _field = field;
            _scheduler = scheduler;
            _events = events;
            _combat = combat;
        }

        public static bool IsBoss(Monster monster)
        {
            return monster.Template.Kind == MonsterKind.Boss;
        }

        /// <summary>
        /// 보스가 놓였다(서버가 뜰 때와 리스폰): 월드의 모든 연결에 등장을 알린다.
        /// </summary>
        public void Spawned(Monster monster)
        {
            if (IsBoss(monster))
            {
                Broadcast(Notice(FieldNoticeKind.BossAppeared, monster));
            }
        }

        /// <summary>
        /// 보스가 죽었다(죽은 차례): 월드의 모든 연결에 죽음을 알린다.
        /// </summary>
        public void Died(Monster monster)
        {
            if (IsBoss(monster))
            {
                Broadcast(Notice(FieldNoticeKind.BossDied, monster));
            }
        }

        /// <summary>
        /// 월드에 들어왔다(EnterWorldResult 뒤): 살아 있는 보스마다 "보스가 나와 있음"을 보낸다.
        /// </summary>
        public void Entered(Player player)
        {
            foreach (Monster boss in _entities.All.OfType<Monster>().Where(monster => !monster.Dead && IsBoss(monster)))
            {
                player.Session.Send(Notice(FieldNoticeKind.BossPresent, boss));
            }
        }

        /// <summary>
        /// 추적·공격 상태의 몬스터(AI 차례): 범위 공격 스킬이 있고 쿨다운이 끝났고 대상이 사거리 안이고 선이 트였으면 건다. 중심은 지금 대상의 자리에 고정하고,
        /// 쿨다운을 걸고, 보스를 받은 연결에 AreaWarning을 보내고, 예고 시간 뒤의 피해를 예약한다.
        /// </summary>
        public void TryArea(Monster monster, Creature target, uint tick)
        {
            if (!monster.Template.HasSkill || (monster.AreaReadyTick > tick) || (_data.Skill(monster.Template.Skill) is not SkillsRow skill))
            {
                return;
            }

            long dx = (long)target.X - monster.X;
            long dz = (long)target.Z - monster.Z;
            long range = (long)System.Math.Round(skill.Range * Units.PerMeter);
            if (((dx * dx) + (dz * dz) > range * range) || !_field.HasLine(monster.X, monster.Z, target.X, target.Z))
            {
                return;
            }

            // 복귀를 시작하면 0으로 돌려, 그 전에 건 범위 공격의 예약을 버린다(다시 나온 보스는 새 개체라 0에서 시작).
            if (monster.AreaGeneration == 0)
            {
                monster.AreaGeneration = _scheduler.NewGeneration();
            }

            monster.AreaReadyTick = tick + Units.TicksFromMilliseconds(skill.CooldownMs);
            uint hitTick = tick + Units.TicksFromMilliseconds(skill.HasWarnMs ? skill.WarnMs : 0);
            _events.AreaWarning(monster, new AreaWarning { CasterId = monster.Id, SkillId = skill.Id, X = target.X, Z = target.Z, HitTick = hitTick });
            _scheduler.Add(hitTick, ScheduledKind.AreaHit, monster.Id, (uint)target.X, (uint)target.Z, monster.AreaGeneration);
        }

        /// <summary>
        /// 범위 공격의 예약이 아직 그 보스의 것인가(보스가 살아 있고 그 사이에 복귀를 시작하지 않음).
        /// </summary>
        public bool IsAreaCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Monster { Dead: false } monster) && (monster.AreaGeneration == job.Generation);
        }

        /// <summary>
        /// 범위 공격의 피해(전투 차례): 원 안의 살아 있는 플레이어 가운데 중심에서 선이 트이고 CanAttack을 통과한 플레이어에게 피해 식으로 피해를 준다.
        /// 그 사이에 원 밖이나 벽 뒤로 간 플레이어는 맞지 않는다. 같은 차례의 앞선 일로 보스가 죽었으면 아무것도 하지 않는다.
        /// </summary>
        public void Hit(in ScheduledJob job, uint tick)
        {
            if (!IsAreaCurrent(job))
            {
                return;
            }

            var boss = (Monster)_entities.Find(job.Owner)!;
            SkillsRow skill = _data.Skill(boss.Template.Skill)!;
            int x = (int)job.A;
            int z = (int)job.B;
            // 소환수(95)도 맞는다.
            _grid.Query(x, z, (int)System.Math.Round(skill.Radius * Units.PerMeter), entity => entity is Player { Dead: false } or Summon { Dead: false }, _query);
            foreach (Entity entity in _query)
            {
                var target = (Creature)entity;
                if (_field.HasLine(x, z, target.X, target.Z) && _combat.CanAttack(boss, target))
                {
                    _combat.Hit(boss, target, skill.Coefficient, tick);
                }
            }
        }

        private static Packet Notice(FieldNoticeKind kind, Monster monster)
        {
            return new Packet { FieldNotice = new FieldNotice { Kind = kind, TemplateId = monster.Template.Id, X = monster.Placed.X, Z = monster.Placed.Z } };
        }

        private void Broadcast(Packet packet)
        {
            foreach (Player player in _entities.Players)
            {
                player.Session.Send(packet);
            }
        }
    }
}
