import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { freshBattle, playerBattle, settle } from "../src/battle/settle.js";
import { initialCooldowns } from "../src/battle/simulation.js";
import { BattleMode } from "../src/battle/state.js";
import { heroStats } from "../src/battle/stats.js";
import type { Command } from "../src/command.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { startSkills } from "../src/skills.js";
import { NO_STAT_UPGRADES, statUpgradeCost } from "../src/stat-upgrade.js";
import type { PlayerState } from "../src/state.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const GOLD = data.constants.goldItemId;
const EXP = data.constants.expItemId;
const AT = 1_000_000;
// 공격(+5, 100단계), HP(+50, 100단계), 치명(+0.005, 50단계).
const ATTACK = 7001;
const HP = 7002;
const CRIT = 7003;

function player(gold: number, statUpgrades = NO_STAT_UPGRADES): PlayerState {
  const base = {
    profile: { loginId: "hero", level: 1 },
    items: { [GOLD]: Big.from(gold) },
    equipment: NO_EQUIPMENT,
    statUpgrades,
    skills: startSkills(data),
    rebirth: NO_REBIRTH,
    stage: { currentId: 3001, clearedIds: [] },
  };
  return { ...base, battle: freshBattle(base, data, AT), tutorial: { stepId: null } };
}

const upgrade = (state: PlayerState, upgradeId: unknown, now = AT + 100) =>
  applyCommand(state, { type: Opcode.StatUpgrade, upgradeId } as Command, { now, data });

function upgraded(result: ReturnType<typeof applyCommand>): PlayerState {
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

describe("statUpgradeCost", () => {
  test("is the upgradeCost formula: floor(100 × 1.15^step) with Big.pow's bits on every host", () => {
    for (let step = 0; step <= 120; step++) expect(statUpgradeCost(step)).toEqual(Big.floor(Big.mul(100, Big.pow(1.15, step))));
    expect([0, 1, 10].map(step => Big.toNumber(statUpgradeCost(step)))).toEqual([100, 115, 404]);
    // 공격의 마지막 단계(99 → 100)와 치명의 마지막 단계(49 → 50)의 비트. 호스트가 달라도 같아야 한다.
    expect(statUpgradeCost(99)).toEqual({ m: 1.02114213, e: 8 });
    expect(statUpgradeCost(49)).toEqual({ m: 9.4231, e: 4 });
  });
});

describe("StatUpgrade", () => {
  test("pays the cost from gold, raises the step, and restarts the hunt at now with the new stats", () => {
    const state = player(1000);
    const now = AT + 100;
    const settled = settle(state, data, now);
    const after = upgraded(upgrade(state, ATTACK, now));
    expect(after.statUpgrades).toEqual({ [ATTACK]: 1 });
    expect(after.items[GOLD]).toEqual(Big.from(900));
    const hero = heroStats(after, data);
    expect(hero.attack).toEqual(Big.add(heroStats(settled, data).attack, 5));
    expect(after.battle).toMatchObject({
      mode: BattleMode.Hunt, at: now, rng: settled.battle.rng, waves: settled.battle.waves,
      hero: { hp: hero.maxHp, cooldowns: initialCooldowns(hero) }, nextId: settled.battle.nextId,
    });
    // 다른 슬라이스는 그대로다.
    expect(after.equipment).toBe(state.equipment);
    expect(after.stage).toBe(state.stage);

    // 단계마다 비용이 오른다: 115, 그다음 132.
    const twice = upgraded(upgrade(upgraded(upgrade(after, ATTACK, now + 100)), HP, now + 200));
    expect(twice.statUpgrades).toEqual({ [ATTACK]: 2, [HP]: 1 });
    expect(twice.items[GOLD]).toEqual(Big.from(900 - 115 - 100));
  });

  test("gold exactly the cost is enough and leaves none; one short is refused with NotEnoughGold and changes nothing", () => {
    expect(upgraded(upgrade(player(100), CRIT)).items[GOLD]).toEqual(Big.ZERO);
    expect(upgrade(player(99), CRIT)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
    expect(upgrade(player(0), CRIT)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
    const state = player(114, { [HP]: 1 });
    expect(upgrade(state, HP)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
  });

  test("pays with the gold the settle up to now banks", () => {
    // 50골드로는 모자라지만, 30초의 사냥(3001의 클리어 포함)이 그 틱까지 번 골드를 더하면 된다.
    const state = player(50);
    const now = AT + 30_000;
    const banked = settle(state, data, now).items[GOLD];
    expect(Big.gte(banked, 100)).toBe(true);
    expect(upgrade(state, ATTACK, AT + 100)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
    expect(upgraded(upgrade(state, ATTACK, now)).items[GOLD]).toEqual(Big.from(Big.toNumber(banked) - 100));
  });

  test("an upgrade at its max step is refused with StatUpgradeMaxed whatever the gold", () => {
    const state = player(1e30, { [CRIT]: 50 });
    expect(upgrade(state, CRIT)).toMatchObject({ ok: false, error: { code: GameErrorCode.StatUpgradeMaxed } });
    // 기획이 최대 단계를 낮춰 이미 넘은 단계도 더 오르지 않는다.
    expect(upgrade(player(1e30, { [CRIT]: 60 }), CRIT)).toMatchObject({ ok: false, error: { code: GameErrorCode.StatUpgradeMaxed } });
    const last = upgraded(upgrade(player(1e30, { [CRIT]: 49 }), CRIT));
    expect(last.statUpgrades[CRIT]).toBe(50);
  });

  test("an upgrade that is not in the table is refused, whatever arrives from the network", () => {
    for (const id of [9999, 0, -1, 7001.5, "7001", "constructor", "__proto__", null, undefined]) {
      expect(upgrade(player(1000), id)).toMatchObject({ ok: false, error: { code: GameErrorCode.StatUpgradeNotFound } });
    }
  });

  test("the battle fights with the upgraded stats and keeps them across a level-up", () => {
    // HP 2단계(+100). 다음 처치의 경험치가 1레벨의 요구량(100)을 채운다.
    const state = { ...player(0, { [HP]: 2 }), items: { [EXP]: Big.from(99) } };
    const battle = playerBattle(state, data);
    expect(battle.snapshot().hero.maxHp).toEqual(Big.add(data.heroLevels.get(1)!.maxHp, 100));
    let level = 1;
    battle.advance(600, event => {
      if (event.type === "levelUp") level = event.level;
    });
    expect(level).toBeGreaterThan(1);
    expect(battle.snapshot().hero.maxHp).toEqual(Big.add(data.heroLevels.get(level)!.maxHp, 100));
    expect(battle.lastBoundary()!.player.statUpgrades).toBe(state.statUpgrades);
  });
});
