import { Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import {
  applyCommand, isCommandOpcode, type Command, type CommandOf, type CommandOpcode, type GameError,
  type PlayerSnapshot, type PlayerState, type StateSync,
} from "@idle/game-core";
import type { Signal } from "@preact/signals-core";
import { confirm, predict } from "../../domain/progress/prediction.js";
import type { AppEventMap, EventBus } from "../events.js";
import type { Clock, GameServer, Logger } from "../ports.js";

export interface ProgressOptions {
  /** 화면에 있는 저장 데이터. progress가 유일한 쓰기 주체다. */
  readonly player: Signal<PlayerState | null>;
  readonly server: GameServer;
  readonly data: GameData;
  /** 게임 규칙은 서버에서처럼 서버 시간으로 돈다. */
  readonly clock: Clock;
  /** 답을 기다릴 수 있는 커맨드의 수. 서버는 그만큼의 재전송을 알아본다. */
  readonly maxUnanswered: number;
  /** 거절된 커맨드마다 `refused`를 낸다. 화면의 저장 데이터에서 그 효과가 빠진 뒤다. */
  readonly events: Pick<EventBus<AppEventMap>, "emit">;
  /** 서버의 확정이 예측과 달라 저장 데이터를 받아 올 때 남긴다. 규칙이나 데이터가 어긋났다는 신호다. */
  readonly logger: Logger;
}

interface Unanswered {
  readonly command: Command;
  /** 커맨드를 예측한 시간. 예측을 다시 해도 같은 결과가 나오게 한다. */
  readonly now: number;
  /**
   * 화면에 그 효과가 보이는지. 재개 전에 보낸 커맨드는 끈다: 서버가 재개하며 준 저장 데이터에
   * 이미 들어 있을 수 있어서, 다시 보여 주면 두 번 적용된다.
   */
  predicted: boolean;
  /**
   * 보낼 때 앞에 기다리는 커맨드가 없어 확정한 저장 데이터(`base`)에 바로 적용한 예측. 답이 올 때 확정이 그대로면 이것이 곧
   * 서버가 확정할 결과라서 다시 계산하지 않는다.
   */
  readonly expected?: { readonly base: PlayerState; readonly state: PlayerState };
}

/**
 * 플레이어의 저장 데이터를 서버와 맞춰 둔다. 커맨드는 game-core의 규칙(서버가 돌리는 것과 같은
 * 코드)으로 화면에 즉시 적용된 다음 서버로 간다. 커맨드는 순서대로 나가고 서버도 순서대로
 * 답하므로, 화면은 언제나 서버가 마지막으로 확정한 저장 데이터 위에 답을 받지 못한 커맨드를 보낸
 * 순서대로 적용한 것이다:
 *
 * - 답이 오면 확정한 저장 데이터를 그 답이 실은 변경으로 옮기고, 그 커맨드는 끝난다.
 * - 거절당한 커맨드는 빠지고, 그러면 그 커맨드가 취소되고 뒤의 커맨드는 다시 적용된다.
 * - 확정한 revision 이하의 답은 지난 소식이다(재개한 저장 데이터에 이미 들어 있어서 다시 보낸
 *   커맨드의 답). 아무것도 바꾸지 않는다.
 */
export function createProgress({ player, server, data, clock, maxUnanswered, events, logger }: ProgressOptions) {
  let confirmed: PlayerSnapshot | undefined;
  const unanswered: Unanswered[] = [];
  // 서버의 저장 데이터를 받아 오는 중. 한 연결의 요청은 차례로 처리하므로 그보다 먼저 보낸 커맨드는 모두 그 저장 데이터에 들어 있다.
  let fetching: Promise<void> | undefined;

  // 앞선 커맨드가 빠져서 규칙이 이제 거절하는 커맨드는 서버가 답할 때까지 화면에 나오지 않는다.
  function show(): void {
    if (!confirmed) return;
    const next = predict(confirmed.player, unanswered.filter(entry => entry.predicted), data);
    player.value = next;
  }

  // 답을 확정한다. 지문이 예측과 다르면 서버의 저장 데이터를 받아 오고, 받아 오는 동안 온 답은 그것을 기다린 뒤 받아 온 저장
  // 데이터에 들어 있지 않을 때만(그보다 revision이 큼) 그 위에서 견준다. 그동안 그 커맨드는 아직 답을 받지 않은 것으로 남아
  // 화면에서 효과가 빠지지 않는다.
  async function confirmSync(sync: StateSync, entry: Unanswered): Promise<void> {
    while (fetching) await fetching;
    if (!confirmed) return;
    const base = confirmed.player;
    const next = confirm(confirmed, sync, () => {
      if (entry.expected?.base === base) return entry.expected.state;
      const result = applyCommand(base, entry.command, { now: entry.now, data });
      return result.ok ? result.state : undefined;
    });
    if (next) {
      confirmed = next;
      return;
    }
    logger.warn(`${Opcode[entry.command.type]} was confirmed as a state other than the prediction; fetching the saved state.`);
    return refetch();
  }

  // 받아 오지 못하면(연결이 끊김) 재개가 저장 데이터를 준다.
  function refetch(): Promise<void> {
    fetching ??= server.fetch().then(
      snapshot => {
        if (!confirmed || snapshot.revision >= confirmed.revision) confirmed = snapshot;
      },
      (error: unknown) => logger.warn("The saved state could not be fetched; the next resume brings it:", error),
    ).finally(() => {
      fetching = undefined;
    });
    return fetching;
  }

  function done(entry: Unanswered): void {
    const index = unanswered.indexOf(entry);
    if (index >= 0) unanswered.splice(index, 1);
    show();
  }

  /**
   * 서버가 세션을 재개하며 준 저장 데이터에서 이어 간다. 답을 받지 못한 커맨드는 서버 어댑터가
   * 다시 보내고, 그 답이 올 때까지 화면에는 서버의 저장 데이터만 보인다.
   */
  function resume(snapshot: PlayerSnapshot): void {
    confirmed = snapshot;
    for (const entry of unanswered) entry.predicted = false;
    show();
  }

  /**
   * 커맨드를 즉시 적용하고 보낸다. 게임 규칙이 여기서든 서버에서든 거절하면 오류와 함께 이행하고,
   * 서버에 닿지 못하면 reject한다. 어느 쪽이든 적용한 것은 취소된다.
   */
  async function send(command: Command): Promise<GameError | undefined> {
    const error = await apply(command);
    if (error) events.emit("refused", { command, error });
    return error;
  }

  async function apply(command: Command): Promise<GameError | undefined> {
    const shown = player.value;
    if (!confirmed || !shown) throw new Error("Log in before sending commands.");
    if (unanswered.length >= maxUnanswered) throw new Error("Too many commands are waiting for the server.");
    const now = clock.now();
    const local = applyCommand(shown, command, { now, data });
    if (!local.ok) return local.error;
    const entry: Unanswered = {
      command, now, predicted: true, expected: shown === confirmed.player ? { base: shown, state: local.state } : undefined,
    };
    unanswered.push(entry);
    player.value = local.state;

    try {
      // 서버는 예측한 시각에 커맨드를 적용하므로, 보통의 지연이면 확정이 예측과 같다.
      const outcome = await server.send(command, now);
      if (!outcome.ok) return outcome.error;
      if (outcome.sync) await confirmSync(outcome.sync, entry);
      return undefined;
    } finally {
      done(entry);
    }
  }

  server.onResumed(resume);

  return {
    /** 저장 데이터와 답을 기다리는 커맨드를 잊고, 저장 데이터를 화면에서 치운다(세션이 끝났다). */
    clear(): void {
      confirmed = undefined;
      unanswered.length = 0;
      player.value = null;
    },

    /** 로그인한 뒤 서버의 저장 데이터로 시작한다. 그 전에 기다리던 것은 더 이상 없다. */
    reset(snapshot: PlayerSnapshot): void {
      confirmed = snapshot;
      unanswered.length = 0;
      show();
    },

    resume,

    send,

    /** 같은 커맨드를 이름으로 부른다. 예: cmd.StageSelect({ stageId }). */
    cmd: createCommands(send),
  };
}

/**
 * 커맨드가 서버에 닿지 못했을 때(reject) 남길 경고. 적용한 것은 progress가 취소하고, 규칙의 거절은 `refused`가 따로 알리므로
 * 화면은 이것만 남긴다. 예: `cmd.Rebirth({}).catch(unsent(logger, "The rebirth"))`.
 */
export const unsent = (logger: Pick<Logger, "warn">, what: string) => (error: unknown): void =>
  logger.warn(`${what} did not reach the server:`, error);

// 게임 커맨드인 opcode의 이름.
type OpcodeName = keyof typeof Opcode;
type CommandName = { [N in OpcodeName]: (typeof Opcode)[N] extends CommandOpcode ? N : never }[OpcodeName];

/** 게임 커맨드마다 하나씩, opcode 이름을 딴 함수: cmd.StageSelect({ stageId }). */
export type Commands = {
  readonly [N in CommandName]: (fields: Omit<CommandOf<(typeof Opcode)[N]>, "type">) => Promise<GameError | undefined>;
};

// Opcode 자체에서 만들므로 새 커맨드는 고칠 목록 없이 함수가 생긴다. 커맨드는 `send`를 거치며,
// 그러면 화면에 즉시 적용된다.
function createCommands(send: (command: Command) => Promise<GameError | undefined>): Commands {
  return byName(op => (fields: object) => send({ ...fields, type: op } as Command)) as Commands;
}

function byName<F>(create: (op: CommandOpcode) => F): Readonly<Record<string, F>> {
  const entries: Record<string, F> = {};
  // 숫자 enum은 이름을 숫자로, 숫자를 이름으로 매핑하는데, 앞쪽(이름 → 숫자)만 opcode다.
  for (const [name, op] of Object.entries(Opcode)) {
    if (typeof op === "number" && isCommandOpcode(op)) entries[name] = create(op);
  }
  return Object.freeze(entries);
}

export type Progress = ReturnType<typeof createProgress>;
