using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 효과(26): 강화(공격력·방어력 올림)와 상태 이상(기절, 감속). 붙이면 끝을 예약하고 EffectApplied를 보내며 능력치를 다시 구한다.
    /// 같은 효과는 끝나는 틱만 새로 둔다. 끝나는 틱에 떼고 능력치를 다시 구하며, 떨어지는 것은 알리지 않는다(죽을 때 떼는 것도).
    /// 감속과 기절이 이동·AI·공격에 미치는 것은 그 시스템이 Creature.SlowPercent와 Stunned로 본다.
    /// </summary>
    internal sealed class EffectSystem
    {
        private readonly EntityTable _entities;
        private readonly Scheduler _scheduler;
        private readonly TickEvents _events;
        private readonly StatSystem _stats;
        private readonly ProgressSystem _progress;
        private readonly uint _combatTicks;

        public EffectSystem(EntityTable entities, Scheduler scheduler, TickEvents events, StatSystem stats, ProgressSystem progress, GameData data)
        {
            _entities = entities;
            _scheduler = scheduler;
            _events = events;
            _stats = stats;
            _progress = progress;
            _combatTicks = Units.TicksFromMilliseconds(data.Constants.CombatDurationMs);
        }

        /// <summary>
        /// 살아 있는 개체에 효과를 붙인다. 상태 이상은 피해가 없어도 맞은 쪽을 전투 상태로 두고, 기절은 진행 중인 일을 취소하고 건 타격을 버린다.
        /// </summary>
        public void Apply(Creature target, EffectsRow row, uint tick)
        {
            uint endTick = tick + Units.TicksFromMilliseconds(row.DurationMs);
            var applied = new AppliedEffect(row, endTick, _scheduler.NewGeneration());
            int index = IndexOf(target, row.Id);
            if (index >= 0)
            {
                target.Effects[index] = applied;
            }
            else
            {
                target.Effects.Add(applied);
            }

            _scheduler.Add(endTick, ScheduledKind.EffectEnd, target.Id, row.Id, 0, applied.Generation);
            _events.EffectApplied(target, row.Id, endTick);
            if (row.Kind is EffectKind.Stun or EffectKind.Slow)
            {
                target.CombatEndTick = tick + _combatTicks;
            }

            if (row.Kind == EffectKind.Stun)
            {
                _progress.Cancel(target, FailReason.Cancelled);
                target.StrikeGeneration = _scheduler.NewGeneration();
            }

            _stats.Recalculate(target);
        }

        /// <summary>
        /// 끝의 예약이 아직 그 효과의 것인가(다시 걸어 끝나는 틱이 바뀌거나 죽어서 떼이지 않음).
        /// </summary>
        public bool IsEndCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Creature creature) && (IndexOf(creature, job.A) is int index and >= 0)
                && (creature.Effects[index].Generation == job.Generation);
        }

        public void End(in ScheduledJob job)
        {
            var creature = (Creature)_entities.Find(job.Owner)!;
            creature.Effects.RemoveAt(IndexOf(creature, job.A));
            _stats.Recalculate(creature);
        }

        /// <summary>
        /// 죽은 개체의 효과를 모두 뗀다(알리지 않음. 클라이언트가 Died로 비움).
        /// </summary>
        public void Clear(Creature creature)
        {
            creature.Effects.Clear();
            _stats.Recalculate(creature);
        }

        private static int IndexOf(Creature creature, uint effectId)
        {
            for (int i = 0; i < creature.Effects.Count; i++)
            {
                if (creature.Effects[i].Row.Id == effectId)
                {
                    return i;
                }
            }

            return -1;
        }
    }
}
