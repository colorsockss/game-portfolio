import type { GameErrorCode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import { refitHero } from "../battle/simulation.js";
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

/** 커맨드 하나의 규칙. `settled`는 applyCommand가 `ctx.now`의 틱까지 확정한 저장 데이터다. */
export type CommandHandler<C> = (settled: PlayerState, command: C, ctx: CommandContext) => CommandResult;

export function ok(state: PlayerState): CommandResult {
  return { ok: true, state };
}

export function fail(code: GameErrorCode, message: string): CommandResult {
  return { ok: false, error: { code, message } };
}

/**
 * 능력치를 바꾼 `after`. 전투는 확정한 틱(`before`)의 웨이브와 적을 그대로 두고 새 능력치로 이어 간다(refitHero). `grow`는
 * 되돌릴 수 없는 성장(골드 강화, 입은 장비의 강화·합성)이라 최대 HP가 오른 만큼 HP도 올리고, 입고 벗기처럼 되돌릴 수 있는 바꿈은
 * HP를 새 최대 HP로 자르기만 한다.
 */
export function refit(before: PlayerState, after: PlayerState, data: GameData, grow = false): CommandResult {
  return ok({ ...after, battle: refitHero(before, after, data, grow) });
}
