// Bridge(composition.ts)의 Unity 쪽 구현. "csharp"를 import하는 파일은 unity/ 안의 파일뿐이다
// (scripts/check-boundaries.mjs가 검사한다).
import CS from "csharp";
import type { Bridge } from "../composition.js";
import { display, storage } from "./device.js";
import { createResourceBridge, type UnityAsset } from "./resources.js";
import { createSocketBridge } from "./socket.js";
import { createUiBridge } from "./ui.js";
import { createWorldBridge } from "./world.js";

export const unityBridge: Bridge = {
  // 빌드가 테이블 데이터를 진입 모듈 옆에 놓고, C#이 거기서부터 경로를 찾는다.
  file: { read: path => CS.PortfolioIdleRpg.Facades.FileFacade.Read(path) },
  socket: createSocketBridge(CS.PortfolioIdleRpg.Facades.WebSocketFacade),
  resources: createResourceBridge(CS.PortfolioIdleRpg.Facades.ResourceFacade),
  ui: createUiBridge(CS.PortfolioIdleRpg.Facades.UiFacade),
  world: createWorldBridge(CS.PortfolioIdleRpg.Facades.WorldFacade),
  // 클립은 ResourceFacade가 불러온 로드 id로 넘긴다.
  audio: {
    playBgm: (clip, volume) => CS.PortfolioIdleRpg.Facades.AudioFacade.PlayBgm((clip as UnityAsset).id, volume),
    setBgmVolume: volume => CS.PortfolioIdleRpg.Facades.AudioFacade.SetBgmVolume(volume),
    stopBgm: () => CS.PortfolioIdleRpg.Facades.AudioFacade.StopBgm(),
    playSfx: (clip, volume) => CS.PortfolioIdleRpg.Facades.AudioFacade.PlaySfx((clip as UnityAsset).id, volume),
  },
  storage,
  display,
  runtime: { restart: () => CS.PortfolioIdleRpg.Facades.RuntimeFacade.Restart() },
};
