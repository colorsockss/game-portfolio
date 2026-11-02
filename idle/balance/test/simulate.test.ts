import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { loadGameData } from "@idle/data-schema";
import { HOUR, SECOND } from "@idle/game-core";
import { expect, test } from "vitest";
import { toCsv } from "../src/report.js";
import { simulate, type SimulationOptions } from "../src/simulate.js";

const data = await loadGameData(table => readFileSync(new URL(`../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const options: SimulationOptions = { hours: 6, seed: 1, online: Infinity, offline: 0, step: 60 * SECOND, rebirthLevel: 0 };

test("the same seed gives the same curve and another seed another", () => {
  const curve = simulate(data, options);
  expect(simulate(data, options)).toEqual(curve);
  expect(toCsv(simulate(data, { ...options, seed: 2 }), data)).not.toBe(toCsv(curve, data));
});

test("samples every hour while the hero levels, clears stages, wears the gear it earns and levels the skills it equips", () => {
  const curve = simulate(data, options);
  expect(curve.map(sample => sample.hour)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(curve[0]).toMatchObject({ level: 1, stageId: 3001, equipped: [], skillLevels: [1, 1, 1] });
  expect(curve[1].skillLevels.every(level => level > 1)).toBe(true);
  expect(curve[6].level).toBeGreaterThan(curve[1].level);
  expect(curve[6].stageId).toBeGreaterThan(3001);
  expect(curve[6].equipped).toHaveLength(3);
  expect(curve[6].power).toBeGreaterThan(curve[0].power);
});

test("spends the gold on the cheapest next step, so the upgrades rise together", () => {
  const curve = simulate(data, options);
  expect(curve[0].upgrades).toEqual([0, 0, 0]);
  const total = (upgrades: readonly number[]) => upgrades.reduce((sum, step) => sum + step, 0);
  expect(total(curve[6].upgrades)).toBeGreaterThan(total(curve[1].upgrades));
  // 비용 공식이 같아 단계가 많아야 하나 차이 난다.
  expect(Math.max(...curve[6].upgrades) - Math.min(...curve[6].upgrades)).toBeLessThanOrEqual(1);
  // 남은 골드는 다음 단계보다 적다(정각의 정산 뒤 다 썼다).
  const next = Math.min(...curve[6].upgrades);
  expect(Big.lt(curve[6].items[data.constants.goldItemId], Big.floor(Big.mul(100, Big.pow(1.15, next))))).toBe(true);
});

test("an offline gap keeps the state left behind until the return settles its offline reward", () => {
  const curve = simulate(data, { ...options, online: HOUR, offline: 2 * HOUR });
  expect(curve.map(sample => sample.online)).toEqual([true, true, false, true, true, false, true]);
  expect(curve[2]).toEqual({ ...curve[1], hour: 2, online: false });
  // 오프라인 보상의 골드는 돌아오자마자 강화에 쓴다.
  expect(curve[3].upgrades.some((step, i) => step > curve[2].upgrades[i])).toBe(true);
});

test("rebirths on reaching the rebirth level, starting the level and upgrades over and keeping the points", () => {
  const curve = simulate(data, { ...options, rebirthLevel: 35 });
  // 첫 런은 35레벨에 한 시간 남짓 걸린다. 환생하면 1레벨부터 다시 오르고 포인트((35 − 30 + 1)² = 36)가 쌓인다.
  expect(curve[1].rebirth).toEqual({ count: 0, points: 0 });
  const last = curve[6].rebirth;
  expect(last.count).toBeGreaterThan(1);
  expect(last.points).toBe(36 * last.count);
  expect(curve[6].level).toBeLessThan(35);
  expect(curve.every(sample => sample.level < 35 || sample.rebirth.count === 0)).toBe(true);
  // 환생하지 않는 정책의 곡선은 환생이 없다.
  expect(simulate(data, options).every(sample => sample.rebirth.count === 0)).toBe(true);
});
