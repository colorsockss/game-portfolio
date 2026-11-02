// 부트 번들의 진입 모듈(앱의 Resources에 든다). 가장 먼저 와야 한다: PuerTS V8에 없는 것을 어떤 패키지보다 먼저 설치한다.
import "./host/text-encoding.js";
import { boot } from "./unity/boot.js";

boot().catch(error => console.error("[TypeScript] Boot failed:", error));
