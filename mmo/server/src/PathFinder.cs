using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// FieldMap의 1 m 칸에서 A*로 벽을 돌아가는 길을 찾는다(몬스터, 뒤에 경비병과 소환수). 8방향으로 가고, 대각선으로는 양옆 두 칸이
    /// 모두 열려 있을 때만 간다. 휴리스틱은 옥타일 거리(곧게 10, 대각선 14)다. 걷는 쪽에게 걸을 수 있는 칸만 지나고, 찾은 길은
    /// 같은 걷는 쪽의 CanWalkLine이 트인 구간을 합쳐 꺾이는 점의 목록으로 줄인다.
    /// 살피는 범위(중심과 반지름) 안의 칸만 보아 한 번이 보는 칸 수에 끝이 있다. 버퍼는 범위를 담는 정사각형만큼 가지고 다시 쓴다.
    /// 길은 길이가 같아도 클라이언트와 다를 수 있다. 같아야 하는 것은 길이 있는지와 구간마다의 선 검사다(비교 벡터 paths.tsv).
    /// 틱 스레드에서만 쓴다.
    /// </summary>
    public sealed class PathFinder
    {
        private const int StraightCost = 10;
        private const int DiagonalCost = 14;

        private static readonly (int X, int Z)[] s_directions =
        {
            (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1),
        };

        private readonly FieldMap _field;

        /// <summary>
        /// 열린 목록(Priority). 꺼낸 칸이 이미 닫혔으면 건너뛴다.
        /// </summary>
        private readonly PriorityQueue<int, long> _open = new PriorityQueue<int, long>();

        /// <summary>
        /// 출발에서 도착까지 이은 점(줄이기 전).
        /// </summary>
        private readonly List<(int X, int Z)> _points = new List<(int X, int Z)>();

        /// <summary>
        /// 범위의 정사각형 안의 칸마다: 이번 찾기에서 본 표시(_stamp와 같으면 봄), 닫힌 표시, 지금까지의 비용, 온 칸.
        /// </summary>
        private int[] _seen = Array.Empty<int>();
        private int[] _closed = Array.Empty<int>();
        private int[] _cost = Array.Empty<int>();
        private int[] _parent = Array.Empty<int>();
        private int _stamp;

        public PathFinder(FieldMap field)
        {
            _field = field;
        }

        /// <summary>
        /// 지난 찾기에서 닫은 칸 수(측정과 테스트용).
        /// </summary>
        public int ClosedCells { get; private set; }

        /// <summary>
        /// from에서 to까지의 길을 찾아 path에 꺾이는 점(출발은 빼고 도착을 넣음, 1/32 m)을 담는다. 걷는 쪽에게 출발이나 도착의 칸이
        /// 막혔거나, 둘 가운데 하나가 범위 밖이거나, 범위 안의 칸만으로 이어지지 않으면 false다.
        /// 범위는 칸의 가운데가 center에서 radius(1/32 m) 안인 칸이다.
        /// </summary>
        public bool Find(int fromX, int fromZ, int toX, int toZ, Walker walker, int centerX, int centerZ, int radius, List<(int X, int Z)> path)
        {
            path.Clear();
            ClosedCells = 0;
            int minX = FieldMap.CellOf(centerX - radius);
            int minZ = FieldMap.CellOf(centerZ - radius);
            int side = Math.Max(FieldMap.CellOf(centerX + radius) - minX, FieldMap.CellOf(centerZ + radius) - minZ) + 1;
            long radiusSquared = (long)radius * radius;
            bool InRange(int cellX, int cellZ)
            {
                long dx = ((long)cellX * Units.PerMeter) + (Units.PerMeter / 2) - centerX;
                long dz = ((long)cellZ * Units.PerMeter) + (Units.PerMeter / 2) - centerZ;
                return (cellX >= minX) && (cellZ >= minZ) && (cellX < minX + side) && (cellZ < minZ + side) && ((dx * dx) + (dz * dz) <= radiusSquared);
            }

            int startX = FieldMap.CellOf(fromX);
            int startZ = FieldMap.CellOf(fromZ);
            int goalX = FieldMap.CellOf(toX);
            int goalZ = FieldMap.CellOf(toZ);
            if (!InRange(startX, startZ) || !InRange(goalX, goalZ) || !_field.CanWalkCell(startX, startZ, walker) || !_field.CanWalkCell(goalX, goalZ, walker))
            {
                return false;
            }

            Prepare(side * side);
            int goal = ((goalZ - minZ) * side) + (goalX - minX);
            int start = ((startZ - minZ) * side) + (startX - minX);
            Open(start, -1, 0, Priority(0, Heuristic(startX, startZ, goalX, goalZ)));
            while (_open.TryDequeue(out int current, out _))
            {
                if (_closed[current] == _stamp)
                {
                    continue;
                }

                _closed[current] = _stamp;
                ClosedCells++;
                if (current == goal)
                {
                    Smooth(fromX, fromZ, toX, toZ, walker, side, minX, minZ, goal, path);
                    return true;
                }

                int cellX = minX + (current % side);
                int cellZ = minZ + (current / side);
                foreach ((int dx, int dz) in s_directions)
                {
                    int nextX = cellX + dx;
                    int nextZ = cellZ + dz;
                    bool diagonal = (dx != 0) && (dz != 0);
                    if (!InRange(nextX, nextZ) || !_field.CanWalkCell(nextX, nextZ, walker)
                        || (diagonal && (!_field.CanWalkCell(cellX + dx, cellZ, walker) || !_field.CanWalkCell(cellX, cellZ + dz, walker))))
                    {
                        continue;
                    }

                    int next = ((nextZ - minZ) * side) + (nextX - minX);
                    int cost = _cost[current] + (diagonal ? DiagonalCost : StraightCost);
                    if ((_closed[next] != _stamp) && ((_seen[next] != _stamp) || (cost < _cost[next])))
                    {
                        Open(next, current, cost, Priority(cost, Heuristic(nextX, nextZ, goalX, goalZ)));
                    }
                }
            }

            return false;
        }

        /// <summary>
        /// 옥타일 거리(곧게 10, 대각선 14).
        /// </summary>
        private static int Heuristic(int fromX, int fromZ, int toX, int toZ)
        {
            int dx = Math.Abs(toX - fromX);
            int dz = Math.Abs(toZ - fromZ);
            return (StraightCost * Math.Max(dx, dz)) + ((DiagonalCost - StraightCost) * Math.Min(dx, dz));
        }

        /// <summary>
        /// 열린 목록의 우선순위. (비용 + 휴리스틱)이 같으면 비용이 큰(도착에 가까운) 칸을 먼저 꺼낸다. 빈 들판에서는 같은 값의 칸이 많아
        /// 이 순서가 없으면 넓게 퍼진다. 꺼내는 순서만 바뀌어 길의 비용은 같다.
        /// </summary>
        private static long Priority(int cost, int estimate)
        {
            return (((long)cost + estimate) << 32) - cost;
        }

        private static int Center(int cell)
        {
            return (cell * Units.PerMeter) + (Units.PerMeter / 2);
        }

        /// <summary>
        /// 이번 찾기의 버퍼를 준비한다. 표시는 번호를 올려 지우고, 번호가 끝에 닿으면 배열을 비운다.
        /// </summary>
        private void Prepare(int cells)
        {
            if (_seen.Length < cells)
            {
                _seen = new int[cells];
                _closed = new int[cells];
                _cost = new int[cells];
                _parent = new int[cells];
                _stamp = 0;
            }

            if (_stamp == int.MaxValue)
            {
                Array.Clear(_seen);
                Array.Clear(_closed);
                _stamp = 0;
            }

            _stamp++;
            _open.Clear();
        }

        private void Open(int cell, int parent, int cost, long priority)
        {
            _seen[cell] = _stamp;
            _cost[cell] = cost;
            _parent[cell] = parent;
            _open.Enqueue(cell, priority);
        }

        /// <summary>
        /// 출발 → 출발 칸의 가운데 → 지난 칸들의 가운데 → 도착을 잇고, 앞 점에서 곧게 갈 수 있는 가장 먼 점만 남긴다.
        /// 이웃한 칸의 가운데끼리는 늘 트여 있고(대각선은 양옆이 열린 것만 지남) 점과 그 칸의 가운데도 한 칸 안이라, 남긴 구간은 모두 트인다.
        /// </summary>
        private void Smooth(int fromX, int fromZ, int toX, int toZ, Walker walker, int side, int minX, int minZ, int goal, List<(int X, int Z)> path)
        {
            _points.Clear();
            _points.Add((toX, toZ));
            for (int cell = goal; cell != -1; cell = _parent[cell])
            {
                _points.Add((Center(minX + (cell % side)), Center(minZ + (cell / side))));
            }

            _points.Add((fromX, fromZ));
            _points.Reverse();

            int anchor = 0;
            while (anchor < _points.Count - 1)
            {
                int last = anchor + 1;
                while ((last + 1 < _points.Count)
                    && _field.CanWalkLine(_points[anchor].X, _points[anchor].Z, _points[last + 1].X, _points[last + 1].Z, walker))
                {
                    last++;
                }

                path.Add(_points[last]);
                anchor = last;
            }
        }
    }
}
