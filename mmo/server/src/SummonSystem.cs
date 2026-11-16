using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 소환수(95)의 부르기, 대상 넣기와 버리기, 죽음과 사라짐. 움직임과 치는 것은 AiSystem과 CombatSystem이 몬스터처럼 한다.
    /// 소환수가 죽거나 사라지면 몬스터의 피해 표에서 그 줄을 주인의 줄로 옮긴다(주인이 죽었거나 주인의 연결이 떨어져 사라진 것이면 버림).
    /// </summary>
    internal sealed class SummonSystem
    {
        private readonly GameData _data;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly Scheduler _scheduler;
        private readonly AiSystem _ai;
        private readonly uint _deadTicks;

        public SummonSystem(GameData data, EntityTable entities, Grid grid, Scheduler scheduler, AiSystem ai)
        {
            _data = data;
            _entities = entities;
            _grid = grid;
            _scheduler = scheduler;
            _ai = ai;
            _deadTicks = Units.TicksFromMilliseconds(data.Constants.DeadMonsterMs);
        }

        /// <summary>
        /// 소환 스킬의 발동(전투 차례): 그 플레이어의 소환수가 있으면 빼고(피해 표의 줄은 주인에게), 주인의 자리에 가득 찬 체력의 새 소환수를 놓고 남는 시간의 끝을 예약한다.
        /// </summary>
        public void Call(Player owner, SkillsRow skill, uint tick)
        {
            if (owner.Summon != null)
            {
                Remove(owner.Summon, tick, transfer: true);
            }

            var summon = new Summon(_entities.NextGroundItemId(tick), owner, _data.Monster(skill.SummonMonster), tick + Units.TicksFromMilliseconds(skill.SummonMs))
            {
                StrikeGeneration = _scheduler.NewGeneration(),
                LifeGeneration = _scheduler.NewGeneration(),
            };
            summon.VitalsChanged = false;
            owner.Summon = summon;
            _entities.Add(summon);
            _grid.Add(summon);
            _ai.Add(summon);
            _scheduler.Add(summon.EndTick, ScheduledKind.SummonEnd, summon.Id, 0, 0, summon.LifeGeneration);
        }

        /// <summary>
        /// 주인이 대상을 치기 시작했다(기본 공격의 AttackSwing, 단일 대상 스킬의 SkillUsed): 소환수가 그 대상을 친다.
        /// </summary>
        public static void Assist(Creature attacker, Creature target)
        {
            if ((attacker is Player { Summon: { Dead: false } summon }) && (target != summon))
            {
                summon.Target = target.Id;
            }
        }

        /// <summary>
        /// 주인의 AttackStop(기절한 동안 보낸 것도): 소환수가 대상을 버린다.
        /// </summary>
        public static void Release(Player owner)
        {
            if (owner.Summon != null)
            {
                owner.Summon.Target = 0;
            }
        }

        /// <summary>
        /// 남는 시간의 끝이나 죽은 뒤 빼기의 예약이 아직 그 소환수의 것인가.
        /// </summary>
        public bool IsEndCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Summon summon) && (summon.LifeGeneration == job.Generation);
        }

        public void End(in ScheduledJob job, uint tick)
        {
            Remove((Summon)_entities.Find(job.Owner)!, tick, transfer: true);
        }

        /// <summary>
        /// 소환수가 죽었다(죽은 차례): 피해 표의 줄을 주인에게 옮기고 쓰러진 채 두었다가 죽은 뒤 남는 시간 뒤에 뺀다.
        /// </summary>
        public void Died(Summon summon, uint tick)
        {
            Transfer(summon, true);
            summon.LifeGeneration = _scheduler.NewGeneration();
            _scheduler.Add(tick + _deadTicks, ScheduledKind.SummonEnd, summon.Id, 0, 0, summon.LifeGeneration);
        }

        /// <summary>
        /// 주인이 죽었거나 주인의 연결이 캐릭터에서 떨어진다: 소환수를 바로 빼고 피해 표의 줄은 버린다.
        /// </summary>
        public void Dismiss(Player owner, uint tick)
        {
            if (owner.Summon != null)
            {
                Remove(owner.Summon, tick, transfer: false);
            }
        }

        /// <summary>
        /// 월드에서 뺀다. 걸린 타격은 공격자가 빠져 버려지고, 번호는 10초 뒤에 다시 쓴다.
        /// </summary>
        private void Remove(Summon summon, uint tick, bool transfer)
        {
            Transfer(summon, transfer && !summon.Owner.Dead);
            if (summon.Owner.Summon == summon)
            {
                summon.Owner.Summon = null;
            }

            _entities.Remove(summon);
            _grid.Remove(summon);
            _ai.Remove(summon);
            _entities.FreeGroundItemId(summon.Id, tick);
        }

        private void Transfer(Summon summon, bool toOwner)
        {
            foreach (Monster monster in _entities.All.OfType<Monster>())
            {
                if (toOwner)
                {
                    monster.Damage.Transfer(summon.Id, summon.Owner.Id);
                }
                else
                {
                    monster.Damage.RemoveWhere(id => id == summon.Id);
                }
            }
        }
    }
}
