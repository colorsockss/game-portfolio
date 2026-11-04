// 구조가 어긋나지 않게 지키는 import 경계를 검사한다. npm은 모든 워크스페이스를 루트 node_modules에
// 연결하고 어떤 파일이든 상대 경로로 다른 파일에 닿을 수 있어서, 경계를 넘는 import를 막아 주는 것이
// 따로 없다.
//
// 워크스페이스: 공용 패키지는 자기보다 아래에 있는 공용 패키지만 쓴다(codes와 big-number는 아무것도
// 쓰지 않고, data-schema는 big-number를, game-core는 codes, big-number, data-schema를, protocol은
// codes, big-number, game-core를 쓴다). 클라이언트와 서버는
// 공용 패키지만 쓰고(서로는 쓰지 않는다), 둘을 함께 쓸 수 있는 것은 integration/뿐이다. 밸런스 시뮬레이션(balance/)은
// 공용 패키지와 서버(새 계정의 저장 데이터)만 쓴다. 툴(tools/)은 게임 코드를 쓰지 않고 생성 파일만 쓴다. 툴의 테스트만
// big 열·Big 모드로 만든 코드를 실제 Big으로 실행해 보려고 @idle/big-number를 쓴다.
// 클라이언트(idle/client/TypeScript/src) 안에서는 최상위 폴더 하나가 계층이며, 자기보다 아래 계층만
// import할 수 있다: domain → application → adapters와 presentation(서로 import하지 않는다) →
// composition.ts → unity → main.ts·boot.ts(두 프로그램의 진입 모듈), host/는 따로 떨어져 있다. @idle/protocol은 adapters와
// composition만 쓰고, csharp, puerts, CS는 unity/만 쓴다(PuerTS가 생성한 타입 선언 때문에 CS가
// 전역이 된다). 신호 라이브러리(@preact/signals-core)는 application, adapters, presentation,
// composition, unity만 쓰고(effect는 쓰지 않는다), 나머지 외부 npm 패키지는 host/만 쓴다. domain, application, presentation은 호스트 API(시계,
// 타이머, console, 난수)를 쓰지 않으므로 시간과 로그는 포트로 들어온다.
//
// 공용 패키지의 코드(idle/shared/*/src)는 클라이언트와 서버에서 비트까지 같은 결과를 내야 하므로(idle/shared/AGENTS.md) 정확한
// Math 함수(max, min, floor, round, abs, 난수 생성기의 imul)만 쓰고, 엔진마다 다를 수 있는 것(pow, log, sin, random 등)과 시계·타이머는
// 쓰지 않는다.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const shared = ["@idle/big-number", "@idle/codes", "@idle/data-schema", "@idle/game-core", "@idle/protocol"];

// 워크스페이스 폴더 → 그 코드가 import할 수 있는 @idle 패키지.
const allowed = {
  "idle/shared/big-number": [],
  "idle/shared/codes": [],
  "idle/shared/data-schema": ["@idle/big-number"],
  "idle/shared/game-core": ["@idle/big-number", "@idle/codes", "@idle/data-schema"],
  "idle/shared/protocol": ["@idle/big-number", "@idle/codes", "@idle/game-core"],
  "idle/client/TypeScript": shared,
  "idle/server": shared,
  "idle/integration": [...shared, "@idle/client", "@idle/server"],
  "idle/balance": ["@idle/big-number", "@idle/codes", "@idle/data-schema", "@idle/game-core", "@idle/server"],
  "tools/data-tool": [],
  "tools/formula-tool": [],
};
// 워크스페이스 폴더 → 그 테스트 파일(*.test.*)만 더 import할 수 있는 @idle 패키지.
const allowedInTests = {
  "tools/data-tool": ["@idle/big-number"],
  "tools/formula-tool": ["@idle/big-number"],
};

const clientSource = "idle/client/TypeScript/src/";
const innerShared = shared.filter(name => name !== "@idle/protocol");
const signals = "@preact/signals-core";
const hostApi = /\b(console\.|Date\.now|setTimeout|setInterval|clearTimeout|clearInterval|Math\.random)/;
const sharedSource = /^idle\/shared\/[\w-]+\/src\//;
const exactMath = new Set(["max", "min", "floor", "round", "abs", "imul"]);
const clockApi = /\b(Date\.now|new Date\b|performance\.now|setTimeout|setInterval)/;

// 클라이언트 계층 → import할 수 있는 계층, @idle 패키지, 외부 npm 패키지(host/는 전부 허용).
const layers = {
  domain: { layers: ["domain"], packages: innerShared },
  application: { layers: ["domain", "application"], packages: innerShared, external: [signals] },
  adapters: { layers: ["domain", "application", "adapters"], packages: shared, external: [signals] },
  presentation: { layers: ["domain", "application", "presentation"], packages: innerShared, external: [signals] },
  composition: { layers: ["domain", "application", "adapters", "presentation", "composition"], packages: shared, external: [signals] },
  unity: { layers: ["domain", "application", "adapters", "presentation", "composition", "unity"], packages: innerShared, external: [signals] },
  host: { layers: ["host"], packages: [] },
  main: { layers: ["host", "unity"], packages: [] },
  boot: { layers: ["host", "unity"], packages: [] },
};
const violations = [];

for (const [workspace, packages] of Object.entries(allowed)) {
  for (const file of await sourceFiles(path.join(root, workspace))) {
    const name = path.relative(root, file).split(path.sep).join("/");
    // 주석 줄에 import 예시가 나올 수 있으므로 코드만 센다.
    const code = (await readFile(file, "utf8")).split("\n").filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line)).join("\n");
    const specifiers = [...code.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map(match => match[1]);
    const usable = /\.test\.\w+$/.test(name) ? [...packages, ...(allowedInTests[workspace] ?? [])] : packages;
    for (const specifier of specifiers) {
      const target = /^@idle\/[\w-]+/.exec(specifier)?.[0];
      if (target && !usable.includes(target)) violations.push(`${name} imports ${target}`);
    }
    if (name.startsWith(clientSource)) checkClientLayers(name, code, specifiers);
    if (sharedSource.test(name)) checkDeterminism(name, code);
  }
}

function checkDeterminism(name, code) {
  for (const [, method] of code.matchAll(/\bMath\.(\w+)/g)) {
    if (!exactMath.has(method)) violations.push(`${name} uses Math.${method}; shared code keeps to ${[...exactMath].map(m => `Math.${m}`).join(", ")}`);
  }
  const api = clockApi.exec(code)?.[1];
  if (api) violations.push(`${name} uses "${api}"; shared code takes time as \`now\``);
}

function checkClientLayers(name, code, specifiers) {
  const layer = layerOf(name.slice(clientSource.length));
  const rule = layers[layer];
  if (!rule) return void violations.push(`${name} is in no layer (${Object.keys(layers).join(", ")})`);
  for (const specifier of specifiers) {
    if (specifier.startsWith(".")) {
      const target = path.posix.join(path.posix.dirname(name), specifier);
      const targetLayer = target.startsWith(clientSource) ? layerOf(target.slice(clientSource.length)) : "outside src";
      if (!rule.layers.includes(targetLayer)) violations.push(`${name} (${layer}) imports ${targetLayer}: ${specifier}`);
    } else if (specifier.startsWith("@idle/")) {
      const target = /^@idle\/[\w-]+/.exec(specifier)[0];
      if (!rule.packages.includes(target)) violations.push(`${name} (${layer}) imports ${target}`);
    } else if (specifier === "csharp" || specifier === "puerts") {
      if (layer !== "unity") violations.push(`${name} imports ${specifier} outside unity/`);
    } else if (layer === "host" ? specifier === signals : !rule.external?.includes(specifier)) {
      violations.push(`${name} (${layer}) imports the external package ${specifier}; only host/ and layers that list it in external may (host/ not ${signals})`);
    }
  }
  // effect 안에서 읽은 신호는 모두 의존이 되어 엉뚱할 때 다시 돌므로 쓰지 않는다(값은 subscribe로 따라간다).
  // 이름 목록은 여러 줄일 수 있다.
  for (const [, names] of code.matchAll(/\b(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@preact\/signals-core["']/g)) {
    if (names.split(",").some(item => item.trim().replace(/^type\s+/, "").split(/\s+/)[0] === "effect")) {
      violations.push(`${name} imports effect from @preact/signals-core; follow a value with subscribe() in a Scope`);
    }
  }
  if (layer !== "unity" && /\bCS\./.test(code)) violations.push(`${name} uses CS outside unity/`);
  const api = ["domain", "application", "presentation"].includes(layer) && hostApi.exec(code)?.[1];
  if (api) violations.push(`${name} (${layer}) uses "${api}"; take time from Clock and logs from Logger`);
}

// "adapters/net/x.ts" → "adapters", "composition.ts" → "composition".
function layerOf(relativePath) {
  return relativePath.split("/")[0].replace(/\.(ts|js)$/, "");
}

if (violations.length > 0) {
  console.error(`Imports across boundaries or nondeterministic shared code (see MANUAL.md, 구조):\n  ${violations.join("\n  ")}`);
  process.exit(1);
}
console.log("Workspace and client layer boundaries hold, and shared code keeps to exact math.");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter(entry => entry.isFile() && /\.(ts|mts|js|mjs|svelte)$/.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name))
    // 빌드 출력과 생성물: dist(번들), .svelte-kit(SvelteKit), target(Rust), .test-output(data-tool 테스트).
    .filter(file => !/(^|[\\/])(node_modules|dist|\.svelte-kit|target|\.test-output)[\\/]/.test(path.relative(directory, file)));
}
