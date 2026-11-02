import { describe, expect, test } from "vitest";
import { DAY, HOUR, MINUTE, elapsed, gameDay, nextDailyReset } from "../src/time.js";

// 한국(UTC+9) 시각으로 2026-10-09 09:00.
const reset = Date.UTC(2026, 9, 9, 0);

describe("daily reset", () => {
  test("a game day turns over at 09:00 Korea time", () => {
    expect(gameDay(reset) - gameDay(reset - 1)).toBe(1);
    expect(gameDay(reset + DAY - 1)).toBe(gameDay(reset));
    expect(gameDay(reset + DAY)).toBe(gameDay(reset) + 1);
    // 자정은 날이 바뀌는 시점이 아니다: 한국 시각 23:59와 00:01은 같은 게임 일자다.
    expect(gameDay(reset - 9 * HOUR + MINUTE)).toBe(gameDay(reset - 9 * HOUR - MINUTE));
  });

  test("the next reset is the first one strictly after now", () => {
    expect(nextDailyReset(reset - 1)).toBe(reset);
    expect(nextDailyReset(reset)).toBe(reset + DAY);
    expect(nextDailyReset(reset + 10 * HOUR)).toBe(reset + DAY);
  });
});

test("elapsed time is never negative and stops at the cap", () => {
  expect(elapsed(1000, 4000)).toBe(3000);
  expect(elapsed(4000, 1000)).toBe(0);
  expect(elapsed(0, 30 * HOUR, 12 * HOUR)).toBe(12 * HOUR);
});
