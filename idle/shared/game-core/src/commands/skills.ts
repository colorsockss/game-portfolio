import { Big } from "@idle/big-number";
import { GameErrorCode, type Opcode } from "@idle/codes";
import type { SkillsRow } from "@idle/data-schema";
import type { CommandOf } from "../command.js";
import { spend } from "../items.js";
import { equippableSkill, heroRow, isEquipped, isLearned, skillLevel, skillLevelCost } from "../skills.js";
import type { PlayerState } from "../state.js";
import { fail, ok, refit, type CommandHandler } from "./types.js";

// 장착, 해제와 쓰는 스킬의 레벨업은 착용(equipment.ts)처럼 `now`의 틱까지 정산한 상태에서 그 틱의 새 스킬로 전투를 이어 간다
// (`refit`: 재사용 대기는 스킬 id로 옮기고 새로 쓰는 스킬은 처음부터 기다린다). 배우기는 장착하지 않으므로 전투를 바꾸지 않는다.

// 정산한 보유량(보이는 전투가 이 틱까지 번 것)에서 비용을 낸다. 모자라면 undefined.
function pay(settled: PlayerState, row: SkillsRow, cost: Big): PlayerState["items"] | undefined {
  if (row.costItemId === null) throw new Error(`Skill ${row.id} can be learned and leveled up but has no costItemId.`);
  return spend(settled.items, row.costItemId, cost);
}

/** 스킬을 1레벨로 배운다. 장착은 따로 한다. 이미 배웠으면 확정만 한다. */
export const learnSkill: CommandHandler<CommandOf<Opcode.SkillLearn>> = (settled, { skillId }, { data }) => {
  const row = equippableSkill(data, skillId);
  if (row === undefined) return fail(GameErrorCode.SkillNotFound, `Skill ${String(skillId)} cannot be learned.`);
  if (isLearned(settled.skills, row.id)) return ok(settled);
  if (row.learnCost === null) throw new Error(`Skill ${row.id} can be equipped but has no learnCost.`);
  const items = pay(settled, row, row.learnCost);
  if (items === undefined) return fail(GameErrorCode.SkillCostShort, `Learning skill ${row.id} needs ${Big.toNumber(row.learnCost)} of item ${row.costItemId}.`);
  return ok({ ...settled, items, skills: { ...settled.skills, levels: { ...settled.skills.levels, [row.id]: 1 } } });
};

/**
 * 배운 스킬을 슬롯에 장착한다. 다른 슬롯에 있던 스킬이면 그 슬롯에는 이 슬롯에 있던 스킬이 간다(비었으면 그 슬롯도 빈다). 이미 그
 * 슬롯에 있으면 확정만 한다.
 */
export const equipSkill: CommandHandler<CommandOf<Opcode.SkillEquip>> = (settled, { slot, skillId }, { data }) => {
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= heroRow(data).skillSlots) {
    return fail(GameErrorCode.SkillSlotInvalid, `Skill slot ${String(slot)} does not exist.`);
  }
  const row = equippableSkill(data, skillId);
  if (row === undefined) return fail(GameErrorCode.SkillNotFound, `Skill ${String(skillId)} cannot be equipped.`);
  if (!isLearned(settled.skills, row.id)) return fail(GameErrorCode.SkillNotLearned, `Skill ${row.id} has not been learned.`);
  const { equipped } = settled.skills;
  if (equipped[slot] === row.id) return ok(settled);
  const next: { [slot: number]: number } = { ...equipped, [slot]: row.id };
  for (const key of Object.keys(equipped)) {
    const other = Number(key);
    if (other === slot || equipped[other] !== row.id) continue;
    if (equipped[slot] === undefined) delete next[other];
    else next[other] = equipped[slot];
  }
  return refit(settled, { ...settled, skills: { ...settled.skills, equipped: next } }, data);
};

/** 장착한 스킬을 슬롯에서 뺀다. 그 슬롯은 빈다. 장착하지 않은 스킬이면 확정만 한다. */
export const unequipSkill: CommandHandler<CommandOf<Opcode.SkillUnequip>> = (settled, { skillId }, { data }) => {
  const row = equippableSkill(data, skillId);
  if (row === undefined) return fail(GameErrorCode.SkillNotFound, `Skill ${String(skillId)} cannot be unequipped.`);
  const { equipped } = settled.skills;
  const slot = Object.keys(equipped).find(key => equipped[Number(key)] === row.id);
  if (slot === undefined) return ok(settled);
  const { [Number(slot)]: _, ...rest } = equipped;
  return refit(settled, { ...settled, skills: { ...settled.skills, equipped: rest } }, data);
};

/**
 * 배운 스킬의 레벨을 하나 올린다. 비용은 확정한 보유량에서 낸다. 장착한 스킬이면 전투를 다시 시작하고, 아니면 쓰지 않는 스킬이라
 * 전투는 그대로다.
 */
export const levelUpSkill: CommandHandler<CommandOf<Opcode.SkillLevelUp>> = (settled, { skillId }, { data }) => {
  const row = equippableSkill(data, skillId);
  if (row === undefined) return fail(GameErrorCode.SkillNotFound, `Skill ${String(skillId)} cannot be leveled up.`);
  const level = skillLevel(settled.skills, row.id);
  if (level === 0) return fail(GameErrorCode.SkillNotLearned, `Skill ${row.id} has not been learned.`);
  if (level >= row.maxLevel) return fail(GameErrorCode.SkillMaxLevel, `Skill ${row.id} is at its max level ${row.maxLevel}.`);
  const cost = skillLevelCost(level);
  const items = pay(settled, row, cost);
  if (items === undefined) {
    return fail(GameErrorCode.SkillCostShort, `Skill ${row.id} needs ${Big.toNumber(cost)} of item ${row.costItemId} for level ${level + 1}.`);
  }
  const skills = { ...settled.skills, levels: { ...settled.skills.levels, [row.id]: level + 1 } };
  const player = { ...settled, items };
  return isEquipped(skills, row.id) ? refit(player, { ...player, skills }, data) : ok({ ...player, skills });
};
