import { Big } from "@idle/big-number";
import { describe, expect, test } from "vitest";
import { E_AbilityType } from "../src/ability-type.js";
import { Formula, type IAbilityOwner } from "../src/formulas.js";

// 생성된 formulas.ts(data/formulas.json)를 규칙이 부르는 모양 그대로 부른다.
const attacker = (attack: number): IAbilityOwner => ({
  get: type => (type === E_AbilityType.attack ? Big.from(attack) : Big.ZERO),
});
const nobody: IAbilityOwner = { get: () => Big.ZERO };

describe("generated formulas", () => {
  test("upgradeCost grows by upgradeCostGrowth a step with the same bits as Big.pow", () => {
    const cost = (step: number) => Formula.get(E_AbilityType.upgradeCost, nobody, nobody, { step });
    expect(cost(0)).toEqual(Big.from(100));
    expect(cost(10)).toEqual(Big.from(404));
    for (const step of [1, 7, 50, 100, 500, 6000]) expect(cost(step)).toEqual(Big.floor(Big.mul(100, Big.pow(1.15, step))));
    // 6000단계(약 1e366)는 double을 넘는다.
    expect(Big.toNumber(cost(6000))).toBe(Infinity);
    expect(() => cost(1.5)).toThrow("integer exponent");
  });

  test("elementMultiplier branches on the advantage", () => {
    const multiplier = (elementAdvantage: number) =>
      Big.toNumber(Formula.get(E_AbilityType.elementMultiplier, nobody, nobody, { elementAdvantage }));
    expect([1, 0, -1].map(multiplier)).toEqual([1.5, 1, 0.75]);
  });

  test("effect amounts are the caster's attack times power, floored, and grow with the skill level", () => {
    for (const type of [E_AbilityType.dotDamage, E_AbilityType.heal, E_AbilityType.shield]) {
      expect(Formula.get(type, attacker(1234), nobody, { power: 0.15000000596046448, skillLevel: 1 })).toEqual(Big.floor(Big.mul(1234, 0.15000000596046448)));
      expect(Formula.get(type, attacker(1000), nobody, { power: 0.5, skillLevel: 3 })).toEqual(Big.from(600));
    }
    expect(Big.toNumber(Formula.get(E_AbilityType.statBuff, nobody, nobody, { power: 0.30000001192092896, skillLevel: 1 }))).toBe(0.30000001192092896);
    expect(Big.toNumber(Formula.get(E_AbilityType.statBuff, nobody, nobody, { power: 0.5, skillLevel: 11 }))).toBe(1);
  });

  // 1레벨의 배율은 정확히 1이라 레벨이 생기기 전과 비트가 같다.
  test("the skill level rate is exactly 1 at level 1 and adds skillRatePerLevel a level", () => {
    const rate = (skillLevel: number) => Formula.get(E_AbilityType.skillLevelRate, nobody, nobody, { skillLevel });
    expect(rate(1)).toEqual(Big.ONE);
    expect(Big.toNumber(rate(6))).toBe(1.5);
    expect(Formula.get(E_AbilityType.skillMultiplier, nobody, nobody, { powerMultiplier: 0.800000011920929, skillLevel: 1 })).toEqual(Big.from(0.800000011920929));
  });

  test("skillLevelCost grows by skillLevelCostGrowth a level from skillLevelBaseCost", () => {
    const cost = (skillLevel: number) => Big.toNumber(Formula.get(E_AbilityType.skillLevelCost, nobody, nobody, { skillLevel }));
    expect([1, 2, 3, 9].map(cost)).toEqual([1000, 1600, 2560, 42949]);
  });

  // 공격력과 방어력이 가까우면 가수끼리 뺀 오차가 내림의 허용치보다 커서 1 작게 나왔다(24 − 22가 1).
  test("damage is attack minus defense exactly, so flooring keeps it", () => {
    const owner = (attack: number, defense: number): IAbilityOwner => ({
      get: type => Big.from(type === E_AbilityType.attack ? attack : type === E_AbilityType.defense ? defense : 0),
    });
    const damage = (attack: number, defense: number) => Big.floor(Formula.get(E_AbilityType.damage, owner(attack, 0), owner(0, defense)));
    expect(damage(24, 22)).toEqual(Big.from(2));
    expect(damage(500634, 490942)).toEqual(Big.from(9692));
    expect(damage(5, 9)).toEqual(Big.ONE);
  });

  test("a formula throws when its caller leaves out an input it reads", () => {
    expect(() => Formula.get(E_AbilityType.dotDamage, attacker(10), nobody)).toThrow("power");
  });
});
