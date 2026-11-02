import CS from "csharp";
import puer from "puerts";
import { parseAppConfig } from "../application/app/config.js";
import { startApp, type App, type ClientConfig } from "../composition.js";
import { unityBridge } from "./bridge.js";
import { catchUncaught } from "./uncaught.js";
import { views } from "./views/index.js";

/** Unity에서 게임을 시작한다: Unity 브리지로 앱을 만들고 그 흐름을 시작한다. 부트 프로그램이 패치를 끝낸 뒤에 돈다. */
export async function runGame(): Promise<void> {
  let app: App | undefined;
  // 앱이 서기 전의 오류는 Console에만 남긴다(부팅 실패는 main.ts가 남긴다).
  catchUncaught(puer, globalThis, error => (app ? app.crash(error) : console.error("[TypeScript] Uncaught:", error)));
  // 서버는 앱 설정에서 읽는다. 모드는 번들의 빌드 모드다(tools/build.mjs).
  const { environment, server } = parseAppConfig(CS.PortfolioIdleRpg.Facades.RuntimeFacade.Config());
  const config: ClientConfig = { server, mode: BUILD_MODE };
  app = await startApp(unityBridge, config, views);
  app.log("config").info(`${environment}: ${server}`);
  const { items, monsters, skills, stages } = app.data;
  app.log("data").debug(`Items: ${items.size}, Monsters: ${monsters.size}, Skills: ${skills.size}, Stages: ${stages.size}`);
  // 앱 흐름의 각 상태를 Console에서 따라갈 수 있게 찍는다. 구독이 처음 상태도 찍는다.
  const flow = app.log("flow");
  app.state.flow.subscribe(state => flow.info(state));
  app.start();
}
