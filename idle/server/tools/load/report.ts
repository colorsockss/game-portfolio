// 부하 테스트(main.ts)의 계산. 서버 없이 테스트한다(test/load.test.ts).

const GiB = 1024 ** 3;

/** probe.mjs가 답하는 서버 프로세스의 누적 값. */
export interface Sample {
  /** process.cpuUsage(), µs. 모든 스레드(GC 도우미 포함)의 합이다. */
  readonly cpu: { readonly user: number; readonly system: number };
  /** performance.eventLoopUtilization(), ms. 메인 스레드가 일한 시간과 기다린 시간이다. */
  readonly elu: { readonly active: number; readonly idle: number };
  readonly rss: number;
  readonly heapUsed: number;
  readonly maxRss: number;
  /** SQLite 문장에 쓴 시간(ms)과 문장 수. */
  readonly sqliteMs: number;
  readonly sqliteCalls: number;
  /** 그중 트랜잭션(SAVEPOINT, RELEASE, 커밋의 fsync)에 쓴 시간(ms). */
  readonly transactionMs: number;
  /** 앞 표본 뒤로 가장 오래 걸린 SQLite 호출 하나(ms)와 그 SQL. */
  readonly longestMs: number;
  readonly longestSql: string;
}

/** 오름차순 `sorted`의 `q`(0–1) 분위수. 가장 가까운 순위 방식이며, 비어 있으면 NaN이다. */
export function percentile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))]!;
}

/** 두 표본 사이에 서버가 쓴 몫. 모두 그 사이 벽시계 시간(`wallMs`)에 대한 비율이고, 1이 코어 하나다. */
export function usage(from: Sample, to: Sample, wallMs: number) {
  const cpuMs = (to.cpu.user + to.cpu.system - from.cpu.user - from.cpu.system) / 1000;
  const active = to.elu.active - from.elu.active;
  const idle = to.elu.idle - from.elu.idle;
  const sqliteMs = to.sqliteMs - from.sqliteMs;
  return {
    cpu: cpuMs / wallMs,
    busy: active / (active + idle),
    sqlite: sqliteMs / wallMs,
    cpuMs,
    sqliteMs,
    sqliteCalls: to.sqliteCalls - from.sqliteCalls,
    transactionMs: to.transactionMs - from.transactionMs,
    longestSqliteMs: to.longestMs,
    longestSql: to.longestSql,
  };
}

/**
 * 잰 부하를 늘려 코어 하나와 1 GiB가 견디는 동접. 코어는 CPU(모든 스레드)와 이벤트 루프(메인 스레드, fsync 대기 포함) 중
 * 먼저 차는 쪽으로 정한다. Node 프로세스 하나는 메인 스레드 하나에서 요청을 처리하기 때문이다. 메모리는 접속한 클라이언트가
 * 늘린 RSS를 클라이언트 수로 나누고, 빈 서버의 RSS를 뺀 나머지를 그만큼씩 쓴다고 본다.
 */
export function capacity(clients: number, used: { readonly cpu: number; readonly busy: number }, idleRss: number, connectedRss: number) {
  const bytesPerClient = (connectedRss - idleRss) / clients;
  return {
    perCore: clients / Math.max(used.cpu, used.busy),
    bytesPerClient,
    perGiB: (GiB - idleRss) / bytesPerClient,
  };
}
