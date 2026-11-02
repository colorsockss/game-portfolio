// 부하 테스트(main.ts)가 서버 프로세스에 `--import`로 넣는 계측. 서버 코드는 그대로 두고 같은 프로세스 안에서 CPU, 메모리,
// 이벤트 루프, SQLite에 쓴 시간을 잰다. 부모가 IPC로 메시지를 보낼 때마다 그때까지의 누적 값을 답한다.
import { DatabaseSync, StatementSync } from "node:sqlite";

let sqliteMs = 0;
let sqliteCalls = 0;
let transactionMs = 0;
// 지난 표본 뒤로 가장 오래 걸린 호출 하나. 이벤트 루프를 그만큼 멈춘다(WAL 체크포인트 등).
let longestMs = 0;
let longestSql = "";

// node:sqlite는 문장을 끝까지 실행하고서 돌아오므로, 메서드가 돌아오기까지가 그 문장의 비용이다. 서버가 문장을 준비하기
// 전에 프로토타입을 바꾸므로 서버의 모든 문장이 여기를 거친다. 서버는 시작한 뒤 exec를 트랜잭션(SAVEPOINT, RELEASE,
// ROLLBACK)에만 쓰므로 따로 센다. 바깥 RELEASE가 커밋이라 WAL의 fsync가 여기 든다.
for (const [type, names] of [[StatementSync, ["run", "get", "all"]], [DatabaseSync, ["exec"]]]) {
  for (const name of names) {
    const original = type.prototype[name];
    type.prototype[name] = function (...args) {
      const started = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const ms = performance.now() - started;
        sqliteMs += ms;
        sqliteCalls++;
        if (type === DatabaseSync) transactionMs += ms;
        if (ms > longestMs) {
          longestMs = ms;
          longestSql = type === DatabaseSync ? args[0] : this.sourceSQL;
        }
      }
    };
  }
}

process.on("message", ({ gc }) => {
  // 남아 있는 메모리를 재려고 GC를 돌린다. 서버는 --expose-gc로 띄운다.
  if (gc) globalThis.gc?.();
  const { rss, heapUsed } = process.memoryUsage();
  process.send({
    cpu: process.cpuUsage(),
    elu: performance.eventLoopUtilization(),
    rss,
    heapUsed,
    maxRss: process.resourceUsage().maxRSS * 1024,
    sqliteMs,
    sqliteCalls,
    transactionMs,
    longestMs,
    longestSql,
  });
  longestMs = 0;
});
