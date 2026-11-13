using PortfolioMmo.Server;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// 월드와 시스템의 테스트가 쓰는 시험용 기획 데이터. 파일을 읽지 않고 코드로 만든다(로더의 테스트만 생성물을 읽음).
    /// </summary>
    internal static class TestData
    {
        public const ulong Hash = 0x0123456789abcdef;

        public static readonly GameData Data = new GameData(Hash);
    }
}
