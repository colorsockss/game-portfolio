// PuerTS(core, v8)를 공식 GitHub 릴리스에서 받아 Unity 프로젝트의 Packages/에 푼다. 네이티브 바이너리가
// 약 270 MB라서 저장소(LFS)에 두지 않고 버전과 체크섬을 여기에 고정한다. 같은 버전이 이미 있으면 받지 않는다.
// PuerTS를 올리려면 VERSION과 두 sha256을 함께 바꾼다.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "3.0.3";
const archives = [
  { folder: "core", file: `PuerTS_Core_${VERSION}.tar.gz`, sha256: "feafc11bf2f9dbdb7e5fd2546124a771ea69b0f7c1a194740d47cfffb721cea0" },
  { folder: "v8", file: `PuerTS_V8_${VERSION}.tar.gz`, sha256: "649b2de6dc74b24a17e1c624e5c6e98f381f05b1975b68b055ee8d5c47ea6e27" },
];
const packages = fileURLToPath(new URL("../../Packages/", import.meta.url));

for (const { folder, file, sha256 } of archives) {
  const target = path.join(packages, folder);
  const installed = await readFile(path.join(target, "package.json"), "utf8").then(JSON.parse, () => null);
  if (installed?.version === VERSION) {
    console.log(`PuerTS ${folder} ${VERSION} is already installed.`);
    continue;
  }

  const url = `https://github.com/Tencent/puerts/releases/download/Unity_v${VERSION}/${file}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== sha256) throw new Error(`Checksum mismatch for ${file}: expected ${sha256}, got ${actual}`);

  // Unity가 읽지 않는 숨김 폴더에 먼저 풀고 rename으로 옮기므로, 실패해도 반쯤 풀린 패키지가 남지 않는다.
  const staging = await mkdtemp(path.join(packages, ".puerts-"));
  try {
    const archive = path.join(staging, file);
    await writeFile(archive, bytes);
    const tar = spawnSync("tar", ["-xzf", archive, "-C", staging], { encoding: "utf8" });
    if (tar.status !== 0) throw new Error(`Failed to extract ${file}: ${tar.stderr || tar.error?.message}`);
    await rm(target, { recursive: true, force: true });
    await rename(path.join(staging, folder), target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Installed PuerTS ${folder} ${VERSION}.`);
}
