using System;
using System.Collections.Generic;
using System.IO;
using Microsoft.Data.Sqlite;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 저장한 위치 하나.
    /// </summary>
    public readonly record struct SavedPosition(int X, int Z, uint Yaw);

    /// <summary>
    /// 저장한 아이템 칸 하나(인벤토리, 장비. 창고는 75).
    /// </summary>
    public readonly record struct SavedItem(ItemPlace Place, uint Slot, uint ItemId, uint Count, uint Enchant);

    /// <summary>
    /// 저장한 퀵슬롯 자리 하나(빈 자리는 저장하지 않음).
    /// </summary>
    public readonly record struct SavedQuickslot(uint Slot, QuickslotKind Kind, uint Id);

    /// <summary>
    /// 캐릭터의 저장할 상태(사본, 38). 틱 스레드가 그 틱에 복사해 만들고 바꾸지 않으므로 저장 스레드가 그대로 읽는다.
    /// 성향(44), 펫(96. 가진 펫과 나와 있는지), 창고의 아이템(75)을 담고, 퀘스트 진행은 50이 채우기 시작한다. 쿨다운, 효과, 선공 표시, 틱 번호, 요청 번호는 저장하지 않는다.
    /// </summary>
    public sealed record CharacterSnapshot(
        long Id, SavedPosition Position, uint Level, uint Exp, uint Hp, uint Mp, ulong Gold, int Alignment,
        IReadOnlyList<SavedItem> Items, IReadOnlyList<uint> Skills, IReadOnlyList<SavedQuickslot> Quickslots, uint Pet = 0, bool PetOut = false);

    /// <summary>
    /// 저장한 캐릭터 하나. Id는 캐릭터 번호(개체 번호와 다르다)이고 LoginId는 그 캐릭터의 계정이다.
    /// </summary>
    public sealed record CharacterRecord(long Id, string LoginId, string Name, CharacterClass Class, CharacterSnapshot State);

    /// <summary>
    /// 캐릭터 목록의 한 줄(캐릭터 선택에 보이는 것).
    /// </summary>
    public readonly record struct CharacterListEntry(long Id, string Name, CharacterClass Class, uint Level, uint WeaponItemId);

    /// <summary>
    /// 캐릭터 만들기의 결과.
    /// </summary>
    public readonly record struct CreatedCharacter(CreateCharacterResultCode Result, long Id);

    /// <summary>
    /// 계정의 캐릭터들과 그 모든 것을 두는 SQLite 저장소(38). 저장 스레드(SaveQueue)만 부르고, 연결 하나로 동기로 읽고 쓴다.
    /// 형식의 버전은 하나(SchemaVersion)이고, 뜰 때 파일의 버전이 다르면 옛 파일(WAL 포함)의 이름을 바꿔 두고 새 데이터베이스로 시작한다(옮기는 코드는 없음).
    /// </summary>
    public sealed class CharacterStore : IDisposable
    {
        /// <summary>
        /// 데이터베이스 형식의 버전(PRAGMA user_version). 테이블이나 열을 바꾸면 올린다. 옛 단계식(1, 2)과 겹치지 않게 3부터다.
        /// </summary>
        public const int SchemaVersion = 3;

        /// <summary>
        /// 형식. 이름은 대소문자를 가리지 않고 하나다(NOCASE는 영문만 접는다). 주인은 캐릭터 번호다.
        /// </summary>
        private const string Schema = @"
            CREATE TABLE characters (
                id INTEGER PRIMARY KEY,
                login_id TEXT NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                class INTEGER NOT NULL,
                x INTEGER NOT NULL,
                z INTEGER NOT NULL,
                yaw INTEGER NOT NULL,
                level INTEGER NOT NULL,
                exp INTEGER NOT NULL,
                hp INTEGER NOT NULL,
                mp INTEGER NOT NULL,
                gold INTEGER NOT NULL,
                alignment INTEGER NOT NULL DEFAULT 0,
                pet INTEGER NOT NULL DEFAULT 0,
                pet_out INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX characters_login_id ON characters (login_id);
            CREATE TABLE items (
                owner INTEGER NOT NULL,
                place INTEGER NOT NULL,
                slot INTEGER NOT NULL,
                item_id INTEGER NOT NULL,
                count INTEGER NOT NULL,
                enchant INTEGER NOT NULL,
                PRIMARY KEY (owner, place, slot)
            ) WITHOUT ROWID;
            CREATE TABLE skills (
                owner INTEGER NOT NULL,
                skill INTEGER NOT NULL,
                PRIMARY KEY (owner, skill)
            ) WITHOUT ROWID;
            CREATE TABLE quickslots (
                owner INTEGER NOT NULL,
                slot INTEGER NOT NULL,
                kind INTEGER NOT NULL,
                id INTEGER NOT NULL,
                PRIMARY KEY (owner, slot)
            ) WITHOUT ROWID;
            CREATE TABLE quests (
                owner INTEGER PRIMARY KEY,
                completed INTEGER NOT NULL,
                accepted INTEGER NOT NULL,
                progress INTEGER NOT NULL
            );";

        private const string CharacterColumns = "id, login_id, name, class, x, z, yaw, level, exp, hp, mp, gold, alignment, pet, pet_out";

        private readonly SqliteConnection _connection;
        private readonly SqliteCommand _list;
        private readonly SqliteCommand _load;
        private readonly SqliteCommand _loadItems;
        private readonly SqliteCommand _loadSkills;
        private readonly SqliteCommand _loadQuickslots;
        private readonly SqliteCommand _count;
        private readonly SqliteCommand _insert;
        private readonly SqliteCommand _update;
        private readonly SqliteCommand _deleteItems;
        private readonly SqliteCommand _deleteSkills;
        private readonly SqliteCommand _deleteQuickslots;
        private readonly SqliteCommand _insertItem;
        private readonly SqliteCommand _insertSkill;
        private readonly SqliteCommand _insertQuickslot;

        /// <summary>
        /// path의 SQLite 파일을 연다(":memory:"는 이 객체가 사는 동안만 남는다). 버전이 다른 파일은 옆에 이름을 바꿔 두고 새로 만든다.
        /// </summary>
        public CharacterStore(string path)
        {
            _connection = Open(path);
            long version = Scalar("PRAGMA user_version");
            if ((version != 0) && (version != SchemaVersion))
            {
                _connection.Dispose();
                string kept = $"{path}.v{version}-{DateTime.UtcNow:yyyyMMddHHmmss}";
                foreach (string suffix in new[] { string.Empty, "-wal", "-shm" })
                {
                    if (File.Exists(path + suffix))
                    {
                        File.Move(path + suffix, kept + suffix);
                    }
                }

                Console.WriteLine($"The database {path} has schema {version}, not {SchemaVersion}; kept it as {kept} and started a new one.");
                _connection = Open(path);
                version = 0;
            }

            if (version == 0)
            {
                using SqliteTransaction transaction = _connection.BeginTransaction();
                using SqliteCommand command = _connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = $"{Schema} PRAGMA user_version = {SchemaVersion};";
                command.ExecuteNonQuery();
                transaction.Commit();
            }

            _list = Command(
                @"SELECT c.id, c.name, c.class, c.level, COALESCE(i.item_id, 0) FROM characters c
                  LEFT JOIN items i ON i.owner = c.id AND i.place = $place AND i.slot = $slot WHERE c.login_id = $loginId ORDER BY c.id",
                ("$loginId", SqliteType.Text), ("$place", SqliteType.Integer), ("$slot", SqliteType.Integer));
            _list.Parameters["$place"].Value = (int)ItemPlace.Equipment;
            _list.Parameters["$slot"].Value = (int)Data.EquipSlot.Weapon - 1;
            _load = Command($"SELECT {CharacterColumns} FROM characters WHERE id = $id", ("$id", SqliteType.Integer));
            _loadItems = Command("SELECT place, slot, item_id, count, enchant FROM items WHERE owner = $id ORDER BY place, slot", ("$id", SqliteType.Integer));
            _loadSkills = Command("SELECT skill FROM skills WHERE owner = $id ORDER BY skill", ("$id", SqliteType.Integer));
            _loadQuickslots = Command("SELECT slot, kind, id FROM quickslots WHERE owner = $id ORDER BY slot", ("$id", SqliteType.Integer));
            _count = Command("SELECT COUNT(*) FROM characters WHERE login_id = $loginId", ("$loginId", SqliteType.Text));
            _insert = Command(
                @"INSERT INTO characters (login_id, name, class, x, z, yaw, level, exp, hp, mp, gold, alignment)
                  VALUES ($loginId, $name, $class, $x, $z, $yaw, $level, $exp, $hp, $mp, $gold, $alignment)
                  ON CONFLICT (name) DO NOTHING RETURNING id",
                ("$loginId", SqliteType.Text), ("$name", SqliteType.Text), ("$class", SqliteType.Integer), ("$x", SqliteType.Integer), ("$z", SqliteType.Integer),
                ("$yaw", SqliteType.Integer), ("$level", SqliteType.Integer), ("$exp", SqliteType.Integer), ("$hp", SqliteType.Integer), ("$mp", SqliteType.Integer),
                ("$gold", SqliteType.Integer), ("$alignment", SqliteType.Integer));
            _update = Command(
                @"UPDATE characters SET x = $x, z = $z, yaw = $yaw, level = $level, exp = $exp, hp = $hp, mp = $mp, gold = $gold, alignment = $alignment,
                  pet = $pet, pet_out = $petOut WHERE id = $id",
                ("$id", SqliteType.Integer), ("$x", SqliteType.Integer), ("$z", SqliteType.Integer), ("$yaw", SqliteType.Integer), ("$level", SqliteType.Integer),
                ("$exp", SqliteType.Integer), ("$hp", SqliteType.Integer), ("$mp", SqliteType.Integer), ("$gold", SqliteType.Integer), ("$alignment", SqliteType.Integer),
                ("$pet", SqliteType.Integer), ("$petOut", SqliteType.Integer));
            _deleteItems = Command("DELETE FROM items WHERE owner = $id", ("$id", SqliteType.Integer));
            _deleteSkills = Command("DELETE FROM skills WHERE owner = $id", ("$id", SqliteType.Integer));
            _deleteQuickslots = Command("DELETE FROM quickslots WHERE owner = $id", ("$id", SqliteType.Integer));
            _insertItem = Command(
                "INSERT INTO items (owner, place, slot, item_id, count, enchant) VALUES ($id, $place, $slot, $itemId, $count, $enchant)",
                ("$id", SqliteType.Integer), ("$place", SqliteType.Integer), ("$slot", SqliteType.Integer), ("$itemId", SqliteType.Integer),
                ("$count", SqliteType.Integer), ("$enchant", SqliteType.Integer));
            _insertSkill = Command("INSERT INTO skills (owner, skill) VALUES ($id, $skill)", ("$id", SqliteType.Integer), ("$skill", SqliteType.Integer));
            _insertQuickslot = Command(
                "INSERT INTO quickslots (owner, slot, kind, id) VALUES ($id, $slot, $kind, $value)",
                ("$id", SqliteType.Integer), ("$slot", SqliteType.Integer), ("$kind", SqliteType.Integer), ("$value", SqliteType.Integer));
        }

        /// <summary>
        /// 계정의 캐릭터들(만든 차례). 입은 무기는 items의 무기 장비 칸이다.
        /// </summary>
        public List<CharacterListEntry> List(string loginId)
        {
            _list.Parameters["$loginId"].Value = loginId;
            using SqliteDataReader reader = _list.ExecuteReader();
            var characters = new List<CharacterListEntry>();
            while (reader.Read())
            {
                characters.Add(new CharacterListEntry(reader.GetInt64(0), reader.GetString(1), (CharacterClass)reader.GetInt32(2), (uint)reader.GetInt64(3), (uint)reader.GetInt64(4)));
            }

            return characters;
        }

        /// <summary>
        /// 캐릭터 번호의 캐릭터와 그 모든 것. 없으면 null.
        /// </summary>
        public CharacterRecord? Load(long id)
        {
            _load.Parameters["$id"].Value = id;
            string loginId;
            string name;
            CharacterClass characterClass;
            SavedPosition position;
            uint level, exp, hp, mp;
            ulong gold;
            int alignment;
            uint pet;
            bool petOut;
            using (SqliteDataReader reader = _load.ExecuteReader())
            {
                if (!reader.Read())
                {
                    return null;
                }

                loginId = reader.GetString(1);
                name = reader.GetString(2);
                characterClass = (CharacterClass)reader.GetInt32(3);
                position = new SavedPosition(reader.GetInt32(4), reader.GetInt32(5), (uint)reader.GetInt64(6));
                (level, exp, hp, mp) = ((uint)reader.GetInt64(7), (uint)reader.GetInt64(8), (uint)reader.GetInt64(9), (uint)reader.GetInt64(10));
                gold = (ulong)reader.GetInt64(11);
                alignment = reader.GetInt32(12);
                (pet, petOut) = ((uint)reader.GetInt64(13), reader.GetInt64(14) != 0);
            }

            var items = new List<SavedItem>();
            _loadItems.Parameters["$id"].Value = id;
            using (SqliteDataReader reader = _loadItems.ExecuteReader())
            {
                while (reader.Read())
                {
                    items.Add(new SavedItem((ItemPlace)reader.GetInt32(0), (uint)reader.GetInt64(1), (uint)reader.GetInt64(2), (uint)reader.GetInt64(3), (uint)reader.GetInt64(4)));
                }
            }

            var skills = new List<uint>();
            _loadSkills.Parameters["$id"].Value = id;
            using (SqliteDataReader reader = _loadSkills.ExecuteReader())
            {
                while (reader.Read())
                {
                    skills.Add((uint)reader.GetInt64(0));
                }
            }

            var quickslots = new List<SavedQuickslot>();
            _loadQuickslots.Parameters["$id"].Value = id;
            using (SqliteDataReader reader = _loadQuickslots.ExecuteReader())
            {
                while (reader.Read())
                {
                    quickslots.Add(new SavedQuickslot((uint)reader.GetInt64(0), (QuickslotKind)reader.GetInt32(1), (uint)reader.GetInt64(2)));
                }
            }

            return new CharacterRecord(id, loginId, name, characterClass, new CharacterSnapshot(id, position, level, exp, hp, mp, gold, alignment, items, skills, quickslots, pet, petOut));
        }

        /// <summary>
        /// 계정에 캐릭터를 처음 상태(start. Id는 보지 않음)로 만든다. 수 세기, 이름의 INSERT … ON CONFLICT, 처음 상태의 아이템·스킬·퀵슬롯을 한 트랜잭션에서 하고,
        /// 이름이 겹쳤는지는 넣은 행이 있는지로 본다. 이름의 형식과 직업은 부르는 쪽이 검사한다.
        /// </summary>
        public CreatedCharacter Create(string loginId, string name, CharacterClass characterClass, CharacterSnapshot start)
        {
            using SqliteTransaction transaction = _connection.BeginTransaction();
            _count.Transaction = transaction;
            _insert.Transaction = transaction;
            _count.Parameters["$loginId"].Value = loginId;
            if ((long)_count.ExecuteScalar()! >= (long)Constant.MaxCharacters)
            {
                return new CreatedCharacter(CreateCharacterResultCode.TooMany, 0);
            }

            _insert.Parameters["$loginId"].Value = loginId;
            _insert.Parameters["$name"].Value = name;
            _insert.Parameters["$class"].Value = (int)characterClass;
            SetState(_insert, start);
            object? id = _insert.ExecuteScalar();
            if (id == null)
            {
                return new CreatedCharacter(CreateCharacterResultCode.NameTaken, 0);
            }

            InsertChildren(transaction, start with { Id = (long)id });
            transaction.Commit();
            return new CreatedCharacter(CreateCharacterResultCode.Ok, (long)id);
        }

        /// <summary>
        /// 사본의 묶음을 한 트랜잭션으로 쓴다: characters의 줄을 고치고 items, skills, quickslots는 그 주인의 줄을 지우고 다시 넣는다(퀘스트는 50이 더함).
        /// 같은 캐릭터가 여러 번 있으면 뒤의 것이 남고, 하나라도 실패하면 던지며 아무것도 남지 않는다.
        /// </summary>
        public void Write(IReadOnlyList<CharacterSnapshot> batch)
        {
            using SqliteTransaction transaction = _connection.BeginTransaction();
            foreach (SqliteCommand command in new[] { _update, _deleteItems, _deleteSkills, _deleteQuickslots })
            {
                command.Transaction = transaction;
            }

            foreach (CharacterSnapshot snapshot in batch)
            {
                _update.Parameters["$id"].Value = snapshot.Id;
                SetState(_update, snapshot);
                _update.ExecuteNonQuery();
                foreach (SqliteCommand delete in new[] { _deleteItems, _deleteSkills, _deleteQuickslots })
                {
                    delete.Parameters["$id"].Value = snapshot.Id;
                    delete.ExecuteNonQuery();
                }

                InsertChildren(transaction, snapshot);
            }

            transaction.Commit();
        }

        public void Dispose()
        {
            foreach (SqliteCommand command in new[]
            {
                _list, _load, _loadItems, _loadSkills, _loadQuickslots, _count, _insert, _update, _deleteItems, _deleteSkills, _deleteQuickslots, _insertItem, _insertSkill,
                _insertQuickslot,
            })
            {
                command.Dispose();
            }

            _connection.Dispose();
        }

        private static SqliteConnection Open(string path)
        {
            // 풀링하지 않아야 Dispose할 때 파일이 닫히고 WAL이 정리된다.
            var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString());
            connection.Open();
            // 저장 스레드가 커밋마다 fsync를 기다리지 않게 NORMAL이다. 전원이 나가면 마지막 커밋을 잃을 수 있지만 파일은 깨지지 않는다.
            using SqliteCommand command = connection.CreateCommand();
            command.CommandText = "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;";
            command.ExecuteNonQuery();
            return connection;
        }

        private static void SetState(SqliteCommand command, CharacterSnapshot state)
        {
            command.Parameters["$x"].Value = state.Position.X;
            command.Parameters["$z"].Value = state.Position.Z;
            command.Parameters["$yaw"].Value = state.Position.Yaw;
            command.Parameters["$level"].Value = state.Level;
            command.Parameters["$exp"].Value = state.Exp;
            command.Parameters["$hp"].Value = state.Hp;
            command.Parameters["$mp"].Value = state.Mp;
            command.Parameters["$gold"].Value = (long)state.Gold;
            command.Parameters["$alignment"].Value = state.Alignment;
            if (command.Parameters.Contains("$pet"))
            {
                command.Parameters["$pet"].Value = state.Pet;
                command.Parameters["$petOut"].Value = state.PetOut ? 1 : 0;
            }
        }

        private void InsertChildren(SqliteTransaction transaction, CharacterSnapshot state)
        {
            _insertItem.Transaction = transaction;
            _insertSkill.Transaction = transaction;
            _insertQuickslot.Transaction = transaction;
            foreach (SavedItem item in state.Items)
            {
                _insertItem.Parameters["$id"].Value = state.Id;
                _insertItem.Parameters["$place"].Value = (int)item.Place;
                _insertItem.Parameters["$slot"].Value = item.Slot;
                _insertItem.Parameters["$itemId"].Value = item.ItemId;
                _insertItem.Parameters["$count"].Value = item.Count;
                _insertItem.Parameters["$enchant"].Value = item.Enchant;
                _insertItem.ExecuteNonQuery();
            }

            foreach (uint skill in state.Skills)
            {
                _insertSkill.Parameters["$id"].Value = state.Id;
                _insertSkill.Parameters["$skill"].Value = skill;
                _insertSkill.ExecuteNonQuery();
            }

            foreach (SavedQuickslot quickslot in state.Quickslots)
            {
                _insertQuickslot.Parameters["$id"].Value = state.Id;
                _insertQuickslot.Parameters["$slot"].Value = quickslot.Slot;
                _insertQuickslot.Parameters["$kind"].Value = (int)quickslot.Kind;
                _insertQuickslot.Parameters["$value"].Value = quickslot.Id;
                _insertQuickslot.ExecuteNonQuery();
            }
        }

        private SqliteCommand Command(string sql, params (string Name, SqliteType Type)[] parameters)
        {
            SqliteCommand command = _connection.CreateCommand();
            command.CommandText = sql;
            foreach ((string name, SqliteType type) in parameters)
            {
                command.Parameters.Add(name, type);
            }

            return command;
        }

        private long Scalar(string sql)
        {
            using SqliteCommand command = _connection.CreateCommand();
            command.CommandText = sql;
            return (long)command.ExecuteScalar()!;
        }
    }
}
