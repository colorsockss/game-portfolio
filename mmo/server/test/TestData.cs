using System.IO;
using System.Runtime.CompilerServices;
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
        /// 구역 없이 필드의 크기만 있는 데이터. 구역의 규칙은 FieldMapTests가 FieldMap으로 직접 본다.
        /// </summary>
        public static readonly GameData Data = new GameData(Hash, new Constants { FieldSize = FieldSize }, new Zones());

        /// <summary>
        /// 저장소의 mmo/shared/ 아래 경로. 생성물과 비교 벡터를 읽고 쓴다.
        /// </summary>
        public static string Shared(string relative, [CallerFilePath] string here = "")
        {
            return Path.GetFullPath(Path.Combine(Path.GetDirectoryName(here)!, "../../shared", relative));
        }
    }
}
