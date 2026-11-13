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
        private readonly Random _random;
        private readonly List<PlacedPoint> _placed = new List<PlacedPoint>();

        public SpawnSystem(GameData data, FieldMap field, EntityTable entities, Grid grid, AiSystem ai, Random random)
        {
            _data = data;
            _field = field;
            _entities = entities;
            _grid = grid;
            _ai = ai;
            _random = random;
        }

        public IReadOnlyList<PlacedPoint> Placed => _placed;

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
                    _placed.Add(placed);
                    Respawn(placed);
                }
            }
        }

        /// <summary>
        /// 놓인 점에 몬스터를 새로 놓는다: 가득 찬 체력, 대기 상태, 빈 피해 표. 번호는 놓인 점의 것이다.
        /// </summary>
        public Monster Respawn(PlacedPoint placed)
        {
            var monster = new Monster(placed);
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
