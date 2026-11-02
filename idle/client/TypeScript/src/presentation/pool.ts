import type { Scope } from "../application/scope.js";

/** 풀이 엔진에 맡기는 일: 만들기, 켜고 끄기, 없애기. 풀 자체는 엔진을 모른다. */
export interface PoolHooks<T> {
  create(): Promise<T>;
  activate(item: T, active: boolean): void;
  destroy(item: T): void;
}

/** 쓰고 난 것을 비활성으로 두었다가 다시 꺼내 쓰는 풀. */
export interface Pool<T> {
  /** 비었으면 새로 만든다. 만드는 사이 스코프가 닫혔으면 그것을 없애고 undefined로 이행한다. */
  acquire(): Promise<T | undefined>;
  /** 돌려놓는다. 이미 돌려놓았거나 이 풀이 만들지 않았거나 이미 없앤 것은 무시한다. */
  release(item: T): void;
}

/** 스코프가 닫히면 만든 모든 것(쓰는 중인 것 포함)을 한 번씩 없앤다. */
export function createPool<T>(scope: Scope, hooks: PoolHooks<T>): Pool<T> {
  const made = new Set<T>();
  const idle = new Set<T>();
  scope.add(() => {
    idle.clear();
    for (const item of made) hooks.destroy(item);
    made.clear();
  });
  return {
    async acquire() {
      if (scope.disposed) return undefined;
      let item: T;
      const reusable = idle.values().next();
      if (!reusable.done) {
        item = reusable.value;
        idle.delete(item);
      } else {
        item = await hooks.create();
        // 만드는 사이 닫혔으면 스코프가 이 항목을 모른다.
        if (scope.disposed) {
          hooks.destroy(item);
          return undefined;
        }
        made.add(item);
      }
      hooks.activate(item, true);
      return item;
    },
    release(item) {
      if (!made.has(item) || idle.has(item)) return;
      hooks.activate(item, false);
      idle.add(item);
    },
  };
}
