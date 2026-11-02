// `npm run load -- [옵션]`: 배포 번들(dist/main.mjs)을 빌드하고, 부하 테스트(load/main.ts, 옵션은 거기)를 esbuild로 묶어
// 실행한다. Node 22.14는 TS의 enum과 `.js`로 적은 `.ts` import를 그대로 돌리지 못한다. 묶은 파일, 테스트 DB, 서버 로그는
// 임시 폴더에 두고 끝나면 지운다. 개발 DB(game.sqlite)는 건드리지 않는다.
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const built = spawnSync(process.execPath, [fileURLToPath(new URL("build.mjs", import.meta.url))], { stdio: "inherit" });
if (built.error) throw built.error;
if (built.status !== 0) process.exit(built.status ?? 1);

const entry = fileURLToPath(new URL("load/main.ts", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "idle-load-"));
try {
  const outfile = path.join(directory, "load.mjs");
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    // ws는 CommonJS라 Node 내장 모듈을 require한다(build.mjs와 같다). 진입점이 자기 위치에서 찾는 경로(서버 번들, probe,
    // 테이블 데이터)를 위해 import.meta.url은 원래 파일의 것으로 둔다.
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    define: { "import.meta.url": JSON.stringify(pathToFileURL(entry).href) },
    logLevel: "warning",
  });
  const { runLoad } = await import(pathToFileURL(outfile).href);
  await runLoad(directory);
} finally {
  await rm(directory, { recursive: true, force: true });
}
