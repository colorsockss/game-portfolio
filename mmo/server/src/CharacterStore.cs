using System;
using System.Collections.Generic;
using Microsoft.Data.Sqlite;
using PortfolioMmo.Contract;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 저장한 위치 하나.
    /// </summary>
    public readonly record struct SavedPosition(int X, int Z, uint Yaw);

    /// <summary>
    /// 저장한 캐릭터 하나. Id는 캐릭터 번호(개체 번호와 다르다)이고 LoginId는 그 캐릭터의 계정이다.
    /// </summary>
    public sealed record CharacterRecord(long Id, string LoginId, string Name, CharacterClass Class, SavedPosition Position);

    /// <summary>
    /// 캐릭터 만들기의 결과.
    /// </summary>
    public readonly record struct CreatedCharacter(CreateCharacterResultCode Result, CharacterRecord? Character);

    /// <summary>
    /// 계정의 캐릭터들과 그 마지막 위치를 두는 SQLite 저장소. 틱 스레드만 부르고, 연결 하나로 동기로 읽고 쓴다.
    /// </summary>
    public sealed class CharacterStore : IDisposable
    {
        /// <summary>
        /// s_schema[i]는 데이터베이스를 버전 i에서 i + 1로 올린다(PRAGMA user_version). 배포한 단계는 고치지 않는다.
        /// </summary>
        private static readonly string[] s_schema =
        {
            @"CREATE TABLE players (
                login_id TEXT PRIMARY KEY,
                x INTEGER NOT NULL,
                z INTEGER NOT NULL,
                yaw INTEGER NOT NULL
              ) WITHOUT ROWID;",
            // 계정 하나에 캐릭터 여럿(2026-11-11). 계정마다 하나였던 위치는 옮길 캐릭터가 없어 버린다.
            // 이름은 대소문자를 가리지 않고 하나다(NOCASE는 영문만 접는다).
            @"DROP TABLE players;
              CREATE TABLE characters (
                id INTEGER PRIMARY KEY,
                login_id TEXT NOT NULL,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE,
                class INTEGER NOT NULL,
                x INTEGER NOT NULL,
                z INTEGER NOT NULL,
                yaw INTEGER NOT NULL
              );
              CREATE INDEX characters_login_id ON characters (login_id);",
        };

        /// <summary>
        /// 데이터베이스 연결.
        /// </summary>
        private readonly SqliteConnection _connection;

        /// <summary>
        /// 계정의 캐릭터들을 만든 차례로 읽는 문장.
        /// </summary>
        private readonly SqliteCommand _list;

        /// <summary>
        /// 캐릭터 번호로 하나를 읽는 문장.
        /// </summary>
        private readonly SqliteCommand _load;

        /// <summary>
        /// 계정의 캐릭터 수를 세는 문장.
        /// </summary>
        private readonly SqliteCommand _count;

        /// <summary>
        /// 캐릭터를 넣는 문장. 이름이 겹치면 아무것도 하지 않는다.
        /// </summary>
        private readonly SqliteCommand _insert;

        /// <summary>
        /// 위치를 고쳐 쓰는 문장.
        /// </summary>
        private readonly SqliteCommand _savePosition;

        /// <summary>
        /// path의 SQLite 파일을 열고(":memory:"는 이 객체가 사는 동안만 남는다) 테이블을 만들거나 올린다.
        /// </summary>
        public CharacterStore(string path)
        {
            // 풀링하지 않아야 Dispose할 때 파일이 닫히고 WAL이 정리된다.
            var connectionString = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false };
            _connection = new SqliteConnection(connectionString.ToString());
            _connection.Open();
            // 틱 스레드가 커밋마다 fsync를 기다리지 않게 NORMAL이다. 전원이 나가면 마지막 커밋을 잃을 수 있지만 파일은 깨지지 않는다.
            Execute("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
            UpgradeSchema();

            const string Columns = "id, login_id, name, class, x, z, yaw";
            _list = Command($"SELECT {Columns} FROM characters WHERE login_id = $loginId ORDER BY id", ("$loginId", SqliteType.Text));
            _load = Command($"SELECT {Columns} FROM characters WHERE id = $id", ("$id", SqliteType.Integer));
            _count = Command("SELECT COUNT(*) FROM characters WHERE login_id = $loginId", ("$loginId", SqliteType.Text));
            _insert = Command(
                @"INSERT INTO characters (login_id, name, class, x, z, yaw) VALUES ($loginId, $name, $class, $x, $z, 0)
                  ON CONFLICT (name) DO NOTHING RETURNING id",
                ("$loginId", SqliteType.Text), ("$name", SqliteType.Text), ("$class", SqliteType.Integer), ("$x", SqliteType.Integer), ("$z", SqliteType.Integer));
            _savePosition = Command(
                "UPDATE characters SET x = $x, z = $z, yaw = $yaw WHERE id = $id",
                ("$id", SqliteType.Integer), ("$x", SqliteType.Integer), ("$z", SqliteType.Integer), ("$yaw", SqliteType.Integer));
        }

        /// <summary>
        /// 계정의 캐릭터들(만든 차례).
        /// </summary>
        public List<CharacterRecord> List(string loginId)
        {
            _list.Parameters["$loginId"].Value = loginId;
            using SqliteDataReader reader = _list.ExecuteReader();
            var characters = new List<CharacterRecord>();
            while (reader.Read())
            {
                characters.Add(Read(reader));
            }

            return characters;
        }

        /// <summary>
        /// 캐릭터 번호의 캐릭터. 없으면 null.
        /// </summary>
        public CharacterRecord? Load(long id)
        {
            _load.Parameters["$id"].Value = id;
            using SqliteDataReader reader = _load.ExecuteReader();
            return reader.Read() ? Read(reader) : null;
        }

        /// <summary>
        /// 계정에 캐릭터를 만든다. 수를 세고 넣는 것을 한 트랜잭션에서 하고, 이름이 겹쳤는지는 넣은 행이 있는지로 본다.
        /// 이름의 형식과 직업은 부르는 쪽이 검사한다.
        /// </summary>
        public CreatedCharacter Create(string loginId, string name, CharacterClass characterClass, int x, int z)
        {
            using SqliteTransaction transaction = _connection.BeginTransaction();
            _count.Transaction = transaction;
            _insert.Transaction = transaction;
            _count.Parameters["$loginId"].Value = loginId;
            if ((long)_count.ExecuteScalar()! >= (long)Constant.MaxCharacters)
            {
                return new CreatedCharacter(CreateCharacterResultCode.TooMany, null);
            }

            _insert.Parameters["$loginId"].Value = loginId;
            _insert.Parameters["$name"].Value = name;
            _insert.Parameters["$class"].Value = (int)characterClass;
            _insert.Parameters["$x"].Value = x;
            _insert.Parameters["$z"].Value = z;
            object? id = _insert.ExecuteScalar();
            if (id == null)
            {
                return new CreatedCharacter(CreateCharacterResultCode.NameTaken, null);
            }

            transaction.Commit();
            return new CreatedCharacter(
                CreateCharacterResultCode.Ok, new CharacterRecord((long)id, loginId, name, characterClass, new SavedPosition(x, z, 0)));
        }

        /// <summary>
        /// 플레이어들의 지금 위치를 한 트랜잭션으로 저장한다. 같은 캐릭터가 여러 번 있으면 뒤의 것이 남고, 실패하면 아무것도 남지 않는다.
        /// </summary>
        public void Save(IReadOnlyCollection<Player> players)
        {
            using SqliteTransaction transaction = _connection.BeginTransaction();
            _savePosition.Transaction = transaction;
            foreach (Player player in players)
            {
                _savePosition.Parameters["$id"].Value = player.CharacterId;
                _savePosition.Parameters["$x"].Value = player.X;
                _savePosition.Parameters["$z"].Value = player.Z;
                _savePosition.Parameters["$yaw"].Value = player.Yaw;
                _savePosition.ExecuteNonQuery();
            }

            transaction.Commit();
        }

        /// <summary>
        /// 문장과 연결을 닫는다.
        /// </summary>
        public void Dispose()
        {
            _list.Dispose();
            _load.Dispose();
            _count.Dispose();
            _insert.Dispose();
            _savePosition.Dispose();
            _connection.Dispose();
        }

        /// <summary>
        /// 읽은 행 하나(Columns의 차례).
        /// </summary>
        private static CharacterRecord Read(SqliteDataReader reader)
        {
            return new CharacterRecord(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.GetString(2),
                (CharacterClass)reader.GetInt32(3),
                new SavedPosition(reader.GetInt32(4), reader.GetInt32(5), (uint)reader.GetInt64(6)));
        }

        /// <summary>
        /// 매개변수를 정해 둔 문장.
        /// </summary>
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

        /// <summary>
        /// 결과를 읽지 않는 SQL을 실행한다.
        /// </summary>
        private void Execute(string sql)
        {
            using SqliteCommand command = _connection.CreateCommand();
            command.CommandText = sql;
            command.ExecuteNonQuery();
        }

        /// <summary>
        /// 아직 지나지 않은 스키마 단계를 단계마다 한 트랜잭션으로 실행한다.
        /// </summary>
        private void UpgradeSchema()
        {
            long version;
            using (SqliteCommand command = _connection.CreateCommand())
            {
                command.CommandText = "PRAGMA user_version";
                version = (long)command.ExecuteScalar()!;
            }

            if (version > s_schema.Length)
            {
                throw new InvalidOperationException($"The database is at schema {version}; this server knows up to {s_schema.Length}.");
            }

            for (long step = version; step < s_schema.Length; step++)
            {
                using SqliteTransaction transaction = _connection.BeginTransaction();
                using SqliteCommand command = _connection.CreateCommand();
                command.Transaction = transaction;
                command.CommandText = $"{s_schema[step]} PRAGMA user_version = {step + 1};";
                command.ExecuteNonQuery();
                transaction.Commit();
            }
        }
    }
}
