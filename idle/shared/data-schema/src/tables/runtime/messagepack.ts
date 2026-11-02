// 생성된 로더가 함께 쓴다. 워크북 내용과 무관하다.
import { decode } from '@msgpack/msgpack';

export function readMessagePack(bytes: Uint8Array | ArrayBuffer): unknown[][] {
  return decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { useBigInt64: true }) as unknown[][];
}
