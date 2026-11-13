using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 시야 칸(32 m)마다 그 안의 개체. 개체는 Cell에 자기 칸을 기억하고, 칸을 옮길 때만 목록을 바꾼다.
    /// </summary>
    internal sealed class Grid
    {
        /// <summary>
        /// 시야 칸 한 변의 크기를 2의 지수로 적은 것. 2^10칸 = 32 m이고, 둘레 3×3칸(96 m 사방)이 보인다.
        /// </summary>
        private const int CellShift = 10;

        private readonly Dictionary<long, List<Entity>> _cells = new Dictionary<long, List<Entity>>();

        /// <summary>
        /// 개체를 지금 위치의 칸에 넣는다.
        /// </summary>
        public void Add(Entity entity)
        {
            entity.Cell = CellOf(entity.X, entity.Z);
            CellEntities(entity.Cell).Add(entity);
        }

        public void Remove(Entity entity)
        {
            _cells[entity.Cell].Remove(entity);
        }

        /// <summary>
        /// 개체가 움직였다. 칸이 바뀌었으면 옮긴다.
        /// </summary>
        public void Moved(Entity entity)
        {
            long cell = CellOf(entity.X, entity.Z);
            if (cell != entity.Cell)
            {
                _cells[entity.Cell].Remove(entity);
                CellEntities(cell).Add(entity);
                entity.Cell = cell;
            }
        }

        /// <summary>
        /// 칸 둘레 3×3칸의 개체를 result에 더한다.
        /// </summary>
        public void CollectAround(long cell, HashSet<Entity> result)
        {
            int cellX = (int)(cell >> 32);
            int cellZ = (int)cell;
            for (int offsetX = -1; offsetX <= 1; offsetX++)
            {
                for (int offsetZ = -1; offsetZ <= 1; offsetZ++)
                {
                    if (_cells.TryGetValue(CellKey(cellX + offsetX, cellZ + offsetZ), out List<Entity>? entities))
                    {
                        result.UnionWith(entities);
                    }
                }
            }
        }

        /// <summary>
        /// 칸의 개체 목록. 없으면 만든다.
        /// </summary>
        private List<Entity> CellEntities(long cell)
        {
            if (!_cells.TryGetValue(cell, out List<Entity>? entities))
            {
                entities = new List<Entity>();
                _cells.Add(cell, entities);
            }

            return entities;
        }

        /// <summary>
        /// 좌표가 든 칸의 키. 산술 시프트라 음수 좌표도 아래로 내린다.
        /// </summary>
        private static long CellOf(int x, int z)
        {
            return CellKey(x >> CellShift, z >> CellShift);
        }

        /// <summary>
        /// 칸 번호 두 개를 키 하나로 묶는다.
        /// </summary>
        private static long CellKey(int cellX, int cellZ)
        {
            return ((long)cellX << 32) | (uint)cellZ;
        }
    }
}
