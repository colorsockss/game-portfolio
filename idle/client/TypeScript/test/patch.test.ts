import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";
import { channelPath, versionPath } from "../src/application/update/update.js";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
// 앱의 C# API 지문. 내보내기는 이 API의 버전만 채널에 올린다.
const api = /^\/\/ API 지문: ([0-9a-f]{16})$/m.exec(await readFile(path.join(clientRoot, "types", "csharp.d.ts"), "utf8"))![1];
const version = "1111111111111111";
const otherApiVersion = "2222222222222222";

// 로컬 버킷과, VPS 대신 쓰는 로컬 폴더. rsync는 로컬 폴더도 같은 방식으로 다룬다.
let root: string;
let bucket: string;
let target: string;

async function put(base: string, file: string, text: string) {
  await mkdir(path.dirname(path.join(base, file)), { recursive: true });
  await writeFile(path.join(base, file), text);
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const manifest = (v: string, forApi: string, files: Record<string, string> = {}) => JSON.stringify({
  version: v, api: forApi, build: 0, parts: {}, server: null,
  files: Object.entries(files).map(([file, text]) => ({ path: file, size: text.length, sha256: sha256(text) })),
});

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "patch-test-"));
  bucket = path.join(root, "bucket");
  target = path.join(root, "vps");
  await mkdir(target);
  await put(bucket, "aa/Android/ui_1.bundle", "new bundle");
  await put(bucket, "aa/Android/battle_1.bundle", "battle");
  await put(bucket, "aa/Android/battle_1.bundle.tmp", "half written");
  await put(bucket, `${versionPath(version)}manifest.json`, manifest(version, api, { "main.mjs": "code" }));
  await put(bucket, `${versionPath(version)}main.mjs`, "code");
  await put(bucket, `${versionPath(otherApiVersion)}manifest.json`, manifest(otherApiVersion, "fedcba9876543210"));
  // 로컬 시연용 포인터는 올리지 않는다.
  await put(bucket, channelPath(api), JSON.stringify({ version }));
});

afterEach(() => rm(root, { recursive: true, force: true }));

const patch = (...args: string[]) => spawnSync(process.execPath, ["tools/patch.mjs", ...args], {
  cwd: clientRoot, encoding: "utf8", env: { ...process.env, PATCH_BUCKET: bucket, PATCH_TARGET: target },
});

test("upload adds the asset bundles and version folders, keeps what is there and leaves the channels alone", async () => {
  // 같은 이름은 같은 내용이므로, 이미 있는 것은 덮지 않는다.
  await put(target, "aa/Android/ui_1.bundle", "uploaded before");
  const run = patch("upload");
  expect(run.status, run.stderr).toBe(0);
  expect(await readFile(path.join(target, "aa/Android/ui_1.bundle"), "utf8")).toBe("uploaded before");
  expect(await readFile(path.join(target, "aa/Android/battle_1.bundle"), "utf8")).toBe("battle");
  expect(existsSync(path.join(target, "aa/Android/battle_1.bundle.tmp"))).toBe(false);
  expect(await readFile(path.join(target, `${versionPath(version)}main.mjs`), "utf8")).toBe("code");
  expect(existsSync(path.join(target, "channels"))).toBe(false);
});

test("release moves this API's channel to an uploaded version and status shows it", async () => {
  expect(patch("upload").status).toBe(0);
  expect(patch("status").stdout).toContain("[patch] no channel pointers");
  const run = patch("release", version);
  expect(run.status, run.stderr).toBe(0);
  expect(JSON.parse(await readFile(path.join(target, channelPath(api)), "utf8"))).toEqual({ version });
  expect(patch("status").stdout).toContain(`[patch] Android/${api} -> ${version}`);
});

test("release refuses a version that is not uploaded and moves the channel of the version's own API", async () => {
  expect(patch("upload").status).toBe(0);
  expect(patch("release", "3333333333333333").status).not.toBe(0);
  expect(patch("release", "v1").status).not.toBe(0);
  expect(existsSync(path.join(target, "channels"))).toBe(false);
  // 다른 API로 빌드된 버전은 그 API의 채널로 간다(그 API의 앱이 받음). 이 커밋의 채널은 그대로다.
  const other = patch("release", otherApiVersion);
  expect(other.status, other.stderr).toBe(0);
  expect(JSON.parse(await readFile(path.join(target, channelPath("fedcba9876543210")), "utf8"))).toEqual({ version: otherApiVersion });
  expect(existsSync(path.join(target, channelPath(api)))).toBe(false);
});

test("pull fetches the current or a named version and checks it against its manifest", async () => {
  expect(patch("upload").status).toBe(0);
  // 이 API의 채널이 아직 없으면 기준이 없다.
  expect(patch("pull", "current", path.join(root, "none")).stderr).toContain(`No patch is published for API ${api}`);
  expect(patch("release", version).status).toBe(0);
  const pulled = patch("pull", "current", path.join(root, "base"));
  expect(pulled.status, pulled.stderr).toBe(0);
  expect(await readFile(path.join(root, "base", "main.mjs"), "utf8")).toBe("code");
  // 올라간 파일이 매니페스트와 다르면 쓰지 않는다.
  await writeFile(path.join(target, `${versionPath(version)}main.mjs`), "tampered");
  const tampered = patch("pull", version, path.join(root, "tampered"));
  expect(tampered.status).not.toBe(0);
  expect(tampered.stderr).toContain("does not match its manifest");
});
