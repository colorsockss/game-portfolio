using System;
using System.IO;
using System.Linq;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// SQLite 저장소가 캐릭터를 만들고 나열하고, 위치를 덮어쓰며, 파일을 다시 열어도 남는지 확인한다.
    /// </summary>
    public class CharacterStoreTests
    {
        /// <summary>
        /// 만든 캐릭터와 저장한 위치를 다시 열어 읽는다. 같은 캐릭터를 한 번에 여러 번 저장하면 뒤의 것이 남는다.
        /// </summary>
        [Fact]
        public void CharactersAndPositionsSurviveReopening()
        {
            string path = Path.Combine(Path.GetTempPath(), $"mmo-store-{Guid.NewGuid():N}.sqlite");
            try
            {
                long knight;
                long mage;
                using (var store = new CharacterStore(path))
                {
                    knight = store.Create("hero_01", "Arthur", CharacterClass.Knight, 1, -2).Character!.Id;
                    mage = store.Create("hero_01", "멀린", CharacterClass.Mage, 3, 4).Character!.Id;
                    store.Save(new[] { Player(knight, 7, 8, 9), Player(knight, 10, -11, 255) });
                }

                using (var reopened = new CharacterStore(path))
                {
                    Assert.Equal(new[] { "Arthur", "멀린" }, reopened.List("hero_01").Select(c => c.Name));
                    Assert.Equal(new SavedPosition(10, -11, 255), reopened.Load(knight)!.Position);
                    Assert.Equal(new CharacterRecord(mage, "hero_01", "멀린", CharacterClass.Mage, new SavedPosition(3, 4, 0)), reopened.Load(mage));
                    Assert.Null(reopened.Load(999));
                    Assert.Empty(reopened.List("hero_02"));
                }
            }
            finally
            {
                File.Delete(path);
            }
        }

        /// <summary>
        /// 이름은 영문 대소문자를 가리지 않고 서버 전체에서 하나이고, 계정마다 Constant.MaxCharacters개까지다. 실패하면 아무것도 남지 않는다.
        /// </summary>
        [Fact]
        public void NamesAreUniqueAndAccountsHaveALimit()
        {
            using var store = new CharacterStore(":memory:");
            Assert.Equal(CreateCharacterResultCode.Ok, store.Create("hero_01", "Arthur", CharacterClass.Knight, 0, 0).Result);
            Assert.Equal(CreateCharacterResultCode.NameTaken, store.Create("hero_02", "arTHUR", CharacterClass.Mage, 0, 0).Result);
            Assert.Empty(store.List("hero_02"));

            for (int i = 1; i < (int)Constant.MaxCharacters; i++)
            {
                Assert.Equal(CreateCharacterResultCode.Ok, store.Create("hero_01", $"Knight{i}", CharacterClass.Knight, 0, 0).Result);
            }

            Assert.Equal(CreateCharacterResultCode.TooMany, store.Create("hero_01", "Extra", CharacterClass.Knight, 0, 0).Result);
            Assert.Equal((int)Constant.MaxCharacters, store.List("hero_01").Count);
        }

        /// <summary>
        /// 저장할 위치를 가진 플레이어.
        /// </summary>
        private static Player Player(long characterId, int x, int z, uint yaw)
        {
            var character = new CharacterRecord(characterId, "hero_01", "Arthur", CharacterClass.Knight, default);
            return new Player(0, character, new Session(), new SavedPosition(x, z, yaw));
        }
    }
}
