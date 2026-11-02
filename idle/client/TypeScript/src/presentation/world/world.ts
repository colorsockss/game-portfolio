import type { Scope } from "../../application/scope.js";
import type { AssetHandle } from "../ui/ports.js";
import type { Resources } from "../ui/resources.js";
import type { WorldBridge, WorldInstance } from "./ports.js";

export interface World {
  /**
   * `key`의 프리팹으로 인스턴스를 하나 만든다. 프리팹은 스코프와 키마다 한 번만 불러와 `scope`에
   * 묶고, 인스턴스는 `scope`가 닫힐 때 없어진다(먼저 없앤 것은 다시 없애지 않는다). 불러오는 사이
   * 스코프가 닫혔으면 undefined로 이행하고, 프리팹을 불러오지 못하면 reject한다.
   */
  spawn(key: string, scope: Scope): Promise<WorldInstance | undefined>;
  /** 월드 카메라를 흔든다(WorldBridge.shake). */
  shake(strength: number, seconds: number): void;
  /** 월드를 잠깐 멈춘다(WorldBridge.hitStop). */
  hitStop(seconds: number): void;
}

/** 전투 월드에 올라가는 뷰: 월드와 `VM`(전투는 연출자)을 받아 `scope`가 닫힐 때까지 연결한다. */
export interface WorldView<VM> {
  bind(scope: Scope, world: World, vm: VM): void;
}

export function createWorld({ bridge, resources }: { readonly bridge: WorldBridge; readonly resources: Resources }): World {
  // 스코프마다 키별 프리팹 로드. 스코프와 함께 사라진다.
  const prefabs = new WeakMap<Scope, Map<string, Promise<AssetHandle | undefined>>>();
  return {
    async spawn(key, scope) {
      let byKey = prefabs.get(scope);
      if (!byKey) prefabs.set(scope, (byKey = new Map()));
      let load = byKey.get(key);
      if (!load) byKey.set(key, (load = resources.load(key, scope)));
      const prefab = await load;
      if (!prefab || scope.disposed) return undefined;

      const instance = bridge.create(prefab);
      let destroyed = false;
      const owned: WorldInstance = {
        root: instance.root,
        setActive: active => instance.setActive(active),
        destroy() {
          if (destroyed) return;
          destroyed = true;
          instance.destroy();
        },
      };
      // 나중에 등록한 것부터 해제된다: 인스턴스가 없어지고, 그다음 프리팹이 해제된다.
      scope.add(owned.destroy);
      return owned;
    },
    shake: (strength, seconds) => bridge.shake(strength, seconds),
    hitStop: seconds => bridge.hitStop(seconds),
  };
}
