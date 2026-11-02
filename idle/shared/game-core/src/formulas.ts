// 자동 생성된 파일 — 직접 수정하지 마세요. 프로젝트: portfolio-idle-rpg
import { E_AbilityType } from './ability-type.js';
import { Big, type BigLike } from '@idle/big-number';

export interface IAbilityOwner {
  get(type: E_AbilityType): Big;
}

/** 공식을 부르는 쪽이 넘기는 입력. 공식이 읽는 입력을 넘기지 않으면 던진다. */
export interface FormulaInput {
  /** 효과의 계수 (Effects.power) */
  readonly power?: BigLike;
  /** 공격 속성이 방어 속성에 강하면 1, 약하면 -1, 아니면 0 */
  readonly elementAdvantage?: BigLike;
  /** 강화 단계 (0부터, 정수) */
  readonly step?: BigLike;
  /** 스킬 레벨 (1부터, 정수). 몬스터와 소환수의 스킬은 1 */
  readonly skillLevel?: BigLike;
  /** 스킬의 피해 배율 (Skills.powerMultiplier) */
  readonly powerMultiplier?: BigLike;
  /** 강화 전 스탯 (Items의 attack·defense·maxHp) */
  readonly base?: BigLike;
  /** 영웅 레벨 (1부터, 정수) */
  readonly level?: BigLike;
  /** 쌓은 환생 포인트 (0부터, 정수) */
  readonly points?: BigLike;
}

type FormulaFn = (caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput) => Big;

const minDamage = Big.from(1);
const elementStrong = Big.from(1.5);
const elementWeak = Big.from(0.75);
const upgradeBaseCost = Big.from(100);
const upgradeCostGrowth = Big.from(1.15);
const skillRatePerLevel = Big.from(0.1);
const skillLevelBaseCost = Big.from(1000);
const skillLevelCostGrowth = Big.from(1.6);
const enhanceBaseCost = Big.from(500);
const enhanceCostGrowth = Big.from(1.5);
const enhanceStatPerStep = Big.from(0.2);
const rebirthMinLevel = Big.from(30);
const rebirthRatePerPoint = Big.from(0.001);

function given(value: BigLike | undefined, key: string): Big {
  if (value === undefined) throw new Error(`공식 입력 '${key}'를 넘기지 않았습니다`);
  return Big.from(value);
}

const damage: FormulaFn = (caster, target, input) => {
  const __caster_attack = caster.get(E_AbilityType.attack);
  const __target_defense = target.get(E_AbilityType.defense);
  const __result = Big.max(minDamage, Big.sub(__caster_attack, __target_defense));
  if (Formula.debug) {
    console.log(`damage(${Big.toNumber(__result)}) = max(minDamage(${Big.toNumber(minDamage)}), (caster.attack(${Big.toNumber(__caster_attack)}) - target.defense(${Big.toNumber(__target_defense)})))`);
  }
  return __result;
};

const summonMaxHp: FormulaFn = (caster, target, input) => {
  const __caster_maxHp = caster.get(E_AbilityType.maxHp);
  const __target_maxHpRate = target.get(E_AbilityType.maxHpRate);
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.mul(Big.mul(__caster_maxHp, __target_maxHpRate), __t1);
  if (Formula.debug) {
    console.log(`summonMaxHp(${Big.toNumber(__result)}) = ((caster.maxHp(${Big.toNumber(__caster_maxHp)}) * target.maxHpRate(${Big.toNumber(__target_maxHpRate)})) * skillLevelRate(${Big.toNumber(__t1)}))`);
  }
  return __result;
};

const summonAttack: FormulaFn = (caster, target, input) => {
  const __caster_attack = caster.get(E_AbilityType.attack);
  const __target_attackRate = target.get(E_AbilityType.attackRate);
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.mul(Big.mul(__caster_attack, __target_attackRate), __t1);
  if (Formula.debug) {
    console.log(`summonAttack(${Big.toNumber(__result)}) = ((caster.attack(${Big.toNumber(__caster_attack)}) * target.attackRate(${Big.toNumber(__target_attackRate)})) * skillLevelRate(${Big.toNumber(__t1)}))`);
  }
  return __result;
};

const summonDefense: FormulaFn = (caster, target, input) => {
  const __caster_defense = caster.get(E_AbilityType.defense);
  const __target_defenseRate = target.get(E_AbilityType.defenseRate);
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.mul(Big.mul(__caster_defense, __target_defenseRate), __t1);
  if (Formula.debug) {
    console.log(`summonDefense(${Big.toNumber(__result)}) = ((caster.defense(${Big.toNumber(__caster_defense)}) * target.defenseRate(${Big.toNumber(__target_defenseRate)})) * skillLevelRate(${Big.toNumber(__t1)}))`);
  }
  return __result;
};

const dotDamage: FormulaFn = (caster, target, input) => {
  const __caster_attack = caster.get(E_AbilityType.attack);
  const __input_power = given(input.power, 'power');
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.floor(Big.mul(Big.mul(__caster_attack, __input_power), __t1));
  if (Formula.debug) {
    console.log(`dotDamage(${Big.toNumber(__result)}) = floor(((caster.attack(${Big.toNumber(__caster_attack)}) * power(${Big.toNumber(__input_power)})) * skillLevelRate(${Big.toNumber(__t1)})))`);
  }
  return __result;
};

const heal: FormulaFn = (caster, target, input) => {
  const __caster_attack = caster.get(E_AbilityType.attack);
  const __input_power = given(input.power, 'power');
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.floor(Big.mul(Big.mul(__caster_attack, __input_power), __t1));
  if (Formula.debug) {
    console.log(`heal(${Big.toNumber(__result)}) = floor(((caster.attack(${Big.toNumber(__caster_attack)}) * power(${Big.toNumber(__input_power)})) * skillLevelRate(${Big.toNumber(__t1)})))`);
  }
  return __result;
};

const shield: FormulaFn = (caster, target, input) => {
  const __caster_attack = caster.get(E_AbilityType.attack);
  const __input_power = given(input.power, 'power');
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.floor(Big.mul(Big.mul(__caster_attack, __input_power), __t1));
  if (Formula.debug) {
    console.log(`shield(${Big.toNumber(__result)}) = floor(((caster.attack(${Big.toNumber(__caster_attack)}) * power(${Big.toNumber(__input_power)})) * skillLevelRate(${Big.toNumber(__t1)})))`);
  }
  return __result;
};

const statBuff: FormulaFn = (caster, target, input) => {
  const __input_power = given(input.power, 'power');
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.mul(__input_power, __t1);
  if (Formula.debug) {
    console.log(`statBuff(${Big.toNumber(__result)}) = (power(${Big.toNumber(__input_power)}) * skillLevelRate(${Big.toNumber(__t1)}))`);
  }
  return __result;
};

const elementMultiplier: FormulaFn = (caster, target, input) => {
  const __input_elementAdvantage = given(input.elementAdvantage, 'elementAdvantage');
  const __result = (Big.gt(__input_elementAdvantage, Big.from(0)) ? elementStrong : (Big.lt(__input_elementAdvantage, Big.from(0)) ? elementWeak : Big.from(1)));
  if (Formula.debug) {
    console.log(`elementMultiplier(${Big.toNumber(__result)}) = ((elementAdvantage(${Big.toNumber(__input_elementAdvantage)}) > 0) ? elementStrong(${Big.toNumber(elementStrong)}) : ((elementAdvantage(${Big.toNumber(__input_elementAdvantage)}) < 0) ? elementWeak(${Big.toNumber(elementWeak)}) : 1))`);
  }
  return __result;
};

const upgradeCost: FormulaFn = (caster, target, input) => {
  const __input_step = given(input.step, 'step');
  const __result = Big.floor(Big.mul(upgradeBaseCost, Big.pow(upgradeCostGrowth, Big.toNumber(__input_step))));
  if (Formula.debug) {
    console.log(`upgradeCost(${Big.toNumber(__result)}) = floor((upgradeBaseCost(${Big.toNumber(upgradeBaseCost)}) * pow(upgradeCostGrowth(${Big.toNumber(upgradeCostGrowth)}), step(${Big.toNumber(__input_step)}))))`);
  }
  return __result;
};

const skillLevelRate: FormulaFn = (caster, target, input) => {
  const __input_skillLevel = given(input.skillLevel, 'skillLevel');
  const __result = Big.add(Big.from(1), Big.mul(skillRatePerLevel, Big.sub(__input_skillLevel, Big.from(1))));
  if (Formula.debug) {
    console.log(`skillLevelRate(${Big.toNumber(__result)}) = (1 + (skillRatePerLevel(${Big.toNumber(skillRatePerLevel)}) * (skillLevel(${Big.toNumber(__input_skillLevel)}) - 1)))`);
  }
  return __result;
};

const skillMultiplier: FormulaFn = (caster, target, input) => {
  const __input_powerMultiplier = given(input.powerMultiplier, 'powerMultiplier');
  const __t1 = Formula.get(E_AbilityType.skillLevelRate, caster, target, input);
  const __result = Big.mul(__input_powerMultiplier, __t1);
  if (Formula.debug) {
    console.log(`skillMultiplier(${Big.toNumber(__result)}) = (powerMultiplier(${Big.toNumber(__input_powerMultiplier)}) * skillLevelRate(${Big.toNumber(__t1)}))`);
  }
  return __result;
};

const skillLevelCost: FormulaFn = (caster, target, input) => {
  const __input_skillLevel = given(input.skillLevel, 'skillLevel');
  const __result = Big.floor(Big.mul(skillLevelBaseCost, Big.pow(skillLevelCostGrowth, Big.toNumber(Big.sub(__input_skillLevel, Big.from(1))))));
  if (Formula.debug) {
    console.log(`skillLevelCost(${Big.toNumber(__result)}) = floor((skillLevelBaseCost(${Big.toNumber(skillLevelBaseCost)}) * pow(skillLevelCostGrowth(${Big.toNumber(skillLevelCostGrowth)}), (skillLevel(${Big.toNumber(__input_skillLevel)}) - 1))))`);
  }
  return __result;
};

const enhanceCost: FormulaFn = (caster, target, input) => {
  const __input_step = given(input.step, 'step');
  const __result = Big.floor(Big.mul(enhanceBaseCost, Big.pow(enhanceCostGrowth, Big.toNumber(__input_step))));
  if (Formula.debug) {
    console.log(`enhanceCost(${Big.toNumber(__result)}) = floor((enhanceBaseCost(${Big.toNumber(enhanceBaseCost)}) * pow(enhanceCostGrowth(${Big.toNumber(enhanceCostGrowth)}), step(${Big.toNumber(__input_step)}))))`);
  }
  return __result;
};

const enhanceStat: FormulaFn = (caster, target, input) => {
  const __input_base = given(input.base, 'base');
  const __input_step = given(input.step, 'step');
  const __result = Big.floor(Big.mul(__input_base, Big.add(Big.from(1), Big.mul(enhanceStatPerStep, __input_step))));
  if (Formula.debug) {
    console.log(`enhanceStat(${Big.toNumber(__result)}) = floor((base(${Big.toNumber(__input_base)}) * (1 + (enhanceStatPerStep(${Big.toNumber(enhanceStatPerStep)}) * step(${Big.toNumber(__input_step)})))))`);
  }
  return __result;
};

const rebirthPoints: FormulaFn = (caster, target, input) => {
  const __input_level = given(input.level, 'level');
  const __result = (Big.gte(__input_level, rebirthMinLevel) ? Big.pow(Big.add(Big.sub(__input_level, rebirthMinLevel), Big.from(1)), Big.toNumber(Big.from(2))) : Big.from(0));
  if (Formula.debug) {
    console.log(`rebirthPoints(${Big.toNumber(__result)}) = ((level(${Big.toNumber(__input_level)}) >= rebirthMinLevel(${Big.toNumber(rebirthMinLevel)})) ? pow(((level(${Big.toNumber(__input_level)}) - rebirthMinLevel(${Big.toNumber(rebirthMinLevel)})) + 1), 2) : 0)`);
  }
  return __result;
};

const rebirthRate: FormulaFn = (caster, target, input) => {
  const __input_points = given(input.points, 'points');
  const __result = Big.add(Big.from(1), Big.mul(rebirthRatePerPoint, __input_points));
  if (Formula.debug) {
    console.log(`rebirthRate(${Big.toNumber(__result)}) = (1 + (rebirthRatePerPoint(${Big.toNumber(rebirthRatePerPoint)}) * points(${Big.toNumber(__input_points)})))`);
  }
  return __result;
};

export class Formula {
  static debug = false;

  private static readonly map = new Map<E_AbilityType, FormulaFn>([
    [E_AbilityType.damage, damage],
    [E_AbilityType.summonMaxHp, summonMaxHp],
    [E_AbilityType.summonAttack, summonAttack],
    [E_AbilityType.summonDefense, summonDefense],
    [E_AbilityType.dotDamage, dotDamage],
    [E_AbilityType.heal, heal],
    [E_AbilityType.shield, shield],
    [E_AbilityType.statBuff, statBuff],
    [E_AbilityType.elementMultiplier, elementMultiplier],
    [E_AbilityType.upgradeCost, upgradeCost],
    [E_AbilityType.skillLevelRate, skillLevelRate],
    [E_AbilityType.skillMultiplier, skillMultiplier],
    [E_AbilityType.skillLevelCost, skillLevelCost],
    [E_AbilityType.enhanceCost, enhanceCost],
    [E_AbilityType.enhanceStat, enhanceStat],
    [E_AbilityType.rebirthPoints, rebirthPoints],
    [E_AbilityType.rebirthRate, rebirthRate],
  ]);

  static get(type: E_AbilityType, caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput = {}): Big {
    const fn = Formula.map.get(type);
    if (!fn) throw new Error(`등록되지 않은 공식: ${type}`);
    return fn(caster, target, input);
  }
}
