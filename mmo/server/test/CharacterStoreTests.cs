using System;
using System.IO;
using System.Linq;
using Microsoft.Data.Sqlite;
using PortfolioMmo.Contract;
using PortfolioMmo.Server;
using Xunit;

namespace PortfolioMmo.Server.Tests
{
    /// <summary>
    /// SQLite 저장소(38)가 캐릭터를 처음 상태와 함께 만들고, 목록에 레벨과 입은 무기를 싣고, 사본의 묶음을 한 트랜잭션으로 쓰며, 형식의 버전을 지키는지 본다.
    /// </summary>
    public class CharacterStoreTests
    {
        /// <summary>
        /// 만든 캐릭터와 쓴 사본을 다시 열어 읽는다: 위치, 레벨, 경험치, 체력, 마나, 골드, 아이템(칸과 강화 수치), 입은 장비, 배운 스킬, 퀵슬롯.
        /// 한 묶음에 같은 캐릭터가 여러 번 있으면 뒤의 것이 남고, 목록은 레벨과 입은 무기를 싣는다.
        /// </summary>
        [Fact]
        public void CharactersAndTheirStateSurviveReopening()
        {
            string path = TempPath();
            try
            {
                long knight;
                CharacterSnapshot saved;
                using (var store = new CharacterStore(path))
                {
                    knight = store.Create("hero_01", "Arthur", CharacterClass.Knight, Start()).Id;
                    store.Create("hero_01", "멀린", CharacterClass.Mage, Start());
                    saved = Snapshot(knight, level: 7) with
                    {
                        Items = new[] { new SavedItem(ItemPlace.Inventory, 3, 2001, 9, 0), new SavedItem(ItemPlace.Equipment, 0, 1012, 1, 5) },
                        Skills = new uint[] { 101, 102 },
                        Quickslots = new[] { new SavedQuickslot(0, QuickslotKind.Skill, 102), new SavedQuickslot(5, QuickslotKind.Item, 2001) },
                    };
                    store.Write(new[] { Snapshot(knight, level: 3), saved });
                }

                using (var reopened = new CharacterStore(path))
                {
                    Assert.Equal(
                        new[] { new CharacterListEntry(knight, "Arthur", CharacterClass.Knight, 7, 1012), new CharacterListEntry(knight + 1, "멀린", CharacterClass.Mage, 1, 1011) },
                        reopened.List("hero_01"));
                    CharacterRecord loaded = reopened.Load(knight)!;
                    Assert.Equal(("hero_01", "Arthur", CharacterClass.Knight), (loaded.LoginId, loaded.Name, loaded.Class));
                    Assert.Equal(
                        (saved.Position, saved.Level, saved.Exp, saved.Hp, saved.Mp, saved.Gold),
                        (loaded.State.Position, loaded.State.Level, loaded.State.Exp, loaded.State.Hp, loaded.State.Mp, loaded.State.Gold));
                    Assert.Equal(saved.Items, loaded.State.Items);
                    Assert.Equal(saved.Skills, loaded.State.Skills);
                    Assert.Equal(saved.Quickslots, loaded.State.Quickslots);
                    Assert.Null(reopened.Load(999));
                    Assert.Empty(reopened.List("hero_02"));
                }
            }
            finally
            {
                Delete(path);
            }
        }

        /// <summary>
        /// 이름은 영문 대소문자를 가리지 않고 서버 전체에서 하나이고, 계정마다 Constant.MaxCharacters개까지다. 실패하면 아무것도 남지 않는다.
        /// 만든 캐릭터는 처음 상태(아이템, 스킬, 퀵슬롯)를 가진다.
        /// </summary>
        [Fact]
        public void NamesAreUniqueAndAccountsHaveALimit()
        {
            using var store = new CharacterStore(":memory:");
            CreatedCharacter created = store.Create("hero_01", "Arthur", CharacterClass.Knight, Start());
            Assert.Equal(CreateCharacterResultCode.Ok, created.Result);
            Assert.Equal(Start().Items, store.Load(created.Id)!.State.Items);
            Assert.Equal(CreateCharacterResultCode.NameTaken, store.Create("hero_02", "arTHUR", CharacterClass.Mage, Start()).Result);
            Assert.Empty(store.List("hero_02"));

            for (int i = 1; i < (int)Constant.MaxCharacters; i++)
            {
                Assert.Equal(CreateCharacterResultCode.Ok, store.Create("hero_01", $"Knight{i}", CharacterClass.Knight, Start()).Result);
            }

            Assert.Equal(CreateCharacterResultCode.TooMany, store.Create("hero_01", "Extra", CharacterClass.Knight, Start()).Result);
            Assert.Equal((int)Constant.MaxCharacters, store.List("hero_01").Count);
        }

        /// <summary>
        /// 묶음을 쓰는 도중 실패하면(같은 칸이 두 번인 사본) 그 묶음의 아무것도 쓰이지 않는다.
        /// </summary>
        [Fact]
        public void AFailedBatchWritesNothing()
        {
            using var store = new CharacterStore(":memory:");
            long first = store.Create("hero_01", "Arthur", CharacterClass.Knight, Start()).Id;
            long second = store.Create("hero_01", "Lancelot", CharacterClass.Knight, Start()).Id;
            CharacterSnapshot broken = Snapshot(second, level: 9) with
            {
                Items = new[] { new SavedItem(ItemPlace.Inventory, 0, 2001, 1, 0), new SavedItem(ItemPlace.Inventory, 0, 2003, 1, 0) },
            };
            Assert.Throws<SqliteException>(() => store.Write(new[] { Snapshot(first, level: 5), broken }));
            Assert.Equal(new uint[] { 1, 1 }, store.List("hero_01").Select(character => character.Level));
            Assert.Equal(Start().Items, store.Load(second)!.State.Items);
        }

        /// <summary>
        /// 버전이 다른 파일로 열면 그 파일(WAL 포함)이 다른 이름으로 남고 빈 데이터베이스로 시작한다. 버전이 같으면 그대로 연다.
        /// 새 데이터베이스에는 characters의 성향 열과 quests 테이블이 있다.
        /// </summary>
        [Fact]
        public void AnotherSchemaVersionIsKeptAsideAndReplaced()
        {
            string path = TempPath();
            try
            {
                using (var old = new SqliteConnection($"Data Source={path};Pooling=False"))
                {
                    old.Open();
                    using SqliteCommand command = old.CreateCommand();
                    command.CommandText = "CREATE TABLE characters (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO characters (name) VALUES ('Old'); PRAGMA user_version = 2;";
                    command.ExecuteNonQuery();
                }

                using (var store = new CharacterStore(path))
                {
                    store.Create("hero_01", "Arthur", CharacterClass.Knight, Start());
                }

                string kept = Assert.Single(Directory.GetFiles(Path.GetDirectoryName(path)!, Path.GetFileName(path) + ".v2-*"));
                using (var reopened = new CharacterStore(path))
                {
                    Assert.Equal(new[] { "Arthur" }, reopened.List("hero_01").Select(character => character.Name));
                }

                using var check = new SqliteConnection($"Data Source={path};Pooling=False");
                check.Open();
                using SqliteCommand query = check.CreateCommand();
                query.CommandText = "SELECT COUNT(*) FROM pragma_table_info('characters') WHERE name = 'alignment'; ";
                Assert.Equal(1L, query.ExecuteScalar());
                query.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'quests'";
                Assert.Equal(1L, query.ExecuteScalar());
                File.Delete(kept);
            }
            finally
            {
                Delete(path);
            }
        }

        /// <summary>
        /// 처음 상태: 물약 둘, 입은 1단계 검, 첫 스킬, 그것으로 채운 퀵슬롯.
        /// </summary>
        private static CharacterSnapshot Start()
        {
            return new CharacterSnapshot(
                0, new SavedPosition(1, -2, 0), 1, 0, 150, 50, 0, 0,
                new[] { new SavedItem(ItemPlace.Inventory, 0, 2001, 3, 0), new SavedItem(ItemPlace.Inventory, 1, 2003, 2, 0), new SavedItem(ItemPlace.Equipment, 0, 1011, 1, 0) },
                new uint[] { 101 }, new[] { new SavedQuickslot(0, QuickslotKind.Skill, 101), new SavedQuickslot(1, QuickslotKind.Item, 2001) });
        }

        private static CharacterSnapshot Snapshot(long id, uint level)
        {
            return Start() with { Id = id, Position = new SavedPosition(10, -11, 255), Level = level, Exp = 40, Hp = 90, Mp = 20, Gold = 1234 };
        }

        private static string TempPath()
        {
            return Path.Combine(Path.GetTempPath(), $"mmo-store-{Guid.NewGuid():N}.sqlite");
        }

        private static void Delete(string path)
        {
            foreach (string suffix in new[] { string.Empty, "-wal", "-shm" })
            {
                File.Delete(path + suffix);
            }
        }
    }
}
