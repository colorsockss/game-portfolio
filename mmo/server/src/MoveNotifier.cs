using System;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 이동 알림(54): 개체마다 이번 틱의 움직임을 보는 쪽에 알릴지 정하고, 알리면 알린 값을 개체에 남긴다(Creature.Sent*). 기준이 연결이 아니라 개체라
    /// 알리는 EntityMove는 개체마다 한 번 만든다(51). 보는 쪽은 알림 사이를 그 빠르기로 이어 그린다.
    /// 알리는 때: 순간 이동, 빠르기가 바뀜(출발, 멈춤, 감속이 붙거나 떨어짐), 서 있는 개체의 자리가 바뀜, 서 있는 개체가 돎(moveTurnMs 간격),
    /// 걷는 플레이어의 방향이 moveTurnYaw 넘게 바뀜(moveTurnMs 간격)과 moveConfirmMs마다의 확인, 걷는 몬스터·경비병·소환수의 다음 꺾이는 점이 바뀜
    /// (같은 대상을 쫓는 동안 대상이 움직여 바뀐 설 자리와 새로 찾은 길의 첫 점은 moveGoalMs 간격, 나머지는 그때마다. AiCreature.NextImmediate).
    /// </summary>
    internal sealed class MoveNotifier
    {
        private readonly uint _turnYaw;
        private readonly uint _turnTicks;
        private readonly uint _confirmTicks;
        private readonly uint _nextTicks;

        public MoveNotifier(Constants constants)
        {
            _turnYaw = constants.MoveTurnYaw;
            _turnTicks = Units.TicksFromMilliseconds(constants.MoveTurnMs);
            _confirmTicks = Units.TicksFromMilliseconds(constants.MoveConfirmMs);
            _nextTicks = Units.TicksFromMilliseconds(constants.MoveGoalMs);
        }

        /// <summary>
        /// 이번 틱에 알리면 알린 값을 남기고 true다. 시야 차례가 틱마다 모든 개체에 한 번 부른다.
        /// </summary>
        public bool Due(Creature creature, uint tick)
        {
            uint speed = SpeedOf(creature);
            AiCreature? mob = creature as AiCreature;
            (int X, int Z) next = (mob != null) && (speed > 0) ? mob.Next : default;
            bool turned = creature.Yaw != creature.SentYaw;
            bool due;
            if (creature.Teleported || (speed != creature.SentSpeed))
            {
                due = true;
            }
            else if (speed == 0)
            {
                due = (creature.X != creature.SentX) || (creature.Z != creature.SentZ) || (turned && (tick - creature.SentYawTick >= _turnTicks));
            }
            else if (mob != null)
            {
                due = (next != creature.SentNext) && (mob.NextImmediate || (tick - creature.SentNextTick >= _nextTicks));
            }
            else
            {
                due = ((YawGap(creature.Yaw, creature.SentYaw) > _turnYaw) && (tick - creature.SentYawTick >= _turnTicks))
                    || (tick - creature.SentTick >= _confirmTicks);
            }

            if (!due)
            {
                return false;
            }

            if (turned)
            {
                creature.SentYawTick = tick;
            }

            if (next != creature.SentNext)
            {
                creature.SentNextTick = tick;
            }

            creature.SentSpeed = speed;
            creature.SentX = creature.X;
            creature.SentZ = creature.Z;
            creature.SentYaw = creature.Yaw;
            creature.SentNext = next;
            creature.SentTick = tick;
            return true;
        }

        /// <summary>
        /// 이번 틱의 빠르기(좌표 칸/초): 걷는 플레이어는 최대 속도, 걸은 몬스터·경비병·소환수는 그 속도에 감속을 곱한 값이다. 죽었거나 기절했거나
        /// 연결이 떨어져 남은 플레이어(46)는 서버가 세운 것이라 Move를 기다리지 않고 0이다.
        /// </summary>
        internal static uint SpeedOf(Creature creature)
        {
            if (creature.Dead || creature.Stunned)
            {
                return 0;
            }

            double metersPerSecond = creature switch
            {
                Player player when player.Walking && !player.Session.IsDetached => Units.MaxSpeedMetersPerSecond,
                AiCreature mob when mob.Walked => mob.Template.Speed,
                _ => 0,
            };
            return (uint)Math.Round(metersPerSecond * (100 - creature.SlowPercent) / 100 * Units.PerMeter);
        }

        /// <summary>
        /// 두 방향의 차이(yaw 칸, 가까운 쪽으로 0 이상 반 바퀴 이하).
        /// </summary>
        private static uint YawGap(uint a, uint b)
        {
            uint gap = (a - b) % Units.YawSteps;
            return Math.Min(gap, Units.YawSteps - gap);
        }
    }
}
