import { Big, type BigLike } from "@idle/big-number";

// 세 자리마다 단위 하나: K, M, B, T, 그리고 10^15부터 두 글자(aa, ab, …, az, ba, …, zz).
const NAMED_UNITS = ["", "K", "M", "B", "T"];
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const LETTER_UNITS = LETTERS.length * LETTERS.length;
// 가수 × 10^k는 나타내려는 값보다 아주 조금 낮게 나온다(1.2는 2진수로 1.19999…이다).
const NUDGE = 1e-9;

/**
 * 방치형 게임에서 보이는 대로의 Big: 999, 1.2K, 34.5M, 3.4aa. `decimals` 이후 자릿수는 반올림하지
 * 않고 버려서 화면에 실제보다 큰 값이 나오지 않게 하고, 끝의 0은 뗀다(1.0K가 아니라 1K).
 * zz를 넘으면 1.2e2046 꼴로 돌아간다.
 */
export function formatBig(value: BigLike, decimals = 1): string {
  const { m, e } = Big.from(value);
  const sign = m < 0 ? "-" : "";
  const magnitude = Math.abs(m);
  if (e < 3) return `${sign}${Math.floor(Big.toNumber({ m: magnitude, e }) + NUDGE)}`;

  const group = Math.floor(e / 3);
  const unit = unitOf(group);
  if (unit === undefined) return `${sign}${truncate(magnitude, decimals)}e${e}`;
  return `${sign}${truncate(magnitude * 10 ** (e - group * 3), decimals)}${unit}`;
}

function unitOf(group: number): string | undefined {
  if (group < NAMED_UNITS.length) return NAMED_UNITS[group];
  const index = group - NAMED_UNITS.length;
  if (index >= LETTER_UNITS) return undefined;
  return LETTERS[Math.floor(index / LETTERS.length)] + LETTERS[index % LETTERS.length];
}

function truncate(value: number, decimals: number): string {
  const scale = 10 ** decimals;
  return String(Math.floor(value * scale + NUDGE) / scale);
}

/** 숫자 롤링이 지나는 중간 값의 수. */
const ROLL_STEPS = 10;

/**
 * `from`에서 `to`까지 굴러가는 숫자의 표기들: 둘 사이를 같은 간격으로 나눈 값의 `formatBig`이고 마지막은 `to`다.
 * 앞과 같은 표기(`from`의 표기 포함)는 빼므로, 보이는 글자가 바뀌지 않으면 비어 있다.
 */
export function rollFrames(from: BigLike, to: BigLike, steps = ROLL_STEPS): string[] {
  const delta = Big.sub(to, from);
  const frames: string[] = [];
  let last = formatBig(from);
  for (let i = 1; i <= steps; i++) {
    const text = formatBig(i === steps ? to : Big.add(from, Big.mul(delta, i / steps)));
    if (text !== last) frames.push(text);
    last = text;
  }
  return frames;
}
