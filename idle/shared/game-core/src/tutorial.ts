// 튜토리얼: 테이블(TutorialSteps)의 스텝을 ID 순서로 하나씩 마친다. 저장 데이터에는 지금 스텝의 ID만 두고, 스텝의 조건은
// 해금 조건(unlock.ts)처럼 저장 데이터에서 계산한다. 서버는 같은 규칙으로 건너뛰기와 되돌리기를 거절한다.
import type { GameData, TutorialStepsRow } from "@idle/data-schema";
import type { PlayerState } from "./state.js";
import { isUnlocked } from "./unlock.js";

/** 튜토리얼의 진행. */
export interface TutorialState {
  /**
   * 지금 스텝의 ID. null이면 마쳤다(튜토리얼이 생기기 전의 계정도). 테이블이 그 스텝을 지웠으면 그 ID 이상인 첫 스텝이
   * 지금 스텝이고, 마친 계정은 뒤에 더한 스텝을 보지 않는다.
   */
  readonly stepId: number | null;
}

/** 새 계정의 튜토리얼: 첫 스텝부터. 스텝이 없으면 마친 것이다. */
export function startTutorial(data: GameData): TutorialState {
  return { stepId: stepFrom(-Infinity, data)?.id ?? null };
}

/** 지금 스텝. 마쳤으면 undefined. */
export function tutorialStep(player: Pick<PlayerState, "tutorial">, data: GameData): TutorialStepsRow | undefined {
  const { stepId } = player.tutorial;
  return stepId === null ? undefined : stepFrom(stepId, data);
}

/** 그 스텝을 마친 다음의 진행. */
export function afterStep(step: TutorialStepsRow, data: GameData): TutorialState {
  return { stepId: stepFrom(step.id + 1, data)?.id ?? null };
}

/**
 * 저장 데이터로 판정하는 조건이 없는 스텝: 플레이어가 누르면 넘어간다. 서버는 누름을 확인할 수 없으므로 받아들이고,
 * 건너뛰기만 막는다.
 */
export function waitsForTap(step: TutorialStepsRow): boolean {
  return step.unlockStageId === null && step.unlockLevel === null && step.equipSlot === null;
}

/** 적힌 조건(선행 클리어, 영웅 레벨, 그 슬롯의 착용)을 모두 채웠는지. 누름 스텝은 언제나 참이다. */
export function isStepDone(step: TutorialStepsRow, player: Pick<PlayerState, "profile" | "stage" | "equipment">): boolean {
  return isUnlocked(step, player) && (step.equipSlot === null || player.equipment.equipped[step.equipSlot] !== undefined);
}

// 테이블의 행 순서가 아니라 ID로 찾는다. 스텝은 열 개 남짓이라 매번 훑는다.
function stepFrom(from: number, data: GameData): TutorialStepsRow | undefined {
  let found: TutorialStepsRow | undefined;
  for (const step of data.tutorialSteps.values()) {
    if (step.id >= from && (found === undefined || step.id < found.id)) found = step;
  }
  return found;
}
