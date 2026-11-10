// 게임의 원본에서 파생되어 커밋되는 코드와 데이터를 다시 생성한다:
//   idle/data/*.xlsx                   → idle/shared/data-schema/src/tables/ (로더) + idle/shared/data-schema/data/
//   idle/data/formulas.json            → idle/shared/game-core/src/formulas.ts + ability-type.ts
//   mmo/shared/contract/packets.proto  → mmo/shared/contract/generated/ (C#과 C++, Contract.csproj의 Google.Protobuf.Tools protoc)
// 게임 이름(idle, mmo)을 주면 그 게임만 생성하므로 다른 게임이 쓰는 도구(idle의 xlsx LFS와 npm 의존성, mmo의 dotnet)가 없어도 된다.
// 이름이 없으면 모두 생성한다. --check를 주면 아무것도 쓰지 않고, 생성 파일이 낡았으면 명령이 실패한다.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const check = args.includes("--check");

// 게임 → 스테이징 폴더에 생성하는 단계와, 생성물(스테이징 안의 경로) → 저장소 경로.
const GAMES = {
  idle: {
    async generate(staging) {
      // big 열의 로더가 Big을 가져올 모듈을 알려 준다(big 열이 없으면 쓰이지 않는다).
      run("tools/data-tool/src/cli.js", "idle/data", "--out", path.join(staging, "sheets"), "--big-module", "@idle/big-number");
      run("tools/formula-tool/scripts/export-typescript.mjs", "idle/data/formulas.json", path.join(staging, "formulas.ts"));
      // formulas.ts가 가져오는 E_AbilityType도 같은 프로젝트의 키로 만든다. 툴은 게임의 enum을 가져다 쓸 뿐 만들지 않는다.
      const formulas = JSON.parse(await readFile(path.join(root, "idle/data/formulas.json"), "utf8"));
      await writeFile(path.join(staging, "ability-type.ts"), abilityType(formulas));
    },
    // 이식 가능한 로더만 남긴다. 로더는 호스트 API(파일 접근, 폴리필)를 쓰지 않으므로 클라이언트와
    // 서버가 함께 쓰고, 바이트와 없는 전역은 각자 채운다.
    outputs: [
      ["sheets/typescript/portable", "idle/shared/data-schema/src/tables"],
      ["sheets/data", "idle/shared/data-schema/data"],
      ["formulas.ts", "idle/shared/game-core/src/formulas.ts"],
      ["ability-type.ts", "idle/shared/game-core/src/ability-type.ts"],
    ],
  },
  mmo: {
    async generate(staging) {
      // protoc 버전은 Contract.csproj의 Google.Protobuf.Tools 버전이 고정한다.
      // 생성 타깃만 돌린다. Units.cs가 생성된 코드를 쓰므로, 전체를 빌드하면 새 enum이 생성되기 전의 코드로 컴파일하다 실패한다.
      dotnet("build", "mmo/shared/contract/Contract.csproj", "-t:GenerateContract", "-nologo", "-v", "q", `-p:ContractOutputDir=${path.join(staging, "contract")}`);
    },
    outputs: [["contract", "mmo/shared/contract/generated"]],
  },
};

// 옵션 오타(--chek)를 넘기면 검사 대신 생성 파일을 덮어쓰므로 막는다. `npm run generate --check`처럼 --를 빠뜨리면 npm이 --check를
// 자기 설정으로 가져가 여기에는 오지 않고 npm_config_check만 남는다.
if (process.env.npm_config_check) throw new Error("npm took --check as its own option. Run `npm run generate -- --check`.");
for (const option of args.filter((arg) => arg.startsWith("--"))) {
  if (option !== "--check") throw new Error(`Unknown option "${option}". The only option is --check.`);
}
const names = [...new Set(args.filter((arg) => !arg.startsWith("--")))];
for (const name of names) {
  if (!Object.hasOwn(GAMES, name)) throw new Error(`Unknown game "${name}". Choose from: ${Object.keys(GAMES).join(", ")}.`);
}
const staging = await mkdtemp(path.join(tmpdir(), "game-generate-"));
// 실패하면 process.exit로 끝나서 finally가 돌지 않으므로, 스테이징 폴더는 프로세스가 끝날 때 지운다.
process.on("exit", () => rmSync(staging, { recursive: true, force: true }));

const outputs = [];
for (const name of names.length > 0 ? names : Object.keys(GAMES)) {
  await GAMES[name].generate(staging);
  outputs.push(...GAMES[name].outputs.map(([from, to]) => [path.join(staging, from), to]));
}

if (check) {
  const stale = [];
  for (const [from, to] of outputs) stale.push(...await differences(from, path.join(root, to), to));
  if (stale.length > 0) {
    // 고른 게임만 다시 만들게 안내한다(npm run generate는 모든 게임을 만들어 mmo의 .NET도 필요하다).
    const command = names.length > 0 ? `npm run generate -- ${names.join(" ")}` : "npm run generate";
    console.error(`Generated files are out of date. Run \`${command}\`.\n  ${stale.join("\n  ")}`);
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
