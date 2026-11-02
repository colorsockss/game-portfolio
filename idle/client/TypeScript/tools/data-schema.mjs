// 공용 패키지 @idle/data-schema(TypeScript)의 규칙 테이블 목록과 지문을 Node 도구에서 쓴다. 그 자리에서 esbuild로 번들해
// 불러오므로 도구가 같은 목록이나 지문 계산을 따로 정의하지 않는다(tools/build.mjs, tools/release-check.mjs).
//   node tools/data-schema.mjs <데이터 폴더>: 그 폴더의 규칙 테이블 지문을 찍는다(CI가 이 커밋과 Live 서버의 규칙을 견줌).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const clientRoot = fileURLToPath(new URL("../", import.meta.url));
const { outputFiles } = await build({
  stdin: { contents: 'export { RULE_TABLES, fingerprint } from "@idle/data-schema";', resolveDir: clientRoot, loader: "ts" },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  logLevel: "silent",
});
const module = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);

/** 서버가 클라이언트와 견주는 규칙 테이블의 이름. 나머지 테이블(문장, 소리)은 클라이언트만 쓴다. */
export const RULE_TABLES = module.RULE_TABLES;

/** 규칙 테이블 바이트(RULE_TABLES 순서)의 지문. 소켓 경로의 `d=`와 같은 값이다. */
export const fingerprint = module.fingerprint;

/** 데이터 폴더(`<테이블>.bytes`)의 규칙 테이블 지문. */
export async function ruleFingerprint(folder) {
  return fingerprint(await Promise.all(RULE_TABLES.map(table => readFile(path.join(folder, `${table}.bytes`)))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(await ruleFingerprint(process.argv[2]));
