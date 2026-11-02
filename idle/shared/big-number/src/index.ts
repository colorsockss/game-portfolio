// 방치형 게임의 성장은 double(1.8e308)을 넘어서므로 쓰는 수: m × 10^e (1 ≤ |m| < 10)이고, 0은
// m = 0, e = 0이다. 저장 데이터, 메시지, 규칙이 모두 이 타입 하나를 쓴다. Big은 클래스가 아니라 평범한
// 데이터라서, 저장 데이터와 메시지에 별도 코덱 없이 실을 수 있다.
//
// 클라이언트는 서버가 검증하는 것과 같은 규칙으로 예측하므로, 같은 연산은 두 쪽에서 같은 비트를
// 내야 한다. 여기 있는 연산은 모두 double의 +, -, ×, ÷와 비교이며 IEEE 754가 어느 엔진에서든
// 결과를 고정하고, 곱하거나 나누는 수도 정확히 표현되는 10의 거듭제곱뿐이다. Math.pow와 Math.log10은
// 뺐다. 엔진마다 마지막 비트를 다르게 반올림할 수 있기 때문이다.
export interface Big {
  readonly m: number;
  readonly e: number;
}

/** Big, 또는 연산이 먼저 Big으로 바꿔 쓰는 평범한 수. */
export type BigLike = Big | number;

// 10^0부터 10^22까지. double이 정확히 담을 수 있는 10의 거듭제곱이다.
const POW10: readonly number[] = Array.from({ length: 23 }, (_, k) => Number(`1e${k}`));
const MAX_EXACT = 22;
// double의 유효 숫자는 최대 17자리이므로, 다른 Big보다 크기가 18자릿수 이상 작은 Big은 더해도 그
// 값을 바꾸지 못한다.
const PRECISION = 17;
// 마지막 자리 단위(ULP)의 4배, 상대값: m × 10^e가 그것이 나타내는 정수에서 얼마나 떨어져도 되는지.
const SNAP = 4 * Number.EPSILON;

const ZERO: Big = Object.freeze({ m: 0, e: 0 });
const ONE: Big = Object.freeze({ m: 1, e: 0 });

function normalize(m: number, e: number): Big {
  if (!Number.isFinite(m)) throw new RangeError(`A Big needs a finite number, got ${m}.`);
  if (m === 0) return ZERO;
  // |m|을 먼저 정확한 거듭제곱 범위 안으로 가져온 다음, 정확한 거듭제곱 하나로 [1, 10)에 맞춘다.
  while (Math.abs(m) >= POW10[MAX_EXACT]) {
    m /= POW10[MAX_EXACT];
    e += MAX_EXACT;
  }
  while (Math.abs(m) * POW10[MAX_EXACT] < 1) {
    m *= POW10[MAX_EXACT];
    e -= MAX_EXACT;
  }
  const abs = Math.abs(m);
  if (abs >= 10) {
    let k = 1;
    while (abs >= POW10[k + 1]) k++;
    m /= POW10[k];
    e += k;
  } else if (abs < 1) {
    let k = 1;
    while (abs * POW10[k] < 1) k++;
    m *= POW10[k];
    e -= k;
  }
  // 반올림 때문에 10 바로 아래이던 가수가 정확히 10으로 올라갈 수 있다.
  if (Math.abs(m) >= 10) {
    m /= 10;
    e += 1;
  }
  return { m, e };
}

/**
 * 수나 int64 테이블 값(bigint)에서 만든 Big. NaN과 무한대는 이후의 모든 결과로 퍼지므로 던진다.
 */
function from(value: BigLike | bigint): Big {
  if (typeof value === "object") return value;
  // Number(bigint)는 가장 가까운 double로 반올림하며, 어느 엔진에서든 같다.
  return normalize(typeof value === "bigint" ? Number(value) : value, 0);
}

// 부호, 정수부, 소수부, ".5"처럼 정수부가 없을 때의 소수부, 지수부.
const DECIMAL = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

/**
 * "1.5e40", "-12", ".5" 같은 십진 문자열에서 만든 Big. 같은 십진 값은 쓰는 방식("0.07e41", "7e39",
 * "70e38")과 상관없이 같은 Big이 되어야 하므로, Number를 부르기 전에 문자열에서 소수점을 옮긴다.
 * 첫 유효 숫자 뒤에 소수점을 놓은 "d.ddd"와 정수 지수를 구한 뒤 Number를 한 번만 부르면 normalize가
 * 곱하거나 나누며 생기는 반올림 오차가 없다. 지수부를 가수와 합쳐 Number로 읽으면 double을 넘는
 * 값이 Infinity가 되므로 지수는 정수로만 계산한다. 형식이 틀리거나 지수가 안전 정수가 아니면
 * RangeError를 던진다.
 */
function parse(text: string): Big {
  const match = DECIMAL.exec(text);
  if (match === null) throw new RangeError(`A Big needs decimal text like "1.5e40", got "${text}".`);
  const [, sign, wholeText, fractionText, bareFraction, exponentText] = match;
  const whole = wholeText ?? "";
  const fraction = fractionText ?? bareFraction ?? "";
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  if (!Number.isSafeInteger(exponent)) throw new RangeError(`A Big exponent must be a safe integer, got "${exponentText}".`);
  const digits = whole + fraction;
  const first = digits.search(/[1-9]/);
  if (first < 0) return ZERO;
  const significant = digits.slice(first);
  // 첫 유효 숫자의 자릿값은 10^(소수점 위치 - first - 1)이다.
  const mantissa = Number(`${sign}${significant[0]}.${significant.slice(1)}`);
  return normalize(mantissa, whole.length - first - 1 + exponent);
}

/** double로 나타낸 값: 1.8e308을 넘으면 Infinity, 가장 작은 double보다 작으면 0. */
function toNumber(value: BigLike): number {
  if (typeof value === "number") return value;
  const { m, e } = value;
  if (e >= 0 && e <= MAX_EXACT) return snap(m * POW10[e]);
  if (e < 0 && e >= -MAX_EXACT) return snap(m / POW10[-e]);
  // 십진 문자열을 파싱하면 가장 가까운 double로 반올림하며, 어느 엔진에서든 같다.
  return Number(`${m}e${e}`);
}

// 1234는 1.234 × 10^3으로 저장되는데 1.234는 이진수로 정확히 표현되지 않아서, 되돌려 곱하면
// 1233.9999999999998이 나올 수 있다. 정수에 이만큼 가까운 결과는 그 정수로 본다.
function snap(n: number): number {
  const integer = Math.round(n);
  return Math.abs(n - integer) <= Math.abs(n) * SNAP ? integer : n;
}

function add(a: BigLike, b: BigLike): Big {
  const x = from(a);
  const y = from(b);
  if (x.m === 0) return y;
  if (y.m === 0) return x;
  const gap = x.e - y.e;
  if (gap > PRECISION) return x;
  if (gap < -PRECISION) return y;
  return gap >= 0 ? normalize(x.m + y.m / POW10[gap], x.e) : normalize(x.m / POW10[-gap] + y.m, y.e);
}

function neg(a: BigLike): Big {
  const x = from(a);
  return x.m === 0 ? ZERO : { m: -x.m, e: x.e };
}

function sub(a: BigLike, b: BigLike): Big {
  return add(a, neg(b));
}

function mul(a: BigLike, b: BigLike): Big {
  const x = from(a);
  const y = from(b);
  if (x.m === 0 || y.m === 0) return ZERO;
  return normalize(x.m * y.m, x.e + y.e);
}

/** 0으로 나누면 RangeError를 던진다. */
function div(a: BigLike, b: BigLike): Big {
  const x = from(a);
  const y = from(b);
  if (y.m === 0) throw new RangeError("Division by zero.");
  if (x.m === 0) return ZERO;
  return normalize(x.m / y.m, x.e - y.e);
}

/**
 * 정수 n에 대한 a^n을 제곱을 거듭해서 구한다. 레벨마다 일정 비율로 늘어나는 비용 같은 데 쓴다.
 * 분수 지수는 지원하지 않는다. Math.pow가 필요해지기 때문이다.
 */
function pow(a: BigLike, n: number): Big {
  if (!Number.isInteger(n)) throw new RangeError(`Big.pow takes an integer exponent, got ${n}.`);
  if (n < 0) return div(ONE, pow(a, -n));
  let base = from(a);
  let result = ONE;
  for (let k = n; k > 0; k = Math.floor(k / 2)) {
    if (k % 2 === 1) result = mul(result, base);
    if (k > 1) base = mul(base, base);
  }
  return result;
}

/**
 * 재화와 아이템의 수량처럼 정수로 내림한다. 결과는 Big.from이 그 정수에 주는 값과 같으므로, 서로
 * 다른 연산으로 나온 정수도 내림하고 나면 같다고 비교된다.
 */
function floor(a: BigLike): Big {
  const x = from(a);
  // 10^15부터는 가수의 유효 숫자 16자리가 모두 소수점 위쪽에 놓인다.
  if (x.e >= 15) return x;
  if (x.e < 0) return x.m < 0 ? { m: -1, e: 0 } : ZERO;
  return normalize(Math.floor(snap(x.m * POW10[x.e])), 0);
}

/** -1, 0, 1 중 하나. */
function sign(a: BigLike): -1 | 0 | 1 {
  const { m } = from(a);
  return m > 0 ? 1 : m < 0 ? -1 : 0;
}

/** a < b이면 -1, 같으면 0, a > b이면 1. */
function cmp(a: BigLike, b: BigLike): -1 | 0 | 1 {
  const x = from(a);
  const y = from(b);
  const sx = sign(x);
  const sy = sign(y);
  if (sx !== sy) return sx < sy ? -1 : 1;
  if (sx === 0) return 0;
  // 부호가 같으면 가수가 [1, 10)에 있으므로 지수가 큰 쪽이 절댓값도 크다.
  if (x.e === y.e && x.m === y.m) return 0;
  const smaller = x.e !== y.e ? x.e < y.e : Math.abs(x.m) < Math.abs(y.m);
  return smaller === (sx > 0) ? -1 : 1;
}

export const Big = Object.freeze({
  ZERO,
  ONE,
  from,
  parse,
  toNumber,
  add,
  sub,
  mul,
  div,
  pow,
  neg,
  floor,
  sign,
  cmp,
  eq: (a: BigLike, b: BigLike) => cmp(a, b) === 0,
  lt: (a: BigLike, b: BigLike) => cmp(a, b) < 0,
  lte: (a: BigLike, b: BigLike) => cmp(a, b) <= 0,
  gt: (a: BigLike, b: BigLike) => cmp(a, b) > 0,
  gte: (a: BigLike, b: BigLike) => cmp(a, b) >= 0,
  min: (a: BigLike, b: BigLike) => (cmp(a, b) <= 0 ? from(a) : from(b)),
  max: (a: BigLike, b: BigLike) => (cmp(a, b) >= 0 ? from(a) : from(b)),
});
