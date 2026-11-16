using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터와 경비병(44)의 상태(틱의 셋째 차례): 인식, 대상 고르기, 추적, 공격 자리에 서기, 복귀, 배회. 치는 것은 24, 죽음은 25가 더한다.
    /// "걷는 선"은 그 개체의 걷는 쪽의 FieldMap.CanWalkLine, "선"은 FieldMap.HasLine이다. 몬스터 쪽의 걷는 선과 길찾기는 안전 지대의 칸을 지나지 않으므로
    /// 몬스터는 안전 지대에 들어가지 않고, 플레이어 쪽으로 걷는 경비병은 들어간다.
    /// </summary>
    internal sealed class AiSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly Scheduler _scheduler;
        private readonly PartySystem _party;
        private readonly Random _random;
        private readonly PathFinder _paths;
        private readonly List<Monster> _monsters = new List<Monster>();
        private readonly List<Guard> _guards = new List<Guard>();
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

        /// <summary>
        /// 보스의 범위 공격(43). 추적·공격 상태에서 건다.
        /// </summary>
        public BossSystem? Bosses { get; set; }

        public AiSystem(EntityTable entities, Grid grid, FieldMap field, Scheduler scheduler, GameData data, Random random, PartySystem party)
        {
            _entities = entities;
            _grid = grid;
            _field = field;
            _scheduler = scheduler;
            _party = party;
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

        /// <summary>
        /// 경비병을 더한다(서버가 뜰 때. 빠지지 않음).
        /// </summary>
        public void Add(Guard guard)
        {
            _guards.Add(guard);
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

            foreach (Guard guard in _guards)
            {
                Think(guard, tick, elapsedTicks);
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
            double step = Step(monster, elapsedTicks);
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

            uint? targetId = monster.Damage.Pick(id => Selectable(monster, id), _party.SideOf);
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
                Bosses?.TryArea(monster, target, tick);
                return;
            }

            monster.State = MonsterState.Chase;
            if (!Chase(monster, target, step, range))
            {
                // 길이 없으면 그 대상을 5초 동안 건너뛴다.
                MarkUnreachable(monster, target.Id, tick);
                return;
            }

            Bosses?.TryArea(monster, target, tick);
        }

        /// <summary>
        /// 경비병(44): 대기 중에는 놓인 점에 서서 인식 범위 안이고 선이 트인 살아 있는 플레이어 가운데 선공 표시가 있거나 무법자인 것(안전 지대 안도)을
        /// 고르고(가장 가까운 쪽, 거리가 같으면 개체 번호가 작은 쪽), 쫓는 동안에는 바꾸지 않는다. 놓인 점에서 추적 한계보다 멀어지거나, 대상이 죽거나
        /// 월드에서 빠지거나 일반 플레이어로 돌아오거나, 추적 한계 안에 길이 없으면 복귀하고, 놓인 점에 닿아 대기로 돌아오면 다시 인식한다.
        /// </summary>
        private void Think(Guard guard, uint tick, uint elapsedTicks)
        {
            double step = Step(guard, elapsedTicks);
            guard.AttackTarget = 0;
            if (guard.State == MonsterState.Return)
            {
                Return(guard, step, false);
                return;
            }

            if ((guard.Target == 0) && guard.Detect.Due(tick))
            {
                guard.Target = Nearest(guard);
            }

            if (guard.Target == 0)
            {
                guard.State = MonsterState.Idle;
                return;
            }

            bool far = DistanceSquared(guard.X, guard.Z, guard.Home.X, guard.Home.Z) > Square(ToUnits(guard.Template.ChaseLimit));
            if (far || (_entities.Find(guard.Target) is not Player { Dead: false } target) || PkSystem.IsNormal(target))
            {
                StartReturn(guard);
                Return(guard, step, false);
                return;
            }

            int range = ToUnits(guard.Template.AttackRange);
            if ((DistanceSquared(guard.X, guard.Z, target.X, target.Z) <= Square(range)) && _field.HasLine(guard.X, guard.Z, target.X, target.Z))
            {
                guard.State = MonsterState.Attack;
                guard.AttackTarget = target.Id;
                guard.Path.Clear();
                Face(guard, target.X - guard.X, target.Z - guard.Z);
                return;
            }

            guard.State = MonsterState.Chase;
            if (!Chase(guard, target, step, range))
            {
                StartReturn(guard);
                Return(guard, step, false);
            }
        }

        /// <summary>
        /// 경비병이 쫓을 플레이어(없으면 0).
        /// </summary>
        private uint Nearest(Guard guard)
        {
            _grid.Query(guard.X, guard.Z, ToUnits(guard.Template.DetectRange), entity => entity is Player { Dead: false } player && !PkSystem.IsNormal(player), _query);
            uint best = 0;
            long bestDistance = long.MaxValue;
            foreach (Entity player in _query)
            {
                long distance = DistanceSquared(guard.X, guard.Z, player.X, player.Z);
                if (((distance < bestDistance) || ((distance == bestDistance) && (player.Id < best))) && _field.HasLine(guard.X, guard.Z, player.X, player.Z))
                {
                    best = player.Id;
                    bestDistance = distance;
                }
            }

            return best;
        }

        /// <summary>
        /// 이번 틱에 걷는 거리(1/32 m): 이동 속도에서 감속을 빼고 지난 틱 수를 곱한다.
        /// </summary>
        private static double Step(AiCreature mob, uint elapsedTicks)
        {
            return mob.Template.Speed * (100 - mob.SlowPercent) / 100 * Units.PerMeter / Units.TicksPerSecond * elapsedTicks;
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
        /// 대상이 길을 찾은 때의 자리에서 다시 찾는 거리를 넘게 옮기기 전에는 그 길을 쓴다. 길이 없으면 false다(몬스터는 대상을 건너뛰고 경비병은 복귀).
        /// </summary>
        private bool Chase(AiCreature mob, Player target, double step, int range)
        {
            if (_field.CanWalkLine(mob.X, mob.Z, target.X, target.Z, mob.WalkerKind))
            {
                mob.Path.Clear();
                // 사거리의 끝에 서면 반올림으로 사거리 밖과 안을 오가므로 0.25 m 안쪽까지 간다.
                double distance = Math.Sqrt(DistanceSquared(mob.X, mob.Z, target.X, target.Z));
                MoveToward(mob, target.X, target.Z, Math.Min(step, Math.Max(0, distance - range + (Units.PerMeter / 4.0))));
                return true;
            }

            bool stale = (mob.PathIndex >= mob.Path.Count)
                || (DistanceSquared(target.X, target.Z, mob.PathGoal.X, mob.PathGoal.Z) > Square(_repathDistance));
            if (stale)
            {
                if (!_paths.Find(mob.X, mob.Z, target.X, target.Z, mob.WalkerKind, mob.Home.X, mob.Home.Z, ToUnits(mob.Template.ChaseLimit), mob.Path))
                {
                    mob.Path.Clear();
                    return false;
                }

                mob.PathIndex = 0;
                mob.PathGoal = (target.X, target.Z);
            }

            FollowPath(mob, step);
            return true;
        }

        private void MarkUnreachable(Monster monster, uint playerId, uint tick)
        {
            monster.Path.Clear();
            ref ulong generation = ref CollectionsMarshal.GetValueRefOrAddDefault(monster.Unreachable, playerId, out _);
            _scheduler.Add(tick + _unreachableTicks, ScheduledKind.UnreachableEnd, monster.Id, playerId, 0, ref generation);
        }

        /// <summary>
        /// 복귀를 시작한다: 길을 비우고, 몬스터는 피해 표를 비우고 걸린 범위 공격을 버리며, 경비병은 대상을 놓는다.
        /// </summary>
        private static void StartReturn(AiCreature mob)
        {
            mob.State = MonsterState.Return;
            mob.Path.Clear();
            if (mob is Monster monster)
            {
                // 걸린 범위 공격(43)의 예약을 버린다. 이미 시작한 기본 공격의 타격은 그대로다.
                monster.AreaGeneration = 0;
                monster.Damage.Clear();
                monster.Wandering = false;
            }
            else if (mob is Guard guard)
            {
                guard.Target = 0;
            }
        }

        /// <summary>
        /// 놓인 점으로 간다. 걷는 선이 트였으면 곧게, 아니면 놓인 점에서 "지금 거리 + 여유" 안의 칸으로 찾은 길로 가고, 길이 없으면 순간 이동한다.
        /// 복귀하는 동안 1초마다 최대 체력의 일부가 차고(EntityVitals로 감), 놓인 점에 닿으면 대기로 돌아간다.
        /// </summary>
        private void Return(AiCreature mob, double step, bool regenerate)
        {
            if (regenerate)
            {
                mob.Restore((uint)((ulong)mob.MaxHp * _returnRegenPercent / 100), 0);
            }

            (int homeX, int homeZ) = mob.Home;
            if (_field.CanWalkLine(mob.X, mob.Z, homeX, homeZ, mob.WalkerKind))
            {
                mob.Path.Clear();
                MoveToward(mob, homeX, homeZ, step);
            }
            else
            {
                if (mob.PathIndex >= mob.Path.Count)
                {
                    int radius = (int)Math.Sqrt(DistanceSquared(mob.X, mob.Z, homeX, homeZ)) + _returnMargin;
                    if (!_paths.Find(mob.X, mob.Z, homeX, homeZ, mob.WalkerKind, homeX, homeZ, radius, mob.Path))
                    {
                        Place(mob, homeX, homeZ);
                        mob.Teleported = true;
                    }

                    mob.PathIndex = 0;
                }

                FollowPath(mob, step);
            }

            if ((mob.X == homeX) && (mob.Z == homeZ))
            {
                mob.State = MonsterState.Idle;
                mob.Path.Clear();
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
        private void FollowPath(AiCreature mob, double step)
        {
            while ((step > 0) && (mob.PathIndex < mob.Path.Count))
            {
                (int x, int z) = mob.Path[mob.PathIndex];
                double left = MoveToward(mob, x, z, step);
                if ((mob.X != x) || (mob.Z != z))
                {
                    return;
                }

                mob.PathIndex++;
                step = left;
            }
        }

        /// <summary>
        /// (x, z) 쪽으로 step(1/32 m)만큼 곧게 간다. 닿으면 그 자리에 서고 남은 거리를 낸다. 반올림한 다음 자리까지 걷는 선이 막히면 서 있는다.
        /// </summary>
        private double MoveToward(AiCreature monster, int x, int z, double step)
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

            if (!_field.CanWalkLine(monster.X, monster.Z, nextX, nextZ, monster.WalkerKind))
            {
                return 0;
            }

            Face(monster, dx, dz);
            Place(monster, nextX, nextZ);
            return distance > step ? 0 : step - distance;
        }

        private void Place(AiCreature monster, int x, int z)
        {
            monster.X = x;
            monster.Z = z;
            monster.Moved = true;
            _grid.Moved(monster);
        }

        /// <summary>
        /// 방향을 (dx, dz) 쪽으로 돌린다(yaw 0이 +z, 시계 방향). 바뀌었을 때만 움직임으로 알린다.
        /// </summary>
        private static void Face(AiCreature monster, double dx, double dz)
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
