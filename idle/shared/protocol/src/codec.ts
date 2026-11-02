// @msgpack/msgpack은 로드되자마자 TextEncoder와 TextDecoder를 만든다. Node와 브라우저에는 둘 다
// 있지만 PuerTS V8에는 둘 다 없으므로, 클라이언트가 이 패키지를 로드하기 전에 설치한다(이 순서가
// 지켜지는지 확인하려고 빌드 테스트가 둘 없이 번들을 실행해 본다).
import { decode, encode } from "@msgpack/msgpack";

export function encodeMessage(message: unknown): Uint8Array {
  // 선택 필드(없는 sync 등)는 nil로 보내지 않고 빼 둔다.
  return encode(message, { ignoreUndefined: true });
}

/** 바이트가 올바른 MessagePack이 아니면 던진다. */
export function decodeMessage(bytes: Uint8Array | ArrayBuffer): unknown {
  return decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}
