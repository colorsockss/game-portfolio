import { signal, type ReadonlySignal } from "@preact/signals-core";
import type { Scope } from "../../application/scope.js";
import { popup, type UiStack, type View } from "../ui/ui-stack.js";

/** 확인 팝업: 묻는 말과 두 답. */
export interface ConfirmViewModel {
  readonly message: ReadonlySignal<string>;
  ok(): void;
  cancel(): void;
}

/**
 * `owner` 위에 확인 팝업을 열고 플레이어의 답으로 이행한다. 확인이면 true이고, 취소, 뒤로 가기, 답하기 전에
 * `owner`가 닫히거나 팝업이 열리지 않으면 false다. 답하면 팝업은 닫힌다.
 */
export async function confirm(
  show: UiStack["show"], view: View<ConfirmViewModel>, owner: Scope, message: string,
): Promise<boolean> {
  const answer = await popup(show, view, owner, (done: (yes: boolean) => void): ConfirmViewModel => ({
    message: signal(message), ok: () => done(true), cancel: () => done(false),
  }));
  return answer ?? false;
}

/** 알림 팝업: 알리는 말과 확인 하나. */
export interface NoticeViewModel {
  readonly message: ReadonlySignal<string>;
  ok(): void;
}

/** `owner` 위에 알림 팝업을 열고, 확인하거나 뒤로 가기로 닫히거나 `owner`가 닫히면(열리지 않아도) 이행한다. */
export async function notice(
  show: UiStack["show"], view: View<NoticeViewModel>, owner: Scope, message: string,
): Promise<void> {
  await popup(show, view, owner, (done: () => void): NoticeViewModel => ({ message: signal(message), ok: () => done() }));
}
