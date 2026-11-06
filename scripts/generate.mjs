// 게임의 원본에서 파생되어 커밋되는 코드와 데이터를 다시 생성한다:
//   idle/data/*.xlsx                   → idle/shared/data-schema/src/tables/ (로더) + idle/shared/data-schema/data/
//   idle/data/formulas.json            → idle/shared/game-core/src/formulas.ts + ability-type.ts
//   mmo/shared/contract/packets.proto  → mmo/shared/contract/generated/Packets.cs (Contract.csproj의 Grpc.Tools protoc)
// --check를 주면 아무것도 쓰지 않고, 생성 파일이 낡았으면 명령이 실패한다.
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
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
  // formulas.ts가 가져오는 E_AbilityType도 같은 프로젝트의 키로 만든다. 툴은 게임의 enum을 가져다 쓸 뿐 만들지 않는다.
  const formulas = JSON.parse(await readFile(path.join(root, "idle/data/formulas.json"), "utf8"));
  await writeFile(path.join(staging, "ability-type.ts"), abilityType(formulas));
  // protoc 버전은 Contract.csproj의 Grpc.Tools 버전이 고정한다.
  dotnet("build", "mmo/shared/contract/Contract.csproj", "-nologo", "-v", "q", `-p:ContractOutputDir=${path.join(staging, "contract")}`);

  // 이식 가능한 로더만 남긴다. 로더는 호스트 API(파일 접근, 폴리필)를 쓰지 않으므로 클라이언트와
  // 서버가 함께 쓰고, 바이트와 없는 전역은 각자 채운다.
  const outputs = [
    [path.join(staging, "sheets/typescript/portable"), "idle/shared/data-schema/src/tables"],
    [path.join(staging, "sheets/data"), "idle/shared/data-schema/data"],
    [path.join(staging, "formulas.ts"), "idle/shared/game-core/src/formulas.ts"],
    [path.join(staging, "ability-type.ts"), "idle/shared/game-core/src/ability-type.ts"],
    [path.join(staging, "contract"), "mmo/shared/contract/generated"],
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

// 능력치와 공식의 키를 프로젝트의 순서(능력치 다음 공식)대로 담은 enum. 값은 메모리 안에서만 쓰여 순서가 바뀌어도 된다.
function abilityType({ name, stats, formulas }) {
  const keys = [...stats, ...formulas].map((entry) => `  ${entry.key},\n`).join("");
  return `// 자동 생성된 파일 — 직접 수정하지 마세요. 프로젝트: ${name}\n// 공식 프로젝트(idle/data/formulas.json)의 능력치와 공식 키. formulas.ts가 가져온다.\nexport enum E_AbilityType {\n${keys}}\n`;
}

function run(script, ...args) {
  report(spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" }));
}

function dotnet(...args) {
  report(spawnSync("dotnet", args, { cwd: root, encoding: "utf8", env: { ...process.env, DOTNET_NOLOGO: "1", DOTNET_CLI_TELEMETRY_OPTOUT: "1" } }));
}

function report(result) {
  if (result.status !== 0) {
    // dotnet이 없으면 spawn 자체가 실패해 출력 대신 error만 있다.
    process.stderr.write(result.error ? `${result.error.message}\n` : result.stdout + result.stderr);
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
