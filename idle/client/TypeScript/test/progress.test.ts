import { readFileSync } from "node:fs";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { applyCommand, playerFingerprint, type Command, type PlayerSnapshot, type PlayerState } from "@idle/game-core";
import { accepted, testPlayer } from "@idle/game-core/testing";
import { MAX_UNANSWERED_COMMANDS } from "@idle/protocol";
import { expect, test } from "vitest";
import type { CommandOutcome, GameServer } from "../src/application/ports.js";
import { createEventBus, type AppEventMap, type Refused } from "../src/application/events.js";
import { createProgress } from "../src/application/progress/progress.js";
import { createAppState } from "../src/application/state/app-state.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

// 3002와 3003으로 옮길 수 있게 둘의 선행 스테이지를 클리어해 둔다.
const player = testPlayer(data, 0, { stage: { currentId: 3001, clearedIds: [3001, 3002] } });

interface Sent {
  readonly command: Command;
  readonly time: number;
  resolve(outcome: CommandOutcome): void;
  reject(error: Error): void;
}

// 게임 규칙이 도는 시각. 테스트가 옮긴다.
let now = 1_000_000;

// 테스트가 커맨드마다 하나씩 답을 주는 서버. 저장 데이터를 받아 오는 요청도 테스트가 답한다.
function setUp(snapshot: PlayerSnapshot = { player, revision: 1 }) {
  const requests: Sent[] = [];
  const fetches: { resolve(snapshot: PlayerSnapshot): void; reject(error: Error): void }[] = [];
  const warnings: unknown[][] = [];
  let resumed: ((snapshot: PlayerSnapshot) => void) | undefined;
  const server: GameServer = {
    open: async () => {},
    login: () => Promise.reject(new Error("Not used here.")),
    send: (command, time) => new Promise((resolve, reject) => requests.push({ command, time, resolve, reject })),
    fetch: () => new Promise((resolve, reject) => fetches.push({ resolve, reject })),
    onResumed(listener) {
      resumed = listener;
      return () => {};
    },
    close() {},
  };
  const state = createAppState();
  const events = createEventBus<AppEventMap>(console);
  const refused: Refused[] = [];
  events.on("refused", refusal => refused.push(refusal));
  const progress = createProgress({
    player: state.player, server, data, clock: { now: () => now }, maxUnanswered: MAX_UNANSWERED_COMMANDS, events,
    logger: { debug() {}, info() {}, warn: (...args: unknown[]) => void warnings.push(args), error() {} },
  });
  progress.reset(snapshot);
  const stage = () => state.player.value?.stage.currentId;
  const select = (stageId: number) => progress.send({ type: Opcode.StageSelect, stageId });
  return { requests, fetches, warnings, state, progress, refused, resume: (save: PlayerSnapshot) => resumed!(save), stage, select };
}

// 서버가 시각을 잘라 바뀐 슬라이스를 함께 보낸 답.
function confirmed(revision: number, changes: Partial<PlayerState>): CommandOutcome {
  return { ok: true, sync: { revision, fingerprint: 0, changes } };
}

// 서버가 받은 시각 그대로 적용해 지문만 보낸 답.
function fingerprinted(revision: number, state: PlayerState): CommandOutcome {
  return { ok: true, sync: { revision, fingerprint: playerFingerprint(state) } };
}

// 확정한 저장 데이터에 커맨드를 그 시각으로 적용한 결과(서버가 확정할 것).
const applied = (state: PlayerState, command: Command, time: number) => accepted(applyCommand(state, command, { now: time, data }));

const settle = { type: Opcode.BattleSettle } as const;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function rejected(code: GameErrorCode): CommandOutcome {
  return { ok: false, error: { code, message: "" } };
}

const at = (currentId: number) => ({ stage: { ...player.stage, currentId } });

test("shows a command at once and settles it with the server's changes", async () => {
  const t = setUp();
  const sent = t.select(3002);
  expect(t.stage()).toBe(3002);
  expect(t.requests[0].command).toEqual({ type: Opcode.StageSelect, stageId: 3002 });

  t.requests[0].resolve(confirmed(2, at(3002)));
  expect(await sent).toBeUndefined();
  expect(t.stage()).toBe(3002);
});

test("a fingerprint that matches the prediction confirms it without fetching, also for a command sent behind another", async () => {
  const t = setUp();
  now = player.battle.at + 30_000;
  const first = t.progress.send(settle);
  now += 5_000;
  const second = t.select(3002);
  const [a, b] = t.requests;
  const afterA = applied(player, a.command, a.time);
  a.resolve(fingerprinted(2, afterA));
  expect(await first).toBeUndefined();
  // 둘째는 첫째의 예측 위에서 보냈으므로, 답이 오면 확정한 저장 데이터에 다시 적용해 견준다.
  const afterB = applied(afterA, b.command, b.time);
  b.resolve(fingerprinted(3, afterB));
  expect(await second).toBeUndefined();
  expect(t.state.player.value).toEqual(afterB);
  expect(t.fetches).toEqual([]);
  expect(t.warnings).toEqual([]);
});

test("a fingerprint other than the prediction fetches the saved state, keeping the command shown, and answers meanwhile wait for it", async () => {
  const t = setUp();
  now = player.battle.at + 30_000;
  const first = t.select(3002);
  const second = t.select(3003);
  const [a, b] = t.requests;
  // 서버가 다른 결과를 확정했다(예: 다른 연결이 그 사이 저장함).
  a.resolve(fingerprinted(2, { ...player, tutorial: { stepId: 7 } }));
  await flush();
  expect(t.fetches).toHaveLength(1);
  expect(t.warnings).toHaveLength(1);
  // 받아 오는 동안 두 커맨드는 아직 보인다. 둘째의 답은 받아 오기를 기다린다.
  expect(t.stage()).toBe(3003);
  b.resolve(fingerprinted(3, player));
  await flush();
  const saved = { ...applied(applied(player, a.command, a.time), b.command, b.time), tutorial: { stepId: 7 } };
  t.fetches[0].resolve({ player: saved, revision: 3 });
  expect(await first).toBeUndefined();
  expect(await second).toBeUndefined();
  expect(t.state.player.value).toBe(saved);
  expect(t.fetches).toHaveLength(1);
});

test("an answer the fetched save does not hold yet is confirmed on top of it", async () => {
  const t = setUp();
  now = player.battle.at + 30_000;
  const first = t.select(3002);
  const second = t.select(3003);
  const [a, b] = t.requests;
  a.resolve(fingerprinted(2, { ...player, tutorial: { stepId: 7 } }));
  await flush();
  // 받아 온 저장 데이터는 첫째까지만 담았고(revision 2), 둘째는 그 위에서 견준다.
  const fetched = { ...applied(player, a.command, a.time), tutorial: { stepId: 7 } };
  t.fetches[0].resolve({ player: fetched, revision: 2 });
  await first;
  const afterB = applied(fetched, b.command, b.time);
  b.resolve(fingerprinted(3, afterB));
  expect(await second).toBeUndefined();
  expect(t.state.player.value).toEqual(afterB);
  expect(t.fetches).toHaveLength(1);
});

test("a fetch that fails is only logged, and the next resume brings the save", async () => {
  const t = setUp();
  now = player.battle.at + 30_000;
  const sent = t.select(3002);
  t.requests[0].resolve(fingerprinted(2, player));
  await flush();
  t.fetches[0].reject(new Error("The connection closed."));
  expect(await sent).toBeUndefined();
  expect(t.warnings).toHaveLength(2);
  t.resume({ player: { ...player, stage: at(3002).stage }, revision: 2 });
  expect(t.stage()).toBe(3002);
});

test("sends each command with the server time it was predicted at", async () => {
  const t = setUp();
  now = 1_000_000;
  void t.select(3002);
  now = 1_000_250;
  void t.select(3003);
  expect(t.requests.map(request => request.time)).toEqual([1_000_000, 1_000_250]);
});

test("clearing takes the save off screen, and a command still waiting does not bring it back", async () => {
  const t = setUp();
  const sent = t.select(3002);
  t.progress.clear();
  expect(t.state.player.value).toBeNull();

  t.requests[0].resolve(confirmed(2, at(3002)));
  await sent;
  expect(t.state.player.value).toBeNull();
  await expect(t.select(3003)).rejects.toThrow("Log in");
});

test("a refused command is undone, and the ones after it are redone on the server's save", async () => {
  const t = setUp();
  const first = t.select(3002);
  const second = t.select(3003);
  expect(t.stage()).toBe(3003);

  // 서버는 커맨드를 보낸 순서대로 답한다.
  t.requests[0].resolve(rejected(GameErrorCode.StageNotFound));
  expect(await first).toMatchObject({ code: GameErrorCode.StageNotFound });
  expect(t.stage()).toBe(3003);
  // 거절은 화면에서 그 효과가 빠진 뒤에 알린다.
  expect(t.refused).toEqual([{ command: { type: Opcode.StageSelect, stageId: 3002 }, error: { code: GameErrorCode.StageNotFound, message: "" } }]);
  t.requests[1].resolve(confirmed(2, at(3003)));
  await second;
  expect(t.stage()).toBe(3003);

  const third = t.select(3002);
  const fourth = t.select(3001);
  t.requests[2].resolve(confirmed(3, at(3002)));
  await third;
  // 네 번째는 답이 올 때까지 확정된 저장 데이터 위에 얹혀 보인다.
  expect(t.stage()).toBe(3001);
  t.requests[3].resolve(rejected(GameErrorCode.StageNotFound));
  await fourth;
  expect(t.stage()).toBe(3002);
});

test("after a resume, answers the resumed save already includes change nothing", async () => {
  const t = setUp();
  const sent = t.select(3002);
  // 서버가 그것을 적용했고(revision 2), 그 뒤 다른 곳에서 스테이지를 옮겼다(revision 3).
  t.resume({ player: { ...player, ...at(3003) }, revision: 3 });
  expect(t.stage()).toBe(3003);

  // 커맨드가 다시 나가고, 서버는 처음과 같은 답을 준다.
  t.requests[0].resolve(confirmed(2, at(3002)));
  await sent;
  expect(t.stage()).toBe(3003);

  // 더 새로운 답은 여전히 적용된다.
  const next = t.select(3001);
  expect(t.stage()).toBe(3001);
  t.requests[1].resolve(confirmed(4, at(3001)));
  await next;
  expect(t.stage()).toBe(3001);
});

test("a command that fails or never reaches the server is undone, and the error passes on", async () => {
  const t = setUp();
  const lost = t.select(3002);
  t.requests[0].reject(new Error("The connection ended: replaced."));
  await expect(lost).rejects.toThrow("replaced");
  expect(t.stage()).toBe(3001);

  const failed = t.select(3002);
  // 서버 어댑터는 서버 오류를 거부로 바꾼다.
  t.requests[1].reject(new Error("Command failed: boom"));
  await expect(failed).rejects.toThrow("Command failed: boom");
  expect(t.stage()).toBe(3001);
  // 규칙의 거절이 아니므로 알리지 않는다.
  expect(t.refused).toEqual([]);
});

test("a command the rules refuse here is not sent", async () => {
  const t = setUp();
  expect(await t.select(9999)).toMatchObject({ code: GameErrorCode.StageNotFound });
  expect(t.requests).toEqual([]);
  expect(t.refused.map(refusal => refusal.error.code)).toEqual([GameErrorCode.StageNotFound]);
  expect(t.stage()).toBe(3001);
});

test(`at most ${MAX_UNANSWERED_COMMANDS} commands wait for answers`, async () => {
  const t = setUp();
  for (let i = 0; i < MAX_UNANSWERED_COMMANDS; i++) void t.select(i % 2 === 0 ? 3002 : 3003);
  await expect(t.select(3001)).rejects.toThrow(/Too many/);
  t.requests[0].resolve(confirmed(2, at(3002)));
  await Promise.resolve();
  await Promise.resolve();
  const next = t.select(3001);
  expect(t.requests).toHaveLength(MAX_UNANSWERED_COMMANDS + 1);
  t.requests[MAX_UNANSWERED_COMMANDS].resolve(confirmed(3, at(3001)));
  await next;
});
