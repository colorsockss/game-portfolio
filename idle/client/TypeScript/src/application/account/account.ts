import { GameErrorCode } from "@idle/codes";
import { isValidLoginId } from "@idle/game-core";
import type { Signal } from "@preact/signals-core";
import type { AppRuntime, DeviceStorage, GameServer, Logger } from "../ports.js";
import type { Progress } from "../progress/progress.js";
import type { LoginState } from "../state/app-state.js";

export interface Account {
  /** 이 기기가 마지막으로 로그인한 ID. 첫 로그인 전과 로그아웃 뒤에는 "". */
  lastLoginId(): string;
  /** 로그인한다. reject하지 않는다. 진행은 `login` 슬라이스에, 실패 원인은 로그에 남는다. */
  login(loginId: string): Promise<void>;
  /**
   * 서버 연결을 정상 종료(1000)하고 클라이언트를 다시 시작하는 것으로 로그아웃한다. 세션 토큰은 이 스크립트 환경
   * 안에만 있어서 환경과 함께 사라지고, ID는 잊으므로 새로 시작하면 로그인에서 기다린다.
   */
  logout(): void;
}

export interface AccountOptions {
  readonly server: GameServer;
  readonly progress: Pick<Progress, "reset">;
  /** 로그인의 진행 상태. 계정이 유일한 쓰기 주체다. */
  readonly login: Signal<LoginState>;
  readonly storage: DeviceStorage;
  readonly runtime: AppRuntime;
  readonly logger: Logger;
}

// 이 기기가 마지막으로 로그인한 ID. 다음 시작은 이것으로 저절로 로그인한다.
const LAST_LOGIN_ID = "lastLoginId";

/**
 * 로그인: 연결을 열고, 로그인하고, 서버의 사본으로 저장 데이터를 시작한다. 그 뒤로는 서버 어댑터가
 * 세션을 유지하며 끊어진 연결 뒤에 재개하고, 진행은 서버가 재개하며 준 데이터에서 이어진다.
 */
export function createAccount({ server, progress, login: state, storage, runtime, logger }: AccountOptions): Account {
  return {
    lastLoginId: () => storage.get(LAST_LOGIN_ID) ?? "",

    async login(loginId) {
      // 첫 await 전에 확인하고 설정하므로 로그인이 둘 동시에 돌지 않는다.
      if (state.value.pending !== null) return;
      // 서버가 검사하는 것과 같은 규칙(game-core)이므로, 거절당할 수밖에 없는 ID는 보내지 않는다.
      if (!isValidLoginId(loginId)) {
        state.value = { pending: null, failed: loginId };
        return;
      }
      state.value = { pending: loginId, failed: null };
      try {
        await server.open();
        const outcome = await server.login(loginId);
        if (!outcome.ok) throw new Error(`Login refused: ${GameErrorCode[outcome.error.code]}.`);
        progress.reset(outcome.snapshot);
        storage.set(LAST_LOGIN_ID, loginId);
        state.value = { pending: null, failed: null };
      } catch (error) {
        // 플레이어에게는 평범한 메시지를 주고 원인은 로그에 남긴다.
        logger.warn("Login failed:", error);
        state.value = { pending: null, failed: loginId };
      }
    },

    logout() {
      storage.delete(LAST_LOGIN_ID);
      server.close();
      runtime.restart();
    },
  };
}
