// 테스트가 PuerTS 번들을 실행할 때 Unity 호스트를 대신하는 Node 모듈 훅.
import { readFileSync } from "node:fs";

// 외부 "csharp" 모듈은 FileFacade.Read처럼 번들 기준 상대 경로로 파일을 읽는다.
const CSHARP_URL = "puerts-host:csharp";
// 외부 "puerts" 모듈의 puer. 처리되지 않은 Promise 거부는 Node가 그대로 알린다.
const PUERTS_URL = "puerts-host:puerts";
const PUERTS_SOURCE = "export default { on() {} };";
// 에디터처럼 로컬 앱 설정을 준다(RuntimeFacade.Config).
const CONFIG = readFileSync(new URL("../../../config/local.json", import.meta.url), "utf8");
const CSHARP_SOURCE = `
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(process.argv[1]);
function Read(relativePath) {
  const bytes = readFileSync(path.join(root, relativePath));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
// 번들은 부팅 중에 소켓을 연결하지 않으므로, 파사드는 있기만 하면 된다.
const WebSocketFacade = {
  Opened: 0, Message: 1, Closed: 2,
  Open() { throw new Error("No WebSocket in the build test."); },
};
// 저장된 것이 없어서, 번들은 스스로 로그인하지 않고 로그인 화면까지 부팅한다.
const StorageFacade = { Get: () => null, Set() {}, Delete() {} };
const DisplayFacade = { SetFrameRate() {} };
// 설치된 게임 번들이 없다. 개발 빌드의 부트는 패치하지 않으므로 묻지도 않는다.
const BundleFacade = { CurrentManifest: () => null };
// 부트가 게임으로 넘어가거나 다시 시작하면 테스트가 보도록 찍는다.
const RuntimeFacade = {
  StartGame: () => console.log("[host] StartGame"),
  Restart: () => console.log("[host] Restart"),
  Config: () => ${JSON.stringify(CONFIG)},
};
// 모든 프리팹이 즉시 로드되고 모든 ref를 가지며, 각 ref는 바인딩이 쓰는 것을 모두 갖춘 컴포넌트다.
const ResourceFacade = { Loading: 0, Loaded: 1, Missing: 2, Load: () => 1, Poll: () => 1, Release() {}, UnloadUnused() {} };
const event = () => ({ AddListener() {}, RemoveListener() {} });
const component = () => ({
  text: "", interactable: true, onClick: event(), onValueChanged: event(), SetActive() {}, FadeTo() {}, Finished: event(),
});
const viewRefs = { GetKind: () => 0, GetObject: component };
const UiFacade = {
  Screen: 0, Popup: 1, Overlay: 2,
  Create: () => viewRefs, Destroy() {}, SetBlocking() {}, BackPressed: () => false,
};
export default {
  PortfolioIdleRpg: {
    Facades: {
      BundleFacade, DisplayFacade, FileFacade: { Read }, ResourceFacade, RuntimeFacade, StorageFacade, UiFacade, WebSocketFacade,
    },
  },
};
`;

const HOSTED = { csharp: [CSHARP_URL, CSHARP_SOURCE], puerts: [PUERTS_URL, PUERTS_SOURCE] };

export async function resolve(specifier, context, nextResolve) {
  const hosted = HOSTED[specifier];
  return hosted ? { url: hosted[0], shortCircuit: true } : nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  const hosted = Object.values(HOSTED).find(([hostedUrl]) => hostedUrl === url);
  return hosted
    ? { format: "module", source: hosted[1], shortCircuit: true }
    : nextLoad(url, context);
}
