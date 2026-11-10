// 게임 서버 진입점. 공용 패키지는 esbuild가 TypeScript 소스에서 바로 번들한다.
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { loadGameData } from "@idle/data-schema";
import { HOUR } from "@idle/game-core";
import { socketPath } from "@idle/protocol";
import { backupDatabase } from "./backup.js";
import { createLog } from "./log.js";
import { createRpc } from "./rpc.js";
import { openStore } from "./store.js";
import { createGameServer } from "./transport.js";

// 개발과 릴리즈를 가르는 곳은 여기 하나다. 개발 모드만 치트를 받고 debug 로그를 남긴다. 정하지 않으면 릴리즈라서
// 배포한 서버가 치트를 열지 않는다.
const mode = process.env.SERVER_MODE ?? "release";
if (mode !== "development" && mode !== "release") throw new Error(`SERVER_MODE must be development or release, got ${mode}.`);
const port = Number(process.env.PORT ?? 8080);
// 열 주소. Live VPS는 Caddy 뒤의 127.0.0.1만 연다(server/deploy/setup.sh). 정하지 않으면 모든 인터페이스다.
const host = process.env.HOST;
// SQLite 파일. 작업 디렉터리 기준 경로이며, ":memory:"이면 종료 뒤에 아무것도 남지 않는다.
const databasePath = process.env.DATABASE_PATH ?? "game.sqlite";

const log = createLog(console, mode === "development" ? "debug" : "info");
const main = log("server");
// tools/build.mjs가 테이블 데이터를 이 번들 옆의 data/로 복사한다.
const data = await loadGameData(table => readFile(new URL(`./data/${table}.bytes`, import.meta.url)));
main.info(`GameData Items: ${data.items.size}, Monsters: ${data.monsters.size}, Skills: ${data.skills.size}, Stages: ${data.stages.size}`);

// 하루에 하나씩 DB 옆의 backup/에 사본을 남긴다(backup.ts). 열기 전에 먼저 해서, 이 서버가 스키마를 올리기 전의 DB가 남는다.
// 그 뒤로는 날이 바뀌었는지를 한 시간마다 본다. 실패해도 서버는 돈다.
function backup(): void {
  if (databasePath === ":memory:") return;
  try {
    const copy = backupDatabase(databasePath, path.join(path.dirname(databasePath), "backup"), Date.now());
    if (copy) main.info(`Backed up to ${copy}`);
  } catch (error) {
    main.error("The database backup failed:", error);
  }
}
backup();
setInterval(backup, HOUR).unref();

const store = await openStore(databasePath);
main.info(`Saves in ${databasePath}`);
const rpc = createRpc({ store, clock: { now: () => Date.now() }, data, log: log("rpc"), cheats: mode === "development" });
const server = createGameServer(rpc, { log: log("ws"), dataVersion: data.version });
server.http.listen(port, host, () => {
  // 실제로 열린 포트. PORT=0(빈 포트 아무거나)이어도 어디로 접속할지 알려 준다.
  const { port: bound } = server.http.address() as AddressInfo;
  main.info(`Listening on ws://${host ?? "localhost"}:${bound}${socketPath(data.version)} (${mode})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void server.close().finally(() => store.close()));
}
