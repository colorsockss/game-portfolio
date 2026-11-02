import { LOGIN_ID_LENGTH, isValidLoginId } from "@idle/game-core";
import { computed, signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import type { Account } from "../../application/account/account.js";
import type { AppState, EndReason } from "../../application/state/app-state.js";
import type { TextKey, Translate } from "../text.js";

/** 데이터와 액션으로 본 로그인 화면. 그것을 보여 주는 프리팹은 전혀 모른다. */
export interface LoginViewModel {
  /** 입력 중인 ID. 입력란과 양방향이라 뷰도 쓴다. */
  readonly loginId: Signal<string>;
  readonly canLogin: ReadonlySignal<boolean>;
  /** 플레이어에게 알릴 것: 진행, 마지막 실패, ID가 어떤 모양이어야 하는지, 또는 여기에 온 이유. */
  readonly status: ReadonlySignal<string>;
  login(): Promise<void>;
}

export interface LoginViewModelOptions {
  /** 앱 상태: 로그인의 진행(`login`)과 마지막 세션이 끝난 이유(`network`). */
  readonly state: AppState;
  /** 서버 없이도 뷰모델이 돌고 테스트할 수 있도록 받아 쓴다. */
  readonly account: Pick<Account, "login" | "lastLoginId">;
  readonly t: Translate;
}

const ENDED: { readonly [R in EndReason]: TextKey } = {
  replaced: "login.replaced",
  expired: "login.expired",
  error: "login.error",
  update: "login.update",
};

export function createLoginViewModel({ state, account, t }: LoginViewModelOptions): LoginViewModel {
  // 입력 중인 ID는 이 화면만의 것이고, 나머지는 앱의 것이다.
  const loginId = signal(account.lastLoginId());
  // 서버가 검사하는 것과 같은 규칙(game-core)이므로, 거절당할 수밖에 없는 ID는 보내지 않는다.
  const canLogin = computed(() => isValidLoginId(loginId.value) && state.login.value.pending === null);
  const status = computed(() => {
    const id = loginId.value;
    const { pending, failed } = state.login.value;
    if (pending !== null) return t("login.pending");
    // 다른 ID를 입력하면 실패가 저절로 사라진다.
    if (failed === id) return t("login.failed");
    if (id !== "" && !isValidLoginId(id)) return t("login.idRule", LOGIN_ID_LENGTH);
    const { ended } = state.network.value;
    return ended ? t(ENDED[ended]) : "";
  });

  return {
    loginId,
    canLogin,
    status,
    login: () => (canLogin.peek() ? account.login(loginId.peek()) : Promise.resolve()),
  };
}
