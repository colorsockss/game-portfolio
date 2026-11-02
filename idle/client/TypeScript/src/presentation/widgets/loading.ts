import { computed, type ReadonlySignal } from "@preact/signals-core";
import { createScope, type Scope } from "../../application/scope.js";
import type { AppState } from "../../application/state/app-state.js";
import type { Translate } from "../text.js";
import type { UiStack, View } from "../ui/ui-stack.js";

/** 로딩 표시: 무엇을 기다리는지. */
export interface LoadingViewModel {
  readonly message: ReadonlySignal<string>;
}

export interface LoadingOptions {
  /** 기다리는 중인지(`network.waiting`)와 다시 연결하는 중인지를 읽는다. */
  readonly state: AppState;
  readonly show: UiStack["show"];
  readonly view: View<LoadingViewModel>;
  readonly t: Translate;
  /** 이 스코프가 닫힐 때까지 따라간다. */
  readonly owner: Scope;
}

/**
 * 요청이 오래 걸리거나 다시 연결하는 동안(`network.waiting`) 오버레이에 로딩 표시를 열고, 끝나면 닫는다. 그동안의
 * 입력 차단은 `blockWhileWaiting`이 한다.
 */
export function showWhileWaiting({ state, show, view, t, owner }: LoadingOptions): void {
  const vm: LoadingViewModel = {
    message: computed(() => t(state.network.value.status === "reconnecting" ? "loading.reconnecting" : "loading.waiting")),
  };
  let open: Scope | undefined;
  owner.add(() => open?.dispose());
  owner.add(computed(() => state.network.value.waiting).subscribe(waiting => {
    if (waiting && !open) {
      open = createScope();
      // 열리기 전에 기다림이 끝나면 스택이 그 뷰를 버린다.
      void show(view, vm, open);
    } else if (!waiting && open) {
      open.dispose();
      open = undefined;
    }
  }));
}
