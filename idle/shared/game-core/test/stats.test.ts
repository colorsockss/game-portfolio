import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { loadGameData, Stat } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { toTicks } from "../src/battle/constants.js";
import { abilityOwner, applyModifiers, heroStats, monsterStats, type CombatStats } from "../src/battle/stats.js";
import { E_AbilityType } from "../src/ability-type.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { NO_STAT_UPGRADES } from "../src/stat-upgrade.js";
import { startSkills } from "../src/skills.js";
import { Formula } from "../src/formulas.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));

const playerAt = (level: number) => ({ profile: { loginId: "hero", level }, equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data) });
const slime = data.monsters.get(2001)!;

describe("toTicks", () => {
  test("converts seconds to 0.1 s ticks, at least one", () => {
    expect(toTicks(1)).toBe(10);
    expect(toTicks(1.5)).toBe(15);
    expect(toTicks(0.04)).toBe(1);
    expect(toTicks(0)).toBe(1);
  });
});

describe("heroStats", () => {
  test("level 1 comes from the Heroes row and the first HeroLevels row", () => {
    const stats = heroStats(playerAt(1), data);
    expect(stats.maxHp).toEqual(Big.from(200));
    expect(stats.attack).toEqual(Big.from(20));
    expect(stats.defense).toEqual(Big.from(5));
    expect(stats.attackInterval).toBe(10);
    expect(stats.critChance).toBe(0.15);
    expect(stats.critMultiplier).toBe(2);
    // 새 계정은 기본 공격과 장착할 수 있는 스킬의 앞 세 개(슬롯 수)를 쓴다.
    expect(stats.skills.map(s => s.id)).toEqual([1001, 1004, 1005, 1011]);
    expect(stats.skillLevels).toEqual({ 1004: 1, 1005: 1, 1011: 1 });
  });

  test("skills are the basic attack, then the equipped ones in slot order with their levels", () => {
    const skills = { equipped: { 2: 1004, 0: 1010 }, levels: { 1010: 4, 1006: 2 } };
    const stats = heroStats({ ...playerAt(1), skills }, data);
    expect(stats.skills.map(s => s.id)).toEqual([1001, 1010, 1004]);
    expect(stats.skillLevels).toBe(skills.levels);
  });

  test("skills the hero can no longer equip and slots past Heroes.skillSlots are left out", () => {
    // 1002는 몬스터의 스킬, 1001은 기본 공격, 슬롯 3은 슬롯 수(3)를 넘는다.
    const skills = { equipped: { 0: 1002, 1: 1001, 2: 1005, 3: 1004 }, levels: {} };
    expect(heroStats({ ...playerAt(1), skills }, data).skills.map(s => s.id)).toEqual([1001, 1005]);
  });

  test("level 10 attack matches the HeroLevels row", () => {
    expect(heroStats(playerAt(10), data).attack).toEqual(data.heroLevels.get(10)!.attack);
  });

  test("an unknown level throws with the level in the message", () => {
    expect(() => heroStats(playerAt(9999), data)).toThrow(/9999/);
  });

  test("worn equipment adds its stat columns, and only worn equipment does", () => {
    // 낡은 검(공격 +5), 가죽 갑옷(방어 +3, HP +30), 구리 반지(공격 +2, HP +20)를 가지고 앞의 둘만 입었다.
    const owned = { 1: { itemId: 101, enhance: 0 }, 2: { itemId: 102, enhance: 0 }, 3: { itemId: 103, enhance: 0 } };
    const stats = heroStats({ ...playerAt(1), equipment: { nextId: 4, owned, equipped: { 1: 1, 2: 2 } } }, data);
    expect([stats.attack, stats.defense, stats.maxHp]).toEqual([Big.from(25), Big.from(8), Big.from(230)]);
    const all = heroStats({ ...playerAt(1), equipment: { nextId: 4, owned, equipped: { 1: 1, 2: 2, 3: 3 } } }, data);
    expect([all.attack, all.defense, all.maxHp]).toEqual([Big.from(27), Big.from(8), Big.from(250)]);
    expect(heroStats({ ...playerAt(1), equipment: { nextId: 4, owned, equipped: {} } }, data)).toEqual(heroStats(playerAt(1), data));
  });

  test("stat upgrades add amount × step after worn equipment, crit chance as a probability, and drop rows no longer in the data", () => {
    // 낡은 검(공격 +5)을 입고 공격 3단계(+15), HP 2단계(+100), 치명 4단계(+0.02)다. 9999는 데이터에 없다.
    const stats = heroStats({
      ...playerAt(1),
      equipment: { nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: { 1: 1 } },
      statUpgrades: { 7001: 3, 7002: 2, 7003: 4, 9999: 5 },
    }, data);
    expect([stats.attack, stats.defense, stats.maxHp]).toEqual([Big.from(40), Big.from(5), Big.from(300)]);
    expect(stats.critChance).toBeCloseTo(0.17, 12);
    expect(heroStats({ ...playerAt(1), statUpgrades: { 7001: 0 } }, data)).toEqual(heroStats(playerAt(1), data));
  });

  test("wearing equipment that is not owned throws", () => {
    expect(() => heroStats({ ...playerAt(1), equipment: { nextId: 1, owned: {}, equipped: { 1: 7 } } }, data))
      .toThrow("Equipment 7 is not owned.");
  });
});

describe("monsterStats", () => {
  test("green slime", () => {
    const stats = monsterStats(slime, data);
    expect(stats.maxHp).toEqual(Big.from(60));
    expect(stats.attackInterval).toBe(15);
    expect(stats.critChance).toBe(0);
    expect(stats.critMultiplier).toBe(1);
    expect(stats.skills.map(s => s.id)).toEqual([1001]);
    expect([stats.moveSpeed, stats.element]).toEqual([slime.moveSpeed, slime.element]);
  });
});

describe("applyModifiers", () => {
  const base = heroStats(playerAt(1), data);

  test("adds first, then sums the percents in order: floor((20 + 5) * 1.3)", () => {
    const stats = applyModifiers(base, [
      { stat: Stat.Attack, add: Big.from(5) },
      { stat: Stat.Attack, percent: 0.1 },
      { stat: Stat.Attack, percent: 0.2 },
    ]);
    expect(stats.attack).toEqual(Big.from(32));
    expect(stats.maxHp).toEqual(base.maxHp);
    expect(stats.defense).toEqual(base.defense);
  });

  test("no modifiers keeps the same values", () => {
    expect(applyModifiers(base, [])).toEqual(base);
  });

  test("scales the attack interval in ticks, rounded and at least one tick", () => {
    expect(applyModifiers(base, [{ stat: Stat.AttackInterval, percent: 0.5 }]).attackInterval).toBe(base.attackInterval * 1.5);
    expect(applyModifiers(base, [{ stat: Stat.AttackInterval, percent: -0.99 }]).attackInterval).toBe(1);
  });

  test("crit chance adds first, then scales by the percents, without flooring", () => {
    const stats = applyModifiers(base, [{ stat: Stat.CritChance, add: Big.from(0.05) }, { stat: Stat.CritChance, percent: 0.5 }]);
    expect(stats.critChance).toBeCloseTo((0.15 + 0.05) * 1.5, 12);
    expect(applyModifiers(base, [{ stat: Stat.CritChance, percent: -2 }]).critChance).toBe(0);
  });

  test("move speed scales by the percents without flooring, so a slow halves it and nothing makes it negative", () => {
    expect(base.moveSpeed).toBe(data.heroes.get(1)!.moveSpeed);
    expect(applyModifiers(base, [{ stat: Stat.MoveSpeed, percent: -0.5 }]).moveSpeed).toBe(base.moveSpeed * 0.5);
    expect(applyModifiers(base, [{ stat: Stat.MoveSpeed, percent: -2 }]).moveSpeed).toBe(0);
  });

  test("a percent below -100% floors the stat at zero", () => {
    expect(applyModifiers(base, [{ stat: Stat.Defense, add: Big.from(1) }, { stat: Stat.Defense, percent: -2 }]).defense).toEqual(Big.ZERO);
  });
});

describe("abilityOwner", () => {
  const stats: CombatStats = heroStats(playerAt(1), data);

  test("exposes attack and defense, and rejects other types", () => {
    const owner = abilityOwner(stats);
    expect(owner.get(E_AbilityType.attack)).toBe(stats.attack);
    expect(owner.get(E_AbilityType.defense)).toBe(stats.defense);
    expect(() => owner.get(E_AbilityType.damage)).toThrow();
  });

  test("the damage formula reads hero attack against slime defense", () => {
    const damage = Formula.get(E_AbilityType.damage, abilityOwner(stats), abilityOwner(monsterStats(slime, data)));
    expect(damage).toEqual(Big.from(20));
  });
});
