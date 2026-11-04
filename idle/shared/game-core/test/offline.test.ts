import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { MAX_SETTLE_TICKS, TICK_MS } from "../src/battle/constants.js";
import { offlineReward } from "../src/battle/offline.js";
import { startBattle } from "../src/battle/simulation.js";
import { BattleMode } from "../src/battle/state.js";
import { heroStats } from "../src/battle/stats.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_ITEMS, type ItemAmounts } from "../src/items.js";
import type { PlayerState } from "../src/state.js";
import { accepted, testPlayer } from "../src/testing.js";
import { HOUR } from "../src/time.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const EXP = data.constants.expItemId;
const OFFLINE_CAP = data.constants.offlineCapHours * HOUR;
const AT = 1_000_000;
const SAMPLE_MS = MAX_SETTLE_TICKS * TICK_MS;

const player = (stageId = 3002, level = 1) =>
  testPlayer(data, AT, { hero: { level }, stage: { currentId: stageId, clearedIds: [] } });

// 체크포인트에서 이어지는 사냥(보스 도전, 클리어, 레벨업 없이)의 MAX_SETTLE_TICKS 동안 번 것.
function hunted(state: PlayerState): ItemAmounts {
  const battle = startBattle({
    player: { ...state, items: NO_ITEMS, battle: { ...state.battle, mode: BattleMode.Hunt, autoBoss: false } },
    data,
    levelUps: false,
  });
  battle.advance(MAX_SETTLE_TICKS);
  return battle.snapshot().items;
}

const scaled = (earned: ItemAmounts, scale: number) =>
  Object.fromEntries(Object.entries(earned).map(([id, amount]) => [id, Big.floor(Big.mul(amount, scale))]));

const settleAt = (state: PlayerState, now: number) => accepted(applyCommand(state, { type: Opcode.BattleSettle }, { now, data }));

test("the offline reward is the sampled hunt scaled to the time away", () => {
  const state = player();
  const earned = hunted(state);
  expect(Big.sign(earned[1])).toBe(1);
  expect(offlineReward(state, data, AT + SAMPLE_MS)).toEqual({ duration: SAMPLE_MS, items: earned });
  expect(offlineReward(state, data, AT + 2.5 * SAMPLE_MS)).toEqual({ duration: 2.5 * SAMPLE_MS, items: scaled(earned, 2.5) });
});

test("the offline reward stops growing at OFFLINE_CAP", () => {
  const state = player();
  const capped = offlineReward(state, data, AT + OFFLINE_CAP);
  expect(capped.duration).toBe(OFFLINE_CAP);
  expect(offlineReward(state, data, AT + 3 * OFFLINE_CAP)).toEqual(capped);
  expect(capped.items).toEqual(scaled(hunted(state), OFFLINE_CAP / SAMPLE_MS));
});

test("the offline reward only hunts: no clear reward and no boss", () => {
  // 3001은 보스가 없어 셋째 웨이브를 잡으면 클리어한다. 다시 돌리면 클리어 보상과 다음 스테이지가 있었을 것이다.
  const state = player(3001);
  const replay = startBattle({ player: state, data });
  replay.advance(MAX_SETTLE_TICKS);
  expect(replay.snapshot().stageId).not.toBe(3001);

  expect(offlineReward(state, data, AT + SAMPLE_MS).items).toEqual(hunted(state));
  // 보스 차례인 체크포인트도 사냥만 한다.
  const boss = player(3004, 10);
  const due = { ...boss, battle: { ...boss.battle, waves: 3, mode: BattleMode.Boss } };
  expect(offlineReward(due, data, AT + SAMPLE_MS).items).toEqual(hunted(due));
});

test("the offline reward hunts at the level the hero left with", () => {
  // 1레벨 영웅은 3002에서 10분이면 여러 번 레벨이 오르지만, 표본은 떠날 때 레벨의 능력치로만 사냥한다.
  const state = player();
  const growing = startBattle({ player: { ...state, battle: { ...state.battle, autoBoss: false } }, data });
  growing.advance(MAX_SETTLE_TICKS);
  expect(growing.snapshot().hero.level).toBeGreaterThan(1);

  const fixed = startBattle({ player: { ...state, battle: { ...state.battle, autoBoss: false } }, data, levelUps: false });
  fixed.advance(MAX_SETTLE_TICKS);
  expect(fixed.snapshot().hero.level).toBe(1);
  expect(offlineReward(state, data, AT + SAMPLE_MS).items).toEqual(fixed.snapshot().items);
});

test("a migrated checkpoint (at 0) earns no offline reward", () => {
  const state = { ...player(), battle: { ...player().battle, at: 0 } };
  expect(offlineReward(state, data, AT + OFFLINE_CAP)).toEqual({ duration: 0, items: {} });
});

test("settling a long absence levels up with the reward at once and hunts at the new level", () => {
  const state = { ...player(), items: { 1: Big.from(7) } };
  const now = AT + 3 * SAMPLE_MS;
  const reward = offlineReward(state, data, now).items;
  const settled = settleAt(state, now);

  expect(settled.items[1]).toEqual(Big.add(7, reward[1]));
  expect(settled.hero.level).toBeGreaterThan(1);
  // 레벨업에 쓰고 남은 경험치는 다음 레벨의 요구량에 못 미친다.
  expect(Big.lt(settled.items[EXP], data.heroLevels.get(settled.hero.level)!.expToNext!)).toBe(true);
  expect(Big.lt(settled.items[EXP], reward[EXP])).toBe(true);
  expect(settled.battle.hero.hp).toEqual(heroStats(settled, data).maxHp);
});

test("settling pays a gap once: the checkpoint moves to now", () => {
  const now = AT + 3 * SAMPLE_MS;
  const once = settleAt(player(), now);
  expect(once.battle.at).toBe(now);
  expect(settleAt(once, now)).toBe(once);
});
