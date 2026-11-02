import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import type { Scope } from "../application/scope.js";
import type { UpdateState } from "../application/update/update.js";
import type { Translate } from "./text.js";
import type { UiStack, View } from "./ui/ui-stack.js";

/**
 * 전환 화면: 앱 흐름의 상태가 바뀌는 동안과 부트의 패치 내내 화면 전체를 가리는 로딩 화면. 한 상태 안에서 서버를
 * 기다리는 로딩 표시(widgets/loading.ts, `network.waiting`)와 달리 상태 사이에만 있다.
 */
export interface TransitionViewModel {
  /** 가리면 true, 걷으면 false. 뷰가 페이드로 따라가고, 다 가면 `faded`를 부른다. */
  readonly covered: ReadonlySignal<boolean>;
  /** 무엇을 기다리는지. */
  readonly message: ReadonlySignal<string>;
  /** 업데이트를 받는 동안만 보이는 진행 막대와 그 비율(0~1). */
  readonly downloading: ReadonlySignal<boolean>;
  readonly progress: ReadonlySignal<number>;
  faded(): void;
}

export interface TransitionOptions {
  /** 패치의 진행(부트 프로그램). 없으면(게임) 늘 불러오는 중이라고 쓴다. */
  readonly update?: ReadonlySignal<UpdateState>;
  /** 가린 동안 탭과 뒤로 가기를 막는다. */
  readonly block: UiStack["block"];
  /**
   * 앞 상태가 놓은 에셋을 메모리에서 내린다(씬 정리). 한 씬 안에서 루트만 바꾸므로 씬 로드가 대신해 주지 않는다. 새
   * 화면이 준비되어 걷기 직전, 아직 다 가려 있을 때 부르므로 내리는 동안의 멈춤이 보이지 않는다.
   */
  readonly unloadUnused: () => void;
  readonly t: Translate;
}

export interface Transition {
  /** 다 걷혀 화면이 보이는지. 가리기 시작하면 곧바로 false다. 화면 위에 뜨는 튜토리얼이 이때만 보인다. */
  readonly clear: ReadonlySignal<boolean>;
  /** 앱 흐름의 `cover`: 지금 화면을 가리고, 다 가리면 `then`을 부른다. 이미 가렸으면 바로 부른다. */
  cover(then: () => void): void;
  /** `ready`가 이행하면 걷는다. 그 전에 `scope`가 닫혔거나 다음 상태로 가려고 가리는 중이면 걷지 않는다. */
  reveal(ready: PromiseLike<unknown>, scope: Scope): void;
  /** 전환 화면을 `owner`(앱의 수명)에 연다. 열지 못하면 페이드 없이 바로 가리고 걷는다. */
  open(show: UiStack["show"], view: View<TransitionViewModel>, owner: Scope): void;
  /**
   * 지금 바로 보이고 눌려야 하는 것(재시작을 묻는 팝업)이 있을 때 가린 것을 걷는다. 가리기를 기다리던 이동은 페이드 없이
   * 바로 보낸다. 다음 이동은 다시 가린다.
   */
  lift(): void;
}

export function createTransition({ update = NO_UPDATE, block, unloadUnused, t }: TransitionOptions): Transition {
  // 앱은 가린 채로 시작한다. 전환 화면의 프리팹도 불투명하다.
  const covered = signal(true);
  const clear = signal(false);
  // 뷰가 `covered`까지 다 갔는지.
  let settled = true;
  // 전환 화면을 열지 못해 페이드 없이 바로 바꾼다.
  let instant = false;
  // 다 가리기를 기다리는 이동.
  let waiting: (() => void)[] = [];
  let unblock: (() => void) | undefined = block();

  function settle(): void {
    settled = true;
    clear.value = !covered.value;
    if (covered.value) {
      const moves = waiting;
      waiting = [];
      for (const move of moves) move();
    } else {
      unblock?.();
      unblock = undefined;
    }
  }

  // 뷰는 `covered`가 바뀌는 그 자리에서 `faded`를 부를 수도 있으므로, 쓰기 전에 기다리는 상태로 둔다.
  function fadeTo(cover: boolean): void {
    if (covered.value === cover) return;
    settled = false;
    clear.value = false;
    if (cover) unblock ??= block();
    covered.value = cover;
    if (instant) settle();
  }

  const vm: TransitionViewModel = {
    covered,
    message: computed(() => {
      const { status, received, total } = update.value;
      if (status === "checking") return t("transition.checking");
      if (status === "downloading") return t("transition.downloading", { received: kilobytes(received), total: kilobytes(total) });
      if (status === "updated") return t("transition.applying");
      if (status === "failed") return t("transition.failed");
      if (status === "required") return t("transition.updateRequired");
      return t("transition.loading");
    }),
    downloading: computed(() => update.value.status === "downloading"),
    progress: computed(() => {
      const { received, total } = update.value;
      return total > 0 ? received / total : 0;
    }),
    faded: settle,
  };

  return {
    clear,
    cover(then) {
      if (covered.value && settled) return then();
      waiting.push(then);
      fadeTo(true);
    },
    reveal(ready, scope) {
      void ready.then(() => {
        if (scope.disposed || waiting.length > 0) return;
        unloadUnused();
        fadeTo(false);
      });
    },
    lift() {
      const moves = waiting;
      waiting = [];
      for (const move of moves) move();
      fadeTo(false);
    },
    open(show, view, owner) {
      void show(view, vm, owner).then(opened => {
        if (opened) return;
        instant = true;
        settle();
      });
    },
  };
}

const NO_UPDATE: ReadonlySignal<UpdateState> = signal({ status: "idle", received: 0, total: 0 });

function kilobytes(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KB`;
}
