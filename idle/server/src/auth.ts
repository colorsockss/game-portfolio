import { createHash, randomBytes } from "node:crypto";
import { DAY } from "@idle/game-core";

/** 세션 토큰으로 새 연결에서 그 세션을 이어 갈 수 있는 기간(AuthResume). */
export const SESSION_LIFETIME = DAY;

/** 새 세션 토큰. 무작위 256비트다. */
export function createToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 토큰은 해시로만 저장하므로, DB가 새어도 토큰으로 세션을 이을 수 없다. */
export function hashToken(token: string): Uint8Array {
  return createHash("sha256").update(token).digest();
}
