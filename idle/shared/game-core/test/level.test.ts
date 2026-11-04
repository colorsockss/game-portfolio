import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { levelUp } from "../src/level.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const EXP = data.constants.expItemId;
const hero = { level: 1 };

test("experience pays for as many levels as it reaches and the rest is kept", () => {
  // 1레벨 요구량 100, 2레벨 120.
  const items = { 1: Big.from(7), [EXP]: Big.from(230) };
  expect(levelUp(hero, items, data)).toEqual({
    hero: { level: 3 },
    items: { 1: Big.from(7), [EXP]: Big.from(10) },
  });
  expect(items[EXP]).toEqual(Big.from(230));
});

test("experience short of the requirement returns the same objects", () => {
  const items = { [EXP]: Big.from(99) };
  const result = levelUp(hero, items, data);
  expect(result.hero).toBe(hero);
  expect(result.items).toBe(items);
  expect(levelUp(hero, {}, data).hero).toBe(hero);
});

test("the level without a requirement is the last and keeps its experience", () => {
  expect(data.heroLevels.get(50)!.expToNext).toBeNull();
  const max = { level: 50 };
  const items = { [EXP]: Big.parse("1e30") };
  expect(levelUp(max, items, data)).toEqual({ hero: max, items });
  expect(levelUp({ ...max, level: 49 }, items, data).hero.level).toBe(50);
});

test("a level missing from HeroLevels throws", () => {
  expect(() => levelUp({ level: 999 }, {}, data)).toThrow("Unknown hero level 999.");
});

// 변환은 레벨이 이어지는지 보지 않는다. 빠진 레벨이 있으면 그 앞에서 레벨업이 던진다.
test("the shipped HeroLevels run from 1 without a gap, and only the last level has no requirement", () => {
  const levels = [...data.heroLevels.keys()].sort((a, b) => a - b);
  expect(levels).toEqual(levels.map((_, i) => i + 1));
  expect(levels.filter(level => data.heroLevels.get(level)!.expToNext === null)).toEqual([levels.length]);
});
