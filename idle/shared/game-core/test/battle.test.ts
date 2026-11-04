import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import {
  EffectKind,
  loadGameData,
  SkillElement,
  SkillTarget,
  Stat,
  TargetRule,
  type EffectsRow,
  type GameData,
  type MonstersRow,
  type SkillsRow,
  type StagesRow,
  type SummonsRow,
} from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { E_AbilityType } from "../src/ability-type.js";
import { MAX_SETTLE_TICKS, TICK_MS, toTicks } from "../src/battle/constants.js";
import { settle } from "../src/battle/settle.js";
import {
  bossDue,
  elementAdvantage,
  initialCooldowns,
  startBattle,
  type Battle,
  type BattleEvent,
  type BattleInput,
  type Boundary,
} from "../src/battle/simulation.js";
import { BattleMode, HERO_ID, type EffectState, type SummonState } from "../src/battle/state.js";
import { abilityOwner, applyModifiers, heroStats, monsterStats, summonStats, type CombatStats } from "../src/battle/stats.js";
import { Formula } from "../src/formulas.js";
import type { ItemAmounts } from "../src/items.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { NO_STAT_UPGRADES } from "../src/stat-upgrade.js";
import { heroSkills, startSkills, type SkillsState } from "../src/skills.js";
import type { PlayerState } from "../src/state.js";

const loaded = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const EXP = loaded.constants.expItemId;
const REVIVE_TICKS = toTicks(loaded.constants.reviveSeconds);

function patch<T>(rows: ReadonlyMap<number, T>, id: number, change: Partial<T>): Map<number, T> {
  return new Map(rows).set(id, { ...rows.get(id)!, ...change });
}

// 레벨업은 "levels"에서, 소환수는 "summons"에서, 걷기와 사거리는 "positions"에서 따로 시험한다. 나머지는 1레벨 능력치로 계산하므로
// 레벨이 오르지 않게 하고, 영웅은 새 계정이 쓰는 스킬 중 소환 스킬을 뺀 것만 가진다. 시험 데이터의 영웅은 가진 스킬을 모두
// 장착한다(startSkills). 몬스터는 영웅의 기본 공격 사거리(1) 끝에 나와 걷지 않고 나온 다음 틱부터 싸운다.
const data: GameData = {
  ...loaded,
  constants: { ...loaded.constants, spawnDistance: 1 },
  heroes: patch(loaded.heroes, 1, {
    skillIds: heroSkills(startSkills(loaded), loaded).filter(skill => skill.summonId === null).map(skill => skill.id),
  }),
  heroLevels: new Map([...loaded.heroLevels].map(([id, row]) => [id, { ...row, expToNext: null }])),
};
// 저장 데이터의 영웅 성장. 전투원 영웅(`hero`의 능력치)과 구별한다.
const heroState = { level: 1 };
const equipment = NO_EQUIPMENT;
const statUpgrades = NO_STAT_UPGRADES;
const rebirth = NO_REBIRTH;
/** 영웅의 능력치. 스킬은 그 데이터의 새 계정처럼 장착한다. */
const heroOf = (gameData: GameData, level = 1) =>
  heroStats({ hero: { level }, equipment, statUpgrades, skills: startSkills(gameData), rebirth }, gameData);
const hero = heroOf(data);
// 영웅의 능력치는 테이블에서 오므로, 다른 영웅은 1레벨 행이나 Heroes 행을 바꾼 데이터로 만든다.
const strong: GameData = { ...data, heroLevels: patch(data.heroLevels, 1, { attack: Big.add(hero.attack, 100000) }) };
// 치지도 쓰러지지도 않는 영웅. 웨이브가 다 나와 함께 싸우는 것을 본다.
const tank: GameData = {
  ...data,
  heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001] }),
  heroLevels: patch(data.heroLevels, 1, { maxHp: Big.from(1e12), attack: Big.from(1), defense: Big.from(1e12) }),
};

type AttackEvent = Extract<BattleEvent, { type: "attack" }>;
/** 피해를 주는 이벤트: 바로 맞는 스킬의 attack과 발사체의 impact. */
type StrikeEvent = Extract<BattleEvent, { type: "attack" | "impact" }>;

interface Options {
  mode?: BattleMode;
  stageId?: number;
  waves?: number;
  cooldowns?: number[];
  hp?: Big;
  effects?: EffectState[];
  summons?: SummonState[];
  items?: ItemAmounts;
  /** 기본은 그 데이터의 새 계정처럼 장착한 1레벨 스킬. */
  skills?: SkillsState;
  data?: GameData;
}

// 1레벨 영웅의 새 사냥. 새 사냥처럼 mode는 따로 주지 않으면 bossDue로 정한다.
function input(options: Options = {}): BattleInput {
  const stageId = options.stageId ?? 3001;
  const waves = options.waves ?? 0;
  const gameData = options.data ?? data;
  const skills = options.skills ?? startSkills(gameData);
  const stats = heroStats({ hero: heroState, equipment, statUpgrades, skills, rebirth }, gameData);
  return {
    player: {
      battle: {
        mode: options.mode ?? (bossDue(stageId, waves, true, gameData) ? BattleMode.Boss : BattleMode.Hunt),
        at: 1_000_000,
        rng: 12345,
        hero: { hp: options.hp ?? stats.maxHp, cooldowns: options.cooldowns ?? initialCooldowns(stats), effects: options.effects ?? [], x: 0 },
        summons: options.summons ?? [],
        waves,
        autoBoss: true,
        nextId: 1,
        enemies: [],
        projectiles: [],
        wave: null,
        bossTicksLeft: null,
        reviveTicksLeft: null,
      },
      stage: { currentId: stageId, clearedIds: [] },
      hero: heroState,
      items: options.items ?? {},
      equipment,
      statUpgrades,
      skills,
      rebirth,
    },
    data: gameData,
  };
}

function run(battle: Battle, tick: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  battle.advance(tick, event => events.push(event));
  return events;
}

// 한 틱씩 진행하다 기다리던 이벤트가 나온 틱에서 멈춘다. 그 틱의 경계가 lastBoundary()다.
function runUntil(battle: Battle, done: (event: BattleEvent) => boolean): BattleEvent[] {
  const events: BattleEvent[] = [];
  while (!events.some(done)) {
    if (battle.tick >= 20_000) throw new Error("The awaited event never came.");
    battle.advance(battle.tick + 1, event => events.push(event));
  }
  return events;
}

const heroAttacks = (events: readonly BattleEvent[]) =>
  events.filter((event): event is AttackEvent => event.type === "attack" && event.by === HERO_ID);
const monsterAttacks = (events: readonly BattleEvent[]) =>
  events.filter((event): event is AttackEvent => event.type === "attack" && event.by !== HERO_ID);
const ofType = <T extends BattleEvent["type"]>(events: readonly BattleEvent[], type: T) =>
  events.filter((event): event is Extract<BattleEvent, { type: T }> => event.type === type);
const isHeroDeath = (event: BattleEvent) => event.type === "death" && event.id === HERO_ID;
const isMonsterDeath = (event: BattleEvent) => event.type === "death" && event.id !== HERO_ID;

const statsOf = (monsterId: number, gameData = data) => monsterStats(gameData.monsters.get(monsterId)!, gameData);

interface Tracked {
  readonly id: number;
  readonly monsterId: number;
  /** 대상이 되는 첫 틱. */
  readonly ready: number;
  hp: Big;
}

// 이벤트로 적을 따라가며, 공격과 착탄마다 그 직전에 살아 있는 적(id 순서)을 넘긴다.
function replay(
  events: readonly BattleEvent[], visit: (attack: StrikeEvent, enemies: ReadonlyMap<number, Tracked>) => void, gameData = data,
): void {
  const enemies = new Map<number, Tracked>();
  for (const event of events) {
    if (event.type === "spawn") {
      const { id, monsterId } = event;
      enemies.set(id, { id, monsterId, ready: event.tick + 1, hp: statsOf(monsterId, gameData).maxHp });
    } else if (event.type === "attack" || event.type === "impact") {
      visit(event, enemies);
      for (const hit of event.hits) {
        const enemy = enemies.get(hit.target);
        if (enemy) enemy.hp = hit.hp;
      }
    } else if (event.type === "death") {
      enemies.delete(event.id);
    } else if (event.type === "retreat") {
      enemies.clear();
    }
  }
}

// 영웅의 차례에 대상이 있는 틱: 재사용 대기가 줄어드는 틱이다. 적은 나온 다음 틱부터 쓰러지거나 물러난 틱까지 대상이다.
// 차례(영웅이 맨 앞)보다 먼저 오는 효과 틱과 착탄에 쓰러지거나 물러났으면 그 틱은 빼는데, 그 틱에 attack이 아직 없어서 안다.
function heroTurns(events: readonly BattleEvent[]): number[] {
  const ready = new Map<number, number>();
  const ticks = new Set<number>();
  let acted = -1;
  const close = (id: number, tick: number) => {
    const end = acted === tick ? tick : tick - 1;
    for (let at = ready.get(id)!; at <= end; at++) ticks.add(at);
    ready.delete(id);
  };
  for (const event of events) {
    if (event.type === "attack") acted = event.tick;
    else if (event.type === "spawn") ready.set(event.id, event.tick + 1);
    else if (event.type === "death" && ready.has(event.id)) close(event.id, event.tick);
    else if (event.type === "retreat") for (const id of [...ready.keys()]) close(id, event.tick);
  }
  // 끝까지 살아 있는 적은 마지막 이벤트의 틱까지 대상이다.
  const last = events.at(-1)?.tick ?? 0;
  for (const id of [...ready.keys()]) close(id, last + 1);
  return [...ticks].sort((a, b) => a - b);
}

function expectedDamage(attacker: CombatStats, target: CombatStats, skillId: number, crit: boolean): Big {
  const base = Formula.get(E_AbilityType.damage, abilityOwner(attacker), abilityOwner(target));
  // 기본 공격 스킬이 없는 몬스터(2005)는 skillId 0, 배율 1, 물리로 친다.
  const skill = data.skills.get(skillId);
  let damage = Big.mul(base, skill?.powerMultiplier ?? 1);
  const advantage = elementAdvantage(skill?.element ?? SkillElement.Physical, target.element);
  if (advantage !== 0) damage = Big.mul(damage, Formula.get(E_AbilityType.elementMultiplier, abilityOwner(attacker), abilityOwner(target), { elementAdvantage: advantage }));
  if (crit) damage = Big.mul(damage, attacker.critMultiplier);
  return Big.floor(damage);
}

// 모든 공격의 피해가 공격자와 대상의 능력치로 계산한 것과 같다.
function expectDamageFrom(events: readonly BattleEvent[], heroAt: CombatStats, gameData = data): void {
  replay(events, (attack, enemies) => {
    const attacker = attack.by === HERO_ID ? heroAt : statsOf(enemies.get(attack.by)!.monsterId, gameData);
    for (const hit of attack.hits) {
      const target = hit.target === HERO_ID ? heroAt : statsOf(enemies.get(hit.target)!.monsterId, gameData);
      expect(hit.damage).toEqual(expectedDamage(attacker, target, attack.skillId, attack.crit));
    }
  }, gameData);
}

function withStage(id: number, change: Partial<StagesRow>, base = data): GameData {
  return { ...base, stages: patch(base.stages, id, change) };
}

// 모든 틱의 체크포인트(경계든 웨이브·보스전·부활 대기 도중이든)에서 다시 시작한 전투가 끊기지 않은 전투와 같은 상태이고, 경계의
// 체크포인트는 그 틱의 체크포인트와 같다. 경계와 몇 틱(97틱마다)에서 다시 시작한 전투는 끝까지 같은 이벤트와 같은 보유량을 낸다.
function expectEveryTickResumes(start: BattleInput, ticks: number): BattleEvent[] {
  const a = startBattle(start);
  const events: BattleEvent[] = [];
  const resumes: Boundary[] = [];
  let boundaries = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    a.advance(tick, event => events.push(event));
    const checkpoint = a.checkpoint();
    expect(checkpoint.tick).toBe(tick);
    expect(startBattle({ ...start, player: checkpoint.player }).signature()).toBe(a.signature());
    const atBoundary = a.lastBoundary()?.tick === tick;
    if (atBoundary) {
      boundaries++;
      expect(a.lastBoundary()!.player).toEqual(checkpoint.player);
    }
    if (atBoundary || tick % 97 === 0) resumes.push(checkpoint);
  }
  expect(boundaries).toBeGreaterThan(10);
  for (const b of resumes) {
    const resumed = startBattle({ ...start, player: b.player });
    const tail = run(resumed, ticks - b.tick).map(event => ({ ...event, tick: event.tick + b.tick }));
    expect(tail).toEqual(events.filter(event => event.tick > b.tick));
    expect(resumed.signature()).toBe(a.signature());
    // 보유량은 signature에 없다.
    expect(resumed.snapshot().items).toEqual(a.snapshot().items);
  }
  return events;
}

describe("determinism", () => {
  test("the same input yields the same events", () => {
    const events = run(startBattle(input()), 3000);
    expect(events.length).toBeGreaterThan(0);
    expect(run(startBattle(input()), 3000)).toEqual(events);
  });

  test("advancing in steps equals advancing at once", () => {
    const battle = startBattle(input());
    const steps = [...run(battle, 1000), ...run(battle, 3000)];
    expect(steps).toEqual(run(startBattle(input()), 3000));
  });

  test("a run resumed from a boundary continues the same events", () => {
    const a = startBattle(input());
    const events = run(a, 3000);
    const b = a.lastBoundary()!;
    expect(b.player.battle.at).toBe(1_000_000 + b.tick * 100);

    const resumed = startBattle({ ...input(), player: b.player });
    const tail = run(resumed, 3000 - b.tick).map(event => ({ ...event, tick: event.tick + b.tick }));
    expect(tail).toEqual(events.filter(event => event.tick > b.tick));
    expect(resumed.signature()).toBe(a.signature());
  });

  test("every tick resumes to the same state", () => {
    const events = expectEveryTickResumes(input(), 3000);
    expect(events.some(event => event.type === "retreat")).toBe(true);
  });

  test("every tick of boss fights resumes to the same state", () => {
    const won = expectEveryTickResumes(input({ data: strong, stageId: 3004, waves: 2 }), 3000);
    expect(won).toContainEqual(expect.objectContaining({ type: "bossEnd", win: true }));
    const lost = expectEveryTickResumes(input({ stageId: 3004, waves: 3 }), 3000);
    expect(lost).toContainEqual(expect.objectContaining({ type: "bossEnd", win: false }));
  });

  test("signature differs when state differs and matches when equal", () => {
    const a = startBattle(input());
    const b = startBattle(input());
    a.advance(500);
    b.advance(500);
    expect(a.signature()).toBe(b.signature());
    b.advance(501);
    expect(b.signature()).not.toBe(a.signature());
  });

  test("pathSignature leaves out autoBoss and nothing else", () => {
    const base = input();
    const at = (change: object) => ({ ...base, player: { ...base.player, battle: { ...base.player.battle, ...change } } });
    const on = startBattle(base);
    const off = startBattle(at({ autoBoss: false }));
    const other = startBattle(at({ rng: 54321 }));
    const numbered = startBattle(at({ nextId: 9 }));
    // 착용은 길을 바꾸고, 가지기만 한 장비는 바꾸지 않는다.
    const owned = { nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: {} };
    const holding = startBattle({ ...base, player: { ...base.player, equipment: owned } });
    const wearing = startBattle({ ...base, player: { ...base.player, equipment: { ...owned, equipped: { 1: 1 } } } });
    // 3001은 보스가 없고 웨이브 셋이 되기 전이라 autoBoss가 길을 바꾸지 않는다.
    for (const battle of [on, off, other, numbered, holding, wearing]) battle.advance(1);
    expect(off.pathSignature()).toBe(on.pathSignature());
    expect(off.signature()).not.toBe(on.signature());
    expect(other.pathSignature()).not.toBe(on.pathSignature());
    expect(numbered.pathSignature()).not.toBe(on.pathSignature());
    expect(holding.pathSignature()).toBe(on.pathSignature());
    expect(wearing.pathSignature()).not.toBe(on.pathSignature());
  });
});

describe("fighting", () => {
  const events = run(startBattle(input()), 3000);

  test("monsters neither fight nor are targets in the tick they appear", () => {
    const spawns = events.filter(event => event.type === "spawn");
    expect(spawns.length).toBeGreaterThan(5);
    for (const spawn of spawns) {
      const early = events.filter(event => event.type === "attack" && event.by === spawn.id && event.tick <= spawn.tick);
      expect(early).toEqual([]);
    }
    replay(events, (attack, enemies) => {
      for (const hit of attack.hits) if (hit.target !== HERO_ID) expect(attack.tick).toBeGreaterThanOrEqual(enemies.get(hit.target)!.ready);
    });
  });

  test("the hero uses ready skills in list order, else the basic attack", () => {
    const attacks = heroAttacks(events);
    expect(attacks[0].skillId).toBe(1001);
    const turns = heroTurns(events);
    expect(attacks.find(event => event.skillId === 1004)!.tick).toBe(turns[toTicks(5) - 1]);
    expect(attacks.find(event => event.skillId === 1005)!.tick).toBe(turns[toTicks(8) - 1]);

    const first = monsterAttacks(events)[0];
    const spawn = events.find(event => event.type === "spawn" && event.id === first.by);
    if (spawn?.type !== "spawn") throw new Error("No spawn for the first monster attack.");
    expect(first.tick).toBe(spawn.tick + statsOf(spawn.monsterId).attackInterval);
  });

  test("every hit takes the damage of its attacker against its target, and crits multiply by critMultiplier", () => {
    expectDamageFrom(events, hero);
    expect(heroAttacks(events).some(event => event.crit)).toBe(true);
    expect(monsterAttacks(events).length).toBeGreaterThan(0);
    for (const attack of monsterAttacks(events)) expect(attack.crit).toBe(false);
  });

  test("only the first skill without a cooldown is the basic attack and the others are never used", () => {
    const twoBasics: GameData = {
      ...data,
      heroes: patch(data.heroes, 1, { skillIds: [1001, 1002] }),
      skills: patch(data.skills, 1002, { cooldownSeconds: 0 }),
    };
    const events = run(startBattle(input({ data: twoBasics })), 3000);
    expect(new Set(heroAttacks(events).map(event => event.skillId))).toEqual(new Set([1001]));
    // 영웅의 공격은 대상이 있는 차례로 공격 간격마다 나온다.
    const turns = heroTurns(events);
    const at = heroAttacks(events).map(event => turns.indexOf(event.tick));
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBe(hero.attackInterval);
    expect(at.length).toBeGreaterThan(10);
  });

  test("cooldowns of another length are padded or cut", () => {
    for (const cooldowns of [[0], [0, 0, 0, 0, 0]]) {
      const battle = startBattle(input({ cooldowns }));
      const used = new Set(heroAttacks(run(battle, 3000)).map(event => event.skillId));
      expect([...used].sort()).toEqual([1001, 1004, 1005]);
      expect(battle.lastBoundary()!.player.battle.hero.cooldowns).toHaveLength(initialCooldowns(hero).length);
    }
  });
});

describe("waves", () => {
  test("a wave's monsters come at its interval with ids in order and fight together", () => {
    const spaced = withStage(3002, { spawnIntervalSeconds: 0.5 }, tank);
    const battle = startBattle(input({ data: spaced, stageId: 3002 }));
    const events = run(battle, 40);
    const spawns = events.filter(event => event.type === "spawn");
    expect(spawns.map(event => [event.tick, event.id, event.boss])).toEqual([[1, 1, false], [6, 2, false], [11, 3, false]]);
    // 사거리 끝에 나와 걷지 않는다.
    expect(battle.snapshot().enemies.map(enemy => [enemy.id, enemy.x, enemy.moving])).toEqual([[1, 1, false], [2, 1, false], [3, 1, false]]);
    expect(new Set(monsterAttacks(run(battle, 200)).map(event => event.by))).toEqual(new Set([1, 2, 3]));
    // 웨이브가 끝나지 않았으니 경계도 없다.
    expect(battle.lastBoundary()).toBeUndefined();
  });

  test("each kill pays at once and only the wave's clear is a boundary", () => {
    const battle = startBattle(input({ items: { 1: Big.from(1000) } }));
    expect(battle.snapshot().items).toEqual({ 1: Big.from(1000) });
    const first = runUntil(battle, isMonsterDeath);
    expect(first.filter(event => event.type === "spawn")).toHaveLength(2);
    expect(battle.lastBoundary()).toBeUndefined();
    expect(battle.snapshot().items).toEqual({ 1: Big.from(1005), 2: Big.from(10) });

    runUntil(battle, isMonsterDeath);
    const b = battle.lastBoundary()!;
    expect(b.tick).toBe(battle.tick);
    expect(b.player.items).toEqual({ 1: Big.from(1010), 2: Big.from(20) });
    expect(b.player.battle).toMatchObject({ waves: 1, nextId: 3 });
    expect(battle.snapshot().items).toBe(b.player.items);
    expect(battle.snapshot().enemies).toEqual([]);
  });

  test("a kill pays only up to an item's cap", () => {
    const capped: GameData = { ...data, items: patch(data.items, 1, { cap: Big.from(1003) }) };
    const battle = startBattle(input({ data: capped, items: { 1: Big.from(1000) } }));
    runUntil(battle, event => event.type === "death");
    runUntil(battle, event => event.type === "death");
    expect(battle.lastBoundary()!.player.items).toEqual({ 1: Big.from(1003), 2: Big.from(20) });
  });

  test("a fallen hunter's wave retreats uncounted and the hero rises after REVIVE_TICKS", () => {
    const frail: GameData = { ...data, heroLevels: patch(data.heroLevels, 1, { maxHp: Big.from(1) }) };
    const battle = startBattle(input({ data: frail }));
    const events = runUntil(battle, event => event.type === "revive");
    const death = events.findIndex(isHeroDeath);
    expect(events.slice(death)).toEqual([
      { tick: events[death].tick, type: "death", id: HERO_ID },
      { tick: events[death].tick, type: "retreat" },
      { tick: events[death].tick + REVIVE_TICKS, type: "revive" },
    ]);
    expect(battle.lastBoundary()).toMatchObject({ tick: battle.tick, player: { battle: { hero: { hp: Big.from(1) }, waves: 0 } } });
    expect(battle.snapshot().enemies).toEqual([]);

    const spawned = events.filter(event => event.type === "spawn").length;
    const tick = battle.tick;
    expect(run(battle, tick + 1)).toEqual([
      { tick: tick + 1, type: "waveStart", wave: 1, wavesNeeded: loaded.stages.get(3001)!.waveCount },
      { tick: tick + 1, type: "spawn", id: spawned + 1, monsterId: 2001, boss: false, x: 1 },
    ]);
  });

  test("the wave count stops at the target while autoBoss is off", () => {
    for (const stageId of [3004, 3001]) {
      const start = input({ data: strong, stageId, waves: 3, mode: BattleMode.Hunt });
      const battle = startBattle({ ...start, player: { ...start.player, battle: { ...start.player.battle, autoBoss: false } } });
      const events = run(battle, 1000);
      expect(events.filter(isMonsterDeath).length).toBeGreaterThan(10);
      expect(events.some(event => event.type === "bossStart" || event.type === "stageClear")).toBe(false);
      expect(battle.lastBoundary()!.player.battle).toMatchObject({ waves: 3, mode: BattleMode.Hunt });
      expect(battle.snapshot()).toMatchObject({ waves: 3, wavesNeeded: 3 });
    }
  });
});

describe("targets", () => {
  // 영웅이 기본 공격 하나만 쓰고, 그 규칙과 대상 수를 바꾼다. 웨이브가 0.1초 간격으로 나와 함께 맞선다.
  function heroWith(rule: TargetRule, maxTargets: number): GameData {
    return withStage(3002, { spawnIntervalSeconds: 0.1 }, {
      ...data,
      heroes: patch(data.heroes, 1, { skillIds: [1001] }),
      skills: patch(data.skills, 1001, { targetRule: rule, maxTargets }),
    });
  }

  // 공격마다 그 직전의 후보(살아 있고 다가온 적, id 순서)와 함께 넘긴다.
  function eachHeroAttack(gameData: GameData, visit: (attack: StrikeEvent, candidates: Tracked[]) => void): number {
    const events = run(startBattle(input({ data: gameData, stageId: 3002 })), 3000);
    let crowded = 0;
    replay(events, (attack, enemies) => {
      if (attack.by !== HERO_ID) return;
      const candidates = [...enemies.values()].filter(enemy => Big.sign(enemy.hp) > 0 && attack.tick >= enemy.ready);
      if (candidates.length > 1) crowded++;
      visit(attack, candidates);
    }, gameData);
    return crowded;
  }

  const targets = (attack: StrikeEvent) => attack.hits.map(hit => hit.target);
  const ids = (candidates: readonly Tracked[]) => candidates.map(enemy => enemy.id);

  test("front hits the first candidates in processing order, as many as maxTargets", () => {
    for (const maxTargets of [1, 2, 3]) {
      const crowded = eachHeroAttack(heroWith(TargetRule.Front, maxTargets), (attack, candidates) => {
        expect(targets(attack)).toEqual(ids(candidates).slice(0, maxTargets));
      });
      expect(crowded).toBeGreaterThan(5);
    }
  });

  test("weakest hits the candidates with the least HP left, earlier ones first on a tie", () => {
    for (const maxTargets of [1, 2]) {
      const crowded = eachHeroAttack(heroWith(TargetRule.Weakest, maxTargets), (attack, candidates) => {
        const order = [...candidates].sort((a, b) => Big.cmp(a.hp, b.hp) || a.id - b.id);
        expect(targets(attack)).toEqual(ids(order).slice(0, maxTargets));
      });
      expect(crowded).toBeGreaterThan(5);
    }
  });

  test("random hits distinct candidates drawn from the seed, not always the front", () => {
    let offFront = 0;
    eachHeroAttack(heroWith(TargetRule.Random, 2), (attack, candidates) => {
      const hit = targets(attack);
      expect(new Set(hit).size).toBe(hit.length);
      expect(hit.length).toBe(Math.min(2, candidates.length));
      for (const id of hit) expect(ids(candidates)).toContain(id);
      if (hit[0] !== candidates[0].id) offFront++;
    });
    expect(offFront).toBeGreaterThan(0);
  });

  test("an area skill hits up to its maxTargets in one attack, each hit with its own damage", () => {
    // 영웅의 화염구(1005)는 앞의 셋에 발사체를 쏜다. 쓰러지지 않는 1레벨 행으로 셋이 오래 함께 서게 한다.
    const gameData = withStage(3002, { spawnIntervalSeconds: 0.1 }, { ...tank, heroes: data.heroes });
    const events = run(startBattle(input({ data: gameData, stageId: 3002 })), 1500);
    const fireballs = events.filter((event): event is StrikeEvent => event.type === "impact" && event.skillId === 1005);
    expect(fireballs.length).toBeGreaterThan(0);
    expect(fireballs.some(event => event.hits.length === 3)).toBe(true);
    expect(fireballs.every(event => event.hits.length <= data.skills.get(1005)!.maxTargets)).toBe(true);
    expectDamageFrom(events, heroOf(gameData), gameData);
  });
});

describe("stages and bosses", () => {
  test("a stage without a boss clears at its wave count", () => {
    const battle = startBattle(input());
    const events = runUntil(battle, event => event.type === "stageClear");
    expect(events.filter(isMonsterDeath)).toHaveLength(6);
    expect(events[events.length - 1]).toEqual({ tick: battle.tick, type: "stageClear", stageId: 3001, nextId: 3002 });

    const b = battle.lastBoundary()!;
    expect(b.tick).toBe(battle.tick);
    expect(b.player.stage).toEqual({ currentId: 3002, clearedIds: [3001] });
    // 몬스터 여섯 다음 id에서 영웅이 쏜 발사체만큼 지났다.
    const launches = events.filter(event => event.type === "launch").length;
    expect(launches).toBeGreaterThan(0);
    expect(b.player.battle).toMatchObject({ mode: BattleMode.Hunt, waves: 0, autoBoss: true, hero: { hp: hero.maxHp }, nextId: 7 + launches });
    // 슬라임(골드 5, 경험치 10) 여섯 마리와 3001의 클리어 보상(골드 30, 경험치 50, 낡은 검).
    expect(b.player.items).toEqual({ 1: Big.from(60), 2: Big.from(110) });
    expect(b.player.equipment).toEqual({ nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: {} });
  });

  test("a boss pays its own reward and the clear reward only when it falls", () => {
    // 오우거 대장(골드 180, 경험치 350)과 3004의 클리어 보상(골드 250, 경험치 400).
    const won = startBattle(input({ data: strong, stageId: 3004, waves: 3 }));
    runUntil(won, event => event.type === "bossEnd");
    expect(won.lastBoundary()!.player.items).toEqual({ 1: Big.from(430), 2: Big.from(750) });
    expect(won.lastBoundary()!.player.equipment.owned).toEqual({ 1: { itemId: 104, enhance: 0 } });

    const lost = startBattle(input({ stageId: 3004, waves: 3 }));
    expect(runUntil(lost, event => event.type === "bossEnd").pop()).toMatchObject({ win: false });
    expect(lost.lastBoundary()!.player.items).toEqual({});
    expect(lost.lastBoundary()!.player.equipment).toBe(NO_EQUIPMENT);
  });

  test("the boss comes alone when the waves are reached and autoBoss is on", () => {
    expect(run(startBattle(input({ stageId: 3004, waves: 3, mode: BattleMode.Boss })), 1)).toEqual([
      { tick: 1, type: "bossStart" },
      { tick: 1, type: "spawn", id: 1, monsterId: 2008, boss: true, x: 1 },
    ]);

    const battle = startBattle(input({ data: strong, stageId: 3004, waves: 2, mode: BattleMode.Hunt }));
    const events: BattleEvent[] = [];
    while (battle.lastBoundary() === undefined) battle.advance(battle.tick + 1, event => events.push(event));
    expect(events.filter(event => event.type === "spawn").map(event => [event.tick, event.id, event.boss])).toEqual([
      [1, 1, false], [11, 2, false], [21, 3, false],
    ]);
    expect(battle.lastBoundary()).toMatchObject({ tick: battle.tick, player: { battle: { mode: BattleMode.Boss, waves: 3 } } });
    const tick = battle.tick;
    const fight = runUntil(battle, event => event.type === "bossEnd");
    expect(fight.slice(0, 2)).toEqual([
      { tick: tick + 1, type: "bossStart" },
      { tick: tick + 1, type: "spawn", id: 4, monsterId: 2008, boss: true, x: 1 },
    ]);
    expect(fight.filter(event => event.type === "spawn")).toHaveLength(1);
  });

  test("a revive after the boss became due brings the boss next", () => {
    const battle = startBattle(input({ stageId: 3004, waves: 3, mode: BattleMode.Hunt }));
    const events = runUntil(battle, event => event.type === "revive");
    expect(events.some(isMonsterDeath)).toBe(false);
    expect(battle.lastBoundary()).toMatchObject({ tick: battle.tick, player: { battle: { mode: BattleMode.Boss, waves: 3 } } });
    const tick = battle.tick;
    expect(run(battle, tick + 1)).toEqual([
      { tick: tick + 1, type: "bossStart" },
      expect.objectContaining({ tick: tick + 1, type: "spawn", monsterId: 2008, boss: true }),
    ]);
  });

  test("a hunt checkpoint keeps its next wave even when the boss is due", () => {
    const events = run(startBattle(input({ stageId: 3004, waves: 3, mode: BattleMode.Hunt })), 1);
    // 웨이브 차례는 목표(3)에서 멈춘다.
    expect(events).toEqual([
      { tick: 1, type: "waveStart", wave: 3, wavesNeeded: 3 },
      expect.objectContaining({ tick: 1, type: "spawn", boss: false }),
    ]);
  });

  test("a clear into a stage due for its boss checkpoints the boss next", () => {
    const zero = withStage(3006, { waveCount: 0, unlockLevel: null }, strong);
    const battle = startBattle(input({ stageId: 3005, waves: 2, data: zero }));
    const events = runUntil(battle, event => event.type === "stageClear");
    expect(events[events.length - 1]).toMatchObject({ stageId: 3005, nextId: 3006 });
    expect(battle.lastBoundary()!.player.battle).toMatchObject({ mode: BattleMode.Boss, waves: 0, autoBoss: true });
    const tick = battle.tick;
    expect(run(battle, tick + 1)).toEqual([
      { tick: tick + 1, type: "bossStart" },
      expect.objectContaining({ tick: tick + 1, type: "spawn", monsterId: 2010, boss: true }),
    ]);
  });

  test("losing to the boss returns to hunting with autoBoss off", () => {
    const battle = startBattle(input({ stageId: 3004, waves: 3 }));
    const events = runUntil(battle, event => event.type === "bossEnd");
    expect(events.slice(-3)).toEqual([
      { tick: battle.tick, type: "death", id: HERO_ID },
      { tick: battle.tick, type: "retreat" },
      { tick: battle.tick, type: "bossEnd", win: false },
    ]);

    const b = battle.lastBoundary()!;
    expect(b.tick).toBe(battle.tick);
    expect(b.player.stage).toEqual({ currentId: 3004, clearedIds: [] });
    expect(b.player.battle).toMatchObject({ mode: BattleMode.Hunt, autoBoss: false, hero: { hp: hero.maxHp }, waves: 3 });
  });

  test("beating the boss clears the stage", () => {
    const battle = startBattle(input({ data: strong, stageId: 3004, waves: 3 }));
    const events = runUntil(battle, event => event.type === "stageClear");
    const tick = battle.tick;
    expect(events.slice(-3)).toEqual([
      { tick, type: "death", id: 1 },
      { tick, type: "bossEnd", win: true },
      { tick, type: "stageClear", stageId: 3004, nextId: 3005 },
    ]);
    expect(battle.lastBoundary()!.player.stage).toEqual({ currentId: 3005, clearedIds: [3004] });
  });

  test("the boss runs out of time", () => {
    const battle = startBattle(input({ data: tank, stageId: 3004, waves: 3 }));
    const events = runUntil(battle, event => event.type === "bossEnd");
    const start = events.find(event => event.type === "bossStart")!;
    expect(events.slice(-2)).toEqual([
      { tick: start.tick + toTicks(300), type: "retreat" },
      { tick: start.tick + toTicks(300), type: "bossEnd", win: false },
    ]);
    expect(events.some(event => event.type === "death")).toBe(false);
    expect(battle.lastBoundary()!.player.battle).toMatchObject({ mode: BattleMode.Hunt, autoBoss: false });
  });

  test("a boss without a time limit fights on past where the limit would end it", () => {
    const battle = startBattle(input({ data: withStage(3004, { timeLimitSeconds: 0 }, tank), stageId: 3004, waves: 3 }));
    const events = run(battle, battle.tick + toTicks(600));
    expect(events.some(event => event.type === "bossStart")).toBe(true);
    expect(events.some(event => event.type === "bossEnd")).toBe(false);
    expect(battle.snapshot()).toMatchObject({ mode: BattleMode.Boss, bossTicksLeft: null });
  });

  test("a clear stays with autoBoss off when the hero's level has not unlocked the next stage", () => {
    // 3006은 15레벨이 필요하다.
    const battle = startBattle(input({ data: strong, stageId: 3005, waves: 2 }));
    const events = runUntil(battle, event => event.type === "stageClear");
    expect(events[events.length - 1]).toMatchObject({ stageId: 3005, nextId: null });
    expect(battle.lastBoundary()!.player.stage).toEqual({ currentId: 3005, clearedIds: [3005] });
    expect(battle.lastBoundary()!.player.battle).toMatchObject({ autoBoss: false, waves: 0 });
  });

  test("a clear moves on to the smallest unlocked stage of those that follow it", () => {
    // 3004 다음으로 3005와 3006이 함께 열린다. 테이블 순서와 상관없이 고르는지 보려고 큰 ID부터 둔다.
    const { stages } = withStage(3006, { unlockStageId: 3004, unlockLevel: null }, strong);
    const forked: GameData = { ...strong, stages: new Map([...stages].sort(([a], [b]) => b - a)) };
    const battle = startBattle(input({ data: forked, stageId: 3004, waves: 3 }));
    const events = runUntil(battle, event => event.type === "stageClear");
    expect(events[events.length - 1]).toMatchObject({ stageId: 3004, nextId: 3005 });
  });

  test("the last stage keeps hunting with autoBoss off", () => {
    const battle = startBattle(input({ data: strong, stageId: 3006, waves: 3 }));
    const events = runUntil(battle, event => event.type === "stageClear");
    expect(events[events.length - 1]).toEqual({ tick: battle.tick, type: "stageClear", stageId: 3006, nextId: null });

    const b = battle.lastBoundary()!;
    expect(b.player.stage).toEqual({ currentId: 3006, clearedIds: [3006] });
    expect(b.player.battle).toMatchObject({ mode: BattleMode.Hunt, autoBoss: false, waves: 0 });

    const later = run(battle, battle.tick + 1000);
    expect(later.filter(isMonsterDeath).length).toBeGreaterThan(10);
    expect(later.some(event => event.type === "bossStart" || event.type === "stageClear")).toBe(false);
  });

  test("a stage with no monsters and no boss throws with its id", () => {
    expect(() => startBattle(input({ data: withStage(3001, { monsterIds: [] }) })).advance(10)).toThrow(/3001/);
    const zero = withStage(3004, { waveCount: 0 });
    expect(bossDue(3004, 0, true, zero)).toBe(true);
    expect(run(startBattle(input({ stageId: 3004, data: zero, mode: BattleMode.Boss })), 1)).toEqual([
      { tick: 1, type: "bossStart" },
      { tick: 1, type: "spawn", id: 1, monsterId: 2008, boss: true, x: 1 },
    ]);
  });
});

describe("levels", () => {
  const level2 = heroOf(loaded, 2);

  test("the hero levels up and heals at the boundary where experience reaches the requirement", () => {
    const battle = startBattle(input({ data: loaded }));
    const events = runUntil(battle, event => event.type === "levelUp");
    const tick = battle.tick;
    const last = ofType(events, "spawn").at(-1)!;
    // 3001의 처치 여섯(경험치 60)과 클리어 보상(경험치 50)이 1레벨의 요구량 100을 넘긴다.
    expect(events.slice(-3)).toEqual([
      { tick, type: "death", id: last.id },
      { tick, type: "stageClear", stageId: 3001, nextId: 3002 },
      { tick, type: "levelUp", level: 2 },
    ]);
    const b = battle.lastBoundary()!;
    expect(b.tick).toBe(tick);
    expect(b.player.hero).toEqual({ level: 2 });
    expect(b.player.items).toEqual({ 1: Big.from(60), [EXP]: Big.from(10) });
    expect(b.player.battle.hero.hp).toEqual(level2.maxHp);
    expect(battle.snapshot().hero).toMatchObject({ level: 2, hp: level2.maxHp, maxHp: level2.maxHp });
  });

  test("after a level-up the hero fights with the new level's stats", () => {
    const leveling: GameData = { ...loaded, heroes: data.heroes };
    const battle = startBattle(input({ data: leveling }));
    runUntil(battle, event => event.type === "levelUp");
    const events: BattleEvent[] = [];
    while (battle.lastBoundary()!.tick < battle.tick || events.length === 0) battle.advance(battle.tick + 1, event => events.push(event));
    expect(heroAttacks(events).length).toBeGreaterThan(0);
    expectDamageFrom(events, level2, leveling);
  });

  test("a clear moves on by the level its own reward reaches", () => {
    // 3001의 처치와 클리어 보상이 2레벨을 채우므로 2레벨이 필요한 3002로는 옮기고, 3레벨이 필요하면 머문다.
    for (const [unlockLevel, nextId] of [[2, 3002], [3, null]] as const) {
      const battle = startBattle(input({ data: withStage(3002, { unlockLevel }, loaded) }));
      const events = runUntil(battle, event => event.type === "stageClear");
      expect(events.find(event => event.type === "stageClear")).toMatchObject({ stageId: 3001, nextId });
      expect(battle.lastBoundary()!.player).toMatchObject({
        hero: { level: 2 },
        stage: { currentId: nextId ?? 3001 },
        battle: { autoBoss: nextId !== null },
      });
    }
  });

  test("boundaries with level-ups resume to the same state", () => {
    const events = expectEveryTickResumes(input({ data: loaded }), 3000);
    expect(events.filter(event => event.type === "levelUp").length).toBeGreaterThan(1);
  });
});

describe("effects", () => {
  const effect = (id: number, kind: EffectKind, change: Partial<EffectsRow> = {}): EffectsRow => ({
    id, kind, durationSeconds: 2, maxStacks: 1, stat: null, tickSeconds: null, power: null, effectIds: null, note: null, ...change,
  });
  const skill = (id: number, change: Partial<SkillsRow>): SkillsRow => ({ ...data.skills.get(1001)!, id, cooldownSeconds: 100, ...change });
  const self = (id: number, effectIds: number[], change: Partial<SkillsRow> = {}) =>
    skill(id, { target: SkillTarget.Self, powerMultiplier: null, effectIds, ...change });

  // 시험용 효과와 스킬. 영웅은 치명 없이 기본 공격(1001)과 주어진 스킬을 쓰고, 3001의 슬라임은 HP가 많아 버틴다.
  function setup(
    effects: EffectsRow[], skills: SkillsRow[], { slime = {}, heroSkills }: { slime?: Partial<MonstersRow>; heroSkills?: number[] } = {},
  ): GameData {
    return {
      ...data,
      effects: new Map(effects.map(row => [row.id, row])),
      skills: new Map([...data.skills, ...skills.map(row => [row.id, row] as const)]),
      heroes: patch(data.heroes, 1, { critChance: 0, skillIds: heroSkills ?? [1001, ...skills.map(row => row.id)] }),
      monsters: patch(data.monsters, 2001, { maxHp: Big.from(1e9), ...slime }),
    };
  }

  // 스킬이 처음부터 준비된 1레벨 영웅. 첫 차례는 첫 슬라임이 다가온 틱이다.
  function begin(gameData: GameData, options: Options = {}): Battle {
    const cooldowns = initialCooldowns(heroOf(gameData)).map(() => 0);
    return startBattle(input({ data: gameData, cooldowns, ...options }));
  }

  // 효과 이벤트를 [첫 효과 이벤트로부터의 틱, 종류, 효과, 겹 수나 이유]로 줄인다. 틱 이벤트는 뺀다.
  function timeline(events: readonly BattleEvent[]): unknown[][] {
    const shown = events.filter(event => event.type === "effectApply" || event.type === "effectEnd" || event.type === "effectImmune");
    return shown.map(event => {
      const at = event.tick - shown[0].tick;
      if (event.type === "effectApply") return [at, "apply", event.effectId, event.stacks];
      if (event.type === "effectEnd") return [at, "end", event.effectId, event.reason];
      return [at, "immune", event.type === "effectImmune" ? event.effectId : null];
    });
  }

  test("damage over time ticks at its interval through its last tick and then ends", () => {
    const gameData = setup([effect(1, EffectKind.Damage, { tickSeconds: 0.5, power: 0.1 })], [skill(9001, { powerMultiplier: 0, effectIds: [1] })]);
    const events = run(begin(gameData), 100);
    const applied = events.find(event => event.type === "effectApply")!;
    // 양은 걸 때 시전자 공격력 × power: floor(20 × 0.1).
    expect(applied).toMatchObject({ id: 1, effectId: 1, by: HERO_ID, stacks: 1, ticksLeft: 20 });
    const ticks = events.filter(event => event.type === "effectTick");
    expect(ticks.map(event => event.tick - applied.tick)).toEqual([5, 10, 15, 20]);
    for (const tick of ticks) expect(tick).toMatchObject({ id: 1, amount: Big.from(2), absorbed: Big.ZERO });
    expect(timeline(events)).toEqual([[0, "apply", 1, 1], [20, "end", 1, "expire"]]);
  });

  test("each stack runs its own timer: of two stacks a second apart, the first ends and the second stays", () => {
    const gameData = setup(
      [effect(1, EffectKind.Stat, { stat: Stat.Defense, power: -0.1, maxStacks: 3 })],
      [skill(9001, { cooldownSeconds: 1, powerMultiplier: 0, effectIds: [1] })],
    );
    // 2초짜리를 1초마다 건다: 둘째 겹을 건 1초 뒤에 첫 겹이 끝나고 둘째는 남으므로 셋째를 걸어도 두 겹이다.
    expect(timeline(run(begin(gameData), 60)).slice(0, 6)).toEqual([
      [0, "apply", 1, 1], [10, "apply", 1, 2], [20, "end", 1, "expire"], [20, "apply", 1, 2], [30, "end", 1, "expire"], [30, "apply", 1, 2],
    ]);
  });

  test("a full effect swaps its first stack for the new one without an end, and one stack refreshes", () => {
    for (const maxStacks of [1, 2]) {
      const gameData = setup(
        [effect(1, EffectKind.Stat, { stat: Stat.Defense, power: -0.1, durationSeconds: 3, maxStacks })],
        [skill(9001, { cooldownSeconds: 1, powerMultiplier: 0, effectIds: [1] })],
      );
      const steps = timeline(run(begin(gameData), 100));
      expect(steps.length).toBeGreaterThan(5);
      expect(steps).toEqual(steps.map((_, i) => [i * 10, "apply", 1, Math.min(i + 1, maxStacks)]));
    }
  });

  test("stat effects change attack and the attack interval while they last", () => {
    const gameData = setup(
      [effect(1, EffectKind.Stat, { stat: Stat.Attack, power: 1, durationSeconds: 3 }), effect(2, EffectKind.Stat, { stat: Stat.AttackInterval, power: 1, durationSeconds: 3 })],
      [self(9001, [1, 2])],
    );
    const events = run(begin(gameData), 120);
    const t0 = events.find(event => event.type === "effectApply")!.tick;
    const basics = heroAttacks(events).filter(event => event.skillId === 1001);
    // 버프 동안은 공격력 40에 간격 20틱, 끝난 뒤(t0 + 30)에 쓴 다음부터 20에 10틱. 슬라임 방어는 0이다.
    expect(basics.slice(0, 5).map(event => [event.tick - t0, Big.toNumber(event.hits[0].damage)])).toEqual([
      [1, 40], [21, 40], [41, 20], [51, 20], [61, 20],
    ]);
    expect(timeline(events)).toEqual([[0, "apply", 1, 1], [0, "apply", 2, 1], [30, "end", 1, "expire"], [30, "end", 2, "expire"]]);
  });

  test("a stunned fighter neither acts nor counts down its cooldowns", () => {
    const strike = skill(9001, { powerMultiplier: 0, effectIds: [1] });
    function slimeAttacks(row: EffectsRow) {
      const events = run(begin(setup([row], [strike])), 200);
      return { t0: events.find(event => event.type === "effectApply")!.tick, ticks: monsterAttacks(events).filter(event => event.by === 1).map(event => event.tick) };
    }
    const stunned = slimeAttacks(effect(1, EffectKind.Stun, { durationSeconds: 1.5 }));
    // 같은 때 아무것도 바꾸지 않는 효과를 건 전투와 비교한다.
    const free = slimeAttacks(effect(1, EffectKind.Stat, { stat: Stat.Defense, power: 0, durationSeconds: 1.5 }));
    expect(stunned.t0).toBe(free.t0);
    expect(free.ticks.length).toBeGreaterThan(5);
    expect(stunned.ticks).toEqual(free.ticks.map(tick => tick + 15).filter(tick => tick <= 200));
  });

  test("a shield takes hits and damage over time before HP and breaks when used up", () => {
    const gameData = setup(
      [effect(1, EffectKind.Shield, { power: 1, durationSeconds: 60 }), effect(2, EffectKind.Damage, { tickSeconds: 1, power: 0, durationSeconds: 60 })],
      [self(9001, [1])],
      { slime: { attack: Big.from(12) } },
    );
    const events = run(begin(gameData, { effects: [{ effectId: 2, ticksLeft: 100, amount: Big.from(3) }] }), 200);
    let hp = 200;
    let absorbed = 0;
    for (const event of events) {
      const taken =
        event.type === "attack" ? event.hits.filter(hit => hit.target === HERO_ID).map(hit => [hit.damage, hit.absorbed, hit.hp])
        : event.type === "effectTick" ? [[event.amount, event.absorbed, event.hp]] : [];
      for (const [damage, blocked, after] of taken.map(values => values.map(Big.toNumber))) {
        // Big의 가수는 double이라 HP 뺄셈이 끝자리에서 어긋날 수 있다.
        expect(after).toBeCloseTo(hp - (damage - blocked), 6);
        hp = after;
        absorbed += blocked;
      }
    }
    // 보호막은 영웅 공격력(20)만큼 막고, 지속 피해(3)도 막는다.
    expect(absorbed).toBe(20);
    expect(events.find(event => event.type === "effectTick")).toMatchObject({ amount: Big.from(3), absorbed: Big.from(3), hp: Big.from(200) });
    expect(timeline(events)).toEqual(expect.arrayContaining([[expect.any(Number), "end", 1, "break"]]));
  });

  test("a cleanse lifts its effects and keeps them off while it lasts, and without a duration only lifts them", () => {
    const poison = effect(1, EffectKind.Damage, { tickSeconds: 1, power: 0, durationSeconds: 60 });
    const skills = [self(9001, [2]), self(9002, [1], { cooldownSeconds: 3 })];
    const after = (durationSeconds: number) => {
      const gameData = setup([poison, effect(2, EffectKind.Cleanse, { durationSeconds, effectIds: [1] })], skills);
      return timeline(run(begin(gameData, { effects: [{ effectId: 1, ticksLeft: 600, amount: Big.ZERO }] }), 60));
    };
    expect(after(2)).toEqual([[0, "end", 1, "cleanse"], [0, "apply", 2, 1], [1, "immune", 1], [20, "end", 2, "expire"], [31, "apply", 1, 1]]);
    expect(after(0)).toEqual([[0, "end", 1, "cleanse"], [0, "apply", 2, 1], [1, "apply", 1, 1], [31, "apply", 1, 1]]);
  });

  test("an effect without a duration acts once at once and does not stay", () => {
    const gameData = setup([effect(1, EffectKind.Heal, { durationSeconds: 0, power: 2 })], [self(9001, [1])]);
    // 20 × 2 = 40을 회복하되 최대 HP(200)를 넘지 않는다.
    for (const [hp, healed] of [[100, 140], [190, 200]]) {
      const events = run(begin(gameData, { hp: Big.from(hp) }), 40).filter(event => event.type.startsWith("effect"));
      expect(events).toEqual([
        expect.objectContaining({ type: "effectApply", id: HERO_ID, stacks: 1, ticksLeft: 0 }),
        expect.objectContaining({ type: "effectTick", id: HERO_ID, amount: Big.from(40), hp: Big.from(healed) }),
      ]);
    }
  });

  test("damage over time that kills pays the kill and can clear the wave", () => {
    const gameData = setup([effect(1, EffectKind.Damage, { tickSeconds: 0.5, power: 100 })], [skill(9001, { cooldownSeconds: 0, powerMultiplier: 0, effectIds: [1] })], {
      slime: { maxHp: data.monsters.get(2001)!.maxHp }, heroSkills: [9001],
    });
    const battle = startBattle(input({ data: gameData }));
    const events = runUntil(battle, event => event.type === "death");
    expect(events.at(-2)).toMatchObject({ type: "effectTick", id: 1, hp: Big.ZERO });
    expect(heroAttacks(events).every(event => event.hits.length === 0)).toBe(true);
    runUntil(battle, () => battle.lastBoundary() !== undefined);
    expect(battle.lastBoundary()!.player.battle.waves).toBe(1);
    expect(battle.lastBoundary()!.player.items[1]).toBeDefined();
  });

  test("a hero felled by damage over time retreats and rises without effects", () => {
    const gameData = setup([effect(1, EffectKind.Damage, { tickSeconds: 1, power: 1 }), effect(2, EffectKind.Stat, { stat: Stat.MaxHp, power: 1 })], []);
    const battle = startBattle(input({
      data: gameData,
      // 능력치 효과의 양은 걸 때 정한 비율이다(power 1 × 1레벨).
      effects: [{ effectId: 2, ticksLeft: 600, amount: Big.from(1) }, { effectId: 1, ticksLeft: 10, amount: Big.from(1000) }],
    }));
    expect(battle.snapshot().hero.maxHp).toEqual(Big.from(400));
    const events = runUntil(battle, event => event.type === "revive");
    expect(events.filter(event => event.tick === 10).map(event => event.type)).toEqual(["effectTick", "death", "retreat"]);
    expect(battle.lastBoundary()!.player.battle.hero).toMatchObject({ hp: hero.maxHp, effects: [] });
  });

  test("boundaries with effects on the hero resume to the same state", () => {
    const gameData = setup(
      [effect(1, EffectKind.Stat, { stat: Stat.Attack, power: 0.5, durationSeconds: 30, maxStacks: 2 }), effect(2, EffectKind.Shield, { power: 1, durationSeconds: 30 })],
      [self(9001, [1, 2], { cooldownSeconds: 20 })],
      { slime: { maxHp: data.monsters.get(2001)!.maxHp } },
    );
    const start = input({ data: gameData });
    const events = expectEveryTickResumes(start, 3000);
    expect(events.some(event => event.type === "effectEnd" && event.reason === "break")).toBe(true);
    // 영웅에 효과가 걸린 채 지난 경계가 있다.
    const battle = startBattle(start);
    let carried = 0;
    for (let tick = 1; tick <= 3000; tick++) {
      battle.advance(tick);
      const b = battle.lastBoundary();
      if (b?.tick === tick && b.player.battle.hero.effects.length > 0) carried++;
    }
    expect(carried).toBeGreaterThan(0);
  });
});

describe("projectiles", () => {
  // 영웅과 시험 데이터의 몬스터 사이는 1이다.
  const flightOf = (projectileId: number, gameData = data) =>
    toTicks(gameData.constants.spawnDistance / gameData.projectiles.get(projectileId)!.speed);
  // 시험용 발사체 9001은 40초를 난다. 9001·9002는 그것을 쏘는 기본 공격과 재사용 대기가 긴 스킬이다.
  const slow: GameData = {
    ...data,
    projectiles: new Map(data.projectiles).set(9001, { ...data.projectiles.get(5001)!, id: 9001, speed: 0.1 }),
    skills: new Map(data.skills)
      .set(9001, { ...data.skills.get(1001)!, id: 9001, projectileId: 9001 })
      .set(9002, { ...data.skills.get(1001)!, id: 9002, cooldownSeconds: 100, projectileId: 9001 }),
  };
  // 모든 발사체가 2초를 날아 웨이브가 끝날 때와 정산할 때 날아가는 것이 많다. 10레벨 능력치의 영웅이 3003에서 궁수의 속사와
  // 주술사의 화염구를 맞으며 웨이브를 깨기도 쓰러지기도 하고 보스와도 싸운다.
  const lingering: GameData = {
    ...data,
    projectiles: new Map([...data.projectiles].map(([id, row]) => [id, { ...row, speed: 2 }])),
    heroLevels: patch(data.heroLevels, 1, { ...data.heroLevels.get(10)!, id: 1, expToNext: null }),
  };

  test("a projectile lands distance ÷ speed ticks after its launch and deals its damage and effects only then", () => {
    // 영웅은 치명 없이 화염구(1005)를 먼저 쓰고, 3001의 슬라임은 HP가 많아 버틴다.
    const gameData: GameData = {
      ...data,
      heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001, 1005] }),
      monsters: patch(data.monsters, 2001, { maxHp: Big.from(1e9) }),
    };
    const events = run(startBattle(input({ data: gameData, cooldowns: [0, 0] })), 100);
    const [launch] = ofType(events, "launch");
    // 첫 차례에는 첫 슬라임만 대상이다. 발사체의 id는 그 다음이다.
    expect(launch).toEqual({ tick: 2, type: "launch", id: 2, by: HERO_ID, projectileId: 5002, targets: [1], flightTicks: flightOf(5002) });
    expect(events[events.indexOf(launch) - 1]).toEqual({ tick: launch.tick, type: "attack", by: HERO_ID, skillId: 1005, crit: false, hits: [] });
    const [impact] = ofType(events, "impact");
    expect(impact).toMatchObject({ tick: launch.tick + launch.flightTicks, id: launch.id, by: HERO_ID, skillId: 1005, crit: false });
    expect(impact.hits).toEqual([expect.objectContaining({ target: 1, damage: expectedDamage(heroOf(gameData), statsOf(2001, gameData), 1005, false) })]);
    // 화상은 떨어질 때 걸린다.
    expect(ofType(events, "effectApply")[0]).toMatchObject({ tick: impact.tick, id: 1, effectId: 4002, by: HERO_ID });
  });

  test("a projectile vanishes when its caster falls or all its targets fall before it lands", () => {
    // 1 HP 영웅의 기본 공격이 느린 발사체라 슬라임이 먼저 영웅을 쓰러뜨린다.
    const frail: GameData = {
      ...slow, heroes: patch(slow.heroes, 1, { skillIds: [9001] }), heroLevels: patch(slow.heroLevels, 1, { maxHp: Big.from(1) }),
    };
    const fallen = runUntil(startBattle(input({ data: frail })), event => event.type === "retreat");
    const death = fallen.find(isHeroDeath)!;
    const launches = ofType(fallen, "launch");
    expect(launches.length).toBeGreaterThan(0);
    expect(fallen.filter(event => event.tick === death.tick).slice(-launches.length - 2)).toEqual([
      death, ...launches.map(launch => ({ tick: death.tick, type: "vanish", id: launch.id })), { tick: death.tick, type: "retreat" },
    ]);

    // 영웅이 느린 발사체를 먼저 쏘고, 바로 맞는 기본 공격으로 그 대상을 쓰러뜨린다.
    const sniper: GameData = { ...slow, heroes: patch(slow.heroes, 1, { skillIds: [1001, 9002] }), heroLevels: strong.heroLevels };
    const shot = runUntil(startBattle(input({ data: sniper, cooldowns: [0, 0] })), isMonsterDeath);
    const [launch] = ofType(shot, "launch");
    expect(launch.targets).toEqual([1]);
    // 기본 공격은 스킬을 쓴 다음 틱에도 준비되어 있다.
    expect(shot.slice(-2)).toEqual([{ tick: launch.tick + 1, type: "death", id: 1 }, { tick: launch.tick + 1, type: "vanish", id: launch.id }]);
    expect(ofType(shot, "impact")).toEqual([]);
  });

  test("every projectile ends in one impact or vanish before the next boundary, so boundaries resume without them", () => {
    const start = input({ data: lingering, stageId: 3003 });
    const events = expectEveryTickResumes(start, 3000);
    const battle = startBattle(start);
    const boundaries: number[] = [];
    for (let tick = 1; tick <= 3000; tick++) {
      battle.advance(tick);
      if (battle.lastBoundary()?.tick === tick) boundaries.push(tick);
    }
    const ends = new Map<number, BattleEvent[]>();
    for (const event of events) if (event.type === "impact" || event.type === "vanish") ends.set(event.id, [...(ends.get(event.id) ?? []), event]);
    const launches = ofType(events, "launch");
    expect(new Set(launches.map(launch => launch.by === HERO_ID))).toEqual(new Set([true, false]));
    let cut = 0;
    for (const launch of launches) {
      const end = ends.get(launch.id) ?? [];
      // 끝나지 않은 것은 3000틱에도 날고 있는 것뿐이다.
      if (end.length === 0) {
        expect(launch.tick + launch.flightTicks).toBeGreaterThan(3000);
        continue;
      }
      expect(end).toHaveLength(1);
      const [{ tick, type }] = end;
      if (type === "impact") expect(tick).toBe(launch.tick + launch.flightTicks);
      else expect(tick).toBeLessThan(launch.tick + launch.flightTicks);
      expect(boundaries.filter(b => b >= launch.tick && b < tick)).toEqual([]);
      if (boundaries.includes(tick)) cut++;
    }
    // 웨이브가 끝나는 틱에 사라진 발사체가 있고, 클리어와 쓰러짐, 보스가 모두 나왔다.
    expect(cut).toBeGreaterThan(0);
    for (const type of ["stageClear", "retreat", "bossEnd"] as const) expect(ofType(events, type).length).toBeGreaterThan(0);
    expect(ofType(events, "impact").some(impact => impact.by !== HERO_ID && impact.hits.length > 0)).toBe(true);
  });

  test("settling at any moment hits with each projectile once", () => {
    const state: PlayerState = { ...input({ data: lingering, stageId: 3003 }).player, profile: { loginId: "hero" }, tutorial: { stepId: null } };
    const { at } = state.battle;
    const end = at + MAX_SETTLE_TICKS * TICK_MS;
    let chained = state;
    const times: number[] = [];
    for (let now = at + 7_300; now < end; now += 7_300) times.push(now);
    for (const now of [...times, end]) chained = settle(chained, lingering, now);
    expect(chained).toEqual(settle(state, lingering, end));
    // 정산한 때의 여럿에 발사체가 날고 있었다. 그 발사체는 다음 정산이 체크포인트부터 다시 돌려 한 번 맞힌다.
    const events = run(startBattle(input({ data: lingering, stageId: 3003 })), MAX_SETTLE_TICKS);
    const ended = new Map(events.flatMap(event => (event.type === "impact" || event.type === "vanish" ? [[event.id, event.tick] as const] : [])));
    const flying = (tick: number) => ofType(events, "launch").some(launch => launch.tick <= tick && (ended.get(launch.id) ?? Infinity) > tick);
    expect(times.filter(now => flying((now - at) / TICK_MS)).length).toBeGreaterThan(10);
  });
});

describe("summons", () => {
  type SummonEvent = Extract<BattleEvent, { type: "summon" }>;
  const wolf: SummonsRow = {
    id: 9001, maxHpRate: 0.5, attackRate: 0.5, defenseRate: 0.5, attackIntervalSeconds: 1, skillIds: [1001], durationSeconds: 5, maxCount: 2, note: null,
    moveSpeed: 2, clips: "spirit_wolf", size: 1,
  };
  // 시험용 소환수 9001과 그것을 부르는 스킬 9001. 영웅은 치명 없이 기본 공격과 소환 스킬을 쓰고, 3001의 슬라임은 HP가 많아 버틴다.
  function setup(
    summon: Partial<SummonsRow> = {}, call: Partial<SkillsRow> = {}, { slime = {}, base = data }: { slime?: Partial<MonstersRow>; base?: GameData } = {},
  ): GameData {
    return {
      ...base,
      summons: new Map([[9001, { ...wolf, ...summon }]]),
      skills: new Map(base.skills).set(9001, { ...base.skills.get(1011)!, id: 9001, cooldownSeconds: 100, ...call, summonId: 9001 }),
      heroes: patch(base.heroes, 1, { critChance: 0, skillIds: [1001, 9001] }),
      monsters: patch(base.monsters, 2001, { maxHp: Big.from(1e9), ...slime }),
    };
  }

  // 스킬이 처음부터 준비된 1레벨 영웅. 첫 차례(첫 슬라임이 대상이 된 틱)에 부른다.
  const begin = (gameData: GameData, options: Options = {}) => startBattle(input({ data: gameData, cooldowns: [0, 0], ...options }));
  const attacksBy = (events: readonly BattleEvent[], id: number) => ofType(events, "attack").filter(event => event.by === id);

  test("a summon skill calls a fighter with stats from the summon formulas that fights from the next tick", () => {
    const gameData = setup();
    const events = run(begin(gameData), 100);
    const [summon] = ofType(events, "summon");
    const at = 2;
    // 첫 슬라임이 id 1, 소환수가 다음이다. 소환 스킬의 attack 바로 뒤에 나온다.
    expect(summon).toEqual({ tick: at, type: "summon", id: 2, by: HERO_ID, summonId: 9001, ticksLeft: toTicks(5) });
    expect(events[events.indexOf(summon) - 1]).toEqual({ tick: at, type: "attack", by: HERO_ID, skillId: 9001, crit: false, hits: [] });
    // 공식: 소환자의 효과 전 능력치 × 배율의 내림. 소환 스킬은 소환수가 쓰지 않는다.
    const stats = summonStats({ ...wolf, skillIds: [1001, 9001] }, hero, 1, gameData);
    expect([stats.maxHp, stats.attack, stats.defense]).toEqual([Big.floor(Big.mul(hero.maxHp, 0.5)), Big.floor(Big.mul(hero.attack, 0.5)), Big.floor(Big.mul(hero.defense, 0.5))]);
    expect(stats.skills.map(skill => skill.id)).toEqual([1001]);
    // 기본 공격은 나온 다음 틱에 바로 친다. 영웅 다음, 적보다 먼저다.
    const attacks = attacksBy(events, summon.id);
    expect(attacks[0]).toMatchObject({ tick: at + 1, skillId: 1001, hits: [expect.objectContaining({ target: 1, damage: expectedDamage(stats, statsOf(2001, gameData), 1001, false) })] });
    expect(attacks[1].tick).toBe(at + 1 + stats.attackInterval);
  });

  test("a summon expires when its duration runs out, before anything else in that tick, and acts no more", () => {
    const events = run(begin(setup()), 200);
    const [summon] = ofType(events, "summon");
    const [expire] = ofType(events, "expire");
    expect(expire).toEqual({ tick: summon.tick + summon.ticksLeft, type: "expire", id: summon.id });
    expect(events.find(event => event.tick === expire.tick)).toBe(expire);
    const attacks = attacksBy(events, summon.id);
    expect(attacks.length).toBe(Math.ceil((summon.ticksLeft - 1) / toTicks(1)));
    expect(attacks.at(-1)!.tick).toBeLessThan(expire.tick);
  });

  test("calling past maxCount expires the summoner's earliest summon of that kind first", () => {
    const events = run(begin(setup({ durationSeconds: 100 }, { cooldownSeconds: 2 })), 200);
    const summons = ofType(events, "summon");
    expect(summons.length).toBeGreaterThan(3);
    // 셋째부터 부를 때마다 살아 있는 둘 중 먼저 부른 것이 만료한다.
    for (let i = 2; i < summons.length; i++) {
      const at = events.indexOf(summons[i]);
      expect(events.slice(at - 2, at + 1)).toEqual([
        { tick: summons[i].tick, type: "attack", by: HERO_ID, skillId: 9001, crit: false, hits: [] },
        { tick: summons[i].tick, type: "expire", id: summons[i - 2].id },
        summons[i],
      ]);
    }
    expect(ofType(events, "expire")).toHaveLength(summons.length - 2);
  });

  test("a summon targeted and felled dies like any fighter and pays nothing", () => {
    // 슬라임의 기본 공격이 HP가 가장 적은 대상(소환수)을 노린다.
    const gameData = setup({}, {}, { slime: { attack: Big.from(150), skillIds: [9002] } });
    gameData.skills.set(9002, { ...data.skills.get(1001)!, id: 9002, targetRule: TargetRule.Weakest });
    const battle = begin(gameData);
    const events = runUntil(battle, event => event.type === "death");
    const [summon] = ofType(events, "summon");
    expect(events.at(-1)).toEqual({ tick: events.at(-1)!.tick, type: "death", id: summon.id });
    expect(monsterAttacks(events).filter(event => event.by !== summon.id)[0].hits[0].target).toBe(summon.id);
    expect(battle.snapshot().items).toEqual({});
    expect(ofType(run(battle, 200), "expire")).toEqual([]);
  });

  test("a fallen summoner's summons expire with it: the hero's before the retreat, a monster's before the wave clears", () => {
    const frail = setup({ durationSeconds: 100 }, {}, { base: { ...data, heroLevels: patch(data.heroLevels, 1, { maxHp: Big.from(1) }) } });
    const fallen = runUntil(begin(frail), event => event.type === "revive");
    const [summon] = ofType(fallen, "summon");
    const death = fallen.find(isHeroDeath)!;
    expect(fallen.filter(event => event.tick === death.tick).slice(-3)).toEqual([
      death, { tick: death.tick, type: "expire", id: summon.id }, { tick: death.tick, type: "retreat" },
    ]);
    // 일어난 경계에는 소환수가 없다.
    expect(ofType(fallen, "revive")).toHaveLength(1);

    // 3001의 슬라임 둘이 1초마다 부르고, 영웅이 쓰러뜨리면 그 슬라임의 소환수가 바로 모두 만료한다. 그 뒤에야 웨이브가 끝난다.
    const caller = setup({ durationSeconds: 100 }, { cooldownSeconds: 1 }, { slime: { maxHp: Big.from(50), skillIds: [1001, 9001] } });
    const battle = startBattle(input({ data: { ...caller, heroes: patch(caller.heroes, 1, { skillIds: [1001] }) } }));
    const events = runUntil(battle, () => battle.lastBoundary() !== undefined);
    const summoner = new Map(ofType(events, "summon").map(event => [event.id, event.by]));
    const monsters = new Set(ofType(events, "spawn").map(event => event.id));
    expect(new Set(summoner.values())).toEqual(monsters);
    const gone = new Set<number>();
    for (const [i, event] of events.entries()) {
      if (event.type === "expire" || event.type === "death") gone.add(event.id);
      if (event.type !== "death" || !monsters.has(event.id)) continue;
      const left = [...summoner].filter(([id, by]) => by === event.id && !gone.has(id)).map(([id]) => ({ tick: event.tick, type: "expire", id }));
      expect(left.length).toBeGreaterThan(0);
      expect(events.slice(i + 1, i + 1 + left.length)).toEqual(left);
    }
    // 적의 소환수는 적이라 영웅을 친다.
    for (const id of summoner.keys()) for (const attack of attacksBy(events, id)) expect(attack.hits.map(hit => hit.target)).toEqual([HERO_ID]);
    expect(monsterAttacks(events).some(attack => summoner.has(attack.by))).toBe(true);
    expect(battle.lastBoundary()).toMatchObject({ tick: battle.tick, player: { battle: { waves: 1, summons: [] } } });
  });

  test("monsters' summons and the monsters that called them resume from any tick in their order", () => {
    const caller = setup({ durationSeconds: 100 }, { cooldownSeconds: 1 }, { slime: { maxHp: Big.from(50), skillIds: [1001, 9001] } });
    const events = expectEveryTickResumes(input({ data: { ...caller, heroes: patch(caller.heroes, 1, { skillIds: [1001] }) } }), 3000);
    expect(ofType(events, "summon").some(event => event.by !== HERO_ID)).toBe(true);
  });

  test("boundaries carry the hero's summons, also across level-ups, and resume to the same state", () => {
    // 실제 데이터: 영웅이 늑대 소환을 쓰고 레벨이 오른다.
    const start = input({ data: loaded });
    const events = expectEveryTickResumes(start, 3000);
    expect(ofType(events, "expire").length).toBeGreaterThan(0);
    const battle = startBattle(start);
    let carried = 0;
    let leveled = 0;
    for (let tick = 1; tick <= 3000; tick++) {
      const levelUps: BattleEvent[] = [];
      battle.advance(tick, event => event.type === "levelUp" && levelUps.push(event));
      const b = battle.lastBoundary();
      if (b?.tick !== tick || b.player.battle.summons.length === 0) continue;
      carried++;
      if (levelUps.length > 0) leveled++;
      const { summons } = b.player.battle;
      for (const summon of summons) expect(summon.ticksLeft).toBeGreaterThan(0);
      expect(summons.map(summon => summon.id)).toEqual(summons.map(summon => summon.id).sort((x, y) => x - y));
    }
    expect(carried).toBeGreaterThan(10);
    expect(leveled).toBeGreaterThan(0);
  });

  test("a checkpoint summon fights from tick 1 and expires when its ticks run out, and one gone from the data is dropped", () => {
    const gameData = setup();
    const saved = { id: 7, summonId: 9001, by: HERO_ID, hp: Big.from(50), cooldowns: [0], effects: [], x: 0, ticksLeft: 30 };
    const events = run(startBattle(input({ data: gameData, summons: [saved, { ...saved, id: 8, summonId: 4242 }] })), 100);
    expect(ofType(events, "expire")).toEqual([{ tick: 30, type: "expire", id: 7 }]);
    expect(attacksBy(events, 7)[0].tick).toBe(2);
    expect(attacksBy(events, 8)).toEqual([]);
  });

  test("settling at any moment equals settling at once with summons alive across the settles", () => {
    const state: PlayerState = { ...input({ data: loaded }).player, profile: { loginId: "hero" }, tutorial: { stepId: null } };
    const { at } = state.battle;
    const end = at + MAX_SETTLE_TICKS * TICK_MS;
    let chained = state;
    let carried = 0;
    for (let now = at + 7_300; now < end; now += 7_300) {
      chained = settle(chained, loaded, now);
      if (chained.battle.summons.length > 0) carried++;
    }
    expect(settle(chained, loaded, end)).toEqual(settle(state, loaded, end));
    expect(carried).toBeGreaterThan(10);
  });
});

describe("positions", () => {
  // 배포 데이터의 자리: 영웅은 0에서, 몬스터는 영웅 앞 spawnDistance(화면 밖)에 나와 걷는다.
  const walking: GameData = { ...data, constants: loaded.constants };
  const { spawnDistance } = loaded.constants;
  const TICK_SECONDS = TICK_MS / 1000;
  const SLACK = 1e-9;
  // 치지도 쓰러지지도 않는 영웅이 이 스킬들만 쓴다(재사용 대기는 처음부터 준비된다).
  function tankWith(skillIds: number[], base = walking): GameData {
    return {
      ...base,
      heroes: patch(base.heroes, 1, { critChance: 0, skillIds }),
      heroLevels: patch(base.heroLevels, 1, { maxHp: Big.from(1e12), attack: Big.from(1), defense: Big.from(1e12) }),
    };
  }
  const begin = (gameData: GameData, stageId = 3001) =>
    startBattle(input({ data: gameData, stageId, cooldowns: [0, ...gameData.heroes.get(1)!.skillIds.slice(1).map(() => 0)] }));
  // 한 틱씩 진행하며 틱마다 그 틱의 이벤트와 틱이 끝난 스냅숏을 넘긴다.
  function eachTick(battle: Battle, ticks: number, visit: (events: BattleEvent[], after: ReturnType<Battle["snapshot"]>, before: ReturnType<Battle["snapshot"]>) => void): void {
    let before = battle.snapshot();
    for (let i = 0; i < ticks; i++) {
      const events = run(battle, battle.tick + 1);
      const after = battle.snapshot();
      visit(events, after, before);
      before = after;
    }
  }
  const gap = (a: { x: number }, b: { x: number }) => Math.max(a.x - b.x, b.x - a.x);

  test("monsters walk toward the hero at their move speed and the hero meets them, both stopping where the basic attack reaches", () => {
    const gameData = tankWith([1001]);
    const battle = begin(gameData);
    const slime = gameData.monsters.get(2001)!.moveSpeed * TICK_SECONDS;
    const heroStep = gameData.heroes.get(1)!.moveSpeed * TICK_SECONDS;
    let met = -1;
    eachTick(battle, 60, (events, after, before) => {
      const [enemy] = after.enemies;
      const was = before.enemies.find(other => other.id === enemy?.id);
      if (!enemy || !was) return;
      if (met < 0 && gap(after.hero, enemy) <= 1 + SLACK) met = battle.tick;
      if (met < 0) {
        // 다가오는 동안 둘 다 한 틱만큼 걷는다.
        expect([after.hero.moving, enemy.moving]).toEqual([true, true]);
        expect(after.hero.x - before.hero.x).toBeCloseTo(heroStep, 12);
        expect(was.x - enemy.x).toBeCloseTo(slime, 12);
        expect(heroAttacks(events)).toEqual([]);
      } else {
        // 만난 뒤로는 사거리 끝에 서서 싸운다.
        expect(gap(after.hero, enemy)).toBeGreaterThanOrEqual(1 - SLACK);
        expect(gap(after.hero, enemy)).toBeLessThanOrEqual(1 + SLACK);
      }
    });
    expect(met).toBeGreaterThan(1);
    expect(battle.snapshot().enemies[0].x).toBeLessThan(spawnDistance);
    expect(battle.snapshot().hero.x).toBeGreaterThan(0);
  });

  test("monsters appear spawnDistance ahead of wherever the hero has walked", () => {
    const battle = begin(tankWith([1001]));
    let ahead = 0;
    eachTick(battle, 300, (events, _after, before) => {
      for (const spawn of ofType(events, "spawn")) {
        expect(spawn.x).toBe(before.hero.x + spawnDistance);
        if (before.hero.x > 0) ahead++;
      }
    });
    expect(ahead).toBeGreaterThan(0);
  });

  test("a ranged monster shoots from its range while the hero walks the rest of the way", () => {
    const gameData = withStage(3001, { monsterIds: [2004], waveSize: 1 }, tankWith([1001]));
    const battle = begin(gameData);
    const shootRange = gameData.skills.get(1012)!.range;
    let firstShot = -1;
    let firstHit = -1;
    eachTick(battle, 80, (events, after, before) => {
      const archer = before.enemies[0];
      if (firstShot < 0 && ofType(events, "launch").some(launch => launch.by === archer?.id)) {
        firstShot = battle.tick;
        // 쏠 때 영웅과의 거리는 활쏘기의 사거리 안이고 기본 공격의 사거리 밖이다.
        expect(gap(before.hero, archer)).toBeLessThanOrEqual(shootRange + SLACK);
        expect(gap(before.hero, archer)).toBeGreaterThan(1);
      }
      if (firstHit < 0 && heroAttacks(events).length > 0) firstHit = battle.tick;
      // 궁수는 사거리 끝에서 멈춘다.
      if (after.enemies[0] && gap(after.hero, after.enemies[0]) < shootRange - SLACK) expect(after.enemies[0].moving).toBe(false);
    });
    expect(firstShot).toBeGreaterThan(0);
    expect(firstHit).toBeGreaterThan(firstShot);
  });

  test("a skill waits until a target is within its range", () => {
    const gameData = tankWith([1001, 1005]);
    const battle = begin(gameData);
    const range = gameData.skills.get(1005)!.range;
    let cast = -1;
    eachTick(battle, 60, (events, _after, before) => {
      const fireball = heroAttacks(events).find(attack => attack.skillId === 1005);
      const nearest = Math.min(...before.enemies.map(enemy => gap(before.hero, enemy)));
      if (fireball && cast < 0) {
        cast = battle.tick;
        expect(nearest).toBeLessThanOrEqual(range + SLACK);
      } else if (cast < 0 && before.enemies.length > 0) {
        expect(nearest).toBeGreaterThan(range);
      }
    });
    expect(cast).toBeGreaterThan(1);
  });

  test("every boundary puts the allies back at 0, so resumed battles walk the same", () => {
    const events = expectEveryTickResumes(input({ data: walking }), 3000);
    expect(events.some(event => event.type === "summon" || event.type === "attack")).toBe(true);
    const battle = startBattle(input({ data: walking }));
    for (let i = 0; i < 20; i++) {
      runUntil(battle, event => event.type === "death" && event.id !== HERO_ID);
      if (battle.lastBoundary()?.tick === battle.tick) expect(battle.snapshot().hero.x).toBe(0);
    }
  });

  test("a projectile flies the distance at its launch ÷ its speed", () => {
    // 슬라임은 영웅의 기본 공격 밖, 화염구의 사거리 안에 나온다. 첫 차례에 영웅이 화염구를 쏘고 슬라임은 그 뒤에 걷는다.
    const gameData = tankWith([1001, 1005], { ...data, constants: { ...data.constants, spawnDistance: 2.5 } });
    const [launch] = ofType(run(begin(gameData), 10), "launch");
    expect(launch).toMatchObject({ tick: 2, by: HERO_ID, flightTicks: toTicks(2.5 / gameData.projectiles.get(5002)!.speed) });
    expect(launch.flightTicks).toBeGreaterThan(toTicks(1 / gameData.projectiles.get(5002)!.speed));
  });

  test("an area skill hits its first target and, nearest first, those within its radius of it", () => {
    // 몬스터가 1초 간격으로 나와 줄지어 걸어온다. 영웅은 1초마다 화염구를 쏘아 다가온 무리와 아직 걷는 것을 가른다.
    const quick = tankWith([1001, 1005]);
    const gameData = withStage(3002, { spawnIntervalSeconds: 1, waveSize: 5 }, { ...quick, skills: patch(quick.skills, 1005, { cooldownSeconds: 1 }) });
    const { radius, maxTargets } = gameData.skills.get(1005)!;
    const battle = begin(gameData, 3002);
    let partial = 0;
    let launches = 0;
    eachTick(battle, 1500, (events, _after, before) => {
      for (const launch of ofType(events, "launch")) {
        if (launch.by !== HERO_ID) continue;
        launches++;
        const standing = before.enemies.filter(enemy => before.enemies.includes(enemy));
        const [first, ...rest] = launch.targets.map(id => standing.find(enemy => enemy.id === id)!);
        const near = standing.filter(enemy => enemy !== first && gap(first, enemy) <= radius + SLACK)
          .sort((a, b) => gap(first, a) - gap(first, b) || a.id - b.id);
        expect(rest.map(enemy => enemy.id)).toEqual(near.slice(0, maxTargets - 1).map(enemy => enemy.id));
        if (standing.length > launch.targets.length && launch.targets.length < maxTargets) partial++;
      }
    });
    expect(launches).toBeGreaterThan(5);
    expect(partial).toBeGreaterThan(0);
  });

  test("a skill with a hurt condition waits for a hurt target and picks among the hurt", () => {
    // 치유의 빛(1006)은 HP 70% 이하인 아군을 고친다. 약한 영웅이 슬라임에게 맞는다.
    const frail: GameData = {
      ...data,
      heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001, 1006] }),
      heroLevels: patch(data.heroLevels, 1, { attack: Big.from(1), defense: Big.ZERO }),
      monsters: patch(data.monsters, 2001, { maxHp: Big.from(1e9) }),
    };
    const ratio = frail.skills.get(1006)!.conditionValue!;
    const battle = begin(frail);
    let heals = 0;
    let waited = 0;
    eachTick(battle, 600, (events, _after, before) => {
      const hurt = Big.lte(before.hero.hp, Big.mul(before.hero.maxHp, ratio));
      const heal = heroAttacks(events).find(attack => attack.skillId === 1006);
      if (heal) {
        heals++;
        expect(hurt).toBe(true);
      } else if (!hurt && before.enemies.length > 0 && heals === 0) {
        waited++;
      }
    });
    expect(heals).toBeGreaterThan(0);
    expect(waited).toBeGreaterThan(0);
  });

  test("a skill with a crowd condition waits for that many foes within its range", () => {
    // 전투의 포효(1010)는 사거리(2) 안에 적이 하나라도 있어야 쓴다.
    const gameData = tankWith([1001, 1010]);
    const { range } = gameData.skills.get(1010)!;
    const battle = begin(gameData);
    let roared = -1;
    eachTick(battle, 60, (events, _after, before) => {
      if (roared >= 0 || !heroAttacks(events).some(attack => attack.skillId === 1010)) return;
      roared = battle.tick;
      expect(before.enemies.some(enemy => gap(before.hero, enemy) <= range + SLACK)).toBe(true);
    });
    expect(roared).toBeGreaterThan(1);
    const roarBefore = run(startBattle(input({ data: gameData, cooldowns: [0, 0] })), roared - 1);
    expect(heroAttacks(roarBefore).some(attack => attack.skillId === 1010)).toBe(false);
  });

  test("fire and ice are strong against each other, holy against poison, and an element is weak against itself", () => {
    const { Physical, Fire, Ice, Poison, Holy } = SkillElement;
    expect([elementAdvantage(Fire, Ice), elementAdvantage(Ice, Fire), elementAdvantage(Holy, Poison)]).toEqual([1, 1, 1]);
    expect([elementAdvantage(Fire, Fire), elementAdvantage(Poison, Poison)]).toEqual([-1, -1]);
    expect([elementAdvantage(Physical, Fire), elementAdvantage(Fire, Physical), elementAdvantage(Poison, Holy), elementAdvantage(Fire, Poison)]).toEqual([0, 0, 0, 0]);
  });

  test("a fireball on a frost wolf takes elementStrong more and on a fire shaman elementWeak less", () => {
    for (const [monsterId, rate] of [[2009, 1.5], [2005, 0.75]] as const) {
      const gameData: GameData = {
        ...withStage(3001, { monsterIds: [monsterId], waveSize: 1 }, data),
        heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001, 1005] }),
        monsters: patch(data.monsters, monsterId, { maxHp: Big.from(1e9) }),
      };
      const [impact] = ofType(run(begin(gameData), 60), "impact");
      const base = Big.mul(Formula.get(E_AbilityType.damage, abilityOwner(heroOf(gameData)), abilityOwner(statsOf(monsterId, gameData))), 2);
      expect(impact.hits[0].damage).toEqual(Big.floor(Big.mul(base, rate)));
    }
  });
});

describe("snapshot", () => {
  test("shows the hero, the enemies and the boss clock", () => {
    const battle = startBattle(input({ stageId: 3004, waves: 3 }));
    battle.advance(1);
    expect(battle.snapshot()).toEqual({
      stageId: 3004,
      mode: BattleMode.Boss,
      waves: 3,
      wavesNeeded: 3,
      autoBoss: true,
      hasBoss: true,
      bossTicksLeft: toTicks(300),
      hero: {
        level: 1, hp: hero.maxHp, maxHp: hero.maxHp, down: false, effects: [], x: 0, moving: false, attack: hero.attack, critChance: hero.critChance,
        // 보스는 다음 틱부터 대상이라 아직 차례가 없어 새 사냥의 대기 그대로다.
        skills: [1004, 1005].map(skillId => {
          const ticks = toTicks(data.skills.get(skillId)!.cooldownSeconds);
          return { skillId, cooldownTicks: ticks, readyInTicks: ticks };
        }),
      },
      enemies: [{ id: 1, monsterId: 2008, boss: true, hp: statsOf(2008).maxHp, maxHp: statsOf(2008).maxHp, effects: [], x: 1, moving: false }],
      summons: [],
      projectiles: [],
      items: {},
    });
  });

  test("lists the projectiles in flight, the summons and the effects with their stacks and time left", () => {
    // 배포 데이터의 1레벨 영웅은 화살·화염구(발사체, 화염구는 화상), 늑대 소환을 쓴다.
    const battle = startBattle(input({ data: loaded, stageId: 3002 }));
    const [launch] = ofType(runUntil(battle, event => event.type === "launch"), "launch");
    expect(battle.snapshot().projectiles).toContainEqual({
      id: launch.id, by: launch.by, projectileId: launch.projectileId, targets: [...launch.targets], ticksLeft: launch.flightTicks,
    });

    const [summon] = ofType(runUntil(battle, event => event.type === "summon"), "summon");
    expect(battle.snapshot().summons).toContainEqual(
      expect.objectContaining({ id: summon.id, summonId: summon.summonId, by: HERO_ID, ally: true, ticksLeft: summon.ticksLeft }),
    );

    const lasting = (event: BattleEvent) => event.type === "effectApply" && event.ticksLeft > 0;
    const [applied] = ofType(runUntil(battle, lasting).filter(lasting), "effectApply");
    const { hero: shownHero, enemies, summons } = battle.snapshot();
    const target = [{ id: HERO_ID, ...shownHero }, ...enemies, ...summons].find(fighter => fighter.id === applied.id)!;
    expect(target.effects).toContainEqual({ effectId: applied.effectId, stacks: applied.stacks, ticksLeft: applied.ticksLeft });
  });

  test("lists the equipped skills in slot order, each counting down to ready after it is used", () => {
    // 슬라임도 영웅도 쓰러지지 않아 재사용 대기가 매 틱 흐른다. 슬롯은 Heroes.skillIds(1004, 1005)와 거꾸로 장착한다.
    const gameData: GameData = {
      ...data,
      monsters: patch(data.monsters, 2001, { maxHp: Big.from(1e9) }),
      heroLevels: patch(data.heroLevels, 1, { maxHp: Big.from(1e12) }),
    };
    const skills: SkillsState = { equipped: { 0: 1005, 1: 1004 }, levels: { 1004: 1, 1005: 1 } };
    const battle = startBattle(input({ data: gameData, skills, cooldowns: [0, 0, 0] }));
    const fireball = toTicks(data.skills.get(1005)!.cooldownSeconds);
    const arrow = toTicks(data.skills.get(1004)!.cooldownSeconds);
    expect(battle.snapshot().hero.skills).toEqual([
      { skillId: 1005, cooldownTicks: fireball, readyInTicks: 0 },
      { skillId: 1004, cooldownTicks: arrow, readyInTicks: 0 },
    ]);
    // 둘 다 준비된 첫 차례에는 앞 슬롯만 쓰고, 뒤 슬롯은 준비된 채 다음 차례를 기다린다.
    const used = (skillId: number) => (event: BattleEvent) => event.type === "attack" && event.by === HERO_ID && event.skillId === skillId;
    runUntil(battle, used(1005));
    const first = battle.tick;
    expect(battle.snapshot().hero.skills.map(skill => skill.readyInTicks)).toEqual([fireball, 0]);
    for (let left = fireball - 1; left > 0; left--) {
      battle.advance(battle.tick + 1);
      expect(battle.snapshot().hero.skills[0].readyInTicks).toBe(left);
    }
    // 0이 되는 차례에 다시 쓴다.
    expect(run(battle, first + fireball).some(used(1005))).toBe(true);
  });

  test("shows the hero's attack and crit chance as the battle uses them, stat effects included", () => {
    expect(startBattle(input()).snapshot().hero).toMatchObject({ attack: hero.attack, critChance: hero.critChance });

    // 1010은 사거리 안에 적이 오면 자신에게 공격력 +30%(4005)를 건다.
    const gameData: GameData = { ...data, heroes: patch(data.heroes, 1, { skillIds: [1001, 1010] }) };
    const battle = startBattle(input({ data: gameData, skills: { equipped: { 0: 1010 }, levels: { 1010: 1 } }, cooldowns: [0, 0] }));
    const onHero = (type: "effectApply" | "effectEnd") => (event: BattleEvent) => event.type === type && event.id === HERO_ID && event.effectId === 4005;
    runUntil(battle, onHero("effectApply"));
    const { amount } = battle.checkpoint().player.battle.hero.effects.find(effect => effect.effectId === 4005)!;
    const buffed = applyModifiers(hero, [{ stat: Stat.Attack, percent: Big.toNumber(amount) }]);
    expect(Big.gt(buffed.attack, hero.attack)).toBe(true);
    expect(battle.snapshot().hero).toMatchObject({ attack: buffed.attack, critChance: hero.critChance });
    runUntil(battle, onHero("effectEnd"));
    expect(battle.snapshot().hero.attack).toEqual(hero.attack);
  });
});

describe("skill levels", () => {
  const skill = (id: number, change: Partial<SkillsRow>): SkillsRow => ({ ...data.skills.get(1001)!, id, cooldownSeconds: 1, maxLevel: 10, costItemId: 1, ...change });
  const levelRate = (skillLevel: number) => Formula.get(E_AbilityType.skillLevelRate, abilityOwner(hero), abilityOwner(hero), { skillLevel });
  // 영웅은 치명 없이 기본 공격(1001)과 시험용 스킬 9001을 쓰고, 3001의 슬라임은 HP가 많아 버틴다.
  function setup(change: Partial<SkillsRow>, extra: Partial<GameData> = {}): GameData {
    return {
      ...data,
      skills: new Map(data.skills).set(9001, skill(9001, change)),
      heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001, 9001] }),
      monsters: patch(data.monsters, 2001, { maxHp: Big.from(1e9) }),
      ...extra,
    };
  }
  const atLevel = (level: number): SkillsState => ({ equipped: { 0: 9001 }, levels: { 9001: level } });
  const strikesOf = (events: readonly BattleEvent[]) =>
    events.filter((event): event is StrikeEvent => (event.type === "attack" || event.type === "impact") && event.skillId === 9001 && event.hits.length > 0);

  test("a skill hits with the skillMultiplier of its level, whether it lands at once or flies", () => {
    for (const projectileId of [null, 5001]) {
      const gameData = setup({ powerMultiplier: 2, projectileId });
      const slime = statsOf(2001, gameData);
      const base = Formula.get(E_AbilityType.damage, abilityOwner(hero), abilityOwner(slime));
      for (const level of [1, 4]) {
        const [strike] = strikesOf(run(startBattle(input({ data: gameData, skills: atLevel(level) })), 100));
        const multiplier = Formula.get(E_AbilityType.skillMultiplier, abilityOwner(hero), abilityOwner(slime), { powerMultiplier: 2, skillLevel: level });
        expect(strike.hits[0].damage).toEqual(Big.floor(Big.mul(base, multiplier)));
      }
      // 1레벨은 레벨이 생기기 전처럼 피해 배율을 그대로 곱한다.
      const [first] = strikesOf(run(startBattle(input({ data: gameData, skills: atLevel(1) })), 100));
      expect(first.hits[0].damage).toEqual(Big.floor(Big.mul(base, 2)));
    }
  });

  test("effects take their amounts from the level of the skill that applied them", () => {
    const effects = new Map<number, EffectsRow>([
      [1, { id: 1, kind: EffectKind.Damage, durationSeconds: 3, maxStacks: 1, stat: null, tickSeconds: 1, power: 0.5, effectIds: null, note: null }],
      [2, { id: 2, kind: EffectKind.Stat, durationSeconds: 60, maxStacks: 1, stat: Stat.MaxHp, tickSeconds: null, power: 0.5, effectIds: null, note: null }],
    ]);
    const gameData = setup({ powerMultiplier: 0, effectIds: [1] }, {
      effects,
      skills: new Map(data.skills).set(9001, skill(9001, { powerMultiplier: 0, effectIds: [1] }))
        .set(9002, skill(9002, { target: SkillTarget.Self, powerMultiplier: null, effectIds: [2], cooldownSeconds: 100 })),
      heroes: patch(data.heroes, 1, { critChance: 0, skillIds: [1001, 9001, 9002] }),
    });
    const skills: SkillsState = { equipped: { 0: 9001, 1: 9002 }, levels: { 9001: 3, 9002: 5 } };
    const battle = startBattle(input({ data: gameData, skills, cooldowns: [0, 0, 0] }));
    const events = run(battle, 100);
    const tick = ofType(events, "effectTick").find(event => event.effectId === 1)!;
    expect(tick.amount).toEqual(Big.floor(Big.mul(Big.mul(hero.attack, 0.5), levelRate(3))));
    const ratio = Big.mul(Big.from(0.5), levelRate(5));
    expect(battle.snapshot().hero.maxHp).toEqual(Big.floor(Big.mul(hero.maxHp, 1 + Big.toNumber(ratio))));
    // 능력치 효과의 비율은 걸 때 정해 겹에 담으므로 경계를 넘어 그대로 이어진다(슬라임이 보통 HP라 웨이브가 끝난다).
    const start = input({ data: { ...gameData, monsters: data.monsters }, skills, cooldowns: [0, 0, 0] });
    const cleared = startBattle(start);
    runUntil(cleared, () => cleared.lastBoundary() !== undefined);
    expect(cleared.lastBoundary()!.player.battle.hero.effects).toContainEqual(expect.objectContaining({ effectId: 2, amount: ratio }));
    expectEveryTickResumes(start, 1500);
  });

  test("a summon skill's level scales the summon's stats, also for a summon resumed from a checkpoint", () => {
    const wolf: SummonsRow = { ...data.summons.get(6001)!, id: 9001, durationSeconds: 100 };
    // 슬라임이 보통 HP라 웨이브가 끝나 늑대가 사는 동안 경계가 온다.
    const gameData = setup(
      { target: SkillTarget.Self, powerMultiplier: null, summonId: 9001, cooldownSeconds: 100 }, { summons: new Map([[9001, wolf]]), monsters: data.monsters },
    );
    const leveled = summonStats(wolf, hero, 6, gameData);
    expect(leveled.attack).toEqual(Big.floor(Big.mul(Big.mul(hero.attack, wolf.attackRate), levelRate(6))));
    expect(Big.gt(leveled.maxHp, summonStats(wolf, hero, 1, gameData).maxHp)).toBe(true);
    const start = input({ data: gameData, skills: atLevel(6), cooldowns: [0, 0] });
    const battle = startBattle(start);
    const events = runUntil(battle, () => battle.lastBoundary()?.player.battle.summons.length === 1);
    const id = ofType(events, "summon")[0].id;
    const wolfHits = ofType(events, "attack").filter(event => event.by === id && event.hits.length > 0);
    const slime = statsOf(2001, gameData);
    expect(wolfHits[0].hits[0].damage).toEqual(Big.floor(Formula.get(E_AbilityType.damage, abilityOwner(leveled), abilityOwner(slime))));
    expectEveryTickResumes(start, 1500);
  });

  test("boundaries with leveled skills in a chosen slot order resume to the same state", () => {
    const skills: SkillsState = { equipped: { 0: 1011, 1: 1005, 2: 1004 }, levels: { 1004: 3, 1005: 7, 1011: 4 } };
    const events = expectEveryTickResumes(input({ data: loaded, skills }), 3000);
    expect(new Set(heroAttacks(events).map(event => event.skillId))).toEqual(new Set([1001, 1004, 1005, 1011]));
  });

  test("the path signature tells the equipped skills and their levels apart, but not the levels of skills left off", () => {
    const at = (skills: SkillsState) => {
      const battle = startBattle(input({ data: loaded, skills }));
      battle.advance(50);
      return battle.pathSignature();
    };
    const base: SkillsState = { equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: {} };
    expect(at({ ...base, levels: { 1010: 9 } })).toBe(at(base));
    expect(at({ ...base, levels: { 1004: 2 } })).not.toBe(at(base));
    expect(at({ ...base, equipped: { 0: 1005, 1: 1004, 2: 1011 } })).not.toBe(at(base));
  });
});
