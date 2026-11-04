// 방치 전투 시뮬레이션. 서버가 같은 입력으로 다시 돌려 클라이언트가 보여 준 결과를 확정하므로, 같은
// 입력은 어느 호스트에서든 같은 이벤트와 같은 상태를 내야 한다(스펙 4.6): double의 + − × ÷와 비교, 정수의 %,
// Math.max/min/floor/round, Big 연산, 배열 순서의 반복만 쓴다.
import { Big } from "@idle/big-number";
import {
  EffectKind,
  SkillCondition,
  SkillElement,
  SkillTarget,
  TargetRule,
  type EffectsRow,
  type GameData,
  type MonstersRow,
  type SkillsRow,
  type StagesRow,
  type SummonsRow,
} from "@idle/data-schema";
import { E_AbilityType } from "../ability-type.js";
import { Formula, type IAbilityOwner } from "../formulas.js";
import { addReward, type ItemAmounts } from "../items.js";
import { levelUp } from "../level.js";
import { rebirthRate } from "../rebirth.js";
import { skillMultiplier } from "../skills.js";
import type { PlayerState } from "../state.js";
import { isUnlocked } from "../unlock.js";
import { TICK_MS, toTicks } from "./constants.js";
import { next } from "./rng.js";
import {
  BattleMode, HERO_ID,
  type BattleState, type CombatantState, type EffectState, type MonsterState, type ProjectileState, type SummonState,
} from "./state.js";
import { abilityOwner, applyModifiers, heroStats, monsterStats, summonStats, type CombatStats, type StatModifier } from "./stats.js";

/**
 * 전투가 이어 가는 저장 데이터: 체크포인트, 스테이지, 영웅 레벨(`hero`), 보유량, 장비, 강화 단계, 스킬, 환생. 처치 보상을 보유량과
 * 장비에 지급하고 경험치가 차면 경계에서 레벨을 올리므로 강화 단계, 스킬, 환생 말고는 모두 전투가 바꾼다. 착용, 강화 단계, 스킬
 * 장착·레벨, 환생 포인트는 전투 밖의 커맨드가 바꾸고, 그러면 그 틱의 체크포인트에서 새 능력치로 이어 간다(`refitHero`).
 */
export type BattlePlayer = Pick<
  PlayerState, "battle" | "stage" | "hero" | "items" | "equipment" | "statUpgrades" | "skills" | "rebirth"
>;

export interface BattleInput {
  readonly player: BattlePlayer;
  readonly data: GameData;
  /** false면 경계에서 레벨을 올리지 않는다. 오프라인 보상이 떠날 때 레벨의 사냥을 잴 때 쓴다. 기본은 true. */
  readonly levelUps?: boolean;
}

/** 공격 하나가 대상 하나에 준 피해와 그 뒤의 HP. 보호막이 `absorbed`만큼 먼저 막아 HP는 그 나머지만큼 준다. */
export interface Hit {
  readonly target: number;
  readonly damage: Big;
  readonly absorbed: Big;
  readonly hp: Big;
}

/** 전투원은 id(`HERO_ID`가 영웅)로 가리킨다. */
export type BattleEvent = { readonly tick: number } & (
  /** 몬스터가 `x`(영웅 앞으로 Constants의 spawnDistance)에 나왔다. */
  | { type: "spawn"; id: number; monsterId: number; boss: boolean; x: number }
  /** 사냥 웨이브가 시작했다. `wave`는 이번 웨이브의 차례(1부터, 목표에서 멈춤)이고 `wavesNeeded`는 보스까지의 목표다. 보스 웨이브는 bossStart다. */
  | { type: "waveStart"; wave: number; wavesNeeded: number }
  /**
   * 스킬 사용. 대상은 사거리 안에서 스킬의 targetRule로 고르고, 범위 스킬은 첫 대상 둘레의 반경 안까지 maxTargets까지 맞힌다(고른
   * 순서). 치명은 공격마다 한 번 정한다. 피해가 없는
   * 스킬(아군·자신 대상, 배율 0)은 `hits`가 비고, 거는 효과는 뒤따르는 효과 이벤트로 나온다. 발사체 스킬도 `hits`가
   * 비고 바로 뒤에 launch가 나온다.
   */
  | { type: "attack"; by: number; skillId: number; crit: boolean; hits: readonly Hit[] }
  /**
   * 발사체(Projectiles)를 쐈다. 고른 대상마다 하나씩 날아 `flightTicks`(쏜 순간 첫 대상까지의 거리 ÷ 발사체 속도) 뒤(착탄 틱 =
   * tick + flightTicks)에 떨어지고, 그때까지 맞는 것이 없다(대상을 따라가고 충돌 판정은 없다). `id`는 전투원과 같은 차례(`nextId`)에서 받는다. 모든 발사체는 impact나 vanish
   * 하나로 끝나고, 경계를 넘어 날지 않는다.
   */
  | { type: "launch"; id: number; by: number; projectileId: number; targets: readonly number[]; flightTicks: number }
  /**
   * 발사체가 떨어졌다. 쏠 때 고른 대상 중 살아 있는 것만 맞고(`hits`는 attack과 같다), 거는 효과는 뒤따르는 효과
   * 이벤트로 나온다. 피해는 떨어질 때의 능력치로 정하고 치명은 쏠 때 정한 것이다.
   */
  | { type: "impact"; id: number; by: number; skillId: number; crit: boolean; hits: readonly Hit[] }
  /** 발사체가 떨어지기 전에 사라졌다: 쏜 전투원이 쓰러짐, 대상이 모두 쓰러짐, 물러남. */
  | { type: "vanish"; id: number }
  /**
   * 소환수(Summons)가 나왔다. 바로 앞의 attack(소환 스킬) 다음이고, 소환자(`by`) 진영의 끝, 소환자의 자리에 나와 다음 틱부터
   * 대상이 되고 행동한다. `ticksLeft` 뒤의 틱에 만료한다. `id`는 전투원과 같은 차례(`nextId`)에서 받는다.
   */
  | { type: "summon"; id: number; by: number; summonId: number; ticksLeft: number }
  /**
   * 소환수가 쓰러지지 않고 사라졌다: 지속 시간이 다함, 같은 소환수가 꽉 찬 채 새로 부름(가장 먼저 부른 것), 소환자가 쓰러짐.
   * 적의 소환수는 물러날 때(retreat) 이벤트 없이 함께 사라진다. 쓰러지면 다른 전투원처럼 death다.
   */
  | { type: "expire"; id: number }
  /**
   * 효과(Effects)의 겹 하나가 걸렸다. `stacks`는 그 효과의 지금 겹 수다. 꽉 찼으면 가장 먼저 끝날 겹이 이 겹으로
   * 바뀐다(그 겹의 effectEnd는 없다). `ticksLeft` 0은 그 자리에서 한 번 듣고 남지 않는 효과다.
   */
  | { type: "effectApply"; id: number; effectId: number; by: number; stacks: number; ticksLeft: number }
  /** 지속 피해·회복이 들었다. `amount`는 막기 전 양이고 보호막이 `absorbed`만큼 막았다. */
  | { type: "effectTick"; id: number; effectId: number; amount: Big; absorbed: Big; hp: Big }
  /** 겹 하나가 끝났다: 만료, 정화, 보호막이 다 닳음. 죽거나 물러난 전투원의 효과는 이벤트 없이 사라진다. */
  | { type: "effectEnd"; id: number; effectId: number; reason: "expire" | "cleanse" | "break" }
  /** 정화의 면역이 막아 효과가 걸리지 않았다. */
  | { type: "effectImmune"; id: number; effectId: number }
  | { type: "death"; id: number }
  /** 살아 있는 적이 모두 물러났다(사냥 중 영웅이 쓰러짐, 보스 패배). 웨이브의 남은 등장도 없다. */
  | { type: "retreat" }
  | { type: "revive" }
  | { type: "bossStart" }
  | { type: "bossEnd"; win: boolean }
  | { type: "stageClear"; stageId: number; nextId: number | null }
  /** 경계에서 레벨이 올랐다(여러 번 올랐으면 한 번, 마지막 레벨). 영웅은 새 최대 HP로 회복한다. */
  | { type: "levelUp"; level: number }
);

/** 한 틱이 끝난 뒤의 저장 데이터. `player.battle.at`이 그 틱의 서버 시각이고, 이것에서 시작한 전투는 끊기지 않은 전투와 같다. */
export interface Boundary {
  readonly tick: number;
  readonly player: BattlePlayer;
}

/** 전투원에 걸린 효과 하나: 겹 수와 가장 늦게 끝나는 겹까지 남은 틱. 걸린 순서다. */
export interface EffectSnapshot {
  effectId: number;
  stacks: number;
  ticksLeft: number;
}

/** 전투원의 자리: 월드 x(영웅 쪽이 왼쪽)와 이번 틱에 걸었는지. */
export interface Place {
  x: number;
  moving: boolean;
}

export interface EnemySnapshot extends Place {
  id: number;
  monsterId: number;
  boss: boolean;
  hp: Big;
  maxHp: Big;
  effects: EffectSnapshot[];
}

/** 살아 있는 소환수. `ally`면 영웅 진영이다. */
export interface SummonSnapshot extends Place {
  id: number;
  summonId: number;
  by: number;
  ally: boolean;
  hp: Big;
  maxHp: Big;
  /** 만료까지 남은 틱. */
  ticksLeft: number;
  effects: EffectSnapshot[];
}

/** 날아가는 발사체. 쏠 때 고른 대상마다 하나씩 날고 `ticksLeft` 뒤에 떨어진다. */
export interface ProjectileSnapshot {
  id: number;
  by: number;
  projectileId: number;
  targets: number[];
  ticksLeft: number;
}

/**
 * 영웅이 장착해 쓰는 스킬 하나의 재사용 대기. `readyInTicks`는 다시 쓸 수 있을 때까지 남은 틱이고 0이면 준비됐다. 대기는 맞설
 * 상대가 있고 기절하지 않은 틱에만 흐른다. 준비됐어도 대상이나 조건이 맞지 않으면 쓰지 않고 기다린다.
 */
export interface SkillSnapshot {
  skillId: number;
  /** 쓴 뒤 다시 기다리는 틱. */
  cooldownTicks: number;
  readyInTicks: number;
}

export interface BattleSnapshot {
  stageId: number;
  mode: BattleMode;
  waves: number;
  wavesNeeded: number;
  autoBoss: boolean;
  hasBoss: boolean;
  /** 보스 제한 시간까지 남은 틱. 보스 중이 아니거나 제한이 없으면 null. */
  bossTicksLeft: number | null;
  hero: Place & {
    level: number;
    hp: Big;
    maxHp: Big;
    down: boolean;
    effects: EffectSnapshot[];
    /** 지금 공격력. 걸린 능력치 효과를 얹은, 전투가 피해 공식에 쓰는 값이다. */
    attack: Big;
    /** 지금 치명 확률(0..1). 걸린 능력치 효과를 얹은 값이다. */
    critChance: number;
    /** 장착한 스킬(기본 공격 빼고)을 전투가 고르는 순서(슬롯 순서)로. 피해·효과·소환이 없는 스킬은 전투가 쓰지 않으므로 없다. */
    skills: SkillSnapshot[];
  };
  /** 살아 있는 적 몬스터. 나온 순서(id 오름차순)다. 적의 소환수는 `summons`에 있다. */
  enemies: EnemySnapshot[];
  /** 살아 있는 소환수(아군 먼저, 각각 나온 순서). */
  summons: SummonSnapshot[];
  projectiles: ProjectileSnapshot[];
  /** 지금까지 받은 보상과 레벨업에 쓴 경험치를 반영한 보유량. 다음 처치까지는 같은 객체다. */
  items: ItemAmounts;
}

export interface Battle {
  /** 마지막으로 진행한 틱. 시작은 0이고, 틱 k의 서버 시각은 `battle.at + k × TICK_MS`다. */
  readonly tick: number;
  /** `tick`까지 진행하며 이벤트를 `emit`에 넘긴다. 이미 지난 틱이면 아무것도 하지 않는다. */
  advance(tick: number, emit?: (event: BattleEvent) => void): void;
  /** 진행한 범위에서 마지막 경계 직후의 체크포인트. 경계가 없으면 undefined. */
  lastBoundary(): Boundary | undefined;
  /** 지금 틱(`tick`)의 체크포인트. `settle`이 이것을 저장한다. */
  checkpoint(): Boundary;
  snapshot(): BattleSnapshot;
  /** 내부 상태 전체의 문자열. 시각은 서버 시각이라 다른 체크포인트에서 시작한 전투와도 비교된다. */
  signature(): string;
  /** `signature()`에서 `autoBoss`만 뺀 것. autoBoss는 다음 경계에서야 쓰이므로 그때까지 같은 길을 간다. */
  pathSignature(): string;
}

// 0번이 기본 공격, 그 뒤가 재사용 대기가 있는 스킬(목록 순서). `cooldown`은 쓴 뒤 다시 기다리는 틱이다. `level`은 스킬
// 레벨(영웅이 장착한 스킬만 1보다 크다)이고 효과의 양과 소환수 능력치가 쓴다. `multiplier`는 레벨을 반영한 적에게 주는 피해
// 배율(skillMultiplier)이고 아군·자신 스킬은 0이다. `range`는 사거리이고 기본 공격 스킬이 없는 전투원의 기본 공격은 null(Constants의
// meleeRange)이다. `radius`가 0보다 크면 범위 스킬이다. `condition`과 `conditionValue`가 쓰는 조건이다. `projectileId`가 있으면
// 날아가 떨어질 때 맞는다. `summonId`가 있으면 쓴 뒤 소환수를 부른다.
interface Attack {
  readonly skillId: number;
  readonly level: number;
  readonly multiplier: Big;
  readonly cooldown: number;
  readonly element: SkillElement;
  readonly target: SkillTarget;
  readonly rule: TargetRule;
  readonly maxTargets: number;
  readonly range: number | null;
  readonly radius: number;
  readonly condition: SkillCondition;
  readonly conditionValue: number;
  readonly effectIds: readonly number[];
  readonly projectileId: number | null;
  readonly summonId: number | null;
}

interface Fighter {
  readonly stats: CombatStats;
  readonly owner: IAbilityOwner;
  readonly attacks: readonly Attack[];
}

/** 진영. 아군은 영웅과 그 소환수, 적은 웨이브의 몬스터와 그 소환수다. */
enum Side {
  Ally = 0,
  Enemy = 1,
}

/** 걸린 효과의 겹 하나(`EffectState`의 실행 중 모양). */
interface Effect {
  readonly row: EffectsRow;
  ticksLeft: number;
  amount: Big;
}

/** 날아가는 발사체. 대상과 치명은 쏠 때 정하고, 피해와 효과는 떨어질 때 쏜 전투원의 그때 능력치로 정한다. */
interface Projectile {
  readonly id: number;
  readonly by: Combatant;
  readonly attack: Attack;
  readonly targets: readonly Combatant[];
  readonly crit: boolean;
  readonly impactTick: number;
}

/** 소환수를 누가 어느 레벨의 스킬로 불렀고 언제 만료하는지. */
interface Summoned {
  readonly by: Combatant;
  readonly row: SummonsRow;
  readonly level: number;
  readonly endTick: number;
}

// 한 틱 안의 처리 순서는 아군 목록, 적 목록 순서이고, 목록은 id 오름차순이다.
interface Combatant {
  readonly id: number;
  readonly side: Side;
  /** 효과 전의 능력치. 영웅은 경계에서 레벨이 오르면 바뀐다. */
  base: CombatStats;
  /** `base`에 능력치 효과를 얹은 것. 능력치 효과가 바뀌면 다시 만든다. */
  fighter: Fighter;
  readonly cooldowns: number[];
  hp: Big;
  /** 걸린 효과의 겹. 걸린 순서다. */
  readonly effects: Effect[];
  /** 월드 x. 아군은 0에서, 적은 영웅 앞(오른쪽으로 Constants의 spawnDistance)에서 시작해 상대 쪽으로 걷는다. */
  x: number;
  /** 마지막으로 걸은 틱. 스냅숏의 `moving`이 이것을 본다. */
  movedTick: number;
  /** 대상이 되고 행동하기 시작하는 틱. 나온 틱에는 싸우지 않는다. */
  readonly readyTick: number;
  /** 몬스터면 쓰러뜨렸을 때 보상이 적힌 행. */
  readonly row: MonstersRow | null;
  readonly boss: boolean;
  /** 소환수면 부른 전투원과 만료. */
  readonly summon: Summoned | null;
}

// 기본 공격은 재사용 대기가 0인 첫 스킬(없으면 skillId 0, 배율 1, 앞의 하나)로 공격 간격마다 친다. 그 밖에는
// 재사용 대기가 있고 피해나 효과, 소환이 있는 스킬만 쓴다(재사용 대기 0인 둘째부터는 매 틱 나가므로 버린다).
function fighterOf(stats: CombatStats): Fighter {
  const basic = stats.skills.find(skill => skill.cooldownSeconds === 0);
  const levelOf = (skill: SkillsRow | undefined) => (skill === undefined ? 1 : (stats.skillLevels[skill.id] ?? 1));
  const attacks: Attack[] = [attackOf(basic, stats.attackInterval, levelOf(basic))];
  for (const skill of stats.skills) {
    if (skill.cooldownSeconds === 0) continue;
    const attack = attackOf(skill, toTicks(skill.cooldownSeconds), levelOf(skill));
    if (Big.sign(attack.multiplier) > 0 || attack.effectIds.length > 0 || attack.summonId !== null) attacks.push(attack);
  }
  return { stats, owner: abilityOwner(stats), attacks };
}

function attackOf(skill: SkillsRow | undefined, cooldown: number, level: number): Attack {
  return {
    skillId: skill?.id ?? 0,
    level,
    multiplier: skill === undefined ? (basicMultiplier ??= skillMultiplier(1, 1)) : multiplierOf(skill, level),
    cooldown,
    element: skill?.element ?? SkillElement.Physical,
    target: skill?.target ?? SkillTarget.Enemy,
    rule: skill?.targetRule ?? TargetRule.Front,
    maxTargets: skill?.maxTargets ?? 1,
    range: skill?.range ?? null,
    radius: skill?.radius ?? 0,
    condition: skill?.condition ?? SkillCondition.Always,
    conditionValue: skill?.conditionValue ?? 0,
    effectIds: skill?.effectIds ?? [],
    projectileId: skill?.projectileId ?? null,
    summonId: skill?.summonId ?? null,
  };
}

// 피해 배율은 스킬 행과 레벨로만 정해지므로 행마다 기억한다. 몬스터는 나올 때마다, 전투원은 능력치 효과가 바뀔 때마다 fighterOf를
// 부르는데, 그때마다 공식을 돌리면 정산이 13% 느려진다(접속 1시간 6.6 → 7.5 ms).
const multipliers = new WeakMap<SkillsRow, Big[]>();
// 기본 공격 스킬이 없는 전투원(서리 늑대 등)의 기본 공격: 배율 1의 1레벨.
let basicMultiplier: Big | undefined;
function multiplierOf(skill: SkillsRow, level: number): Big {
  let byLevel = multipliers.get(skill);
  if (byLevel === undefined) multipliers.set(skill, (byLevel = []));
  return (byLevel[level] ??= skillMultiplier(skill.powerMultiplier ?? 0, level));
}

// 능력치 효과의 겹마다 수정치 하나(비율은 걸 때 statBuff 공식이 정한 양)를 걸린 순서로 얹는다.
function fighterWith(base: CombatStats, effects: readonly Effect[]): Fighter {
  const modifiers: StatModifier[] = [];
  for (const { row, amount } of effects) {
    if (row.kind === EffectKind.Stat) modifiers.push({ stat: row.stat!, percent: Big.toNumber(amount) });
  }
  return fighterOf(modifiers.length === 0 ? base : applyModifiers(base, modifiers));
}

// 걸 때 양을 정하는 효과의 공식. 기절·정화는 양이 없다.
function amountFormula(kind: EffectKind): E_AbilityType | null {
  switch (kind) {
    case EffectKind.Stat:
      return E_AbilityType.statBuff;
    case EffectKind.Damage:
      return E_AbilityType.dotDamage;
    case EffectKind.Heal:
      return E_AbilityType.heal;
    case EffectKind.Shield:
      return E_AbilityType.shield;
    default:
      return null;
  }
}

function effectRow(data: GameData, id: number): EffectsRow {
  const found = data.effects.get(id);
  if (found === undefined) throw new Error(`Unknown effect ${id}.`);
  return found;
}

// 저장된 효과의 겹. 데이터에서 지운 효과는 버린다.
function effectsOf(data: GameData, states: readonly EffectState[]): Effect[] {
  return states.flatMap(({ effectId, ticksLeft, amount }) => {
    const row = data.effects.get(effectId);
    return row === undefined ? [] : [{ row, ticksLeft, amount }];
  });
}

const effectStates = (self: Combatant): EffectState[] => self.effects.map(({ row, ticksLeft, amount }) => ({ effectId: row.id, ticksLeft, amount }));

/**
 * 착용·강화·스킬이 바뀐 체크포인트. 전투는 그 틱에서 그대로 이어 가고 영웅만 새 능력치로 바꾼다: 최대 HP가 오른 만큼 지금 HP를
 * 올리고(줄면 새 최대 HP로 자르며, 쓰러진 영웅은 그대로), 재사용 대기는 스킬 id로 옮긴다(새로 쓰는 스킬은 처음부터 기다린다).
 * 영웅의 소환수는 이어 받을 때 영웅의 새 능력치로 다시 계산된다.
 */
export function refitHero(before: BattlePlayer, after: BattlePlayer, data: GameData): BattleState {
  const { battle } = before;
  const effects = effectsOf(data, battle.hero.effects);
  const old = fighterWith(heroStats(before, data), effects);
  const next = fighterWith(heroStats(after, data), effects);
  const { hp, cooldowns } = battle.hero;
  const gained = Big.sub(next.stats.maxHp, old.stats.maxHp);
  const raised = Big.sign(hp) > 0 && Big.sign(gained) > 0 ? Big.add(hp, gained) : hp;
  const moved = next.attacks.map((attack, i) => {
    if (i === 0) return cooldowns[0] ?? 0;
    const j = old.attacks.findIndex((other, k) => k > 0 && other.skillId === attack.skillId);
    return j > 0 ? (cooldowns[j] ?? 0) : attack.cooldown;
  });
  return { ...battle, hero: { ...battle.hero, hp: Big.min(raised, next.stats.maxHp), cooldowns: moved } };
}

const isPulse = (row: EffectsRow) => row.kind === EffectKind.Damage || row.kind === EffectKind.Heal;

function stunned(self: Combatant): boolean {
  for (const effect of self.effects) if (effect.row.kind === EffectKind.Stun) return true;
  return false;
}

function stageRow(data: GameData, id: number): StagesRow {
  const found = data.stages.get(id);
  if (found === undefined) throw new Error(`Unknown stage ${id}.`);
  return found;
}

/**
 * 다음 웨이브가 보스인지: 스테이지에 보스가 있고 `autoBoss`가 켜져 있고 웨이브 수가 찼다. 모든 경계와 새
 * 사냥에서 체크포인트의 `mode`를 이것으로 정하고, 다음 웨이브는 `mode`만 보고 고른다. 그래서 경계 뒤에
 * `autoBoss`를 켜도 그 경계 다음의 웨이브는 바뀌지 않는다.
 */
export function bossDue(stageId: number, waves: number, autoBoss: boolean, data: GameData): boolean {
  const row = stageRow(data, stageId);
  return row.bossId !== null && autoBoss && waves >= row.waveCount;
}

/** 새 사냥의 영웅 재사용 대기: 기본 공격은 바로, 스킬은 처음부터 기다린다. */
export function initialCooldowns(hero: CombatStats): number[] {
  return fighterOf(hero).attacks.map((attack, i) => (i === 0 ? 0 : attack.cooldown));
}

const alive = (combatant: Combatant) => Big.sign(combatant.hp) > 0;

/**
 * 스킬의 속성이 맞는 쪽의 속성에 강하면 1, 약하면 -1, 아니면 0(공식 elementMultiplier의 입력). 불과 얼음은 서로에게 강하고, 신성은
 * 독에 강하며, 같은 속성끼리는 약하다. 물리는 어느 쪽이든 0이다.
 */
export function elementAdvantage(attack: SkillElement, defense: SkillElement): number {
  if (attack === SkillElement.Physical || defense === SkillElement.Physical) return 0;
  if (attack === defense) return -1;
  const strong =
    (attack === SkillElement.Fire && defense === SkillElement.Ice) ||
    (attack === SkillElement.Ice && defense === SkillElement.Fire) ||
    (attack === SkillElement.Holy && defense === SkillElement.Poison);
  return strong ? 1 : 0;
}

/** 두 전투원 사이의 거리. 거리 비교에 이만큼의 여유를 두어 다가가 멈춘 자리의 반올림 오차가 사거리 밖으로 보이지 않게 한다. */
const RANGE_SLACK = 1e-9;
const distance = (a: Combatant, b: Combatant) => Math.max(a.x - b.x, b.x - a.x);
/** HP가 최대 HP의 `ratio` 이하인지(조건 hurt). */
const hurt = (self: Combatant, ratio: number) => Big.lte(self.hp, Big.mul(self.fighter.stats.maxHp, ratio));
const within = (a: Combatant, b: Combatant, range: number) => distance(a, b) <= range + RANGE_SLACK;

// 걸린 겹을 효과마다 하나로 묶는다(걸린 순서, 남은 틱은 가장 늦게 끝나는 겹).
function effectSnapshots(combatant: Combatant): EffectSnapshot[] {
  const grouped: EffectSnapshot[] = [];
  for (const effect of combatant.effects) {
    const entry = grouped.find(other => other.effectId === effect.row.id);
    if (entry) {
      entry.stacks++;
      entry.ticksLeft = Math.max(entry.ticksLeft, effect.ticksLeft);
    } else {
      grouped.push({ effectId: effect.row.id, stacks: 1, ticksLeft: effect.ticksLeft });
    }
  }
  return grouped;
}

export function startBattle({ player, data, levelUps = true }: BattleInput): Battle {
  const { battle } = player;
  const reviveTicks = toTicks(data.constants.reviveSeconds);
  const { spawnDistance, meleeRange } = data.constants;
  const heroBase = heroStats(player, data);
  const heroEffects = effectsOf(data, battle.hero.effects);
  const heroFighter = fighterWith(heroBase, heroEffects);
  const hero: Combatant = {
    id: HERO_ID,
    side: Side.Ally,
    base: heroBase,
    fighter: heroFighter,
    // 저장된 길이가 스킬 수와 다르면(스킬 목록이 바뀜) 모자란 것은 준비된 것으로 채우고 남는 것은 버린다.
    cooldowns: heroFighter.attacks.map((_, i) => battle.hero.cooldowns[i] ?? 0),
    hp: battle.hero.hp,
    effects: heroEffects,
    x: battle.hero.x,
    movedTick: -1,
    readyTick: 0,
    row: null,
    boss: false,
    summon: null,
  };
  // 소환수는 영웅 뒤에 선다. 쓰러지거나 만료한 전투원은 틱이 끝날 때 목록에서 뺀다.
  let allies: Combatant[] = [hero];
  let enemies: Combatant[] = [];
  // 날아가는 발사체. 쏜 순서다.
  const projectiles: Projectile[] = [];
  let tick = 0;
  let mode = battle.mode;
  let rng = battle.rng;
  let waves = battle.waves;
  let autoBoss = battle.autoBoss;
  let nextId = battle.nextId;
  let stage = player.stage;
  // 전투원 영웅(`hero`)과 구별해 저장 데이터의 영웅 성장은 heroState로 부른다.
  let heroState = player.hero;
  let items = player.items;
  let equipment = player.equipment;
  const { statUpgrades, skills, rebirth } = player;
  // 처치와 클리어 보상의 골드에 곱하는 환생 배율. 전투 안에서 바뀌지 않는다.
  const goldRate = rebirthRate(rebirth);
  // 영웅이 쓰는 스킬과 레벨. 전투 안에서 바뀌지 않는다.
  const skillsKey = heroBase.skills.map(skill => [skill.id, heroBase.skillLevels[skill.id] ?? 1]);
  let row = stageRow(data, stage.currentId);
  // 진행 중인 웨이브가 시작한 틱, 나올 수와 등장 간격(틱), 그때부터 나온 수. null이면 다음 틱에 다음 웨이브를 시작한다.
  let waveStart: number | null = battle.wave === null ? null : -battle.wave.elapsed;
  let waveSize = 0;
  let spawnInterval = 1;
  let spawned = battle.wave?.spawned ?? 0;
  if (battle.wave !== null) shapeWave();
  // 이번 틱에 쓰러지거나 만료한 전투원이 있다. 틱이 끝날 때 목록에서 뺀다.
  let fallen = false;
  let reviveAt: number | null = battle.reviveTicksLeft;
  let deadline: number | null = battle.bossTicksLeft;
  let last: Boundary | undefined;
  let emit: (event: BattleEvent) => void = () => {};
  // 체크포인트의 몬스터와 소환수, 발사체. 이어 받은 전투원은 0틱에 나온 셈이라 1틱부터 대상이 되고 행동한다. 데이터에서 지운
  // 몬스터·소환수는 버린다. 소환수의 레벨은 지금 소환자가 그 소환수를 부르는 스킬의 레벨이다.
  for (const saved of battle.enemies) {
    const found = data.monsters.get(saved.monsterId);
    if (found !== undefined) enemies.push(resumedMonster(saved, found));
  }
  for (const saved of battle.summons) {
    const found = data.summons.get(saved.summonId);
    const by = saved.by === HERO_ID ? hero : enemies.find(enemy => enemy.id === saved.by);
    if (found === undefined || by === undefined) continue;
    const level = by.fighter.attacks.find(attack => attack.summonId === saved.summonId)?.level ?? 1;
    (by.side === Side.Ally ? allies : enemies).push(summoned(saved.id, by, found, level, saved.ticksLeft, saved));
  }
  // 한 틱 안의 처리 순서가 id 순서이므로 적의 소환수를 몬스터 사이의 제자리에 둔다.
  enemies.sort((a, b) => a.id - b.id);
  for (const saved of battle.projectiles) {
    const by = combatant(saved.by);
    if (by === undefined) continue;
    const targets = saved.targets.flatMap(id => combatant(id) ?? []);
    projectiles.push({ id: saved.id, by, attack: savedAttack(saved), targets, crit: saved.crit, impactTick: saved.ticksLeft });
  }

  function combatant(id: number): Combatant | undefined {
    return allies.find(other => other.id === id) ?? enemies.find(other => other.id === id);
  }

  // 발사체를 쏜 스킬: 저장한 스킬 행과 레벨에서 다시 만든다. 떨어질 때는 재사용 대기를 쓰지 않는다.
  function savedAttack({ skillId, level }: ProjectileState): Attack {
    const skill = data.skills.get(skillId);
    if (skill === undefined) throw new Error(`Unknown skill ${skillId}.`);
    return attackOf(skill, 0, level);
  }

  function resumedMonster(saved: MonsterState, found: MonstersRow): Combatant {
    const base = monsterStats(found, data);
    const effects = effectsOf(data, saved.effects);
    const fighter = fighterWith(base, effects);
    return {
      id: saved.id,
      side: Side.Enemy,
      base,
      fighter,
      cooldowns: fighter.attacks.map((attack, i) => saved.cooldowns[i] ?? attack.cooldown),
      hp: saved.hp,
      effects,
      x: saved.x,
      movedTick: -1,
      readyTick: tick + 1,
      row: found,
      boss: saved.boss,
      summon: null,
    };
  }

  // 웨이브의 크기와 등장 간격. 보스 웨이브는 보스 하나다.
  function shapeWave(): void {
    if (mode === BattleMode.Boss && row.bossId !== null) {
      waveSize = 1;
      return;
    }
    waveSize = row.waveSize;
    spawnInterval = toTicks(row.spawnIntervalSeconds);
  }

  function random(): number {
    const result = next(rng);
    rng = result.state;
    return result.value;
  }

  // 경계는 늘 그 틱의 마지막 변화다(그 뒤로는 다음 틱까지 아무것도 바뀌지 않는다). 그래서 여기서 이어
  // 간 전투가 끊기지 않은 전투와 같다. 모든 경계에서 레벨업을 확인하고 다음 웨이브(mode)를 bossDue로 정한다.
  // 레벨은 적이 없는 경계에서만 오르므로 이미 지난 공격은 옛 능력치 그대로다.
  function boundary(): void {
    // 경계(웨이브 클리어, 보스 종료, 부활)에서는 적이 모두 쓰러졌거나 물러났으므로 발사체도 모두 사라졌다.
    if (projectiles.length > 0) throw new Error(`Projectile ${projectiles[0].id} is in flight at a boundary.`);
    // 아군은 0으로 돌아온다. 그래서 체크포인트에는 자리가 없고, 이어 간 전투도 같은 자리에서 시작한다.
    for (const ally of allies) ally.x = 0;
    const leveled = levelUps ? levelUp(heroState, items, data) : { hero: heroState, items };
    if (leveled.hero !== heroState) {
      ({ hero: heroState, items } = leveled);
      // 스킬(장착과 레벨)과 공격 간격은 레벨로 바뀌지 않으므로 재사용 대기는 그대로 이어진다. 걸린 효과도 그대로 얹는다.
      hero.base = heroStats({ hero: heroState, equipment, statUpgrades, skills, rebirth }, data);
      hero.fighter = fighterWith(hero.base, hero.effects);
      hero.hp = hero.fighter.stats.maxHp;
      // 소환수도 새 능력치로 다시 계산한다(체크포인트에서 이어 받는 소환수와 같다). HP는 그대로다.
      for (const ally of allies) {
        if (ally.summon === null) continue;
        ally.base = summonStats(ally.summon.row, hero.base, ally.summon.level, data);
        refit(ally);
      }
      emit({ tick, type: "levelUp", level: heroState.level });
    }
    mode = bossDue(stage.currentId, waves, autoBoss, data) ? BattleMode.Boss : BattleMode.Hunt;
    last = save();
  }

  const combatantState = (self: Combatant): CombatantState => ({ hp: self.hp, cooldowns: [...self.cooldowns], effects: effectStates(self), x: self.x });

  // 지금 틱의 체크포인트. 틱 도중(경계)에는 쓰러지거나 만료한 전투원이 아직 목록에 있을 수 있어 산 것만 담는다.
  function save(): Boundary {
    const summons: SummonState[] = [];
    // 소환수는 소환하지 않으므로 소환자는 영웅이나 적 몬스터다.
    for (const self of [...allies, ...enemies]) {
      if (self.summon === null || !alive(self)) continue;
      summons.push({ ...combatantState(self), id: self.id, summonId: self.summon.row.id, by: self.summon.by.id, ticksLeft: self.summon.endTick - tick });
    }
    summons.sort((a, b) => a.id - b.id);
    const checkpoint: BattleState = {
      mode,
      at: battle.at + tick * TICK_MS,
      rng,
      hero: combatantState(hero),
      summons,
      waves,
      autoBoss,
      nextId,
      enemies: enemies.flatMap(self => self.row === null || !alive(self) ? [] : [{ ...combatantState(self), id: self.id, monsterId: self.row.id, boss: self.boss }]),
      projectiles: projectiles.map(({ id, by, attack, targets, crit, impactTick }) => ({
        id, by: by.id, skillId: attack.skillId, level: attack.level, targets: targets.filter(alive).map(target => target.id), crit, ticksLeft: impactTick - tick,
      })),
      wave: waveStart === null ? null : { elapsed: tick - waveStart, spawned },
      bossTicksLeft: deadline === null ? null : deadline - tick,
      reviveTicksLeft: reviveAt === null ? null : reviveAt - tick,
    };
    return { tick, player: { battle: checkpoint, stage, hero: heroState, items, equipment, statUpgrades, skills, rebirth } };
  }

  function spawn(monsterId: number, boss: boolean): void {
    const found = data.monsters.get(monsterId);
    if (found === undefined) throw new Error(`Unknown monster ${monsterId}.`);
    const base = monsterStats(found, data);
    const fighter = fighterOf(base);
    const id = nextId++;
    const x = hero.x + spawnDistance;
    enemies.push({
      id,
      side: Side.Enemy,
      base,
      fighter,
      cooldowns: fighter.attacks.map(attack => attack.cooldown),
      hp: fighter.stats.maxHp,
      effects: [],
      x,
      movedTick: -1,
      readyTick: tick + 1,
      row: found,
      boss,
      summon: null,
    });
    emit({ tick, type: "spawn", id, monsterId, boss, x });
  }

  // 소환수 전투원. 능력치는 소환자의 효과 전 능력치에서 나오고, 나온 다음 틱부터 대상이 되고 행동한다(체크포인트에서
  // 이어 받으면 0틱에 나온 셈이라 1틱부터다). 새 소환수는 최대 HP이고 기본 공격은 바로, 스킬은 처음부터 기다린다.
  function summoned(id: number, by: Combatant, row: SummonsRow, level: number, endTick: number, saved?: SummonState): Combatant {
    const base = summonStats(row, by.base, level, data);
    const effects = effectsOf(data, saved?.effects ?? []);
    const fighter = fighterWith(base, effects);
    return {
      id,
      side: by.side,
      base,
      fighter,
      cooldowns: fighter.attacks.map((attack, i) => saved?.cooldowns[i] ?? (i === 0 ? 0 : attack.cooldown)),
      // 소환자의 능력치가 줄었으면(장비를 벗음) 새 최대 HP로 자른다.
      hp: saved === undefined ? fighter.stats.maxHp : Big.min(saved.hp, fighter.stats.maxHp),
      effects,
      x: saved?.x ?? by.x,
      movedTick: -1,
      readyTick: tick + 1,
      row: null,
      boss: false,
      summon: { by, row, level, endTick },
    };
  }

  // 소환수를 소환자 진영의 끝에 부른다. 같은 소환자의 같은 소환수가 꽉 찼으면 가장 먼저 부른 것이 만료한다.
  function call(by: Combatant, summonId: number, level: number): void {
    const row = data.summons.get(summonId);
    if (row === undefined) throw new Error(`Unknown summon ${summonId}.`);
    const side = by.side === Side.Ally ? allies : enemies;
    let count = 0;
    let oldest: Combatant | undefined;
    for (const other of side) {
      if (other.summon?.by !== by || other.summon.row !== row || !alive(other)) continue;
      count++;
      oldest ??= other;
    }
    if (count >= row.maxCount) expire(oldest!);
    const id = nextId++;
    const ticksLeft = toTicks(row.durationSeconds);
    side.push(summoned(id, by, row, level, tick + ticksLeft));
    emit({ tick, type: "summon", id, by: by.id, summonId, ticksLeft });
  }

  // 보스 차례는 경계에서 정해 두었다. 보스가 없는 스테이지에 Boss로 들어온 입력은 사냥한다. 보스 웨이브는 보스
  // 하나이고, 사냥 웨이브의 i번째는 시작 틱 + i × 등장 간격에 나온다.
  function startWave(): void {
    waveStart = tick;
    spawned = 0;
    if (mode === BattleMode.Boss && row.bossId !== null) {
      emit({ tick, type: "bossStart" });
      hero.hp = hero.fighter.stats.maxHp;
      deadline = row.timeLimitSeconds > 0 ? tick + toTicks(row.timeLimitSeconds) : null;
      shapeWave();
      return;
    }
    mode = BattleMode.Hunt;
    if (row.monsterIds.length === 0) throw new Error(`Stage ${row.id} has no monsters to hunt.`);
    emit({ tick, type: "waveStart", wave: Math.min(waves + 1, row.waveCount), wavesNeeded: row.waveCount });
    shapeWave();
  }

  // 사냥 몬스터의 종류는 나올 때 난수로 고른다.
  function spawnDue(): void {
    while (spawned < waveSize && tick >= waveStart! + spawned * spawnInterval) {
      spawned++;
      if (mode === BattleMode.Boss) spawn(row.bossId!, true);
      else spawn(row.monsterIds[Math.floor(random() * row.monsterIds.length)], false);
    }
  }

  const targetable = (combatant: Combatant) => tick >= combatant.readyTick && alive(combatant);


  const reach = (attack: Attack) => attack.range ?? meleeRange;
  // `from`에 더 가까운 쪽이 앞이고, 같으면 id가 작은 쪽이 앞이다.
  const closer = (from: Combatant, a: Combatant, b: Combatant) => distance(from, a) - distance(from, b) || a.id - b.id;
  const nearer = (from: Combatant) => (a: Combatant, b: Combatant) => closer(from, a, b);

  // 후보(사거리 안의 대상이 될 수 있는 것, id 오름차순)에서 규칙으로 고른다. 범위 스킬은 첫 대상과 그 둘레 반경 안의 대상(같은 진영,
  // 사거리와 무관)을 첫 대상에 가까운 순서로 maxTargets까지 맞힌다. 고른 순서가 피해를 주는 순서다.
  function pick(self: Combatant, candidates: Combatant[], side: readonly Combatant[], attack: Attack): Combatant[] {
    const { rule, maxTargets, radius } = attack;
    const n = Math.min(radius > 0 ? 1 : maxTargets, candidates.length);
    if (rule === TargetRule.Front && n === 1) {
      // 가장 가까운 하나(기본 공격의 흔한 경우)는 정렬 없이 찾는다. 순서가 전순서라 정렬의 첫째와 같다.
      let first = candidates[0];
      for (const other of candidates) if (closer(self, other, first) < 0) first = other;
      candidates[candidates.indexOf(first)] = candidates[0];
      candidates[0] = first;
    } else {
      switch (rule) {
      case TargetRule.Front:
        candidates.sort(nearer(self));
        break;
      case TargetRule.Weakest:
        candidates.sort((a, b) => Big.cmp(a.hp, b.hp) || closer(self, a, b));
        break;
      case TargetRule.Random:
        // 앞에서부터 남은 후보 중 하나를 골라 바꾸므로(Fisher–Yates의 앞 n칸) 한 번 고른 대상은 다시 나오지 않는다.
        for (let i = 0; i < n; i++) {
          const j = i + Math.floor(random() * (candidates.length - i));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        break;
      }
    }
    if (radius <= 0) return n < candidates.length ? candidates.slice(0, n) : candidates;
    const first = candidates[0];
    const splash = side.filter(other => other !== first && targetable(other) && within(first, other, radius)).sort(nearer(first));
    return [first, ...splash.slice(0, maxTargets - 1)];
  }

  // 스킬을 지금 쓸 수 있으면 대상을, 아니면 null. 적·아군 스킬은 사거리 안에 대상이 있어야 하고, 조건이 hurt면 HP 비율이
  // conditionValue 이하인 대상만, crowd면 사거리 안의 적이 conditionValue 이상일 때만 쓴다. 자신 스킬의 사거리는 crowd가 적을 세는 거리다.
  // 틱마다 준비된 스킬마다 부르므로, 대상이 없으면 배열을 만들지 않는다.
  function targetsFor(self: Combatant, attack: Attack): Combatant[] | null {
    const foes = self.side === Side.Ally ? enemies : allies;
    const range = reach(attack);
    const { condition, conditionValue } = attack;
    if (condition === SkillCondition.Crowd) {
      let near = 0;
      for (const foe of foes) if (targetable(foe) && within(self, foe, range)) near++;
      if (near < conditionValue) return null;
    }
    if (attack.target === SkillTarget.Self) return condition === SkillCondition.Hurt && !hurt(self, conditionValue) ? null : [self];
    const side = attack.target === SkillTarget.Enemy ? foes : self.side === Side.Ally ? allies : enemies;
    let candidates: Combatant[] | undefined;
    for (const other of side) {
      if (!targetable(other) || !within(self, other, range)) continue;
      if (condition === SkillCondition.Hurt && !hurt(other, conditionValue)) continue;
      (candidates ??= []).push(other);
    }
    return candidates === undefined ? null : pick(self, candidates, side, attack);
  }

  // 가장 가까운, 대상이 될 수 있는 상대. 없으면 undefined. 틱마다 모든 전투원이 부르므로 클로저를 만들지 않는다.
  function nearestFoe(self: Combatant): Combatant | undefined {
    let nearest: Combatant | undefined;
    for (const foe of self.side === Side.Ally ? enemies : allies) {
      if (targetable(foe) && (nearest === undefined || closer(self, foe, nearest) < 0)) nearest = foe;
    }
    return nearest;
  }

  // 사거리가 가장 가까운 상대(거리 `gap`)에 못 미치는 스킬은 적 대상도 crowd 조건도 맞을 수 없다.
  const outOfReach = (attack: Attack, gap: number) =>
    (attack.target === SkillTarget.Enemy || attack.condition === SkillCondition.Crowd) && reach(attack) + RANGE_SLACK < gap;

  // 준비된 스킬 중 쓸 수 있는 앞의 것, 없으면 준비된 기본 공격을 쓸 수 있을 때 그것. 아무것도 쓸 수 없으면 null.
  function choose(self: Combatant, gap: number): { index: number; targets: Combatant[] } | null {
    const waits = self.cooldowns;
    const { attacks } = self.fighter;
    for (let i = 1; i < waits.length; i++) {
      if (waits[i] > 0 || outOfReach(attacks[i], gap)) continue;
      const targets = targetsFor(self, attacks[i]);
      if (targets !== null) return { index: i, targets };
    }
    if (waits[0] > 0 || outOfReach(attacks[0], gap)) return null;
    const targets = targetsFor(self, attacks[0]);
    return targets === null ? null : { index: 0, targets };
  }

  // 가장 가까운 상대가 기본 공격의 사거리 밖이면 이동 속도로 한 틱만큼, 사거리에 닿는 자리까지 다가간다.
  function approach(self: Combatant, nearest: Combatant): void {
    const gap = distance(self, nearest) - reach(self.fighter.attacks[0]);
    const step = Math.min((self.fighter.stats.moveSpeed * TICK_MS) / 1000, gap);
    if (step <= RANGE_SLACK) return;
    self.x += nearest.x > self.x ? step : -step;
    self.movedTick = tick;
  }

  // 발사체가 나는 틱: 쏜 순간 첫 대상까지의 거리 ÷ 속도.
  function flightOf(projectileId: number, from: Combatant, to: Combatant): number {
    const found = data.projectiles.get(projectileId);
    if (found === undefined) throw new Error(`Unknown projectile ${projectileId}.`);
    return toTicks(distance(from, to) / found.speed);
  }

  // 전투원 하나의 차례. 맞설 상대가 있을 때만 모든 대기를 하나씩 줄이고, 쓸 수 있는 스킬(choose)을 쓴다. 쓸 것이 없으면
  // 다가간다. 발사체 스킬은 쏘기만 하고 land가 떨어뜨린다. 소환 스킬은 쓴 뒤 소환수를 부른다. 누가 쓰러졌으면 true.
  function act(self: Combatant): boolean {
    const nearest = nearestFoe(self);
    if (nearest === undefined) return false;
    const waits = self.cooldowns;
    for (let i = 0; i < waits.length; i++) waits[i] = Math.max(0, waits[i] - 1);
    const choice = choose(self, distance(self, nearest));
    if (choice === null) {
      approach(self, nearest);
      return false;
    }
    const { stats, attacks } = self.fighter;
    const attack = attacks[choice.index];
    waits[choice.index] = attack.cooldown;
    const { targets } = choice;
    // 몬스터는 critChance가 0이라 난수를 쓰지 않는다.
    const crit = Big.sign(attack.multiplier) > 0 && stats.critChance > 0 && random() < stats.critChance;
    const { skillId, projectileId, summonId } = attack;
    if (projectileId === null) {
      const killed = strike(self, attack, targets, crit, null);
      if (summonId !== null && alive(self)) call(self, summonId, attack.level);
      return killed;
    }
    emit({ tick, type: "attack", by: self.id, skillId, crit, hits: [] });
    const id = nextId++;
    const flightTicks = flightOf(projectileId, self, targets[0]);
    projectiles.push({ id, by: self, attack, targets, crit, impactTick: tick + flightTicks });
    emit({ tick, type: "launch", id, by: self.id, projectileId, targets: targets.map(target => target.id), flightTicks });
    return false;
  }

  // 공격이 대상에 닿는다. 피해를 주고(바로 맞는 스킬은 attack, 발사체 `projectileId`는 impact 이벤트) 적 스킬은 살아남은
  // 대상에, 아군·자신 스킬은 고른 대상에 효과를 건 뒤 쓰러진 대상을 거둔다. 누가 쓰러졌으면 true.
  function strike(self: Combatant, attack: Attack, targets: readonly Combatant[], crit: boolean, projectileId: number | null): boolean {
    const { stats, owner } = self.fighter;
    const hits: Hit[] = [];
    if (Big.sign(attack.multiplier) > 0) {
      for (const target of targets) {
        let damage = Big.mul(Formula.get(E_AbilityType.damage, owner, target.fighter.owner), attack.multiplier);
        const advantage = elementAdvantage(attack.element, target.fighter.stats.element);
        if (advantage !== 0) {
          damage = Big.mul(damage, Formula.get(E_AbilityType.elementMultiplier, owner, target.fighter.owner, { elementAdvantage: advantage }));
        }
        if (crit) damage = Big.mul(damage, stats.critMultiplier);
        damage = Big.floor(damage);
        hits.push({ target: target.id, damage, absorbed: harm(target, damage), hp: target.hp });
      }
    }
    const { skillId } = attack;
    emit(projectileId === null
      ? { tick, type: "attack", by: self.id, skillId, crit, hits }
      : { tick, type: "impact", id: projectileId, by: self.id, skillId, crit, hits });
    for (let t = 0; t < targets.length; t++) {
      const target = targets[t];
      if (t < hits.length && Big.sign(hits[t].absorbed) > 0) dropBroken(target);
      for (const effectId of attack.effectIds) if (alive(target)) applyEffect(self, target, effectRow(data, effectId), attack.level);
    }
    let killed = false;
    for (const target of targets) {
      if (alive(target)) continue;
      killed = true;
      kill(target);
    }
    return killed;
  }

  const landing = (projectile: Projectile) => projectile.impactTick === tick;

  // 이 틱에 떨어지는 발사체를 쏜 순서로 맞힌다. 대상 중 그때 살아 있는 것만 맞는다(모두 쓰러졌으면 이미 사라졌다). 맞힐
  // 때마다 다른 발사체가 사라질 수 있어 처음부터 다시 찾는다. 이 틱이 끝났으면 true.
  function land(): boolean {
    for (let i = projectiles.findIndex(landing); i >= 0; i = projectiles.findIndex(landing)) {
      const [{ id, by, attack, targets, crit }] = projectiles.splice(i, 1);
      if (strike(by, attack, targets.filter(alive), crit, id) && outcome()) return true;
    }
    return false;
  }

  // 조건에 맞는 발사체를 거두고 vanish를 낸다.
  function vanish(match: (projectile: Projectile) => boolean): void {
    for (let i = 0; i < projectiles.length; ) {
      const projectile = projectiles[i];
      if (!match(projectile)) {
        i++;
        continue;
      }
      projectiles.splice(i, 1);
      emit({ tick, type: "vanish", id: projectile.id });
    }
  }

  // 쓰러진 전투원. 몬스터면 보상을 준다.
  function kill(target: Combatant): void {
    emit({ tick, type: "death", id: target.id });
    leave(target);
    if (target.row !== null) {
      ({ items, equipment } = addReward({ items, equipment }, target.row.rewardItemIds, target.row.rewardAmounts, data, goldRate));
    }
  }

  // 소환수가 만료한다. HP를 0으로 두어 쓰러진 것처럼 대상과 발사체, 다음 체크포인트에서 빠진다.
  function expire(self: Combatant): void {
    emit({ tick, type: "expire", id: self.id });
    self.hp = Big.ZERO;
    leave(self);
  }

  // 전투에서 빠진 전투원(쓰러짐, 만료). 그가 쐈거나 대상이 모두 빠진 발사체는 사라지고, 그가 부른 소환수는 만료한다.
  // 목록에서는 틱이 끝날 때 뺀다.
  function leave(self: Combatant): void {
    fallen = true;
    vanish(projectile => projectile.by === self || !projectile.targets.some(alive));
    for (const other of self.side === Side.Ally ? allies : enemies) if (other.summon?.by === self && alive(other)) expire(other);
  }

  // 피해를 준다. 보호막(걸린 순서)이 먼저 막고 나머지가 HP를 깎는다. 막은 양을 돌려준다. 다 닳은 보호막은
  // 이벤트를 낸 뒤 dropBroken이 뗀다.
  function harm(target: Combatant, damage: Big): Big {
    let left = damage;
    for (const effect of target.effects) {
      if (effect.row.kind !== EffectKind.Shield || Big.sign(left) <= 0) continue;
      const taken = Big.min(effect.amount, left);
      effect.amount = Big.sub(effect.amount, taken);
      left = Big.sub(left, taken);
    }
    target.hp = Big.lte(target.hp, left) ? Big.ZERO : Big.sub(target.hp, left);
    return left === damage ? Big.ZERO : Big.sub(damage, left);
  }

  function dropBroken(target: Combatant): void {
    remove(target, "break", effect => effect.row.kind === EffectKind.Shield && Big.sign(effect.amount) <= 0);
  }

  // 조건에 맞는 겹을 떼고 effectEnd를 낸다. 능력치 효과를 뗐으면 능력치를 다시 얹는다.
  function remove(target: Combatant, reason: "expire" | "cleanse" | "break", match: (effect: Effect) => boolean): void {
    let restat = false;
    for (let i = 0; i < target.effects.length; ) {
      const effect = target.effects[i];
      if (!match(effect)) {
        i++;
        continue;
      }
      target.effects.splice(i, 1);
      emit({ tick, type: "effectEnd", id: target.id, effectId: effect.row.id, reason });
      if (effect.row.kind === EffectKind.Stat) restat = true;
    }
    if (restat) refit(target);
  }

  // 효과가 바뀐 뒤 능력치를 다시 얹는다. 최대 HP가 줄면 HP도 그만큼 자른다.
  function refit(target: Combatant): void {
    target.fighter = fighterWith(target.base, target.effects);
    if (Big.gt(target.hp, target.fighter.stats.maxHp)) target.hp = target.fighter.stats.maxHp;
  }

  // 효과의 겹 하나를 건다. 정화의 면역이 막으면 걸리지 않는다. 정화는 걸리면서 목록의 효과를 푼다. 양은 종류의 공식
  // (dotDamage, heal, shield, statBuff)에 시전자의 지금 능력치, 대상, power, 건 스킬의 레벨을 넣은 값이다. 지속 0이면 그 자리에서
  // 한 번 듣고 남지 않는다. 겹이 꽉 찼으면 가장 먼저 끝날 겹(같은 효과는 지속이 같으므로 가장 먼저 걸린 것)을 떼고 새 겹을 뒤에 둔다.
  function applyEffect(by: Combatant, target: Combatant, row: EffectsRow, level: number): void {
    if (target.effects.some(effect => effect.row.kind === EffectKind.Cleanse && effect.row.effectIds!.includes(row.id))) {
      emit({ tick, type: "effectImmune", id: target.id, effectId: row.id });
      return;
    }
    if (row.kind === EffectKind.Cleanse) remove(target, "cleanse", effect => row.effectIds!.includes(effect.row.id));
    const formula = amountFormula(row.kind);
    const amount = formula === null ? Big.ZERO : Formula.get(formula, by.fighter.owner, target.fighter.owner, { power: row.power!, skillLevel: level });
    const ticksLeft = row.durationSeconds === 0 ? 0 : toTicks(row.durationSeconds);
    let stacks = 1;
    if (ticksLeft > 0) {
      const same = target.effects.filter(effect => effect.row.id === row.id);
      if (same.length >= row.maxStacks) target.effects.splice(target.effects.indexOf(same[0]), 1);
      stacks = Math.min(same.length + 1, row.maxStacks);
      target.effects.push({ row, ticksLeft, amount });
    }
    emit({ tick, type: "effectApply", id: target.id, effectId: row.id, by: by.id, stacks, ticksLeft });
    if (ticksLeft === 0 && isPulse(row) && Big.sign(pulse(target, row, amount)) > 0) dropBroken(target);
    if (row.kind === EffectKind.Stat && ticksLeft > 0) refit(target);
  }

  // 지속 피해·회복 한 번. 보호막이 막은 양을 돌려준다.
  function pulse(target: Combatant, row: EffectsRow, amount: Big): Big {
    let absorbed = Big.ZERO;
    if (row.kind === EffectKind.Heal) target.hp = Big.min(Big.add(target.hp, amount), target.fighter.stats.maxHp);
    else absorbed = harm(target, amount);
    emit({ tick, type: "effectTick", id: target.id, effectId: row.id, amount, absorbed, hp: target.hp });
    return absorbed;
  }

  // 걸린 겹마다 남은 틱을 하나 줄인다. 지속 피해·회복은 남은 틱이 간격(tickSeconds)으로 나누어떨어지는 틱에 듣고
  // (끝나는 틱 포함), 0이 되면 끝난다. 지속 시간이 다한 소환수는 그 전에 만료한다. 지속 피해로 쓰러졌으면 true.
  function tickEffects(self: Combatant): boolean {
    if (self.summon !== null && self.summon.endTick <= tick && alive(self)) {
      expire(self);
      return false;
    }
    if (self.effects.length === 0 || !alive(self)) return false;
    let broke = false;
    let ended = false;
    for (const effect of self.effects) {
      if (--effect.ticksLeft <= 0) ended = true;
      if (!isPulse(effect.row) || effect.ticksLeft % toTicks(effect.row.tickSeconds!) !== 0) continue;
      if (Big.sign(pulse(self, effect.row, effect.amount)) > 0) broke = true;
      if (alive(self)) continue;
      kill(self);
      return true;
    }
    if (broke) dropBroken(self);
    if (ended) remove(self, "expire", effect => effect.ticksLeft <= 0);
    return false;
  }

  // 효과의 틱과 소환수의 만료. 차례와 같은 순서(아군 → 적)다. 누가 쓰러졌으면 차례 뒤와 같은 결과를 보고, 이 틱이 끝났으면 true.
  function tickAll(): boolean {
    let fell = false;
    for (const self of allies) fell = tickEffects(self) || fell;
    for (const self of enemies) fell = tickEffects(self) || fell;
    return fell && outcome();
  }

  // 살아 있는 적과 남은 등장, 날아가는 발사체를 모두 거둔다.
  function retreat(): void {
    vanish(() => true);
    emit({ tick, type: "retreat" });
    enemies = [];
    waveStart = null;
  }

  function clearStage(): void {
    const stageId = row.id;
    ({ items, equipment } = addReward({ items, equipment }, row.clearItemIds, row.clearAmounts, data, goldRate));
    const clearedIds = stage.clearedIds.includes(stageId) ? stage.clearedIds : [...stage.clearedIds, stageId];
    // 다음 스테이지: 이 스테이지가 선행인 것 중 해금된 것의 가장 작은 ID. 최솟값이라 순회 순서와 무관하다. 레벨은
    // 곧 이어지는 경계에서 클리어 보상까지 받아 오를 레벨로 본다.
    const after = { hero: levelUps ? levelUp(heroState, items, data).hero : heroState, stage: { ...stage, clearedIds } };
    let nextStageId: number | null = null;
    for (const candidate of data.stages.values()) {
      if (candidate.unlockStageId !== stageId || !isUnlocked(candidate, after)) continue;
      if (nextStageId === null || candidate.id < nextStageId) nextStageId = candidate.id;
    }
    emit({ tick, type: "stageClear", stageId, nextId: nextStageId });
    stage = { currentId: nextStageId ?? stageId, clearedIds };
    row = stageRow(data, stage.currentId);
    waves = 0;
    autoBoss = nextStageId !== null;
    hero.hp = hero.fighter.stats.maxHp;
  }

  function endBoss(win: boolean): void {
    if (!win) retreat();
    emit({ tick, type: "bossEnd", win });
    enemies = [];
    waveStart = null;
    deadline = null;
    if (win) {
      clearStage();
    } else {
      autoBoss = false;
      hero.hp = hero.fighter.stats.maxHp;
    }
    boundary();
  }

  // 사냥 웨이브를 다 잡았다. 보스가 없는 스테이지는 autoBoss가 켜져 있고 웨이브 수가 차면 클리어한다.
  function clearWave(): void {
    enemies = [];
    waveStart = null;
    waves = Math.min(waves + 1, row.waveCount);
    if (row.bossId === null && autoBoss && waves >= row.waveCount) clearStage();
    boundary();
  }

  // 차례 하나. 나온 틱과 기절한 동안은 행동하지 않고 걷지 않는다(재사용 대기도 흐르지 않는다). 이 틱이 끝났으면 true.
  function turn(self: Combatant): boolean {
    if (!targetable(self) || stunned(self) || !act(self)) return false;
    return outcome();
  }

  // 누가 쓰러진 뒤의 결과. 이 틱이 끝났으면(영웅이 쓰러짐, 보스 종료, 웨이브 클리어) true. 쓰러진 영웅의 효과는 사라진다.
  function outcome(): boolean {
    if (!alive(hero)) {
      if (hero.effects.length > 0) {
        hero.effects.length = 0;
        refit(hero);
      }
      if (mode === BattleMode.Boss) {
        endBoss(false);
      } else {
        // 사냥 중 쓰러짐은 경계가 아니다. 웨이브는 물러나고 일어난 다음 틱에 새 웨이브가 나온다.
        retreat();
        reviveAt = tick + reviveTicks;
      }
      return true;
    }
    if (mode === BattleMode.Boss) {
      if (enemies.some(alive)) return false;
      endBoss(true);
      return true;
    }
    if (spawned < waveSize || enemies.some(alive)) return false;
    clearWave();
    return true;
  }

  function step(): void {
    tick++;
    fallen = false;
    play();
    // 차례를 도는 동안에는 목록을 바꾸지 않는다. 쓰러진 영웅은 일어날 때까지 남는다.
    if (fallen) {
      allies = allies.filter(ally => ally === hero || alive(ally));
      enemies = enemies.filter(alive);
    }
  }

  function play(): void {
    if (reviveAt !== null) {
      if (tick < reviveAt) return;
      // 일어난 틱은 경계이므로 다음 웨이브는 다음 틱에 나온다.
      reviveAt = null;
      hero.hp = hero.fighter.stats.maxHp;
      emit({ tick, type: "revive" });
      boundary();
      return;
    }
    if (waveStart === null) startWave();
    spawnDue();
    if (tickAll() || land()) return;
    for (const self of allies) if (turn(self)) return;
    for (const self of enemies) if (turn(self)) return;
    if (deadline !== null && tick >= deadline) endBoss(false);
  }

  const effectsKey = (self: Combatant) => self.effects.map(({ row, ticksLeft, amount }) => [row.id, ticksLeft, amount.m, amount.e]);
  // 영웅 밖의 전투원. 대상이 되기까지는 다음 틱부터 기다릴 틱만 본다(체크포인트에서 이어 받은 소환수는 나온 틱이 다르다).
  const combatantKey = (self: Combatant) => [
    self.id, self.row?.id ?? null, self.boss, [self.hp.m, self.hp.e], self.cooldowns, Math.max(0, self.readyTick - tick - 1), effectsKey(self), self.x,
    self.summon === null ? null : [self.summon.by.id, self.summon.row.id, self.summon.endTick - tick],
  ];

  // 틱 값은 남은 틱·지난 틱으로 바꿔, 같은 서버 시각의 같은 상태면 시작 체크포인트와 무관하게 같다.
  // 입력에서 온 객체의 키 순서에 기대지 않도록 키를 직접 나열한다(정수 키 객체는 오름차순이다). 보유량, 가진 장비, 쓰지 않는
  // 스킬의 레벨은 넣지 않는다. 길을 바꾸는 것은 레벨, 착용, 강화 단계, 쓰는 스킬과 그 레벨뿐이라서, 저장된 보유량만 다른
  // 전투(서버가 따로 지급함)는 같은 길로 본다.
  function signature(withAutoBoss: boolean): string {
    return JSON.stringify([
      battle.at + tick * TICK_MS,
      stage.currentId,
      stage.clearedIds,
      heroState.level,
      equipment.equipped,
      statUpgrades,
      skillsKey,
      rebirth.points,
      mode,
      rng,
      [hero.hp.m, hero.hp.e],
      hero.cooldowns,
      effectsKey(hero),
      hero.x,
      waves,
      ...(withAutoBoss ? [autoBoss] : []),
      nextId,
      reviveAt === null ? null : reviveAt - tick,
      deadline === null ? null : deadline - tick,
      waveStart === null ? null : [tick - waveStart, spawned],
      allies.slice(1).map(combatantKey),
      enemies.map(combatantKey),
      projectiles.map(({ id, by, attack, targets, crit, impactTick }) => [
        id, by.id, attack.skillId, attack.level, targets.filter(alive).map(target => target.id), crit, impactTick - tick,
      ]),
    ]);
  }

  const place = (self: Combatant): Place => ({ x: self.x, moving: self.movedTick === tick });

  return {
    get tick() {
      return tick;
    },
    advance(target, onEvent) {
      emit = onEvent ?? (() => {});
      while (tick < target) step();
    },
    lastBoundary: () => last,
    checkpoint: save,
    snapshot: () => ({
      stageId: stage.currentId,
      mode,
      waves,
      wavesNeeded: row.waveCount,
      autoBoss,
      hasBoss: row.bossId !== null,
      bossTicksLeft: deadline === null ? null : deadline - tick,
      hero: {
        level: heroState.level, hp: hero.hp, maxHp: hero.fighter.stats.maxHp, down: reviveAt !== null, effects: effectSnapshots(hero), ...place(hero),
        attack: hero.fighter.stats.attack,
        critChance: hero.fighter.stats.critChance,
        // 0번은 기본 공격이다. 대기는 쓴 틱에 cooldown이 되고 차례마다 하나씩 줄어 0인 틱에 다시 쓴다.
        skills: hero.fighter.attacks.slice(1).map((attack, i) => ({ skillId: attack.skillId, cooldownTicks: attack.cooldown, readyInTicks: hero.cooldowns[i + 1] })),
      },
      enemies: enemies.flatMap(enemy => enemy.row === null ? [] : [{
        id: enemy.id,
        monsterId: enemy.row.id,
        boss: enemy.boss,
        hp: enemy.hp,
        maxHp: enemy.fighter.stats.maxHp,
        effects: effectSnapshots(enemy),
        ...place(enemy),
      }]),
      summons: [...allies, ...enemies].flatMap(combatant => combatant.summon === null || !alive(combatant) ? [] : [{
        id: combatant.id,
        summonId: combatant.summon.row.id,
        by: combatant.summon.by.id,
        ally: combatant.side === Side.Ally,
        hp: combatant.hp,
        maxHp: combatant.fighter.stats.maxHp,
        ticksLeft: combatant.summon.endTick - tick,
        effects: effectSnapshots(combatant),
        ...place(combatant),
      }]),
      projectiles: projectiles.map(projectile => ({
        id: projectile.id,
        by: projectile.by.id,
        projectileId: projectile.attack.projectileId!,
        targets: projectile.targets.map(target => target.id),
        ticksLeft: projectile.impactTick - tick,
      })),
      items,
    }),
    signature: () => signature(true),
    pathSignature: () => signature(false),
  };
}
