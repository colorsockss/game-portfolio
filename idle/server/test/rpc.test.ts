import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decode, encode } from "@msgpack/msgpack";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { HOUR, NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, playerFingerprint, settle } from "@idle/game-core";
import { CloseCode, ResultCode, decodeMessage, encodeMessage } from "@idle/protocol";
import { describe, expect, test, vi } from "vitest";
import type { Logger } from "../src/log.js";
import { createRpc, type Connection, type Peer } from "../src/rpc.js";
import { SAVE_VERSION, createPlayer } from "../src/save.js";
import { openStore, type Store } from "../src/store.js";
import { loadTestData } from "../src/testing.js";

const shipped = await loadTestData();
// 요청 처리를 보는 테스트라서 새 계정도 아무 스테이지로나 옮기게 해금 조건을 지운다. 해금 거절은 shipped로 본다.
const data = {
  ...shipped,
  stages: new Map([...shipped.stages].map(([id, row]) => [id, { ...row, unlockStageId: null, unlockLevel: null }])),
};
const DAY = 24 * 60 * 60 * 1000;
let time = 1_000_000;
const clock = { now: () => time };

function collect(): Logger & { errors: string[] } {
  const errors: string[] = [];
  return { errors, debug() {}, info() {}, warn() {}, error: message => errors.push(message) };
}

// 서버가 닫을 때 쓴 종료 코드를 기록하는 피어.
function peer(name = "test"): Peer & { closes: CloseCode[] } {
  const closes: CloseCode[] = [];
  return { name, closes, close: code => void closes.push(code) };
}

async function call(connection: Connection, op: Opcode, id: string, body: object): Promise<unknown> {
  return decodeMessage(await connection.receive(encodeMessage({ op, id, body })));
}

async function savedOf(store: Store, loginId: string) {
  return store.load((await store.findAccount(loginId))!.id);
}

// 다음 `races`번의 읽기마다, 읽은 직후 다른 요청이 그 계정을 저장하는 저장소.
function racing(store: Store): Store & { races: number } {
  const raced = {
    ...store,
    races: 0,
    async load(accountId: number) {
      const saved = await store.load(accountId);
      if (saved && raced.races > 0) {
        raced.races--;
        const { player, revision } = saved;
        await store.save(accountId, { ...player, profile: { ...player.profile, level: player.profile.level + 1 } }, revision, time);
      }
      return saved;
    },
  };
  return raced;
}

// `hold`가 설정된 동안 트랜잭션을 기다리게 하는 저장소. 요청들이 쓰는 지점에 나란히 서게 할 수
// 있다. `waiting`은 붙잡힌 트랜잭션 수다.
function holding(store: Store): Store & { hold?: Promise<void>; waiting: number } {
  const held = {
    ...store,
    hold: undefined as Promise<void> | undefined,
    waiting: 0,
    async transaction<T>(work: (tx: Store) => Promise<T>): Promise<T> {
      if (held.hold) {
        held.waiting++;
        await held.hold;
      }
      return store.transaction(work);
    },
  };
  return held;
}

// 세션을 찾은 직후마다 `between`을 부르고 다음 매크로태스크까지 기다리는 저장소. 그동안 저장소가
// 다른 호출을 막고 있지 않으면, `between`이 시작한 요청은 그 사이에 끝까지 처리된다.
function pausingAfterFindSession(store: Store, between: () => void): Store {
  return {
    ...store,
    async findSession(tokenHash) {
      const session = await store.findSession(tokenHash);
      between();
      await new Promise(resolve => setTimeout(resolve, 0));
      return session;
    },
    transaction: work => store.transaction(tx => work(pausingAfterFindSession(tx, between))),
  };
}

// 저장 데이터를 읽은 직후마다 `between`을 부르고, true면 다음 매크로태스크까지 기다리는 저장소(위와 같은 방식).
// `between`이 시작한 요청 자신의 읽기는 기다리지 않게 false를 돌려준다.
function pausingAfterLoad(store: Store, between: () => boolean): Store {
  return {
    ...store,
    async load(accountId) {
      const saved = await store.load(accountId);
      if (between()) await new Promise(resolve => setTimeout(resolve, 0));
      return saved;
    },
    transaction: work => store.transaction(tx => work(pausingAfterLoad(tx, between))),
  };
}

describe("commands", () => {
  test("start over from the newer save when another request saved in between", async () => {
    const store = await openStore(":memory:");
    const raced = racing(store);
    const connection = createRpc({ store: raced, clock, data, log: collect() }).connect(peer());
    await call(connection, Opcode.AuthLogin, "1", { loginId: "hero" });
    raced.races = 1;

    expect(await call(connection, Opcode.StageSelect, "2", { stageId: 3002 })).toMatchObject({
      code: ResultCode.Ok, sync: { revision: 3, changes: { stage: { currentId: 3002 } } },
    });
    // 어느 쪽 변경도 사라지지 않는다. 커맨드가 다른 요청의 저장 데이터 위에 적용됐다.
    expect(await savedOf(store, "hero")).toMatchObject({ revision: 3, player: { profile: { level: 2 }, stage: { currentId: 3002 } } });
  });

  test("fail without applying when they keep losing the race", async () => {
    const store = await openStore(":memory:");
    const log = collect();
    const raced = racing(store);
    const connection = createRpc({ store: raced, clock, data, log }).connect(peer());
    await call(connection, Opcode.AuthLogin, "1", { loginId: "hero" });
    raced.races = Infinity;

    expect(await call(connection, Opcode.StageSelect, "2", { stageId: 3002 })).toMatchObject({ code: ResultCode.ServerError });
    expect(log.errors).toEqual([expect.stringMatching(/StageSelect#2 failed/)]);
    expect((await savedOf(store, "hero"))?.player.stage.currentId).not.toBe(3002);
    expect(await store.findResult((await store.findAccount("hero"))!.id, "2")).toBeUndefined();
  });

  test("that are refused or change nothing save nothing", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data: shipped, log: collect() }).connect(peer());
    const login = await call(connection, Opcode.AuthLogin, "1", { loginId: "hero" }) as { body: { snapshot: { player: { stage: { currentId: number } } } } };

    expect(await call(connection, Opcode.StageSelect, "2", { stageId: 9999 }))
      .toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.StageNotFound } });
    // 새 계정은 3001을 클리어하지 않았다.
    expect(await call(connection, Opcode.StageSelect, "3", { stageId: 3002 }))
      .toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.StageLocked } });
    expect(await call(connection, Opcode.StageSelect, "4", { stageId: login.body.snapshot.player.stage.currentId }))
      .toMatchObject({ code: ResultCode.Ok, sync: { revision: 1, changes: {} } });
    expect((await savedOf(store, "hero"))?.revision).toBe(1);
  });

  // 재연결 전후 두 연결의 요청은 동시에 돈다. 둘 다 revision 1에서 계산하고, 늦게 쓰는 쪽은 밀려 먼저 쓴 저장
  // 데이터 위에서 다시 적용하므로 어느 변경도 사라지지 않는다.
  test("from the connections before and after a reconnect at the same time both apply, the later on the newer save", async () => {
    const store = await openStore(":memory:");
    const held = holding(store);
    const rpc = createRpc({ store: held, clock, data, log: collect() });
    const old = rpc.connect(peer("old"));
    const login = await call(old, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };

    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const moved = call(old, Opcode.StageSelect, "1", { stageId: 3002 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token: login.body.session.token });
    held.hold = hold;
    const advanced = call(resumed, Opcode.TutorialAdvance, "2", { stepId: 1 });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await moved).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { stage: { currentId: 3002 } } } });
    expect(await advanced).toMatchObject({ code: ResultCode.Ok, sync: { revision: 3, changes: { tutorial: { stepId: 2 } } } });
    expect(await savedOf(store, "hero")).toMatchObject({ revision: 3, player: { stage: { currentId: 3002 }, tutorial: { stepId: 2 } } });
  });

  test("on one connection are handled in the order received, even when sent at once", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    await call(connection, Opcode.AuthLogin, "1", { loginId: "hero" });

    const answers = await Promise.all([3002, 3003, 3002].map((stageId, i) => call(connection, Opcode.StageSelect, `c${i}`, { stageId })));
    expect(answers.map(answer => (answer as { sync: { revision: number } }).sync.revision)).toEqual([2, 3, 4]);
    expect(await savedOf(store, "hero")).toMatchObject({ revision: 4, player: { stage: { currentId: 3002 } } });
  });
});

describe("sessions", () => {
  interface Login {
    readonly body: { readonly session: { readonly token: string; readonly expiresAt: number } };
  }

  async function setUp() {
    time = 1_000_000;
    return createRpc({ store: await openStore(":memory:"), clock, data, log: collect() });
  }

  test("a login's token continues its session on a new connection, which takes over", async () => {
    const rpc = await setUp();
    const first = peer("first");
    const firstConnection = rpc.connect(first);
    const { body } = await call(firstConnection, Opcode.AuthLogin, "1", { loginId: "hero" }) as Login;
    expect(body.session.expiresAt).toBe(time + DAY);

    const second = rpc.connect(peer("second"));
    expect(await call(second, Opcode.AuthResume, "1", { token: body.session.token }))
      .toMatchObject({ code: ResultCode.Ok, body: { revision: 1, player: { profile: { loginId: "hero" } } } });
    expect(await call(second, Opcode.StageSelect, "2", { stageId: 3002 })).toMatchObject({ code: ResultCode.Ok });

    // 계정당 연결은 하나다. 첫 연결은 닫혔고 더는 그 계정으로 동작하지 않는다.
    expect(first.closes).toEqual([CloseCode.SessionReplaced]);
    expect(await call(firstConnection, Opcode.StageSelect, "2", { stageId: 3003 })).toMatchObject({ code: ResultCode.BadRequest });
  });

  test("logging in elsewhere ends the earlier session", async () => {
    const rpc = await setUp();
    const first = peer("first");
    const old = await call(rpc.connect(first), Opcode.AuthLogin, "1", { loginId: "hero" }) as Login;
    const current = await call(rpc.connect(peer("second")), Opcode.AuthLogin, "1", { loginId: "hero" }) as Login;
    expect(first.closes).toEqual([CloseCode.SessionReplaced]);

    expect(await call(rpc.connect(peer()), Opcode.AuthResume, "1", { token: old.body.session.token }))
      .toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.SessionReplaced } });
    expect(await call(rpc.connect(peer()), Opcode.AuthResume, "1", { token: current.body.session.token }))
      .toMatchObject({ code: ResultCode.Ok });
  });

  test("a token stops working when it expires", async () => {
    const rpc = await setUp();
    const { body } = await call(rpc.connect(peer()), Opcode.AuthLogin, "1", { loginId: "hero" }) as Login;

    time = body.session.expiresAt - 1;
    expect(await call(rpc.connect(peer()), Opcode.AuthResume, "1", { token: body.session.token })).toMatchObject({ code: ResultCode.Ok });
    time = body.session.expiresAt;
    expect(await call(rpc.connect(peer()), Opcode.AuthResume, "1", { token: body.session.token }))
      .toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.SessionExpired } });
  });

  test("a login that lands while a resume checks its token keeps its connection", async () => {
    time = 1_000_000;
    let between = () => {};
    const store = pausingAfterFindSession(await openStore(":memory:"), () => between());
    const rpc = createRpc({ store, clock, data, log: collect() });
    const { body } = await call(rpc.connect(peer("first")), Opcode.AuthLogin, "1", { loginId: "hero" }) as Login;

    const elsewhere = peer("elsewhere");
    const loggingIn = rpc.connect(elsewhere);
    let login: Promise<unknown> | undefined;
    between = () => {
      between = () => {};
      login = call(loggingIn, Opcode.AuthLogin, "1", { loginId: "hero" });
    };
    const resumer = peer("resumer");
    await call(rpc.connect(resumer), Opcode.AuthResume, "1", { token: body.session.token });
    await login;

    // 로그인이 시작한 세션이 마지막 세션이다. 그 연결이 남고, 끝난 세션으로 재개한 연결이 닫힌다.
    expect(elsewhere.closes).toEqual([]);
    expect(resumer.closes).toEqual([CloseCode.SessionReplaced]);
    expect(await call(loggingIn, Opcode.StageSelect, "2", { stageId: 3002 })).toMatchObject({ code: ResultCode.Ok });
  });

  // 로그인이 저장 데이터를 읽은 뒤 세션을 시작하기 전에 옛 세션의 커맨드가 저장하면, 로그인이 돌려준 저장 데이터가 이미 낡는다.
  test("a login's snapshot is the save its session starts from, even if the old session's command lands meanwhile", async () => {
    time = 1_000_000;
    let between = () => false;
    const log = collect();
    const store = pausingAfterLoad(await openStore(":memory:"), () => between());
    const rpc = createRpc({ store, clock, data, log });
    const old = rpc.connect(peer("old"));
    await call(old, Opcode.AuthLogin, "1", { loginId: "hero" });

    let command: Promise<unknown> | undefined;
    between = () => {
      between = () => false;
      command = call(old, Opcode.StageSelect, "2", { stageId: 3002 });
      return true;
    };
    const login = await call(rpc.connect(peer("new")), Opcode.AuthLogin, "1", { loginId: "hero" }) as { body: { snapshot: { revision: number } } };

    expect(await command).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.SessionReplaced } });
    expect(login.body.snapshot.revision).toBe((await savedOf(store, "hero"))?.revision);
    expect(log.errors).toEqual([]);
  });

  test("a closed connection lets go of its account, even if a login was still on its way", async () => {
    const rpc = await setUp();
    const first = peer("first");
    const connection = rpc.connect(first);
    const login = call(connection, Opcode.AuthLogin, "1", { loginId: "hero" });
    connection.closed();
    await login;

    await call(rpc.connect(peer("second")), Opcode.AuthLogin, "1", { loginId: "hero" });
    expect(first.closes).toEqual([]);
  });

  // 함께 와도 로그인은 한 트랜잭션이라 차례로 돌고, 늦은 쪽은 먼저 만든 계정을 찾는다.
  test("two logins that create the same new account at once share it, and the later one keeps the connection", async () => {
    const store = await openStore(":memory:");
    const rpc = createRpc({ store, clock, data, log: collect() });
    const first = peer("first");
    const second = peer("second");
    const answers = await Promise.all([first, second].map(each => call(rpc.connect(each), Opcode.AuthLogin, "1", { loginId: "hero" })));

    for (const answer of answers) {
      expect(answer).toMatchObject({ code: ResultCode.Ok, body: { snapshot: { revision: 1, player: { profile: { loginId: "hero" } } } } });
    }
    expect((await store.findAccount("hero"))?.id).toBe(1);
    expect(first.closes).toEqual([CloseCode.SessionReplaced]);
    expect(second.closes).toEqual([]);
  });

  test("login IDs follow game-core's rule", async () => {
    const rpc = await setUp();
    for (const loginId of ["abc", "Hero", "hero!", "a".repeat(17), 42, ""]) {
      expect(await call(rpc.connect(peer()), Opcode.AuthLogin, "1", { loginId })).toMatchObject({ code: ResultCode.BadRequest });
    }
    expect(await call(rpc.connect(peer()), Opcode.AuthLogin, "1", { loginId: "hero_0123456789" })).toMatchObject({ code: ResultCode.Ok });
  });
});

describe("repeated command requests", () => {
  interface Login {
    readonly body: { readonly session: { readonly token: string } };
  }

  async function setUp() {
    const store = await openStore(":memory:");
    const rpc = createRpc({ store, clock, data, log: collect() });
    const connection = rpc.connect(peer());
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" }) as Login;
    return { rpc, connection, token: login.body.session.token, saved: () => savedOf(store, "hero") };
  }

  test("get the first answer again and do not run again", async () => {
    const { connection, saved } = await setUp();
    const first = await call(connection, Opcode.StageSelect, "1", { stageId: 3002 });
    expect(first).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { stage: { currentId: 3002 } } } });
    await call(connection, Opcode.StageSelect, "2", { stageId: 3003 });

    expect(await call(connection, Opcode.StageSelect, "1", { stageId: 3002 })).toEqual({ ...(first as object), serverTime: time });
    expect(await saved()).toMatchObject({ revision: 3, player: { stage: { currentId: 3003 } } });
  });

  test("refused ones are refused again the same way", async () => {
    const { connection } = await setUp();
    const refused = await call(connection, Opcode.StageSelect, "1", { stageId: 9999 });
    expect(refused).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.StageNotFound } });
    expect(await call(connection, Opcode.StageSelect, "1", { stageId: 9999 })).toEqual(refused);
  });

  test("are recognized after resuming on a new connection, but not after a new login", async () => {
    const { rpc, connection, token, saved } = await setUp();
    await call(connection, Opcode.StageSelect, "1", { stageId: 3002 });

    const resumed = rpc.connect(peer());
    await call(resumed, Opcode.AuthResume, "resume", { token });
    expect(await call(resumed, Opcode.StageSelect, "1", { stageId: 3002 })).toMatchObject({ sync: { revision: 2 } });
    expect((await saved())?.revision).toBe(2);

    // 새로 로그인하면 요청 번호를 처음부터 다시 매기므로 "1"은 새 요청이다.
    const relogged = rpc.connect(peer());
    await call(relogged, Opcode.AuthLogin, "login", { loginId: "hero" });
    expect(await call(relogged, Opcode.StageSelect, "1", { stageId: 3003 })).toMatchObject({ sync: { revision: 3 } });
  });

  // 재연결한 뒤 클라이언트가 답을 못 받은 요청을 다시 보내는데, 서버는 그 요청을 옛 연결에서 아직
  // 처리 중일 수 있다. 둘 중 나중에 쓰는 쪽은 커맨드를 다시 실행하거나 기록된 id 때문에 실패하는
  // 대신 먼저 쓴 쪽의 답으로 답한다.
  test.each([
    { outcome: "accepted", stageId: 3002 },
    { outcome: "refused", stageId: 9999 },
  ])("sent again while the first still runs on the old connection get its answer ($outcome)", async ({ stageId }) => {
    const store = await openStore(":memory:");
    const held = holding(store);
    const log = collect();
    const rpc = createRpc({ store: held, clock, data, log });
    const old = rpc.connect(peer("old"));
    const login = await call(old, Opcode.AuthLogin, "login", { loginId: "hero" }) as Login;

    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const first = call(old, Opcode.StageSelect, "1", { stageId });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    // 재개도 트랜잭션을 쓰므로 재개하는 동안만 붙잡지 않는다.
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token: login.body.session.token });
    held.hold = hold;
    const again = call(resumed, Opcode.StageSelect, "1", { stageId });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await again).toEqual(await first);
    expect(log.errors).toEqual([]);
    expect((await savedOf(store, "hero"))?.revision).toBe(stageId === 9999 ? 1 : 2);
  });

  // 새 로그인은 요청 번호를 처음부터 다시 매긴다. 옛 세션의 커맨드가 그 뒤에 답을 기록하면, 새 세션이 같은
  // id로 보낸 커맨드가 실행되지 않고 그 답을 받는다.
  test("from a session that a new login replaced while they ran are refused, not recorded for the new session", async () => {
    const store = await openStore(":memory:");
    const held = holding(store);
    const log = collect();
    const rpc = createRpc({ store: held, clock, data, log });
    const old = rpc.connect(peer("old"));
    await call(old, Opcode.AuthLogin, "login", { loginId: "hero" });

    let release!: () => void;
    held.hold = new Promise<void>(resolve => (release = resolve));
    const first = call(old, Opcode.StageSelect, "1", { stageId: 3002 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    // 로그인도 트랜잭션을 쓰므로 로그인하는 동안은 붙잡지 않는다. 옛 커맨드는 처음 붙잡힌 채로 기다린다.
    held.hold = undefined;
    const relogged = rpc.connect(peer("new"));
    await call(relogged, Opcode.AuthLogin, "login", { loginId: "hero" });
    release();

    expect(await first).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.SessionReplaced } });
    expect(await call(relogged, Opcode.StageSelect, "1", { stageId: 3003 })).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2 } });
    expect(await savedOf(store, "hero")).toMatchObject({ revision: 2, player: { stage: { currentId: 3003 } } });
    expect(log.errors).toEqual([]);
  });

  test("need an id of at most 64 characters", async () => {
    const { connection } = await setUp();
    expect(await call(connection, Opcode.StageSelect, "x".repeat(65), { stageId: 3002 })).toMatchObject({ code: ResultCode.BadRequest });
    expect(await call(connection, Opcode.StageSelect, "", { stageId: 3002 })).toMatchObject({ code: ResultCode.BadRequest });
  });
});

// 오프라인 보상은 낡은 체크포인트를 정산하는 커맨드가 지급하므로 커맨드처럼 한 번만 처리된다. 지급 기록은
// 체크포인트의 시각이고, 보유량·레벨과 같은 저장에서 옮겨진다.
describe("offline rewards", () => {
  async function setUp(store: Store) {
    time = 1_000_000;
    const rpc = createRpc({ store, clock, data, log: collect() });
    const connection = rpc.connect(peer("old"));
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };
    const before = (await store.load((await store.findAccount("hero"))!.id))!.player;
    time += 3 * HOUR;
    return { rpc, connection, token: login.body.session.token, paid: settle(before, data, time) };
  }

  test("are paid by the first settle after a long absence, once", async () => {
    const store = await openStore(":memory:");
    const { connection, paid } = await setUp(store);
    expect(Big.sign(paid.items[1])).toBe(1);
    expect(paid.profile.level).toBeGreaterThan(1);

    const first = await call(connection, Opcode.BattleSettle, "1", {});
    expect(first).toMatchObject({
      code: ResultCode.Ok, sync: { revision: 2, changes: { items: paid.items, profile: paid.profile, battle: { at: time } } },
    });
    // 다시 보낸 요청은 처음 답을 받고, 새 정산은 옮겨진 체크포인트에서 시작하므로 다시 받지 않는다.
    expect(await call(connection, Opcode.BattleSettle, "1", {})).toEqual(first);
    expect(await call(connection, Opcode.BattleSettle, "2", {})).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: {} } });
    expect((await savedOf(store, "hero"))?.player).toMatchObject({ items: paid.items, profile: paid.profile });
  });

  test("are paid once when the connections before and after a reconnect settle at the same time", async () => {
    const store = await openStore(":memory:");
    const held = holding(store);
    const { rpc, connection, token, paid } = await setUp(held);

    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const first = call(connection, Opcode.BattleSettle, "a", {});
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token });
    held.hold = hold;
    const second = call(resumed, Opcode.BattleSettle, "b", {});
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    // 둘 다 같은 저장 데이터에서 계산했지만 늦게 쓰는 쪽은 밀려서 옮겨진 체크포인트부터 다시 한다.
    expect(await first).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { items: paid.items, profile: paid.profile } } });
    expect(await second).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: {} } });
    expect((await savedOf(store, "hero"))?.player).toMatchObject({ items: paid.items, profile: paid.profile });
  });
});

describe("command times and rates", () => {
  // 커맨드에 클라이언트의 시각을 실어 보낸다. 시각이 없으면 키도 없다.
  type Synced = { code: ResultCode; sync?: { revision: number; fingerprint: number; changes?: { battle?: { at: number } } } };
  async function timed(connection: Connection, id: string, sent?: number): Promise<Synced> {
    const envelope = sent === undefined ? { op: Opcode.BattleSettle, id, body: {} } : { op: Opcode.BattleSettle, id, body: {}, time: sent };
    return decodeMessage(await connection.receive(encodeMessage(envelope))) as Synced;
  }

  test("apply at the client's time within the window and at its nearest end outside it", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    const login = await call(connection, Opcode.AuthLogin, "1", { loginId: "times" }) as { body: { snapshot: { player: { battle: { at: number } } } } };
    const start = login.body.snapshot.player.battle.at;
    // 체크포인트가 옮겨 가는 틱의 시각.
    const tickOf = (at: number) => start + Math.floor((at - start) / 100) * 100;
    time = start + 60_000;
    // 받은 시각 그대로 적용했으면 클라이언트가 같은 결과를 예측했으므로 지문만 온다.
    const accepted = await timed(connection, "2", time - 750);
    const saved = (await savedOf(store, "times"))!;
    expect(saved.player.battle.at).toBe(tickOf(time - 750));
    expect(accepted.sync).toEqual({ revision: saved.revision, fingerprint: playerFingerprint(saved.player) });
    // 자른 시각이나 없는 시각은 예측과 다를 것이므로 바뀐 슬라이스도 온다.
    time += 10_000;
    expect((await timed(connection, "3", time - 5_000)).sync?.changes?.battle?.at).toBe(tickOf(time - 1_000));
    time += 10_000;
    expect((await timed(connection, "4", time + 5_000)).sync?.changes?.battle?.at).toBe(tickOf(time + 500));
    time += 10_000;
    expect((await timed(connection, "5")).sync?.changes?.battle?.at).toBe(tickOf(time));
    // 체크포인트보다 이른 시각은 아무것도 돌리지 않는다.
    expect((await timed(connection, "6", time - 900)).sync?.changes?.battle).toBeUndefined();
    expect(decodeMessage(await connection.receive(encodeMessage({ op: Opcode.BattleSettle, id: "7", body: {}, time: "soon" }))))
      .toMatchObject({ code: ResultCode.BadRequest });
  });

  test("StateFetch answers the saved state after every command sent before it, and needs a login", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    expect(await call(connection, Opcode.StateFetch, "1", {})).toMatchObject({ code: ResultCode.BadRequest, message: "Log in first." });
    await call(connection, Opcode.AuthLogin, "2", { loginId: "fetch" });
    await call(connection, Opcode.StageSelect, "3", { stageId: 3002 });
    const saved = (await savedOf(store, "fetch"))!;
    expect(saved.player.stage.currentId).toBe(3002);
    expect(await call(connection, Opcode.StateFetch, "4", {})).toMatchObject({ code: ResultCode.Ok, body: saved });
  });

  test("beyond the rate are refused unapplied and unrecorded, while a resend of an answered one still gets its answer", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    await call(connection, Opcode.AuthLogin, "1", { loginId: "rate" });
    const replies: unknown[] = [];
    for (let i = 0; i < 21; i++) replies.push(await call(connection, Opcode.BattleSettle, `s${i}`, {}));
    expect(replies.slice(0, 20)).toEqual(Array.from({ length: 20 }, () => expect.objectContaining({ code: ResultCode.Ok })));
    expect(replies[20]).toMatchObject({ code: ResultCode.TooManyRequests });
    expect(await store.findResult((await store.findAccount("rate"))!.id, "s20")).toBeUndefined();
    // 이미 답한 커맨드를 다시 보내면 버킷이 비어도 그 답을 받는다.
    expect(await call(connection, Opcode.BattleSettle, "s3", {})).toEqual(replies[3]);
    // 0.1초에 하나씩 다시 찬다.
    time += 100;
    expect(await call(connection, Opcode.BattleSettle, "s21", {})).toMatchObject({ code: ResultCode.Ok });
    expect(await call(connection, Opcode.BattleSettle, "s22", {})).toMatchObject({ code: ResultCode.TooManyRequests });
  });
});

describe("requests", () => {
  test("that are not a request envelope get BadRequest, and the connection carries on", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    const malformed = [
      new Uint8Array([0xc1]), // MessagePack이 쓰지 않는 바이트
      encodeMessage("hello"),
      encodeMessage(null),
      encodeMessage({ op: "1", id: "1", body: {} }),
      encodeMessage({ op: Opcode.Ping, id: 1, body: {} }),
      encodeMessage({ op: Opcode.Ping, id: "1" }),
    ];
    for (const bytes of malformed) {
      expect(decodeMessage(await connection.receive(bytes))).toMatchObject({ id: "", code: ResultCode.BadRequest });
    }
    expect(await call(connection, 12345 as Opcode, "1", {})).toMatchObject({ id: "1", code: ResultCode.BadRequest, message: "Unknown opcode: 12345." });
    expect(await call(connection, Opcode.StageSelect, "2", { stageId: 3002 })).toMatchObject({ code: ResultCode.BadRequest, message: "Log in first." });
    expect(await call(connection, Opcode.AuthLogin, "3", { loginId: "hero" })).toMatchObject({ code: ResultCode.Ok });
  });
});

// 저장 데이터는 쓰인 형식 그대로 남고 읽을 때마다 최신으로 올라간다. 처음 형식의 저장 데이터도 로그인해서 플레이를 잇는다.
test("a version 1 save in the database is read at the latest format on login, plays on and is written back at it", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "idle-rpc-"));
  try {
    const file = path.join(directory, "old.sqlite");
    const created = await openStore(file);
    await created.createAccount("hero", createPlayer("hero", data, 0), 0);
    await created.close();
    const db = new DatabaseSync(file);
    const v1 = { profile: { loginId: "hero", level: 3, exp: Big.from(40) }, currencies: { gold: Big.from(500) }, stage: { currentId: 3002, clearedIds: [3001] } };
    db.prepare("UPDATE players SET save = ?").run(encode({ version: 1, player: v1 }));
    db.close();

    const store = await openStore(file);
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    expect(await call(connection, Opcode.AuthLogin, "1", { loginId: "hero" })).toMatchObject({
      code: ResultCode.Ok,
      body: {
        snapshot: {
          revision: 1,
          player: {
            profile: { loginId: "hero", level: 3 },
            items: { 1: Big.from(500), 2: Big.from(40) },
            equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH,
            stage: v1.stage,
            battle: { at: 0 },
            tutorial: { stepId: null },
          },
        },
      },
    });
    // 첫 정산은 at 0을 상한을 넘은 공백으로 보고 지금부터 새 사냥을 시작한다.
    expect(await call(connection, Opcode.BattleSettle, "2", {})).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { battle: { at: time } } } });
    await store.close();
    const written = new DatabaseSync(file).prepare("SELECT save FROM players").get()!.save as Uint8Array;
    expect(decode(written)).toMatchObject({ version: SAVE_VERSION, player: { battle: { at: time } } });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("cheats", () => {
  async function setUp(cheats?: boolean) {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect(), cheats }).connect(peer());
    await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" });
    return { connection, saved: () => savedOf(store, "hero") };
  }

  test("are refused with CheatDisabled outside development mode and change nothing", async () => {
    const { connection, saved } = await setUp();
    const before = await saved();
    for (const [op, body] of [
      [Opcode.CheatItemGrant, { itemId: 1, amount: 1000 }],
      [Opcode.CheatLevelSet, { level: 10 }],
      [Opcode.CheatStageUnlock, { stageId: 3006 }],
      [Opcode.CheatTimeShift, { duration: HOUR }],
    ] as const) {
      expect(await call(connection, op, `${op}`, body)).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.CheatDisabled } });
    }
    expect(await saved()).toEqual(before);
  });

  test("apply once in development mode, like any command", async () => {
    const { connection, saved } = await setUp(true);
    const first = await call(connection, Opcode.CheatItemGrant, "1", { itemId: 1, amount: 1000 });
    expect(first).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { items: { 1: Big.from(1000) } } } });
    // 같은 id로 다시 보낸 치트는 처음 답을 받고 다시 지급하지 않는다.
    expect(await call(connection, Opcode.CheatItemGrant, "1", { itemId: 1, amount: 1000 })).toEqual({ ...(first as object), serverTime: time });
    expect(await call(connection, Opcode.CheatLevelSet, "2", { level: 10 })).toMatchObject({ code: ResultCode.Ok, sync: { revision: 3 } });
    expect(await saved()).toMatchObject({ revision: 3, player: { items: { 1: Big.from(1000) }, profile: { level: 10 } } });
  });
});

describe("tutorial", () => {
  test("progress is saved a step at a time: a retried request applies once, other steps are refused", async () => {
    const store = await openStore(":memory:");
    const connection = createRpc({ store, clock, data, log: collect() }).connect(peer());
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" });
    expect(login).toMatchObject({ body: { snapshot: { player: { tutorial: { stepId: 1 } } } } });
    const notCurrent = { code: ResultCode.Rejected, error: { code: GameErrorCode.TutorialStepNotCurrent } };

    const first = await call(connection, Opcode.TutorialAdvance, "1", { stepId: 1 });
    expect(first).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { tutorial: { stepId: 2 } } } });
    // 답을 못 받아 같은 id로 다시 보내면 처음 답을 받는다. 다른 id로 보낸 같은 스텝(되돌리기)과 건너뛰기는 거절된다.
    expect(await call(connection, Opcode.TutorialAdvance, "1", { stepId: 1 })).toEqual({ ...(first as object), serverTime: time });
    expect(await call(connection, Opcode.TutorialAdvance, "2", { stepId: 1 })).toMatchObject(notCurrent);
    expect(await call(connection, Opcode.TutorialAdvance, "3", { stepId: 3 })).toMatchObject(notCurrent);
    // 스텝 2는 3001 클리어를 기다린다. 서버도 같은 규칙으로 막는다.
    expect(await call(connection, Opcode.TutorialAdvance, "4", { stepId: 2 })).toMatchObject({
      code: ResultCode.Rejected, error: { code: GameErrorCode.TutorialStepUnmet },
    });
    expect(await savedOf(store, "hero")).toMatchObject({ revision: 2, player: { tutorial: { stepId: 2 } } });
  });
});

describe("stat upgrades", () => {
  // 골드 200을 가진 계정: 첫 단계(100)는 되고 두 번째(115)는 모자란다.
  async function setUp(rpcStore?: (store: Store) => Store) {
    const store = await openStore(":memory:");
    await store.createAccount("hero", { ...createPlayer("hero", data, time), items: { 1: Big.from(200) } }, time);
    const rpc = createRpc({ store: rpcStore?.(store) ?? store, clock, data, log: collect() });
    return { store, rpc, saved: () => savedOf(store, "hero") };
  }
  const notEnoughGold = { code: ResultCode.Rejected, error: { code: GameErrorCode.NotEnoughGold } };

  test("a retried request pays once and gets the first answer, and what the gold cannot pay saves nothing", async () => {
    const { rpc, saved } = await setUp();
    const connection = rpc.connect(peer());
    await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" });

    const first = await call(connection, Opcode.StatUpgrade, "1", { upgradeId: 7001, steps: 1 });
    expect(first).toMatchObject({
      code: ResultCode.Ok, sync: { revision: 2, changes: { items: { 1: Big.from(100) }, statUpgrades: { 7001: 1 }, battle: { at: time } } },
    });
    expect(await call(connection, Opcode.StatUpgrade, "1", { upgradeId: 7001, steps: 1 })).toEqual({ ...(first as object), serverTime: time });
    expect(await call(connection, Opcode.StatUpgrade, "2", { upgradeId: 7001, steps: 1 })).toMatchObject(notEnoughGold);
    expect(await call(connection, Opcode.StatUpgrade, "3", { upgradeId: 1, steps: 1 }))
      .toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.StatUpgradeNotFound } });
    expect(await saved()).toMatchObject({ revision: 2, player: { items: { 1: Big.from(100) }, statUpgrades: { 7001: 1 } } });
  });

  // 재연결 전후 두 연결이 같은 강화를 동시에 올린다. 둘 다 revision 1의 0단계와 골드 200을 읽고 100을 내려 하지만, 늦게
  // 쓰는 쪽은 밀려 먼저 쓴 저장 데이터(1단계, 골드 100) 위에서 다시 확인하므로 115를 내지 못하고 골드를 두 번 쓰지 않는다.
  test("from the connections before and after a reconnect at the same time spend the gold once", async () => {
    let held!: ReturnType<typeof holding>;
    const { rpc, saved } = await setUp(store => (held = holding(store)));
    const old = rpc.connect(peer("old"));
    const login = await call(old, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };

    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const first = call(old, Opcode.StatUpgrade, "1", { upgradeId: 7001, steps: 1 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token: login.body.session.token });
    held.hold = hold;
    const second = call(resumed, Opcode.StatUpgrade, "2", { upgradeId: 7001, steps: 1 });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await first).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2, changes: { statUpgrades: { 7001: 1 } } } });
    expect(await second).toMatchObject(notEnoughGold);
    expect(await saved()).toMatchObject({ revision: 2, player: { items: { 1: Big.from(100) }, statUpgrades: { 7001: 1 } } });
  });
});

describe("skill learning and level-ups", () => {
  // 개발 모드에서 골드를 받은 새 계정. 시계가 멈춰 있어 정산이 더 지급하지 않으므로 골드는 받은 만큼이다.
  async function setUp(gold: number) {
    const store = await openStore(":memory:");
    const held = holding(store);
    const rpc = createRpc({ store: held, clock, data, log: collect(), cheats: true });
    const connection = rpc.connect(peer("old"));
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };
    await call(connection, Opcode.CheatItemGrant, "gold", { itemId: 1, amount: gold });
    return { rpc, held, connection, token: login.body.session.token, saved: () => savedOf(store, "hero") };
  }

  test("a retried learn or level-up pays once and gets the first answer again", async () => {
    const { connection, saved } = await setUp(7000);
    // 전투의 포효는 5000에 배운다.
    const learned = await call(connection, Opcode.SkillLearn, "1", { skillId: 1010 });
    expect(learned).toMatchObject({
      code: ResultCode.Ok, sync: { revision: 3, changes: { items: { 1: Big.from(2000) }, skills: { levels: { 1010: 1 } } } },
    });
    expect(await call(connection, Opcode.SkillLearn, "1", { skillId: 1010 })).toEqual({ ...(learned as object), serverTime: time });
    const leveled = await call(connection, Opcode.SkillLevelUp, "2", { skillId: 1004 });
    expect(leveled).toMatchObject({ code: ResultCode.Ok, sync: { revision: 4, changes: { items: { 1: Big.from(1000) } } } });
    expect(await call(connection, Opcode.SkillLevelUp, "2", { skillId: 1004 })).toEqual({ ...(leveled as object), serverTime: time });
    expect(await saved()).toMatchObject({
      revision: 4, player: { items: { 1: Big.from(1000) }, skills: { levels: { 1004: 2, 1005: 1, 1010: 1, 1011: 1 } } },
    });
  });

  // 재연결 전후 두 연결이 같은 골드로 동시에 올린다. 늦게 쓰는 쪽은 밀려 먼저 쓴 저장 데이터 위에서 다시 계산하므로 골드를 두 번 쓰지 않는다.
  test("from the connections before and after a reconnect at the same time spend the gold once", async () => {
    const { rpc, held, connection, token, saved } = await setUp(1000);
    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const before = call(connection, Opcode.SkillLevelUp, "1", { skillId: 1004 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token });
    held.hold = hold;
    const after = call(resumed, Opcode.SkillLevelUp, "2", { skillId: 1004 });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await before).toMatchObject({ code: ResultCode.Ok, sync: { revision: 3, changes: { skills: { levels: { 1004: 2 } } } } });
    // 2레벨에서 3레벨은 1600이 든다.
    expect(await after).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.SkillCostShort } });
    expect(await saved()).toMatchObject({ revision: 3, player: { items: { 1: Big.ZERO }, skills: { levels: { 1004: 2 } } } });
  });

  test("an unequip on one connection and a level-up on the other at once both apply", async () => {
    const { rpc, held, connection, token, saved } = await setUp(1000);
    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const unequipped = call(connection, Opcode.SkillUnequip, "1", { skillId: 1004 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token });
    held.hold = hold;
    const leveled = call(resumed, Opcode.SkillLevelUp, "2", { skillId: 1005 });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await unequipped).toMatchObject({ code: ResultCode.Ok, sync: { revision: 3 } });
    expect(await leveled).toMatchObject({ code: ResultCode.Ok, sync: { revision: 4 } });
    const after = (await saved())!;
    expect(after).toMatchObject({ revision: 4, player: { items: { 1: Big.ZERO } } });
    expect(after.player.skills).toEqual({ equipped: { 1: 1005, 2: 1011 }, levels: { 1004: 1, 1005: 2, 1011: 1 } });
  });
});

describe("equipment enhancement", () => {
  // 낡은 검 +0(1)과 골드 1000을 가진 계정. +0 → +1은 500, +1 → +2는 750이다.
  async function setUp() {
    const store = await openStore(":memory:");
    const player = createPlayer("hero", data, time);
    await store.createAccount("hero", {
      ...player, items: { 1: Big.from(1000) }, equipment: { nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: {} },
    }, time);
    const held = holding(store);
    const rpc = createRpc({ store: held, clock, data, log: collect() });
    const connection = rpc.connect(peer("old"));
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };
    return { held, rpc, connection, token: login.body.session.token, saved: () => savedOf(store, "hero") };
  }

  test("a retried request pays once and gets the first answer again", async () => {
    const { connection, saved } = await setUp();
    const first = await call(connection, Opcode.ItemEnhance, "1", { equipmentId: 1 });
    expect(first).toMatchObject({
      code: ResultCode.Ok, sync: { revision: 2, changes: { items: { 1: Big.from(500) }, equipment: { owned: { 1: { itemId: 101, enhance: 1 } } } } },
    });
    expect(await call(connection, Opcode.ItemEnhance, "1", { equipmentId: 1 })).toEqual({ ...(first as object), serverTime: time });
    expect(await saved()).toMatchObject({ revision: 2, player: { items: { 1: Big.from(500) }, equipment: { owned: { 1: { enhance: 1 } } } } });
  });

  // 둘 다 골드 1000의 revision 1에서 +0 → +1을 계산한다. 늦게 쓰는 쪽은 먼저 쓴 저장 데이터(골드 500, +1) 위에서 다시
  // 적용해 +1 → +2의 750이 모자라 거절되므로, 골드를 두 번 쓰거나 한 번 낸 값으로 두 단계 오르지 않는다.
  test("from the connections before and after a reconnect at the same time apply once each on the newer save", async () => {
    const { held, rpc, connection, token, saved } = await setUp();
    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const before = call(connection, Opcode.ItemEnhance, "1", { equipmentId: 1 });
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token });
    held.hold = hold;
    const after = call(resumed, Opcode.ItemEnhance, "2", { equipmentId: 1 });
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await before).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2 } });
    expect(await after).toMatchObject({ code: ResultCode.Rejected, error: { code: GameErrorCode.NotEnoughGold } });
    expect(await saved()).toMatchObject({ revision: 2, player: { items: { 1: Big.from(500) }, equipment: { owned: { 1: { enhance: 1 } } } } });
  });
});

describe("rebirth", () => {
  // 40레벨에서 골드 5000, 골드 강화 10단계를 가진 계정. 환생하면 121포인트를 받고 1레벨이 되어 다시 환생할 수 없다.
  async function setUp() {
    const store = await openStore(":memory:");
    const player = createPlayer("hero", data, time);
    await store.createAccount("hero", {
      ...player, profile: { ...player.profile, level: 40 }, items: { 1: Big.from(5000) }, statUpgrades: { 7001: 10 },
      stage: { currentId: 3003, clearedIds: [3001, 3002] },
    }, time);
    const held = holding(store);
    const rpc = createRpc({ store: held, clock, data, log: collect() });
    const connection = rpc.connect(peer("old"));
    const login = await call(connection, Opcode.AuthLogin, "login", { loginId: "hero" }) as { body: { session: { token: string } } };
    return { held, rpc, connection, token: login.body.session.token, saved: () => savedOf(store, "hero") };
  }
  const reborn = {
    revision: 2,
    player: { profile: { level: 1 }, items: {}, statUpgrades: {}, stage: { currentId: 3001, clearedIds: [] }, rebirth: { count: 1, points: 121 } },
  };
  const notReady = { code: ResultCode.Rejected, error: { code: GameErrorCode.RebirthNotReady } };

  test("pays the points and starts over in one save, and a retried request gets the first answer without paying again", async () => {
    const { connection, saved } = await setUp();
    const first = await call(connection, Opcode.Rebirth, "1", {});
    expect(first).toMatchObject({
      code: ResultCode.Ok,
      sync: { revision: 2, changes: { ...reborn.player, battle: { at: time, waves: 0 } } },
    });
    expect(await call(connection, Opcode.Rebirth, "1", {})).toEqual({ ...(first as object), serverTime: time });
    // 새 id는 다시 적용되지만 1레벨이라 받을 포인트가 없다.
    expect(await call(connection, Opcode.Rebirth, "2", {})).toMatchObject(notReady);
    expect(await saved()).toMatchObject(reborn);
  });

  // 둘 다 revision 1의 40레벨을 읽고 환생을 계산한다. 늦게 쓰는 쪽은 밀려 먼저 쓴 저장 데이터(1레벨) 위에서 다시 확인하므로
  // 거절되고, 포인트는 한 번만 쌓인다.
  test("from the connections before and after a reconnect at the same time pays the points once", async () => {
    const { held, rpc, connection, token, saved } = await setUp();
    let release!: () => void;
    const hold = new Promise<void>(resolve => (release = resolve));
    held.hold = hold;
    const before = call(connection, Opcode.Rebirth, "1", {});
    await vi.waitFor(() => expect(held.waiting).toBe(1));
    held.hold = undefined;
    const resumed = rpc.connect(peer("new"));
    await call(resumed, Opcode.AuthResume, "resume", { token });
    held.hold = hold;
    const after = call(resumed, Opcode.Rebirth, "2", {});
    await vi.waitFor(() => expect(held.waiting).toBe(2));
    held.hold = undefined;
    release();

    expect(await before).toMatchObject({ code: ResultCode.Ok, sync: { revision: 2 } });
    expect(await after).toMatchObject(notReady);
    expect(await saved()).toMatchObject(reborn);
  });
});
