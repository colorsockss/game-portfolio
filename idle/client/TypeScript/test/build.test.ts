import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { describe, expect, test } from "vitest";
import { MANIFEST, channelPath, parseManifest, parsePointer, versionPath } from "../src/application/update/update.js";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
const dataDirectory = fileURLToPath(new URL("../../../shared/data-schema/data/", import.meta.url));
// Unity의 Tools/Addressables/Build Remote Content가 만든 Android 에셋(없으면 릴리스 빌드는 에셋 없이 나온다).
const remoteContent = fileURLToPath(new URL("../../ServerData/Android/", import.meta.url));
// 릴리스 빌드가 더하는 로컬 버킷.
const bucket = path.join(clientRoot, "dist", "patch");
// 앱의 C# API 지문. 빌드가 번들의 RUNTIME_API와 매니페스트의 api로 넣는다.
const api = /^\/\/ API 지문: ([0-9a-f]{16})$/m.exec(await readFile(path.join(clientRoot, "types", "csharp.d.ts"), "utf8"))![1];
// Node가 번들의 외부 "csharp"·"puerts" import를 해석하도록 test/support/puerts-host.mjs를 등록한다.
const puertsHost = `data:text/javascript,import{register}from"node:module";register(${JSON.stringify(
  new URL("./support/puerts-host.mjs", import.meta.url).href)})`;
// PuerTS V8에는 TextEncoder/TextDecoder가 없으므로, 번들이 MessagePack을 불러오기 전에 직접 설치해야 한다.
const withoutTextEncoding = "data:text/javascript,delete globalThis.TextEncoder;delete globalThis.TextDecoder";

describe.each(["development", "release"])("%s artifact", mode => {
  test("builds a boot and a game bundle that run like PuerTS: timers, game data, no host globals", async () => {
    const build = (env: Record<string, string> = {}) =>
      spawnSync(process.execPath, ["tools/build.mjs", mode], { cwd: clientRoot, encoding: "utf8", env: { ...process.env, ...env } });
    const built = build();
    expect(built.status, built.stdout + built.stderr).toBe(0);
    // 릴리스의 게임 번들은 앱의 채널이 가리키는 버킷의 버전 폴더에 있다.
    const pointer = path.join(bucket, channelPath(api));
    const version = mode === "release" ? parsePointer(await readFile(pointer, "utf8")).version : "";
    const output = mode === "development" ? path.join(clientRoot, "dist", mode) : path.join(bucket, versionPath(version));
    const entry = path.join(output, mode === "development" ? "main.js" : "main.mjs");
    // 릴리스의 부트 번들은 앱에 들도록 Resources에 놓인다.
    const boot = mode === "development" ? path.join(output, "boot.js") : path.join(clientRoot, "../Assets/Resources/TypeScript/boot.mjs");
    const host = (file: string) => spawnSync(process.execPath, ["--import", puertsHost, "--import", withoutTextEncoding, file], { encoding: "utf8" });

    const run = host(entry);
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toMatch(/Runtime tick ready/);
    // 테이블 수는 debug 줄이라 릴리즈 빌드는 버린다(BUILD_MODE).
    const counts = /\[data\] Items: \d+, Monsters: \d+, Skills: \d+, Stages: \d+/;
    if (mode === "development") expect(run.stdout).toMatch(counts);
    else expect(run.stdout).not.toMatch(counts);
    // 게임의 흐름이 시작해서 로그인에서 기다린다. 패치는 부트가 끝냈다.
    expect(run.stdout).toMatch(/\[flow\] boot\n\[flow\] login\n/);
    expect(run.stderr).toBe("");

    // 개발 빌드의 부트는 패치하지 않고 바로 게임으로 넘어간다. 릴리스의 부트는 패치를 받으러 가므로 여기서 돌리지 않는다.
    if (mode === "development") {
      const booted = host(boot);
      expect(booted.status, booted.stderr).toBe(0);
      expect(booted.stdout).toBe("[host] StartGame\n");
      expect(booted.stderr).toBe("");
    }

    // 데이터는 게임의 진입 모듈 옆에 함께 담기고, 실행 중에는 MessagePack 파일만 필요하다.
    const tables = (await readdir(dataDirectory)).filter(file => file.endsWith(".bytes")).sort();
    expect((await readdir(path.join(output, "data"))).sort()).toEqual(tables);

    // 부트는 앱의 API 채널을 따른다(RUNTIME_API). 플레이어 빌드 전처리도 이것을 찾는다.
    expect(await readFile(boot, "utf8")).toContain(api);
    // PuerTS는 패키지 경로를 해석하지 못하므로, 워크스페이스 import는 두 모드 모두 번들에 넣어야 한다.
    for (const file of [entry, boot]) {
      const code = await readFile(file, "utf8");
      expect(code).not.toMatch(/@idle\//);
      const imports = [...code.matchAll(/\bimport\s*[\w$]*\s*from\s*"([^"]+)"/g)].map(match => match[1]);
      expect([...new Set(imports)].sort()).toEqual(["csharp", "puerts"]);
    }
    const code = await readFile(entry, "utf8");
    if (mode === "development") {
      expect((await readdir(output)).sort()).toEqual(["boot.js", "boot.js.map", "data", "main.js", "main.js.map"]);
      expect(code).toMatch(/sourceMappingURL=main\.js\.map/);
      const map = JSON.parse(await readFile(`${entry}.map`, "utf8")) as { sources: string[]; sourcesContent: string[] };
      expect(map.sources.some(source => source.endsWith("src/main.ts"))).toBe(true);
      // 공용 패키지 소스도 맵에 들어 있어서 그곳에서도 중단점이 동작한다.
      const shared = map.sources.findIndex(source => source.endsWith("shared/data-schema/src/index.ts"));
      expect(shared, map.sources.join(", ")).toBeGreaterThanOrEqual(0);
      expect(map.sourcesContent[shared]).toContain("loadGameData");
      // 부트는 패치 화면만 띄우므로 게임 규칙을 담지 않는다.
      const bootMap = JSON.parse(await readFile(`${boot}.map`, "utf8")) as { sources: string[] };
      expect(bootMap.sources.filter(source => /shared\/game-core|adapters\/net|presentation\/world/.test(source))).toEqual([]);
    } else {
      // 버전 폴더에는 게임 번들만 있다. Unity가 에셋을 빌드해 두었으면(ServerData/Android) 그 카탈로그도 있다.
      const assets = existsSync(remoteContent);
      expect((await readdir(output)).sort()).toEqual([...(assets ? ["aa"] : []), "data", "main.mjs", MANIFEST]);
      expect(code).not.toMatch(/sourceMappingURL/);
      // 매니페스트(tools/manifest.mjs)는 클라이언트가 읽는 모양이고, 채널의 버전과 앱의 API를 적고, 번들의 모든 파일을 크기와
      // 해시로 적는다. 에셋 번들은 Addressables가 받으므로 카탈로그만 적는다.
      const text = await readFile(path.join(output, MANIFEST), "utf8");
      const manifest = parseManifest(text);
      expect({ version: manifest.version, api: manifest.api }).toEqual({ version, api });
      const catalogs = assets ? ["aa/Android/catalog_remote.bin"] : [];
      expect(manifest.files.map(file => file.path).sort()).toEqual(["main.mjs", ...tables.map(table => `data/${table}`), ...catalogs].sort());
      for (const file of manifest.files) {
        const bytes = await readFile(path.join(output, file.path));
        expect({ size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }).toEqual({ size: file.size, sha256: file.sha256 });
      }
      // 에셋 번들은 버전 폴더가 아니라 모든 버전이 함께 쓰는 버킷의 aa/Android/에 있다.
      if (assets) {
        const bundles = (await readdir(remoteContent)).filter(file => file.endsWith(".bundle"));
        expect(bundles.length).toBeGreaterThan(0);
        for (const name of bundles) expect(existsSync(path.join(bucket, "aa", "Android", name)), name).toBe(true);
        expect((await readdir(path.join(output, "aa", "Android"))).filter(file => file.endsWith(".bundle"))).toEqual([]);
      }
      // 같은 내용을 다른 빌드 번호로 다시 빌드하면 같은 버전이고, 이미 있는 버전 폴더를 덮지 않는다(처음 빌드의 기록이 남음).
      const again = build({ BUILD_NUMBER: "7", GITHUB_SHA: "0".repeat(40) });
      expect(again.status, again.stdout + again.stderr).toBe(0);
      expect(again.stdout).toContain(`game bundle ${version} is already in the bucket`);
      expect(parsePointer(await readFile(pointer, "utf8")).version).toBe(version);
      expect(await readFile(path.join(output, MANIFEST), "utf8")).toBe(text);
    }
    // 빌드와 실행에 몇 초가 걸려 부하가 있으면 기본 5초를 넘는다. 릴리스는 두 번 빌드한다.
  }, 60_000);
});

type ManifestOptions = { api: string; build?: number; parts?: Record<string, string | null>; server?: string | null };
type WriteManifest = (directory: string, options: ManifestOptions) => Promise<{ version: string }>;
type VerifyManifest = (directory: string) => Promise<{ parts: Record<string, string | null> }>;
const { writeManifest, verifyManifest } = await import(new URL("../tools/manifest.mjs", import.meta.url).href) as {
  writeManifest: WriteManifest;
  verifyManifest: VerifyManifest;
};

test("a fetched version's manifest is read by the runtime's rules before its files are checked", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "manifest-"));
  try {
    await writeFile(path.join(directory, "main.mjs"), "code");
    await writeManifest(directory, { api: "0123456789abcdef", parts: { game: "abc" } });
    expect((await verifyManifest(directory)).parts.game).toBe("abc");

    // 같은 경로가 두 번 있으면 해시가 맞아도 런타임처럼 거절한다.
    const manifest = JSON.parse(await readFile(path.join(directory, MANIFEST), "utf8")) as { files: unknown[] };
    await writeFile(path.join(directory, MANIFEST), JSON.stringify({ ...manifest, files: [...manifest.files, ...manifest.files] }));
    await expect(verifyManifest(directory)).rejects.toThrow("malformed file");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("the manifest's version follows the files and the API, not the build number or the recorded commits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "manifest-"));
  try {
    await writeFile(path.join(directory, "main.mjs"), "code");
    const { version } = await writeManifest(directory, { api: "0123456789abcdef" });
    expect((await writeManifest(directory, { api: "0123456789abcdef", build: 7, parts: { game: "abc" }, server: "def" })).version).toBe(version);
    expect((await writeManifest(directory, { api: "fedcba9876543210" })).version).not.toBe(version);
    await writeFile(path.join(directory, "main.mjs"), "code 2");
    expect((await writeManifest(directory, { api: "0123456789abcdef" })).version).not.toBe(version);
  } finally {
    await rm(directory, { recursive: true });
  }
});

// 단위로 나눠 낼 때(4.12절): 고른 단위만 이번 커밋에서 만들고, 나머지는 기준 버전의 파일을 그대로 쓰며 그 커밋 기록도 잇는다.
test("a release of some parts takes the other parts' files and commits from the base version", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "compose-"));
  const run = (...args: string[]) => spawnSync(process.execPath, ["tools/build.mjs", "release", ...args], {
    cwd: clientRoot, encoding: "utf8", env: { ...process.env, GITHUB_SHA: "c".repeat(40) },
  });
  try {
    // 기준 버전: 이번 커밋으로 전부 만든 뒤 문장 테이블만 다른 내용으로 바꾸고 다른 커밋에서 온 것으로 적는다.
    const full = run(`--bucket=${path.join(root, "full")}`);
    expect(full.status, full.stdout + full.stderr).toBe(0);
    const built = parsePointer(await readFile(path.join(root, "full", channelPath(api)), "utf8")).version;
    const base = path.join(root, "base");
    await cp(path.join(root, "full", versionPath(built)), base, { recursive: true });
    await writeFile(path.join(base, "data", "Strings.bytes"), "strings from the base");
    await writeManifest(base, { api, parts: { game: "b".repeat(40), rules: "b".repeat(40), strings: "b".repeat(40), assets: "b".repeat(40) } });

    const some = run(`--bucket=${path.join(root, "some")}`, "--parts=game,rules", `--base=${base}`, `--server=${"d".repeat(40)}`);
    expect(some.status, some.stdout + some.stderr).toBe(0);
    const version = parsePointer(await readFile(path.join(root, "some", channelPath(api)), "utf8")).version;
    const folder = path.join(root, "some", versionPath(version));
    expect(await readFile(path.join(folder, "data", "Strings.bytes"), "utf8")).toBe("strings from the base");
    expect(await readFile(path.join(folder, "data", "Items.bytes"))).toEqual(await readFile(path.join(dataDirectory, "Items.bytes")));
    const manifest = JSON.parse(await readFile(path.join(folder, MANIFEST), "utf8")) as { parts: Record<string, string>; server: string };
    expect(manifest.parts).toEqual({ game: "c".repeat(40), rules: "c".repeat(40), strings: "b".repeat(40), assets: "b".repeat(40) });
    expect(manifest.server).toBe("d".repeat(40));

    // 받아 온 기준 버전은 매니페스트와 맞아야 쓴다.
    await writeFile(path.join(base, "main.mjs"), "tampered");
    const tampered = run(`--bucket=${path.join(root, "tampered")}`, "--parts=rules", `--base=${base}`);
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain("does not match its manifest");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 90_000);
