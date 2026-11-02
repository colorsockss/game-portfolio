import { createScope, type Scope } from "../scope.js";

export interface FlowState<S extends string> {
  /** 이 상태에서 흐름이 옮겨 갈 수 있는 상태. 그 밖의 이동은 버그이며 throw한다. */
  readonly next: readonly S[];
  /**
   * 상태를 준비한다. `scope`에 등록한 것(화면, 구독, 타이머)은 흐름이 이 상태를 떠날 때 다음
   * 상태에 들어가기 전에 해제된다. `go`는 지금이든 나중이든 다음으로 넘어간다. 상태를 떠난
   * 뒤에는 그 상태의 `go`가 아무것도 하지 않고, 같은 상태에서 두 번째로 부른 `go`도 마찬가지다.
   */
  enter(scope: Scope, go: (next: S) => void): void;
}

export interface Flow<S extends string> {
  readonly current: S;
  /** 첫 상태에 들어간다. */
  start(): void;
}

export interface FlowOptions<S extends string> {
  readonly initial: S;
  readonly states: { readonly [K in S]: FlowState<S> };
  /** 흐름이 상태에 들어갈 때마다, 들어가면서 알린다. */
  readonly entered?: (state: S) => void;
}

/**
 * 상태가 스스로 뒷정리하는 상태 기계: 상태를 떠나면 그 상태에 들어올 때 받은 스코프를 해제한다.
 * 상태에 들어가거나 떠나는 중에 요청된 이동은 그것이 끝나기를 기다리므로, 다음 상태가 시작되기
 * 전에 한 상태는 언제나 완전히 준비되었거나 완전히 해제된 상태다.
 */
export function createFlow<S extends string>({ initial, states, entered }: FlowOptions<S>): Flow<S> {
  let current = initial;
  let scope: Scope | undefined;
  // 진입 횟수를 센다. 이미 떠난 상태가 요청한 이동을 가려낼 수 있다.
  let entry = 0;
  let moving = false;
  const queued: { readonly from: number; readonly next: S }[] = [];

  function enter(state: S): void {
    current = state;
    const mine = ++entry;
    scope = createScope();
    entered?.(state);
    states[state].enter(scope, next => {
      queued.push({ from: mine, next });
      if (!moving) drain();
    });
  }

  function drain(): void {
    moving = true;
    try {
      for (let move = queued.shift(); move !== undefined; move = queued.shift()) {
        if (move.from !== entry) continue;
        if (!states[current].next.includes(move.next)) {
          queued.length = 0;
          throw new Error(`The flow cannot go from ${current} to ${move.next}.`);
        }
        scope?.dispose();
        enter(move.next);
      }
    } finally {
      moving = false;
    }
  }

  return {
    get current() {
      return current;
    },
    start() {
      if (scope) throw new Error("The flow has already started.");
      moving = true;
      try {
        enter(initial);
      } finally {
        moving = false;
      }
      // 첫 상태가 들어가는 동안 요청한 이동을 처리한다.
      drain();
    },
  };
}
