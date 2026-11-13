using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using Google.Protobuf;
using PortfolioMmo.Data;
using PortfolioMmo.Server;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 월드와 시스템의 테스트가 쓰는 시험용 기획 데이터. 파일을 읽지 않고 코드로 만든다(로더의 테스트만 생성물을 읽음).
    /// </summary>
    internal static class TestData
    {
        public const ulong Hash = 0x0123456789abcdef;

        /// <summary>
        /// 필드의 크기(m). 실제 데이터와 같은 600 m다(-300 m 이상 300 m 미만).
        /// </summary>
        public const uint FieldSize = 600;

        /// <summary>
        /// 벽이 없는 600 m 필드와 원점에 부활 지점을 둔 마을 하나의 데이터. 새 캐릭터가 원점에서 시작한다.
        /// 구역과 벽의 규칙은 FieldMapTests가 FieldMap으로 직접 보고, 벽에 막히는 월드는 WithMap으로 만든다.
        /// </summary>
        public static readonly GameData Data = new GameData(Hash, new Constants { FieldSize = FieldSize }, new Zones { Rows = { Town(0, 0) } }, EmptyGrid(FieldSize));

        /// <summary>
        /// 원점 둘레 80 m의 안전한 마을. 부활 지점은 (x, z) m다.
        /// </summary>
        public static ZonesRow Town(int x, int z)
        {
            return new ZonesRow { Id = 1, Kind = ZoneKind.Town, MinX = -40, MinZ = -40, MaxX = 40, MaxZ = 40, Safe = true, RespawnX = x, RespawnZ = z, OutlawRespawnX = x, OutlawRespawnZ = z };
        }

        /// <summary>
        /// 막힌 칸이 없는 격자.
        /// </summary>
        public static MapGrid EmptyGrid(uint size)
        {
            return new MapGrid { Width = size, Depth = size, OriginX = -(int)size / 2, OriginZ = -(int)size / 2, Cells = ByteString.CopyFrom(new byte[size * size]) };
        }

        /// <summary>
        /// 글자로 그린 작은 맵의 격자와 구역. 줄마다 z가 한 칸이고 첫 줄이 가장 큰 z(북쪽), 글자마다 x가 한 칸이고 첫 글자가 가장 작은 x다.
        /// 줄 수와 글자 수가 같은 짝수여야 하고 원점이 가운데다. '#'은 벽, 's'는 안전 지대(구역 1)의 칸, '.'은 빈 칸이다.
        /// </summary>
        public static (uint Size, MapGrid Grid, ZonesRow[] Zones) Map(params string[] rows)
        {
            uint size = (uint)rows.Length;
            int min = -(int)size / 2;
            var cells = new byte[size * size];
            var zones = new List<ZonesRow>();
            for (int row = 0; row < rows.Length; row++)
            {
                int cellZ = min + rows.Length - 1 - row;
                for (int column = 0; column < rows[row].Length; column++)
                {
                    int cellX = min + column;
                    if (rows[row][column] == '#')
                    {
                        cells[((cellZ - min) * size) + (cellX - min)] = 1;
                    }
                    else if (rows[row][column] == 's')
                    {
                        zones.Add(new ZonesRow { Id = 1, MinX = cellX, MinZ = cellZ, MaxX = cellX + 1, MaxZ = cellZ + 1, Safe = true });
                    }
                }
            }

            return (size, new MapGrid { Width = size, Depth = size, OriginX = min, OriginZ = min, Cells = ByteString.CopyFrom(cells) }, zones.ToArray());
        }

        /// <summary>
        /// 글자로 그린 맵(Map)의 데이터. 마을의 부활 지점은 (respawnX, respawnZ) m다.
        /// </summary>
        public static GameData WithMap(int respawnX, int respawnZ, params string[] rows)
        {
            (uint size, MapGrid grid, ZonesRow[] zones) = Map(rows);
            var table = new Zones { Rows = { Town(respawnX, respawnZ) } };
            table.Rows.Add(zones);
            return new GameData(Hash, new Constants { FieldSize = size }, table, grid);
        }

        /// <summary>
        /// 저장소의 mmo/shared/ 아래 경로. 생성물과 비교 벡터를 읽고 쓴다.
        /// </summary>
        public static string Shared(string relative, [CallerFilePath] string here = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "../../shared", relative));
        }
    }
}
