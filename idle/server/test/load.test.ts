import { expect, test } from "vitest";
import { capacity, percentile, usage, type Sample } from "../tools/load/report.js";

function sample(cpuMs: number, activeMs: number, idleMs: number, sqliteMs: number): Sample {
  return {
    cpu: { user: cpuMs * 1000, system: 0 },
    elu: { active: activeMs, idle: idleMs },
    rss: 0,
    heapUsed: 0,
    maxRss: 0,
    sqliteMs,
    sqliteCalls: 0,
    transactionMs: 0,
    longestMs: 0,
    longestSql: "",
  };
}

test("percentiles take the nearest rank and are NaN without samples", () => {
  const sorted = Array.from({ length: 100 }, (_, index) => index + 1);
  expect(percentile(sorted, 0.5)).toBe(50);
  expect(percentile(sorted, 0.99)).toBe(99);
  expect(percentile(sorted, 1)).toBe(100);
  expect(percentile([7], 0.5)).toBe(7);
  expect(percentile([], 0.5)).toBeNaN();
});

test("usage is the share of the wall time between two samples", () => {
  const used = usage(sample(100, 50, 950, 10), sample(400, 350, 1650, 110), 1000);
  expect(used.cpu).toBeCloseTo(0.3);
  expect(used.busy).toBeCloseTo(0.3);
  expect(used.sqlite).toBeCloseTo(0.1);
});

test("capacity scales the load to a full core by whichever of the CPU and the event loop fills first", () => {
  const MiB = 1024 ** 2;
  const fit = capacity(1000, { cpu: 0.2, busy: 0.25 }, 64 * MiB, 64 * MiB + 1000 * 32 * 1024);
  expect(fit.perCore).toBe(4000);
  expect(fit.bytesPerClient).toBe(32 * 1024);
  expect(fit.perGiB).toBe(30720);
});
