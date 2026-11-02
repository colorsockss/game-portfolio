import strings from "@idle/data-schema/data/Strings.bytes";
import CS from "csharp";
import puer from "puerts";
import { parseAppConfig } from "../application/app/config.js";
import { runBoot, type BootBridge, type BootConfig } from "../composition.js";
import { createBundleStore } from "./bundle.js";
import { display, storage } from "./device.js";
import { createResourceBridge } from "./resources.js";
import { createUiBridge } from "./ui.js";
import { catchUncaught } from "./uncaught.js";
import { noticeView } from "./views/notice.js";
import { transitionView } from "./views/transition.js";

const bridge: BootBridge = {
  resources: createResourceBridge(CS.PortfolioIdleRpg.Facades.ResourceFacade),
  ui: createUiBridge(CS.PortfolioIdleRpg.Facades.UiFacade),
  storage,
  display,
  bundle: createBundleStore(CS.PortfolioIdleRpg.Facades.BundleFacade),
  startGame: () => CS.PortfolioIdleRpg.Facades.RuntimeFacade.StartGame(),
};

/** Unity에서 부트 프로그램을 돌린다: 패치 화면을 띄우고 게임 번들을 맞춘 뒤 게임 프로그램으로 넘어간다. */
export async function boot(): Promise<void> {
  catchUncaught(puer, globalThis, error => console.error("[TypeScript] Uncaught:", error));
  // 패치는 앱 설정의 버킷(로컬은 `npm run serve:bundle -w @idle/client`, Live는 VPS)에서 이 앱의 API 채널로 받는다. 개발
  // 빌드는 패치하지 않고 에디터의 로컬 출력으로 게임을 시작한다.
  const { patch } = parseAppConfig(CS.PortfolioIdleRpg.Facades.RuntimeFacade.Config());
  const config: BootConfig = { mode: BUILD_MODE, api: RUNTIME_API, patch: BUILD_MODE === "release" ? patch : undefined };
  // 게임이 에셋 번들을 받는 주소도 이것이다. 패치를 확인하지 못해도 게임이 캐시의 에셋 번들을 찾도록 먼저 넣는다.
  if (config.patch !== undefined) CS.PortfolioIdleRpg.Facades.BundleFacade.UseSource(config.patch);
  return runBoot(bridge, config, strings, { transition: transitionView, notice: noticeView });
}
