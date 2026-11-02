// 게임 규칙 안의 시간. 규칙은 시계를 읽지 않는다: 양쪽이 각자 바깥 경계에서 시계를 읽고(서버는
// 요청마다 한 번, 클라이언트는 서버 시각의 추정값으로) epoch ms를 `now`로 넘긴다. 그러면 같은 입력이
// 양쪽에서 같은 답을 내고, 테스트는 어느 시점이든 고를 수 있다.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** 게임의 하루는 한국 시각(UTC+9) 09:00, 곧 UTC 00:00에 바뀐다. */
export const DAILY_RESET_UTC = 0 * HOUR;

/**
 * `now`가 속한 게임 일자: 일일 초기화마다 1씩 오르는 연속된 정수. 두 시점이 같은 게임 일자에 속하는
 * 것은 이 값이 같을 때뿐이다.
 */
export function gameDay(now: number): number {
  return Math.floor((now - DAILY_RESET_UTC) / DAY);
}

/** `now` 다음에 처음 오는 일일 초기화 시각(epoch ms). */
export function nextDailyReset(now: number): number {
  return (gameDay(now) + 1) * DAY + DAILY_RESET_UTC;
}

/**
 * `since`부터 `now`까지의 시간. 0 아래로 내려가지 않고(두 값이 서로 어긋난 시계에서 왔을 수 있다)
 * `cap`을 넘지 않는다. `cap`은 오프라인 보상이 인정하는 가장 긴 부재 시간 같은 값이다.
 */
export function elapsed(since: number, now: number, cap = Infinity): number {
  return Math.min(Math.max(now - since, 0), cap);
}
