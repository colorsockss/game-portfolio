// 로컬 버킷(릴리스 빌드의 dist/patch)을 Live의 패치 폴더로 내보낸다(docs/superpowers/specs/2026-10-30-patch-design.md 4.7절).
//   node tools/patch.mjs upload           에셋 번들(aa/) → 버전 폴더(v/) 순서로 올린다. 이미 있는 이름은 건너뛰고 포인터는 올리지 않는다.
//   node tools/patch.mjs release <버전>    그 버전이 올라가 있는지 본 뒤, 그 버전의 API 채널 포인터를 그것으로 옮긴다.
//   node tools/patch.mjs status           올라간 채널 포인터마다 API 지문과 가리키는 버전을 보인다.
//   node tools/patch.mjs pull <버전|current> <폴더>   올라간 버전 폴더를 받아 매니페스트로 검증한다. current는 이 커밋의 API
//                                         채널이 가리키는 버전이다. 단위로 나눠 낼 때 기준 버전으로 쓴다(4.12절).
// 대상은 PATCH_TARGET(rsync 주소. Live는 deploy@idle.dennou.cloud:/srv/idle/patch, 시험은 로컬 폴더)이고, SSH 옵션은
// PATCH_SSH(예: ssh -i ~/Keys/idle-deploy)로 받는다. 읽기와 쓰기가 모두 rsync라서, 파일 하나는 임시 이름에 쓴 뒤 바꿔
// 넣는다(포인터를 반쯤 읽는 일이 없음). PATCH_BUCKET은 올릴 로컬 버킷이다(기본 dist/patch).
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readApi } from "./api.mjs";
import { verifyManifest } from "./manifest.mjs";
import { CHANNELS, MANIFEST, PLATFORM, channelPath, isVersion, versionPath } from "./update.mjs";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
const bucket = process.env.PATCH_BUCKET ?? path.join(clientRoot, "dist", "patch");
const target = process.env.PATCH_TARGET;
const [command, version, into] = process.argv.slice(2);

if (!target) throw new Error("Set PATCH_TARGET to the patch folder, e.g. deploy@idle.dennou.cloud:/srv/idle/patch.");
if (command === "upload") await upload();
else if (command === "release") await release(version);
else if (command === "status") await status();
else if (command === "pull") await pull(version, into);
else throw new Error("Usage: node tools/patch.mjs upload | release <version> | status | pull <version|current> <folder>");

async function upload() {
  // 포인터가 가리킬 것이 먼저 다 있어야 하므로 번들 → 버전 순서다. 숨은 파일과 빌드가 쓰다 남긴 임시 파일은 올리지 않는다.
  for (const folder of ["aa", "v"]) {
    rsync("-rt", "--ignore-existing", "--exclude=*.tmp", "--exclude=.*", `${path.join(bucket, folder)}/`, `${target}/${folder}/`);
    console.log(`[patch] uploaded ${folder}/`);
  }
}

async function release(next) {
  checkVersion(next);
  // 올라간 매니페스트를 받아 본다. 없으면 rsync가 실패한다. 포인터는 그 버전이 맞춰 빌드된 API의 채널이다(롤백도 같음).
  const api = await withTemp(async pulled => {
    rsync("-t", `${target}/${versionPath(next)}${MANIFEST}`, `${pulled}/`);
    const manifest = JSON.parse(await readFile(path.join(pulled, MANIFEST), "utf8"));
    if (manifest.version !== next) throw new Error(`${versionPath(next)} holds version ${manifest.version}.`);
    return manifest.api;
  });
  await withTemp(async staged => {
    await mkdir(path.join(staged, CHANNELS), { recursive: true });
    await writeFile(path.join(staged, channelPath(api)), `${JSON.stringify({ version: next })}\n`);
    rsync("-rt", `${staged}/`, `${target}/`);
  });
  console.log(`[patch] channel ${PLATFORM}/${api} -> ${next}`);
}

async function status() {
  await withTemp(async pulled => {
    // 포인터를 아직 올린 적이 없으면 받을 것이 없다.
    const pulledOk = run(["-rt", `${target}/${CHANNELS}`, `${pulled}/`]).status === 0;
    const names = pulledOk ? (await readdir(pulled)).filter(name => name.endsWith(".json")).sort() : [];
    if (names.length === 0) console.log("[patch] no channel pointers");
    for (const name of names) {
      const { version: pointed } = JSON.parse(await readFile(path.join(pulled, name), "utf8"));
      console.log(`[patch] ${PLATFORM}/${path.basename(name, ".json")} -> ${pointed}`);
    }
  });
}

async function pull(wanted, folder) {
  if (!folder) throw new Error("Usage: node tools/patch.mjs pull <version|current> <folder>");
  const resolved = wanted === "current" ? await currentVersion() : wanted;
  checkVersion(resolved);
  rsync("-rt", `${target}/${versionPath(resolved)}`, `${path.resolve(folder)}/`);
  await verifyManifest(path.resolve(folder));
  console.log(`[patch] pulled ${resolved} into ${folder}`);
}

// 이 커밋의 API 채널이 가리키는 버전. 채널이 없으면(새 API) 가져올 기준이 없으므로 멈춘다.
async function currentVersion() {
  const api = await readApi(clientRoot);
  return withTemp(async pulled => {
    if (run(["-t", `${target}/${channelPath(api)}`, `${pulled}/`]).status !== 0) {
      throw new Error(`No patch is published for API ${api}; a new API needs a full patch.`);
    }
    return JSON.parse(await readFile(path.join(pulled, path.basename(channelPath(api))), "utf8")).version;
  });
}

function checkVersion(value) {
  if (!isVersion(value ?? "")) throw new Error(`Expected a 16-digit hex version, got ${value}.`);
}

async function withTemp(use) {
  const directory = await mkdtemp(path.join(tmpdir(), "idle-patch-"));
  try {
    return await use(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function rsync(...args) {
  const result = run(args);
  if (result.status !== 0) throw new Error(`rsync ${args.join(" ")} failed:\n${result.stderr}`);
}

function run(args) {
  const ssh = process.env.PATCH_SSH ? ["-e", process.env.PATCH_SSH] : [];
  const result = spawnSync("rsync", [...ssh, ...args], { encoding: "utf8" });
  if (result.error) throw result.error;
  return result;
}
