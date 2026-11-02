import type { GameErrorCode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import type { GameError } from "../errors.js";
import type { PlayerState } from "../state.js";

export interface CommandContext {
  /** 서버 시각(epoch ms). 클라이언트는 그 추정값을 넘긴다. */
  readonly now: number;
  readonly data: GameData;
}

// 거절된 커맨드는 예외가 아니라 값이다. 서버는 코드로 응답하고 클라이언트는 그것을 보여 주며,
// 던져진 오류는 언제나 버그를 뜻한다.
export type CommandResult =
  | { readonly ok: true; readonly state: PlayerState }
  | { readonly ok: false; readonly error: GameError };

export type CommandHandler<C> = (state: PlayerState, command: C, ctx: CommandContext) => CommandResult;

export function ok(state: PlayerState): CommandResult {
  return { ok: true, state };
}

export function fail(code: GameErrorCode, message: string): CommandResult {
  return { ok: false, error: { code, message } };
}
