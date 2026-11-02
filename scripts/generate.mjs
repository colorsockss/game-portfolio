// idle/data/에서 파생되어 커밋되는 코드와 데이터를 다시 생성한다:
//   idle/data/*.xlsx        → idle/shared/data-schema/src/tables/ (로더) + idle/shared/data-schema/data/
//   idle/data/formulas.json → idle/shared/game-core/src/formulas.ts
// --check를 주면 아무것도 쓰지 않고, 생성 파일이 낡았으면 명령이 실패한다.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const staging = await mkdtemp(path.join(tmpdir(), "idle-generate-"));

try {
  // big 열의 로더가 Big을 가져올 모듈을 알려 준다(big 열이 없으면 쓰이지 않는다).
  run("tools/data-tool/src/cli.js", "idle/data", "--out", path.join(staging, "sheets"), "--big-module", "@idle/big-number");
  run("tools/formula-tool/scripts/export-typescript.mjs", "idle/data/formulas.json", path.join(staging, "formulas.ts"));

  // 이식 가능한 로더만 남긴다. 로더는 호스트 API(파일 접근, 폴리필)를 쓰지 않으므로 클라이언트와
  // 서버가 함께 쓰고, 바이트와 없는 전역은 각자 채운다.
  const outputs = [
    [path.join(staging, "sheets/typescript/portable"), "idle/shared/data-schema/src/tables"],
    [path.join(staging, "sheets/data"), "idle/shared/data-schema/data"],
    [path.join(staging, "formulas.ts"), "idle/shared/game-core/src/formulas.ts"],
  ];

  if (check) {
    const stale = [];
    for (const [from, to] of outputs) stale.push(...await differences(from, path.join(root, to), to));
    if (stale.length > 0) {
      console.error(`Generated files are out of date. Run \`npm run generate\`.\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("Generated files are up to date.");
  } else {
    for (const [from, to] of outputs) {
      await rm(path.join(root, to), { recursive: true, force: true });
      await cp(from, path.join(root, to), { recursive: true });
      console.log(`Updated ${to}`);
    }
  }
} finally {
  await rm(staging, { recursive: true, force: true });
}

function run(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stdout + result.stderr);
    process.exit(result.status ?? 1);
  }
}

async function differences(expected, actual, label) {
  const [wanted, present] = await Promise.all([listFiles(expected), listFiles(actual)]);
  const found = [];
  for (const file of new Set([...wanted, ...present])) {
    const name = file ? path.join(label, file) : label;
    if (!present.includes(file)) found.push(`missing: ${name}`);
    else if (!wanted.includes(file)) found.push(`unexpected: ${name}`);
    else if (!(await readFile(path.join(expected, file))).equals(await readFile(path.join(actual, file)))) {
      found.push(`changed: ${name}`);
    }
  }
  return found;
}

// 폴더 아래의 상대 파일 경로. 파일 하나면 [""], 없으면 [].
async function listFiles(target) {
  const info = await stat(target).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return [""];
  const entries = await readdir(target, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(target, path.join(entry.parentPath, entry.name)))
    .sort();
}
