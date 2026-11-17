// 커밋하지 않은 변경(추적하지 않는 파일 포함)을 보고 바뀐 영역의 검사만 돌린다. 영역 폴더의 규칙은 CI 워크플로(idle-ci, tools-ci,
// mmo-ci, mmo-unreal-ci)의 paths와 같게 유지한다. 영역 밖의 파일은 CI보다 넓게 모든 영역을 검사하므로 로컬 검사가 CI보다 좁아지지 않는다.
//   *.md만                     → 없음 (어떤 테스트도 문서를 읽지 않는다)
//   idle/shared/big-number/, idle/tsconfig.base.json
//                              → idle, tools (툴의 테스트가 생성 코드를 실제 Big으로 실행하고, Big을 변환할 때 이 tsconfig를 따른다)
//   idle/                      → idle
//   tools/                     → tools, idle, mmo (두 게임이 툴의 출력을 생성 파일로 커밋한다. mmo의 출력은 mmo/shared/라 mmo-unreal은 그쪽이 부른다)
//   mmo/client-unreal/         → mmo-unreal (엔진 없는 클라이언트 테스트. 66)
//   mmo/shared/                → mmo, mmo-unreal (생성된 C#·C++, 비교 벡터, 데이터 파일을 둘 다 읽는다)
//   mmo/                       → mmo
//   그 밖                      → 모든 영역 (루트의 package.json, scripts/ 등)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

// 영역 → 차례로 돌릴 명령.
const COMMANDS = {
  idle: [["npm", "run", "typecheck:idle"], ["npm", "run", "test:idle"]],
  tools: [["npm", "run", "typecheck:tools"], ["npm", "run", "test:tools"]],
  mmo: [["npm", "run", "test:mmo"]],
  "mmo-unreal": [["npm", "run", "test:mmo-unreal"]],
};

// 위에서부터 보고 처음 맞는 규칙을 쓴다.
const RULES = [
  [(file) => file.endsWith(".md"), []],
  [(file) => file.startsWith("idle/shared/big-number/") || file === "idle/tsconfig.base.json", ["idle", "tools"]],
  [(file) => file.startsWith("idle/"), ["idle"]],
  [(file) => file.startsWith("tools/"), ["tools", "idle", "mmo"]],
  [(file) => file.startsWith("mmo/client-unreal/"), ["mmo-unreal"]],
  [(file) => file.startsWith("mmo/shared/"), ["mmo", "mmo-unreal"]],
  [(file) => file.startsWith("mmo/"), ["mmo"]],
  [() => true, Object.keys(COMMANDS)],
];

/** 바뀐 파일 → 검사할 영역(COMMANDS의 순서). */
function plan(files) {
  const areas = new Set(files.flatMap((file) => RULES.find(([match]) => match(file))[1]));
  return Object.keys(COMMANDS).filter((area) => areas.has(area));
}

assert.deepEqual(plan(["README.md", "mmo/MANUAL.md"]), []);
assert.deepEqual(plan(["mmo/shared/contract/packets.proto", "mmo/README.md"]), ["mmo", "mmo-unreal"]);
assert.deepEqual(plan(["mmo/client-unreal/Source/PortfolioMmo/Private/World/WorldState.cpp"]), ["mmo-unreal"]);
assert.deepEqual(plan(["mmo/server/src/World.cs"]), ["mmo"]);
assert.deepEqual(plan(["mmo/data/Items.xlsx"]), ["mmo"]);
assert.deepEqual(plan(["idle/server/src/main.ts"]), ["idle"]);
assert.deepEqual(plan(["idle/shared/big-number/src/index.ts"]), ["idle", "tools"]);
assert.deepEqual(plan(["idle/tsconfig.base.json"]), ["idle", "tools"]);
assert.deepEqual(plan(["tools/data-tool/src/cli.js"]), ["idle", "tools", "mmo"]);
assert.deepEqual(plan(["mmo/server/src/World.cs", "idle/server/src/main.ts"]), ["idle", "mmo"]);
assert.deepEqual(plan(["package.json"]), ["idle", "tools", "mmo", "mmo-unreal"]);

// -z: 한글 같은 경로를 따옴표로 감싸 바꾸지 않게 한다.
const changed = [
  ...git("diff", "--name-only", "--no-renames", "-z", "HEAD"),
  ...git("ls-files", "--others", "--exclude-standard", "-z"),
];
const areas = plan([...new Set(changed)]);
if (areas.length === 0) {
  console.log(changed.length === 0 ? "No uncommitted changes; nothing to check." : "Only docs changed; nothing to check.");
}
for (const command of areas.flatMap((area) => COMMANDS[area])) {
  console.log(`\n> ${command.join(" ")}`);
  const result = spawnSync(command[0], command.slice(1), { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.split("\0").filter(Boolean);
}
