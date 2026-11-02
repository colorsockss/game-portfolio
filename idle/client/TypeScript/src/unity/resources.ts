import type CS from "csharp";
import type { AssetHandle, ResourceBridge } from "../presentation/ui/ports.js";
import { EVERY_FRAME } from "./frame.js";

export type ResourceFacade = Pick<typeof CS.PortfolioIdleRpg.Facades.ResourceFacade, "Loading" | "Loaded" | "Load" | "Poll" | "Release" | "UnloadUnused">;

/** 불러온 에셋. C#은 id로 알고 있고, UiFacade가 그 id로 프리팹을 인스턴스화한다. */
export interface UnityAsset extends AssetHandle {
  readonly id: number;
}

/**
 * C# ResourceFacade 위에 만든 ResourceBridge(presentation/ui/ports.ts). C#이 백그라운드에서 불러오고,
 * 불러오는 것이 하나라도 있는 동안은 매 프레임 C#에 각 로드가 어떻게 되어 가는지 묻는다.
 */
export function createResourceBridge(facade: ResourceFacade): ResourceBridge {
  const loading = new Map<number, { readonly key: string; resolve(asset: UnityAsset): void; reject(error: Error): void }>();
  let polling: ReturnType<typeof setInterval> | undefined;

  function poll(): void {
    for (const [id, load] of loading) {
      const state = facade.Poll(id);
      if (state === facade.Loading) continue;
      loading.delete(id);
      if (state === facade.Loaded) {
        let released = false;
        load.resolve({ id, release: () => void (released || ((released = true), facade.Release(id))) });
      } else {
        facade.Release(id);
        load.reject(new Error(`There is no asset at ${load.key}.`));
      }
    }
    if (loading.size === 0) {
      clearInterval(polling);
      polling = undefined;
    }
  }

  return {
    load(key) {
      const id = facade.Load(key);
      return new Promise((resolve, reject) => {
        loading.set(id, { key, resolve, reject });
        polling ??= setInterval(poll, EVERY_FRAME);
      });
    },
    unloadUnused: () => facade.UnloadUnused(),
  };
}
