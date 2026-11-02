import { GameErrorCode } from "@idle/codes";
import { MINUTE, type GameError } from "@idle/game-core";
import { computed, signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import type { Clock } from "../../application/ports.js";
import type { Commands } from "../../application/progress/progress.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import type { Translate } from "../text.js";

/** 개발 빌드에서만 여는 디버그 오버레이: FPS, 서버 시간, 앱 상태 덤프, 치트 한 줄. */
export interface DebugViewModel {
  /** 패널이 펼쳐졌는지. 접으면 펼치는 버튼만 남는다. */
  readonly open: ReadonlySignal<boolean>;
  toggle(): void;
  readonly fps: ReadonlySignal<string>;
  readonly serverTime: ReadonlySignal<string>;
  /** 앱 상태의 JSON. 큰 수는 표기(1.2K)로 보인다. */
  readonly dump: ReadonlySignal<string>;
  /** 치트 한 줄. 예: grant 1 1000. */
  readonly cheat: Signal<string>;
  /** 마지막 치트가 어떻게 되었는지. 처음과 모르는 치트에는 쓰는 법이다. */
  readonly cheatResult: ReadonlySignal<string>;
  runCheat(): Promise<void>;
  /** 뷰가 잰 초당 프레임과 지금의 서버 시간, 상태를 다시 보인다. 뷰가 주기적으로 부른다. */
  refresh(fps: number): void;
}

export interface DebugViewModelOptions {
  readonly state: AppState;
  readonly clock: Clock;
  readonly progress: { readonly cmd: Commands };
  readonly t: Translate;
}

// 치트 이름 → 숫자 인자로 보내기. 빠지거나 틀린 인자(NaN)는 규칙(game-core)이 거절한다.
const CHEATS: Readonly<Record<string, (cmd: Commands, args: readonly number[]) => Promise<GameError | undefined>>> = {
  grant: (cmd, [itemId, amount = 1]) => cmd.CheatItemGrant({ itemId, amount }),
  level: (cmd, [level]) => cmd.CheatLevelSet({ level }),
  unlock: (cmd, [stageId]) => cmd.CheatStageUnlock({ stageId }),
  time: (cmd, [minutes]) => cmd.CheatTimeShift({ duration: Math.round(minutes * MINUTE) }),
};

export function createDebugViewModel({ state, clock, progress, t }: DebugViewModelOptions): DebugViewModel {
  const open = signal(false);
  const fps = signal("");
  const serverTime = signal("");
  const dump = signal("");
  const cheat = signal("");
  // 처음은 쓰는 법이다. 치트를 보내면 그 결과로 바뀐다.
  const result = signal<string | null>(null);
  const cheatResult = computed(() => result.value ?? t("debug.usage"));
  return {
    open,
    toggle: () => void (open.value = !open.value),
    fps,
    serverTime,
    dump,
    cheat,
    cheatResult,
    async runCheat() {
      const line = cheat.value.trim();
      const [name, ...args] = line.split(/\s+/);
      if (!Object.prototype.hasOwnProperty.call(CHEATS, name)) {
        result.value = t("debug.unknown", { line, usage: t("debug.usage") });
        return;
      }
      result.value = t("debug.sending", { line });
      try {
        const error = await CHEATS[name](progress.cmd, args.map(Number));
        result.value = error
          ? t("debug.refused", { code: GameErrorCode[error.code] ?? error.code, line })
          : t("debug.applied", { line });
      } catch (error) {
        result.value = t("debug.unreachable", { line, error: String(error) });
      }
    },
    refresh(measured) {
      fps.value = `${Math.round(measured)} FPS`;
      // 예: 2026-10-21 05:20:31 UTC.
      serverTime.value = `${new Date(clock.now()).toISOString().slice(0, 19).replace("T", " ")} UTC`;
      dump.value = dumpOf(state);
    },
  };
}

function dumpOf(state: AppState): string {
  const values = { flow: state.flow.value, network: state.network.value, login: state.login.value, player: state.player.value };
  return JSON.stringify(values, (_key, value: unknown) => (isBig(value) ? formatBig(value) : value), 1);
}

function isBig(value: unknown): value is { m: number; e: number } {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes("m") && keys.includes("e");
}
