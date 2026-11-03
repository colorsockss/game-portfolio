import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { MAX_SETTLE_TICKS, TICK_MS, toTicks } from "../src/battle/constants.js";
import { offlineReward } from "../src/battle/offline.js";
import { freshBattle, playerBattle } from "../src/battle/settle.js";
import { initialCooldowns, type Battle, type BattleEvent } from "../src/battle/simulation.js";
import { BattleMode } from "../src/battle/state.js";
import { heroStats } from "../src/battle/stats.js";
import type { Command } from "../src/command.js";
import { applyCommand } from "../src/commands/index.js";
import { NO_EQUIPMENT } from "../src/equipment.js";
import { NO_REBIRTH } from "../src/rebirth.js";
import { NO_STAT_UPGRADES } from "../src/stat-upgrade.js";
import { equippableSkills, skillLevelCost, startSkills } from "../src/skills.js";
import { grant } from "../src/items.js";
import { levelUp } from "../src/level.js";
import type { PlayerState } from "../src/state.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const EXP = data.constants.expItemId;
const AT = 1_000_000;

function player(stageId = 3001, level = 1): PlayerState {
  const base = {
    profile: { loginId: "hero", level },
    items: {},
    equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills: startSkills(data),
    stage: { currentId: stageId, clearedIds: [] },
  };
  return { ...base, battle: freshBattle(base, data, AT), tutorial: { stepId: null } };
}

function apply(state: PlayerState, command: Command, now: number): PlayerState {
  const result = applyCommand(state, command, { now, data });
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}

const settleAt = (state: PlayerState, now: number) => apply(state, { type: Opcode.BattleSettle }, now);
const challengeAt = (state: PlayerState, now: number) => apply(state, { type: Opcode.BossChallenge }, now);

function run(battle: Battle, tick: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  battle.advance(tick, event => events.push(event));
  return events;
}

// 체크포인트에서 `from`틱 뒤부터 찾은, 살아 있는 적과 싸우는 첫 틱의 시각.
function fighting(state: PlayerState, from = 300): number {
  const battle = playerBattle(state, data);
  for (let tick = from; ; tick++) {
    battle.advance(tick);
    if (battle.snapshot().enemies.length > 0) return state.battle.at + tick * TICK_MS;
  }
}

test("settling commits the battle at the tick of now, the wave in progress included", () => {
  const state = player();
  const now = fighting(state);
  const battle = playerBattle(state, data);
  battle.advance((now - AT) / TICK_MS);
  const settled = settleAt(state, now);
  expect(settled).toEqual({ ...state, ...battle.checkpoint().player });
  expect(settled.battle.enemies.length).toBeGreaterThan(0);
  expect(settled.battle.wave).not.toBeNull();
  // 같은 틱 안의 시각은 같은 틱으로 확정한다.
  expect(settleAt(state, now + 99)).toEqual(settled);
});

test("settling pays what was earned on top of what is held", () => {
  const earned = settleAt(player(), AT + 30_000).items;
  const state = { ...player(), items: { 1: Big.from(1000) } };
  expect(settleAt(state, AT + 30_000).items).toEqual({ ...earned, 1: Big.add(1000, earned[1]) });
});

test("settling keeps the level the battle reached and the experience left over", () => {
  const state = player();
  // 3001의 클리어(약 13초 뒤)에 경험치 100이 차서 2레벨이 된다. 그 전에는 프로필을 그대로 둔다.
  expect(settleAt(state, AT + 8_000).profile).toBe(state.profile);
  const settled = settleAt(state, AT + 30_000);
  expect(settled.profile).toEqual({ loginId: "hero", level: 2 });
  expect(Big.lt(settled.items[EXP], 120)).toBe(true);
});

test("settling before the checkpoint's next tick changes nothing, and no command goes back before the checkpoint", () => {
  const state = player();
  expect(applyCommand(state, { type: Opcode.BattleSettle }, { now: AT + 99, data })).toEqual({ ok: true, state });
  expect(settleAt(state, AT - 5_000)).toBe(state);
  // 체크포인트보다 이른 시각의 스테이지 이동도 체크포인트에서 새로 시작한다. 지나온 시간을 다시 돌리지 않는다.
  const settled = settleAt(state, AT + 30_000);
  expect(apply(settled, { type: Opcode.StageSelect, stageId: 3001 }, AT + 29_000).battle.at).toBe(settled.battle.at);
});

test("settling after more than MAX_SETTLE_TICKS pays the offline reward and starts a fresh hunt at now", () => {
  const base = player(3004, 10);
  for (const at of [AT, 0]) {
    const cases = [
      { waves: 1, autoBoss: false, mode: BattleMode.Hunt },
      // 남긴 웨이브 수로 보스 차례가 되면 새 사냥도 보스부터다.
      { waves: 3, autoBoss: true, mode: BattleMode.Boss },
    ];
    for (const { waves, autoBoss, mode } of cases) {
      const hurt = { hp: Big.from(1), cooldowns: [3, 4, 5], effects: [], x: 0 };
      const state = { ...base, battle: { ...base.battle, at, waves, autoBoss, hero: hurt, nextId: 40 } };
      const now = at + MAX_SETTLE_TICKS * TICK_MS + 1;
      const { battle, items, profile } = settleAt(state, now);
      // 다시 돌리지 않은 시간은 오프라인 보상으로 받고 그 경험치로 바로 레벨을 올린다. 체크포인트가 없던 것(at 0)은
      // 받지 않는다.
      const paid = levelUp(state.profile, grant(state, offlineReward(state, data, now).items, data).items, data);
      expect({ profile, items }).toEqual(paid);
      if (at === 0) expect(items).toBe(state.items);
      else expect(profile.level).toBeGreaterThan(10);
      // 새 사냥은 오른 레벨의 최대 HP와 처음 재사용 대기로 시작한다.
      const hero = heroStats({ ...state, ...paid }, data);
      expect(battle).toMatchObject({ mode, at: now, waves, autoBoss, nextId: 40, hero: { cooldowns: initialCooldowns(hero) } });
      expect(battle.hero.hp).toEqual(hero.maxHp);
      expect(battle.rng).toBe(state.battle.rng);
    }
  }
  // 마이그레이션이 넣은 rng 0은 이어 받지 않고 now에서 새로 시드한다.
  const migrated = { ...base, battle: { ...base.battle, at: 0, rng: 0 } };
  expect(settleAt(migrated, 5_000).battle.rng).not.toBe(0);
});

test("a boss challenge turns autoBoss on without changing what was already shown", () => {
  const base = player(3004, 10);
  const state = { ...base, battle: { ...base.battle, waves: 3, autoBoss: false } };
  const now = AT + 30_000;
  const plainEvents = run(playerBattle(state, data), 3000);

  const challenged = challengeAt(state, now);
  expect(challenged.battle.autoBoss).toBe(true);
  const from = (challenged.battle.at - AT) / TICK_MS;
  expect(from).toBeGreaterThan(0);

  // 새 체크포인트에서 다음 경계까지: 도전하지 않고 이어 간 전투의 같은 구간과 같다.
  const battle = playerBattle(challenged, data);
  const events: BattleEvent[] = [];
  while (battle.lastBoundary() === undefined) battle.advance(battle.tick + 1, event => events.push(event));
  const boundary = battle.tick;
  expect(from + boundary).toBeGreaterThan(300);
  expect(events).toEqual(
    plainEvents.filter(e => e.tick > from && e.tick <= from + boundary).map(e => ({ ...e, tick: e.tick - from })),
  );
  // 그 경계 다음에 보스가 나온다. 도전하지 않은 전투는 사냥을 이어 간다.
  expect(run(battle, boundary + 1)[0]).toEqual({ tick: boundary + 1, type: "bossStart" });
  expect(plainEvents.find(e => e.tick === from + boundary + 1)?.type).toBe("waveStart");
});

test("a boss challenge while autoBoss is on only settles", () => {
  const state = player(3004, 10);
  expect(challengeAt(state, AT + 30_000)).toEqual(settleAt(state, AT + 30_000));
  expect(challengeAt(state, AT + 99)).toBe(state);
});

test("a boss challenge on a stage without a boss only settles", () => {
  // 3001은 보스가 없다. 꺼진 autoBoss를 켜면 웨이브 수가 찰 때 다시 클리어한다(마지막 스테이지 클리어 뒤처럼).
  const base = player();
  const state = { ...base, battle: { ...base.battle, autoBoss: false } };
  const challenged = challengeAt(state, AT + 30_000);
  expect(challenged).toEqual(settleAt(state, AT + 30_000));
  expect(challenged.battle.autoBoss).toBe(false);
});

test("selecting a stage settles, then starts a fresh hunt there at now", () => {
  const state = player();
  const now = AT + 30_000;
  // 3001을 클리어하고 3002로 옮겨 사냥하고 있다.
  const settled = settleAt(state, now);
  expect(settled.stage.currentId).toBe(3002);

  const selected = apply(state, { type: Opcode.StageSelect, stageId: 3001 }, now);
  expect(selected.stage).toEqual({ ...settled.stage, currentId: 3001 });
  expect(selected.battle).toMatchObject({ mode: BattleMode.Hunt, at: now, waves: 0, autoBoss: true, rng: settled.battle.rng });
  expect(selected.battle.hero.hp).toEqual(heroStats(settled, data).maxHp);

  // 이미 그 스테이지에 있으면 정산만 한다.
  expect(apply(state, { type: Opcode.StageSelect, stageId: 3001 }, AT + 99)).toBe(state);
  expect(applyCommand(state, { type: Opcode.StageSelect, stageId: 9999 }, { now, data }))
    .toMatchObject({ ok: false, error: { code: GameErrorCode.StageNotFound } });
});

test("selecting a locked stage is refused by the clears and level the settle reaches", () => {
  const select = (state: PlayerState, stageId: number, now: number) =>
    applyCommand(state, { type: Opcode.StageSelect, stageId }, { now, data });
  const locked = { ok: false, error: { code: GameErrorCode.StageLocked } };

  // 3003은 3002를 클리어해야 열린다. 3002의 클리어는 30초 안에 오지 않는다.
  expect(select(player(), 3003, AT + 30_000)).toMatchObject(locked);

  // 3006은 3005의 클리어와 15레벨이 필요하다. 14레벨의 경험치가 다 찼으면 첫 웨이브의 경계에서 15레벨이 된다.
  const base = player(3001, 14);
  const ready = {
    ...base,
    items: { [EXP]: data.heroLevels.get(14)!.expToNext! },
    stage: { ...base.stage, clearedIds: [3001, 3002, 3003, 3004, 3005] },
  };
  expect(select(ready, 3006, AT + 100)).toMatchObject(locked);
  const selected = apply(ready, { type: Opcode.StageSelect, stageId: 3006 }, AT + 30_000);
  expect(selected).toMatchObject({ profile: { level: 15 }, stage: { currentId: 3006 } });

  // 이미 있는 스테이지는 잠겨 있어도 정산만 한다.
  const inside = player(3006);
  expect(select(inside, 3006, AT + 99)).toEqual({ ok: true, state: inside });
});

describe("equipment", () => {
  const equip = (state: PlayerState, equipmentId: unknown, now: number) =>
    applyCommand(state, { type: Opcode.ItemEquip, equipmentId } as Command, { now, data });
  const unequip = (state: PlayerState, equipmentId: unknown, now: number) =>
    applyCommand(state, { type: Opcode.ItemUnequip, equipmentId } as Command, { now, data });
  const worn = (result: ReturnType<typeof applyCommand>) => {
    if (!result.ok) throw new Error(result.error.message);
    return result.state;
  };
  // 낡은 검 둘(1, 2)과 가죽 갑옷(3)을 가지고 3002에서 웨이브 2로 사냥하고 있다.
  const base = player(3002);
  const state: PlayerState = {
    ...base,
    equipment: { nextId: 4, owned: { 1: { itemId: 101, enhance: 0 }, 2: { itemId: 101, enhance: 0 }, 3: { itemId: 102, enhance: 0 } }, equipped: {} },
    battle: { ...base.battle, waves: 2, autoBoss: false },
  };

  test("wearing settles to now and the fight goes on with the new stats", () => {
    const now = fighting(state);
    const settled = settleAt(state, now);
    const equipped = worn(equip(state, 1, now));
    expect(equipped.equipment).toEqual({ ...settled.equipment, equipped: { 1: 1 } });
    expect(heroStats(equipped, data).attack).toEqual(Big.add(heroStats(settled, data).attack, 5));
    // 싸우던 적과 웨이브, 영웅의 HP·재사용 대기·자리는 그대로다(낡은 검은 최대 HP를 바꾸지 않는다).
    expect(settled.battle.enemies.length).toBeGreaterThan(0);
    expect(equipped.battle).toEqual(settled.battle);
    expect({ ...equipped, battle: undefined, equipment: undefined }).toEqual({ ...settled, battle: undefined, equipment: undefined });
  });

  test("wearing into a full slot swaps, and wearing what is worn only settles", () => {
    const first = worn(equip(state, 1, AT + 100));
    const swapped = worn(equip(first, 2, AT + 200));
    expect(swapped.equipment.equipped).toEqual({ 1: 2 });
    expect(worn(equip(swapped, 3, AT + 300)).equipment.equipped).toEqual({ 1: 2, 2: 3 });
    // 이미 입었으면 정산만 한다.
    expect(worn(equip(swapped, 2, AT + 300))).toEqual(settleAt(swapped, AT + 300));
  });

  test("taking off goes on with the new stats, cutting HP to a lower maximum, and taking off what is not worn only settles", () => {
    const wearing = worn(equip(worn(equip(state, 1, AT + 100)), 3, AT + 200));
    // 가죽 갑옷을 벗으면 최대 HP가 준다.
    const bare = worn(unequip(wearing, 3, AT + 300));
    expect(Big.lt(heroStats(bare, data).maxHp, heroStats(wearing, data).maxHp)).toBe(true);
    expect(bare.battle.hero.hp).toEqual(heroStats(bare, data).maxHp);
    const off = worn(unequip(wearing, 1, AT + 300));
    expect(off.equipment.equipped).toEqual({ 2: 3 });
    expect(off.battle.at).toBe(AT + 300);
    expect(off.battle.hero.hp).toEqual(heroStats(off, data).maxHp);
    expect(worn(unequip(off, 1, AT + 300))).toBe(off);
    expect(worn(unequip(off, 2, AT + 300))).toBe(off);
  });

  test("equipment that is not owned is refused, whatever arrives from the network", () => {
    for (const id of [4, 0, -1, 1.5, "1", "constructor", "__proto__", null, undefined]) {
      expect(equip(state, id, AT + 100)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotFound } });
      expect(unequip(state, id, AT + 100)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotFound } });
    }
  });

  test("equipment the same settle has just paid can be worn", () => {
    // 3001의 클리어(약 13초)가 낡은 검을 준다.
    const fresh = player();
    const equipped = worn(equip(fresh, 1, AT + 30_000));
    expect(equipped.equipment).toEqual({ nextId: 2, owned: { 1: { itemId: 101, enhance: 0 } }, equipped: { 1: 1 } });
    expect(equip(fresh, 1, AT + 100)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotFound } });
  });
});

describe("skills", () => {
  const GOLD = 1;
  const send = (state: PlayerState, command: unknown, now: number) => applyCommand(state, command as Command, { now, data });
  const learn = (state: PlayerState, skillId: unknown, now: number) => send(state, { type: Opcode.SkillLearn, skillId }, now);
  const equip = (state: PlayerState, slot: unknown, skillId: unknown, now: number) => send(state, { type: Opcode.SkillEquip, slot, skillId }, now);
  const unequip = (state: PlayerState, skillId: unknown, now: number) => send(state, { type: Opcode.SkillUnequip, skillId }, now);
  const levelUp = (state: PlayerState, skillId: unknown, now: number) => send(state, { type: Opcode.SkillLevelUp, skillId }, now);
  const done = (result: ReturnType<typeof applyCommand>) => {
    if (!result.ok) throw new Error(result.error.message);
    return result.state;
  };
  const refused = (code: GameErrorCode) => ({ ok: false, error: { code } });
  // 경험치처럼 double로 정확히 뺀 값.
  const left = (held: Big, cost: Big) => Big.from(Big.toNumber(held) - Big.toNumber(cost));
  // 새 계정처럼 1004, 1005, 1011을 배워 장착하고 골드 10000을 가지고 3002에서 웨이브 2로 사냥하고 있다.
  const base = player(3002);
  const state: PlayerState = { ...base, items: { [GOLD]: Big.from(10_000) }, battle: { ...base.battle, waves: 2, autoBoss: false } };
  const learned = (skillId: number) => done(learn(state, skillId, AT + 100));

  test("a new account has learned and equipped the equippable skills in Heroes.skillIds order up to the slot count, at level 1", () => {
    expect(startSkills(data)).toEqual({ equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: { 1004: 1, 1005: 1, 1011: 1 } });
    expect(equippableSkills(data).map(skill => skill.id)).toEqual([1004, 1005, 1011, 1010, 1006]);
  });

  test("learning pays Skills.learnCost from the settled gold, does not equip and keeps the settled battle", () => {
    const now = AT + 30_000;
    const settled = settleAt(state, now);
    const roar = done(learn(state, 1010, now));
    expect(roar.skills).toEqual({ ...settled.skills, levels: { ...settled.skills.levels, 1010: 1 } });
    expect(roar.items[GOLD]).toEqual(left(settled.items[GOLD], data.skills.get(1010)!.learnCost!));
    expect(roar.battle).toEqual(settled.battle);
    // 이미 배웠으면 확정만 하고 다시 내지 않는다.
    expect(done(learn(roar, 1010, now))).toEqual(roar);
    const short = { ...state, items: { [GOLD]: Big.from(10) } };
    expect(learn(short, 1010, AT + 100)).toMatchObject(refused(GameErrorCode.SkillCostShort));
  });

  test("only learned skills are equipped or leveled up", () => {
    expect(equip(state, 0, 1010, AT + 100)).toMatchObject(refused(GameErrorCode.SkillNotLearned));
    expect(levelUp(state, 1010, AT + 100)).toMatchObject(refused(GameErrorCode.SkillNotLearned));
    expect(done(equip(learned(1010), 0, 1010, AT + 200)).skills.equipped).toEqual({ 0: 1010, 1: 1005, 2: 1011 });
  });

  test("equipping settles to now and the fight goes on, keeping the cooldowns of the skills still used and starting a new one from the top", () => {
    const roar = learned(1010);
    const now = fighting(roar);
    const settled = settleAt(roar, now);
    const equipped = done(equip(roar, 1, 1010, now));
    expect(equipped.skills).toEqual({ ...settled.skills, equipped: { 0: 1004, 1: 1010, 2: 1011 } });
    expect(heroStats(equipped, data).skills.map(skill => skill.id)).toEqual([1001, 1004, 1010, 1011]);
    // 공격 목록이 [1001, 1004, 1005, 1011]에서 [1001, 1004, 1010, 1011]로 바뀐다.
    const [basic, rapid, , wolf] = settled.battle.hero.cooldowns;
    const roarWait = toTicks(data.skills.get(1010)!.cooldownSeconds);
    expect(settled.battle.enemies.length).toBeGreaterThan(0);
    expect(equipped.battle).toEqual({ ...settled.battle, hero: { ...settled.battle.hero, cooldowns: [basic, rapid, roarWait, wolf] } });
    expect({ ...equipped, battle: undefined, skills: undefined }).toEqual({ ...settled, battle: undefined, skills: undefined });
  });

  test("equipping a skill from another slot swaps the two, and equipping what is there only settles", () => {
    expect(done(equip(state, 0, 1011, AT + 100)).skills.equipped).toEqual({ 0: 1011, 1: 1005, 2: 1004 });
    const emptied = { ...state, skills: { ...state.skills, equipped: { 0: 1004, 2: 1011 } } };
    expect(done(equip(emptied, 1, 1011, AT + 100)).skills.equipped).toEqual({ 0: 1004, 1: 1011 });
    expect(done(equip(state, 2, 1011, AT + 100))).toEqual(settleAt(state, AT + 100));
  });

  test("unequipping empties its slot and the fight goes on without it, and unequipping what is not equipped only settles", () => {
    const now = AT + 30_000;
    const settled = settleAt(state, now);
    const off = done(unequip(state, 1005, now));
    expect(off.skills).toEqual({ ...state.skills, equipped: { 0: 1004, 2: 1011 } });
    expect(heroStats(off, data).skills.map(skill => skill.id)).toEqual([1001, 1004, 1011]);
    const [basic, rapid, , wolf] = settled.battle.hero.cooldowns;
    expect(off.battle).toEqual({ ...settled.battle, hero: { ...settled.battle.hero, cooldowns: [basic, rapid, wolf] } });
    expect(done(unequip(off, 1005, now))).toEqual(off);
    // 빈 슬롯에는 다시 장착할 수 있고, 배운 것과 레벨은 그대로다.
    expect(done(equip(off, 1, 1005, now)).skills).toEqual(state.skills);
  });

  test("a slot or skill that cannot be used is refused, whatever arrives from the network", () => {
    for (const slot of [-1, 3, 1.5, "0", null, undefined]) {
      expect(equip(state, slot, 1004, AT + 100)).toMatchObject(refused(GameErrorCode.SkillSlotInvalid));
    }
    // 기본 공격, 몬스터의 스킬, 없는 스킬.
    for (const skillId of [1001, 1002, 9999, "1010", "constructor", null, undefined]) {
      for (const result of [learn(state, skillId, AT + 100), equip(state, 0, skillId, AT + 100), unequip(state, skillId, AT + 100), levelUp(state, skillId, AT + 100)]) {
        expect(result).toMatchObject(refused(GameErrorCode.SkillNotFound));
      }
    }
  });

  test("leveling up an equipped skill pays skillLevelCost from the settled gold and the fight goes on", () => {
    const now = AT + 30_000;
    const settled = settleAt(state, now);
    const leveled = done(levelUp(state, 1005, now));
    expect(leveled.skills.levels).toEqual({ 1004: 1, 1005: 2, 1011: 1 });
    expect(leveled.items[GOLD]).toEqual(left(settled.items[GOLD], skillLevelCost(1)));
    expect(leveled.battle).toEqual(settled.battle);
    const again = done(levelUp(leveled, 1005, now));
    expect(again.skills.levels[1005]).toBe(3);
    expect(again.items[GOLD]).toEqual(left(leveled.items[GOLD], skillLevelCost(2)));
  });

  test("leveling up a learned skill that is not equipped keeps the settled battle", () => {
    const roar = learned(1010);
    const leveled = done(levelUp(roar, 1010, AT + 30_000));
    const settled = settleAt(roar, AT + 30_000);
    expect(leveled.skills).toEqual({ ...settled.skills, levels: { ...settled.skills.levels, 1010: 2 } });
    expect(leveled.battle).toEqual(settled.battle);
  });

  test("leveling up needs the whole cost and stops at Skills.maxLevel", () => {
    const short = { ...state, items: { [GOLD]: Big.sub(skillLevelCost(1), 1) } };
    // 3002는 1초 안에 아무것도 주지 않으므로 정산 뒤에도 모자라다.
    expect(levelUp(short, 1004, AT + 1000)).toMatchObject(refused(GameErrorCode.SkillCostShort));
    const max = data.skills.get(1004)!.maxLevel;
    const top = { ...state, items: { [GOLD]: Big.from(1e12) }, skills: { ...state.skills, levels: { ...state.skills.levels, 1004: max - 1 } } };
    const topped = done(levelUp(top, 1004, AT + 100));
    expect(topped.skills.levels[1004]).toBe(max);
    expect(levelUp(topped, 1004, AT + 100)).toMatchObject(refused(GameErrorCode.SkillMaxLevel));
  });

  test("the gold that the same settle has just paid can pay for a level", () => {
    // 3001의 클리어 보상이 골드 30을 주므로, 비용에서 20 모자란 계정은 클리어 뒤에 올릴 수 있다.
    const fresh = { ...player(), items: { [GOLD]: Big.sub(skillLevelCost(1), 20) } };
    expect(levelUp(fresh, 1004, AT + 100)).toMatchObject(refused(GameErrorCode.SkillCostShort));
    expect(done(levelUp(fresh, 1004, AT + 30_000)).skills.levels[1004]).toBe(2);
  });

  test("every skill the hero can equip has a learning cost and the item that pays it", () => {
    for (const skill of equippableSkills(data)) {
      expect(skill.learnCost).not.toBeNull();
      expect(data.items.has(skill.costItemId!)).toBe(true);
    }
  });
});

describe("upgrades during a fight", () => {
  const GOLD = data.constants.goldItemId;

  // 영웅이 맞아 HP가 줄어든 채 싸우는 첫 틱의 시각.
  function hurtInFight(state: PlayerState): number {
    const battle = playerBattle(state, data);
    for (let tick = 1; tick < MAX_SETTLE_TICKS; tick++) {
      battle.advance(tick);
      const { hero, enemies } = battle.snapshot();
      if (enemies.length > 0 && Big.sign(hero.hp) > 0 && Big.lt(hero.hp, hero.maxHp)) return state.battle.at + tick * TICK_MS;
    }
    throw new Error("The hero was never hurt in a fight.");
  }

  test("raising max HP raises HP by as much and the same fight goes on", () => {
    const state = { ...player(3003), items: { [GOLD]: Big.from(100_000) } };
    const now = hurtInFight(state);
    const settled = settleAt(state, now);
    const upgraded = apply(state, { type: Opcode.StatUpgrade, upgradeId: 7002, steps: 1 }, now);
    const gained = Big.sub(heroStats(upgraded, data).maxHp, heroStats(settled, data).maxHp);
    expect(Big.toNumber(gained)).toBe(50);
    expect(upgraded.battle.hero.hp).toEqual(Big.add(settled.battle.hero.hp, gained));
    expect({ ...upgraded.battle, hero: undefined }).toEqual({ ...settled.battle, hero: undefined });
    expect(upgraded.battle.enemies.length).toBeGreaterThan(0);
  });

  test("an upgrade during a boss fight goes on with the same boss, its HP and the time left", () => {
    const base = { ...player(3004, 10), items: { [GOLD]: Big.from(100_000) } };
    const state = { ...base, battle: { ...base.battle, mode: BattleMode.Boss, waves: 3 } };
    const now = fighting(state, 30);
    const settled = settleAt(state, now);
    expect(settled.battle.enemies).toEqual([expect.objectContaining({ boss: true })]);
    expect(settled.battle.bossTicksLeft).not.toBeNull();
    const upgraded = apply(state, { type: Opcode.StatUpgrade, upgradeId: 7001, steps: 1 }, now);
    expect(upgraded.battle).toEqual(settled.battle);
    expect(Big.gt(heroStats(upgraded, data).attack, heroStats(settled, data).attack)).toBe(true);
  });
});
