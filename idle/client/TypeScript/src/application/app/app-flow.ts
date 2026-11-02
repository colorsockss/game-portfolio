import { isValidLoginId } from "@idle/game-core";
import { computed, type Signal } from "@preact/signals-core";
import type { Account } from "../account/account.js";
import type { Progress } from "../progress/progress.js";
import type { Scope } from "../scope.js";
import type { AppFlowState, AppState } from "../state/app-state.js";
import { createFlow, type Flow } from "./flow.js";

/**
 * 각 상태에서 보여 줄 것. createScreens가 구현한다. 상태의 스코프에서 열리므로 상태를 떠나면
 * 닫힌다: 화면이나 구독이 그것을 연 상태보다 오래 남지 않는다.
 */
export type Screens = { readonly [S in AppFlowState]?: (scope: Scope) => void };

export interface AppFlowOptions {
  /** 앱 전체 상태. 읽고 따라간다. */
  readonly state: AppState;
  /** 흐름 자신의 슬라이스. 앱 흐름이 유일한 쓰기 주체다. */
  readonly flow: Signal<AppFlowState>;
  /** 저장된 ID로 저절로 로그인한다. */
  readonly account: Pick<Account, "lastLoginId" | "login">;
  /** 세션이 끝나면 화면의 저장 데이터를 치운다. 앱 흐름은 플레이어를 직접 쓰지 않는다. */
  readonly progress: Pick<Progress, "clear">;
  /** Update 상태에 들어가면 부른다: 처음(부트 프로그램)부터 다시 시작해 패치를 받는다(update.ts의 requestUpdate). */
  readonly requestUpdate: () => void;
  readonly screens: Screens;
  /**
   * 상태를 바꾸기 전에 화면을 가린다(presentation의 전환 화면). 다 가리면 `then`을 부르고, 이미 가렸으면 바로 부른다.
   * 가린 것은 들어간 상태의 화면이 준비되면 화면 쪽이 걷는다. 없으면 바로 바꾼다.
   */
  readonly cover?: (then: () => void) => void;
}

/**
 * 게임의 흐름 boot → login → main. 패치는 그 앞의 부트 프로그램이 끝냈다. 앱 상태만으로 움직인다: 저장 데이터가 도착하면
 * 로그인한 것이고, 연결이 끝나면 세션이 끝난 것이다. 밖에서 `go`를 부르는 일이 없으므로 흐름이
 * 자기 상태와 어긋날 수 없다. 현재 상태는 앱 상태에 `flow`로 들어 있다.
 */
export function createAppFlow({ state, flow, account, progress, requestUpdate, screens, cover }: AppFlowOptions): Flow<AppFlowState> {
  // 상태의 일부를 지금 넘기고 바뀔 때마다 다시 넘겨 `act`를 부른다. 스코프가 해제될 때까지 한다.
  function follow<T>(scope: Scope, select: (state: AppState) => T, act: (value: T) => void): void {
    scope.add(computed(() => select(state)).subscribe(act));
  }

  // 화면을 다 가린 뒤에 상태를 떠난다. 가리는 동안 상태는 그대로이고, 그사이 같은 상태가 다시 부른 이동은 흐름이
  // 버린다(상태마다 첫 이동만 센다).
  function leave(go: (next: AppFlowState) => void): (next: AppFlowState) => void {
    return next => (cover ? cover(() => go(next)) : go(next));
  }

  return createFlow<AppFlowState>({
    initial: "boot",
    entered: entered => {
      flow.value = entered;
    },
    states: {
      // 서비스는 흐름이 시작되기 전에 만들어지고(startApp), 재시작하면 새 스크립트 환경에서
      // 여기서부터 다시 시작한다.
      boot: {
        next: ["login"],
        enter(scope, to) {
          screens.boot?.(scope);
          leave(to)("login");
        },
      },
      // 다른 프로토콜 버전을 쓰는 서버가 보내면 여기로 온다. 화면을 가린 채 처음부터 다시 시작해 부트가 새 번들을 받는다.
      update: {
        next: [],
        enter(scope) {
          screens.update?.(scope);
          requestUpdate();
        },
      },
      login: {
        next: ["main", "update"],
        enter(scope, to) {
          const go = leave(to);
          // 끝난 세션에서 남은 저장 데이터는 다시 보여 주지 않는다.
          progress.clear();
          screens.login?.(scope);
          follow(scope, state => state.player.value !== null, loggedIn => loggedIn && go("main"));
          follow(scope, state => state.network.value.ended, ended => ended === "update" && go("update"));
          // 저장된 ID가 있으면 시작하면서 저절로 로그인한다. 세션이 끝난 뒤에는 하지 않는다: 계정이
          // 다른 곳에서 로그인해서 끝난 경우 바로 다시 로그인하면 그쪽에서 계정을 빼앗게 된다.
          const saved = account.lastLoginId();
          if (state.network.value.ended === null && isValidLoginId(saved)) void account.login(saved);
        },
      },
      // 계정이 다른 곳에서 로그인하거나 연결이 끊긴 사이 만료되면 세션이 끝나고(login으로
      // 돌아가며, 이유는 network.ended에 있다), 서버가 더 새로운 클라이언트를 요구해도 끝난다.
      main: {
        next: ["login", "update"],
        enter(scope, to) {
          const go = leave(to);
          screens.main?.(scope);
          follow(scope, state => state.network.value.ended, ended => {
            if (ended === "update") go("update");
            else if (ended !== null) go("login");
          });
        },
      },
    },
  });
}
