import { encode } from "@msgpack/msgpack";
import { Big } from "@idle/big-number";
import { BattleMode, freshBattle, NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, settle, startSkills, startTutorial, type BattleState } from "@idle/game-core";
import { describe, expect, test } from "vitest";
import { SAVE_VERSION, createPlayer, decodeSave, encodeSave, upgrade, type Migration } from "../src/save.js";
import { loadTestData } from "../src/testing.js";

const data = await loadTestData();

test("a new player starts on the table's first stage and the tutorial's first step, and survives the stored format unchanged", () => {
  const player = createPlayer("hero", data, 5000);
  expect(data.stages.get(player.stage.currentId)?.unlockStageId).toBeNull();
  expect(player.tutorial).toEqual(startTutorial(data));
  expect(player.tutorial.stepId).toBe(Math.min(...data.tutorialSteps.keys()));
  expect(decodeSave(encodeSave(player))).toEqual(player);
});

describe("upgrade", () => {
  // 저장 형식의 이력: 버전 1에는 `name`이 있었고, 2에서 `nickname`으로 바꿨고, 3에서 `level`을 더했다.
  const history: Migration[] = [
    ({ name, ...rest }) => ({ ...rest, nickname: name }),
    save => ({ ...save, level: 1 }),
  ];

  test("runs every migration after the save's version, in order", () => {
    expect(upgrade({ name: "hero" }, 1, history)).toEqual({ nickname: "hero", level: 1 });
    expect(upgrade({ nickname: "hero" }, 2, history)).toEqual({ nickname: "hero", level: 1 });
    expect(upgrade({ nickname: "hero", level: 7 }, 3, history)).toEqual({ nickname: "hero", level: 7 });
  });

  test("refuses versions it does not know, newer ones included", () => {
    for (const version of [0, 4, 1.5, "1", undefined]) {
      expect(() => upgrade({}, version, history)).toThrow(/Save format .* is unknown/);
    }
  });
});

test("stored saves read back through the migrations of their version", () => {
  const stored = encode({ version: SAVE_VERSION, player: createPlayer("hero", data, 5000) });
  expect(decodeSave(stored).profile.loginId).toBe("hero");
  expect(() => decodeSave(encode({ version: SAVE_VERSION + 1, player: {} }))).toThrow(/unknown/);
  expect(() => decodeSave(encode("not a save"))).toThrow(/Not a stored save/);
  expect(() => decodeSave(encode({ version: 1 }))).toThrow(/has no player/);
});

// 버전 1과 2의 프로필에는 경험치가 있었고 골드는 currencies에 있었다.
const zero = { m: 0, e: 0 };
const v1 = { profile: { loginId: "hero", level: 1, exp: zero }, currencies: { gold: zero }, stage: { currentId: 3001, clearedIds: [] } };

test("version 1 saves gain a battle that the first settle replaces", () => {
  const player = decodeSave(encode({ version: 1, player: v1 }));
  expect(player.battle).toEqual({
    mode: 0, at: 0, rng: 0, hero: { hp: { m: 0, e: 0 }, cooldowns: [], effects: [], x: 0 }, waves: 0, autoBoss: true, nextId: 1, summons: [],
    enemies: [], projectiles: [], wave: null, bossTicksLeft: null, reviveTicksLeft: null,
  });
  expect(settle(player, data, 9000).battle).toEqual(freshBattle(player, data, 9000));
  expect(createPlayer("hero", data, 5000).battle).toEqual(freshBattle(player, data, 5000));
});

// 버전 2부터 5까지의 체크포인트: 영웅 상태가 펼쳐져 있고 처치 수를 센다.
function v2Battle({ mode, at, rng, hero, autoBoss }: BattleState) {
  return { mode, at, rng, heroHp: hero.hp, cooldowns: hero.cooldowns, kills: 0, autoBoss };
}

test("version 2 saves move gold and experience into items", () => {
  const battle = freshBattle(createPlayer("hero", data, 5000), data, 5000);
  const v2 = {
    ...v1, profile: { ...v1.profile, exp: { m: 1.5, e: 3 } }, currencies: { gold: { m: 7.25, e: 42 } }, battle: v2Battle(battle),
  };
  expect(decodeSave(encode({ version: 2, player: v2 }))).toEqual({
    profile: { loginId: "hero", level: 1 },
    items: { 1: { m: 7.25, e: 42 }, 2: { m: 1.5, e: 3 } },
    equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH,
    stage: v1.stage,
    battle,
    tutorial: { stepId: null },
    skills: { equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: { 1004: 1, 1005: 1, 1011: 1 } },
  });
  // 0인 것은 담지 않는다.
  expect(decodeSave(encode({ version: 1, player: v1 })).items).toEqual({});
});

test("version 3 saves gain equipment with nothing owned, and equipment survives the stored format", () => {
  const { equipment: _, battle, ...v3 } = createPlayer("hero", data, 5000);
  expect(decodeSave(encode({ version: 3, player: { ...v3, battle: v2Battle(battle) } })).equipment).toEqual(NO_EQUIPMENT);
  const geared = {
    ...createPlayer("hero", data, 5000),
    equipment: { nextId: 4, owned: { 1: { itemId: 101, enhance: 0 }, 3: { itemId: 102, enhance: 2 } }, equipped: { 2: 3 } },
  };
  expect(decodeSave(encodeSave(geared))).toEqual(geared);
});

test("version 4 saves gain a finished tutorial, since those accounts played before it existed", () => {
  const { tutorial: _, battle, ...v4 } = createPlayer("hero", data, 5000);
  expect(decodeSave(encode({ version: 4, player: { ...v4, battle: v2Battle(battle) } })).tutorial).toEqual({ stepId: null });
  const midway = { ...createPlayer("hero", data, 5000), tutorial: { stepId: 4 } };
  expect(decodeSave(encodeSave(midway))).toEqual(midway);
});

test("version 5 saves keep the checkpoint between waves and count waves from 0", () => {
  const player = createPlayer("hero", data, 5000);
  const between = { ...player.battle, mode: BattleMode.Boss, rng: 777, hero: { hp: Big.from(42), cooldowns: [0, 12, 34], effects: [], x: 0 }, autoBoss: false };
  const v5 = { ...player, battle: { ...v2Battle(between), kills: 9 } };
  expect(decodeSave(encode({ version: 5, player: v5 })).battle).toEqual({ ...between, waves: 0, nextId: 1 });
  expect(decodeSave(encodeSave(player))).toEqual(player);
});

test("version 6 saves gain a hero without effects, and effects survive the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { effects: _, ...v6Hero } = player.battle.hero;
  expect(decodeSave(encode({ version: 6, player: { ...player, battle: { ...player.battle, hero: v6Hero } } }))).toEqual(player);
  const buffed = {
    ...player,
    battle: { ...player.battle, hero: { ...player.battle.hero, effects: [{ effectId: 4008, ticksLeft: 37, amount: Big.from(150) }] } },
  };
  expect(decodeSave(encodeSave(buffed))).toEqual(buffed);
});

test("version 7 saves gain no summons, and summons survive the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { summons: _, ...v7Battle } = player.battle;
  expect(decodeSave(encode({ version: 7, player: { ...player, battle: v7Battle } }))).toEqual(player);
  const summon = {
    id: 5, summonId: 6001, by: 0, hp: Big.from(120), cooldowns: [3], effects: [{ effectId: 4007, ticksLeft: 12, amount: Big.from(4) }], x: 0, ticksLeft: 180,
  };
  const summoning = { ...player, battle: { ...player.battle, summons: [summon] } };
  expect(decodeSave(encodeSave(summoning))).toEqual(summoning);
});

test("version 8 saves gain no stat upgrades, and stat upgrades survive the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { statUpgrades: _, ...v8 } = player;
  expect(decodeSave(encode({ version: 8, player: v8 }))).toEqual(player);
  const upgraded = { ...player, statUpgrades: { 7001: 12, 7003: 3 } };
  expect(decodeSave(encodeSave(upgraded))).toEqual(upgraded);
});

test("version 9 saves have learned and equipped the skills they fought with at level 1, and skills survive the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { skills: _, ...v9 } = player;
  const upgraded = decodeSave(encode({ version: 9, player: v9 }));
  expect(upgraded).toEqual(player);
  // 이 데이터의 새 계정과 같아 전투가 같은 스킬로 이어진다.
  expect(upgraded.skills).toEqual({ equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: { 1004: 1, 1005: 1, 1011: 1 } });
  expect(upgraded.skills).toEqual(startSkills(data));
  const leveled = { ...player, skills: { equipped: { 0: 1010, 2: 1004 }, levels: { 1004: 3, 1005: 1, 1010: 7, 1011: 1 } } };
  expect(decodeSave(encodeSave(leveled))).toEqual(leveled);
});

test("version 10 saves enhance every owned piece of equipment to +0, and enhancement survives the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const v10Equipment = { nextId: 4, owned: { 1: { itemId: 101 }, 3: { itemId: 102 } }, equipped: { 2: 3 } };
  expect(decodeSave(encode({ version: 10, player: { ...player, equipment: v10Equipment } })).equipment)
    .toEqual({ nextId: 4, owned: { 1: { itemId: 101, enhance: 0 }, 3: { itemId: 102, enhance: 0 } }, equipped: { 2: 3 } });
  expect(decodeSave(encode({ version: 10, player }))).toEqual(player);
});

test("version 11 saves have never been reborn, and rebirths survive the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { rebirth: _, ...v11 } = player;
  expect(decodeSave(encode({ version: 11, player: v11 }))).toEqual(player);
  expect(player.rebirth).toEqual({ count: 0, points: 0 });
  const reborn = { ...player, rebirth: { count: 3, points: 1003 } };
  expect(decodeSave(encodeSave(reborn))).toEqual(reborn);
});

test("version 12 saves keep their boundary checkpoint with nothing in the fight, and a fight in progress survives the stored format", () => {
  const player = createPlayer("hero", data, 5000);
  const { enemies: _e, projectiles: _p, wave: _w, bossTicksLeft: _b, reviveTicksLeft: _r, hero, ...rest } = player.battle;
  const { x: _x, ...v12Hero } = hero;
  const v12Summon = { id: 5, summonId: 6001, hp: Big.from(120), cooldowns: [3], effects: [], ticksLeft: 180 };
  const v12 = { ...player, battle: { ...rest, hero: v12Hero, summons: [v12Summon] } };
  expect(decodeSave(encode({ version: 12, player: v12 })).battle)
    .toEqual({ ...player.battle, summons: [{ ...v12Summon, by: 0, x: 0 }] });
  const fighting = {
    ...player,
    battle: {
      ...player.battle,
      hero: { ...hero, x: 1.7999999999999998 },
      enemies: [{ id: 3, monsterId: 2001, boss: false, hp: Big.from(37), cooldowns: [2], effects: [], x: 2.8 }],
      projectiles: [{ id: 4, by: 0, skillId: 1004, level: 2, targets: [3], crit: true, ticksLeft: 1 }],
      wave: { elapsed: 31, spawned: 2 },
      bossTicksLeft: null,
      reviveTicksLeft: null,
    },
  };
  expect(decodeSave(encodeSave(fighting))).toEqual(fighting);
  expect(SAVE_VERSION).toBe(13);
});
