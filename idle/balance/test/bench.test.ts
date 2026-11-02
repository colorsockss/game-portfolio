import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { bench, midGame } from "../src/bench.js";

const data = await loadGameData(table => readFileSync(new URL(`../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

test("the bench state is a level 30 hero hunting stage 3005", () => {
  const state = midGame(data);
  expect(state.profile.level).toBe(30);
  expect(state.stage.currentId).toBe(3005);
});

test("the bench times every case with a median no larger than its p95", () => {
  const rows = bench(data, 3);
  expect(rows.map(row => row.name)).toEqual([
    "settle 60 s", "settle 10 min (cap)", "offline reward 12 h", "online 1 h (settle every 60 s)",
  ]);
  for (const row of rows) {
    expect(row.median).toBeGreaterThanOrEqual(0);
    expect(row.median).toBeLessThanOrEqual(row.p95);
  }
});
