// 부트와 게임이 함께 쓰는 기기 포트의 Unity 쪽 구현.
import CS from "csharp";
import type { DeviceStorage, Display } from "../application/ports.js";

export const storage: DeviceStorage = {
  get: key => CS.PortfolioIdleRpg.Facades.StorageFacade.Get(key),
  set: (key, value) => CS.PortfolioIdleRpg.Facades.StorageFacade.Set(key, value),
  delete: key => CS.PortfolioIdleRpg.Facades.StorageFacade.Delete(key),
};

export const display: Display = {
  setFrameRate: frameRate => CS.PortfolioIdleRpg.Facades.DisplayFacade.SetFrameRate(frameRate),
  language: () => CS.PortfolioIdleRpg.Facades.DisplayFacade.Language,
};
