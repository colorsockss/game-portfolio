// 전투 월드가 엔진에 바라는 것: 불러온 프리팹의 인스턴스를 월드에 만들고, 보이고 숨기고, 없애는 일과 카메라의 타격감.
// UI의 UiBridge(presentation/ui/ports.ts)와 같은 자리이고, Unity가 구현한다(unity/world.ts).
import type { AssetHandle, ViewRoot } from "../ui/ports.js";

/** 프리팹이 월드에서 만든 인스턴스. 엔진의 뷰 코드만 `root`를 읽는다. */
export interface WorldInstance {
  readonly root: ViewRoot;
  /** 인스턴스를 보이거나 숨긴다. 풀이 쉬는 인스턴스를 숨겨 둘 때 쓴다. */
  setActive(active: boolean): void;
  destroy(): void;
}

export interface WorldBridge {
  /** 불러온 프리팹의 새 인스턴스를 월드에 올린다. */
  create(prefab: AssetHandle): WorldInstance;
  /** 월드 카메라를 `seconds`초 동안 흔든다. 처음 크기 `strength`(유닛)가 0까지 줄어든다. 흔들리는 중이면 더 센 것만 받는다. */
  shake(strength: number, seconds: number): void;
  /** 월드를 `seconds`초 동안 멈춘다(히트스톱). 멈춘 동안과 멈춤이 끝난 직후의 것은 엔진이 거른다. */
  hitStop(seconds: number): void;
}
