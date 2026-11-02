import type { Scope } from "../../application/scope.js";
import type { AssetHandle, ResourceBridge } from "./ports.js";

/**
 * 스코프(보통 화면의 스코프)를 대신해 에셋을 불러온다. 그 스코프를 위해 불러온 것은 스코프가
 * 닫힐 때 함께 해제되므로, 화면이 에셋을 남겨 둘 수 없다.
 */
export function createResources(bridge: Pick<ResourceBridge, "load">) {
  return {
    /** 불러오는 사이 스코프가 닫혔으면 에셋을 이미 해제한 채로 undefined로 이행한다. */
    async load(key: string, scope: Scope): Promise<AssetHandle | undefined> {
      const asset = await bridge.load(key);
      // 이미 닫힌 스코프에서는 즉시 해제된다.
      scope.add(() => asset.release());
      return scope.disposed ? undefined : asset;
    },
  };
}

export type Resources = ReturnType<typeof createResources>;
