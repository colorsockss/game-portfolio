using System;
using System.IO;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// SQLite 저장소가 위치를 덮어쓰고, 파일을 다시 열어도 남는지 확인한다.
    /// </summary>
    public class PlayerStoreTests
    {
        /// <summary>
        /// 저장한 위치를 다시 열어 읽고, 같은 ID는 덮어쓰며, 한 번에 같은 ID가 여러 번 있으면 뒤의 것이 남는다.
        /// </summary>
        [Fact]
        public void SavedPositionsSurviveReopening()
        {
            string path = Path.Combine(Path.GetTempPath(), $"mmo-store-{Guid.NewGuid():N}.sqlite");
            try
            {
                using (var store = new PlayerStore(path))
                {
                    Assert.Null(store.Load("hero_01"));
                    store.Save(new[] { Player("hero_01", 1, -2, 3), Player("hero_02", 4, 5, 6) });
                    store.Save(new[] { Player("hero_01", 7, 8, 9), Player("hero_01", 10, -11, 255) });
                }

                using (var reopened = new PlayerStore(path))
                {
                    Assert.Equal(new SavedPosition(10, -11, 255), reopened.Load("hero_01"));
                    Assert.Equal(new SavedPosition(4, 5, 6), reopened.Load("hero_02"));
                }
            }
            finally
            {
                File.Delete(path);
            }
        }

        /// <summary>
        /// 저장할 위치를 가진 플레이어.
        /// </summary>
        private static Player Player(string loginId, int x, int z, uint yaw)
        {
            return new Player(0, loginId, new Session(), x, z, yaw);
        }
    }
}
