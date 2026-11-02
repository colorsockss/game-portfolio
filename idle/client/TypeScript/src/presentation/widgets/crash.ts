import type { AppRuntime, Logger } from "../../application/ports.js";
import type { Scope } from "../../application/scope.js";
import type { Translate } from "../text.js";
import type { UiStack, View } from "../ui/ui-stack.js";
import { confirm, type ConfirmViewModel } from "./confirm.js";

export interface CrashOptions {
  readonly show: UiStack["show"];
  /** 묻는 팝업. 공용 확인 팝업이다. */
  readonly view: View<ConfirmViewModel>;
  /** 팝업을 여는 스코프. 앱의 수명이다. */
  readonly scope: Scope;
  readonly runtime: AppRuntime;
  /** 묻는 말(crash.restart). */
  readonly t: Translate;
  readonly logger: Logger;
}

/**
 * 처리되지 않은 오류를 받는 함수: 로그에 남기고 재시작을 묻는 확인 팝업을 띄운다. 확인하면 스크립트 환경을 새로
 * 시작하고(상태가 남지 않는다), 취소하면 그대로 이어 간다. 묻는 동안 난 오류는 로그에만 남긴다.
 */
export function createCrashReporter({ show, view, scope, runtime, t, logger }: CrashOptions): (error: unknown) => void {
  let asking = false;
  return error => {
    logger.error("Uncaught:", error);
    if (asking) return;
    asking = true;
    void confirm(show, view, scope, t("crash.restart")).then(restart => {
      asking = false;
      if (restart) runtime.restart();
    });
  };
}
