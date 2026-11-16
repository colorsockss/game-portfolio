using System;
using System.Collections.Generic;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 시야 칸(32 m)마다 그 안의 개체. 개체는 Cell에 자기 칸을 기억하고, 칸을 옮길 때만 목록을 바꾼다.
    /// 시야, 원 안의 개체 찾기(Query), 둘레 칸 보기가 모두 이 격자를 쓴다.
    /// </summary>
    public sealed class Grid
    {
        /// <summary>
        /// 시야 칸 한 변의 크기를 2의 지수로 적은 것. 2^10칸 = 32 m이고, 둘레 3×3칸(96 m 사방)이 보인다.
        /// </summary>
        private const int CellShift = 10;

        private readonly Dictionary<long, List<Entity>> _cells = new Dictionary<long, List<Entity>>();

        /// <summary>
        /// 이 틱에 시야 칸마다 들어오거나 나간 개체(52: 새로 놓임, 칸을 옮김, 월드에서 빠짐. 옮긴 개체는 두 칸 모두에 든다). 시야 차례가 끝나면 비운다.
        /// </summary>
        private readonly Dictionary<long, List<Entity>> _touched = new Dictionary<long, List<Entity>>();
        private readonly List<List<Entity>> _touchedLists = new List<List<Entity>>();
        private readonly Stack<List<Entity>> _freeLists = new Stack<List<Entity>>();

        /// <summary>
        /// 개체를 지금 위치의 칸에 넣는다.
        /// </summary>
        public void Add(Entity entity)
        {
            entity.Cell = CellOf(entity.X, entity.Z);
            CellEntities(entity.Cell).Add(entity);
            Touch(entity.Cell, entity);
        }

        public void Remove(Entity entity)
        {
            _cells[entity.Cell].Remove(entity);
            Touch(entity.Cell, entity);
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
                Touch(entity.Cell, entity);
                CellEntities(cell).Add(entity);
                entity.Cell = cell;
                Touch(cell, entity);
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
        /// 칸 둘레 3×3칸에서 이 틱에 들어오거나 나간 개체를 result에 더한다(52. 같은 개체가 여러 번 들 수 있음).
        /// </summary>
        public void CollectTouchedAround(long cell, List<Entity> result)
        {
            int cellX = (int)(cell >> 32);
            int cellZ = (int)cell;
            for (int offsetX = -1; offsetX <= 1; offsetX++)
            {
                for (int offsetZ = -1; offsetZ <= 1; offsetZ++)
                {
                    if (_touched.TryGetValue(CellKey(cellX + offsetX, cellZ + offsetZ), out List<Entity>? entities))
                    {
                        result.AddRange(entities);
                    }
                }
            }
        }

        /// <summary>
        /// 이 틱의 들고 난 목록을 비운다(시야 차례 끝. 52). 목록은 다시 쓴다.
        /// </summary>
        public void ClearTouched()
        {
            foreach (List<Entity> list in _touchedLists)
            {
                list.Clear();
                _freeLists.Push(list);
            }

            _touchedLists.Clear();
            _touched.Clear();
        }

        /// <summary>
        /// 두 칸이 서로의 둘레 3×3칸 안인가(파티의 경험치 42).
        /// </summary>
        public static bool Near(long a, long b)
        {
            return (Math.Abs((int)(a >> 32) - (int)(b >> 32)) <= 1) && (Math.Abs((int)a - (int)b) <= 1);
        }

        /// <summary>
        /// 칸 둘레 3×3칸에 플레이어가 있는가(몬스터의 배회. 재우는 판단은 56).
        /// </summary>
        public bool HasPlayerAround(long cell)
        {
            int cellX = (int)(cell >> 32);
            int cellZ = (int)cell;
            for (int offsetX = -1; offsetX <= 1; offsetX++)
            {
                for (int offsetZ = -1; offsetZ <= 1; offsetZ++)
                {
                    if (_cells.TryGetValue(CellKey(cellX + offsetX, cellZ + offsetZ), out List<Entity>? entities) && entities.Exists(entity => entity.Kind == Contract.EntityKind.Player))
                    {
                        return true;
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// 중심에서 radius(좌표 단위) 안(경계 포함)이고 filter를 만족하는 개체를 result에 담는다. result는 먼저 비운다(질의마다 할당하지 않도록 부르는 쪽이 목록을 다시 씀).
        /// 원이 걸친 시야 칸(중심 ± 반지름의 사각형)만 돌고, 칸 안에서는 거리의 제곱을 반지름의 제곱과 견준다. 거리만 보므로 벽 너머의 개체도 들고,
        /// 거르는 것은 부르는 쪽이 후보마다 FieldMap.HasLine으로 한다. 차례는 칸(x, z의 차례) 안의 목록 차례라 같은 상태면 같은 결과다.
        /// </summary>
        public void Query(int centerX, int centerZ, int radius, Predicate<Entity> filter, List<Entity> result)
        {
            result.Clear();
            long radiusSquared = (long)radius * radius;
            int lastX = (centerX + radius) >> CellShift;
            int lastZ = (centerZ + radius) >> CellShift;
            for (int cellX = (centerX - radius) >> CellShift; cellX <= lastX; cellX++)
            {
                for (int cellZ = (centerZ - radius) >> CellShift; cellZ <= lastZ; cellZ++)
                {
                    if (!_cells.TryGetValue(CellKey(cellX, cellZ), out List<Entity>? entities))
                    {
                        continue;
                    }

                    foreach (Entity entity in entities)
                    {
                        long dx = entity.X - centerX;
                        long dz = entity.Z - centerZ;
                        if ((dx * dx) + (dz * dz) <= radiusSquared && filter(entity))
                        {
                            result.Add(entity);
                        }
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

        private void Touch(long cell, Entity entity)
        {
            if (!_touched.TryGetValue(cell, out List<Entity>? list))
            {
                list = _freeLists.Count > 0 ? _freeLists.Pop() : new List<Entity>();
                _touched.Add(cell, list);
                _touchedLists.Add(list);
            }

            list.Add(entity);
        }
    }
}
