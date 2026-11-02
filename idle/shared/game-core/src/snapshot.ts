import type { PlayerState } from "./state.js";

export interface PlayerSnapshot {
  readonly player: PlayerState;
  /** 변경이 저장될 때마다 1씩 오른다. StateSync 참고. */
  readonly revision: number;
}

/**
 * 커맨드가 저장 데이터를 어떻게 바꿨는지. 클라이언트는 커맨드를 같은 규칙, 같은 시각으로 이미 예측했으므로 서버는 보통
 * 결과의 지문만 보내고, 클라이언트는 자기 확정 상태에 그 커맨드를 적용한 결과의 지문과 견준다. 같으면 그 결과가 `revision`
 * 시점의 서버 상태이고, 다르면 서버에서 저장 데이터를 받아 온다(Opcode.StateFetch). 서버가 클라이언트의 시각을 받지 못한
 * 커맨드(범위 밖이라 자름, 시각 없음)는 예측과 다를 것을 알므로 바뀐 최상위 슬라이스(`changes`)를 통째로 함께 보낸다.
 */
export interface StateSync {
  readonly revision: number;
  /** 커맨드를 적용한 뒤 저장 데이터의 지문(`playerFingerprint`). */
  readonly fingerprint: number;
  /** 바뀐 최상위 슬라이스. 클라이언트가 자기 사본에서 바꿔 끼우면 `revision` 시점의 서버 상태와 같아진다. */
  readonly changes?: Partial<PlayerState>;
}

/**
 * 저장 데이터의 지문: 키를 정렬한 JSON의 53비트 해시(cyrb53). 숫자를 글자로 바꾸는 규칙은 ECMAScript가 정하므로 어느 엔진에서든
 * 같은 값이면 같은 글자이고, 키를 정렬하므로 저장 데이터를 풀어 만든 객체와 규칙이 계산한 객체의 키 순서가 달라도 같다. 값이
 * undefined인 키는 없는 것으로 본다(MessagePack이 빼고 보냄).
 */
export function playerFingerprint(player: PlayerState): number {
  return cyrb53(canonical(player));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  const entries: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== undefined) entries.push(`${JSON.stringify(key)}:${canonical(field)}`);
  }
  return `{${entries.join(",")}}`;
}

// cyrb53: 글자마다 두 32비트 상태를 섞어 53비트로 낸다. Math.imul과 비트 연산, 2^32를 곱하고 더하는 정확한 연산만 쓴다.
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
