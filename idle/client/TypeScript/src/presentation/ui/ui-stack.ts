import { signal, type ReadonlySignal } from "@preact/signals-core";
import { createScope, type Scope } from "../../application/scope.js";
import type { Translate } from "../text.js";
import type { UiBridge, UiLayer, ViewRoot } from "./ports.js";
import type { Resources } from "./resources.js";

export interface OpenOptions {
  /** 기본값은 "screen". */
  readonly layer?: UiLayer;
  /**
   * 이 뷰가 뒤로 가기를 받는 맨 위 뷰일 때 뒤로 가기 키가 하는 일. 팝업은 기본으로 닫히고, 화면은
   * 주어지지 않으면 아무것도 하지 않으며, 오버레이는 뒤로 가기를 받지 않는다.
   */
  readonly back?: () => void;
}

/** UI 스택이 뷰를 연결할 때 넘기는 것. 앱 내내 모든 뷰에 같고, 뷰모델이 아니라 UI 공통의 반응이다. */
export interface ViewContext {
  /** 플레이어가 무언가를 누를 때마다 부른다(버튼 소리). 버튼, 탭, 목록의 칸, 토글이 떼어서 부른다. */
  readonly pressed: () => void;
  /** 프리팹의 고정 글자(버튼 이름, 제목)를 지금 언어로 채운다. 언어가 바뀌면 다시 채운다(unity/binding/view.ts의 label). */
  readonly t: Translate;
}

/** 프리팹과 그것을 뷰모델에 연결하는 방법: unity/views/가 화면마다 정의하는 것. */
export interface View<VM> {
  /** 리소스 키(presentation/ui/resources.ts). */
  readonly prefab: string;
  /** 뷰가 놓이는 레이어. 프리팹이 레이어에 맞게 만들어지므로(팝업 틀, 탭을 받지 않는 오버레이) 여는 곳이 아니라 뷰가 정한다. */
  readonly layer: UiLayer;
  /** 프리팹의 `root`에서 뷰에 필요한 것을 읽어 `vm`에 연결한다. 모두 `scope`에 넣는다. */
  bind(scope: Scope, root: ViewRoot, vm: VM, context: ViewContext): void;
}

/** 열린 뷰: 프리팹의 인스턴스와, 뷰가 열려 있는 동안 사는 스코프. */
export interface OpenView {
  readonly root: ViewRoot;
  /** 바인딩은 여기에 넣는다. 뷰가 닫힐 때 해제된다. */
  readonly scope: Scope;
  close(): void;
}

/** 화면에 있는 뷰 하나: 어느 프리팹의 인스턴스가 어느 레이어에 있는지. */
export interface ShownView {
  readonly prefab: string;
  readonly layer: UiLayer;
  readonly root: ViewRoot;
}

interface Entry extends ShownView {
  readonly back?: () => void;
}

export interface UiStackOptions {
  readonly ui: UiBridge;
  readonly resources: Resources;
  /** 여는 뷰마다 넘긴다. */
  readonly context: ViewContext;
}

/**
 * 화면에 있는 뷰를 레이어별로 쥔다. 뷰는 오너 스코프(앱 흐름 상태의 스코프나 다른 뷰의 스코프)를
 * 위해 열리고 그것과 함께 닫히므로, 뷰가 자기를 연 것보다 오래 남지 않는다. 뷰를 불러오는 동안과
 * 무언가가 블록을 쥐고 있는 동안은 탭과 뒤로 가기 키가 아무것도 하지 않는다.
 */
export function createUiStack({ ui, resources, context }: UiStackOptions) {
  const entries: Entry[] = [];
  const shown = signal<readonly ShownView[]>([]);
  let blocks = 0;
  // 탭은 두고 뒤로 가기 키만 막는 것(튜토리얼)의 수.
  let backBlocks = 0;
  // 뒤로 가기 키는 그것을 받는 뷰가 있을 때만 듣는다.
  let listening: (() => void) | undefined;

  function block(): () => void {
    if (blocks++ === 0) ui.setBlocking(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--blocks === 0) ui.setBlocking(false);
    };
  }

  // 탭은 그대로 두고 뒤로 가기 키만 막는다. 돌려준 함수로 푼다.
  function blockBack(): () => void {
    backBlocks++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      backBlocks--;
    };
  }

  function back(): void {
    if (blocks > 0 || backBlocks > 0) return;
    (top("popup") ?? top("screen"))?.back?.();
  }

  function top(layer: UiLayer): Entry | undefined {
    for (let i = entries.length - 1; i >= 0; i--) if (entries[i].layer === layer) return entries[i];
    return undefined;
  }

  function track(entry: Entry): () => void {
    entries.push(entry);
    shown.value = [...entries];
    if (entry.back) listening ??= ui.onBack(back);
    return () => {
      entries.splice(entries.indexOf(entry), 1);
      shown.value = [...entries];
      if (listening && !entries.some(other => other.back)) {
        listening();
        listening = undefined;
      }
    };
  }

  /**
   * `prefab`을 불러와 그 레이어의 기존 뷰 위에 올린다. 준비되기 전에 `owner`가 닫혔으면 undefined로
   * 이행하고, 프리팹을 불러오지 못하면 reject한다.
   */
  async function open(prefab: string, owner: Scope, { layer = "screen", back }: OpenOptions = {}): Promise<OpenView | undefined> {
    const scope = createScope();
    owner.add(() => scope.dispose());
    const close = () => scope.dispose();
    // 프리팹과 그 인스턴스. 닫는 연출이 있으면 그것이 끝난 뒤에 해제하고, 그동안 입력을 막는다.
    const held = createScope();
    let dismiss = (): Promise<void> | undefined => undefined;
    scope.add(() => {
      const closing = dismiss();
      if (!closing) return held.dispose();
      const unblock = block();
      void closing.then(() => {
        held.dispose();
        unblock();
      });
    });
    const unblock = block();
    try {
      const asset = await resources.load(prefab, held);
      // 로드가 끝난 뒤 이 await이 이어지기 전에 닫혔을 수도 있다. 그때 에셋은 이미 해제됐다.
      if (!asset || scope.disposed) return undefined;
      // 나중에 등록한 것부터 해제된다: 뷰가 스택에서 빠지고, (닫는 연출이 끝나면) 파괴되고, 그다음 프리팹이 해제된다.
      const instance = ui.create(asset, layer);
      held.add(() => instance.destroy());
      dismiss = () => instance.dismiss();
      scope.add(track({ prefab, layer, root: instance.root, back: back ?? (layer === "popup" ? close : undefined) }));
      return { root: instance.root, scope, close };
    } catch (error) {
      close();
      throw error;
    } finally {
      unblock();
    }
  }

  /**
   * 뷰를 열고 `vm`에 연결한다. 바인딩은 뷰의 스코프에 있으므로 뷰가 닫히면 끝나고, 뷰와 맞지
   * 않는 프리팹은 다시 닫히고 reject한다.
   */
  async function show<VM>(
    view: View<VM>, vm: VM, owner: Scope, options?: Pick<OpenOptions, "back">,
  ): Promise<OpenView | undefined> {
    const opened = await open(view.prefab, owner, { ...options, layer: view.layer });
    try {
      if (opened) view.bind(opened.scope, opened.root, vm, context);
    } catch (error) {
      opened?.close();
      throw error;
    }
    return opened;
  }

  /**
   * `block`: 돌려준 함수를 부를 때까지 탭과 뒤로 가기 키가 기다린다. 블록은 누적된다. `shown`: 화면에 있는 뷰를 연 순서로
   * (레이어마다 나중 것이 위다). 튜토리얼이 비출 대상을 찾는다.
   */
  return { open, show, block, blockBack, shown: shown as ReadonlySignal<readonly ShownView[]> };
}

export type UiStack = ReturnType<typeof createUiStack>;

/**
 * 팝업 하나를 `owner` 위에 열고, 닫히면 그 결과로 이행한다. `create`가 받는 `done(result)`가 팝업을 닫는다. 닫기 버튼(결과
 * 없이 `done()`), 뒤로 가기, 답하기 전에 `owner`가 닫히는 것, 열리지 않는 것은 undefined로 이행한다.
 */
export function popup<VM, R = void>(
  show: UiStack["show"], view: View<VM>, owner: Scope, create: (done: (result?: R) => void) => VM,
): Promise<R | undefined> {
  return new Promise(resolve => {
    let opened: OpenView | undefined;
    let finished = false;
    const done = (result?: R) => {
      if (finished) return;
      finished = true;
      resolve(result);
      opened?.close();
    };
    show(view, create(done), owner).then(
      shown => {
        if (!shown) return done();
        if (finished) return shown.close();
        opened = shown;
        shown.scope.add(() => done());
      },
      () => done(),
    );
  });
}
