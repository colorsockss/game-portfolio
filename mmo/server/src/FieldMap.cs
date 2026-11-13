using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 칸을 걷는 쪽. 벽은 둘 다 걸을 수 없고, 몬스터에게는 안전 지대의 칸도 걸을 수 없는 칸이다.
    /// 경비병과 소환수는 플레이어 쪽이다.
    /// </summary>
    public enum Walker
    {
        Player,
        Monster,
    }

    /// <summary>
    /// 필드의 1 m 칸 격자. 칸마다 구역 번호와 벽인지를 가진다. 필드는 한 변 fieldSize m이고
    /// -fieldSize/2 이상 fieldSize/2 미만이다. 좌표(1/32 m) → 칸은 내림이라 음수 좌표도 한 칸에 하나씩 대응하고, 정확히 +fieldSize/2는
    /// 격자 밖이다. 구역은 Zones의 사각형을 줄의 차례대로 펴서 겹치면 뒤 줄이 이기고, 어느 사각형에도 들지 않는 칸과 격자 밖은 구역 0이다.
    /// 벽은 맵 생성기가 낸 격자(MapGrid)에서 읽고, 격자 밖의 칸도 벽이다. 개체는 칸을 막지 않는다.
    /// 클라이언트의 엔진 없는 코드(World/FieldMap)가 같은 규칙으로 같은 답을 내야 하므로 비교 벡터(shared/vectors/의 zones.tsv, walls.tsv)로 맞춘다.
    /// 구역은 규칙을 가르는 이름표라, 개체를 구역별로 모아 두지 않고 다른 시스템이 위치로 묻는다.
    /// </summary>
    public sealed class FieldMap
    {
        /// <summary>
        /// 한 변의 칸 수(m).
        /// </summary>
        private readonly int _size;

        /// <summary>
        /// 칸 번호의 가장 작은 값(-fieldSize/2).
        /// </summary>
        private readonly int _min;

        /// <summary>
        /// 칸마다의 구역 번호. 행이 z, 열이 x다.
        /// </summary>
        private readonly byte[] _zones;

        /// <summary>
        /// 칸마다 벽이면 1. 행이 z, 열이 x다(MapGrid.cells 그대로).
        /// </summary>
        private readonly byte[] _walls;

        /// <summary>
        /// 구역 번호 → 안전 지대인지.
        /// </summary>
        private readonly bool[] _safe = new bool[byte.MaxValue + 1];

        /// <summary>
        /// 필드의 크기(m, 짝수), Zones의 줄, 맵 생성기의 격자로 편다. 격자의 크기와 원점이 필드와 다르면 던진다(서버가 뜨지 않음).
        /// </summary>
        public FieldMap(uint fieldSize, IEnumerable<ZonesRow> zones, MapGrid grid)
        {
            if ((fieldSize == 0) || (fieldSize % 2 != 0) || (fieldSize > 2 * (uint)Constant.MapHalfExtentMeters))
            {
                throw new ArgumentOutOfRangeException(nameof(fieldSize), fieldSize, "The field size must be an even number of meters inside the packet limit.");
            }

            _size = (int)fieldSize;
            _min = -_size / 2;
            _zones = new byte[_size * _size];
            if ((grid.Width != fieldSize) || (grid.Depth != fieldSize) || (grid.OriginX != _min) || (grid.OriginZ != _min) || (grid.Cells.Length != _zones.Length))
            {
                throw new ArgumentException($"The map grid is {grid.Width}x{grid.Depth} from ({grid.OriginX}, {grid.OriginZ}) with {grid.Cells.Length} cells, but the field is {fieldSize} m from {_min}.", nameof(grid));
            }

            _walls = grid.Cells.ToByteArray();
            foreach (ZonesRow zone in zones)
            {
                if ((zone.Id == 0) || (zone.Id > byte.MaxValue))
                {
                    throw new ArgumentOutOfRangeException(nameof(zones), zone.Id, "Zone ids must be from 1 to 255.");
                }

                _safe[zone.Id] = zone.Safe;
                for (int cellZ = Math.Max(zone.MinZ, _min); cellZ < Math.Min(zone.MaxZ, _min + _size); cellZ++)
                {
                    for (int cellX = Math.Max(zone.MinX, _min); cellX < Math.Min(zone.MaxX, _min + _size); cellX++)
                    {
                        _zones[Index(cellX, cellZ)] = (byte)zone.Id;
                    }
                }
            }
        }

        /// <summary>
        /// 좌표(1/32 m)가 격자 안이다.
        /// </summary>
        public bool Contains(int x, int z)
        {
            return InGrid(CellOf(x)) && InGrid(CellOf(z));
        }

        /// <summary>
        /// 좌표(1/32 m)의 구역 번호. 어느 구역에도 들지 않거나 격자 밖이면 0이다.
        /// </summary>
        public uint ZoneAt(int x, int z)
        {
            int cellX = CellOf(x);
            int cellZ = CellOf(z);
            return InGrid(cellX) && InGrid(cellZ) ? _zones[Index(cellX, cellZ)] : 0u;
        }

        /// <summary>
        /// 좌표(1/32 m)가 안전 지대다.
        /// </summary>
        public bool IsSafe(int x, int z)
        {
            return _safe[ZoneAt(x, z)];
        }

        /// <summary>
        /// 좌표(1/32 m)의 칸이 벽이다. 격자 밖도 벽이다.
        /// </summary>
        public bool IsWall(int x, int z)
        {
            return !CellOpen(CellOf(x), CellOf(z), Walker.Player);
        }

        /// <summary>
        /// 좌표(1/32 m)의 칸을 그 걷는 쪽이 걸을 수 있다.
        /// </summary>
        public bool CanWalk(int x, int z, Walker walker)
        {
            return CellOpen(CellOf(x), CellOf(z), walker);
        }

        /// <summary>
        /// a에서 b까지의 선이 지나는 칸에 벽이 없다(벽 너머로 닿는지). 안전 지대는 막지 않는다. 좌표(1/32 m)는 패킷의 한도 안이어야 한다.
        /// </summary>
        public bool HasLine(int ax, int az, int bx, int bz)
        {
            return LineOpen(ax, az, bx, bz, Walker.Player);
        }

        /// <summary>
        /// a에서 b까지의 선이 지나는 칸을 그 걷는 쪽이 모두 걸을 수 있다. 플레이어 쪽은 HasLine과 같다.
        /// </summary>
        public bool CanWalkLine(int ax, int az, int bx, int bz, Walker walker)
        {
            return LineOpen(ax, az, bx, bz, walker);
        }

        /// <summary>
        /// 좌표(1/32 m) → 1 m 칸 번호. 내림이다(-1/32 m는 칸 -1).
        /// </summary>
        public static int CellOf(int coordinate)
        {
            int cell = coordinate / Units.PerMeter;
            return (coordinate % Units.PerMeter != 0) && (coordinate < 0) ? cell - 1 : cell;
        }

        /// <summary>
        /// 선이 지나는 칸이 모두 열려 있다. 지나는 칸은 두 끝점의 칸(내림)과, 끝점을 뺀 선분이 닿는 닫힌 칸(경계 포함)이다.
        /// 그래서 모서리를 정확히 지나면 그 모서리에 닿은 네 칸을, 변 위를 따라가면 변의 양쪽 칸을 모두 본다. 끝점이 경계 위여도
        /// 선이 들어가지 않는 쪽의 칸은 보지 않는다(벽 곁의 경계까지 걸어올 수 있음). 길이가 0인 선은 그 점의 칸 하나를 본다.
        /// 모두 정수로 계산해 서버와 두 클라이언트의 답이 같다.
        /// </summary>
        private bool LineOpen(int ax, int az, int bx, int bz, Walker walker)
        {
            if ((ax == bx) && (az == bz))
            {
                return CellOpen(CellOf(ax), CellOf(az), walker);
            }

            if (ax > bx)
            {
                (ax, az, bx, bz) = (bx, bz, ax, az);
            }

            // x 칸의 열마다, 선이 그 열(닫힌 구간) 안에 있는 동안의 z 범위가 닿는 칸을 본다. z는 분모 dx를 곱한 정수로 다룬다.
            long dx = (long)bx - ax;
            long dz = (long)bz - az;
            long denominator = Math.Max(dx, 1) * Units.PerMeter;
            for (int cellX = CeilDiv(ax, Units.PerMeter) - 1; cellX <= FloorDiv(bx, Units.PerMeter); cellX++)
            {
                long fromX = Math.Max((long)cellX * Units.PerMeter, ax);
                long toX = Math.Min(((long)cellX + 1) * Units.PerMeter, bx);
                long fromZ = (dx == 0) ? az : (az * dx) + ((fromX - ax) * dz);
                long toZ = (dx == 0) ? bz : (az * dx) + ((toX - ax) * dz);
                long lowZ = Math.Min(fromZ, toZ);
                long highZ = Math.Max(fromZ, toZ);
                for (long cellZ = CeilDiv(lowZ, denominator) - 1; cellZ <= FloorDiv(highZ, denominator); cellZ++)
                {
                    if (!TouchesOnlyAtEnd(cellX, (int)cellZ, ax, az, bx, bz) && !CellOpen(cellX, (int)cellZ, walker))
                    {
                        return false;
                    }
                }
            }

            return true;
        }

        /// <summary>
        /// 닫힌 칸이 선분과 끝점 하나에서만 닿는다(그 끝점의 칸이 아니고, 끝점에서 선이 그 칸 쪽으로 가지 않음).
        /// 칸과 선분은 볼록이라 닿는 곳이 이어진 한 구간이므로, 끝점을 품은 칸에 선이 들어가지 않으면 그 끝점에서만 닿는다.
        /// </summary>
        private static bool TouchesOnlyAtEnd(int cellX, int cellZ, int ax, int az, int bx, int bz)
        {
            return OnlyAt(cellX, cellZ, ax, az, (long)bx - ax, (long)bz - az) || OnlyAt(cellX, cellZ, bx, bz, (long)ax - bx, (long)az - bz);
        }

        /// <summary>
        /// 점 p를 품은 칸(p의 칸은 빼고)에 p에서 (dx, dz) 쪽으로 가는 선이 들어가지 않는다.
        /// </summary>
        private static bool OnlyAt(int cellX, int cellZ, int px, int pz, long dx, long dz)
        {
            if ((cellX == CellOf(px)) && (cellZ == CellOf(pz)))
            {
                return false;
            }

            long minX = (long)cellX * Units.PerMeter;
            long minZ = (long)cellZ * Units.PerMeter;
            bool holds = (px >= minX) && (px <= minX + Units.PerMeter) && (pz >= minZ) && (pz <= minZ + Units.PerMeter);
            bool enters = !((px == minX) && (dx < 0)) && !((px == minX + Units.PerMeter) && (dx > 0))
                && !((pz == minZ) && (dz < 0)) && !((pz == minZ + Units.PerMeter) && (dz > 0));
            return holds && !enters;
        }

        private bool CellOpen(int cellX, int cellZ, Walker walker)
        {
            if (!InGrid(cellX) || !InGrid(cellZ))
            {
                return false;
            }

            int index = Index(cellX, cellZ);
            return (_walls[index] == 0) && !((walker == Walker.Monster) && _safe[_zones[index]]);
        }

        private static int FloorDiv(int value, int divisor)
        {
            return (int)FloorDiv((long)value, divisor);
        }

        private static int CeilDiv(int value, int divisor)
        {
            return (int)CeilDiv((long)value, divisor);
        }

        /// <summary>
        /// 내림 나눗셈(divisor는 양수).
        /// </summary>
        private static long FloorDiv(long value, long divisor)
        {
            long quotient = value / divisor;
            return ((value % divisor) != 0) && (value < 0) ? quotient - 1 : quotient;
        }

        /// <summary>
        /// 올림 나눗셈(divisor는 양수).
        /// </summary>
        private static long CeilDiv(long value, long divisor)
        {
            return -FloorDiv(-value, divisor);
        }

        private bool InGrid(int cell)
        {
            return (cell >= _min) && (cell < _min + _size);
        }

        private int Index(int cellX, int cellZ)
        {
            return ((cellZ - _min) * _size) + (cellX - _min);
        }
    }
}
