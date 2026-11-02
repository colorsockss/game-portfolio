import type { Opcode } from "@idle/codes";

/**
 * 클라이언트가 보내는 저장 데이터의 모든 변경: 커맨드의 오퍼코드가 `type`이고 나머지는 그 필드다.
 * game-core의 규칙이 클라이언트에서 즉시 적용하고, 서버가 같은 규칙을 돌려 받아들이거나 거절한다.
 */
export type Command =
  | { readonly type: Opcode.StageSelect; readonly stageId: number }
  | { readonly type: Opcode.BattleSettle }
  | { readonly type: Opcode.BossChallenge }
  | { readonly type: Opcode.ItemEquip; readonly equipmentId: number }
  | { readonly type: Opcode.ItemUnequip; readonly equipmentId: number }
  /** 장비를 한 단계 강화한다(골드). */
  | { readonly type: Opcode.ItemEnhance; readonly equipmentId: number }
  /** 이 장비와 같은 장비들을 합쳐 다음 등급 장비 하나로 만든다. */
  | { readonly type: Opcode.ItemMerge; readonly equipmentId: number }
  /** 강화(StatUpgrades.id) 하나를 골드로 한 단계 올린다. */
  | { readonly type: Opcode.StatUpgrade; readonly upgradeId: number }
  /** 스킬을 배운다(1레벨). 비용은 Skills.costItemId 아이템에서 Skills.learnCost만큼 낸다. */
  | { readonly type: Opcode.SkillLearn; readonly skillId: number }
  /** 배운 스킬을 슬롯(0부터)에 장착한다. 다른 슬롯에 있던 스킬이면 두 슬롯의 스킬을 바꾼다. */
  | { readonly type: Opcode.SkillEquip; readonly slot: number; readonly skillId: number }
  /** 장착한 스킬을 슬롯에서 뺀다. */
  | { readonly type: Opcode.SkillUnequip; readonly skillId: number }
  /** 배운 스킬의 레벨을 하나 올린다. 비용은 Skills.costItemId 아이템에서 공식 skillLevelCost만큼 낸다. */
  | { readonly type: Opcode.SkillLevelUp; readonly skillId: number }
  /** 지금 튜토리얼 스텝(`stepId`)을 마친다. */
  | { readonly type: Opcode.TutorialAdvance; readonly stepId: number }
  /** 환생한다: 레벨, 스테이지, 골드 강화, 골드와 경험치를 처음으로 돌리고 환생 포인트를 받는다(rebirth.ts). */
  | { readonly type: Opcode.Rebirth }
  // 치트(commands/cheat.ts). 다른 커맨드처럼 예측하고 확정하며, 개발 모드의 서버만 받는다.
  | { readonly type: Opcode.CheatItemGrant; readonly itemId: number; readonly amount: number }
  | { readonly type: Opcode.CheatLevelSet; readonly level: number }
  | { readonly type: Opcode.CheatStageUnlock; readonly stageId: number }
  /** `duration`(ms)만큼 오래 떠나 있던 것으로 둔다. */
  | { readonly type: Opcode.CheatTimeShift; readonly duration: number };

export type CommandOpcode = Command["type"];
export type CommandOf<K extends CommandOpcode> = Extract<Command, { readonly type: K }>;
