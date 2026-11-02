import { GameErrorCode, Opcode } from "@idle/codes";
import {
  CloseCode, PROTOCOL_VERSION, ResultCode, decodeMessage, encodeMessage, type RequestEnvelope, type Session,
} from "@idle/protocol";
import { computed } from "@preact/signals-core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { SocketBridge, SocketHandlers } from "../src/adapters/net/ports.js";
import {
  CONNECT_TIMEOUT, PING_INTERVAL, RECONNECT_DELAYS, REQUEST_TIMEOUT, RESUME_GAP, WAITING_DELAY, createGameServer,
} from "../src/adapters/net/game-server.js";
import { createServerClock } from "../src/adapters/net/server-clock.js";
import { createAppState } from "../src/application/state/app-state.js";

interface FakeSocket {
  readonly url: string;
  readonly handlers: SocketHandlers;
  readonly sent: RequestEnvelope[];
  closedBy?: number;
}

const session: Session = { token: "token-1", expiresAt: 0 };
// AuthLogin이 출발하는 저장 데이터와, 이후 재개가 이어 가는 저장 데이터.
const saved = { player: { profile: { loginId: "hero" } }, revision: 5 };
const snapshot = { player: { profile: { loginId: "hero" } }, revision: 7 };
const stageSelect = (stageId: number) => ({ type: Opcode.StageSelect, stageId }) as const;
// 커맨드를 예측한 서버 시각.
const TIME = 1_000_123;
// 클라이언트의 규칙 테이블 지문.
const DATA_VERSION = "0a1b2c3d";

beforeEach(() => {
  vi.useFakeTimers();
  // 재연결 대기가 최대 길이로 잡힌다.
  vi.spyOn(Math, "random").mockReturnValue(1);
});
afterEach(() => vi.useRealTimers());

/** `local`은 서버 시계가 읽는 이 기기의 시계다. 기본은 멈춘 시계라 스크립트가 멈췄다고 보지 않는다. */
function setUp(local: () => number = () => 0) {
  const sockets: FakeSocket[] = [];
  const bridge: SocketBridge = {
    connect(url, handlers) {
      const socket: FakeSocket = { url, handlers, sent: [] };
      sockets.push(socket);
      return {
        send: data => void socket.sent.push(decodeMessage(data) as RequestEnvelope),
        close: code => void (socket.closedBy = code),
      };
    },
  };
  const state = createAppState();
  const clock = createServerClock(local);
  const server = createGameServer({ socket: bridge, server: "ws://game.test", dataVersion: DATA_VERSION, clock, network: state.network });
  const last = () => sockets[sockets.length - 1];
  return { sockets, last, state, clock, server, network: () => state.network.value };
}

function answer(socket: FakeSocket, request: RequestEnvelope, result: object = { code: ResultCode.Ok, body: null }, serverTime = 1000): void {
  socket.handlers.onMessage(encodeMessage({ id: request.id, serverTime, ...result }));
}

/** 연결을 열고 로그인해서 서버가 세션을 갖게 한다. */
async function online(t: ReturnType<typeof setUp>, resumed = vi.fn()) {
  t.server.onResumed(resumed);
  const opened = t.server.open();
  t.last().handlers.onOpen();
  await opened;
  const login = t.server.login("hero");
  answer(t.last(), t.last().sent[0], { code: ResultCode.Ok, body: { snapshot: saved, session } });
  await login;
  return resumed;
}

/** 다음 재연결 시도가 연결하게 하고, 그 재개에 답한다. */
async function comeBack(t: ReturnType<typeof setUp>, delay: number = RECONNECT_DELAYS[0]): Promise<FakeSocket> {
  vi.advanceTimersByTime(delay);
  const socket = t.last();
  socket.handlers.onOpen();
  expect(socket.sent[0]).toMatchObject({ op: Opcode.AuthResume, body: { token: session.token } });
  answer(socket, socket.sent[0], { code: ResultCode.Ok, body: snapshot });
  // 재개의 답은 다음 마이크로태스크에서 확정된다.
  await vi.advanceTimersByTimeAsync(0);
  return socket;
}

test("matches answers to requests by id and follows the server clock", async () => {
  const t = setUp();
  expect(t.network().status).toBe("offline");
  const opened = t.server.open();
  expect(t.network().status).toBe("connecting");
  t.last().handlers.onOpen();
  await opened;
  expect(t.network().status).toBe("online");

  const first = t.server.send(stageSelect(3002), TIME);
  const second = t.server.send(stageSelect(3003), TIME);
  const [a, b] = t.last().sent;
  answer(t.last(), b, { code: ResultCode.Ok, body: null }, 5000);
  answer(t.last(), a, { code: ResultCode.Rejected, error: { code: GameErrorCode.StageNotFound, message: "" } }, 6000);
  expect(await first).toMatchObject({ ok: false });
  expect(await second).toMatchObject({ ok: true });
  expect(t.clock.now()).toBe(6000);
});

test("login answers with the save and keeps the session, which a dropped connection resumes", async () => {
  const t = setUp();
  const resumed = vi.fn();
  t.server.onResumed(resumed);
  const opened = t.server.open();
  t.last().handlers.onOpen();
  await opened;

  const login = t.server.login("hero");
  expect(t.last().sent[0]).toMatchObject({ op: Opcode.AuthLogin, body: { loginId: "hero" } });
  answer(t.last(), t.last().sent[0], { code: ResultCode.Ok, body: { snapshot: saved, session } });
  expect(await login).toEqual({ ok: true, snapshot: saved });

  t.last().handlers.onClose(1006, "");
  expect(t.network().status).toBe("reconnecting");
  // comeBack이 재개에 세션의 토큰이 실려 있는지 확인한다.
  await comeBack(t);
  expect(resumed).toHaveBeenCalledExactlyOnceWith(snapshot);
  expect(t.network().status).toBe("online");
});

test("a refused login resolves with the error and keeps no session", async () => {
  const t = setUp();
  const opened = t.server.open();
  t.last().handlers.onOpen();
  await opened;

  const login = t.server.login("hero");
  const error = { code: GameErrorCode.StageNotFound, message: "" };
  answer(t.last(), t.last().sent[0], { code: ResultCode.Rejected, error });
  expect(await login).toEqual({ ok: false, error });

  t.last().handlers.onClose(1006, "");
  expect(t.network().status).toBe("offline");
  vi.advanceTimersByTime(60_000);
  expect(t.sockets).toHaveLength(1);
});

test("a login the server fails to handle rejects", async () => {
  const t = setUp();
  const opened = t.server.open();
  t.last().handlers.onOpen();
  await opened;
  const login = t.server.login("hero");
  answer(t.last(), t.last().sent[0], { code: ResultCode.ServerError, message: "boom" });
  await expect(login).rejects.toThrow("Login failed: ServerError.");
});

// Unity는 한 프레임의 소켓 이벤트를 한꺼번에 넘기므로, 같은 프레임에서 답 뒤에 오는 닫힘을
// 처리하기 전에는 어떤 답도 확정되지 않는다.
describe("an answer that arrives in the same frame as its socket closing", () => {
  /** 연결을 끊고 다음 시도가 열리게 한다. 열리면 재개를 보낸다. */
  function reopen(t: ReturnType<typeof setUp>): FakeSocket {
    t.last().handlers.onClose(1006, "");
    vi.advanceTimersByTime(RECONNECT_DELAYS[0]);
    t.last().handlers.onOpen();
    return t.last();
  }

  test("to a resume counts for nothing: the connection comes back and resumes again", async () => {
    const t = setUp();
    const resumed = await online(t);
    const waiting = t.server.send(stageSelect(3002), TIME);
    const socket = reopen(t);
    answer(socket, socket.sent[0], { code: ResultCode.Ok, body: snapshot });
    socket.handlers.onClose(1006, "");
    await vi.advanceTimersByTimeAsync(0);
    expect(resumed).not.toHaveBeenCalled();
    expect(t.network().status).toBe("reconnecting");

    const next = await comeBack(t, RECONNECT_DELAYS[1]);
    expect(resumed).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(t.network().status).toBe("online");
    expect(next.sent[1]).toMatchObject({ body: { stageId: 3002 } });
    answer(next, next.sent[1]);
    await expect(waiting).resolves.toMatchObject({ ok: true });
  });

  test("to a resume does not undo the end that came with it", async () => {
    const t = setUp();
    const resumed = await online(t);
    const socket = reopen(t);
    answer(socket, socket.sent[0], { code: ResultCode.Ok, body: snapshot });
    socket.handlers.onClose(CloseCode.SessionReplaced, "");
    await vi.advanceTimersByTimeAsync(0);
    expect(resumed).not.toHaveBeenCalled();
    expect(t.network()).toMatchObject({ status: "ended", ended: "replaced" });
  });

  test("to a login fails it, and no session is kept", async () => {
    const t = setUp();
    const opened = t.server.open();
    t.last().handlers.onOpen();
    await opened;
    const login = t.server.login("hero");
    answer(t.last(), t.last().sent[0], { code: ResultCode.Ok, body: { snapshot: saved, session } });
    t.last().handlers.onClose(1006, "");
    await expect(login).rejects.toThrow(/closed/);
    expect(t.network().status).toBe("offline");
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
  });
});

test("send resolves an accepted command's sync and a refused one's error; other failures reject", async () => {
  const t = setUp();
  await online(t);
  const accepted = t.server.send(stageSelect(3002), TIME);
  const refused = t.server.send(stageSelect(9999), TIME);
  const failed = t.server.send(stageSelect(3003), TIME);
  const [, a, r, f] = t.last().sent;
  // 어떤 커맨드인지는 opcode가 알려 주고, 나머지는 body에 담긴다.
  expect(a).toMatchObject({ op: Opcode.StageSelect });
  expect(a.body).toEqual({ stageId: 3002 });

  const sync = { revision: 6, changes: { stage: { currentId: 3002, clearedIds: [] } } };
  const error = { code: GameErrorCode.StageNotFound, message: "" };
  answer(t.last(), a, { code: ResultCode.Ok, body: null, sync });
  answer(t.last(), r, { code: ResultCode.Rejected, error });
  answer(t.last(), f, { code: ResultCode.ServerError, message: "boom" });
  await expect(accepted).resolves.toEqual({ ok: true, sync });
  await expect(refused).resolves.toEqual({ ok: false, error });
  await expect(failed).rejects.toThrow(/Command failed/);
});

describe("a dropped connection", () => {
  test("comes back, resumes the session first, then sends again what was unanswered or waiting", async () => {
    const t = setUp();
    const resumed = await online(t);
    const unanswered = t.server.send(stageSelect(3002), TIME);
    const first = t.last().sent[1];
    // 커맨드는 예측한 서버 시각을 싣고, 다시 보낼 때도 같은 시각이다. 시스템 요청에는 시각이 없다.
    expect(first).toMatchObject({ op: Opcode.StageSelect, body: { stageId: 3002 }, time: TIME });
    expect(t.last().sent[0]).not.toHaveProperty("time");
    // 연결 주소는 프로토콜 버전과 규칙 테이블의 지문을 싣는다.
    expect(t.last().url).toBe(`ws://game.test/ws?v=${PROTOCOL_VERSION}&d=${DATA_VERSION}`);

    t.last().handlers.onClose(1006, "");
    expect(t.network()).toEqual({ status: "reconnecting", ended: null, waiting: true });
    const waiting = t.server.send(stageSelect(3003), TIME);

    const socket = await comeBack(t);
    expect(resumed).toHaveBeenCalledWith(snapshot);
    // 다시 온라인이 됐지만 두 요청 모두 0.5초 넘게 기다린 상태다.
    expect(t.network()).toEqual({ status: "online", ended: null, waiting: true });
    // 이전과 같은 id이므로 서버는 한 번만 답한다.
    expect(socket.sent.slice(1)).toEqual([first, expect.objectContaining({ body: { stageId: 3003 } })]);
    answer(socket, socket.sent[1]);
    answer(socket, socket.sent[2]);
    await expect(unanswered).resolves.toMatchObject({ ok: true });
    await expect(waiting).resolves.toMatchObject({ ok: true });
    expect(t.network().waiting).toBe(false);
  });

  test("waits longer before each attempt, up to the last delay", async () => {
    const t = setUp();
    await online(t);
    t.last().handlers.onClose(1006, "");
    for (const delay of [...RECONNECT_DELAYS, RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1]]) {
      const count = t.sockets.length;
      vi.advanceTimersByTime(delay - 1);
      expect(t.sockets).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(t.sockets).toHaveLength(count + 1);
      t.last().handlers.onClose(1006, "could not connect");
    }
    // 재개에 성공하면 대기가 처음부터 다시 시작된다.
    await comeBack(t, RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1]);
    t.last().handlers.onClose(1006, "");
    vi.advanceTimersByTime(RECONNECT_DELAYS[0]);
    expect(t.network().status).toBe("reconnecting");
    expect(t.last().sent).toEqual([]);
  });

  test("whose request goes unanswered is given up and comes back", async () => {
    const t = setUp();
    await online(t);
    const request = t.server.send(stageSelect(3002), TIME);
    const dead = t.last();

    vi.advanceTimersByTime(REQUEST_TIMEOUT);
    expect(dead.closedBy).toBe(1000);
    expect(t.network().status).toBe("reconnecting");
    const socket = await comeBack(t);
    expect(socket.sent[1]).toEqual(dead.sent[1]);
    // 죽은 소켓의 뒤늦은 이벤트는 아무것도 바꾸지 못한다.
    dead.handlers.onClose(1006, "");
    answer(socket, socket.sent[1]);
    await expect(request).resolves.toMatchObject({ ok: true });
    expect(t.network().status).toBe("online");
  });

  test("without a session rejects what waits and stays offline", async () => {
    const t = setUp();
    const opened = t.server.open();
    t.last().handlers.onOpen();
    await opened;
    const login = t.server.login("hero");
    t.last().handlers.onClose(1006, "");

    await expect(login).rejects.toThrow(/closed/);
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
    expect(t.network().status).toBe("offline");
  });

  test("that cannot open makes open() fail", async () => {
    const t = setUp();
    const opened = t.server.open();
    t.last().handlers.onClose(1006, "refused");
    await expect(opened).rejects.toThrow(/refused/);
    expect(t.network().status).toBe("offline");
  });

  // Unity의 소켓 브리지는 주소가 잘못되면 연결하기 전에 던질 수 있다. 열지 못한 연결과 같다.
  test("whose socket throws while connecting makes open() fail like one that cannot open", async () => {
    const t = setUp();
    const opened = createGameServer({
      socket: { connect: () => { throw new Error("bad url"); } }, server: "ws://game.test", dataVersion: DATA_VERSION, clock: t.clock, network: t.state.network,
    }).open();
    await expect(opened).rejects.toThrow(/1006 bad url/);
    expect(t.network().status).toBe("offline");
  });

  test("whose resume the server fails to handle is given up and comes back, keeping the session", async () => {
    const t = setUp();
    await online(t);
    t.last().handlers.onClose(1006, "");
    vi.advanceTimersByTime(RECONNECT_DELAYS[0]);
    const failed = t.last();
    failed.handlers.onOpen();
    answer(failed, failed.sent[0], { code: ResultCode.ServerError, message: "boom" });
    await vi.advanceTimersByTimeAsync(0);

    expect(failed.closedBy).toBe(1000);
    expect(t.network().status).toBe("reconnecting");
    const socket = await comeBack(t, RECONNECT_DELAYS[1]);
    expect(socket).not.toBe(failed);
    expect(t.network()).toMatchObject({ status: "online", ended: null });
  });

  test("that does not open in time is given up and makes open() fail", async () => {
    const t = setUp();
    const opened = t.server.open();
    const hung = t.last();
    vi.advanceTimersByTime(CONNECT_TIMEOUT - 1);
    expect(hung.closedBy).toBeUndefined();

    vi.advanceTimersByTime(1);
    expect(hung.closedBy).toBe(1000);
    await expect(opened).rejects.toThrow(/no connection/);
    expect(t.network().status).toBe("offline");
    // 버린 소켓이 뒤늦게 열려도 아무것도 바꾸지 못한다.
    hung.handlers.onOpen();
    expect(t.network().status).toBe("offline");
  });

  test("whose next attempt does not open in time tries again", async () => {
    const t = setUp();
    await online(t);
    t.last().handlers.onClose(1006, "");
    vi.advanceTimersByTime(RECONNECT_DELAYS[0]);
    const hung = t.last();

    vi.advanceTimersByTime(CONNECT_TIMEOUT);
    expect(hung.closedBy).toBe(1000);
    expect(t.network().status).toBe("reconnecting");
    await comeBack(t, RECONNECT_DELAYS[1]);
    expect(t.network().status).toBe("online");
  });

  test("that opens in time is not given up later", async () => {
    const t = setUp();
    await online(t);
    vi.advanceTimersByTime(CONNECT_TIMEOUT);
    expect(t.last().closedBy).toBeUndefined();
    expect(t.network().status).toBe("online");
  });
});

describe("the connection ends for good", () => {
  test.each([
    [CloseCode.VersionMismatch, "update"],
    [CloseCode.SessionReplaced, "replaced"],
    [1009, "error"],
  ])("when the server closes it with %i", async (code, reason) => {
    const t = setUp();
    await online(t);
    const request = t.server.send(stageSelect(3002), TIME);
    t.last().handlers.onClose(code, "");

    await expect(request).rejects.toThrow(reason);
    expect(t.network()).toEqual({ status: "ended", ended: reason, waiting: false });
    vi.advanceTimersByTime(60_000);
    expect(t.sockets).toHaveLength(1);
    await expect(t.server.send(stageSelect(3002), TIME)).rejects.toThrow(/ended/);
  });

  test.each([
    [GameErrorCode.SessionExpired, "expired"],
    [GameErrorCode.SessionReplaced, "replaced"],
  ])("when the server refuses the resume with %i", async (error, reason) => {
    const t = setUp();
    await online(t);
    const request = expect(t.server.send(stageSelect(3002), TIME)).rejects.toThrow(reason);
    t.last().handlers.onClose(1006, "");
    vi.advanceTimersByTime(RECONNECT_DELAYS[0]);
    t.last().handlers.onOpen();
    answer(t.last(), t.last().sent[0], { code: ResultCode.Rejected, error: { code: error, message: "" } });
    await vi.advanceTimersByTimeAsync(0);

    await request;
    expect(t.network()).toMatchObject({ status: "ended", ended: reason });
  });

  test("and a new login starts it over", async () => {
    const t = setUp();
    await online(t);
    t.last().handlers.onClose(CloseCode.SessionReplaced, "");
    const opened = t.server.open();
    t.last().handlers.onOpen();
    await opened;
    expect(t.network()).toEqual({ status: "online", ended: null, waiting: false });
  });
});

test("shows waiting only for requests slower than half a second", async () => {
  const t = setUp();
  await online(t);
  const request = t.server.send(stageSelect(3002), TIME);
  vi.advanceTimersByTime(WAITING_DELAY - 1);
  expect(t.network().waiting).toBe(false);
  vi.advanceTimersByTime(1);
  expect(t.network().waiting).toBe(true);
  answer(t.last(), t.last().sent[1]);
  await request;
  expect(t.network().waiting).toBe(false);
});

test("a second slow request or the first answer does not repeat an unchanged waiting state", async () => {
  const t = setUp();
  await online(t);
  const seen: boolean[] = [];
  computed(() => t.state.network.value.waiting).subscribe(waiting => seen.push(waiting));
  // computed는 값이 같으면 알리지 않으므로, 같은 상태를 새 객체로 다시 쓰는 publish는 신호 자체를 구독해야 보인다.
  const states: unknown[] = [];
  t.state.network.subscribe(network => states.push(network));
  const first = t.server.send(stageSelect(3002), TIME);
  const second = t.server.send(stageSelect(3003), TIME);
  vi.advanceTimersByTime(WAITING_DELAY);
  // 첫 응답에도 둘째가 아직 느린 요청이라서 waiting은 그대로다.
  answer(t.last(), t.last().sent[1]);
  await first;
  answer(t.last(), t.last().sent[2]);
  await second;
  expect(seen).toEqual([false, true, false]);
  // 신호도 처음 값과 waiting이 켜지고 꺼질 때, 상태가 실제로 바뀐 세 번만 알린다.
  expect(states).toHaveLength(3);
});

describe("pings", () => {
  test("go out after a silence, which every request restarts, and do not show waiting", async () => {
    const t = setUp();
    await online(t);
    vi.advanceTimersByTime(PING_INTERVAL - 1000);
    void t.server.send(stageSelect(3002), TIME);
    answer(t.last(), t.last().sent[1]);
    vi.advanceTimersByTime(PING_INTERVAL - 1);
    expect(t.last().sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(t.last().sent[2]).toMatchObject({ op: Opcode.Ping, body: {} });
    vi.advanceTimersByTime(WAITING_DELAY * 4);
    expect(t.network().waiting).toBe(false);
  });

  test("that go unanswered bring the connection back, and are not sent again", async () => {
    const t = setUp();
    await online(t);
    vi.advanceTimersByTime(PING_INTERVAL + REQUEST_TIMEOUT);
    expect(t.network().status).toBe("reconnecting");
    const socket = await comeBack(t);
    expect(socket.sent.map(request => request.op)).toEqual([Opcode.AuthResume]);
  });

  test("go out at once after the script stood still, as in the background", async () => {
    const t = setUp(() => Date.now());
    await online(t);
    const sent = () => t.last().sent.map(request => request.op);
    // 시계만 가고 타이머는 돌지 않는다: 앱이 멈춰 있던 동안이다.
    vi.setSystemTime(Date.now() + RESUME_GAP - 1000);
    vi.advanceTimersByTime(1000);
    expect(sent()).toEqual([Opcode.AuthLogin]);
    vi.setSystemTime(Date.now() + RESUME_GAP);
    vi.advanceTimersByTime(1000);
    expect(sent()).toEqual([Opcode.AuthLogin, Opcode.Ping]);
  });
});

test("close() rejects what waits and does not come back", async () => {
  const t = setUp();
  await online(t);
  const request = t.server.send(stageSelect(3002), TIME);
  const socket = t.last();
  t.server.close();

  await expect(request).rejects.toThrow(/closed/);
  expect(socket.closedBy).toBe(1000);
  expect(t.network().status).toBe("offline");
  vi.advanceTimersByTime(60_000);
  expect(t.sockets).toHaveLength(1);
});
