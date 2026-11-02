import type { Rng } from './rng';

export interface Builtin {
  minArgs: number;
  maxArgs: number;
  fn: (args: number[], rng: Rng) => number;
}

export const BUILTINS: Record<string, Builtin> = {
  min: { minArgs: 1, maxArgs: Infinity, fn: (a) => Math.min(...a) },
  max: { minArgs: 1, maxArgs: Infinity, fn: (a) => Math.max(...a) },
  floor: { minArgs: 1, maxArgs: 1, fn: (a) => Math.floor(a[0]) },
  ceil: { minArgs: 1, maxArgs: 1, fn: (a) => Math.ceil(a[0]) },
  round: { minArgs: 1, maxArgs: 1, fn: (a) => Math.round(a[0]) },
  abs: { minArgs: 1, maxArgs: 1, fn: (a) => Math.abs(a[0]) },
  sqrt: { minArgs: 1, maxArgs: 1, fn: (a) => Math.sqrt(a[0]) },
  pow: { minArgs: 2, maxArgs: 2, fn: (a) => Math.pow(a[0], a[1]) },
  clamp: {
    minArgs: 3,
    maxArgs: 3,
    fn: (a) => Math.min(Math.max(a[0], a[1]), a[2]),
  },
  rand: {
    minArgs: 0,
    maxArgs: 2,
    // rand() → [0,1), rand(a) → [0,a), rand(a,b) → [a,b)  (a <= b 가정)
    fn: (a, rng) => {
      if (a.length === 0) return rng();
      if (a.length === 1) return rng() * a[0];
      return a[0] + rng() * (a[1] - a[0]);
    },
  },
  randInt: {
    minArgs: 2,
    maxArgs: 2,
    fn: (a, rng) => {
      const lo = Math.floor(a[0]);
      const hi = Math.floor(a[1]);
      return lo + Math.floor(rng() * (hi - lo + 1));
    },
  },
};

// 클라이언트와 서버가 같은 비트를 내야 하는 Big 모드(exportSettings.numeric = 'big')에서 쓸 수 없는 함수:
// 제곱근은 엔진마다 마지막 비트가 다를 수 있고, 반올림은 Big에 없으며, 난수는 결정적이지 않다. pow는 정수 지수만
// 받아 Big.pow(제곱을 거듭하는 곱셈)로 계산한다.
export const BIG_UNSUPPORTED = new Set(['sqrt', 'round', 'ceil', 'rand', 'randInt']);

/** 프로젝트가 Big 코드를 내보내는지. */
export const isBigProject = (project: { exportSettings?: { numeric?: string } }): boolean =>
  project.exportSettings?.numeric === 'big';
