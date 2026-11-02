import { readFileSync } from "node:fs";
import { Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import {
  applyCommand, freshBattle, NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, playerFingerprint, type PlayerState, startSkills,
} from "@idle/game-core";
import { expect, test, vi } from "vitest";
import { confirm, predict } from "../src/domain/progress/prediction.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

// 3002와 3003으로 옮길 수 있게 둘의 선행 스테이지를 클리어해 둔다.
const base = {
  profile: { loginId: "hero", level: 1 },
  items: {},
  equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data),
  stage: { currentId: 3001, clearedIds: [3001, 3002] },
};
const save: PlayerState = { ...base, battle: freshBattle(base, data, 0), tutorial: { stepId: null } };

const select = (stageId: number) => ({ command: { type: Opcode.StageSelect, stageId } as const, now: 0 });

test("predict redoes pending commands in order on the confirmed save", () => {
  expect(predict(save, [select(3002), select(3003)], data).stage.currentId).toBe(3003);
});

test("predict skips a command the rules now refuse", () => {
  expect(predict(save, [select(9999), select(3002)], data).stage.currentId).toBe(3002);
});

test("predict hands back the confirmed save itself when nothing is pending", () => {
  expect(predict(save, [], data)).toBe(save);
});

test("confirm takes newer changes and keeps what they do not touch, without predicting", () => {
  const expected = vi.fn(() => undefined);
  const next = confirm({ player: save, revision: 2 }, { revision: 3, fingerprint: 0, changes: { stage: { currentId: 3002, clearedIds: [] } } }, expected);
  expect(next?.revision).toBe(3);
  expect(next?.player.stage.currentId).toBe(3002);
  expect(next?.player.profile).toBe(save.profile);
  expect(expected).not.toHaveBeenCalled();
});

test("confirm ignores an answer at or below the confirmed revision", () => {
  const confirmed = { player: save, revision: 3 };
  expect(confirm(confirmed, { revision: 3, fingerprint: 0 }, () => undefined)).toBe(confirmed);
});

test("confirm takes the expected state when its fingerprint is the server's, and gives up when it is not or the rules refuse", () => {
  const result = applyCommand(save, select(3002).command, { now: 0, data });
  if (!result.ok) throw new Error(result.error.message);
  const confirmed = { player: save, revision: 2 };
  const sync = { revision: 3, fingerprint: playerFingerprint(result.state) };
  expect(confirm(confirmed, sync, () => result.state)).toEqual({ player: result.state, revision: 3 });
  expect(confirm(confirmed, { ...sync, fingerprint: sync.fingerprint + 1 }, () => result.state)).toBeUndefined();
  expect(confirm(confirmed, sync, () => undefined)).toBeUndefined();
});
