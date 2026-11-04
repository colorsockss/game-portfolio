import { GameErrorCode, type Opcode } from "@idle/codes";
import type { CommandOf } from "../command.js";
import { afterStep, isStepDone, tutorialStep } from "../tutorial.js";
import { fail, ok, type CommandHandler } from "./types.js";

/**
 * 지금 스텝을 마치고 다음 스텝으로 간다. 지금 스텝이 아닌 것(건너뛰기, 이미 마친 스텝)은 거절하므로, 다른 요청 id로 다시
 * 보내도 한 번만 넘어간다. 조건은 스테이지 선택처럼 정산이 올린 클리어와 레벨로 본다.
 */
export const advanceTutorial: CommandHandler<CommandOf<Opcode.TutorialAdvance>> = (settled, { stepId }, { data }) => {
  const step = tutorialStep(settled, data);
  if (step === undefined || step.id !== stepId) {
    return fail(GameErrorCode.TutorialStepNotCurrent, `Tutorial step ${String(stepId)} is not the current step.`);
  }
  if (!isStepDone(step, settled)) return fail(GameErrorCode.TutorialStepUnmet, `Tutorial step ${step.id} is not done yet.`);
  return ok({ ...settled, tutorial: afterStep(step, data) });
};
