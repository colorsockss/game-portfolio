import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    const a = createRng(123);
    const b = createRng(123);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('다른 시드는 다른 첫 값을 만든다', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('항상 [0, 1) 범위를 반환한다', () => {
    const rng = createRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('연속 호출은 상태를 진행시킨다', () => {
    const rng = createRng(1);
    expect(rng()).not.toBe(rng());
  });
});
