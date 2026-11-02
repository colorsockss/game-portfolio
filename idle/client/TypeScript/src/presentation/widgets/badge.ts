import { computed, type ReadonlySignal } from "@preact/signals-core";

/**
 * 알림 뱃지: 켜져 있으면 메뉴 위에 빨간 점(UI/Badge)이 보인다. 뱃지를 따로 등록하거나 끄는 코드 없이 상태에서
 * `computed`로 계산하므로, 상태가 바뀌면 저절로 켜지고 꺼진다. 상위 메뉴의 뱃지는 하위 뱃지를 `anyOf`로 모은 마디라서
 * 뱃지들은 트리를 이룬다(예: 장비 칸 → 슬롯 탭 → 메인의 장비 버튼).
 */
export type Badge = ReadonlySignal<boolean>;

/** 하위 뱃지 중 하나라도 켜지면 켜지는 상위 뱃지. 켜짐이 바뀔 때만 알린다. */
export function anyOf(children: readonly Badge[]): Badge {
  return computed(() => children.some(child => child.value));
}
