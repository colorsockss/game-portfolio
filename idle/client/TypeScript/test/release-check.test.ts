import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, test } from "vitest";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
const dataDirectory = fileURLToPath(new URL("../../../shared/data-schema/data/", import.meta.url));

// 임시 git 저장소: base → client(클라이언트만 바뀜) → shared(공용 코드가 바뀜). 패치와 서버의 data 폴더는 진짜 테이블을 복사한다.
let root: string;
let repo: string;
const commits: Record<string, string> = {};

function git(...args: string[]) {
  const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function commit(name: string, file: string, text: string) {
  await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
  await writeFile(path.join(repo, file), text);
  git("add", "-A");
  git("-c", "user.name=test", "-c", "user.email=test@example.com", "commit", "-q", "-m", name);
  commits[name] = git("rev-parse", "HEAD");
}

async function patchFolder(name: string, parts: Record<string, string>) {
  const folder = path.join(root, name);
  await cp(dataDirectory, path.join(folder, "data"), { recursive: true, filter: source => !source.endsWith(".json") });
  await writeFile(path.join(folder, "manifest.json"), JSON.stringify({ version: "1111111111111111", parts }));
  return folder;
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "release-check-"));
  repo = path.join(root, "repo");
  await mkdir(repo);
  git("init", "-q");
  await commit("base", "idle/shared/rules.ts", "export const rule = 1;");
  await commit("client", "idle/client/TypeScript/src/unity/views/main.ts", "export {};");
  await commit("shared", "idle/shared/rules.ts", "export const rule = 2;");
  await cp(dataDirectory, path.join(root, "server-data"), { recursive: true, filter: source => !source.endsWith(".json") });
});

afterEach(() => rm(root, { recursive: true, force: true }));

const check = (patch: string, server: string) => spawnSync(process.execPath, [
  "tools/release-check.mjs", `--patch=${patch}`, `--server-data=${path.join(root, "server-data")}`, `--server-commit=${server}`, `--repo=${repo}`,
], { cwd: clientRoot, encoding: "utf8" });

test("a patch whose rule tables and shared code match the server passes, and text tables do not count", async () => {
  const patch = await patchFolder("patch", { game: commits.client, assets: commits.client });
  // 문장은 규칙 지문에 들지 않는다.
  await writeFile(path.join(patch, "data", "Strings.bytes"), "other strings");
  const run = check(patch, commits.base);
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout).toMatch(/rule tables [0-9a-f]{8} match the server/);
});

test("the rule fingerprint of a data folder ignores text tables and changes with a rule table", async () => {
  const folder = path.join(root, "server-data");
  const print = () => spawnSync(process.execPath, ["tools/data-schema.mjs", folder], { cwd: clientRoot, encoding: "utf8" });
  const before = print();
  expect(before.stdout, before.stderr).toMatch(/^[0-9a-f]{8}\n$/);
  await writeFile(path.join(folder, "Strings.bytes"), "other strings");
  expect(print().stdout).toBe(before.stdout);
  await writeFile(path.join(folder, "Items.bytes"), "other items");
  expect(print().stdout).not.toBe(before.stdout);
});

test("a patch with other rule tables than the server stops", async () => {
  const patch = await patchFolder("patch", { game: commits.base });
  await writeFile(path.join(patch, "data", "Items.bytes"), "other items");
  const run = check(patch, commits.base);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("release the rule tables with the server");
});

test("a game bundle built from other shared code than the server stops", async () => {
  const run = check(await patchFolder("patch", { game: commits.shared }), commits.base);
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("idle/shared differs");
});

test("a patch without per-unit commits stops, and differing views between the game and the assets only warn", async () => {
  const unrecorded = check(await patchFolder("old", {}), commits.base);
  expect(unrecorded.stderr).toContain("release every unit once");
  const mixed = check(await patchFolder("mixed", { game: commits.client, assets: commits.base }), commits.base);
  expect(mixed.status, mixed.stderr).toBe(0);
  expect(mixed.stdout).toContain("::warning::");
});
