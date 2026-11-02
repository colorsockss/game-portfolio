import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build, context } from "esbuild";
import { readApi } from "./api.mjs";
import { RULE_TABLES } from "./data-schema.mjs";
import { PARTS, verifyManifest, writeManifest } from "./manifest.mjs";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
const tsconfigPath = path.join(clientRoot, "tsconfig.json");
const [mode, ...flags] = process.argv.slice(2);
if (mode !== "development" && mode !== "release") {
  throw new Error("Expected build mode: development or release.");
}
const watch = flags.includes("--watch");
if (watch && mode !== "development") {
  throw new Error("--watch is only supported for development builds.");
}

// 릴리스만 받는 값(docs/superpowers/specs/2026-10-30-patch-design.md 4.12절). --parts는 이번 커밋에서 만들 단위(기본은
// 모두)이고, 고르지 않은 단위는 --base의 버전 폴더(tools/patch.mjs pull로 받은 것)에서 가져온다. --server는 이 버전과 함께 돌
// 서버의 커밋, --bucket은 더할 버킷이다(기본 dist/patch, 테스트는 임시 폴더).
const option = name => flags.find(flag => flag.startsWith(`--${name}=`))?.slice(name.length + 3);
const parts = option("parts")?.split(",").filter(Boolean) ?? PARTS;
const base = option("base") && path.resolve(option("base"));
const server = option("server") ?? process.env.GITHUB_SHA ?? null;
for (const part of parts) if (!PARTS.includes(part)) throw new Error(`Unknown part ${part}; expected ${PARTS.join(", ")}.`);
if (parts.length < PARTS.length && !base) throw new Error("Building only some parts needs --base=<a pulled version folder>.");

// 내보내는 플랫폼. Android만 낸다(src/application/update/update.ts의 channelPath).
const platform = "Android";
// 릴리스의 로컬 버킷. Live VPS의 패치 폴더와 같은 레이아웃이고(aa/, v/<버전>/, channels/), serve:bundle이 내준다. 지우지 않고 더한다.
const bucket = path.resolve(option("bucket") ?? path.join(clientRoot, "dist", "patch"));
// 게임 번들(main과 data/)을 만드는 디렉터리. 릴리스는 다 만든 뒤 버킷의 v/<버전>/으로 옮긴다.
const outputDirectory = path.join(clientRoot, "dist", mode === "release" ? ".release" : mode);
// 릴리스의 부트 번들은 앱에 들도록 Resources에 둔다(TypeScriptRuntimeSettings.ReleaseBootModule). 빌드 출력이라 커밋하지 않는다.
const resourcesDirectory = path.join(clientRoot, "..", "Assets", "Resources", "TypeScript");
// Unity의 Tools/Addressables/Build Remote Content가 만든 에셋 카탈로그와 에셋 번들(Assets/Editor/Patch/RemoteContent.cs).
const remoteContent = path.join(clientRoot, "..", "ServerData", platform);
// 앱의 C# API 지문(tools/api.mjs).
const api = await readApi(clientRoot);
// 테이블 데이터는 FileFacade.Read가 찾는 진입 모듈 옆에 함께 담긴다.
const dataDirectory = fileURLToPath(new URL("../../../shared/data-schema/data/", import.meta.url));
// 프로그램마다 파일 하나로 번들한다: 부트(boot, 패치 전)와 게임(main, 패치로 받음). 둘은 코드를 나누지 않는다. PuerTS는
// 워크스페이스나 npm 패키지 경로를 해석하지 못한다.
const options = {
  absWorkingDir: clientRoot,
  entryPoints: ["src/boot.ts", "src/main.ts"],
  outdir: outputDirectory,
  bundle: true,
  format: "esm",
  platform: "neutral",
  // 일부 의존성(fast-text-encoding)은 "main"만 선언하는데, "neutral"은 기본적으로 이를 무시한다.
  mainFields: ["module", "main"],
  target: "es2020",
  external: ["csharp", "puerts"],
  // 부트 번들이 패치 전의 문장(Strings.bytes)을 Uint8Array로 담는다.
  loader: { ".bytes": "binary" },
  tsconfig: "tsconfig.json",
  // 클라이언트의 개발과 릴리즈를 가르는 곳은 여기 하나다(types/runtime.d.ts의 BUILD_MODE, unity/boot.ts가 읽는다).
  // RUNTIME_API는 부트가 따를 패치 채널이다.
  define: { BUILD_MODE: JSON.stringify(mode), RUNTIME_API: JSON.stringify(api) },
  ...(mode === "development"
    ? { sourcemap: "linked" }
    : { outExtension: { ".js": ".mjs" }, minify: true, sourcemap: false }),
};

// 빌드가 실패했을 때 배포할 수 있어 보이는 이전 산출물이 남아 있으면 안 된다.
await rm(outputDirectory, { recursive: true, force: true });

if (watch) {
  await watchDevelopment();
} else {
  typecheck();
  await build({ ...options, logLevel: "info" });
  await copyData();
  // 릴리스: 부트 번들은 앱으로, 게임 번들은 매니페스트와 함께 로컬 버킷에 더한다.
  if (mode === "release") {
    await mkdir(resourcesDirectory, { recursive: true });
    await rename(path.join(outputDirectory, "boot.mjs"), path.join(resourcesDirectory, "boot.mjs"));
    console.log(`[TypeScript] boot bundle (API ${api}): ${resourcesDirectory}`);
    await publish();
  } else {
    console.log(`[TypeScript] ${mode} output: ${outputDirectory}`);
  }
}

// 게임 번들을 버킷에 더한다. 올리는 순서와 같다: 에셋 번들(aa/) → 버전 폴더(v/<버전>/) → 채널 포인터. 어느 순간에 읽어도
// 포인터가 가리키는 것은 모두 있다. 이미 있는 번들과 버전은 내용이 같으므로 덮지 않는다(처음 빌드한 기록이 남음).
async function publish() {
  // 기준 버전은 VPS에서 받아 온 것이므로 매니페스트로 검증한 뒤에만 쓴다.
  const baseManifest = base ? await verifyManifest(base) : undefined;
  if (parts.includes("assets")) await copyRemoteContent();
  // 고르지 않은 단위는 이번 커밋의 파일을 지우고 기준 버전의 것으로 채운다. 같은 브랜치에서 작업 중인 다른 단위가 섞여 나가지 않는다.
  for (const part of PARTS.filter(part => !parts.includes(part))) {
    for (const file of await listFiles(outputDirectory)) if (partOf(file) === part) await rm(path.join(outputDirectory, file));
    for (const file of baseManifest.files.filter(file => partOf(file.path) === part)) {
      await mkdir(path.dirname(path.join(outputDirectory, file.path)), { recursive: true });
      await copyFile(path.join(base, file.path), path.join(outputDirectory, file.path));
    }
  }
  // 게임 TS를 가져왔으면 그 API도 기준 버전의 것이다(그 main.mjs가 맞춰 빌드된 API).
  const patchApi = parts.includes("game") ? api : baseManifest.api;
  const commit = process.env.GITHUB_SHA ?? null;
  const recorded = Object.fromEntries(PARTS.map(part => [part, parts.includes(part) ? commit : baseManifest.parts?.[part] ?? null]));
  const { version, files } = await writeManifest(outputDirectory, { api: patchApi, build: buildNumber(), parts: recorded, server });
  const folder = path.join(bucket, "v", version);
  if (existsSync(folder)) {
    await rm(outputDirectory, { recursive: true });
    console.log(`[TypeScript] game bundle ${version} is already in the bucket`);
  } else {
    await mkdir(path.dirname(folder), { recursive: true });
    await rename(outputDirectory, folder);
    console.log(`[TypeScript] game bundle ${version}: ${files.length} files`);
  }
  const pointer = path.join(bucket, "channels", platform, `${patchApi}.json`);
  await mkdir(path.dirname(pointer), { recursive: true });
  await writeFile(`${pointer}.tmp`, `${JSON.stringify({ version })}\n`);
  await rename(`${pointer}.tmp`, pointer);
  console.log(`[TypeScript] channel ${platform}/${patchApi} -> ${version} (${parts.join(", ")} from this commit): ${bucket}`);
}

// 게임 번들의 파일이 속한 단위. 에셋 번들은 매니페스트 밖이라 카탈로그만 assets다.
function partOf(file) {
  if (file === "main.mjs") return "game";
  if (file.startsWith("aa/")) return "assets";
  if (file.startsWith("data/")) return RULE_TABLES.includes(path.basename(file, ".bytes")) ? "rules" : "strings";
  return undefined;
}

// `directory` 아래 파일의 상대 경로(`/`로 나눔).
async function listFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter(entry => entry.isFile())
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"));
}

// CI 실행 번호(BUILD_NUMBER). 로컬 빌드는 0이다.
function buildNumber() {
  const value = process.env.BUILD_NUMBER ?? "0";
  if (!/^\d+$/.test(value)) throw new Error(`BUILD_NUMBER must be a whole number: ${value}.`);
  return Number(value);
}

// 에셋 카탈로그는 게임 번들의 aa/<플랫폼>/에 넣어 매니페스트로 코드와 함께 설치하고, 에셋 번들은 모든 버전이 함께 쓰는 버킷의
// aa/<플랫폼>/에 더한다(Addressables가 받음). 카탈로그를 받아 볼지 묻는 .hash와 숨은 파일(.DS_Store)은 쓰지 않는다.
async function copyRemoteContent() {
  if (!existsSync(remoteContent)) {
    console.warn(`[TypeScript] No remote content in ${remoteContent}; run Tools/Addressables/Build Remote Content in Unity first.`);
    return;
  }
  const catalogs = path.join(outputDirectory, "aa", platform);
  const bundles = path.join(bucket, "aa", platform);
  await mkdir(catalogs, { recursive: true });
  await mkdir(bundles, { recursive: true });
  for (const name of await readdir(remoteContent)) {
    if (name.endsWith(".hash") || name.startsWith(".")) continue;
    const source = path.join(remoteContent, name);
    if (!name.endsWith(".bundle")) {
      await copyFile(source, path.join(catalogs, name));
      continue;
    }
    // 같은 이름은 같은 내용이다(이름에 해시). 반쯤 쓴 파일이 그 이름으로 남지 않도록 다른 이름에 쓴 뒤 바꾼다.
    const target = path.join(bundles, name);
    if (existsSync(target)) continue;
    await copyFile(source, `${target}.tmp`);
    await rename(`${target}.tmp`, target);
  }
}

function copyData() {
  return cp(dataDirectory, path.join(outputDirectory, "data"), {
    recursive: true,
    filter: source => !source.endsWith(".json"),
  });
}

function typecheck() {
  const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const result = spawnSync(process.execPath, [tsc, "-p", tsconfigPath], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function watchDevelopment() {
  const { default: ts } = await import("typescript");
  const bundler = await context({ ...options, logLevel: "warning" });
  let pending = Promise.resolve();
  const rebuild = () => {
    pending = pending.then(async () => {
      try {
        await bundler.rebuild();
        await copyData();
        console.log(`[TypeScript] development output updated: ${outputDirectory}`);
      } catch {
        // 오류는 esbuild가 이미 보고했고, 마지막으로 성공한 산출물은 그대로 남는다.
      }
    });
  };

  const formatHost = {
    getCanonicalFileName: fileName => fileName,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => ts.sys.newLine,
  };
  const host = ts.createWatchCompilerHost(
    tsconfigPath, {}, ts.sys, ts.createSemanticDiagnosticsBuilderProgram,
    diagnostic => console.error(ts.formatDiagnosticsWithColorAndContext([diagnostic], formatHost)),
    (diagnostic, _newLine, _options, errorCount) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ts.sys.newLine);
      console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
      // 타입 검사가 깨끗할 때만 번들하므로, 타입 오류가 있으면 마지막 정상 산출물이 유지된다.
      if (errorCount === 0) rebuild();
    },
  );
  ts.createWatchProgram(host);
}
