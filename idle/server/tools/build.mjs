import { spawnSync } from "node:child_process";
import { cp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";

const serverRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = path.join(serverRoot, "dist");
// 테이블 데이터는 번들 옆에 두며, src/main.ts가 거기서 읽는다.
const dataDirectory = fileURLToPath(new URL("../../shared/data-schema/data/", import.meta.url));

await rm(outputDirectory, { recursive: true, force: true });
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const typecheck = spawnSync(process.execPath, [tsc, "-p", path.join(serverRoot, "tsconfig.json")], { stdio: "inherit" });
if (typecheck.error) throw typecheck.error;
if (typecheck.status !== 0) process.exit(typecheck.status ?? 1);

await build({
  absWorkingDir: serverRoot,
  entryPoints: ["src/main.ts"],
  outfile: path.join(outputDirectory, "main.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // ws는 CommonJS라 Node 내장 모듈을 require하는데, ESM 번들에는 require가 없다.
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  logLevel: "info",
});
await cp(dataDirectory, path.join(outputDirectory, "data"), {
  recursive: true,
  filter: source => !source.endsWith(".json"),
});
