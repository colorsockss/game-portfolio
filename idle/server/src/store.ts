import { DatabaseSync } from "node:sqlite";
import type { PlayerSnapshot, PlayerState } from "@idle/game-core";
import { MAX_UNANSWERED_COMMANDS } from "@idle/protocol";
import { decodeSave, encodeSave } from "./save.js";

export interface Account {
  readonly id: number;
  readonly loginId: string;
}

export interface StoredSession {
  readonly account: Account;
  readonly expiresAt: number;
}

/**
 * 계정과 그 저장 데이터. 데이터베이스 서버처럼 모든 호출이 비동기이므로, 호출하는 쪽을 바꾸지
 * 않고 이 인터페이스 뒤의 SQLite를 다른 데이터베이스로 바꿀 수 있다.
 */
export interface Store {
  findAccount(loginId: string): Promise<Account | undefined>;
  /**
   * `player`를 첫 저장 데이터(revision 1)로 하는 계정을 만든다. 로그인 ID가 이미 있으면
   * undefined이며, 다른 요청이 먼저 계정을 만든 경우다.
   */
  createAccount(loginId: string, player: PlayerState, now: number): Promise<Account | undefined>;
  load(accountId: number): Promise<PlayerSnapshot | undefined>;
  /**
   * `player`를 `revision` 다음 저장 데이터로 저장한다. 저장된 데이터가 더는 `revision`이 아니면
   * undefined이며, 다른 요청이 먼저 저장했으므로 이 요청은 새 저장 데이터부터 다시 해야 한다.
   */
  save(accountId: number, player: PlayerState, revision: number, now: number): Promise<PlayerSnapshot | undefined>;
  /**
   * `tokenHash`를 `expiresAt`까지 계정의 유일한 세션으로 만들고, 이전 세션은 끝낸다. 이전 세션의
   * 커맨드 결과도 함께 사라진다. 새 세션은 요청 번호를 처음부터 다시 매긴다.
   */
  startSession(accountId: number, tokenHash: Uint8Array, expiresAt: number): Promise<void>;
  /** 이 토큰 해시의 세션. 아직 그 계정의 현재 세션일 때만 찾는다. */
  findSession(tokenHash: Uint8Array): Promise<StoredSession | undefined>;
  /** 계정의 현재 세션에서 커맨드 요청에 기록된 결과. */
  findResult(accountId: number, requestId: string): Promise<Uint8Array | undefined>;
  /** 커맨드 요청의 결과를 기록한다. 계정마다 최근 MAX_UNANSWERED_COMMANDS개를 둔다. */
  recordResult(accountId: number, requestId: string, result: Uint8Array): Promise<void>;
  /**
   * `work`를 트랜잭션 안에서 실행한다. `tx`로 저장한 것은 모두 남고, `work`가 throw하면 아무것도
   * 남지 않는다. 안에서는 `tx`를 불러야 하며, 이 저장소를 부르면 트랜잭션이 끝나기를 기다린다.
   */
  transaction<T>(work: (tx: Store) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// schema[i]는 데이터베이스를 버전 i에서 i + 1로 올린다(PRAGMA user_version). 배포한 단계는 고치지
// 않는다. 그 단계를 이미 지난 데이터베이스는 다시 실행하지 않는다.
const schema: readonly string[] = [
  `CREATE TABLE accounts (
     id INTEGER PRIMARY KEY,
     login_id TEXT NOT NULL UNIQUE,
     created_at INTEGER NOT NULL
   );
   CREATE TABLE players (
     account_id INTEGER PRIMARY KEY REFERENCES accounts (id),
     revision INTEGER NOT NULL,
     save BLOB NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // 계정마다 한 줄이므로, 세션을 시작하면 이전 세션이 대체된다.
  `CREATE TABLE sessions (
     account_id INTEGER PRIMARY KEY REFERENCES accounts (id),
     token_hash BLOB NOT NULL UNIQUE,
     expires_at INTEGER NOT NULL
   );`,
  // 커맨드 요청마다 둔 그 답. 다시 보낸 요청에는 실행하지 않고 같은 답을 준다.
  `CREATE TABLE command_results (
     account_id INTEGER NOT NULL REFERENCES accounts (id),
     request_id TEXT NOT NULL,
     result BLOB NOT NULL,
     PRIMARY KEY (account_id, request_id)
   );`,
];

/**
 * `path`의 SQLite 저장소를 열고(":memory:"는 프로세스가 사는 동안만 남는 저장소) 테이블을 만들거나
 * 올린다. 저장 데이터는 save.ts의 저장 형식으로 보관한다.
 */
export async function openStore(path: string): Promise<Store> {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  await upgradeSchema(db);

  const selectAccount = db.prepare("SELECT id, login_id FROM accounts WHERE login_id = ?");
  const insertAccount = db.prepare("INSERT INTO accounts (login_id, created_at) VALUES (?, ?) ON CONFLICT (login_id) DO NOTHING");
  const insertPlayer = db.prepare("INSERT INTO players (account_id, revision, save, updated_at) VALUES (?, 1, ?, ?)");
  const selectPlayer = db.prepare("SELECT revision, save FROM players WHERE account_id = ?");
  // 호출한 쪽이 읽은 revision에서만 넘어간다. 그 사이 다른 저장이 있었다면 아무것도 바꾸지 않는다.
  const updatePlayer = db.prepare("UPDATE players SET revision = revision + 1, save = ?, updated_at = ? WHERE account_id = ? AND revision = ?");
  const upsertSession = db.prepare(`INSERT INTO sessions (account_id, token_hash, expires_at) VALUES (?, ?, ?)
    ON CONFLICT (account_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at`);
  const selectSession = db.prepare(`SELECT accounts.id, accounts.login_id, sessions.expires_at
    FROM sessions JOIN accounts ON accounts.id = sessions.account_id WHERE sessions.token_hash = ?`);
  const deleteResults = db.prepare("DELETE FROM command_results WHERE account_id = ?");
  const selectResult = db.prepare("SELECT result FROM command_results WHERE account_id = ? AND request_id = ?");
  const insertResult = db.prepare("INSERT INTO command_results (account_id, request_id, result) VALUES (?, ?, ?)");
  // rowid는 insert할 때마다 커지므로, 가장 큰 것들이 최신이다.
  const pruneResults = db.prepare(`DELETE FROM command_results WHERE account_id = ? AND rowid NOT IN
    (SELECT rowid FROM command_results WHERE account_id = ? ORDER BY rowid DESC LIMIT ${MAX_UNANSWERED_COMMANDS})`);

  // node:sqlite는 문장 하나를 끝까지 실행하고서 돌아오므로, 이 메서드들은 중간에 멈추지 않는다.
  // 트랜잭션 안의 작업은 이것을 직접 받는다.
  const direct: Store = {
    async findAccount(loginId) {
      const row = selectAccount.get(loginId);
      return row && { id: row.id as number, loginId: row.login_id as string };
    },
    async createAccount(loginId, player, now) {
      return transaction(db, async () => {
        const { changes, lastInsertRowid } = insertAccount.run(loginId, now);
        if (changes === 0) return undefined;
        const id = Number(lastInsertRowid);
        insertPlayer.run(id, encodeSave(player), now);
        return { id, loginId };
      });
    },
    async load(accountId) {
      const row = selectPlayer.get(accountId);
      return row && { player: decodeSave(row.save as Uint8Array), revision: row.revision as number };
    },
    async save(accountId, player, revision, now) {
      const { changes } = updatePlayer.run(encodeSave(player), now, accountId, revision);
      return changes === 0 ? undefined : { player, revision: revision + 1 };
    },
    async startSession(accountId, tokenHash, expiresAt) {
      await transaction(db, async () => {
        upsertSession.run(accountId, tokenHash, expiresAt);
        deleteResults.run(accountId);
      });
    },
    async findSession(tokenHash) {
      const row = selectSession.get(tokenHash);
      return row && { account: { id: row.id as number, loginId: row.login_id as string }, expiresAt: row.expires_at as number };
    },
    async findResult(accountId, requestId) {
      return selectResult.get(accountId, requestId)?.result as Uint8Array | undefined;
    },
    async recordResult(accountId, requestId, result) {
      await transaction(db, async () => {
        insertResult.run(accountId, requestId, result);
        pruneResults.run(accountId, accountId);
      });
    },
    transaction: work => transaction(db, () => work(direct)),
    async close() {
      db.close();
    },
  };

  // 연결 하나가 모든 호출을 받는다. 트랜잭션이 await하는 동안 다른 호출의 문장이 그 안에서
  // 실행될 수 있으므로, 바깥 호출은 앞의 호출이 끝난 뒤에 차례로 실행한다.
  let last: Promise<unknown> = Promise.resolve();
  function exclusive<T>(call: () => Promise<T>): Promise<T> {
    const result = last.then(call);
    last = result.catch(() => undefined);
    return result;
  }

  return {
    findAccount: loginId => exclusive(() => direct.findAccount(loginId)),
    createAccount: (loginId, player, now) => exclusive(() => direct.createAccount(loginId, player, now)),
    load: accountId => exclusive(() => direct.load(accountId)),
    save: (accountId, player, revision, now) => exclusive(() => direct.save(accountId, player, revision, now)),
    startSession: (accountId, tokenHash, expiresAt) => exclusive(() => direct.startSession(accountId, tokenHash, expiresAt)),
    findSession: tokenHash => exclusive(() => direct.findSession(tokenHash)),
    findResult: (accountId, requestId) => exclusive(() => direct.findResult(accountId, requestId)),
    recordResult: (accountId, requestId, result) => exclusive(() => direct.recordResult(accountId, requestId, result)),
    transaction: work => exclusive(() => direct.transaction(work)),
    close: () => exclusive(() => direct.close()),
  };
}

async function upgradeSchema(db: DatabaseSync): Promise<void> {
  const version = db.prepare("PRAGMA user_version").get()?.user_version as number;
  if (version > schema.length) throw new Error(`The database is at schema ${version}; this server knows up to ${schema.length}.`);
  for (let step = version; step < schema.length; step++) {
    await transaction(db, async () => db.exec(`${schema[step]} PRAGMA user_version = ${step + 1};`));
  }
}

// BEGIN 대신 세이브포인트를 쓰므로 트랜잭션이 중첩된다. 바깥 트랜잭션이 안쪽 것을 유지하거나 버린다.
async function transaction<T>(db: DatabaseSync, work: () => Promise<T>): Promise<T> {
  db.exec("SAVEPOINT work");
  try {
    const result = await work();
    db.exec("RELEASE work");
    return result;
  } catch (error) {
    db.exec("ROLLBACK TO work; RELEASE work");
    throw error;
  }
}

