using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 서버가 옮기는 직선 발사체(83. 발사체의 속도가 있는 스킬). 전투 차례에서 스킬의 결과 대신 나가고, 틱마다 그 틱에 옮긴 선분에서
    /// 처음 닿는 적에게 26의 단일 피해와 같은 결과를 준 뒤 사라진다. 벽, 사거리의 끝, 쏜 쪽의 죽음·기절·나감에서도 맞히지 않고 사라진다.
    /// 대상을 따라가는 발사체(기본 공격)는 옮기지 않는다(24). 발사체는 개체가 아니어서 EntityTable과 시야에 넣지 않는다.
    /// </summary>
    internal sealed class ProjectileSystem
    {
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly FieldMap _field;
        private readonly GameData _data;
        private readonly TickEvents _events;
        private readonly CombatSystem _combat;
        private readonly EffectSystem _effects;
        private readonly PkSystem _pk;
        private readonly int _maxRadius;

        /// <summary>
        /// 직선 발사체가 플레이어에 닿는 반지름(1/32 m, 44). Constants의 플레이어 반지름이다.
        /// </summary>
        private readonly double _playerRadius;
        private readonly List<Flying> _flying = new List<Flying>();
        private readonly List<Entity> _query = new List<Entity>();
        private uint _lastId;

        public ProjectileSystem(EntityTable entities, Grid grid, FieldMap field, GameData data, TickEvents events, CombatSystem combat, EffectSystem effects, PkSystem pk)
        {
            _pk = pk;
            _entities = entities;
            _grid = grid;
            _field = field;
            _data = data;
            _events = events;
            _combat = combat;
            _effects = effects;
            _playerRadius = data.Constants.PlayerRadius * Units.PerMeter;
            _maxRadius = (int)Math.Ceiling(Math.Max(data.Constants.PlayerRadius, data.MaxMonsterRadius) * Units.PerMeter);
        }

        /// <summary>
        /// 날고 있는 발사체 수(테스트가 본다).
        /// </summary>
        public int Count => _flying.Count;

        /// <summary>
        /// 날고 있는 발사체 하나. 자리는 나간 자리와 틱에서 계산해(밀린 틱도 같은 식) 클라이언트가 그리는 식과 같다.
        /// </summary>
        private sealed class Flying
        {
            public required uint Id { get; init; }
            public required Creature Caster { get; init; }
            public required ulong Generation { get; init; }
            public required SkillsRow Skill { get; init; }

            /// <summary>
            /// 쏜 UseSkill의 강제 공격 표시(44). 있을 때만 플레이어에 닿는다.
            /// </summary>
            public required bool Force { get; init; }
            public required int StartX { get; init; }
            public required int StartZ { get; init; }
            public required uint LaunchTick { get; init; }
            public required double DirectionX { get; init; }
            public required double DirectionZ { get; init; }
            public required double UnitsPerTick { get; init; }
            public required double Range { get; init; }
            public uint LastTick { get; set; }

            /// <summary>
            /// 그 틱에 나간 자리에서 날아간 거리(좌표 단위). 사거리를 넘지 않는다.
            /// </summary>
            public double Traveled(uint tick)
            {
                return Math.Min(Range, UnitsPerTick * (tick - LaunchTick));
            }
        }

        /// <summary>
        /// 쏜 쪽의 자리에서 발사체를 낸다(나간 틱에는 옮기지 않음). 방향은 실려 온 대상이 살아 있으면 그 틱의 대상 쪽, 아니면 쏜 쪽이 보는 쪽이다.
        /// 쏜 쪽이 그대로이고 살아 있으며 기절하지 않은 것은 부르는 쪽(예약한 일의 세대 번호)이 봤다.
        /// </summary>
        public void Launch(Creature caster, SkillsRow skill, uint targetId, bool force, uint tick)
        {
            uint yaw = caster.Yaw;
            if ((_entities.Find(targetId) is Creature { Dead: false } target) && (target != caster) && ((target.X != caster.X) || (target.Z != caster.Z)))
            {
                yaw = Units.YawOf(target.X - caster.X, target.Z - caster.Z);
            }

            uint speed = (uint)Math.Round(skill.ProjectileSpeed * Units.PerMeter);
            (double x, double z) = Units.Direction(yaw);
            var flying = new Flying
            {
                Id = ++_lastId,
                Caster = caster,
                Generation = caster.StrikeGeneration,
                Skill = skill,
                Force = force,
                StartX = caster.X,
                StartZ = caster.Z,
                LaunchTick = tick,
                DirectionX = x,
                DirectionZ = z,
                UnitsPerTick = (double)speed / Units.TicksPerSecond,
                Range = skill.Range * Units.PerMeter,
                LastTick = tick,
            };
            _flying.Add(flying);
            _events.ProjectileLaunched(caster, new ProjectileLaunched
            {
                Id = flying.Id, CasterId = caster.Id, X = caster.X, Z = caster.Z, Tick = tick, Yaw = yaw, Speed = speed,
            });
        }

        /// <summary>
        /// 전투 차례: 나간 차례대로 발사체를 지난번 틱의 자리에서 이 틱의 자리로 옮긴다(틱이 밀리면 그만큼 더 감). 그 선분에서 처음 닿는 적이 있고
        /// 거기까지 벽이 없으면 맞히고, 벽이 있으면 맞히지 않고 사라진다. 사거리 끝에 닿았거나 쏜 쪽이 죽거나 기절하거나 월드에서 빠졌으면 사라진다.
        /// </summary>
        public void Step(uint tick)
        {
            int kept = 0;
            for (int index = 0; index < _flying.Count; index++)
            {
                Flying flying = _flying[index];
                if ((flying.LastTick == tick) || !Move(flying, tick))
                {
                    _flying[kept++] = flying;
                }
            }

            _flying.RemoveRange(kept, _flying.Count - kept);
        }

        /// <summary>
        /// 한 틱 치를 옮긴다. 끝났으면 true(끝 사건을 냄).
        /// </summary>
        private bool Move(Flying flying, uint tick)
        {
            Creature caster = flying.Caster;
            bool inWorld = _entities.Find(caster.Id) == caster;
            if (!inWorld || caster.Dead || (caster.StrikeGeneration != flying.Generation))
            {
                // 월드에서 빠진 쪽의 발사체는 받은 연결이 그 개체의 EntitiesLeave로 지운다.
                if (inWorld)
                {
                    _events.ProjectileEnded(caster, flying.Id);
                }

                return true;
            }

            double from = flying.Traveled(flying.LastTick);
            double to = flying.Traveled(tick);
            flying.LastTick = tick;
            double ax = flying.StartX + (flying.DirectionX * from);
            double az = flying.StartZ + (flying.DirectionZ * from);
            double bx = flying.StartX + (flying.DirectionX * to);
            double bz = flying.StartZ + (flying.DirectionZ * to);
            (Creature? hit, double t) = FirstEnemy(caster, flying.Force, ax, az, bx, bz);
            double endX = ax + ((bx - ax) * t);
            double endZ = az + ((bz - az) * t);
            if (!_field.HasLine((int)Math.Round(ax), (int)Math.Round(az), (int)Math.Round(endX), (int)Math.Round(endZ)))
            {
                _events.ProjectileEnded(caster, flying.Id);
                return true;
            }

            if (hit != null)
            {
                _pk.Attacked(caster, hit, tick);
                _combat.Hit(caster, hit, flying.Skill.Coefficient, tick);
                if (flying.Skill.HasEffect && !hit.Dead)
                {
                    _effects.Apply(hit, _data.Effect(flying.Skill.Effect), tick);
                }

                _events.ProjectileEnded(caster, flying.Id);
                return true;
            }

            if (to >= flying.Range)
            {
                _events.ProjectileEnded(caster, flying.Id);
                return true;
            }

            return false;
        }

        /// <summary>
        /// 선분 a→b가 원에 처음 닿는 점이 a에서 가장 가까운 적(살아 있고 CanAttack이 참이고 복귀 중이 아닌 몬스터, 강제 공격 표시가 있으면 CanAttack이 참인 플레이어도. 44)과 그 점의 비율(0–1).
        /// 원의 가장자리에 닿기만 해도 맞는다. 없으면 (null, 1)이다. 같은 비율이면 격자의 차례(같은 상태면 같은 답)에서 먼저인 것이다.
        /// </summary>
        private (Creature? Hit, double T) FirstEnemy(Creature caster, bool force, double ax, double az, double bx, double bz)
        {
            double dx = bx - ax;
            double dz = bz - az;
            double length = Math.Sqrt((dx * dx) + (dz * dz));
            int centerX = (int)Math.Round((ax + bx) / 2);
            int centerZ = (int)Math.Round((az + bz) / 2);
            _grid.Query(centerX, centerZ, (int)Math.Ceiling(length / 2) + _maxRadius + 1, entity => (entity is Monster) || (force && (entity is Player)), _query);
            Creature? best = null;
            double bestT = 1;
            foreach (Entity entity in _query)
            {
                var target = (Creature)entity;
                if (target.Dead || (target == caster) || !_combat.CanAttack(caster, target) || CombatSystem.IsReturning(target))
                {
                    continue;
                }

                double radius = target is Monster monster ? monster.Template.Radius * Units.PerMeter : _playerRadius;
                double t = FirstTouch(ax, az, dx, dz, target.X, target.Z, radius);
                if ((t >= 0) && ((best == null) || (t < bestT)))
                {
                    best = target;
                    bestT = t;
                }
            }

            return (best, bestT);
        }

        /// <summary>
        /// 선분(a에서 (dx, dz)만큼)이 중심 c, 반지름 r의 원에 처음 닿는 비율(0–1). a가 원 안이면 0, 닿지 않으면 -1이다.
        /// </summary>
        internal static double FirstTouch(double ax, double az, double dx, double dz, double cx, double cz, double radius)
        {
            double fx = ax - cx;
            double fz = az - cz;
            double c = (fx * fx) + (fz * fz) - (radius * radius);
            if (c <= 0)
            {
                return 0;
            }

            double a = (dx * dx) + (dz * dz);
            double b = 2 * ((fx * dx) + (fz * dz));
            double discriminant = (b * b) - (4 * a * c);
            if ((a == 0) || (discriminant < 0))
            {
                return -1;
            }

            double t = (-b - Math.Sqrt(discriminant)) / (2 * a);
            return (t >= 0) && (t <= 1) ? t : -1;
        }
    }
}
