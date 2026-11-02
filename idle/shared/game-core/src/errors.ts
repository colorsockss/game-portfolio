import type { GameErrorCode } from "@idle/codes";

export interface GameError {
  readonly code: GameErrorCode;
  /** 로그와 디버깅을 위해 거절 이유를 설명하며, 클라이언트는 `code`를 보고 움직인다. */
  readonly message: string;
}
