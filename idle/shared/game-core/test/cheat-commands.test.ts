import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { offlineReward } from "../src/battle/offline.js";
import { settle } from "../src/battle/settle.js";
import type { Command } from "../src/command.js";
import { applyCommand } from "../src/commands/index.js";
import { accepted, testPlayer } from "../src/testing.js";
import { HOUR, MINUTE } from "../src/time.js";
import { isUnlocked } from "../src/unlock.js";
import type { PlayerState } from "../src/state.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const OFFLINE_CAP = data.constants.offlineCapHours * HOUR;
// 체크포인트를 12시간 넘게 옮겨도 0(체크포인트 없음)에 닿지 않는 시각.
const AT = 100 * HOUR;
const NOW = AT + 30_000;

const player = () => testPlayer(data, AT);

const apply = (state: PlayerState, command: Command, now = NOW) => accepted(applyCommand(state, command, { now, data }));

function refused(command: Command): GameErrorCode | undefined {
  const result = applyCommand(player(), command, { now: NOW, data });
  return result.ok ? undefined : result.error.code;
}

test("granting settles first and adds the amount, equipment as instances", () => {
  const settled = settle(player(), data, NOW);
  const gold = apply(player(), { type: Opcode.CheatItemGrant, itemId: 1, amount: 1000 });
  expect(gold.battle).toEqual(settled.battle);
  expect(gold.items[1]).toEqual(Big.add(settled.items[1] ?? Big.ZERO, 1000));

  const sword = apply(player(), { type: Opcode.CheatItemGrant, itemId: 101, amount: 1 });
  expect(Object.values(sword.equipment.owned)).toContainEqual({ itemId: 101, enhance: 0 });
});

test("granting experience levels up at once and restarts the hunt at now", () => {
  const { expItemId } = data.constants;
  const need = data.heroLevels.get(1)!.expToNext!;
  const state = apply(player(), { type: Opcode.CheatItemGrant, itemId: expItemId, amount: Big.toNumber(need) * 3 });
  expect(state.hero.level).toBeGreaterThan(1);
  expect(Big.lt(state.items[expItemId] ?? Big.ZERO, data.heroLevels.get(state.hero.level)!.expToNext!)).toBe(true);
  expect(state.battle.at).toBe(NOW);
});

test("granting refuses unknown items and amounts that are not positive integers", () => {
  expect(refused({ type: Opcode.CheatItemGrant, itemId: 9999, amount: 1 })).toBe(GameErrorCode.InvalidCommand);
  expect(refused({ type: Opcode.CheatItemGrant, itemId: 1, amount: 0 })).toBe(GameErrorCode.InvalidCommand);
  expect(refused({ type: Opcode.CheatItemGrant, itemId: 1, amount: 1.5 })).toBe(GameErrorCode.InvalidCommand);
});

test("setting the level restarts the hunt at now with the new stats", () => {
  const state = apply(player(), { type: Opcode.CheatLevelSet, level: 10 });
  expect(state.hero.level).toBe(10);
  expect(state.battle.at).toBe(NOW);
  expect(refused({ type: Opcode.CheatLevelSet, level: data.heroLevels.size + 1 })).toBe(GameErrorCode.InvalidCommand);
});

test("unlocking a stage clears its prerequisites and raises the level to its condition", () => {
  // 3006은 3005 클리어와 레벨 15가 필요하다.
  const last = data.stages.get(3006)!;
  const state = apply(player(), { type: Opcode.CheatStageUnlock, stageId: 3006 });
  expect([...state.stage.clearedIds].sort()).toEqual([3001, 3002, 3003, 3004, 3005]);
  expect(state.hero.level).toBe(15);
  expect(isUnlocked(last, state)).toBe(true);
  expect(state.stage.currentId).toBe(settle(player(), data, NOW).stage.currentId);
  // 이미 열린 스테이지는 확정만 한다.
  expect(apply(player(), { type: Opcode.CheatStageUnlock, stageId: 3001 })).toEqual(settle(player(), data, NOW));
  expect(refused({ type: Opcode.CheatStageUnlock, stageId: 9999 })).toBe(GameErrorCode.StageNotFound);
});

test("shifting time moves the checkpoint back, so the next settle pays the gap as an offline reward", () => {
  const shifted = apply(player(), { type: Opcode.CheatTimeShift, duration: 2 * HOUR });
  const settled = settle(player(), data, NOW);
  expect(shifted.battle).toEqual({ ...settled.battle, at: settled.battle.at - 2 * HOUR });

  const reward = offlineReward(shifted, data, NOW);
  expect(reward.duration).toBe(NOW - shifted.battle.at);
  const paid = apply(shifted, { type: Opcode.BattleSettle });
  // 지급은 합을 내림한다(grant).
  expect(paid.items[1]).toEqual(Big.floor(Big.add(shifted.items[1] ?? Big.ZERO, reward.items[1])));
  expect(paid.battle.at).toBe(NOW);

  expect(refused({ type: Opcode.CheatTimeShift, duration: 0 })).toBe(GameErrorCode.InvalidCommand);
  expect(refused({ type: Opcode.CheatTimeShift, duration: OFFLINE_CAP + MINUTE })).toBe(GameErrorCode.InvalidCommand);
});
