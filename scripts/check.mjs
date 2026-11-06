// 커밋하지 않은 변경(추적하지 않는 파일 포함)을 보고 그 영역에 필요한 검사만 돌린다. 전체는 CI가 늘 돌린다.
//   *.md만                 → 없음 (어떤 테스트도 문서를 읽지 않는다)
//   mmo/                   → 생성 파일 검사(packets.proto → C#)와 mmo의 C# 테스트
//   그 밖                  → typecheck와 전체 npm test
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

const COMMANDS = {
  generate: ["node", "scripts/generate.mjs", "--check"],
  mmo: ["npm", "run", "test:mmo"],
  typecheck: ["npm", "run", "typecheck"],
  test: ["npm", "test"],
};

// 위에서부터 보고 처음 맞는 규칙을 쓴다.
const RULES = [
  [(file) => file.endsWith(".md"), []],
  [(file) => file.startsWith("mmo/"), ["generate", "mmo"]],
  [() => true, ["typecheck", "test"]],
];

/** 바뀐 파일 → 돌릴 검사 이름. 전체 test는 생성 파일 검사와 mmo 테스트를 품는다. */
function plan(files) {
  const checks = new Set(files.flatMap((file) => RULES.find(([match]) => match(file))[1]));
  if (checks.has("test")) return ["typecheck", "test"];
  return Object.keys(COMMANDS).filter((name) => checks.has(name));
}

assert.deepEqual(plan(["README.md", "mmo/MANUAL.md"]), []);
assert.deepEqual(plan(["mmo/shared/contract/packets.proto", "mmo/README.md"]), ["generate", "mmo"]);
assert.deepEqual(plan(["mmo/shared/contract/packets.proto", "idle/server/src/main.ts"]), ["typecheck", "test"]);
assert.deepEqual(plan(["package.json"]), ["typecheck", "test"]);

// -z: 한글 같은 경로를 따옴표로 감싸 바꾸지 않게 한다.
const changed = [
  ...git("diff", "--name-only", "--no-renames", "-z", "HEAD"),
  ...git("ls-files", "--others", "--exclude-standard", "-z"),
];
const checks = plan([...new Set(changed)]);
if (checks.length === 0) {
  console.log(changed.length === 0 ? "No uncommitted changes; nothing to check." : "Only docs changed; nothing to check.");
}
for (const name of checks) {
  console.log(`\n> ${COMMANDS[name].join(" ")}`);
  const result = spawnSync(COMMANDS[name][0], COMMANDS[name].slice(1), { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function git(...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  return result.stdout.split("\0").filter(Boolean);
}
