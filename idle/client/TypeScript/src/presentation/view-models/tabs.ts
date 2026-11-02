import { signal, type ReadonlySignal } from "@preact/signals-core";

/** 탭 하나: 보이는 이름과, 고르면 `selected`가 되는 값. */
export interface Tab<K> {
  readonly key: K;
  /** 지금 언어의 이름이라 언어가 바뀌면 바뀐다. */
  readonly label: ReadonlySignal<string>;
  /** 탭 위의 알림 뱃지(presentation/widgets/badge.ts). 없으면 뱃지를 보이지 않는다. */
  readonly badge?: ReadonlySignal<boolean>;
}

/**
 * 탭 막대. 탭의 수와 이름은 뷰모델이 정한다. 고른 탭은 입력란처럼 양방향이라서, 탭을 누르면 뷰가 `select`를 부르고
 * `selected`가 바뀌면 어디서 바꿨든 탭 막대가 따라간다. 고른 값을 어디에 둘지는 뷰모델이 정한다(화면의 신호, 설정 등).
 */
export interface Tabs<K> {
  readonly tabs: readonly Tab<K>[];
  readonly selected: ReadonlySignal<K>;
  select(key: K): void;
}

/** 고른 값을 화면이 쥐는 탭 막대. 처음에는 `first`를 고른다. */
export function localTabs<K>(tabs: readonly Tab<K>[], first: K): Tabs<K> {
  const selected = signal(first);
  return { tabs, selected, select: key => void (selected.value = key) };
}
