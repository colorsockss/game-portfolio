// 통합 워크스페이스용 인프로세스 게임 서버(import "@idle/server/testing"): 메모리의 SQLite 저장소
// 위에서 실제 프로토콜 처리를 그대로 돌린다. main.ts는 이것을 import하지 않으므로 배포되지 않는다.
import { readFile } from "node:fs/promises";
import { loadGameData, type GameData } from "@idle/data-schema";
import { createLog, type Logger } from "./log.js";
import { createRpc, type Clock } from "./rpc.js";
import { openStore } from "./store.js";

const dataDirectory = new URL("../../shared/data-schema/data/", import.meta.url);

/** 배포되는 테이블. shared/data-schema에서 읽는다. */
export function loadTestData(): Promise<GameData> {
  return loadGameData(table => readFile(new URL(`${table}.bytes`, dataDirectory)));
}

export interface TestServerOptions {
  /** 서버의 시각. 기본값은 이 기기의 시계다. */
  readonly clock?: Clock;
  /** 기본으로는 경고와 오류만 보여 주고 요청 로그는 보여 주지 않는다. */
  readonly log?: Logger;
  /** 개발 모드의 서버처럼 치트를 받는지. 기본은 릴리즈처럼 받지 않는다. */
  readonly cheats?: boolean;
}

const quiet = createLog(console, "warn")("rpc");

export async function createTestServer(
  data: GameData, { clock = { now: () => Date.now() }, log = quiet, cheats }: TestServerOptions = {},
) {
  const store = await openStore(":memory:");
  const rpc = createRpc({ store, clock, data, log, cheats });
  return { rpc, store };
}
