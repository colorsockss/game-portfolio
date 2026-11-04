// 해금 조건: 테이블 행에 적은 선행 클리어 스테이지와 영웅 레벨. 해금 여부는 저장하지 않고 저장 데이터(클리어
// 목록, 레벨)에서 계산하므로 테이블을 고쳐도 어긋나지 않는다. 같은 두 열을 가진 행이면 어느 테이블이든 넘긴다.
import type { GameData } from "@idle/data-schema";
import type { PlayerState } from "./state.js";

/** 해금 조건 열. 빈 칸(null)인 조건은 없는 것이다. */
export interface UnlockCondition {
  /** 먼저 클리어해야 하는 Stages.id. */
  readonly unlockStageId: number | null;
  /** 필요한 영웅 레벨(이상). */
  readonly unlockLevel: number | null;
}

/** 적힌 조건을 모두 채웠는지. */
export function isUnlocked(condition: UnlockCondition, player: Pick<PlayerState, "hero" | "stage">): boolean {
  const { unlockStageId, unlockLevel } = condition;
  return (
    (unlockStageId === null || player.stage.clearedIds.includes(unlockStageId)) &&
    (unlockLevel === null || player.hero.level >= unlockLevel)
  );
}

/** 시작 스테이지: 선행 조건이 없는 가장 작은 ID. 코드가 아니라 테이블에서 정한다. 새 계정과 환생이 여기서 시작한다. */
export function firstStageId(data: GameData): number {
  let first: number | undefined;
  for (const stage of data.stages.values()) {
    if (stage.unlockStageId === null && (first === undefined || stage.id < first)) first = stage.id;
  }
  if (first === undefined) throw new Error("Stages has no stage without a prerequisite to start from.");
  return first;
}
