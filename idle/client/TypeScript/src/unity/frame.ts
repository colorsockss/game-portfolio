/**
 * 콜백을 프레임마다 한 번 실행하는 setInterval 지연 값. PuerTS(puerts/timer.mjs)는 간격 타이머를
 * now + delay로 다시 예약하고 now까지 기한이 된 타이머를 모두 실행하므로, 1ms면 Tick마다
 * 한 번 실행되지만 0이면 한 Tick 안에서 끝없이 실행된다.
 */
export const EVERY_FRAME = 1;
