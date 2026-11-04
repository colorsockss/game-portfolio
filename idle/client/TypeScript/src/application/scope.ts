import type { ReadonlySignal } from "@preact/signals-core";

/**
 * 열린 뷰가 쥐고 있는 것: 신호 구독과 C# 이벤트에 넘긴 함수. 뷰를 닫으면 스코프를 해제해
 * 모두 놓으므로, C#이 뷰보다 오래 JS 함수를 쥐고 있지 않는다.
 */
export interface Scope {
  /** 스코프가 해제될 때 놓을 것을 등록한다(이미 해제되었으면 즉시 놓는다). */
  add(release: () => void): void;
  dispose(): void;
  /** 해제되었는지 여부. 늦게 끝난 작업은 버려야 한다. */
  readonly disposed: boolean;
}

export function createScope(): Scope {
  let releases: (() => void)[] | undefined = [];
  return {
    add(release) {
      if (releases) releases.push(release);
      else release();
    },
    get disposed() {
      return releases === undefined;
    },
    dispose() {
      const pending = releases ?? [];
      releases = undefined;
      // 가장 나중에 등록한 것부터: 준비한 순서의 역순이다.
      for (let i = pending.length - 1; i >= 0; i--) pending[i]();
    },
  };
}

/**
 * `source`의 값마다 자식 스코프를 열어 `enter`에 넘기고 앞 값의 스코프를 닫는다. 새 스코프를 먼저 열고 앞 것을 닫으므로 이어지는
 * 것(BGM)이 끊기지 않는다. `owner`가 해제되면 마지막 스코프도 닫는다.
 */
export function scopedBy<T>(owner: Scope, source: ReadonlySignal<T>, enter: (scope: Scope, value: T) => void): void {
  let current: Scope | undefined;
  owner.add(() => current?.dispose());
  owner.add(source.subscribe(value => {
    const next = createScope();
    enter(next, value);
    current?.dispose();
    current = next;
  }));
}
