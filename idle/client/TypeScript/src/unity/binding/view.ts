import type { BigLike } from "@idle/big-number";
import { computed, signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import type { Listen } from "../../application/events.js";
import type { Scope } from "../../application/scope.js";
import type { TextKey } from "../../presentation/text.js";
import type { UiLayer, ViewRoot } from "../../presentation/ui/ports.js";
import type { View, ViewContext } from "../../presentation/ui/ui-stack.js";
import type { Tabs } from "../../presentation/view-models/tabs.js";
import type { TutorialTarget } from "../../presentation/view-models/tutorial.js";
import {
  bindActive,
  bindBigNumber,
  bindClick,
  bindFade,
  bindFill,
  bindInput,
  bindInteractable,
  bindList,
  bindSlider,
  bindSpotlight,
  bindTabBar,
  bindText,
  bindToast,
  bindToggle,
} from "./bind.js";
import type {
  ActiveTarget,
  ButtonTarget,
  FadeTarget,
  FillTarget,
  IconTarget,
  InputTarget,
  ListTarget,
  RollingTextTarget,
  SliderTarget,
  SpotlightTarget,
  TabBarTarget,
  TextTarget,
  ToastTarget,
  ToggleTarget,
} from "./components.js";
import { Kind, readRefs, viewRefs } from "./refs.js";

/** 뷰모델의 값 하나를 ViewRefs 항목 하나(Unity 객체)에 잇는 표의 칸. */
export interface Binder<VM> {
  /** 이 바인더가 읽는 ViewRefs 항목의 종류. */
  readonly kind: Kind;
  /** 뷰를 열 때 한 번 불린다. 등록하는 것은 모두 `scope`에 넣는다. */
  bind(scope: Scope, target: unknown, vm: VM, context: ViewContext): void;
}

/**
 * 목록의 칸 하나를 바인딩하는 표. 표의 이름이 칸의 ViewRefs 항목 이름이고(`view`와 같다), 칸은 목록이 만들므로 프리팹이 없다.
 */
export function row<Item>(bindings: Readonly<Record<string, Binder<Item>>>): Pick<View<Item>, "bind"> {
  return { bind: bindTable(bindings) };
}

// 바인딩 표를 뷰의 bind로 만든다. 열 때 항목을 한꺼번에 읽으므로(`readRefs`), 프리팹과 어긋나면 그 순간 모두 보고하며 실패한다.
function bindTable<VM>(bindings: Readonly<Record<string, Binder<VM>>>): View<VM>["bind"] {
  const declared = Object.fromEntries(Object.entries(bindings).map(([name, { kind }]) => [name, { kind }]));
  return (scope, root, vm, context) => {
    const refs = readRefs(viewRefs(root), declared);
    for (const [name, binder] of Object.entries(bindings)) binder.bind(scope, refs[name], vm, context);
  };
}

/**
 * 프리팹과 바인딩 표로 뷰를 만든다. 표의 이름이 ViewRefs 항목 이름이고, 바인더가 항목의 종류를
 * 정한다. 열 때 항목을 한꺼번에 읽으므로(`readRefs`), 프리팹과 어긋나면 그 순간 모두 보고하며 실패한다.
 * `layer`는 프리팹이 만들어진 레이어다(팝업 틀이 있으면 "popup").
 */
export function view<VM>(prefab: string, bindings: Readonly<Record<string, Binder<VM>>>, layer: UiLayer = "screen"): View<VM> {
  return { prefab, layer, bind: bindTable(bindings) };
}

/** 문자열 신호(목록의 칸이면 문자열)를 텍스트 컴포넌트에 보인다. */
export function text<VM>(get: (vm: VM) => ReadonlySignal<string> | string): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindText(scope, target as TextTarget, get(vm)) };
}

/** 아이콘 이름(Items.icon)의 그림을 아이콘 칸(IconView)에 보인다. 빈 이름이면 칸이 숨는다. */
export function icon<VM>(get: (vm: VM) => string): Binder<VM> {
  return { kind: Kind.Object, bind: (_scope, target, vm) => (target as IconTarget).Show(get(vm)) };
}

/**
 * 프리팹의 고정 글자(버튼 이름, 제목, 입력란의 안내)를 키의 문장으로 채우고, 언어가 바뀌면 다시 채운다. 프리팹은 글자를
 * 비워 두고 그 텍스트 컴포넌트를 ViewRefs 항목(`…Label`)으로 내놓는다. 뷰모델은 쓰지 않는다.
 */
export function label<VM>(key: TextKey): Binder<VM> {
  return {
    kind: Kind.Object,
    bind: (scope, target, _vm, { t }) => bindText(scope, target as TextTarget, computed(() => t(key))),
  };
}

/**
 * 누를 때마다 버튼 소리를 내고(뷰 컨텍스트의 `pressed`) `click(vm)`을 부른다(돌려준 Promise는 버린다). `enabled`는 버튼의
 * interactable을, `visible`은 버튼의 gameObject를 켜고 끈다.
 */
export function button<VM>(
  click: (vm: VM) => unknown,
  options: {
    readonly enabled?: (vm: VM) => ReadonlySignal<boolean>;
    readonly visible?: (vm: VM) => ReadonlySignal<boolean>;
  } = {},
): Binder<VM> {
  return {
    kind: Kind.Object,
    bind(scope, target, vm, context) {
      const component = target as ButtonTarget;
      if (options.enabled) bindInteractable(scope, component, options.enabled(vm));
      if (options.visible) bindActive(scope, component.gameObject, options.visible(vm));
      bindClick(scope, component, context.pressed, () => void click(vm));
    },
  };
}

/** 양방향: 입력란에 보이고, 플레이어가 입력한 것은 신호에 쓰인다. */
export function input<VM>(get: (vm: VM) => Signal<string>): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindInput(scope, target as InputTarget, get(vm)) };
}

/** 양방향 토글(Toggle): 불리언 신호를 보이고, 플레이어가 바꾸면 버튼 소리를 내고 `set(vm, on)`을 부른다. */
export function toggle<VM>(get: (vm: VM) => ReadonlySignal<boolean>, set: (vm: VM, on: boolean) => void): Binder<VM> {
  return {
    kind: Kind.Object,
    bind: (scope, target, vm, context) => bindToggle(scope, target as ToggleTarget, get(vm), context.pressed, on => set(vm, on)),
  };
}

/**
 * 양방향 슬라이더(ReleaseSlider): 0~1의 신호를 보이고, 끄는 동안의 값마다 `change(vm, value)`를, 놓을 때 `release(vm,
 * value)`를 부른다.
 */
export function slider<VM>(
  get: (vm: VM) => ReadonlySignal<number>,
  change: (vm: VM, value: number) => void,
  release: (vm: VM, value: number) => void,
): Binder<VM> {
  return {
    kind: Kind.Object,
    bind: (scope, target, vm) =>
      bindSlider(scope, target as SliderTarget, get(vm), value => change(vm, value), value => release(vm, value)),
  };
}

/** 불리언 신호로 오브젝트를 보이고 숨긴다. 알림 뱃지(presentation/widgets/badge.ts)도 이것으로 켜고 끈다. */
export function active<VM>(get: (vm: VM) => ReadonlySignal<boolean>): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindActive(scope, target as ActiveTarget, get(vm)) };
}

/** 탭 막대(TabBar)에 탭과 탭의 뱃지를 보이고, 누르면 버튼 소리를 내고 그 탭을 고른다. */
export function tabBar<VM, K>(get: (vm: VM) => Tabs<K>): Binder<VM> {
  return {
    kind: Kind.Object,
    bind: (scope, target, vm, context) => bindTabBar(scope, target as TabBarTarget, get(vm), context.pressed),
  };
}

/** 큰 수를 RollingText에 보인다: 표기는 formatBig이고, 바뀌면 굴러간다(공용 위젯의 큰 수 텍스트와 숫자 롤링). */
export function bigNumber<VM>(get: (vm: VM) => ReadonlySignal<BigLike>): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindBigNumber(scope, target as RollingTextTarget, get(vm)) };
}

/** 0~1의 비율로 Filled Image를 채운다(경험치 막대). */
export function fill<VM>(get: (vm: VM) => ReadonlySignal<number>): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindFill(scope, target as FillTarget, get(vm)) };
}

/** 불리언 신호로 화면을 가리거나 걷고(Fade), 페이드가 끝날 때마다 `faded(vm)`을 부른다. */
export function fade<VM>(get: (vm: VM) => ReadonlySignal<boolean>, faded: (vm: VM) => void): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindFade(scope, target as FadeTarget, get(vm), () => faded(vm)) };
}

/** 튜토리얼의 대상을 Spotlight로 비추고, 대상이 버튼이면 누를 때마다 `tapped(vm)`을 부른다. */
export function spotlight<VM>(get: (vm: VM) => ReadonlySignal<TutorialTarget | null>, tapped: (vm: VM) => void): Binder<VM> {
  return {
    kind: Kind.Object,
    bind: (scope, target, vm) => bindSpotlight(scope, target as SpotlightTarget, get(vm), () => tapped(vm)),
  };
}

/** 알림의 흐름을 Toast에 보인다. */
export function toast<VM>(get: (vm: VM) => Listen<string>): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm) => bindToast(scope, target as ToastTarget, get(vm)) };
}

/**
 * 중첩 프리팹(루트에 ViewRefs가 있는 자식)을 그 위젯의 뷰로 바인딩한다. 항목은 그 ViewRefs이고, 위젯 뷰의 프리팹
 * 키는 쓰지 않는다. 위젯의 항목도 화면을 열 때 함께 검사한다.
 */
export function nested<VM, Child>(child: View<Child>, get: (vm: VM) => Child): Binder<VM> {
  return { kind: Kind.Object, bind: (scope, target, vm, context) => child.bind(scope, target as ViewRoot, get(vm), context) };
}

/**
 * 목록(ViewList, ScrollList)의 칸마다 원소 하나를 `row`(칸의 바인딩 표, `row()`나 위젯의 `view()`)로 바인딩한다. 원소는
 * 신호(바뀌면 바뀐 칸만 다시 바인딩)나 화면이 열려 있는 동안 바뀌지 않는 배열(예: 테이블에서 정한 재화 목록)이다. 칸의
 * 항목은 칸을 보일 때 읽으므로, 칸과 어긋난 표는 그때 처리되지 않은 오류가 된다.
 */
export function list<VM, Item>(
  get: (vm: VM) => ReadonlySignal<readonly Item[]> | readonly Item[],
  row: Pick<View<Item>, "bind">,
): Binder<VM> {
  return {
    kind: Kind.Object,
    bind(scope, target, vm, context) {
      const items = get(vm);
      const source = Array.isArray(items) ? signal(items as readonly Item[]) : (items as ReadonlySignal<readonly Item[]>);
      bindList(scope, target as ListTarget, source, (cell, root, item) => row.bind(cell, root as unknown as ViewRoot, item, context));
    },
  };
}
