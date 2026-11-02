// `npm run balance -- [옵션]`: 시뮬레이션을 돌려 표를 찍고 CSV를 쓴다. run.mjs가 이 파일을 묶어 실행한다.
// 경로 인자는 실행한 폴더(npm run이면 저장소 루트) 기준이다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadGameData } from "@idle/data-schema";
import { HOUR, MAX_SETTLE_TICKS, SECOND, TICK_MS } from "@idle/game-core";
import { bench } from "./bench.js";
import { toCsv, toTable } from "./report.js";
import { simulate } from "./simulate.js";

const usage = `Usage: npm run balance -- [--hours 24] [--seed 1] [--online <h> --offline <h>] [--step 60] [--rebirth <level>] [--csv <file>]
                           [--formulas <project.json>]
       npm run bench (same as npm run balance -- --bench)
  --hours     hours to play (whole number)
  --seed      battle RNG seed (uint32); the same seed gives the same curve
  --online    hours online per session, then --offline hours away (offline reward on return)
  --step      seconds between settles while online (the client settles every 60)
  --rebirth   rebirth on reaching this hero level (default the max level, 0 never rebirths)
  --csv       where to write the CSV (default idle/balance/out/balance.csv)
  --formulas  Formula Lab project to run with instead of the generated formulas (run.mjs swaps them in)
  --bench     time the battle rules (settle, offline reward, an online hour) instead of playing`;

const { values } = parseArgs({
  options: {
    hours: { type: "string", default: "24" },
    seed: { type: "string", default: "1" },
    online: { type: "string" },
    offline: { type: "string", default: "0" },
    step: { type: "string", default: "60" },
    rebirth: { type: "string" },
    csv: { type: "string", default: fileURLToPath(new URL("../out/balance.csv", import.meta.url)) },
    formulas: { type: "string" },
    bench: { type: "boolean" },
    help: { type: "boolean" },
  },
});
if (values.help) {
  console.log(usage);
  process.exit(0);
}

function option(name: string, text: string, min: number, max: number, integer = false): number {
  const value = Number(text);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    console.error(`--${name} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}, got "${text}".\n\n${usage}`);
    process.exit(2);
  }
  return value;
}

const hours = option("hours", values.hours, 1, 10_000, true);
const seed = option("seed", values.seed, 0, 0xffffffff, true);
const offline = Math.round(option("offline", values.offline, 0, 10_000) * HOUR);
if (offline > 0 && values.online === undefined) {
  console.error(`--offline needs --online.\n\n${usage}`);
  process.exit(2);
}
const online = values.online === undefined ? Infinity : Math.round(option("online", values.online, 0.01, 10_000) * HOUR);
// 정산 상한보다 뜸하게 보내면 접속해 있어도 매번 오프라인 보상으로 정산된다.
const step = option("step", values.step, TICK_MS / SECOND, (MAX_SETTLE_TICKS * TICK_MS) / SECOND) * SECOND;

const dataDirectory = new URL("../../shared/data-schema/data/", import.meta.url);
const data = await loadGameData(table => readFile(new URL(`${table}.bytes`, dataDirectory)));
// 기본은 최대 레벨(HeroLevels의 마지막)에서 환생한다. 일주일 평균 전투력이 가장 높다(MANUAL의 환생).
const maxLevel = Math.max(...data.heroLevels.keys());
const rebirthLevel = values.rebirth === undefined ? maxLevel : option("rebirth", values.rebirth, 0, maxLevel, true);

if (values.bench) {
  const rows = bench(data);
  const width = Math.max(...rows.map(row => row.name.length));
  console.log(`Battle rule costs, ms (Node ${process.version}, ${os.cpus()[0]?.model ?? "unknown CPU"})`);
  for (const row of rows) {
    console.log(`${row.name.padEnd(width)}  median ${row.median.toFixed(3).padStart(8)}  p95 ${row.p95.toFixed(3).padStart(8)}  (${row.runs} runs)`);
  }
  process.exit(0);
}

const started = performance.now();
const samples = simulate(data, { hours, seed, online, offline, step, rebirthLevel });
const elapsed = performance.now() - started;

const csv = path.resolve(values.csv);
await mkdir(path.dirname(csv), { recursive: true });
await writeFile(csv, toCsv(samples, data));
process.stdout.write(toTable(samples, data));
console.log(
  `\nSimulated ${hours} h in ${elapsed.toFixed(1)} ms (${(elapsed / hours).toFixed(2)} ms per hour of play)` +
    `${values.formulas === undefined ? "" : ` with formulas from ${values.formulas}`}. CSV: ${csv}`,
);
