using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 몬스터를 놓는다. 서버가 뜰 때 Spawns의 무리마다 놓인 점을 고르고 번호를 받아 몬스터를 하나씩 놓는다. 죽은 뒤의 리스폰 예약은 25가 넣는다.
    /// </summary>
    internal sealed class SpawnSystem
    {
        /// <summary>
        /// 흩는 점을 고르는 시도 수. 모두 막히면 무리의 자리에 놓는다.
        /// </summary>
        private const int ScatterTries = 20;

        private readonly GameData _data;
        private readonly FieldMap _field;
        private readonly EntityTable _entities;
        private readonly Grid _grid;
        private readonly AiSystem _ai;
        private readonly Scheduler _scheduler;
        private readonly Random _random;
        private readonly Dictionary<uint, PlacedPoint> _placed = new Dictionary<uint, PlacedPoint>();

        public SpawnSystem(GameData data, FieldMap field, EntityTable entities, Grid grid, AiSystem ai, Scheduler scheduler, Random random)
        {
            _data = data;
            _field = field;
            _entities = entities;
            _grid = grid;
            _ai = ai;
            _scheduler = scheduler;
            _random = random;
        }

        public Dictionary<uint, PlacedPoint>.ValueCollection Placed => _placed.Values;

        /// <summary>
        /// 번호의 놓인 점. 없으면 null.
        /// </summary>
        public PlacedPoint? PlacedAt(uint id)
        {
            return _placed.GetValueOrDefault(id);
        }

        /// <summary>
        /// 모든 무리를 놓는다. 놓인 점의 번호를 플레이어보다 먼저 받으므로 서버가 뜰 때(World를 만들 때) 한 번만 부른다.
        /// </summary>
        public void PlaceAll()
        {
            foreach (SpawnsRow spawn in _data.Spawns.Rows)
            {
                MonstersRow template = _data.Monster(spawn.MonsterId);
                // 무리의 자리(m)는 칸의 작은 모서리라 그 칸의 가운데에서 흩는다.
                int centerX = (spawn.X * Units.PerMeter) + (Units.PerMeter / 2);
                int centerZ = (spawn.Z * Units.PerMeter) + (Units.PerMeter / 2);
                for (uint i = 0; i < spawn.Count; i++)
                {
                    (int x, int z) = Scatter(centerX, centerZ, spawn.ScatterRadius * Units.PerMeter);
                    var placed = new PlacedPoint(_entities.ReservePlacedId(), x, z, spawn, template);
                    _placed.Add(placed.Id, placed);
                    Respawn(placed);
                }
            }
        }

        /// <summary>
        /// 놓인 점에 몬스터를 새로 놓는다: 가득 찬 체력, 대기 상태, 빈 피해 표. 번호는 놓인 점의 것이다. 같은 번호의 옛 몬스터가 아직 남아 있으면
        /// (다시 나오는 시간이 쓰러진 채 남는 시간보다 짧음) 먼저 뺀다.
        /// </summary>
        public Monster Respawn(PlacedPoint placed)
        {
            if (_entities.Find(placed.Id) is Monster old)
            {
                Despawn(old);
            }

            // 같은 번호의 옛 몬스터가 건 예약(타격, 사라짐)이 새 몬스터의 것으로 읽히지 않게 새 세대 번호로 시작한다.
            var monster = new Monster(placed) { StrikeGeneration = _scheduler.NewGeneration(), LifeGeneration = _scheduler.NewGeneration() };
            MonstersRow template = placed.Template;
            monster.SetStats(new Stats(template.MaxHp, 0, template.Attack, template.Defense));
            monster.Hp = monster.MaxHp;
            monster.VitalsChanged = false;
            _entities.Add(monster);
            _grid.Add(monster);
            _ai.Add(monster);
            return monster;
        }

        /// <summary>
        /// 몬스터를 월드에서 뺀다(죽은 몬스터가 사라짐). 다음 시야 차례에 받은 연결이 EntitiesLeave로 받는다.
        /// </summary>
        public void Despawn(Monster monster)
        {
            _entities.Remove(monster);
            _grid.Remove(monster);
            _ai.Remove(monster);
        }

        /// <summary>
        /// 무리의 자리에서 반경 안이고 몬스터가 곧게 걸어갈 수 있는 무작위 점(원 안에 고르게).
        /// </summary>
        private (int X, int Z) Scatter(int centerX, int centerZ, double radius)
        {
            for (int i = 0; i < ScatterTries; i++)
            {
                double angle = _random.NextDouble() * 2 * Math.PI;
                // 좌표를 반올림해도 반경을 넘지 않게 한 단위 안쪽까지만 고른다.
                double distance = Math.Max(0, radius - 1) * Math.Sqrt(_random.NextDouble());
                int x = centerX + (int)Math.Round(Math.Sin(angle) * distance);
                int z = centerZ + (int)Math.Round(Math.Cos(angle) * distance);
                if (_field.CanWalkLine(centerX, centerZ, x, z, Walker.Monster))
                {
                    return (x, z);
                }
            }

            return (centerX, centerZ);
        }
    }
}
