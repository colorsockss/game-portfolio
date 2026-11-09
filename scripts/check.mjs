// 커밋하지 않은 변경(추적하지 않는 파일 포함)을 보고 바뀐 영역의 검사만 돌린다. 영역을 가르는 규칙은 CI 워크플로(idle-ci, tools-ci,
// mmo-ci)의 paths와 같게 유지한다.
//   *.md만                     → 없음 (어떤 테스트도 문서를 읽지 않는다)
//   idle/shared/big-number/    → idle, tools (툴의 테스트가 생성 코드를 실제 Big으로 실행한다)
//   idle/                      → idle
//   tools/                     → tools, idle (idle이 툴의 출력을 생성 파일로 커밋한다)
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
};

// 위에서부터 보고 처음 맞는 규칙을 쓴다.
const RULES = [
  [(file) => file.endsWith(".md"), []],
  [(file) => file.startsWith("idle/shared/big-number/"), ["idle", "tools"]],
  [(file) => file.startsWith("idle/"), ["idle"]],
  [(file) => file.startsWith("tools/"), ["tools", "idle"]],
  [(file) => file.startsWith("mmo/"), ["mmo"]],
  [() => true, Object.keys(COMMANDS)],
];

/** 바뀐 파일 → 검사할 영역(COMMANDS의 순서). */
function plan(files) {
  const areas = new Set(files.flatMap((file) => RULES.find(([match]) => match(file))[1]));
  return Object.keys(COMMANDS).filter((area) => areas.has(area));
}

assert.deepEqual(plan(["README.md", "mmo/MANUAL.md"]), []);
assert.deepEqual(plan(["mmo/shared/contract/packets.proto", "mmo/README.md"]), ["mmo"]);
assert.deepEqual(plan(["idle/server/src/main.ts"]), ["idle"]);
assert.deepEqual(plan(["idle/shared/big-number/src/index.ts"]), ["idle", "tools"]);
assert.deepEqual(plan(["tools/data-tool/src/cli.js"]), ["idle", "tools"]);
assert.deepEqual(plan(["mmo/server/src/World.cs", "idle/server/src/main.ts"]), ["idle", "mmo"]);
assert.deepEqual(plan(["package.json"]), ["idle", "tools", "mmo"]);

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
