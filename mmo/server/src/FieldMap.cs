using System;
using System.Collections.Generic;
using PortfolioMmo.Contract;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 필드의 1 m 칸 격자. 칸마다 구역 번호를 가진다(막힘은 backlog 65가 더한다). 필드는 한 변 fieldSize m이고
    /// -fieldSize/2 이상 fieldSize/2 미만이다. 좌표(1/32 m) → 칸은 내림이라 음수 좌표도 한 칸에 하나씩 대응하고, 정확히 +fieldSize/2는
    /// 격자 밖이다. 구역은 Zones의 사각형을 줄의 차례대로 펴서 겹치면 뒤 줄이 이기고, 어느 사각형에도 들지 않는 칸과 격자 밖은 구역 0이다.
    /// 클라이언트의 엔진 없는 코드(World/FieldMap)가 같은 규칙으로 같은 답을 내야 하므로 비교 벡터(shared/vectors/zones.tsv)로 맞춘다.
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
        /// 구역 번호 → 안전 지대인지.
        /// </summary>
        private readonly bool[] _safe = new bool[byte.MaxValue + 1];

        /// <summary>
        /// 필드의 크기(m, 짝수)와 Zones의 줄로 격자를 편다.
        /// </summary>
        public FieldMap(uint fieldSize, IEnumerable<ZonesRow> zones)
        {
            if ((fieldSize == 0) || (fieldSize % 2 != 0) || (fieldSize > 2 * (uint)Constant.MapHalfExtentMeters))
            {
                throw new ArgumentOutOfRangeException(nameof(fieldSize), fieldSize, "The field size must be an even number of meters inside the packet limit.");
            }

            _size = (int)fieldSize;
            _min = -_size / 2;
            _zones = new byte[_size * _size];
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
        /// 좌표(1/32 m) → 1 m 칸 번호. 내림이다(-1/32 m는 칸 -1).
        /// </summary>
        public static int CellOf(int coordinate)
        {
            int cell = coordinate / Units.PerMeter;
            return (coordinate % Units.PerMeter != 0) && (coordinate < 0) ? cell - 1 : cell;
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
