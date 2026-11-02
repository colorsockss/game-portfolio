import { readFileSync } from "node:fs";
import { GameErrorCode, Opcode } from "@idle/codes";
import { EquipSlot, loadGameData, type GameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { freshBattle, settle } from "../src/battle/settle.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { NO_STAT_UPGRADES } from "../src/stat-upgrade.js";
import { startSkills } from "../src/skills.js";
import type { PlayerState } from "../src/state.js";
import { MINUTE, SECOND } from "../src/time.js";
import { startTutorial, tutorialStep, waitsForTap } from "../src/tutorial.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const AT = 1_000_000;

// 데이터에 기대지 않도록 스텝을 직접 둔다: 누름, 3001 클리어, 레벨 5, 무기 착용, 누름. 3은 비워 둔다.
const steps = new Map([
  [1, step(1, {})],
  [2, step(2, { unlockStageId: 3001 })],
  [4, step(4, { unlockLevel: 5 })],
  [5, step(5, { equipSlot: EquipSlot.Weapon })],
  [9, step(9, {})],
]);
const tutorial: GameData = { ...data, tutorialSteps: steps };

function step(id: number, condition: Partial<Record<"unlockStageId" | "unlockLevel" | "equipSlot", number>>) {
  return { id, textKey: "tutorial.welcome" as const, target: null, opener: null, unlockStageId: null, unlockLevel: null, equipSlot: null, ...condition };
}

function player(stepId: number | null, changes: Partial<PlayerState> = {}): PlayerState {
  const base = { profile: { loginId: "hero", level: 1 }, items: {}, equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data), stage: { currentId: 3001, clearedIds: [] } };
  return { ...base, battle: freshBattle(base, data, AT), tutorial: { stepId }, ...changes };
}

function advance(state: PlayerState, stepId: unknown, now = AT) {
  return applyCommand(state, { type: Opcode.TutorialAdvance, stepId: stepId as number }, { now, data: tutorial });
}

const notCurrent = { ok: false, error: { code: GameErrorCode.TutorialStepNotCurrent } };
const unmet = { ok: false, error: { code: GameErrorCode.TutorialStepUnmet } };

test("a new account starts at the smallest step id, and a table without steps starts finished", () => {
  expect(startTutorial(tutorial)).toEqual({ stepId: 1 });
  expect(startTutorial({ ...data, tutorialSteps: new Map() })).toEqual({ stepId: null });
  // 배포 데이터도 첫 스텝부터 누름으로 시작한다.
  const first = tutorialStep({ tutorial: startTutorial(data) }, data);
  expect(first?.id).toBe(1);
  expect(waitsForTap(first!)).toBe(true);
});

test("the current step is the first one at or after the saved id, so a deleted step does not strand the account", () => {
  expect(tutorialStep({ tutorial: { stepId: 3 } }, tutorial)?.id).toBe(4);
  expect(tutorialStep({ tutorial: { stepId: 10 } }, tutorial)).toBeUndefined();
  expect(tutorialStep({ tutorial: { stepId: null } }, tutorial)).toBeUndefined();
});

test("a tap step advances to the next step id, skipping gaps", () => {
  const result = advance(player(1), 1);
  expect(result).toMatchObject({ ok: true, state: { tutorial: { stepId: 2 } } });
  expect(waitsForTap(steps.get(1)!)).toBe(true);
  expect(waitsForTap(steps.get(2)!)).toBe(false);
});

test("only the current step advances: skipping ahead, sending a finished step again and garbage are refused", () => {
  expect(advance(player(1), 2)).toMatchObject(notCurrent);
  expect(advance(player(2), 1)).toMatchObject(notCurrent);
  for (const garbage of ["1", null, undefined, 1.5, {}]) expect(advance(player(1), garbage)).toMatchObject(notCurrent);
  // 같은 스텝을 두 번 보내면(다른 요청 id) 두 번째는 거절된다.
  const once = advance(player(1), 1);
  if (!once.ok) throw new Error("the first advance should pass");
  expect(advance(once.state, 1)).toMatchObject(notCurrent);
});

test("a stage step waits for the clear, seen through the settle at now", () => {
  const fresh = player(2);
  expect(advance(fresh, 2, AT + SECOND)).toMatchObject(unmet);
  // 체크포인트는 클리어 전이지만 now까지 정산하면 3001을 클리어했다.
  const later = AT + 2 * MINUTE;
  expect(fresh.stage.clearedIds).toEqual([]);
  expect(settle(fresh, data, later).stage.clearedIds).toContain(3001);
  expect(advance(fresh, 2, later)).toMatchObject({ ok: true, state: { tutorial: { stepId: 4 } } });
});

test("a level step and an equipment step wait for their condition", () => {
  expect(advance(player(4), 4)).toMatchObject(unmet);
  expect(advance(player(4, { profile: { loginId: "hero", level: 5 } }), 4)).toMatchObject({ ok: true, state: { tutorial: { stepId: 5 } } });

  expect(advance(player(5), 5)).toMatchObject(unmet);
  const armored = { nextId: 2, owned: { 1: { itemId: 102, enhance: 0 } }, equipped: { [EquipSlot.Armor]: 1 } };
  expect(advance(player(5, { equipment: armored }), 5)).toMatchObject(unmet);
  const armed = { nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: { [EquipSlot.Weapon]: 1 } };
  expect(advance(player(5, { equipment: armed }), 5)).toMatchObject({ ok: true, state: { tutorial: { stepId: 9 } } });
});

describe("the last step", () => {
  test("finishes the tutorial, after which nothing advances", () => {
    const done = advance(player(9), 9);
    expect(done).toMatchObject({ ok: true, state: { tutorial: { stepId: null } } });
    if (!done.ok) return;
    expect(tutorialStep(done.state, tutorial)).toBeUndefined();
    expect(advance(done.state, 9)).toMatchObject(notCurrent);
  });
});
