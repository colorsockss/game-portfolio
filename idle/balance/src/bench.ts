// 전투 규칙의 비용(백로그 70): 같은 중반 상태에서 정산 한 번(60초, 상한 10분), 12시간 오프라인 보상, 접속해 있는
// 1시간(60초마다 정산)을 여러 번 돌려 중앙값과 p95를 낸다. 전투를 바꾸는 항목(56–59)의 전후를 같은 방법으로 잰다.
import { Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import { applyCommand, HOUR, MINUTE, settle, type Command, type PlayerState } from "@idle/game-core";
import { createPlayer } from "@idle/server/save";

// 아무 시각이나 된다. 0만은 체크포인트가 없다는 뜻이라 피한다.
const START = Date.UTC(2026, 0, 1);

/** 잰 것 하나(ms). */
export interface Measurement {
  readonly name: string;
  readonly runs: number;
  readonly median: number;
  readonly p95: number;
}

/** 중반 상태: 3005까지 열고 레벨 30으로 3005를 사냥하는 계정. 체크포인트는 `START`다. */
export function midGame(data: GameData): PlayerState {
  const commands: Command[] = [
    { type: Opcode.CheatStageUnlock, stageId: 3005 },
    { type: Opcode.CheatLevelSet, level: 30 },
    { type: Opcode.StageSelect, stageId: 3005 },
  ];
  return commands.reduce((state, command) => {
    const result = applyCommand(state, command, { now: START, data });
    if (!result.ok) throw new Error(result.error.message);
    return result.state;
  }, createPlayer("bench", data, START));
}

/** 측정을 모두 돌린다. 앞의 몇 번은 JIT를 데우려고 버린다. */
export function bench(data: GameData, runs = 100): Measurement[] {
  const base = midGame(data);
  return [
    measure("settle 60 s", runs, () => settle(base, data, START + MINUTE)),
    measure("settle 10 min (cap)", runs, () => settle(base, data, START + 10 * MINUTE)),
    measure("offline reward 12 h", runs, () => settle(base, data, START + 12 * HOUR)),
    measure("online 1 h (settle every 60 s)", Math.max(3, Math.floor(runs / 5)), () => {
      let state = base;
      for (let minute = 1; minute <= 60; minute++) state = settle(state, data, START + minute * MINUTE);
    }),
  ];
}

function measure(name: string, runs: number, body: () => void): Measurement {
  for (let warmup = 0; warmup < 3; warmup++) body();
  const times: number[] = [];
  for (let run = 0; run < runs; run++) {
    const started = performance.now();
    body();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return { name, runs, median: times[Math.floor(runs / 2)]!, p95: times[Math.min(runs - 1, Math.ceil(runs * 0.95) - 1)]! };
}
