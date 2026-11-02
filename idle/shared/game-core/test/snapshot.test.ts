import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { Opcode } from "@idle/codes";
import { expect, test } from "vitest";
import { freshBattle, playerBattle } from "../src/battle/settle.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { playerFingerprint } from "../src/snapshot.js";
import { startSkills } from "../src/skills.js";
import { NO_STAT_UPGRADES } from "../src/stat-upgrade.js";
import type { PlayerState } from "../src/state.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const AT = 1_000_000;

function player(): PlayerState {
  const base = {
    profile: { loginId: "hero", level: 3 },
    items: {},
    equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data),
    stage: { currentId: 3001, clearedIds: [] },
  };
  return { ...base, battle: freshBattle(base, data, AT), tutorial: { stepId: null } };
}

// 키를 거꾸로 다시 만든 깊은 사본. 저장 데이터를 풀어 만든 객체처럼 값은 같고 키 순서가 다르다.
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reversed((value as Record<string, unknown>)[key])]));
}

test("the same values give the same fingerprint whatever the key order, and undefined keys count as missing", () => {
  const state = player();
  const fingerprint = playerFingerprint(state);
  expect(Number.isSafeInteger(fingerprint)).toBe(true);
  expect(playerFingerprint(reversed(state) as PlayerState)).toBe(fingerprint);
  expect(playerFingerprint({ ...state, extra: undefined } as unknown as PlayerState)).toBe(fingerprint);
});

test("any changed value deep in the state changes the fingerprint", () => {
  // 웨이브 도중의 체크포인트(적, 효과, 발사체가 있음)에서 값 하나씩 바꾼다.
  const state = player();
  const battle = playerBattle(state, data);
  for (let tick = 300; battle.snapshot().enemies.length < 2; tick++) battle.advance(tick);
  const fighting = { ...state, ...battle.checkpoint().player };
  const fingerprint = playerFingerprint(fighting);
  const hero = fighting.battle.hero;
  const changed: PlayerState[] = [
    { ...fighting, battle: { ...fighting.battle, hero: { ...hero, x: hero.x + 1e-9 } } },
    { ...fighting, battle: { ...fighting.battle, rng: fighting.battle.rng ^ 1 } },
    { ...fighting, items: { ...fighting.items, 1: { m: 1, e: 0 } } },
    { ...fighting, tutorial: { stepId: 1 } },
    { ...fighting, battle: { ...fighting.battle, enemies: [...fighting.battle.enemies].reverse() } },
  ];
  expect(fighting.battle.enemies.length).toBeGreaterThan(1);
  for (const other of changed) expect(playerFingerprint(other)).not.toBe(fingerprint);
});

test("a command applied to the same state at the same time gives the same fingerprint", () => {
  const state = { ...player(), items: { 1: { m: 1, e: 6 } } };
  const now = AT + 31_234;
  const once = applyCommand(state, { type: Opcode.StatUpgrade, upgradeId: 7002 }, { now, data });
  const again = applyCommand(reversed(state) as PlayerState, { type: Opcode.StatUpgrade, upgradeId: 7002 }, { now, data });
  if (!once.ok || !again.ok) throw new Error("The upgrade was refused.");
  expect(playerFingerprint(again.state)).toBe(playerFingerprint(once.state));
});

test("the fingerprint of a fixed state stays fixed, so client and server agree across builds", () => {
  const fixed = { profile: { loginId: "hero", level: 3 }, items: { 1: { m: 1.5, e: 3 } }, tutorial: { stepId: null } } as unknown as PlayerState;
  expect(playerFingerprint(fixed)).toMatchInlineSnapshot(`4894465302855801`);
});
