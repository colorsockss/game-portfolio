import { GameErrorCode } from "@idle/codes";
import type { AppEvents, Listen } from "../../application/events.js";
import type { TextKey, Translate } from "../text.js";

/** 토스트: 잠깐 떴다 사라지는 한 줄. 새 것이 지금 것을 바꾼다. */
export interface ToastViewModel {
  readonly notices: Listen<string>;
}

// 플레이어가 알 만한 거절만 따로 말한다. 세션의 거절은 연결이 끝나 로그인 화면이 이유를 보인다.
const REFUSED: Partial<Record<GameErrorCode, TextKey>> = {
  [GameErrorCode.InvalidCommand]: "toast.invalidCommand",
  [GameErrorCode.UnknownCommand]: "toast.unknownCommand",
  [GameErrorCode.StageNotFound]: "toast.stageNotFound",
  [GameErrorCode.StageLocked]: "toast.stageLocked",
  [GameErrorCode.EquipmentNotFound]: "toast.equipmentNotFound",
  [GameErrorCode.EquipmentMaxEnhance]: "toast.equipmentMaxEnhance",
  [GameErrorCode.EquipmentNotMergeable]: "toast.equipmentNotMergeable",
  [GameErrorCode.MergeMaterialsShort]: "toast.mergeMaterialsShort",
  [GameErrorCode.StatUpgradeNotFound]: "toast.statUpgradeNotFound",
  [GameErrorCode.StatUpgradeMaxed]: "toast.statUpgradeMaxed",
  [GameErrorCode.NotEnoughGold]: "toast.notEnoughGold",
  [GameErrorCode.SkillNotFound]: "toast.skillNotFound",
  [GameErrorCode.SkillNotLearned]: "toast.skillNotLearned",
  [GameErrorCode.SkillSlotInvalid]: "toast.skillSlotInvalid",
  [GameErrorCode.SkillMaxLevel]: "toast.skillMaxLevel",
  [GameErrorCode.SkillCostShort]: "toast.skillCostShort",
  [GameErrorCode.RebirthNotReady]: "toast.rebirthNotReady",
  [GameErrorCode.CheatDisabled]: "toast.cheatDisabled",
};

/** 거절된 커맨드를 토스트로 알린다. 문장은 알리는 때의 언어다. */
export function createToastViewModel(events: AppEvents, t: Translate): ToastViewModel {
  return {
    notices: show => events.on("refused", ({ error }) => show(t(REFUSED[error.code] ?? "toast.refused"))),
  };
}
