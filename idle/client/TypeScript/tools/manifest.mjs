// 게임 번들 디렉터리의 매니페스트(manifest.json)를 만든다: 파일마다 경로·크기·SHA-256과 그 목록과 API에서 나온 버전.
// 원격 번들 업데이트(src/application/update/update.ts)가 이것으로 바뀐 파일만 받고 받은 것을 검증한다. 릴리스 빌드가
// 버킷의 v/<버전>/으로 옮기기 전에 부른다(tools/build.mjs).
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// 매니페스트의 이름과 모양은 그것을 읽는 런타임(update.ts)이 정한다. 그 자리에서 esbuild로 번들해 불러오므로 도구가 같은
// 규칙을 따로 두지 않는다(tools/data-schema.mjs와 같은 방식).
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL("../src/application/update/update.ts", import.meta.url))],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const update = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

export const MANIFEST = update.MANIFEST;

/** 패치를 나눠 내는 단위(docs/superpowers/specs/2026-10-30-patch-design.md 4.12절). 에셋 번들은 매니페스트 밖이다. */
export const PARTS = ["game", "rules", "strings", "assets"];

/**
 * `directory` 아래 모든 파일(매니페스트 자신 제외)의 매니페스트를 써서 돌려준다. `api`는 번들이 맞춰 빌드된 C# API의
 * 지문이다. `build`(CI 실행 번호), `parts`(단위 → 그 파일을 만든 커밋), `server`(이 버전과 함께 돌 서버의 커밋)는 기록용이다.
 */
export async function writeManifest(directory, { api, build = 0, parts = {}, server = null }) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const paths = entries
    .filter(entry => entry.isFile())
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .filter(file => file !== MANIFEST)
    .sort();
  const files = [];
  for (const file of paths) {
    const bytes = await readFile(path.join(directory, file));
    files.push({ path: file, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  // 파일과 API가 같으면 버전도 같다. 바뀐 것 없이 다시 빌드해도 클라이언트는 받지 않는다. API가 다르면 같은 파일이어도
  // 다른 버전이라, 한 버전 폴더에 다른 API의 매니페스트가 들어가지 않는다. 기록용 필드는 버전에 넣지 않는다.
  const listed = files.map(file => `${file.path} ${file.sha256}\n`).join("");
  const version = createHash("sha256").update(`api ${api}\n${listed}`).digest("hex").slice(0, 16);
  const manifest = { version, api, build, parts: Object.fromEntries(PARTS.map(part => [part, parts[part] ?? null])), server, files };
  await writeFile(path.join(directory, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * `directory`의 매니페스트를 런타임과 같은 규칙(update.ts의 parseManifest: 모양, 폴더 밖·매니페스트 자신·중복 경로)으로
 * 읽고, 모든 파일이 적힌 크기와 SHA-256인지 본다. 틀리면 throw한다. 기록용 필드까지 담은 매니페스트를 돌려준다.
 * VPS에서 받아 온 버전을 조합에 쓰기 전에 부른다(tools/build.mjs의 --base, tools/patch.mjs의 pull).
 */
export async function verifyManifest(directory) {
  const text = await readFile(path.join(directory, MANIFEST), "utf8");
  for (const file of update.parseManifest(text).files) {
    const bytes = await readFile(path.join(directory, file.path));
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw new Error(`${file.path} in ${directory} does not match its manifest.`);
    }
  }
  return JSON.parse(text);
}
