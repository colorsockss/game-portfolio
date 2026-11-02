import { describe, it, expect } from 'vitest';
import { BUILTINS } from './builtins';
import { createRng } from './rng';

describe('BUILTINS', () => {
  it('min, max 는 가변 인자를 받는다', () => {
    expect(BUILTINS.min.fn([3, 1, 2], createRng(1))).toBe(1);
    expect(BUILTINS.max.fn([3, 1, 2], createRng(1))).toBe(3);
    expect(BUILTINS.min.minArgs).toBe(1);
    expect(BUILTINS.min.maxArgs).toBe(Infinity);
  });

  it('floor, ceil, round, abs, sqrt 는 인자 1개다', () => {
    expect(BUILTINS.floor.fn([3.7], createRng(1))).toBe(3);
    expect(BUILTINS.ceil.fn([3.2], createRng(1))).toBe(4);
    expect(BUILTINS.round.fn([3.5], createRng(1))).toBe(4);
    expect(BUILTINS.abs.fn([-5], createRng(1))).toBe(5);
    expect(BUILTINS.sqrt.fn([9], createRng(1))).toBe(3);
    expect(BUILTINS.floor.maxArgs).toBe(1);
  });

  it('pow 는 인자 2개다', () => {
    expect(BUILTINS.pow.fn([2, 10], createRng(1))).toBe(1024);
    expect(BUILTINS.pow.minArgs).toBe(2);
    expect(BUILTINS.pow.maxArgs).toBe(2);
  });

  it('clamp 는 값을 범위로 제한한다', () => {
    expect(BUILTINS.clamp.fn([150, 0, 100], createRng(1))).toBe(100);
    expect(BUILTINS.clamp.fn([-10, 0, 100], createRng(1))).toBe(0);
    expect(BUILTINS.clamp.fn([50, 0, 100], createRng(1))).toBe(50);
  });

  it('rand 는 인자 0개면 [0,1), 2개면 [a,b) 를 반환한다', () => {
    const r = createRng(7);
    const v0 = BUILTINS.rand.fn([], r);
    expect(v0).toBeGreaterThanOrEqual(0);
    expect(v0).toBeLessThan(1);
    const v2 = BUILTINS.rand.fn([10, 20], r);
    expect(v2).toBeGreaterThanOrEqual(10);
    expect(v2).toBeLessThan(20);
    expect(BUILTINS.rand.minArgs).toBe(0);
    expect(BUILTINS.rand.maxArgs).toBe(2);
  });

  it('rand 는 인자 1개면 [0,a) 를 반환하고 NaN이 아니다', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = BUILTINS.rand.fn([5], r);
      expect(Number.isNaN(v)).toBe(false);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it('randInt 는 정수를 [a,b] 포함 범위로 반환한다', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const v = BUILTINS.randInt.fn([1, 6], r);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });
});
