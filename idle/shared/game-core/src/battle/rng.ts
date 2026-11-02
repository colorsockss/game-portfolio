/**
 * mulberry32: 상태 하나(uint32)로 [0, 1)의 수를 낸다. 정수 비트 연산과 Math.imul은 명세가 결과를
 * 고정하므로 클라이언트와 서버가 같은 수열을 얻는다.
 */
export function next(state: number): { value: number; state: number } {
  const s = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: s };
}
