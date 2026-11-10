import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { connect, type AddressInfo, type Socket } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Opcode } from "@idle/codes";
import { fingerprint } from "@idle/data-schema";
import { CloseCode, MAX_UNANSWERED_COMMANDS, ResultCode, decodeMessage, encodeMessage, socketPath } from "@idle/protocol";
import { WebSocket, type ClientOptions } from "ws";
import { afterEach, expect, test, vi } from "vitest";
import { createLog } from "../src/log.js";
import { createRpc, type Rpc } from "../src/rpc.js";
import { openStore } from "../src/store.js";
import { loadTestData } from "../src/testing.js";
import { createGameServer, type GameServer } from "../src/transport.js";

const data = await loadTestData();
let server: GameServer | undefined;
let lines: string[] = [];

afterEach(() => {
  server?.close();
  server = undefined;
});

async function start(heartbeatMs?: number, rpc?: Rpc): Promise<string> {
  lines = [];
  const push = (line: string) => void lines.push(line);
  const log = createLog({ log: push, warn: push, error: push }, "debug");
  rpc ??= createRpc({ store: await openStore(":memory:"), clock: { now: () => Date.now() }, data, log: log("rpc") });
  server = createGameServer(rpc, { log: log("ws"), heartbeatMs, dataVersion: data.version });
  server.http.listen(0, "127.0.0.1");
  await once(server.http, "listening");
  return `ws://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
}

async function open(url: string, options?: ClientOptions): Promise<WebSocket> {
  const ws = new WebSocket(`${url}${socketPath(data.version)}`, options);
  await once(ws, "open");
  return ws;
}

async function request(ws: WebSocket, op: Opcode, id: string, body: object): Promise<unknown> {
  ws.send(encodeMessage({ op, id, body }));
  const [reply] = await once(ws, "message");
  return decodeMessage(reply as Buffer);
}

async function closeCode(ws: WebSocket): Promise<number> {
  const [code] = await once(ws, "close");
  return code as number;
}

/** 소켓이 닫힐 때까지 받은 답의 수와 종료 코드·이유. */
async function untilClosed(ws: WebSocket): Promise<{ answers: number; code: number; reason: string }> {
  let answers = 0;
  ws.on("message", () => answers++);
  const [code, reason] = await once(ws, "close");
  return { answers, code: code as number, reason: String(reason) };
}

/** 원시 TCP로 `target`에 WebSocket 업그레이드를 요청하고, 소켓과 응답의 상태 줄을 돌려준다. */
async function upgrade(url: string, target: string): Promise<{ socket: Socket; status: string }> {
  const socket = connect(Number(new URL(url).port), "127.0.0.1");
  socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n`
    + "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n");
  const [response] = await once(socket, "data");
  return { socket, status: String(response).split("\r\n")[0] };
}

test("logs each request with its connection, account, opcode, outcome and time", async () => {
  const ws = await open(await start());
  await request(ws, Opcode.StageSelect, "1", { stageId: 3002 });
  await request(ws, Opcode.AuthLogin, "2", { loginId: "hero" });
  await request(ws, Opcode.StageSelect, "3", { stageId: 9999 });
  ws.close();
  await vi.waitFor(() => expect(lines.at(-1)).toMatch(/ closed /));

  const peer = String.raw`127\.0\.0\.1:\d+`;
  const expected = [
    `\\[ws\\] ${peer} open`,
    `\\[rpc\\] ${peer} - StageSelect#1 BadRequest \\(Log in first\\.\\) \\d+\\.\\dms`,
    `\\[rpc\\] ${peer} hero AuthLogin#2 Ok \\d+\\.\\dms`,
    `\\[rpc\\] ${peer} hero StageSelect#3 Rejected StageNotFound \\d+\\.\\dms`,
    `\\[ws\\] ${peer} closed 1005`,
  ];
  expect(lines).toHaveLength(expected.length);
  lines.forEach((line, i) => expect(line).toMatch(new RegExp(`^${expected[i]}$`)));
});

test("closes a connection that stops answering pings, and keeps one that answers", async () => {
  const url = await start(40);
  const silent = await open(url, { autoPong: false });
  const lively = await open(url);

  expect(await closeCode(silent)).toBe(1006);
  await sleep(200);
  expect(lively.readyState).toBe(WebSocket.OPEN);
  expect(await request(lively, Opcode.AuthLogin, "1", { loginId: "hero" })).toMatchObject({ code: ResultCode.Ok });
  expect(lines.filter(line => / closed 1006$/.test(line))).toHaveLength(1);
});

test("accepts only binary messages up to 64 KiB, on /ws, in this protocol version", async () => {
  const url = await start();

  const text = await open(url);
  text.send(JSON.stringify({ op: Opcode.AuthLogin, id: "1", body: { loginId: "hero" } }));
  expect(await closeCode(text)).toBe(1003);

  const large = await open(url);
  large.send(new Uint8Array(65 * 1024));
  expect(await closeCode(large)).toBe(1009);

  const outdated = new WebSocket(`${url}${socketPath(data.version, 0)}`);
  expect(await closeCode(outdated)).toBe(CloseCode.VersionMismatch);
  // 다른 규칙 테이블로 예측하는 클라이언트도 업데이트해야 한다.
  const otherData = new WebSocket(`${url}${socketPath("00000000")}`);
  expect(await closeCode(otherData)).toBe(CloseCode.VersionMismatch);

  const elsewhere = new WebSocket(`${url}/other`);
  const [error] = await once(elsewhere, "error");
  expect((error as Error).message).toMatch(/404/);
});

test("answers an upgrade to a target that is not a URL with 400, and keeps serving", async () => {
  const url = await start();
  // 경로가 비어 있는 권한(//)이나 잘못된 호스트로 읽혀 URL이 되지 않는 대상들.
  for (const target of ["//", "/\\", "http://["]) {
    const { socket, status } = await upgrade(url, target);
    expect(status, target).toBe("HTTP/1.1 400 Bad Request");
    socket.destroy();
  }
  const ws = await open(url);
  expect(await request(ws, Opcode.AuthLogin, "1", { loginId: "hero" })).toMatchObject({ code: ResultCode.Ok });
});

test("survives a client that resets the connection after its upgrade is refused", async () => {
  const url = await start();
  // 리스너 없는 소켓 'error'는 프로세스를 죽이는 처리되지 않은 예외가 된다.
  const uncaught: unknown[] = [];
  const record = (error: unknown) => void uncaught.push(error);
  process.on("uncaughtException", record);
  try {
    const { socket, status } = await upgrade(url, "/other");
    expect(status).toBe("HTTP/1.1 404 Not Found");
    socket.resetAndDestroy();
    await once(socket, "close");
    // 서버가 RST를 읽을 시간.
    await sleep(50);
  } finally {
    process.off("uncaughtException", record);
  }
  expect(uncaught).toEqual([]);
  const ws = await open(url);
  expect(await request(ws, Opcode.AuthLogin, "1", { loginId: "hero" })).toMatchObject({ code: ResultCode.Ok });
});

test("logging in on a second socket closes the first with SessionReplaced", async () => {
  const url = await start();
  const first = await open(url);
  await request(first, Opcode.AuthLogin, "1", { loginId: "hero" });
  const second = await open(url);
  const firstClosed = closeCode(first);
  expect(await request(second, Opcode.AuthLogin, "1", { loginId: "hero" })).toMatchObject({ code: ResultCode.Ok });
  expect(await firstClosed).toBe(CloseCode.SessionReplaced);
  expect(lines).toContainEqual(expect.stringMatching(/ hero replaced by /));
});

test("does not ping a connection that keeps talking", async () => {
  const url = await start(40);
  const ws = await open(url);
  let pings = 0;
  ws.on("ping", () => pings++);
  // 클라이언트가 스스로 보내는 ping. 서버가 확인하는 주기보다 잦다.
  for (let i = 0; i < 8; i++) {
    expect(await request(ws, Opcode.Ping, String(i), {})).toMatchObject({ code: ResultCode.Ok, body: null });
    await sleep(15);
  }
  expect(pings).toBe(0);
  // ping은 요청 로그에 남지 않는다.
  expect(lines.filter(line => line.startsWith("[rpc]"))).toEqual([]);
});

test("the data version is the fingerprint of the rule tables, leaving out the client-only strings and sounds", async () => {
  const tables = new URL("../../shared/data-schema/data/", import.meta.url);
  const names = ["Constants", "Effects", "Heroes", "HeroLevels", "Items", "Monsters", "Projectiles", "Skills", "Stages", "StatUpgrades", "Summons", "TutorialSteps"];
  const bytes = await Promise.all(names.map(name => readFile(new URL(`${name}.bytes`, tables))));
  expect(data.version).toMatch(/^[0-9a-f]{8}$/);
  expect(data.version).toBe(fingerprint(bytes));
  // 규칙 테이블의 바이트 하나만 바뀌어도 지문이 바뀐다.
  const changed = Buffer.from(bytes[7]);
  changed[changed.length - 1] ^= 1;
  expect(fingerprint([...bytes.slice(0, 7), changed, ...bytes.slice(8)])).not.toBe(data.version);
});

// 클라이언트 하나가 한꺼번에 가질 수 있는 요청(커맨드 MAX_UNANSWERED_COMMANDS개와 로그인·재개, 받아 오기, 핑)의 두 배.
const MESSAGE_BURST = 2 * MAX_UNANSWERED_COMMANDS;

test("a ping flood is closed with 1008 once past the connection's message budget", async () => {
  const ws = await open(await start());
  const closed = untilClosed(ws);
  for (let i = 0; i <= MESSAGE_BURST; i++) ws.send(encodeMessage({ op: Opcode.Ping, id: String(i), body: {} }));
  // 같은 때에 받은 앞의 핑들은 답이 나가기 전에 닫혀 답을 받지 못할 수 있다.
  expect(await closed).toMatchObject({ code: 1008, reason: "Too many messages." });
});

test("a connection the server is closing has nothing more handled", async () => {
  const ws = await open(await start());
  const closed = closeCode(ws);
  for (let i = 0; i < MESSAGE_BURST + 100; i++) ws.send(encodeMessage({ op: Opcode.StageSelect, id: String(i), body: { stageId: 3002 } }));
  expect(await closed).toBe(1008);
  // rpc는 처리한 요청마다 한 줄을 남긴다.
  expect(lines.filter(line => line.startsWith("[rpc]"))).toHaveLength(MESSAGE_BURST);
});

test("a reconnect's resume, all the commands a client may leave unanswered, a fetch and a ping sent at once are all answered", async () => {
  const url = await start();
  const first = await open(url);
  const { body } = await request(first, Opcode.AuthLogin, "login", { loginId: "back" }) as { body: { session: { token: string } } };
  first.terminate();
  const ws = await open(url);
  const requests = [
    encodeMessage({ op: Opcode.AuthResume, id: "resume", body: { token: body.session.token } }),
    ...Array.from({ length: MAX_UNANSWERED_COMMANDS }, (_, i) => encodeMessage({ op: Opcode.BattleSettle, id: `c${i}`, body: {} })),
    encodeMessage({ op: Opcode.StateFetch, id: "fetch", body: {} }),
    encodeMessage({ op: Opcode.Ping, id: "ping", body: {} }),
  ];
  const answered = new Promise<void>(resolve => {
    let answers = 0;
    ws.on("message", () => ++answers === requests.length && resolve());
  });
  for (const message of requests) ws.send(message);
  await answered;
  await sleep(50);
  expect(ws.readyState).toBe(WebSocket.OPEN);
});

test("closes a connection with more requests waiting for answers than a client may have, counting only those not yet answered", async () => {
  let holding = false;
  const answer = encodeMessage({ id: "", serverTime: 0, code: ResultCode.Ok, body: null });
  const rpc = {
    connect: () => ({ receive: () => (holding ? new Promise<Uint8Array>(() => {}) : Promise.resolve(answer)), closed() {} }),
  } as Rpc;
  const url = await start(undefined, rpc);
  const ping = encodeMessage({ op: Opcode.Ping, id: "1", body: {} });

  // 답한 요청은 기다리는 것이 아니다.
  const answering = await open(url);
  const answered = new Promise<void>(resolve => {
    let answers = 0;
    answering.on("message", () => ++answers === MESSAGE_BURST + 1 && resolve());
  });
  for (let i = 0; i < MESSAGE_BURST; i++) answering.send(ping);
  // 메시지 몫이 다시 찰 때까지 기다린다(초당 20개).
  await sleep(150);
  answering.send(ping);
  await answered;
  expect(answering.readyState).toBe(WebSocket.OPEN);

  holding = true;
  const held = await open(url);
  const closed = untilClosed(held);
  for (let i = 0; i < MESSAGE_BURST; i++) held.send(ping);
  await sleep(150);
  held.send(ping);
  expect(await closed).toEqual({ answers: 0, code: 1008, reason: "Too many requests are waiting for answers." });
});
