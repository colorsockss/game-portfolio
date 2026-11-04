import type { GameData } from "@idle/data-schema";
import { isStepDone, tutorialStep, waitsForTap } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { Logger } from "../../application/ports.js";
import type { Progress } from "../../application/progress/progress.js";
import type { Scope } from "../../application/scope.js";
import type { AppState } from "../../application/state/app-state.js";
import type { Translate } from "../text.js";
import type { ViewRoot } from "../ui/ports.js";
import type { ShownView } from "../ui/ui-stack.js";

/** 튜토리얼이 비추는 것: 열린 뷰의 인스턴스와 그 프리팹의 ViewRefs 항목 이름. 엔진의 뷰가 항목을 읽는다. */
export interface TutorialTarget {
  readonly root: ViewRoot;
  readonly name: string;
}

/**
 * 튜토리얼: 메인 화면 위의 대사 창과, 대상 밖의 탭을 막는 막. 스텝은 TutorialSteps 테이블이고, 진행은 서버에 저장한 지금
 * 스텝(PlayerState.tutorial)이다. 조건이 있는 스텝은 채우는 대로 저절로, 누름 스텝은 누르면 넘어간다.
 */
export interface TutorialViewModel {
  /** 지금 스텝이 있다(마치지 않았다). 이 동안 오버레이를 열어 둔다. */
  readonly running: ReadonlySignal<boolean>;
  /**
   * 대사 창을 보인다. 전환 화면이 다 걷히지 않았거나, 대상의 화면이 아닌 팝업(보상, 확인, 재시작을 묻는 팝업)이 맨 위에
   * 있으면 숨고 막지도 않는다. 그 팝업을 닫으면 다시 보인다.
   */
  readonly visible: ReadonlySignal<boolean>;
  /** 지금 스텝의 대사(지금 언어). */
  readonly text: ReadonlySignal<string>;
  /**
   * 비추는 대상. 대상 밖의 탭을 막는다. 대상의 화면이 열려 있지 않으면 그 화면을 여는 곳(스텝의 `opener`, 예: 재시작으로 장비
   * 팝업이 닫힌 채 돌아온 착용 스텝의 장비 버튼)을 비춘다. 보이지 않거나, 대상이 없거나, 둘 다 열려 있지 않으면 null.
   */
  readonly target: ReadonlySignal<TutorialTarget | null>;
  /** 화면 전체를 막고 어디든 누르면 넘어간다: 비출 대상이 없는(못 찾은) 누름 스텝. */
  readonly covering: ReadonlySignal<boolean>;
  /** 누름 스텝을 마친다. 화면이나 대상을 누를 때 뷰가 부르고, 조건을 기다리는 스텝에서는 아무것도 하지 않는다. */
  tap(): void;
}

export interface TutorialViewModelOptions {
  /** 저장 데이터의 튜토리얼과, 조건이 보는 클리어·레벨·착용. */
  readonly state: AppState;
  readonly data: GameData;
  readonly t: Translate;
  /** 보이는 전투의 레벨(스냅숏). */
  readonly battle: Pick<BattleService, "heroLevel">;
  /** 스텝을 마칠 때 보낸다. */
  readonly progress: Pick<Progress, "cmd">;
  /** 화면에 있는 뷰(UI 스택). 대상을 찾고 맨 위 팝업을 본다. */
  readonly shown: ReadonlySignal<readonly ShownView[]>;
  /** 전환 화면이 다 걷혔는지. */
  readonly clear: ReadonlySignal<boolean>;
  /** 화면 이름(Views의 키) → 그 뷰의 프리팹. 대상(`main.equipmentButton`)의 앞부분을 바꾼다. */
  readonly prefabs: Readonly<Record<string, string | undefined>>;
  readonly logger: Logger;
  /** 이 스코프가 닫힐 때까지 조건을 따라간다(메인 상태). */
  readonly owner: Scope;
}

export function createTutorialViewModel(
  { state, data, t, battle, progress, shown, clear, prefabs, logger, owner }: TutorialViewModelOptions,
): TutorialViewModel {
  const step = computed(() => {
    const save = state.player.value;
    return save ? tutorialStep(save, data) : undefined;
  });
  const tapping = computed(() => step.value !== undefined && waitsForTap(step.value));
  // 레벨은 메인 화면처럼 보이는 전투를 따른다. 커맨드가 정산한 뒤의 레벨은 보이는 것 이상이라 서버도 받아들인다.
  const level = battle.heroLevel;
  const done = computed(() => {
    const now = step.value;
    const save = state.player.value;
    if (now === undefined || save === null || waitsForTap(now)) return false;
    return isStepDone(now, { ...save, hero: { ...save.hero, level: level.value } });
  });
  // "main.equipmentButton" → 그 화면의 프리팹과 ViewRefs 항목 이름.
  function parse(target: string | null): { readonly prefab: string | undefined; readonly name: string } | null {
    if (target === null) return null;
    const dot = target.indexOf(".");
    return { prefab: prefabs[target.slice(0, dot)], name: target.slice(dot + 1) };
  }
  const aim = computed(() => parse(step.value?.target ?? null));
  const opener = computed(() => parse(step.value?.opener ?? null));
  const visible = computed(() => {
    if (step.value === undefined || !clear.value) return false;
    const top = topmost(shown.value, view => view.layer === "popup");
    return top === undefined || top.prefab === aim.value?.prefab;
  });
  // 같은 대상이면 같은 객체를 돌려줘서, 다른 뷰가 열리고 닫혀도 뷰가 다시 비추지 않는다.
  let aimed: TutorialTarget | null = null;
  const target = computed(() => {
    if (!visible.value) return (aimed = null);
    for (const wanted of [aim.value, opener.value]) {
      const open = wanted ? topmost(shown.value, view => view.prefab === wanted.prefab) : undefined;
      if (!open || !wanted) continue;
      if (aimed?.root !== open.root || aimed.name !== wanted.name) aimed = { root: open.root, name: wanted.name };
      return aimed;
    }
    return (aimed = null);
  });

  function advance(stepId: number): Promise<void> {
    return progress.cmd.TutorialAdvance({ stepId }).then(
      error => void (error && logger.warn(`Tutorial step ${stepId} was refused:`, error.message)),
      (error: unknown) => logger.warn(`Tutorial step ${stepId} did not reach the server:`, error),
    );
  }

  // 조건을 채우면 한 번 보낸다. 예측이 곧바로 다음 스텝으로 옮기고, 거절되면 그 스텝으로 돌아와 저장 데이터가 다음에 바뀔
  // 때 다시 본다(같은 저장 데이터로 거듭 보내지 않는다). 다른 커맨드의 예측이 저장 데이터를 바꾼 그 자리에서도 불리므로,
  // 그 커맨드가 먼저 나가도록 다음 마이크로태스크에서 다시 확인하고 보낸다(커맨드는 보낸 순서대로 처리된다).
  let sending: number | undefined;
  owner.add(computed(() => ({ ready: done.value ? step.value : undefined, save: state.player.value })).subscribe(({ ready }) => {
    if (ready === undefined || sending === ready.id) return;
    const id = (sending = ready.id);
    void Promise.resolve()
      .then(() => (owner.disposed || !done.value || step.value?.id !== id ? undefined : advance(id)))
      .finally(() => {
        if (sending === id) sending = undefined;
      });
  }));

  return {
    running: computed(() => step.value !== undefined),
    visible,
    text: computed(() => (step.value ? t(step.value.textKey) : "")),
    target,
    // 대상을 못 찾은 누름 스텝도 화면을 눌러 넘어가게 해서 막히지 않는다(뒤로 가기로 대상의 팝업을 닫은 경우 등).
    covering: computed(() => visible.value && tapping.value && target.value === null),
    tap() {
      const now = step.value;
      if (now !== undefined && waitsForTap(now)) void advance(now.id);
    },
  };
}

// 맞는 뷰 중 나중에 연 것(그 레이어에서 위에 있는 것).
function topmost(views: readonly ShownView[], match: (view: ShownView) => boolean): ShownView | undefined {
  for (let i = views.length - 1; i >= 0; i--) if (match(views[i])) return views[i];
  return undefined;
}
