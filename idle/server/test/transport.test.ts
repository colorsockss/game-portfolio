import { once } from "node:events";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { Opcode } from "@idle/codes";
import { fingerprint } from "@idle/data-schema";
import { CloseCode, ResultCode, decodeMessage, encodeMessage, socketPath } from "@idle/protocol";
import { WebSocket, type ClientOptions } from "ws";
import { afterEach, expect, test, vi } from "vitest";
import { createLog } from "../src/log.js";
import { createRpc } from "../src/rpc.js";
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

async function start(heartbeatMs?: number): Promise<string> {
  lines = [];
  const push = (line: string) => void lines.push(line);
  const log = createLog({ log: push, warn: push, error: push }, "debug");
  const rpc = createRpc({ store: await openStore(":memory:"), clock: { now: () => Date.now() }, data, log: log("rpc") });
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
