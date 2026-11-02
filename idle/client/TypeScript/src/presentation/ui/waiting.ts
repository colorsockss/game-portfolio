import { computed } from "@preact/signals-core";
import type { AppState } from "../../application/state/app-state.js";

// 요청이 늦어지거나 연결이 돌아오는 동안(network.waiting)은 탭을 기다리게 해서, 응답하지 않는
// 서버에 플레이어가 커맨드를 쌓지 못하게 한다.
export function blockWhileWaiting(state: AppState, block: () => () => void): void {
  let unblock: (() => void) | undefined;
  computed(() => state.network.value.waiting).subscribe(waiting => {
    if (waiting) unblock ??= block();
    else {
      unblock?.();
      unblock = undefined;
    }
  });
}
