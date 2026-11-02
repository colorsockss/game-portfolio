// `npm run balance -- [옵션]`: src/cli.ts를 esbuild로 묶어 실행한다. Node 22.14는 TS의 enum과 `.js`로 적은 `.ts`
// import를 그대로 돌리지 못한다. `--formulas <Formula Lab 프로젝트>`를 주면 그 프로젝트를 formula-tool의 내보내기로
// 바꾼 코드를 game-core의 formulas.ts 대신 묶는다. 생성 파일은 건드리지 않으므로 공식을 고치며 곡선을 바로 비교한다.
// `--preview`는 공식 툴의 전투 미리보기다: 표준 입력의 JSON 요청(`project`와 src/preview.ts의 PreviewRequest)에서 프로젝트를
// 같은 방법으로 바꿔 묶고, 결과를 JSON 한 줄로 표준 출력에 쓴다. 실패하면 오류 문장을 표준 오류에 쓰고 1로 끝난다.
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { build } from "esbuild";

const { values } = parseArgs({ options: { formulas: { type: "string" }, preview: { type: "boolean" } }, strict: false });
const request = values.preview === true ? await readRequest() : undefined;
const entry = fileURLToPath(new URL(request === undefined ? "src/cli.ts" : "src/preview.ts", import.meta.url));
const generated = fileURLToPath(new URL("../shared/game-core/src/formulas.ts", import.meta.url));
const exporter = fileURLToPath(new URL("../../tools/formula-tool/scripts/export-typescript.mjs", import.meta.url));

const plugins = [];
const project = request?.project === undefined ? values.formulas : await temporaryProject(request.project);
if (typeof project === "string") {
  const contents = await exportFormulas(path.resolve(project));
  // 내보낸 코드의 상대 import(./ability-type.js)는 원래 자리(game-core/src)에서 풀린다.
  plugins.push({
    name: "formulas",
    setup: build => build.onLoad({ filter: /formulas\.ts$/ }, args => (args.path === generated ? { contents, loader: "ts" } : undefined)),
  });
}

const result = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node22",
  // 묶은 코드는 data: URL로 실행하므로, 진입점(cli.ts, preview.ts)이 자기 위치에서 찾는 경로를 위해 원래 URL을
  // 넣는다. 묶이는 다른 모듈은 import.meta를 쓰지 않는다.
  define: { "import.meta.url": JSON.stringify(pathToFileURL(entry).href) },
  plugins,
  logLevel: "warning",
});
const bundled = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`);
if (request !== undefined) {
  try {
    process.stdout.write(`${JSON.stringify(await bundled.runPreview(request))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

async function readRequest() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    process.stderr.write(`The preview request on stdin is not JSON: ${error.message}\n`);
    process.exit(1);
  }
}

// 요청에 든 프로젝트를 내보내기 스크립트가 읽을 파일로 쓴다. 프로세스가 끝나면 지운다.
async function temporaryProject(contents) {
  const directory = await mkdtemp(path.join(tmpdir(), "idle-preview-"));
  process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "project.json");
  await writeFile(file, JSON.stringify(contents));
  return file;
}

async function exportFormulas(project) {
  const directory = await mkdtemp(path.join(tmpdir(), "idle-balance-"));
  try {
    const output = path.join(directory, "formulas.ts");
    const exported = spawnSync(process.execPath, [exporter, project, output], { encoding: "utf8" });
    if (exported.status !== 0) {
      process.stderr.write(exported.stdout + exported.stderr);
      process.exit(exported.status ?? 1);
    }
    return await readFile(output, "utf8");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
