import { Big } from "@idle/big-number";
import { describe, expect, test } from "vitest";
import { formatBig, rollFrames } from "../src/presentation/format/big.js";

describe("formatBig", () => {
  test("shows values under 1000 as integers", () => {
    expect([0, 7, 999, 999.9, 0.5, -42].map(value => formatBig(value))).toEqual(["0", "7", "999", "999", "0", "-42"]);
  });

  test("names every three digits, dropping digits past the decimals", () => {
    expect([1000, 1250, 999_999, 1.2e6, 4.1e6, 34.5e9, 1e12, 999.99e12].map(value => formatBig(value)))
      .toEqual(["1K", "1.2K", "999.9K", "1.2M", "4.1M", "34.5B", "1T", "999.9T"]);
    expect(formatBig(1234, 2)).toBe("1.23K");
    expect(formatBig(1234, 0)).toBe("1K");
    expect(formatBig(-1250)).toBe("-1.2K");
  });

  test("continues with two letters from 10^15", () => {
    expect(formatBig(1.5e15)).toBe("1.5aa");
    expect(formatBig(1.2e18)).toBe("1.2ab");
    expect(formatBig({ m: 1, e: 15 + 3 * 26 })).toBe("1ba");
    expect(formatBig({ m: 3.4, e: 15 + 3 * 675 })).toBe("3.4zz");
    expect(formatBig({ m: 1.25, e: 15 + 3 * 676 })).toBe("1.2e2043");
  });

  test("shows sums the way it shows the same value made directly", () => {
    expect(formatBig(Big.add(1000, 200))).toBe("1.2K");
    expect(formatBig(Big.mul(Big.div(4.1e6, 3), 3))).toBe("4.1M");
  });
});

describe("rollFrames", () => {
  test("passes through even steps to the exact target, leaving out repeats", () => {
    expect(rollFrames(100, 110)).toEqual(["101", "102", "103", "104", "105", "106", "107", "108", "109", "110"]);
    expect(rollFrames(0, 3)).toEqual(["1", "2", "3"]);
    expect(rollFrames(1000, 2_000_000)).toEqual([
      "200.9K", "400.8K", "600.7K", "800.6K", "1M", "1.2M", "1.4M", "1.6M", "1.8M", "2M",
    ]);
  });

  test("rolls down too, and is empty when the text would not change", () => {
    expect(rollFrames(5, 2)).toEqual(["4", "3", "2"]);
    expect(rollFrames(1210, 1250)).toEqual([]);
    expect(rollFrames(7, 7)).toEqual([]);
  });
});
