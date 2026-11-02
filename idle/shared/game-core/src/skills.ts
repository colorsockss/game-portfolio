// 스킬 배우기, 장착, 레벨: 영웅은 Heroes.skillIds에서 기본 공격(재사용 대기 0인 스킬)을 늘 쓰고, 나머지는 재료나 골드
// (Skills.costItemId)로 배운(Skills.learnCost) 뒤 슬롯 수(Heroes.skillSlots)만큼 골라 장착한 것을 쓴다. 배운 스킬은 레벨을
// Skills.maxLevel까지 올린다. 레벨이 바꾸는 수치(피해 배율, 효과의 양, 소환수 능력치)와 비용은 공식이 정하므로 레벨마다의 행이 없다.
import type { Big } from "@idle/big-number";
import type { GameData, HeroesRow, SkillsRow } from "@idle/data-schema";
import { E_AbilityType } from "./ability-type.js";
import { Formula, type IAbilityOwner } from "./formulas.js";

/** 영웅이 배운 스킬과 그 레벨, 장착. */
export interface SkillsState {
  /** 슬롯(0부터 Heroes.skillSlots − 1) → 장착한 스킬 ID. 배운 스킬만 장착한다. 슬롯 순서가 전투에서 준비된 스킬을 고르는 순서다. */
  readonly equipped: { readonly [slot: number]: number };
  /** 배운 스킬 ID → 레벨(1부터). 없으면 배우지 않은 것이다. 배운 목록을 따로 두지 않는다. */
  readonly levels: { readonly [skillId: number]: number };
}

/** 플레이어가 쓰는 영웅(Constants.heroId)의 행. */
export function heroRow(data: GameData): HeroesRow {
  const hero = data.heroes.get(data.constants.heroId);
  if (hero === undefined) throw new Error(`Unknown hero ${data.constants.heroId}.`);
  return hero;
}

export function skillRow(data: GameData, id: number): SkillsRow {
  const skill = data.skills.get(id);
  if (skill === undefined) throw new Error(`Unknown skill ${id}.`);
  return skill;
}

/** 장착할 수 있는 스킬: 영웅의 스킬 중 기본 공격이 아닌 것(재사용 대기가 있음). Heroes.skillIds 순서다. */
export function equippableSkills(data: GameData): SkillsRow[] {
  return heroRow(data).skillIds.map(id => skillRow(data, id)).filter(skill => skill.cooldownSeconds > 0);
}

/** 장착할 수 있는 스킬이면 그 행. 네트워크에서 온 값이라 수가 아니어도 된다. */
export function equippableSkill(data: GameData, skillId: unknown): SkillsRow | undefined {
  return equippableSkills(data).find(skill => skill.id === skillId);
}

/** 스킬의 레벨. 배우지 않았으면 0이다. */
export const skillLevel = (skills: SkillsState, skillId: number): number => skills.levels[skillId] ?? 0;

export const isLearned = (skills: SkillsState, skillId: number): boolean => skillLevel(skills, skillId) > 0;

/** 새 계정: 장착할 수 있는 스킬을 앞에서부터 슬롯 수만큼 1레벨로 배운 채 장착한다. 나머지는 배워야 한다. */
export function startSkills(data: GameData): SkillsState {
  const chosen = equippableSkills(data).slice(0, heroRow(data).skillSlots);
  return {
    equipped: Object.fromEntries(chosen.map((skill, slot) => [slot, skill.id])),
    levels: Object.fromEntries(chosen.map(skill => [skill.id, 1])),
  };
}

/**
 * 영웅이 전투에서 쓰는 스킬: 기본 공격(재사용 대기 0인 것, 앞의 것만 쓴다) 다음에 장착한 것을 슬롯 순서로. 데이터가 바뀌어 장착할 수
 * 없게 된 스킬과 슬롯 수를 넘는 슬롯은 뺀다.
 */
export function heroSkills(skills: SkillsState, data: GameData): SkillsRow[] {
  const hero = heroRow(data);
  const pool = hero.skillIds.map(id => skillRow(data, id));
  const used = pool.filter(skill => skill.cooldownSeconds === 0);
  // 정수 키는 오름차순으로 순회된다.
  for (const key of Object.keys(skills.equipped)) {
    const id = skills.equipped[Number(key)];
    const skill = Number(key) < hero.skillSlots ? pool.find(row => row.id === id && row.cooldownSeconds > 0) : undefined;
    if (skill !== undefined) used.push(skill);
  }
  return used;
}

/** 장착해 전투에서 쓰는 스킬인지. */
export function isEquipped(skills: SkillsState, skillId: number): boolean {
  return Object.values(skills.equipped).includes(skillId);
}

// 레벨 공식은 능력치를 읽지 않는다.
const NOBODY: IAbilityOwner = {
  get(type) {
    throw new Error(`A skill level formula cannot read ${E_AbilityType[type]}.`);
  },
};

/** `level`에서 한 레벨 올리는 비용(Skills.costItemId 아이템의 양, 공식 skillLevelCost). */
export function skillLevelCost(level: number): Big {
  return Formula.get(E_AbilityType.skillLevelCost, NOBODY, NOBODY, { skillLevel: level });
}

/** 레벨을 반영한 피해 배율(공식 skillMultiplier). */
export function skillMultiplier(powerMultiplier: number, level: number): Big {
  return Formula.get(E_AbilityType.skillMultiplier, NOBODY, NOBODY, { powerMultiplier, skillLevel: level });
}
