import type { Clock } from "../../application/ports.js";

/**
 * 서버 시간에 대한 클라이언트의 추정치: 게임 규칙이 `now`로 받고 타이머가 거기에 맞춰 센다.
 * 서버는 요청이 나간 로컬 시각 t0와 답이 온 시각 t1 사이에 시각 S를 찍으므로, 서버 시계 − 로컬 시계는
 * 반드시 [S − t1, S − t0] 안에 있다(폭이 왕복 시간). 답마다 이 구간을 지금까지의 구간과 겹쳐 좁히고,
 * 겹치지 않으면(어느 쪽 시계가 바뀌었다) 새 구간으로 다시 시작한다. 추정치는 구간의 가운데이고,
 * 오차는 구간 폭의 절반을 넘지 않는다. 첫 응답 전에는 로컬 시계다.
 */
export interface ServerClock extends Clock {
  /** 이 기기의 시계(epoch ms). 요청이 나간 시각을 재어 `observe`에 돌려준다. */
  local(): number;
  /** 응답이 실어 온 서버 시간과, 그 요청이 나간 로컬 시각(`local()`)을 받는다. */
  observe(serverTime: number, sentAt: number): void;
}

export function createServerClock(local: () => number = Date.now): ServerClock {
  // 서버 시계 − 로컬 시계가 있을 수 있는 구간.
  let low = 0;
  let high = 0;
  let synced = false;
  return {
    now: () => local() + (low + high) / 2,
    local,
    observe(serverTime, sentAt) {
      const sampleLow = serverTime - local();
      const sampleHigh = serverTime - sentAt;
      // 기다리는 사이 로컬 시계가 뒤로 갔다. 이 답으로는 아무것도 알 수 없다.
      if (sampleLow > sampleHigh) return;
      if (synced && sampleLow <= high && sampleHigh >= low) {
        low = Math.max(low, sampleLow);
        high = Math.min(high, sampleHigh);
      } else {
        low = sampleLow;
        high = sampleHigh;
        synced = true;
      }
    },
  };
}
