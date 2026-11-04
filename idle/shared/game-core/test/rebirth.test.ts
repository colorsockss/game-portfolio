import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { playerBattle, settle } from "../src/battle/settle.js";
import { initialCooldowns } from "../src/battle/simulation.js";
import { BattleMode, HERO_ID } from "../src/battle/state.js";
import { heroStats } from "../src/battle/stats.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_REBIRTH, rebirthPoints, rebirthRate, type RebirthState } from "../src/rebirth.js";
import { startSkills } from "../src/skills.js";
import type { PlayerState } from "../src/state.js";
import { accepted, testPlayer } from "../src/testing.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const GOLD = data.constants.goldItemId;
const EXP = data.constants.expItemId;
const AT = 1_000_000;
const SWORD = { itemId: 104, enhance: 7 };

// 마지막 스테이지까지 클리어하고 오우거 대검 +7을 입고 골드 강화와 스킬 레벨을 올린 영웅. 튜토리얼은 마쳤다.
function player(level: number, rebirth: RebirthState = NO_REBIRTH, stageId = 3006): PlayerState {
  const state = testPlayer(data, AT, {
    hero: { level },
    items: { [GOLD]: Big.from(5000), [EXP]: Big.from(1234) },
    equipment: { nextId: 2, owned: { 1: SWORD }, equipped: { 1: 1 } },
    statUpgrades: { 7001: 40, 7002: 40, 7003: 20 },
    skills: { ...startSkills(data), levels: { 1004: 5, 1005: 3, 1011: 1 } },
    rebirth,
    stage: { currentId: stageId, clearedIds: [3001, 3002, 3003, 3004, 3005] },
  });
  return { ...state, battle: { ...state.battle, waves: 2, nextId: 40 } };
}

const rebirth = (state: PlayerState, now = AT) => applyCommand(state, { type: Opcode.Rebirth }, { now, data });

describe("rebirth formulas", () => {
  test("points are (level − 30 + 1)² from level 30 and none below", () => {
    expect([1, 29, 30, 31, 40, 47, 50].map(rebirthPoints)).toEqual([0, 0, 1, 4, 121, 324, 441]);
  });

  test("the bonus is 1 + 0.001 per point, exactly 1 with no points so a hero who never reborn plays as before", () => {
    expect(rebirthRate(NO_REBIRTH)).toEqual(Big.ONE);
    expect(Big.toNumber(rebirthRate({ count: 1, points: 441 }))).toBe(1.441);
    expect(Big.toNumber(rebirthRate({ count: 3, points: 1000 }))).toBe(2);
  });
});

describe("Rebirth", () => {
  test("starts the level, stages, gold upgrades, gold and EXP over, keeps skills, gear and the tutorial, and adds the points", () => {
    const state = player(47, { count: 1, points: 441 });
    const after = accepted(rebirth(state));
    expect(after.hero).toEqual({ level: 1 });
    expect(after.stage).toEqual({ currentId: 3001, clearedIds: [] });
    expect(after.statUpgrades).toEqual({});
    expect(after.items).toEqual({});
    expect(after.rebirth).toEqual({ count: 2, points: 441 + 324 });
    expect(after.equipment).toBe(state.equipment);
    expect(after.skills).toBe(state.skills);
    expect(after.tutorial).toBe(state.tutorial);
    // 시작 스테이지의 새 사냥: 웨이브와 전투원 id는 처음부터, 난수 상태는 이어 받는다. 영웅은 새 능력치의 최대 HP다.
    const hero = heroStats(after, data);
    expect(after.battle).toEqual({
      mode: BattleMode.Hunt, at: AT, rng: state.battle.rng, hero: { hp: hero.maxHp, cooldowns: initialCooldowns(hero), effects: [], x: 0 },
      summons: [], waves: 0, autoBoss: true, nextId: HERO_ID + 1,
      enemies: [], projectiles: [], wave: null, bossTicksLeft: null, reviveTicksLeft: null,
    });
  });

  test("other items stay; only gold and EXP start over", () => {
    const state = { ...player(40), items: { [GOLD]: Big.from(10), [EXP]: Big.from(20), 999: Big.from(3) } };
    expect(accepted(rebirth(state)).items).toEqual({ 999: Big.from(3) });
  });

  test("refuses below the rebirth level", () => {
    const state = player(29);
    const refused = rebirth(state, AT + 60_000);
    expect(refused).toMatchObject({ ok: false, error: { code: GameErrorCode.RebirthNotReady } });
  });

  test("counts the level a settle reaches at the last boundary, not the level in the save", () => {
    // 29레벨에서 다음 레벨까지의 경험치를 이미 가졌으므로 첫 경계(첫 웨이브 클리어)에서 30레벨이 된다.
    const state = { ...player(29, NO_REBIRTH, 3001), items: { [EXP]: data.heroLevels.get(29)!.expToNext! } };
    expect(rebirth(state, AT)).toMatchObject({ ok: false, error: { code: GameErrorCode.RebirthNotReady } });
    const now = AT + 60_000;
    expect(settle(state, data, now).hero.level).toBe(30);
    expect(accepted(rebirth(state, now)).rebirth).toEqual({ count: 1, points: 1 });
  });

  test("a second rebirth needs the level again and adds its own points", () => {
    const once = accepted(rebirth(player(50)));
    expect(rebirth(once, AT + 1000)).toMatchObject({ ok: false, error: { code: GameErrorCode.RebirthNotReady } });
    const again = accepted(rebirth({ ...once, hero: { ...once.hero, level: 40 } }, AT + 1000));
    expect(again.rebirth).toEqual({ count: 2, points: 441 + 121 });
  });
});

describe("rebirth bonus", () => {
  test("multiplies the hero's attack, defense and max HP after gear and upgrades, but not crit or attack speed", () => {
    const plain = heroStats(player(40), data);
    const bonus = heroStats(player(40, { count: 1, points: 441 }), data);
    for (const stat of ["attack", "defense", "maxHp"] as const) expect(bonus[stat]).toEqual(Big.floor(Big.mul(plain[stat], 1.441)));
    expect(bonus.critChance).toBe(plain.critChance);
    expect(bonus.attackInterval).toBe(plain.attackInterval);
  });

  test("multiplies the gold of each kill and clear, flooring each time, but not EXP", () => {
    // 3001의 초록 슬라임은 처치마다 골드 5, 경험치 10이다. 첫 경계는 두 마리 웨이브의 클리어다.
    const firstBoundary = (rebirth: RebirthState) => {
      const start = { ...player(1, rebirth, 3001), items: {}, equipment: { nextId: 1, owned: {}, equipped: {} }, statUpgrades: {} };
      const battle = playerBattle({ ...start, battle: { ...start.battle, waves: 0 } }, data);
      while (battle.lastBoundary() === undefined) battle.advance(battle.tick + 1);
      return battle.lastBoundary()!.player.items;
    };
    expect(firstBoundary(NO_REBIRTH)).toEqual({ [GOLD]: Big.from(10), [EXP]: Big.from(20) });
    // 5 × 1.441 = 7.205가 처치마다 내림되어 7씩 쌓인다.
    expect(firstBoundary({ count: 1, points: 441 })).toEqual({ [GOLD]: Big.from(14), [EXP]: Big.from(20) });
  });

  test("the bonus is part of the battle's path, so the same checkpoint with other points diverges", () => {
    const signature = (rebirth: RebirthState) => playerBattle(player(40, rebirth), data).pathSignature();
    expect(signature({ count: 1, points: 441 })).not.toBe(signature(NO_REBIRTH));
    // 횟수는 길을 바꾸지 않는다.
    expect(signature({ count: 2, points: 441 })).toBe(signature({ count: 1, points: 441 }));
  });
});
