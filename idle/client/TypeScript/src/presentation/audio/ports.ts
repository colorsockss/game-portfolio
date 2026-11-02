// 오디오가 엔진에 바라는 것. Unity가 구현하고(unity/bridge.ts), 테스트는 TypeScript로 구현한다.
import type { AssetHandle } from "../ui/ports.js";

/** 엔진의 소리: 반복하는 BGM 하나와 겹쳐 나는 효과음. 볼륨은 0~1의 최종 값이다. */
export interface AudioBridge {
  /** 불러온 클립을 BGM으로 반복해서 튼다. 이미 그 클립이 돌고 있으면 처음으로 돌리지 않고 볼륨만 바꾼다. */
  playBgm(clip: AssetHandle, volume: number): void;
  setBgmVolume(volume: number): void;
  stopBgm(): void;
  /** 불러온 클립을 한 번 낸다. 앞의 효과음과 겹친다. */
  playSfx(clip: AssetHandle, volume: number): void;
}
