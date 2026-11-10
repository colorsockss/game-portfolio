import { describe, expect, test } from "vitest";
import { Big } from "../src/index.js";

describe("from", () => {
  test("keeps the mantissa in [1, 10)", () => {
    expect(Big.from(1234)).toEqual({ m: 1.234, e: 3 });
    expect(Big.from(-0.05)).toEqual({ m: -5, e: -2 });
    expect(Big.from(7)).toEqual({ m: 7, e: 0 });
    expect(Big.from(0)).toBe(Big.ZERO);
    expect(Big.from(-0)).toBe(Big.ZERO);
  });

  test("keeps the mantissa in [1, 10) when scaling a fraction up rounds it to 10", () => {
    // 0.09999999999999999 × 100은 반올림되어 정확히 10이 된다.
    expect(Big.from(0.09999999999999999)).toEqual({ m: 1, e: -1 });
    expect(Big.from(-1e-11)).toEqual({ m: -1, e: -11 });
  });

  test("covers the whole range of doubles", () => {
    expect(Big.from(Number.MAX_VALUE).e).toBe(308);
    expect(Big.from(Number.MIN_VALUE).e).toBe(-324);
    for (const value of [1e22, 9.999999999999999e22, 1e-22, 123456789.123, 1e300]) {
      const { m, e } = Big.from(value);
      expect(Math.abs(m)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(m)).toBeLessThan(10);
      expect(Big.toNumber({ m, e }) / value).toBeCloseTo(1, 14);
    }
  });

  test("converts int64 table values", () => {
    expect(Big.from(1500n)).toEqual({ m: 1.5, e: 3 });
    expect(Big.from(9223372036854775807n).e).toBe(18);
  });

  test("refuses NaN and infinities", () => {
    for (const value of [NaN, Infinity, -Infinity]) expect(() => Big.from(value)).toThrow(RangeError);
  });

  test("returns a Big as it is", () => {
    const value = Big.from(5);
    expect(Big.from(value)).toBe(value);
  });
});

describe("parse", () => {
  test("reads decimal text, including exponents beyond double", () => {
    expect(Big.parse("1.5e40")).toEqual({ m: 1.5, e: 40 });
    expect(Big.parse("-12")).toEqual({ m: -1.2, e: 1 });
    expect(Big.parse("3.25e+400")).toEqual({ m: 3.25, e: 400 });
    expect(Big.parse("12.5e-3")).toEqual({ m: 1.25, e: -2 });
    expect(Big.parse("0")).toBe(Big.ZERO);
    expect(Big.parse(".5")).toEqual({ m: 5, e: -1 });
  });

  test("agrees with from on the text of a number", () => {
    for (const x of [1234, 0.05, 123456789.123]) expect(Big.parse(String(x))).toEqual(Big.from(x));
  });

  test("keeps the exact decimal where from rounds a huge double down the 10^22 steps", () => {
    // from(1e300)는 1e22로 여러 번 나누며 가수가 1.0000000000000004가 되지만, 십진 문자열은 가수와 지수를
    // 따로 읽으므로 정확하다.
    expect(Big.parse("1e300")).toEqual({ m: 1, e: 300 });
    expect(Big.parse(String(1e300))).toEqual({ m: 1, e: 300 });
  });

  test("gives the same Big to every spelling of a decimal value", () => {
    // 0.0000007e46 = 7e-7 x 10^46.
    for (const text of ["0.07e41", "7e39", "70e38", "0.0000007e46", "7.0e39", "+7E+39"]) expect(Big.parse(text)).toEqual({ m: 7, e: 39 });
    expect(Big.parse("-0.5")).toEqual({ m: -5, e: -1 });
    expect(Big.parse("000123")).toEqual({ m: 1.23, e: 2 });
    expect(Big.parse("0.000")).toBe(Big.ZERO);
    expect(Big.parse("-0e5")).toBe(Big.ZERO);
  });

  test("keeps the mantissa in [1, 10) when rounding carries into the next power of ten", () => {
    const { m } = Big.parse("9.99999999999999999999");
    expect(Math.abs(m)).toBeGreaterThanOrEqual(1);
    expect(Math.abs(m)).toBeLessThan(10);
    expect(Big.parse("9.99999999999999999999")).toEqual({ m: 1, e: 1 });
    expect(Big.parse("-9.99999999999999999999e5")).toEqual({ m: -1, e: 6 });
  });

  test("refuses text that is not a decimal", () => {
    for (const text of ["", "abc", "1e", "1.5e40x", "1e1.5", "NaN", "Infinity"]) expect(() => Big.parse(text)).toThrow(RangeError);
  });

  test("refuses an exponent that is not a safe integer", () => {
    expect(() => Big.parse("1e99999999999999999999")).toThrow(RangeError);
  });
});

test("toNumber gives integers back as integers", () => {
  for (const value of [1234, 1e15 - 1, 987654321, -4321, 0.25]) expect(Big.toNumber(Big.from(value))).toBe(value);
  expect(Big.toNumber({ m: 1, e: 400 })).toBe(Infinity);
  expect(Big.toNumber({ m: 1, e: -400 })).toBe(0);
});

describe("arithmetic", () => {
  test("adds and subtracts across exponents", () => {
    expect(Big.toNumber(Big.add(1000, 234))).toBe(1234);
    expect(Big.toNumber(Big.sub(1000, 1234))).toBe(-234);
    expect(Big.add({ m: 1, e: 400 }, { m: 1, e: 400 })).toEqual({ m: 2, e: 400 });
    expect(Big.add({ m: 5, e: 400 }, { m: 5, e: 400 })).toEqual({ m: 1, e: 401 });
  });

  test("ignores what is beyond a double's precision", () => {
    const large = { m: 1, e: 100 };
    expect(Big.add(large, 1)).toBe(large);
    expect(Big.add(1, large)).toBe(large);
  });

  test("normalizes after cancellation", () => {
    expect(Big.sub(5, 5)).toBe(Big.ZERO);
    const tiny = Big.sub(1.0000001, 1);
    expect(tiny.e).toBe(-7);
    expect(tiny.m).toBeCloseTo(1, 8);
  });

  // 가수(5.00634)는 이진수로 정확하지 않아서, 가까운 두 정수의 가수끼리 빼면 그 오차가 결과보다 크게 남아 내림이 1 작아진다.
  test("subtracts close integers to the exact integer and cancels to exact zero", () => {
    expect(Big.toNumber(Big.floor(Big.sub(Big.from(500634), Big.from(490942))))).toBe(9692);
    expect(Big.floor(Big.sub(91032, 90695))).toEqual(Big.from(337));
    expect(Big.sub(Big.sub(Big.from(10), Big.from(7)), Big.from(3))).toBe(Big.ZERO);
  });

  test("adds and subtracts integers below 2^51 to the same Big as the integer itself", () => {
    // 결정적인 난수(LCG). 자릿수를 1–15에서 고르고, 반은 a에 가까운 b(큰 상쇄), 반은 자릿수가 다른 b다.
    let seed = 20261110;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const integer = (maxDigits: number) => {
      const value = Math.floor(next() * Number(`1e${1 + Math.floor(next() * maxDigits)}`));
      return next() < 0.5 ? -value : value;
    };
    for (let i = 0; i < 20_000; i++) {
      const a = integer(15);
      const b = i % 2 === 0 ? a - integer(4) : integer(15);
      expect(Big.sub(a, b)).toEqual(Big.from(a - b));
      expect(Big.add(a, b)).toEqual(Big.from(a + b));
      expect(Big.toNumber(Big.floor(Big.sub(a, b)))).toBe(a - b);
      expect(Big.toNumber(Big.floor(Big.add(a, b)))).toBe(a + b);
      expect(Big.sub(a, a)).toBe(Big.ZERO);
    }
  });

  test("adds integers and fractions across the edge of the exact range", () => {
    expect(Big.add(2 ** 50, 2 ** 50)).toEqual(Big.from(2 ** 51));
    expect(Big.sub(1e15, 1)).toEqual(Big.from(999999999999999));
    expect(Big.add(1e16, -1e15)).toEqual(Big.from(9e15));
    expect(Big.toNumber(Big.add(3, 0.5))).toBe(3.5);
    expect(Big.toNumber(Big.sub(10, 0.25))).toBe(9.75);
    expect(Big.toNumber(Big.add(1.5, 2.25))).toBe(3.75);
  });

  test("multiplies and divides past the range of doubles", () => {
    expect(Big.mul({ m: 2, e: 300 }, { m: 5, e: 300 })).toEqual({ m: 1, e: 601 });
    expect(Big.div({ m: 1, e: 601 }, { m: 5, e: 300 })).toEqual({ m: 2, e: 300 });
    expect(Big.mul(0, { m: 5, e: 300 })).toBe(Big.ZERO);
    expect(Big.toNumber(Big.mul(Big.div(1, 3), 3))).toBe(1);
    expect(() => Big.div(1, 0)).toThrow(RangeError);
  });

  test("raises to integer powers", () => {
    expect(Big.toNumber(Big.pow(2, 10))).toBe(1024);
    expect(Big.pow(10, 500)).toEqual({ m: 1, e: 500 });
    expect(Big.toNumber(Big.pow(2, -2))).toBe(0.25);
    expect(Big.pow(123, 0)).toBe(Big.ONE);
    const growth = Big.pow(1.15, 1000);
    expect(growth.e).toBe(60);
    expect(growth.m / (1.15 ** 1000 / 1e60)).toBeCloseTo(1, 12);
    expect(() => Big.pow(2, 0.5)).toThrow(RangeError);
  });

  test("floors to the same Big as the integer itself", () => {
    expect(Big.floor(Big.add(1000, 234))).toEqual(Big.from(1234));
    expect(Big.floor(1234.56)).toEqual(Big.from(1234));
    expect(Big.floor(-1.5)).toEqual(Big.from(-2));
    expect(Big.floor(0.5)).toBe(Big.ZERO);
    expect(Big.floor(-0.5)).toEqual(Big.from(-1));
    const large = { m: 1.2345, e: 20 };
    expect(Big.floor(large)).toBe(large);
    const floored = Big.floor(Big.div(10, 3));
    expect(Big.floor(floored)).toEqual(floored);
  });
});

describe("comparison", () => {
  const ascending = [{ m: -1, e: 10 }, Big.from(-5), Big.from(-0.5), Big.ZERO, Big.from(0.005), Big.ONE, Big.from(9.5), { m: 1, e: 10 }];

  test("orders by sign, then exponent, then mantissa", () => {
    ascending.forEach((a, i) => ascending.forEach((b, j) => expect(Big.cmp(a, b)).toBe(Math.sign(i - j))));
  });

  test("helpers follow cmp and accept plain numbers", () => {
    expect(Big.lt(1, 2) && Big.lte(2, 2) && Big.gt(3, 2) && Big.gte(2, 2) && Big.eq(2, Big.from(2))).toBe(true);
    expect(Big.min(3, { m: 1, e: 10 })).toEqual(Big.from(3));
    expect(Big.max(3, { m: 1, e: 10 })).toEqual({ m: 1, e: 10 });
    expect([Big.sign(-3), Big.sign(0), Big.sign({ m: 1, e: -300 })]).toEqual([-1, 0, 1]);
  });
});

test("a Big is plain data that survives serialization", () => {
  const value = Big.mul({ m: 3.25, e: 120 }, 7);
  expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  expect(Object.keys(value)).toEqual(["m", "e"]);
});
