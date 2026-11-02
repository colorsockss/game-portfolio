import type { Translate } from "../text.js";

/**
 * 카운트다운을 타이머로 보여 준다: 한 시간 미만은 04:59, 하루 미만은 23:59:59, 그 이상은 날 수를 붙인
 * 1일 23:59:59(날 수의 단위는 언어마다 다르다, format.days). 초는 올림하므로 카운트다운이 끝나야 비로소 00:00이 보이고,
 * 음수는 00:00으로 보인다.
 */
export function formatTimer(ms: number, t: Translate): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  const seconds = total % 60;
  const clock = total < 3600 ? `${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? t("format.days", { days, clock }) : clock;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
