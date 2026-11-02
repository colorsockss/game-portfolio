import type { PlayerState } from "@idle/game-core";
import { signal, type ReadonlySignal, type Signal } from "@preact/signals-core";

/** 앱 상태의 값. 슬라이스마다 신호 하나가 이 값 하나를 쥔다. */
export interface AppStateValues {
  /** 앱이 흐름의 어디에 있는지(application/app/app-flow.ts). */
  readonly flow: AppFlowState;
  /** 화면에 있는 저장 데이터: 서버의 사본에 이 클라이언트의 답 받지 못한 커맨드를 적용한 것. */
  readonly player: PlayerState | null;
  readonly network: NetworkState;
  readonly login: LoginState;
}

/** 읽는 쪽이 받는 앱 상태: 슬라이스마다 읽고 따라가기만 하고 쓰지는 못한다. */
export type AppState = { readonly [K in keyof AppStateValues]: ReadonlySignal<AppStateValues[K]> };

/** 쓰기 가능한 앱 상태. composition만 쥐고, 슬라이스마다 쓰는 쪽에 그 신호를 넘긴다. */
export type WritableAppState = { readonly [K in keyof AppStateValues]: Signal<AppStateValues[K]> };

/** 로그인의 진행 상태. 계정(application/account/account.ts)이 유일한 쓰기 주체다. */
export interface LoginState {
  /** 로그인이 진행 중일 때, 그 로그인의 ID. */
  readonly pending: string | null;
  /** 마지막 로그인이 실패한 ID. 다음 로그인이 시작될 때까지 남는다. */
  readonly failed: string | null;
}

/**
 * boot: 시작하는 중. update: 서버가 새 클라이언트를 요구해 패치를 받으러 부트 프로그램으로 돌아가는 중.
 * login: 세션 없음, 로그인 화면. main: 로그인해서 플레이 중.
 */
export type AppFlowState = "boot" | "update" | "login" | "main";

/**
 * offline: 연결하지 않고 시도도 하지 않음. connecting: 첫 소켓을 여는 중. online: 요청이 나감.
 * reconnecting: 연결이 끊겨 세션과 함께 되살리는 중. ended: 저절로는 돌아오지 않음(EndReason 참고).
 */
export type NetworkStatus = "offline" | "connecting" | "online" | "reconnecting" | "ended";

/**
 * 연결이 끝난 이유. update: 서버가 다른 프로토콜 버전을 쓴다. replaced: 계정이 다른 곳에서
 * 로그인했다. expired: 연결이 끊긴 사이 세션이 만료되었다. error: 서버가 메시지를 잘못된
 * 형식이라며 거절했고, 다시 시도해도 고쳐지지 않는다.
 */
export type EndReason = "update" | "replaced" | "expired" | "error";

export interface NetworkState {
  readonly status: NetworkStatus;
  /** 상태가 "ended"인 동안 설정된다. */
  readonly ended: EndReason | null;
  /** 요청이 충분히 오래 기다렸거나 연결이 돌아오는 중: 게임이 바쁘다는 것을 보여 준다. */
  readonly waiting: boolean;
}

export const initialAppState: AppStateValues = {
  flow: "boot",
  player: null,
  network: { status: "offline", ended: null, waiting: false },
  login: { pending: null, failed: null },
};

/** `initial`로 덮은 처음 값에서 시작하는 앱 상태. */
export function createAppState(initial: Partial<AppStateValues> = {}): WritableAppState {
  const values = { ...initialAppState, ...initial };
  return {
    flow: signal(values.flow),
    player: signal(values.player),
    network: signal(values.network),
    login: signal(values.login),
  };
}
