import { Big } from "@idle/big-number";
import { SkillElement, Stat, type GameData, type MonstersRow, type SkillsRow, type SummonsRow } from "@idle/data-schema";
import { E_AbilityType } from "../ability-type.js";
import { equipmentRow, equipmentStat } from "../equipment.js";
import { Formula, type IAbilityOwner } from "../formulas.js";
import { required } from "../rows.js";
import { rebirthRate } from "../rebirth.js";
import { heroRow, heroSkills, skillRow } from "../skills.js";
import type { PlayerState } from "../state.js";
import { toTicks } from "./constants.js";

/** 전투 한 판이 쓰는 능력치. 영웅과 몬스터가 같은 모양이다. */
export interface CombatStats {
  readonly maxHp: Big;
  readonly attack: Big;
  readonly defense: Big;
  /** 공격 간격(틱). */
  readonly attackInterval: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  /** 이동 속도(월드 단위/초). 사거리 밖의 상대에게 다가갈 때 쓴다. */
  readonly moveSpeed: number;
  /** 맞을 때의 속성. 맞는 스킬의 속성과 견주어 피해 배율을 정한다. 영웅과 소환수는 물리다. */
  readonly element: SkillElement;
  readonly skills: readonly SkillsRow[];
  /** 스킬 ID → 레벨(없으면 1). 영웅만 장착한 스킬의 레벨이 있고, 몬스터와 소환수는 비어 있다. */
  readonly skillLevels: { readonly [skillId: number]: number };
}

const NO_LEVELS: CombatStats["skillLevels"] = Object.freeze({});

/**
 * 기본 능력치에 얹는 수정치: 고정 가산(`add`)과 비율(`percent`, 0.1 = +10%). 장비, 강화, 효과(Effects의 stat)가 쓴다.
 * 공격 간격(`Stat.AttackInterval`)은 비율만 쓰고, 치명 확률(`Stat.CritChance`)의 가산은 확률이다(0.005 = +0.5%p). 이동 속도
 * (`Stat.MoveSpeed`)의 가산은 월드 단위/초다.
 */
export interface StatModifier {
  readonly stat: Stat;
  readonly add?: Big;
  readonly percent?: number;
}

/** 장비 행에서 고정 가산으로 읽는 스탯. 열 이름이 `Stat`의 값과 같다. 환생 배율도 이 셋에 곱한다. */
const EQUIPMENT_STATS = [Stat.MaxHp, Stat.Attack, Stat.Defense] as const;

/**
 * 저장 데이터에서 모은 수정치: 착용한 장비 행의 스탯 열을 장비의 강화 단계로 키운 것을 슬롯 순서로, 그다음 골드 강화의
 * `amount × 단계`를 강화 ID 순서로 모은다(정수 키는 오름차순으로 순회된다). 환생 배율은 비율이라 모든 가산 뒤에 곱해진다.
 */
function modifiersOf(
  { equipment, statUpgrades, rebirth }: Pick<PlayerState, "equipment" | "statUpgrades" | "rebirth">, data: GameData,
): readonly StatModifier[] {
  const modifiers: StatModifier[] = [];
  for (const key of Object.keys(equipment.equipped)) {
    const id = equipment.equipped[Number(key)];
    const row = equipmentRow(equipment, id, data);
    for (const stat of EQUIPMENT_STATS) {
      const add = equipmentStat(row, equipment.owned[id].enhance, stat);
      if (add !== null) modifiers.push({ stat, add });
    }
  }
  for (const key of Object.keys(statUpgrades)) {
    const row = data.statUpgrades.get(Number(key));
    // 데이터에서 지운 강화는 버린다.
    if (row !== undefined) modifiers.push({ stat: row.stat, add: Big.mul(row.amount, statUpgrades[Number(key)]) });
  }
  // 1 + (배율 − 1)은 배율 그대로다(1 이상의 double에서 1을 빼면 정확하다).
  const percent = Big.toNumber(rebirthRate(rebirth)) - 1;
  if (percent !== 0) for (const stat of EQUIPMENT_STATS) modifiers.push({ stat, percent });
  return modifiers;
}

const skillsOf = (ids: readonly number[], data: GameData): SkillsRow[] => ids.map(id => skillRow(data, id));

export function heroStats(
  player: Pick<PlayerState, "hero" | "equipment" | "statUpgrades" | "skills" | "rebirth">, data: GameData,
): CombatStats {
  const hero = heroRow(data);
  const row = required(data.heroLevels, player.hero.level, "hero level");
  return applyModifiers(
    {
      maxHp: row.maxHp,
      attack: row.attack,
      defense: row.defense,
      attackInterval: toTicks(hero.attackIntervalSeconds),
      critChance: hero.critChance,
      critMultiplier: hero.critMultiplier,
      moveSpeed: hero.moveSpeed,
      element: SkillElement.Physical,
      skills: heroSkills(player.skills, data),
      skillLevels: player.skills.levels,
    },
    modifiersOf(player, data),
  );
}

export function monsterStats(monster: MonstersRow, data: GameData): CombatStats {
  return {
    maxHp: monster.maxHp,
    attack: monster.attack,
    defense: monster.defense,
    attackInterval: toTicks(monster.attackIntervalSeconds),
    critChance: 0,
    critMultiplier: 1,
    moveSpeed: monster.moveSpeed,
    element: monster.element,
    skills: skillsOf(monster.skillIds, data),
    skillLevels: NO_LEVELS,
  };
}

/**
 * 소환수의 능력치: 최대 HP, 공격력, 방어력은 소환자의 효과 전 능력치(`summoner`), Summons 행, 소환 스킬의 레벨(`level`)로 공식
 * (summonMaxHp, summonAttack, summonDefense)을 계산해 내림한다. 최대 HP는 1 이상이라 소환자의 HP가 작아도 살아서 나온다. 몬스터처럼
 * 치명이 없고 스킬은 1레벨이다. 소환수는 소환하지 않으므로(체크포인트는 영웅이 부른 소환수만 담는다) 소환 스킬은 뺀다.
 */
export function summonStats(summon: SummonsRow, summoner: CombatStats, level: number, data: GameData): CombatStats {
  const caster = abilityOwner(summoner);
  const target = summonOwner(summon);
  const stat = (type: E_AbilityType) => Big.floor(Formula.get(type, caster, target, { skillLevel: level }));
  return {
    maxHp: Big.max(Big.ONE, stat(E_AbilityType.summonMaxHp)),
    attack: stat(E_AbilityType.summonAttack),
    defense: stat(E_AbilityType.summonDefense),
    attackInterval: toTicks(summon.attackIntervalSeconds),
    critChance: 0,
    critMultiplier: 1,
    moveSpeed: summon.moveSpeed,
    element: SkillElement.Physical,
    skills: skillsOf(summon.skillIds, data).filter(skill => skill.summonId === null),
    skillLevels: NO_LEVELS,
  };
}

// 소환 공식의 target: Summons 행의 배율.
function summonOwner(summon: SummonsRow): IAbilityOwner {
  return {
    get(type: E_AbilityType): Big {
      switch (type) {
        case E_AbilityType.maxHpRate:
          return Big.from(summon.maxHpRate);
        case E_AbilityType.attackRate:
          return Big.from(summon.attackRate);
        case E_AbilityType.defenseRate:
          return Big.from(summon.defenseRate);
        default:
          throw new Error(`Unsupported ability type ${E_AbilityType[type]} for a summon.`);
      }
    },
  };
}

// 스탯마다 floor((기본 + Σadd) × max(0, 1 + Σpercent)). 비율은 배열 순서대로 더한다. double 덧셈은 결합 법칙이
// 성립하지 않으므로 같은 값은 고정된 순서에서 나온다.
function modify(base: Big, stat: Stat, modifiers: readonly StatModifier[]): Big {
  let value = base;
  let percent = 0;
  for (const modifier of modifiers) {
    if (modifier.stat !== stat) continue;
    if (modifier.add !== undefined) value = Big.add(value, modifier.add);
    if (modifier.percent !== undefined) percent += modifier.percent;
  }
  return Big.floor(Big.mul(value, Math.max(0, 1 + percent)));
}

// 공격 간격(틱)은 round(기본 × (1 + Σpercent))이고 최소 1틱이다.
function interval(base: number, modifiers: readonly StatModifier[]): number {
  let percent = 0;
  for (const modifier of modifiers) if (modifier.stat === Stat.AttackInterval && modifier.percent !== undefined) percent += modifier.percent;
  return percent === 0 ? base : Math.max(1, Math.round(base * (1 + percent)));
}

// 치명 확률과 이동 속도는 (기본 + Σadd) × max(0, 1 + Σpercent)이다. 난수·거리와 비교하므로 내림하지 않은 double이다.
function scaled(base: number, stat: Stat.CritChance | Stat.MoveSpeed, modifiers: readonly StatModifier[]): number {
  let value = base;
  let percent = 0;
  for (const modifier of modifiers) {
    if (modifier.stat !== stat) continue;
    if (modifier.add !== undefined) value += Big.toNumber(modifier.add);
    if (modifier.percent !== undefined) percent += modifier.percent;
  }
  return value * Math.max(0, 1 + percent);
}

export function applyModifiers(base: CombatStats, modifiers: readonly StatModifier[]): CombatStats {
  return {
    ...base,
    maxHp: modify(base.maxHp, Stat.MaxHp, modifiers),
    attack: modify(base.attack, Stat.Attack, modifiers),
    defense: modify(base.defense, Stat.Defense, modifiers),
    attackInterval: interval(base.attackInterval, modifiers),
    critChance: scaled(base.critChance, Stat.CritChance, modifiers),
    moveSpeed: scaled(base.moveSpeed, Stat.MoveSpeed, modifiers),
  };
}

/** 공식(`Formula`)이 능력치를 읽는 창구. 공식이 읽는 형식만 지원하고, 그 밖은 던진다. */
export function abilityOwner(stats: CombatStats): IAbilityOwner {
  return {
    get(type: E_AbilityType): Big {
      switch (type) {
        case E_AbilityType.maxHp:
          return stats.maxHp;
        case E_AbilityType.attack:
          return stats.attack;
        case E_AbilityType.defense:
          return stats.defense;
        default:
          throw new Error(`Unsupported ability type ${E_AbilityType[type]}.`);
      }
    },
  };
}
