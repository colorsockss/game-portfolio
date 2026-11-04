import type { BigLike } from "@idle/big-number";
import { Signal, type ReadonlySignal } from "@preact/signals-core";
import type { Listen } from "../../application/events.js";
import { createScope, scopedBy, type Scope } from "../../application/scope.js";
import { formatBig, rollFrames } from "../../presentation/format/big.js";
import type { TutorialTarget } from "../../presentation/view-models/tutorial.js";
import type { Tabs } from "../../presentation/view-models/tabs.js";
import { guarded } from "../uncaught.js";
import { viewRefs, type RefsSource } from "./refs.js";
import type {
  ActiveTarget,
  ButtonTarget,
  EventSource,
  FadeTarget,
  FillTarget,
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

// 각 바인딩은 대상에 값을 지금 한 번 넣고, 값이 바뀔 때만 다시 넣는다. 그래서 C#은 변경이 있을 때만
// 불리고 프레임마다 도는 것은 없다. 등록한 것은 모두 스코프에 들어간다.

/** 값을 지금 적용하고, 바뀔 때마다 다시 적용한다. `apply` 안에서 읽는 신호는 따라가지 않는다. */
/**
 * 바인딩할 값: 신호이거나, 바인딩하는 동안 바뀌지 않는 값. 목록의 칸은 원소가 바뀌면 다시 바인딩하므로 원소의 값 그대로면 된다.
 */
export type Value<T> = ReadonlySignal<T> | T;

/** 신호면 스코프가 해제될 때까지 값마다, 바뀌지 않는 값이면 한 번 `apply`를 부른다. */
export function bindValue<T>(scope: Scope, source: Value<T>, apply: (value: T) => void): void {
  if (source instanceof Signal) scope.add((source as ReadonlySignal<T>).subscribe(apply));
  else apply(source as T);
}

/** 스코프가 해제될 때까지 UnityEvent를 듣는다. 리스너가 던진 것은 C#으로 빠져나가지 않고 처리되지 않은 오류가 된다. */
export function listen<A extends unknown[]>(scope: Scope, event: EventSource<A>, call: (...args: A) => void): void {
  const listener = guarded(call);
  event.AddListener(listener);
  scope.add(() => event.RemoveListener(listener));
}

/**
 * 플레이어의 누름(버튼, 탭, 목록의 칸, 토글)을 듣는다. 누를 때마다 `pressed`(뷰 컨텍스트의 버튼 소리)를 먼저 부르므로,
 * 누름에 따르는 반응은 이 한 곳에서 난다.
 */
export function listenPress<A extends unknown[]>(
  scope: Scope, event: EventSource<A>, pressed: () => void, call: (...args: A) => void,
): void {
  listen(scope, event, (...args) => {
    pressed();
    call(...args);
  });
}

/** 글자를 보인다. 신호면 바뀔 때마다, 문자열이면(목록의 칸처럼 원소가 바뀌면 다시 바인딩하는 것) 한 번 넣는다. */
export function bindText(scope: Scope, target: TextTarget, source: Value<string>): void {
  bindValue(scope, source, text => (target.text = text));
}

export function bindActive(scope: Scope, target: ActiveTarget, source: Value<boolean>): void {
  bindValue(scope, source, active => target.SetActive(active));
}

export function bindInteractable(scope: Scope, target: ButtonTarget, source: Value<boolean>): void {
  bindValue(scope, source, interactable => (target.interactable = interactable));
}

export function bindClick(scope: Scope, target: ButtonTarget, pressed: () => void, action: () => void): void {
  listenPress(scope, target.onClick, pressed, action);
}

/**
 * 양방향 토글: 신호를 보이고, 플레이어가 바꾼 값으로 `set`을 부른다. 신호가 바뀌어 보이는 것은 onValueChanged를 내지
 * 않으므로(SetIsOnWithoutNotify) 되돌아오지 않는다.
 */
export function bindToggle(
  scope: Scope, target: ToggleTarget, source: ReadonlySignal<boolean>, pressed: () => void, set: (on: boolean) => void,
): void {
  bindValue(scope, source, on => target.SetIsOnWithoutNotify(on));
  listenPress(scope, target.onValueChanged, pressed, set);
}

/**
 * 양방향 슬라이더: 신호를 보이고, 끄는 동안의 값마다 `change`를, 놓을 때 그 값으로 `release`를 부른다(끄는 동안은 바로
 * 듣고 놓을 때 저장한다). 신호가 바뀌어 보이는 것은 onValueChanged를 내지 않는다(SetValueWithoutNotify).
 */
export function bindSlider(
  scope: Scope, target: SliderTarget, source: ReadonlySignal<number>,
  change: (value: number) => void, release: (value: number) => void,
): void {
  bindValue(scope, source, value => target.SetValueWithoutNotify(value));
  listen(scope, target.onValueChanged, change);
  listen(scope, target.Released, () => release(target.value));
}

/** 양방향: 플레이어가 입력한 것은 `source`에 쓰이고, 다른 곳에서 바뀐 값은 입력란에 보인다. */
export function bindInput(scope: Scope, target: InputTarget, source: Signal<string>): void {
  // Unity는 코드가 text를 바꿔도 onValueChanged를 낸다. 입력란이 이미 보여 주는 텍스트는 다시 쓰지
  // 않아서, 그 이벤트가 되돌아와 source를 다시 쓰거나 끝없이 도는 일이 없다.
  bindValue(scope, source, text => {
    if (target.text !== text) target.text = text;
  });
  listen(scope, target.onValueChanged, text => {
    source.value = text;
  });
}

/**
 * 목록의 칸마다 원소 하나를 `bindItem`으로 잇는다. 원소 수를 목록에 알리고, C#이 칸에 보일 원소를 알릴 때(`Shown`) 그 칸을
 * 원소에 다시 잇는다. 원소가 바뀌면 보이는 칸 중 원소가 바뀐 칸만 다시 잇는다. 같은 필드 값의 원소(얕게 같음)는 바뀌지 않은
 * 것으로 본다. 칸의 바인딩은 칸의 스코프에 있고, 칸이 다른 원소를 보이거나 숨거나 목록이 닫히면 해제된다.
 */
export function bindList<Item>(
  scope: Scope,
  target: ListTarget,
  source: Value<readonly Item[]>,
  bindItem: (scope: Scope, root: RefsSource, item: Item) => void,
): void {
  let items: readonly Item[] = [];
  const cells = new Map<number, { readonly root: RefsSource; readonly index: number; readonly item: Item; readonly scope: Scope }>();
  function show(slot: number, root: RefsSource, index: number): void {
    const cell = cells.get(slot);
    const item = items[index];
    if (cell && cell.index === index && shallowEqual(cell.item, item)) return;
    cell?.scope.dispose();
    cells.delete(slot);
    if (index < 0 || index >= items.length) return;
    const cellScope = createScope();
    cells.set(slot, { root, index, item, scope: cellScope });
    bindItem(cellScope, root, item);
  }
  scope.add(() => {
    for (const cell of cells.values()) cell.scope.dispose();
    cells.clear();
  });
  listen(scope, target.Shown, () => show(target.ShownSlot, target.ShownItem, target.ShownIndex));
  bindValue(scope, source, next => {
    const resized = next.length !== items.length;
    items = next;
    // ViewList는 늘어난 칸을 지금 알리고, ScrollList는 보이는 칸을 다음 그리기에서 알린다.
    if (resized) target.SetCount(next.length);
    for (const [slot, cell] of [...cells]) show(slot, cell.root, cell.index);
  });
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length
    && keys.every(key => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key]);
}

/**
 * 탭을 보이고 누른 탭을 고른다(`select`). `selected`가 다른 곳에서 바뀌어도 탭 막대가 따라간다. 뱃지가 있는 탭은 그
 * 탭의 뱃지를 켜고 끈다. 탭 틀에 뱃지가 없으면 던진다(화면이 열리지 않는다).
 */
export function bindTabBar<K>(scope: Scope, target: TabBarTarget, { tabs, selected, select }: Tabs<K>, pressed: () => void): void {
  target.SetCount(tabs.length);
  tabs.forEach(({ key, label, badge }, index) => {
    bindValue(scope, label, text => target.SetLabel(index, text));
    listenPress(scope, target.GetClickEvent(index), pressed, () => select(key));
    if (!badge) return;
    const dot = target.GetBadge(index);
    if (!dot) throw new Error(`The tab ${label.peek()} has no badge.`);
    bindActive(scope, dot, badge);
  });
  bindValue(scope, selected, key => target.Select(tabs.findIndex(tab => tab.key === key)));
}

/** 숫자가 바뀔 때 굴러가는 시간(초). */
const ROLL_SECONDS = 0.4;

/**
 * 큰 수를 formatBig 표기로 보인다. 처음 값은 바로 보이고, 바뀐 값은 앞의 값에서 굴러간다. 표기가 그대로면 C#을
 * 부르지 않는다. 굴러가는 중에 또 바뀌면 앞의 목표에서 다시 굴린다.
 */
export function bindBigNumber(scope: Scope, target: RollingTextTarget, source: ReadonlySignal<BigLike>): void {
  let shown: BigLike | undefined;
  bindValue(scope, source, value => {
    if (shown === undefined) {
      target.Set(formatBig(value));
    } else {
      const frames = rollFrames(shown, value);
      if (frames.length > 0) target.Roll(frames.join("\n"), ROLL_SECONDS);
    }
    shown = value;
  });
}

export function bindFill(scope: Scope, target: FillTarget, source: Value<number>): void {
  bindValue(scope, source, ratio => (target.fillAmount = ratio));
}

/** 가리는지에 따라 페이드하고, 페이드가 끝날 때마다 `faded`를 부른다. */
export function bindFade(scope: Scope, target: FadeTarget, covered: ReadonlySignal<boolean>, faded: () => void): void {
  listen(scope, target.Finished, faded);
  bindValue(scope, covered, value => target.FadeTo(value));
}

/** 알림이 날 때마다 토스트로 보인다. */
export function bindToast(scope: Scope, target: ToastTarget, source: Listen<string>): void {
  scope.add(source(text => target.Show(text)));
}

/**
 * 대상을 비춘다: 대상 뷰의 ViewRefs에서 그 이름의 항목을 읽어 Spotlight에 넘기고, 항목이 버튼이면 누를 때마다 `tapped`를
 * 부른다(버튼 자신의 동작도 그대로 돈다). 대상이 null이거나 항목이 없으면 걷는다.
 */
export function bindSpotlight(
  scope: Scope, target: SpotlightTarget, source: ReadonlySignal<TutorialTarget | null>, tapped: () => void,
): void {
  scopedBy(scope, source, (clicks, aimed) => {
    const object = aimed && viewRefs(aimed.root).GetObject(aimed.name);
    if (!object) return target.Clear();
    target.Focus(object);
    const { onClick } = object as Partial<ButtonTarget>;
    if (onClick) listen(clicks, onClick, tapped);
  });
}
