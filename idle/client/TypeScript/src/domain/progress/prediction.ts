import type { GameData } from "@idle/data-schema";
import { applyCommand, playerFingerprint, type Command, type PlayerSnapshot, type PlayerState, type StateSync } from "@idle/game-core";

export interface PendingCommand {
  readonly command: Command;
  /** 커맨드를 예측한 시간. 예측을 다시 해도 같은 결과가 나오게 한다. */
  readonly now: number;
}

/**
 * 확정한 저장 데이터에 대기 중인 커맨드를 순서대로 다시 적용한 결과. 앞선 커맨드가 빠져서 규칙이
 * 이제 거절하는 커맨드는 건너뛴다. 아무것도 적용되지 않았으면 `confirmed` 자신을 돌려준다.
 */
export function predict(confirmed: PlayerState, pending: readonly PendingCommand[], data: GameData): PlayerState {
  let next = confirmed;
  for (const { command, now } of pending) {
    const result = applyCommand(next, command, { now, data });
    if (result.ok) next = result.state;
  }
  return next;
}

/**
 * 확정한 저장 데이터를 서버의 답으로 옮긴다. 그 revision 이하의 답은 지난 소식이다. 바뀐 슬라이스가 오면 바꿔 끼우고, 지문만
 * 오면 그 커맨드를 확정한 저장 데이터에 같은 시각으로 적용한 결과(`expected`, 필요할 때만 부름)의 지문과 견준다. 다르거나 규칙이
 * 거절하면(undefined) undefined다: 서버의 저장 데이터를 받아 와야 한다.
 */
export function confirm(confirmed: PlayerSnapshot, sync: StateSync, expected: () => PlayerState | undefined): PlayerSnapshot | undefined {
  if (sync.revision <= confirmed.revision) return confirmed;
  if (sync.changes) return { player: { ...confirmed.player, ...sync.changes }, revision: sync.revision };
  const player = expected();
  if (player === undefined || playerFingerprint(player) !== sync.fingerprint) return undefined;
  return { player, revision: sync.revision };
}
