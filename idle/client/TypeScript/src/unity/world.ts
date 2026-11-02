import type CS from "csharp";
import type { ViewRoot } from "../presentation/ui/ports.js";
import type { WorldBridge } from "../presentation/world/ports.js";
import type { UnityAsset } from "./resources.js";

type Generated = typeof CS.PortfolioIdleRpg.Facades.WorldFacade;

/** C# WorldFacade 위에 만든 WorldBridge(presentation/world/ports.ts). 월드 루트와 카메라는 WorldFacade가 가진다. */
export function createWorldBridge(facade: Pick<Generated, "Create" | "SetActive" | "Destroy" | "Shake" | "HitStop">): WorldBridge {
  return {
    create(prefab) {
      const view = facade.Create((prefab as UnityAsset).id);
      // 파사드의 ViewRefs는 불투명한 ViewRoot로 오가고, 뷰가 viewRefs로 원래대로 돌린다(unity/ui.ts와 같다).
      return {
        root: view as unknown as ViewRoot,
        setActive: active => facade.SetActive(view, active),
        destroy: () => facade.Destroy(view),
      };
    },
    shake: (strength, seconds) => facade.Shake(strength, seconds),
    hitStop: seconds => facade.HitStop(seconds),
  };
}
