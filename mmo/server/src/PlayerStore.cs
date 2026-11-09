using System;
using System.Collections.Generic;
using Microsoft.Data.Sqlite;

namespace PortfolioMmo.Server
{
    /// <summary>
    /// 저장한 위치 하나.
    /// </summary>
    public readonly record struct SavedPosition(int X, int Z, uint Yaw);

    /// <summary>
    /// 플레이어의 마지막 위치를 두는 SQLite 저장소. 틱 스레드만 부르고, 연결 하나로 동기로 읽고 쓴다.
    /// </summary>
    public sealed class PlayerStore : IDisposable
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
        };

        /// <summary>
        /// 데이터베이스 연결.
        /// </summary>
        private readonly SqliteConnection _connection;

        /// <summary>
        /// 로그인 ID로 위치를 읽는 문장.
        /// </summary>
        private readonly SqliteCommand _select;

        /// <summary>
        /// 위치를 넣거나 덮어쓰는 문장.
        /// </summary>
        private readonly SqliteCommand _upsert;

        /// <summary>
        /// path의 SQLite 파일을 열고(":memory:"는 이 객체가 사는 동안만 남는다) 테이블을 만들거나 올린다.
        /// </summary>
        public PlayerStore(string path)
        {
            // 풀링하지 않아야 Dispose할 때 파일이 닫히고 WAL이 정리된다.
            var connectionString = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false };
            _connection = new SqliteConnection(connectionString.ToString());
            _connection.Open();
            // 틱 스레드가 커밋마다 fsync를 기다리지 않게 NORMAL이다. 전원이 나가면 마지막 커밋을 잃을 수 있지만 파일은 깨지지 않는다.
            Execute("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
            UpgradeSchema();

            _select = _connection.CreateCommand();
            _select.CommandText = "SELECT x, z, yaw FROM players WHERE login_id = $loginId";
            _select.Parameters.Add("$loginId", SqliteType.Text);

            _upsert = _connection.CreateCommand();
            _upsert.CommandText = @"INSERT INTO players (login_id, x, z, yaw) VALUES ($loginId, $x, $z, $yaw)
                ON CONFLICT (login_id) DO UPDATE SET x = excluded.x, z = excluded.z, yaw = excluded.yaw";
            _upsert.Parameters.Add("$loginId", SqliteType.Text);
            _upsert.Parameters.Add("$x", SqliteType.Integer);
            _upsert.Parameters.Add("$z", SqliteType.Integer);
            _upsert.Parameters.Add("$yaw", SqliteType.Integer);
        }

        /// <summary>
        /// 저장한 위치. 저장한 적이 없으면 null.
        /// </summary>
        public SavedPosition? Load(string loginId)
        {
            _select.Parameters["$loginId"].Value = loginId;
            using SqliteDataReader reader = _select.ExecuteReader();
            if (!reader.Read())
            {
                return null;
            }

            return new SavedPosition(reader.GetInt32(0), reader.GetInt32(1), (uint)reader.GetInt64(2));
        }

        /// <summary>
        /// 플레이어들의 지금 위치를 한 트랜잭션으로 저장한다. 같은 ID가 여러 번 있으면 뒤의 것이 남고, 실패하면 아무것도 남지 않는다.
        /// </summary>
        public void Save(IReadOnlyCollection<Player> players)
        {
            using SqliteTransaction transaction = _connection.BeginTransaction();
            _upsert.Transaction = transaction;
            foreach (Player player in players)
            {
                _upsert.Parameters["$loginId"].Value = player.LoginId;
                _upsert.Parameters["$x"].Value = player.X;
                _upsert.Parameters["$z"].Value = player.Z;
                _upsert.Parameters["$yaw"].Value = player.Yaw;
                _upsert.ExecuteNonQuery();
            }

            transaction.Commit();
        }

        /// <summary>
        /// 문장과 연결을 닫는다.
        /// </summary>
        public void Dispose()
        {
            _select.Dispose();
            _upsert.Dispose();
            _connection.Dispose();
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
