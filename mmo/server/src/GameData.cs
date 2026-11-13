using System;
using System.Globalization;
using System.IO;
using PortfolioMmo.Data;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 기획 데이터. 서버가 뜰 때 한 번 읽어 바꾸지 않고 시스템에 넘긴다. 데이터를 바꾸려면 서버를 다시 띄운다.
    /// 파일은 data-tool이 mmo/data/의 xlsx에서 낸 mmo/shared/data/files/이고 실행 파일 옆의 data/에 실린다.
    /// 테이블은 그것을 쓰는 항목이 여기에 더한다(protoc가 만든 PortfolioMmo.Data의 파서로 읽음).
    /// 월드와 시스템의 테스트는 파일을 읽지 않고 생성자로 시험용 데이터를 만든다.
    /// </summary>
    public sealed class GameData
    {
        /// <summary>
        /// 데이터 해시 파일의 이름(data-tool의 proto 출력).
        /// </summary>
        public const string HashFile = "data.hash";

        public GameData(ulong hash, Constants constants, Zones zones, MapGrid grid)
        {
            Hash = hash;
            Constants = constants;
            Zones = zones;
            Grid = grid;
        }

        /// <summary>
        /// 생성물 전체의 해시. 클라이언트가 Login.data_hash에 실어 보낸 값과 다르면 로그인을 거절한다.
        /// </summary>
        public ulong Hash { get; }

        /// <summary>
        /// 밸런스의 수(키-값 테이블).
        /// </summary>
        public Constants Constants { get; }

        /// <summary>
        /// 구역의 사각형. 줄의 차례가 겹친 곳을 정한다(뒤 줄이 이김).
        /// </summary>
        public Zones Zones { get; }

        /// <summary>
        /// 맵 생성기가 낸 1 m 칸 격자(칸마다 막힘). 크기는 Constants의 필드의 크기와 같다.
        /// </summary>
        public MapGrid Grid { get; }

        /// <summary>
        /// 실행 파일 옆의 데이터 폴더.
        /// </summary>
        public static string DefaultFolder => Path.Combine(AppContext.BaseDirectory, "data");

        /// <summary>
        /// 폴더의 데이터를 모두 읽는다. 파일이 없거나 읽을 수 없으면 던진다(서버가 뜨지 않음).
        /// </summary>
        public static GameData Load(string folder)
        {
            return new GameData(
                ReadHash(folder),
                Constants.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Constants.bytes"))),
                Zones.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "Zones.bytes"))),
                MapGrid.Parser.ParseFrom(File.ReadAllBytes(Path.Combine(folder, "MapGrid.bytes"))));
        }

        /// <summary>
        /// 폴더의 데이터 해시(16진수 16자)를 읽는다. 부하 봇도 이것으로 Login에 실을 값을 얻는다.
        /// </summary>
        public static ulong ReadHash(string folder)
        {
            string path = Path.Combine(folder, HashFile);
            string text = File.ReadAllText(path).Trim();
            if ((text.Length != 16) || !ulong.TryParse(text, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out ulong hash))
            {
                throw new InvalidDataException($"{path} must hold 16 hex digits, got '{text}'.");
            }

            return hash;
        }
    }
}
