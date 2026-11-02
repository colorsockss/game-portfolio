// 게임 번들의 진입 모듈(패치로 받는다). 가장 먼저 와야 한다: PuerTS V8에 없는 것을 어떤 패키지보다 먼저 설치한다.
import "./host/text-encoding.js";
import { runGame } from "./unity/game.js";

// Unity가 ScriptEnv를 살려 두고 매 프레임 Tick을 부르는지도 확인한다.
setTimeout(() => console.log("[TypeScript] Runtime tick ready."), 0);

runGame().catch(error => console.error("[TypeScript] Boot failed:", error));
