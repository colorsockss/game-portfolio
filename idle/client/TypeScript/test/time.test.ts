import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { expect, test } from "vitest";
import { formatTimer } from "../src/presentation/format/time.js";
import { createServerClock } from "../src/adapters/net/server-clock.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

test("the server clock puts the server's time in the middle of the round trip", () => {
  let local = 5_000;
  const clock = createServerClock(() => local);
  expect(clock.now()).toBe(5_000);

  // 1000에 보내 1100에 받았다. 서버는 그 사이 어느 때 1_000_050을 찍었다.
  local = 1100;
  clock.observe(1_000_050, 1000);
  expect(clock.now()).toBe(1_000_100);
  local += 250;
  expect(clock.now()).toBe(1_000_350);
});

test("the server clock narrows with faster answers and starts over when a clock jumps", () => {
  let local = 1100;
  const clock = createServerClock(() => local);
  clock.observe(1_000_050, 1000);

  // 왕복 20ms인 답이 차이를 [999_000, 999_020]로 좁힌다.
  local = 2020;
  clock.observe(1_001_020, 2000);
  expect(clock.now()).toBe(1_001_030);
  // 느린 답은 이미 아는 구간을 넓히지 않는다.
  local = 3200;
  clock.observe(1_002_110, 3000);
  expect(clock.now()).toBe(1_002_210);
  // 기기 시계가 한 시간 뒤로 갔다: 아는 구간과 겹치지 않는 답에서 다시 시작한다.
  local = 10_020;
  clock.observe(4_609_020, 10_000);
  expect(clock.now()).toBe(4_609_030);
});

test("timers widen with the time left, round seconds up and put the day unit of the language", () => {
  const second = 1000;
  const { t, language } = texts(data);
  expect([0, -5 * second, 1, 59 * second, 299_001].map(ms => formatTimer(ms, t))).toEqual(["00:00", "00:00", "00:01", "00:59", "05:00"]);
  expect(formatTimer(3600 * second - 1, t)).toBe("01:00:00");
  expect(formatTimer((23 * 3600 + 59 * 60 + 59) * second, t)).toBe("23:59:59");
  expect(formatTimer((86_400 + 3 * 60) * second, t)).toBe("1일 00:03:00");
  expect(formatTimer((3 * 86_400 + 4 * 3600 + 5 * 60 + 6) * second, t)).toBe("3일 04:05:06");
  language.value = "en";
  expect(formatTimer((3 * 86_400 + 4 * 3600 + 5 * 60 + 6) * second, t)).toBe("3d 04:05:06");
});
