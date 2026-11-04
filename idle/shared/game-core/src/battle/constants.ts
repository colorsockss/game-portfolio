// 엔진 상수. 기획이 조정하는 전투 값(접근·부활 시간 등)은 Constants 테이블(GameData.constants)에 있다.

/**
 * 전투 시뮬레이션의 한 틱(밀리초). 시각은 틱 수로만 센다. 저장된 체크포인트의 재사용 대기와 보스 시간이 틱
 * 수라서, 바꾸면 이미 저장된 전투의 뜻이 바뀐다.
 */
export const TICK_MS = 100;
/**
 * 한 번의 정산이 시뮬레이션하는 최대 틱(10분). 정산 한 번의 서버 CPU(중반 계정 약 1.5 ms, docs/performance.md)를 묶는 상한이자 오프라인 보상의
 * 표본 길이다. 보상은 인정 시간 / 표본 길이로 늘리므로 이 값은 기대 보상을 바꾸지 않는다.
 */
export const MAX_SETTLE_TICKS = 6000;

/** 초를 틱 수로 바꾼다. 반올림하되 0이 되지 않게 최소 1틱이다. */
export function toTicks(seconds: number): number {
  return Math.max(1, Math.round((seconds * 1000) / TICK_MS));
}
