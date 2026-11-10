import type CS from "csharp";
import type { UiBridge, ViewRoot } from "../presentation/ui/ports.js";
import { createScope } from "../application/scope.js";
import { listen } from "./binding/bind.js";
import type { EventSource } from "./binding/components.js";
import { viewRefs, type RefsSource } from "./binding/refs.js";
import { EVERY_FRAME } from "./frame.js";
import type { UnityAsset } from "./resources.js";

type Generated = typeof CS.PortfolioIdleRpg.Facades.UiFacade;

/** 이 브리지가 쓰는 UiFacade의 부분. Create가 주는 ViewRefs는 ViewRoot로 넘기고 RefsSource로 읽는다(unity/binding/refs.ts). */
export interface UiFacade extends Pick<Generated, "Screen" | "Popup" | "Guide" | "Overlay" | "Debug" | "SetBlocking" | "BackPressed"> {
  Create(assetId: number, layer: number): RefsSource;
  /** 닫는 연출(PopupMotion)을 시작하고 돌려준다. 연출이 없거나 돌릴 수 없으면(첫 프레임 전이라 보인 것이 없음) null이다. */
  Close(view: RefsSource): object | null;
  Destroy(view: RefsSource): void;
}

/** 닫는 연출(idle/client/Assets/Scripts/Views/PopupMotion.cs). 다 사라지면 Finished가 난다. */
interface PopupMotionTarget {
  readonly Finished: EventSource;
}

/** C# UiFacade 위에 만든 UiBridge(presentation/ui/ports.ts). 캔버스와 그 레이어는 UiFacade가 가진다. */
export function createUiBridge(facade: UiFacade): UiBridge {
  const layers = { screen: facade.Screen, popup: facade.Popup, guide: facade.Guide, overlay: facade.Overlay, debug: facade.Debug };
  return {
    create(prefab, layer) {
      // 파사드의 ViewRefs는 불투명한 ViewRoot로 오가고, viewRefs가 여기와 뷰에서 그것을 원래대로 돌린다.
      const root = facade.Create((prefab as UnityAsset).id, layers[layer]) as unknown as ViewRoot;
      return {
        root,
        dismiss() {
          const motion = facade.Close(viewRefs(root)) as PopupMotionTarget | null;
          if (!motion) return undefined;
          return new Promise(resolve => {
            const waiting = createScope();
            listen(waiting, motion.Finished, () => {
              waiting.dispose();
              resolve();
            });
          });
        },
        destroy: () => facade.Destroy(viewRefs(root)),
      };
    },
    setBlocking: blocking => facade.SetBlocking(blocking),
    // C#이 현재 프레임의 키 입력을 읽어 주므로, 프레임마다 한 번 물으면 누름을 정확히 한 번씩 본다.
    onBack(handler) {
      const timer = setInterval(() => facade.BackPressed() && handler(), EVERY_FRAME);
      return () => clearInterval(timer);
    },
  };
}
