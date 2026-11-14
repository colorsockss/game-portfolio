using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터의 상태(틱의 셋째 차례): 인식, 대상 고르기, 추적, 공격 자리에 서기, 복귀, 배회. 치는 것은 24, 죽음은 25가 더한다.
    /// "걷는 선"은 몬스터 쪽의 FieldMap.CanWalkLine, "선"은 FieldMap.HasLine이다. 몬스터 쪽의 걷는 선과 길찾기는 안전 지대의 칸을 지나지 않으므로
    /// 몬스터는 안전 지대에 들어가지 않는다.
    /// </summary>
    internal sealed class AiSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly Random _random;
        private readonly PathFinder _paths;
        private readonly List<Monster> _monsters = new List<Monster>();
        private readonly List<Entity> _query = new List<Entity>();

        /// <summary>
        /// 복귀 중의 회복 차례(1초마다. 회복과 같은 위상).
        /// </summary>
        private readonly Periodic _second = new Periodic(Units.TicksPerSecond, Units.TicksPerSecond);

        private readonly uint _unreachableTicks;
        private readonly long _repathDistance;
        private readonly int _returnMargin;
        private readonly uint _returnRegenPercent;
        private readonly uint _pauseMinTicks;
        private readonly uint _pauseMaxTicks;

        public AiSystem(EntityTable entities, Grid grid, FieldMap field, Scheduler scheduler, GameData data, Random random)
        {
            _entities = entities;
            _grid = grid;
            _field = field;
            _scheduler = scheduler;
            _random = random;
            _paths = new PathFinder(field);
            Constants constants = data.Constants;
            _unreachableTicks = Units.TicksFromMilliseconds(constants.UnreachableMs);
            _repathDistance = ToUnits(constants.RepathDistance);
            _returnMargin = ToUnits(constants.ReturnRangeMargin);
            _returnRegenPercent = constants.ReturnRegenPercent;
            _pauseMinTicks = Units.TicksFromMilliseconds(constants.WanderPauseMinMs);
            _pauseMaxTicks = Units.TicksFromMilliseconds(constants.WanderPauseMaxMs);
        }

        public IReadOnlyList<Monster> Monsters => _monsters;

        public void Add(Monster monster)
        {
            _monsters.Add(monster);
        }

        public void Remove(Monster monster)
        {
            _monsters.Remove(monster);
        }

        public void Step(uint tick, uint elapsedTicks)
        {
            bool regenerate = _second.Due(tick);
            foreach (Monster monster in _monsters)
            {
                // 기절한 몬스터는 움직이지도 치지도 않는다(공격 상태는 남고 CombatSystem이 쉬게 함).
                if (!monster.Dead && !monster.Stunned)
                {
                    Think(monster, tick, elapsedTicks, regenerate);
                }
            }
        }

        /// <summary>
        /// "닿을 수 없음"을 지우는 예약이 아직 그 표시의 것인가(몬스터가 그대로 있고 같은 대상에 다시 표시하지 않음).
        /// </summary>
        public bool IsUnreachableCurrent(in ScheduledJob job)
        {
            return (_entities.Find(job.Owner) is Monster monster) && monster.Unreachable.TryGetValue(job.A, out ulong generation) && (generation == job.Generation);
        }

        public void EndUnreachable(in ScheduledJob job)
        {
            ((Monster)_entities.Find(job.Owner)!).Unreachable.Remove(job.A);
        }

        private void Think(Monster monster, uint tick, uint elapsedTicks, bool regenerate)
        {
            // 월드에서 빠진 플레이어는 표에서 뺀다(플레이어의 번호는 다시 쓰지 않음). 죽은 플레이어는 25가 뺀다.
            monster.Damage.RemoveWhere(id => _entities.Find(id) is not Player);
            double step = monster.Template.Speed * (100 - monster.SlowPercent) / 100 * Units.PerMeter / Units.TicksPerSecond * elapsedTicks;
            // 공격 상태는 아래의 공격 갈래에서만 켠다(치는 것은 CombatSystem).
            monster.AttackTarget = 0;
            if (monster.State == MonsterState.Return)
            {
                Return(monster, step, regenerate);
                return;
            }

            if (monster.Template.Aggressive && monster.Detect.Due(tick))
            {
                Detect(monster);
            }

            if (DistanceSquared(monster.X, monster.Z, monster.Placed.X, monster.Placed.Z) > Square(ToUnits(monster.Template.ChaseLimit)))
            {
                StartReturn(monster);
                Return(monster, step, regenerate);
                return;
            }

            uint? targetId = monster.Damage.Pick(id => Selectable(monster, id));
            if (targetId == null)
            {
                if (monster.Damage.Count > 0)
                {
                    StartReturn(monster);
                    Return(monster, step, regenerate);
                    return;
                }

                monster.State = MonsterState.Idle;
                Wander(monster, tick, step);
                return;
            }

            var target = (Player)_entities.Find(targetId.Value)!;
            monster.Wandering = false;
            int range = ToUnits(monster.Template.AttackRange);
            if ((DistanceSquared(monster.X, monster.Z, target.X, target.Z) <= Square(range)) && _field.HasLine(monster.X, monster.Z, target.X, target.Z))
            {
                // 공격: 서서 대상을 본다. 치는 것은 24다.
                monster.State = MonsterState.Attack;
                monster.AttackTarget = target.Id;
                monster.Path.Clear();
                Face(monster, target.X - monster.X, target.Z - monster.Z);
                return;
            }

            monster.State = MonsterState.Chase;
            Chase(monster, target, tick, step, range);
        }

        /// <summary>
        /// 인식 범위 안에서 살아 있고 안전 지대 밖이며 선이 트인 플레이어를 피해 0으로 표에 넣는다.
        /// </summary>
        private void Detect(Monster monster)
        {
            _grid.Query(monster.X, monster.Z, ToUnits(monster.Template.DetectRange), entity => entity is Player { Dead: false }, _query);
            foreach (Entity player in _query)
            {
                if (!_field.IsSafe(player.X, player.Z) && _field.HasLine(monster.X, monster.Z, player.X, player.Z) && !monster.Damage.Contains(player.Id))
                {
                    monster.Damage.Add(player.Id, 0);
                }
            }
        }

        /// <summary>
        /// 칠 수 있는 대상: 살아 있고, 안전 지대 밖이고, "닿을 수 없음"이 아니다. 안전 지대 안의 플레이어는 표에서 지우지 않고 건너뛴다.
        /// </summary>
        private bool Selectable(Monster monster, uint playerId)
        {
            return (_entities.Find(playerId) is Player { Dead: false } player) && !_field.IsSafe(player.X, player.Z) && !monster.Unreachable.ContainsKey(playerId);
        }

        /// <summary>
        /// 대상까지 걷는 선이 트였으면 곧게 사거리 조금 안까지, 막혔으면 놓인 점에서 추적 한계 안의 칸으로 찾은 길을 따라간다.
        /// 대상이 길을 찾은 때의 자리에서 다시 찾는 거리를 넘게 옮기기 전에는 그 길을 쓴다. 길이 없으면 그 대상을 5초 동안 건너뛴다.
        /// </summary>
        private void Chase(Monster monster, Player target, uint tick, double step, int range)
        {
            if (_field.CanWalkLine(monster.X, monster.Z, target.X, target.Z, Walker.Monster))
            {
                monster.Path.Clear();
                // 사거리의 끝에 서면 반올림으로 사거리 밖과 안을 오가므로 0.25 m 안쪽까지 간다.
                double distance = Math.Sqrt(DistanceSquared(monster.X, monster.Z, target.X, target.Z));
                MoveToward(monster, target.X, target.Z, Math.Min(step, Math.Max(0, distance - range + (Units.PerMeter / 4.0))));
                return;
            }

            bool stale = (monster.PathIndex >= monster.Path.Count)
                || (DistanceSquared(target.X, target.Z, monster.PathGoal.X, monster.PathGoal.Z) > Square(_repathDistance));
            if (stale)
            {
                PlacedPoint placed = monster.Placed;
                if (!_paths.Find(monster.X, monster.Z, target.X, target.Z, Walker.Monster, placed.X, placed.Z, ToUnits(monster.Template.ChaseLimit), monster.Path))
                {
                    MarkUnreachable(monster, target.Id, tick);
                    return;
                }

                monster.PathIndex = 0;
                monster.PathGoal = (target.X, target.Z);
            }

            FollowPath(monster, step);
        }

        private void MarkUnreachable(Monster monster, uint playerId, uint tick)
        {
            monster.Path.Clear();
            ref ulong generation = ref CollectionsMarshal.GetValueRefOrAddDefault(monster.Unreachable, playerId, out _);
            _scheduler.Add(tick + _unreachableTicks, ScheduledKind.UnreachableEnd, monster.Id, playerId, 0, ref generation);
        }

        /// <summary>
        /// 복귀를 시작한다: 피해 표와 길을 비운다.
        /// </summary>
        private static void StartReturn(Monster monster)
        {
            monster.State = MonsterState.Return;
            monster.Damage.Clear();
            monster.Path.Clear();
            monster.Wandering = false;
        }

        /// <summary>
        /// 놓인 점으로 간다. 걷는 선이 트였으면 곧게, 아니면 놓인 점에서 "지금 거리 + 여유" 안의 칸으로 찾은 길로 가고, 길이 없으면 순간 이동한다.
        /// 복귀하는 동안 1초마다 최대 체력의 일부가 차고(EntityVitals로 감), 놓인 점에 닿으면 대기로 돌아간다.
        /// </summary>
        private void Return(Monster monster, double step, bool regenerate)
        {
            if (regenerate)
            {
                monster.Restore((uint)((ulong)monster.MaxHp * _returnRegenPercent / 100), 0);
            }

            PlacedPoint placed = monster.Placed;
            if (_field.CanWalkLine(monster.X, monster.Z, placed.X, placed.Z, Walker.Monster))
            {
                monster.Path.Clear();
                MoveToward(monster, placed.X, placed.Z, step);
            }
            else
            {
                if (monster.PathIndex >= monster.Path.Count)
                {
                    int radius = (int)Math.Sqrt(DistanceSquared(monster.X, monster.Z, placed.X, placed.Z)) + _returnMargin;
                    if (!_paths.Find(monster.X, monster.Z, placed.X, placed.Z, Walker.Monster, placed.X, placed.Z, radius, monster.Path))
                    {
                        Place(monster, placed.X, placed.Z);
                        monster.Teleported = true;
                    }

                    monster.PathIndex = 0;
                }

                FollowPath(monster, step);
            }

            if ((monster.X == placed.X) && (monster.Z == placed.Z))
            {
                monster.State = MonsterState.Idle;
                monster.Path.Clear();
            }
        }

        /// <summary>
        /// 대기: 둘레 9개의 시야 칸에 플레이어가 있을 때만, 놓인 점에서 배회 반경 안이고 지금 자리에서 걷는 선이 트인 무작위 점으로 걷고,
        /// 닿으면 정한 시간 동안 선다. 그런 점만 고르므로 길찾기를 쓰지 않는다.
        /// </summary>
        private void Wander(Monster monster, uint tick, double step)
        {
            if (!_grid.HasPlayerAround(monster.Cell))
            {
                return;
            }

            if (!monster.Wandering)
            {
                if (tick < monster.WanderResumeTick)
                {
                    return;
                }

                if (!PickWanderGoal(monster))
                {
                    monster.WanderResumeTick = tick + Pause();
                    return;
                }

                monster.Wandering = true;
            }

            MoveToward(monster, monster.WanderGoal.X, monster.WanderGoal.Z, step);
            if ((monster.X, monster.Z) == monster.WanderGoal)
            {
                monster.Wandering = false;
                monster.WanderResumeTick = tick + Pause();
            }
        }

        private bool PickWanderGoal(Monster monster)
        {
            double radius = Math.Max(0, (monster.Placed.Spawn.WanderRadius * Units.PerMeter) - 1);
            for (int i = 0; i < 8; i++)
            {
                double angle = _random.NextDouble() * 2 * Math.PI;
                double distance = radius * Math.Sqrt(_random.NextDouble());
                int x = monster.Placed.X + (int)Math.Round(Math.Sin(angle) * distance);
                int z = monster.Placed.Z + (int)Math.Round(Math.Cos(angle) * distance);
                if (_field.CanWalkLine(monster.X, monster.Z, x, z, Walker.Monster))
                {
                    monster.WanderGoal = (x, z);
                    return true;
                }
            }

            return false;
        }

        private uint Pause()
        {
            return (uint)_random.Next((int)_pauseMinTicks, (int)_pauseMaxTicks + 1);
        }

        /// <summary>
        /// 길의 꺾이는 점을 따라 step만큼 간다(지난 틱 수만큼의 거리를 점마다 나눠 감).
        /// </summary>
        private void FollowPath(Monster monster, double step)
        {
            while ((step > 0) && (monster.PathIndex < monster.Path.Count))
            {
                (int x, int z) = monster.Path[monster.PathIndex];
                double left = MoveToward(monster, x, z, step);
                if ((monster.X != x) || (monster.Z != z))
                {
                    return;
                }

                monster.PathIndex++;
                step = left;
            }
        }

        /// <summary>
        /// (x, z) 쪽으로 step(1/32 m)만큼 곧게 간다. 닿으면 그 자리에 서고 남은 거리를 낸다. 반올림한 다음 자리까지 걷는 선이 막히면 서 있는다.
        /// </summary>
        private double MoveToward(Monster monster, int x, int z, double step)
        {
            double dx = x - monster.X;
            double dz = z - monster.Z;
            double distance = Math.Sqrt((dx * dx) + (dz * dz));
            if ((distance == 0) || (step <= 0))
            {
                return step;
            }

            int nextX = x;
            int nextZ = z;
            if (distance > step)
            {
                nextX = monster.X + (int)Math.Round(dx / distance * step);
                nextZ = monster.Z + (int)Math.Round(dz / distance * step);
            }

            if (!_field.CanWalkLine(monster.X, monster.Z, nextX, nextZ, Walker.Monster))
            {
                return 0;
            }

            Face(monster, dx, dz);
            Place(monster, nextX, nextZ);
            return distance > step ? 0 : step - distance;
        }

        private void Place(Monster monster, int x, int z)
        {
            monster.X = x;
            monster.Z = z;
            monster.Moved = true;
            _grid.Moved(monster);
        }

        /// <summary>
        /// 방향을 (dx, dz) 쪽으로 돌린다(yaw 0이 +z, 시계 방향). 바뀌었을 때만 움직임으로 알린다.
        /// </summary>
        private static void Face(Monster monster, double dx, double dz)
        {
            if ((dx == 0) && (dz == 0))
            {
                return;
            }

            uint yaw = Units.YawOf(dx, dz);
            if (yaw != monster.Yaw)
            {
                monster.Yaw = yaw;
                monster.Moved = true;
            }
        }

        private static int ToUnits(double meters)
        {
            return (int)Math.Round(meters * Units.PerMeter);
        }

        private static long DistanceSquared(int ax, int az, int bx, int bz)
        {
            long dx = ax - bx;
            long dz = az - bz;
            return (dx * dx) + (dz * dz);
        }

        private static long Square(long value)
        {
            return value * value;
        }
    }
}
