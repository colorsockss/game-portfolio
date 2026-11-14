using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 진행 중인 일 하나(26). Id는 종류에 따른 테이블의 번호(시전은 Skills)이고, Target은 시전의 대상, X와 Z는 시작한 자리다.
    /// Generation은 끝의 예약의 세대 번호다.
    /// </summary>
    internal sealed record ProgressWork(ProgressKind Kind, uint Id, uint Target, uint EndTick, int X, int Z, ulong Generation)
    {
        public ProgressState State()
        {
            return new ProgressState { Kind = Kind, Id = Id, EndTick = EndTick };
        }
    }

    /// <summary>
    /// 진행 중인 일의 틀(시전 26, 귀환 32, 채집 47, 제작 48이 함께 씀). 한 개체에 하나만 두고, 시작하면 Progress를 보내고 끝을 예약한다.
    /// 취소(죽음, 기절, 시작한 자리에서 벗어남, 피해로 취소되는 종류의 피해)는 ProgressCancelled를 보낸다. 월드에서 빠진 개체의 일은
    /// 주인이 없어 예약이 버려지므로 따로 하지 않는다. 끝나는 틱의 확인과 그 일은 종류마다의 시스템이 한다.
    /// </summary>
    internal sealed class ProgressSystem
    {
        private readonly EntityTable _entities;
        private readonly Scheduler _scheduler;
        private readonly TickEvents _events;

        public ProgressSystem(EntityTable entities, Scheduler scheduler, TickEvents events)
        {
            _entities = entities;
            _scheduler = scheduler;
            _events = events;
        }

        /// <summary>
        /// 피해를 받으면 취소되는 종류인가. 시전만 피해로 취소되지 않는다.
        /// </summary>
        public static bool CancelledByDamage(ProgressKind kind)
        {
            return kind != ProgressKind.Cast;
        }

        /// <summary>
        /// 일을 시작한다(진행 중인 일이 없는 것은 부르는 쪽이 봄). 시전의 끝은 전투 차례로, 다른 종류의 끝은 꺼낸 자리에서 한다.
        /// </summary>
        public void Start(Creature creature, ProgressKind kind, uint id, uint target, uint endTick)
        {
            ulong generation = _scheduler.NewGeneration();
            creature.Progress = new ProgressWork(kind, id, target, endTick, creature.X, creature.Z, generation);
            _scheduler.Add(endTick, kind == ProgressKind.Cast ? ScheduledKind.CastEnd : ScheduledKind.ProgressEnd, creature.Id, 0, 0, generation);
            _events.Progress(creature);
        }

        /// <summary>
        /// 끝의 예약이 아직 그 일의 것인가(취소되거나 새 일을 시작하지 않음).
        /// </summary>
        public bool IsCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Creature { Progress: { } work }) && (work.Generation == job.Generation);
        }

        /// <summary>
        /// 일을 끝내지 못하게 한다. reason은 중간의 취소면 CANCELLED, 끝나는 틱의 확인에서 걸렸으면 요청 때와 같은 이유다. 일이 없으면 하지 않는다.
        /// </summary>
        public void Cancel(Creature creature, FailReason reason)
        {
            if (creature.Progress == null)
            {
                return;
            }

            creature.Progress = null;
            _events.ProgressCancelled(creature, reason);
        }

        /// <summary>
        /// 받아들인 위치가 시작한 자리와 다르면 취소한다(방향만 바꾼 Move는 취소하지 않음).
        /// </summary>
        public void Moved(Creature creature)
        {
            if ((creature.Progress is { } work) && ((work.X != creature.X) || (work.Z != creature.Z)))
            {
                Cancel(creature, FailReason.Cancelled);
            }
        }

        /// <summary>
        /// 시전이 아닌 일의 끝(꺼낸 자리). 그 종류의 일은 그 항목(귀환 32, 채집 47, 제작 48)이 여기에 더한다.
        /// </summary>
        public void End(in ScheduledJob job)
        {
            ((Creature)_entities.Find(job.Owner)!).Progress = null;
        }
    }
}
