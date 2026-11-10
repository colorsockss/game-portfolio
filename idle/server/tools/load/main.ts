// 동접 부하 테스트(백로그 70). 배포 번들(dist/main.mjs)을 별도 프로세스로 띄우고, 이 프로세스의 클라이언트 N개가 실제
// WebSocket으로 붙어 서로 다른 로그인 ID로 로그인한 뒤 정해진 속도로 실제 커맨드를 보낸다. 서버의 CPU, 메모리, 이벤트 루프,
// SQLite 시간은 서버 프로세스에 --import로 넣은 probe.mjs가 재고, 지연은 이 프로세스가 보낸 때부터 답을 받을 때까지다.
// `npm run load -- [옵션]`으로 실행한다: tools/load.mjs가 서버를 빌드하고 이 파일을 묶어 runLoad를 부른다.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import WebSocket from "ws";
import { GameErrorCode, Opcode } from "@idle/codes";
import { ItemKind, loadGameData, type GameData } from "@idle/data-schema";
import { isCommandOpcode, type PlayerState } from "@idle/game-core";
import {
  ResultCode, decodeMessage, encodeMessage, type Apis, type LoginResult, type ResponseEnvelope,
} from "@idle/protocol";
import { capacity, percentile, usage, type Sample } from "./report.js";

const usageText = `Usage: npm run load -- [--clients 500] [--seconds 60] [--rate 0.1] [--ramp <s>]
  --clients  WebSocket clients, each logged in with its own ID
  --seconds  length of the measured window, which starts once every client has logged in
  --rate     messages per second per client (default 0.1: an active player taps every 10 s and settles once a minute)
  --ramp     seconds over which the clients connect and log in (default clients / 500, at least 2)`;

// 밸런스 bench(idle/balance/src/bench.ts)와 같은 중반 상태: 3005까지 열고 레벨 30으로 3005를 사냥한다.
const MID_STAGE = 3005;
const MID_LEVEL = 30;
// 측정하는 동안 강화가 골드 때문에 거절되지 않을 만큼. 안전한 정수여야 한다(CheatItemGrant).
const GOLD = 1e15;
// 답을 기다리지 않고 보내 둔 요청이 이 시간 안에 오지 않으면 잃은 것으로 센다.
const DRAIN_MS = 10_000;

const serverMain = fileURLToPath(new URL("../../dist/main.mjs", import.meta.url));
const probe = new URL("probe.mjs", import.meta.url);
const dataDirectory = new URL("../../../shared/data-schema/data/", import.meta.url);

type Request = readonly [op: keyof Apis, body: object];

interface Answer {
  readonly response: ResponseEnvelope;
  /** 보낸 때부터 답을 받을 때까지(ms). */
  readonly ms: number;
  /** 요청과 응답 메시지의 바이트. WebSocket 프레임 머리(2–14바이트)와 TCP/IP는 빼고 센다. */
  readonly sentBytes: number;
  readonly receivedBytes: number;
}

interface Socket {
  request(op: keyof Apis, body: object): Promise<Answer>;
  close(): void;
}

interface RunningServer {
  readonly url: string;
  /** 서버 프로세스의 누적 값. `gc`면 GC를 돌린 뒤에 잰다. */
  sample(gc?: boolean): Promise<Sample>;
  stop(): Promise<void>;
}

/** 클라이언트 하나가 돌려 가며 보내는 장비와 강화. */
interface Plan {
  readonly upgrades: readonly number[];
  readonly gear: readonly number[];
  /** 같은 아이템의 장비 둘. 번갈아 입으므로 착용이 매번 장비를 바꾼다. */
  readonly pairs: readonly (readonly [number, number])[];
}

/** `directory`(임시 폴더)에 DB와 서버 로그를 두고 부하 테스트를 돌려 결과를 찍는다. */
export async function runLoad(directory: string): Promise<void> {
  const { values } = parseArgs({
    options: {
      clients: { type: "string", default: "500" },
      seconds: { type: "string", default: "60" },
      rate: { type: "string", default: "0.1" },
      ramp: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usageText);
    return;
  }
  const clients = option("clients", values.clients, 1, 15_000, true);
  const seconds = option("seconds", values.seconds, 1, 3600);
  const rate = option("rate", values.rate, 0.001, 100);
  const rampMs = (values.ramp === undefined ? Math.max(2, clients / 500) : option("ramp", values.ramp, 0, 3600)) * 1000;
  const periodMs = 1000 / rate;

  const data = await loadGameData(table => readFile(new URL(`${table}.bytes`, dataDirectory)));
  const databasePath = path.join(directory, "load.sqlite");

  let started = performance.now();
  const setup = await startServer(directory, databasePath, "development");
  try {
    await prepare(setup.url, clients, data);
  } finally {
    await setup.stop();
  }
  console.log(`Prepared ${clients} accounts in ${((performance.now() - started) / 1000).toFixed(1)} s on a development server.`);

  // 측정하는 창(performance.now() ms). 창 안에서 보낸 요청의 지연과 결과, 창 안에서 받은 답의 수를 센다.
  const measured = { from: Infinity, to: Infinity };
  const latencies: number[] = [];
  const outcomes = new Map<string, number>();
  const logins: number[] = [];
  let sent = 0;
  let sentBytes = 0;
  let receivedBytes = 0;
  let answered = 0;
  let lost = 0;
  let inFlight = 0;
  let sending = true;

  async function player(index: number, url: string): Promise<Socket> {
    await sleep((index * rampMs) / clients);
    const socket = await connect(url);
    const login = await socket.request(Opcode.AuthLogin, { loginId: loginIdOf(index) });
    logins.push(login.ms);
    if (login.response.code !== ResultCode.Ok) throw new Error(`${loginIdOf(index)} failed to log in: ${describe(login.response)}`);
    const next = cycle(planOf((login.response.body as LoginResult).snapshot.player, data));
    // 열린 루프: 답을 기다리지 않고 정해진 때에 보낸다. 서버가 밀려도 보내는 속도가 그대로라야 밀린 만큼 지연이 드러난다.
    let at = performance.now() + Math.random() * periodMs;
    const tick = () => {
      if (!sending) return;
      const [op, body] = next();
      const sentAt = performance.now();
      const counted = sentAt >= measured.from && sentAt < measured.to;
      if (counted) sent++;
      inFlight++;
      socket.request(op, body).then(
        answer => {
          const now = performance.now();
          if (now >= measured.from && now < measured.to) answered++;
          if (!counted) return;
          latencies.push(answer.ms);
          sentBytes += answer.sentBytes;
          receivedBytes += answer.receivedBytes;
          const { response } = answer;
          const outcome = describe(response);
          outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
        },
        () => {
          if (counted) lost++;
        },
      ).finally(() => inFlight--);
      at += periodMs;
      setTimeout(tick, Math.max(0, at - performance.now()));
    };
    setTimeout(tick, Math.max(0, at - performance.now()));
    return socket;
  }

  const server = await startServer(directory, databasePath, "release", true);
  let idle: Sample, before: Sample, after: Sample, connected: Sample, wallMs: number, loadBusy: number;
  try {
    idle = await server.sample(true);
    started = performance.now();
    const sockets = await Promise.all(Array.from({ length: clients }, (_, index) => player(index, server.url)));
    const rampedMs = performance.now() - started;
    // 모든 클라이언트가 한 번은 보낸 뒤부터 잰다.
    await sleep(Math.max(2000, periodMs));
    before = await server.sample();
    const loadElu = performance.eventLoopUtilization();
    measured.from = performance.now();
    await sleep(seconds * 1000);
    measured.to = performance.now();
    after = await server.sample();
    wallMs = measured.to - measured.from;
    loadBusy = performance.eventLoopUtilization(loadElu).utilization;
    sending = false;
    const deadline = performance.now() + DRAIN_MS;
    while (inFlight > 0 && performance.now() < deadline) await sleep(50);
    connected = await server.sample(true);
    for (const socket of sockets) socket.close();
    console.log(`Logged ${clients} clients in over ${(rampedMs / 1000).toFixed(1)} s, then measured ${seconds} s.`);
  } finally {
    await server.stop();
  }
  const databaseBytes = await sizeOf(databasePath);

  latencies.sort((a, b) => a - b);
  logins.sort((a, b) => a - b);
  const used = usage(before, after, wallMs);
  const fit = capacity(clients, used, idle.rss, connected.rss);
  const throughput = (answered / wallMs) * 1000;
  const mib = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);
  const kib = (bytes: number) => (bytes / 1024).toFixed(1);
  const ms = (value: number) => value.toFixed(2);
  const percent = (value: number) => (value * 100).toFixed(1);
  const cpus = os.cpus();

  console.log(`
Machine     ${cpus[0]?.model ?? "unknown CPU"}, ${cpus.length} cores, ${(os.totalmem() / 1024 ** 3).toFixed(0)} GiB, ${os.type()} ${os.release()}, Node ${process.version}
Load        ${clients} clients x ${rate} msg/s, ${seconds} s window (cycle: settle, stat upgrade, enhance, equip, stat upgrade, enhance)
Logins      p50 ${ms(percentile(logins, 0.5))} ms, p99 ${ms(percentile(logins, 0.99))} ms
Requests    ${sent} sent in the window, ${latencies.length} answered, ${lost} lost; ${throughput.toFixed(1)} answers/s
Outcomes    ${[...outcomes].map(([name, count]) => `${name} ${count}`).join(", ")}
Latency     p50 ${ms(percentile(latencies, 0.5))} ms, p95 ${ms(percentile(latencies, 0.95))} ms, p99 ${ms(percentile(latencies, 0.99))} ms, max ${ms(latencies.at(-1) ?? NaN)} ms
Server CPU  ${percent(used.cpu)}% of a core (all threads), event loop busy ${percent(used.busy)}%, ${((used.cpuMs * 1000) / Math.max(1, answered)).toFixed(0)} us CPU per request
SQLite      ${percent(used.sqlite)}% of wall time; per request ${((used.sqliteMs * 1000) / Math.max(1, answered)).toFixed(0)} us in ${(used.sqliteCalls / Math.max(1, answered)).toFixed(1)} statements, of which ${((used.transactionMs * 1000) / Math.max(1, answered)).toFixed(0)} us in transactions (commit and fsync); longest call ${used.longestSqliteMs.toFixed(1)} ms (${used.longestSql.replace(/\s+/g, " ").slice(0, 60)})
Traffic     ${(sentBytes / Math.max(1, latencies.length)).toFixed(0)} B per request, ${(receivedBytes / Math.max(1, latencies.length)).toFixed(0)} B per response (MessagePack)
Memory      idle RSS ${mib(idle.rss)} MiB, heap ${mib(idle.heapUsed)} MiB; ${clients} connected after GC RSS ${mib(connected.rss)} MiB, heap ${mib(connected.heapUsed)} MiB; peak RSS ${mib(connected.maxRss)} MiB
Per client  ${kib(fit.bytesPerClient)} KiB RSS, ${kib((connected.heapUsed - idle.heapUsed) / clients)} KiB heap, ${kib(databaseBytes / clients)} KiB in the database
Capacity    ${fit.perCore.toFixed(0)} clients per core at 100% (this load scaled up), ${fit.perGiB.toFixed(0)} clients per GiB
Load tool   event loop busy ${percent(loadBusy)}%${loadBusy > 0.7 ? " (high: the latencies include this process's own delay; lower --clients or --rate)" : ""}

| ${clients} | ${rate} | ${throughput.toFixed(0)} | ${ms(percentile(latencies, 0.5))} | ${ms(percentile(latencies, 0.95))} | ${ms(percentile(latencies, 0.99))} | ${percent(used.cpu)} | ${percent(used.busy)} | ${percent(used.sqlite)} | ${mib(connected.rss)} | ${mib(connected.heapUsed)} | ${kib(fit.bytesPerClient)} |`);
}

function option(name: string, text: string, min: number, max: number, integer = false): number {
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`--${name} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}, got "${text}".\n\n${usageText}`);
  }
  return value;
}

function loginIdOf(index: number): string {
  return `load_${index}`;
}

// 개발 모드 서버에서 치트로 계정마다 중반 상태와 골드, 슬롯마다 같은 장비 둘을 만든다. 재는 것은 같은 DB를 연 릴리즈 모드
// 서버이므로 치트는 측정에 섞이지 않는다. 소켓 몇 개가 계정을 나눠 하나씩 로그인해 가며 만든다.
async function prepare(url: string, clients: number, data: GameData): Promise<void> {
  const firstOfSlot = new Map<number, number>();
  for (const row of data.items.values()) {
    if (row.kind === ItemKind.Equipment && row.slot !== null && !firstOfSlot.has(row.slot)) firstOfSlot.set(row.slot, row.id);
  }
  const steps: Request[] = [
    [Opcode.CheatStageUnlock, { stageId: MID_STAGE }],
    [Opcode.CheatLevelSet, { level: MID_LEVEL }],
    [Opcode.StageSelect, { stageId: MID_STAGE }],
    [Opcode.CheatItemGrant, { itemId: data.constants.goldItemId, amount: GOLD }],
    ...[...firstOfSlot.values()].map((itemId): Request => [Opcode.CheatItemGrant, { itemId, amount: 2 }]),
  ];
  // 계정마다 연결을 열어 만든다. 서버는 연결마다 로그인을 몇 번까지만 받기 때문이다. 연결을 거듭 여는 동안 macOS의 접속
  // 대기열(kern.ipc.somaxconn 128)이 넘쳐 ECONNRESET이 나지 않게 100개까지만 나란히 연다. 연결마다 게임 커맨드도 초당 10개까지
  // 받으므로, 걸리면 다시 찰 때까지 기다렸다 보낸다(거른 커맨드는 기록되지 않음).
  const lanes = Math.min(clients, 100);
  await Promise.all(Array.from({ length: lanes }, async (_, lane) => {
    for (let index = lane; index < clients; index += lanes) {
      const socket = await connect(url);
      for (const [op, body] of [[Opcode.AuthLogin, { loginId: loginIdOf(index) }] as const, ...steps]) {
        let { response } = await socket.request(op, body);
        while (response.code === ResultCode.TooManyRequests) {
          await sleep(100);
          ({ response } = await socket.request(op, body));
        }
        if (response.code !== ResultCode.Ok) throw new Error(`Preparing ${loginIdOf(index)}: ${Opcode[op]} answered ${describe(response)}.`);
      }
      socket.close();
    }
  }));
}

function planOf(player: PlayerState, data: GameData): Plan {
  const byItem = new Map<number, number[]>();
  for (const [id, instance] of Object.entries(player.equipment.owned)) {
    byItem.set(instance.itemId, [...(byItem.get(instance.itemId) ?? []), Number(id)]);
  }
  const pairs = [...byItem.values()].filter(ids => ids.length >= 2).map(([a, b]) => [a!, b!] as const);
  if (pairs.length === 0) throw new Error(`${player.profile.loginId} has no two of the same equipment.`);
  return { upgrades: [...data.statUpgrades.keys()], gear: [...byItem.values()].flat(), pairs };
}

// 여섯 개가 한 바퀴다. 기본 속도(10초에 하나)면 클라이언트처럼 1분에 한 번 정산하고, 그 사이에 강화와 착용을 누른다.
// 모든 커맨드는 마지막 정산 뒤의 전투를 확정하므로, 전투 시뮬레이션의 양은 보내는 속도와 관계없이 접속한 시간만큼이다.
function cycle(plan: Plan): () => Request {
  let step = 0;
  let upgrade = 0;
  let enhance = 0;
  let equip = 0;
  return () => {
    switch (step++ % 6) {
      case 0:
        return [Opcode.BattleSettle, {}];
      case 1:
      case 4:
        return [Opcode.StatUpgrade, { upgradeId: plan.upgrades[upgrade++ % plan.upgrades.length], steps: 1 }];
      case 2:
      case 5:
        return [Opcode.ItemEnhance, { equipmentId: plan.gear[enhance++ % plan.gear.length] }];
      default: {
        const pair = plan.pairs[equip % plan.pairs.length]!;
        return [Opcode.ItemEquip, { equipmentId: pair[Math.floor(equip++ / plan.pairs.length) % 2] }];
      }
    }
  };
}

// 예: Ok, Rejected NotEnoughGold, BadRequest.
function describe(response: ResponseEnvelope): string {
  if (response.code === ResultCode.Ok) return "Ok";
  if (response.code === ResultCode.Rejected) return `Rejected ${GameErrorCode[response.error.code] ?? response.error.code}`;
  return ResultCode[response.code];
}

async function connect(url: string): Promise<Socket> {
  const ws = new WebSocket(url);
  const waiting = new Map<string, { readonly sentAt: number; readonly sentBytes: number; resolve(answer: Answer): void; reject(error: Error): void }>();
  let nextId = 0;
  ws.on("message", (data: Buffer) => {
    const response = decodeMessage(data) as ResponseEnvelope;
    const entry = waiting.get(response.id);
    if (!entry) return;
    waiting.delete(response.id);
    entry.resolve({ response, ms: performance.now() - entry.sentAt, sentBytes: entry.sentBytes, receivedBytes: data.length });
  });
  ws.on("close", (code, reason) => {
    for (const entry of waiting.values()) entry.reject(new Error(`The socket closed with ${code} ${reason.toString()}.`));
    waiting.clear();
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  return {
    request(op, body) {
      const id = String(++nextId);
      // 클라이언트처럼 게임 커맨드는 예측한 서버 시각을 싣는다(같은 기계라 이 시계가 곧 서버 시계). 그러면 서버는 지문만 답한다.
      const message = encodeMessage(isCommandOpcode(op) ? { op, id, body, time: Date.now() } : { op, id, body });
      return new Promise((resolve, reject) => {
        waiting.set(id, { sentAt: performance.now(), sentBytes: message.length, resolve, reject });
        ws.send(message);
      });
    },
    close: () => ws.close(),
  };
}

// 서버의 출력은 파일로 받는다. 파이프로 받으면 이 프로세스가 로그를 읽느라 바빠진다. `probe`면 계측을 넣고 IPC를 연다.
async function startServer(directory: string, databasePath: string, mode: "development" | "release", probed = false): Promise<RunningServer> {
  const logPath = path.join(directory, `${mode}.log`);
  const log = openSync(logPath, "a");
  const child: ChildProcess = spawn(process.execPath, probed ? ["--expose-gc", "--import", probe.href, serverMain] : [serverMain], {
    env: { ...process.env, PORT: "0", DATABASE_PATH: databasePath, SERVER_MODE: mode },
    stdio: probed ? ["ignore", log, log, "ipc"] : ["ignore", log, log],
  });
  closeSync(log);
  const exited = new Promise<void>(resolve => child.once("exit", () => resolve()));

  // 서버가 알리는 주소는 규칙 테이블의 지문까지 실은 경로다.
  let listening: RegExpExecArray | null = null;
  while (listening === null) {
    const output = await readFile(logPath, "utf8");
    listening = /Listening on ws:\/\/localhost:(\d+)(\/\S*)/.exec(output);
    if (child.exitCode !== null) throw new Error(`The ${mode} server exited with ${child.exitCode}:\n${output}`);
    if (listening === null) await sleep(50);
  }
  return {
    url: `ws://127.0.0.1:${listening[1]}${listening[2]}`,
    sample(gc = false) {
      return new Promise(resolve => {
        child.once("message", message => resolve(message as Sample));
        child.send({ gc });
      });
    },
    async stop() {
      if (child.connected) child.disconnect();
      child.kill("SIGTERM");
      const killer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      await exited;
      clearTimeout(killer);
    },
  };
}

// 서버를 닫은 뒤의 DB 파일. WAL이 남아 있으면 더한다.
async function sizeOf(databasePath: string): Promise<number> {
  const sizes = await Promise.all(["", "-wal"].map(suffix => stat(databasePath + suffix).then(file => file.size, () => 0)));
  return sizes.reduce((a, b) => a + b, 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
