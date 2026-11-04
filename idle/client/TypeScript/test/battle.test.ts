import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import {
  applyCommand, BattleMode, HOUR, offlineReward, playerBattle, settle, type Battle, type BattleEvent, type Command, type GameError, type PlayerState,
} from "@idle/game-core";
import { accepted, testPlayer } from "@idle/game-core/testing";
import { expect, test, vi } from "vitest";
import { createBattle, type ShownEvent } from "../src/application/battle/battle.js";
import { createEventBus, type AppEventMap, type OfflineRewarded } from "../src/application/events.js";
import { createAppState } from "../src/application/state/app-state.js";

// 서비스가 만든 전투를 모두 모아, 버린 전투가 더 진행되었는지 테스트가 볼 수 있게 한다.
const battles = vi.hoisted((): Battle[] => []);
vi.mock("@idle/game-core", async importOriginal => {
  const core = await importOriginal<typeof import("@idle/game-core")>();
  return {
    ...core,
    playerBattle: (...args: Parameters<typeof core.playerBattle>) => {
      const battle = core.playerBattle(...args);
      battles.push(battle);
      return battle;
    },
  };
});

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const AT = 1_000_000;

const player = (stageId = 3001, at = AT, level = 1) =>
  testPlayer(data, at, { hero: { level }, stage: { currentId: stageId, clearedIds: [] } });

// 3004에서 다음에 나올 것이 보스인 저장 데이터. 1레벨 영웅은 틱 61에 쓰러져 지고, 20레벨은 틱 102에 이긴다.
function bossFight(level = 1): PlayerState {
  const state = player(3004, AT, level);
  return { ...state, battle: { ...state.battle, mode: BattleMode.Boss, waves: 3 } };
}

// 3001에서 클리어도 보스도 없이 사냥만 한다. 보스 없는 스테이지의 클리어는 autoBoss가 켜져 있어야 한다.
function huntOnly(): PlayerState {
  const state = player();
  return { ...state, battle: { ...state.battle, autoBoss: false } };
}

const reset = (tick: number): ShownEvent => ({ tick, type: "reset" });

function run(state: PlayerState, tick: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  playerBattle(state, data).advance(tick, event => events.push(event));
  return events;
}

// 서버를 기다리지 않고 progress처럼 커맨드를 즉시 적용하는 가짜. 답은 테스트가 answer()나 fail()로 준다.
function setUp(save: PlayerState | null, send?: (command: Command) => Promise<GameError | undefined>) {
  let now = AT;
  const state = createAppState({ player: save });
  const sent: Command[] = [];
  const answers: { resolve(): void; fail(): void }[] = [];
  const warnings: unknown[][] = [];
  const progress = {
    send: send ?? ((command: Command): Promise<GameError | undefined> => {
      sent.push(command);
      const result = applyCommand(state.player.value!, command, { now, data });
      if (!result.ok) return Promise.resolve(result.error);
      const before = state.player.value!;
      state.player.value = result.state;
      return new Promise((resolve, reject) => answers.push({
        resolve: () => resolve(undefined),
        // progress처럼 실패한 커맨드를 되돌리고 reject한다.
        fail: () => {
          state.player.value = before;
          reject(new Error("Command failed"));
        },
      }));
    }),
  };
  const logger = { debug() {}, info() {}, warn: (...args: unknown[]) => void warnings.push(args), error() {} };
  const events = createEventBus<AppEventMap>(logger);
  const rewards: OfflineRewarded[] = [];
  events.on("offlineReward", reward => rewards.push(reward));
  const battle = createBattle({ state, data, clock: { now: () => now }, progress, events, logger });

  // `from`부터 `to`까지 100 ms마다 한 프레임씩 진행하고 이벤트를 이어 붙인다.
  function frames(from: number, to: number): ShownEvent[] {
    const events: ShownEvent[] = [];
    for (let time = from; time <= to; time += 100) {
      now = time;
      events.push(...battle.advance());
    }
    return events;
  }

  return {
    battle, sent, warnings, rewards, frames,
    player: () => state.player.value!,
    setPlayer: (next: PlayerState | null) => void (state.player.value = next),
    setNow: (time: number) => void (now = time),
    answer: async () => {
      answers.shift()!.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
    fail: async () => {
      answers.shift()!.fail();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
  };
}

test("shows nothing before login", () => {
  const t = setUp(null);
  expect(t.battle.advance()).toEqual([]);
  expect(t.battle.snapshot.value).toBeUndefined();
});

test("advance shows the events up to the server clock, each once", () => {
  const start = player();
  const t = setUp(start);
  // 처음 보이는 전투는 화면이 배우를 세우도록 reset으로 시작한다.
  expect(t.frames(AT, AT + 30_000)).toEqual([reset(0), ...run(start, 300)]);
  expect(t.battle.advance()).toEqual([]);
});

test("settles every SETTLE_INTERVAL_MS, never while one is on its way", async () => {
  const t = setUp(huntOnly());
  t.frames(AT, AT + 59_900);
  expect(t.sent).toEqual([]);

  t.frames(AT + 60_000, AT + 60_000);
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);

  // 답이 오기 전에는 주기가 지나도 보내지 않고, 답이 온 뒤의 첫 프레임에 보낸다.
  t.frames(AT + 60_100, AT + 125_000);
  expect(t.sent).toHaveLength(1);
  await t.answer();
  t.frames(AT + 125_100, AT + 125_100);
  expect(t.sent).toHaveLength(2);
});

test("settles at once when a boss fight ends", () => {
  const t = setUp(bossFight());
  const events = t.frames(AT, AT + 6_000);
  expect(events.some(event => event.type === "bossEnd")).toBe(false);
  expect(t.sent).toEqual([]);

  expect(t.frames(AT + 6_100, AT + 6_100)).toContainEqual(expect.objectContaining({ type: "bossEnd", win: false }));
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);
});

test("settles at once when a boss win happens inside a catch-up", () => {
  const t = setUp(bossFight(20));
  t.frames(AT, AT + 8_000);
  expect(t.sent).toEqual([]);
  expect(t.frames(AT + 11_000, AT + 11_000)).toEqual([reset(110)]);
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);
});

test("settles at once when a stage without a boss is cleared", () => {
  const t = setUp(player());
  t.frames(AT, AT + 15_400);
  expect(t.sent).toEqual([]);
  expect(t.frames(AT + 15_500, AT + 15_500)).toContainEqual(expect.objectContaining({ type: "stageClear", stageId: 3001 }));
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);
});

test("a failed settle rolled back before a clear waits for SETTLE_INTERVAL_MS instead of retrying", async () => {
  const t = setUp(player());
  const sentAt: number[] = [];
  for (let time = AT; time <= AT + 150_000; time += 100) {
    // 보낸 지 세 프레임 뒤에 실패한다. 보이는 전투는 그새 예측한 체크포인트로 옮겼으므로, 되돌린
    // 체크포인트에서 이미 정산하려 한 클리어를 다시 지난다.
    if (sentAt.length > 0 && time - AT === sentAt[sentAt.length - 1] + 300) await t.fail();
    const before = t.sent.length;
    t.frames(time, time);
    if (t.sent.length > before) sentAt.push(time - AT);
  }
  // 3001, 3002, 3003 클리어(15.5초, 40.1초, 68초)에 바로, 그 뒤로는 60초가
  // 지나서야 다시 보낸다.
  expect(sentAt).toEqual([15_500, 40_100, 68_000, 128_000]);
});

test("settles on the first frame when the checkpoint is stale", () => {
  const t = setUp(player(3001, 0));
  expect(t.battle.advance()).toEqual([reset(0)]);
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);
  expect(t.player().battle.at).toBe(AT);
  expect(t.battle.snapshot.value).toBeDefined();
});

test("shows nothing while a stale checkpoint cannot be settled", () => {
  const t = setUp(player(3001, 0), () => Promise.reject(new Error("offline")));
  expect(t.battle.advance()).toEqual([]);
  expect(t.battle.snapshot.value).toBeUndefined();
});

test("announces the offline reward once the stale settle is accepted", async () => {
  const away = player(3002, AT - 3 * HOUR);
  const t = setUp(away);
  t.battle.advance();
  // 보유량과 레벨은 예측으로 바로 오르고, 알림은 서버가 받아들인 뒤에 온다.
  expect(t.player()).toMatchObject({ items: settle(away, data, AT).items, hero: settle(away, data, AT).hero });
  const level = t.player().hero.level;
  expect(level).toBeGreaterThan(1);
  expect(t.rewards).toEqual([]);
  await t.answer();
  expect(t.rewards).toEqual([{ ...offlineReward(away, data, AT), level: { from: 1, to: level } }]);
  // 알림은 상태가 아니라서 다음 프레임이나 다시 연 화면에 다시 오지 않는다.
  t.battle.advance();
  expect(t.rewards).toHaveLength(1);
});

test("announces only the offline reward the server took", async () => {
  const t = setUp(player(3002, AT - 3 * HOUR));
  t.battle.advance();
  await t.fail();
  expect(t.rewards).toEqual([]);
  // 되돌려진 낡은 체크포인트는 다음 프레임에 다시 정산한다.
  t.battle.advance();
  await t.answer();
  expect(t.rewards.map(reward => reward.duration)).toEqual([3 * HOUR]);
});

test("the snapshot signal follows the frames and empties without a save", () => {
  const start = huntOnly();
  const t = setUp(start);
  expect(t.battle.snapshot.value).toBeUndefined();

  t.frames(AT, AT + 3_000);
  const early = t.battle.snapshot.value?.waves;
  t.frames(AT + 3_100, AT + 9_000);
  const expected = playerBattle(start, data);
  expected.advance(90);
  expect(t.battle.snapshot.value?.waves).toBe(expected.snapshot().waves);
  expect(t.battle.snapshot.value?.waves).toBeGreaterThan(early!);

  // 세션이 끝나면 프레임이 멈춰 advance()가 불리지 않아도 비워진다.
  t.setPlayer(null);
  expect(t.battle.snapshot.value).toBeUndefined();
  t.battle.advance();
  expect(t.battle.snapshot.value).toBeUndefined();
});

test("the shown items are what the shown battle holds, and stay put when a settle confirms them", () => {
  const start = { ...huntOnly(), items: { 1: Big.from(1000) } };
  const t = setUp(start);
  expect(t.battle.items.value).toBe(start.items);
  const seen: unknown[] = [];
  t.battle.items.subscribe(items => seen.push(items));

  t.frames(AT, AT + 30_000);
  const expected = playerBattle(start, data);
  expected.advance(300);
  const shown = expected.snapshot().items;
  expect(Big.gt(shown[1], 1000)).toBe(true);
  expect(t.battle.items.value).toEqual(shown);
  // 처치 때만 바뀐다(프레임마다가 아니라).
  expect(seen.length).toBeLessThan(30);

  // 정산은 마지막 경계(웨이브 클리어)까지만 확정하므로 웨이브 중의 처치는 저장 데이터에 아직 없지만, 보이는 보유량은
  // 보이는 전투를 따라 그대로다.
  const settled = settle(start, data, AT + 30_000);
  expect(Big.lte(settled.items[1], shown[1])).toBe(true);
  t.setPlayer(settled);
  t.battle.advance();
  expect(t.battle.items.value).toEqual(shown);

  t.setPlayer(null);
  expect(t.battle.items.value).toEqual({});
});

test("the shown hero level is the shown battle's, which rises at a boundary before the save does", () => {
  const start = { ...huntOnly(), items: { [data.constants.expItemId]: Big.from(1_000_000) } };
  const t = setUp(start);
  // 보이는 전투가 없으면 저장된 레벨이다.
  expect(t.battle.heroLevel.value).toBe(1);

  t.frames(AT, AT + 30_000);
  expect(t.battle.heroLevel.value).toBe(t.battle.snapshot.value!.hero.level);
  expect(t.battle.heroLevel.value).toBeGreaterThan(t.player().hero.level);

  t.setPlayer(null);
  expect(t.battle.heroLevel.value).toBe(0);
});

test("the shown items are what a settle now would save, the kills in the wave under way included", () => {
  const start = { ...huntOnly(), items: { 1: Big.from(1000) } };
  const t = setUp(start);
  t.battle.advance();
  expect(t.battle.items.value).toBe(start.items);

  // 30초에는 웨이브의 둘 중 하나만 쓰러졌다(29.5초). 정산은 그 처치까지 저장하므로 보이는 골드를 바로 쓸 수 있다.
  t.frames(AT, AT + 30_000);
  const settled = settle(start, data, AT + 30_000);
  expect(settled.battle.enemies.length).toBeGreaterThan(0);
  expect(t.battle.items.value).toEqual(settled.items);
  expect(Big.toNumber(settled.items[1])).toBeGreaterThan(1000);

  // 정산이 그 틱을 저장해도 같고, 화면은 다시 세우지 않는다.
  t.setPlayer(settled);
  expect(t.battle.advance()).toEqual([]);
  expect(t.battle.items.value).toEqual(settled.items);
});

test("an upgrade during a fight goes on with the same enemies where they were, without starting the wave over", () => {
  const start = { ...player(3003, AT, 20), items: { 1: Big.from(1e6) } };
  const t = setUp(start);
  let time = AT + 3_000;
  t.frames(AT, time);
  while (t.battle.snapshot.value!.enemies.length === 0) t.frames((time += 100), time);
  const before = t.battle.snapshot.value!.enemies;
  t.setPlayer(accepted(applyCommand(t.player(), { type: Opcode.StatUpgrade, upgradeId: 7001, steps: 1 }, { now: time, data })));
  // 능력치가 바뀌어 길이 달라지므로 화면은 reset으로 맞추지만, 장면은 그대로다.
  expect(t.frames(time, time)).toEqual([reset(0)]);
  expect(t.battle.snapshot.value!.enemies).toEqual(before);
});

test("a checkpoint the shown battle passed through continues without a reset", () => {
  const start = player();
  const t = setUp(start);
  // 3001을 클리어한 14.9초에 나간 정산을 progress가 바로 적용한다.
  const events = t.frames(AT, AT + 70_000);
  expect(t.sent).toEqual([{ type: Opcode.BattleSettle }]);
  expect(t.player().battle.at).toBeGreaterThan(AT);
  expect(events).toEqual([reset(0), ...run(start, 700)]);
});

// 한 프레임씩 100 ms마다 진행하며 `upcoming(ms)`이 알린 공격을 타격의 서버 시각과 함께 모은다.
function announce(t: ReturnType<typeof setUp>, from: number, to: number, ms: number) {
  const announced: { by: number; skillId: number; at: number }[] = [];
  for (let time = from; time <= to; time += 100) {
    t.setNow(time);
    t.battle.advance();
    for (const { by, skillId, inMs } of t.battle.upcoming(ms)) {
      expect(inMs).toBeGreaterThan(0);
      expect(inMs).toBeLessThanOrEqual(ms);
      announced.push({ by, skillId, at: time + inMs });
    }
  }
  return announced;
}

const attacksOf = (events: readonly BattleEvent[]) =>
  events.flatMap(event => (event.type === "attack" ? [{ by: event.by, skillId: event.skillId, at: AT + event.tick * 100 }] : []));

test("upcoming announces every attack of the shown path once before it lands, also across a settle that replaces the shown battle", () => {
  const start = player();
  const t = setUp(start);
  // 14.9초의 정산으로 보이는 전투가 바뀌어 예측 전투도 다시 만든다(위 테스트).
  const announced = announce(t, AT, AT + 70_000, 500);
  expect(t.player().battle.at).toBeGreaterThan(AT);
  expect(announced).toEqual(attacksOf(run(start, 705)));
  expect(announced.length).toBeGreaterThan(50);
});

test("after a long pause upcoming announces only attacks still to come", () => {
  const start = player();
  const t = setUp(start);
  announce(t, AT, AT, 500);
  const later = AT + 540_000;
  const announced = announce(t, later, later, 500);
  expect(announced).toEqual(attacksOf(run(start, 5405)).filter(attack => attack.at > later));
  expect(announced.length).toBeGreaterThan(0);
});

test("a server checkpoint one boundary later than predicted continues without a reset", () => {
  const start = player();
  // 20초 뒤의 첫 경계 틱. 이 클라이언트는 그 100 ms 전에 정산을 예측했고, 서버는 100 ms 늦은 시각으로 그 경계까지 확정했다.
  const plain = playerBattle(start, data);
  while ((plain.lastBoundary()?.tick ?? 0) < 200) plain.advance(plain.tick + 1);
  const predicted = AT + (plain.tick - 1) * 100;
  const t = setUp(start);
  const events = t.frames(AT, predicted);
  t.setPlayer(settle(start, data, predicted));
  events.push(...t.battle.advance());
  const confirmed = settle(start, data, predicted + 100);
  expect(confirmed.battle.at).toBe(predicted + 100);
  t.setPlayer(confirmed);
  events.push(...t.battle.advance());
  events.push(...t.frames(predicted + 100, AT + 50_000));
  expect(events).toEqual([reset(0), ...run(start, 500)]);
});

test("a checkpoint off the shown path resets once", () => {
  const t = setUp(player(3002));
  t.frames(AT, AT + 10_000);
  t.battle.selectStage(3001);
  const selected = t.player();
  expect(selected.stage.currentId).toBe(3001);
  expect(t.battle.advance()).toEqual([reset(0)]);
  expect(t.frames(AT + 10_100, AT + 20_000)).toEqual(run(selected, 100));
});

test("a long pause catches up quietly with one reset", () => {
  const start = player();
  const t = setUp(start);
  t.frames(AT, AT);
  expect(t.frames(AT + 540_000, AT + 540_000)).toEqual([reset(5400)]);
  const expected = playerBattle(start, data);
  expected.advance(5400);
  expect(t.battle.snapshot.value).toEqual(expected.snapshot());
});

test("a login long after the frames stopped replaces the shown battle without running the gap", () => {
  const t = setUp(player());
  t.frames(AT, AT + 1_000);
  const old = battles.at(-1)!;
  const tick = old.tick;
  // 로그아웃하면 화면이 닫혀 프레임이 멈추므로 advance()가 불리지 않는다. 지난 전투는 더 돌리지 않는다.
  t.setPlayer(null);
  const later = AT + 24 * 60 * 60 * 1000;
  t.setNow(later);
  t.setPlayer(player(3001, later));
  expect(t.battle.advance()).toEqual([reset(0)]);
  expect(old.tick).toBe(tick);
  expect(t.battle.snapshot.value).toEqual(playerBattle(t.player(), data).snapshot());
});

test("a login right after the session ended starts the new screen with a reset", () => {
  const start = player();
  const t = setUp(start);
  t.frames(AT, AT + 1_000);
  // 세션이 끝나 화면이 닫히고, 1초 뒤 같은 체크포인트(새 객체)로 다시 로그인한다. 새 화면의 배우는
  // reset으로만 세워지므로, 따라잡을 수 있는 거리여도 이어 가지 않고 reset으로 시작한다.
  t.setPlayer(null);
  t.setNow(AT + 2_000);
  t.setPlayer({ ...start, battle: { ...start.battle }, stage: { ...start.stage } });
  expect(t.battle.advance()).toEqual([reset(20)]);
});

test("a resumed save replaces the shown battle", () => {
  const t = setUp(bossFight());
  t.frames(AT, AT + 3_000);
  expect(t.battle.snapshot.value?.mode).toBe(BattleMode.Boss);

  t.setPlayer(player(3004, AT + 3_000));
  expect(t.battle.advance()).toEqual([reset(0)]);
  expect(t.battle.snapshot.value?.mode).toBe(BattleMode.Hunt);
});

test("a boss challenge continues the shown fight and the boss comes after the next boundary", () => {
  const hunting = player(3004);
  const start = { ...hunting, battle: { ...hunting.battle, waves: 3, autoBoss: false } };
  const t = setUp(start);
  const events = t.frames(AT, AT + 3_000);
  t.battle.bossChallenge();
  expect(t.player().battle.autoBoss).toBe(true);
  events.push(...t.frames(AT + 3_100, AT + 40_000));

  const uninterrupted = run(start, 400);
  // 도전한 시각(틱 30) 뒤의 첫 경계(웨이브 클리어나 부활).
  const plain = playerBattle(start, data);
  while ((plain.lastBoundary()?.tick ?? 0) <= 30) plain.advance(plain.tick + 1);
  const boundary = plain.lastBoundary()!.tick;
  expect(events.filter(event => event.type === "reset")).toEqual([reset(0)]);
  expect(events.filter(event => event.tick <= boundary)).toEqual([reset(0), ...uninterrupted.filter(event => event.tick <= boundary)]);
  expect(events).toContainEqual({ tick: boundary + 1, type: "bossStart" });
});

test("bossChallenge and selectStage send their commands", () => {
  const t = setUp(player());
  t.battle.bossChallenge();
  t.battle.selectStage(3002);
  expect(t.sent).toEqual([{ type: Opcode.BossChallenge }, { type: Opcode.StageSelect, stageId: 3002 }]);
});
