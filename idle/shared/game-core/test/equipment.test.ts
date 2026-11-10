import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { ItemKind, Stat, loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { heroStats } from "../src/battle/stats.js";
import type { Command } from "../src/command.js";
import { applyCommand } from "../src/commands/index.js";
import { next as random } from "../src/battle/rng.js";
import { enhanceCost, equipmentStat, mergeMaterials, nextMerge, NO_EQUIPMENT, type EquipmentState } from "../src/equipment.js";
import type { PlayerState } from "../src/state.js";
import { accepted, testPlayer } from "../src/testing.js";

const data = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const GOLD = data.constants.goldItemId;
const AT = 1_000_000;
const SWORD = 101;
const SHARP_SWORD = 107;
const ARMOR = 102;
const row = (id: number) => data.items.get(id)!;

// 3002에서 사냥하는 영웅. 처치와 클리어가 아직 없는 시각(AT + 100)에 커맨드를 보내면 정산이 아무것도 바꾸지 않는다.
const player = (equipment: EquipmentState, gold = 0) =>
  testPlayer(data, AT, { items: { [GOLD]: Big.from(gold) }, equipment, stage: { currentId: 3002, clearedIds: [3001] } });

const send = (state: PlayerState, type: Opcode.ItemEnhance | Opcode.ItemMerge, equipmentId: unknown, now = AT + 99) =>
  applyCommand(state, { type, equipmentId } as Command, { now, data });

test("the enhance cost grows by enhanceCostGrowth every step from enhanceBaseCost", () => {
  expect([0, 1, 2, 5, 9, 19].map(step => Big.toNumber(enhanceCost(step)))).toEqual([500, 750, 1125, 3796, 19221, 1108418]);
});

test("each step adds enhanceStatPerStep of the row's stat, rounded down, and an empty stat stays empty", () => {
  const sword = row(SWORD);
  expect(Array.from({ length: 11 }, (_, step) => Big.toNumber(equipmentStat(sword, step, Stat.Attack)!)))
    .toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  expect(Big.toNumber(equipmentStat(row(ARMOR), 3, Stat.Defense)!)).toBe(4);
  expect(Big.toNumber(equipmentStat(row(ARMOR), 3, Stat.MaxHp)!)).toBe(48);
  expect(equipmentStat(sword, 10, Stat.Defense)).toBeNull();
});

test("the hero's stats use the enhanced stats of what is worn", () => {
  const plain = player({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 0 } }, equipped: { 1: 1 } });
  const enhanced = player({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 4 } }, equipped: { 1: 1 } });
  expect(heroStats(enhanced, data).attack).toEqual(Big.add(heroStats(plain, data).attack, 4));
});

test("deployed merges lead to equipment of the same slot, and every piece of equipment has its limits", () => {
  for (const item of data.items.values()) {
    if (item.kind !== ItemKind.Equipment) continue;
    expect(item.enhanceMax).not.toBeNull();
    expect(item.mergeCount).toBeGreaterThanOrEqual(2);
    if (item.mergeItemId === null) continue;
    const next = row(item.mergeItemId);
    expect(next).toMatchObject({ kind: ItemKind.Equipment, slot: item.slot });
    expect(next.id).not.toBe(item.id);
  }
});

describe("enhancing", () => {
  const owned = { 1: { itemId: SWORD, enhance: 0 }, 2: { itemId: ARMOR, enhance: 9 } };

  test("pays the step's gold and raises the step, leaving the battle alone for what is not worn", () => {
    const state = player({ nextId: 3, owned, equipped: {} }, 600);
    const after = accepted(send(state, Opcode.ItemEnhance, 1));
    expect(after.items[GOLD]).toEqual(Big.from(100));
    expect(after.equipment.owned).toEqual({ ...owned, 1: { itemId: SWORD, enhance: 1 } });
    expect(after.battle).toBe(state.battle);
  });

  test("goes on with the new stats from now when the piece is worn", () => {
    const state = player({ nextId: 3, owned, equipped: { 1: 1 } }, 600);
    const after = accepted(send(state, Opcode.ItemEnhance, 1, AT + 200));
    expect(after.battle.at).toBe(AT + 200);
    expect(after.battle.hero.hp).toEqual(heroStats(after, data).maxHp);
    expect(heroStats(after, data).attack).toEqual(Big.add(heroStats(state, data).attack, 1));
  });

  test("is refused at the highest step, without the gold, and for equipment not owned", () => {
    const state = player({ nextId: 3, owned: { ...owned, 2: { itemId: ARMOR, enhance: 10 } }, equipped: {} }, 499);
    expect(send(state, Opcode.ItemEnhance, 2)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentMaxEnhance } });
    expect(send(state, Opcode.ItemEnhance, 1)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
    for (const id of [3, 1.5, "1", "constructor", null]) {
      expect(send(state, Opcode.ItemEnhance, id)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotFound } });
    }
  });

  test("spends gold the same settle has just paid", () => {
    // 3002의 첫 처치(몇 초 안)가 골드를 준다. 정산 전 보유량은 0이다.
    const state = player({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 0 } }, equipped: {} }, 499);
    expect(send(state, Opcode.ItemEnhance, 1)).toMatchObject({ ok: false, error: { code: GameErrorCode.NotEnoughGold } });
    expect(accepted(send(state, Opcode.ItemEnhance, 1, AT + 60_000)).equipment.owned[1].enhance).toBe(1);
  });
});

describe("merging", () => {
  // 낡은 검 넷(1: +2 착용, 2: +5, 3: +0, 4: +0)과 가죽 갑옷 하나.
  const equipment: EquipmentState = {
    nextId: 6,
    owned: {
      1: { itemId: SWORD, enhance: 2 }, 2: { itemId: SWORD, enhance: 5 }, 3: { itemId: SWORD, enhance: 0 }, 4: { itemId: SWORD, enhance: 0 },
      5: { itemId: ARMOR, enhance: 0 },
    },
    equipped: { 1: 1, 2: 5 },
  };

  test("uses the chosen piece, then pieces not worn with the lowest step and id", () => {
    expect(mergeMaterials(equipment, 2, data)).toEqual([2, 3, 4]);
    expect(mergeMaterials(equipment, 3, data)).toEqual([3, 4, 2]);
    expect(mergeMaterials({ ...equipment, owned: { ...equipment.owned, 4: { itemId: SWORD, enhance: 9 } } }, 3, data)).toEqual([3, 2, 4]);
    // 입은 것은 고르거나 모자랄 때만 쓴다.
    expect(mergeMaterials(equipment, 1, data)).toEqual([1, 3, 4]);
    const { 4: _, ...three } = equipment.owned;
    expect(mergeMaterials({ ...equipment, owned: three }, 2, data)).toEqual([2, 3, 1]);
  });

  test("makes one piece of the next grade at +0 under a new id, keeping what is worn", () => {
    const state = player(equipment);
    const after = accepted(send(state, Opcode.ItemMerge, 2));
    expect(after.equipment).toEqual({
      nextId: 7,
      owned: { 1: { itemId: SWORD, enhance: 2 }, 5: { itemId: ARMOR, enhance: 0 }, 6: { itemId: SHARP_SWORD, enhance: 0 } },
      equipped: { 1: 1, 2: 5 },
    });
    expect(after.battle).toBe(state.battle);
  });

  test("wears the result in the slot of a worn material and goes on with it from now", () => {
    const state = player(equipment);
    const after = accepted(send(state, Opcode.ItemMerge, 1, AT + 200));
    expect(after.equipment.equipped).toEqual({ 1: 6, 2: 5 });
    expect(after.equipment.owned[6]).toEqual({ itemId: SHARP_SWORD, enhance: 0 });
    expect(Object.keys(after.equipment.owned)).toEqual(["2", "5", "6"]);
    expect(after.battle.at).toBe(AT + 200);
    // 낡은 검 +2(7)에서 날 선 검(12)으로.
    expect(heroStats(after, data).attack).toEqual(Big.add(heroStats(state, data).attack, 5));
  });

  test("is refused without enough of the same piece, for the top grade and for equipment not owned", () => {
    const { 3: _3, 4: _4, ...two } = equipment.owned;
    expect(send(player({ ...equipment, owned: two }), Opcode.ItemMerge, 2))
      .toMatchObject({ ok: false, error: { code: GameErrorCode.MergeMaterialsShort } });
    const top = player({ nextId: 2, owned: { 1: { itemId: SHARP_SWORD, enhance: 0 } }, equipped: {} });
    expect(send(top, Opcode.ItemMerge, 1)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotMergeable } });
    expect(send(player(NO_EQUIPMENT), Opcode.ItemMerge, 1)).toMatchObject({ ok: false, error: { code: GameErrorCode.EquipmentNotFound } });
  });
});

describe("merging everything", () => {
  const RING = 103;
  const piece = (itemId: number, enhance = 0) => ({ itemId, enhance });
  const mergeAll = (state: PlayerState, game = data, now = AT + 99) => applyCommand(state, { type: Opcode.ItemMergeAll }, { now, data: game });
  // 날 선 검 둘이 오우거 전쟁검(110, 같은 무기)으로 합성되는 데이터. 합성의 결과가 다시 재료가 된다.
  const cascading = { ...data, items: new Map(data.items).set(SHARP_SWORD, { ...row(SHARP_SWORD), mergeItemId: 110, mergeCount: 2 }) };

  // 옛 일괄 합성 버튼: 재료가 모인 장비 중 ID가 가장 작은 것을 ItemMerge로 하나씩, 남은 것이 없을 때까지.
  function pressedRepeatedly(state: PlayerState, game = data): PlayerState {
    for (;;) {
      const held = state.equipment;
      const equipmentId = Object.keys(held.owned).map(Number).find(id => mergeMaterials(held, id, game) !== undefined);
      if (equipmentId === undefined) return state;
      state = accepted(applyCommand(state, { type: Opcode.ItemMerge, equipmentId }, { now: AT + 99, data: game }));
    }
  }

  test("is refused when nothing has its materials, without settling anything into a save", () => {
    const equipment = { nextId: 4, owned: { 1: piece(SWORD), 2: piece(SWORD), 3: piece(SHARP_SWORD) }, equipped: {} };
    expect(nextMerge(equipment, data)).toBeUndefined();
    for (const state of [player(equipment), player(NO_EQUIPMENT)]) {
      expect(mergeAll(state)).toMatchObject({ ok: false, error: { code: GameErrorCode.MergeMaterialsShort } });
    }
  });

  test("merges every set of every slot in id order, for no gold, leaving the battle alone when nothing worn is used", () => {
    // 낡은 검 넷(1: +3), 가죽 갑옷 셋, 구리 반지 둘. 검은 1과 +0인 3, 5를, 갑옷은 셋을 쓰고, 반지와 검 하나는 남는다.
    const state = player({
      nextId: 10,
      owned: {
        1: piece(SWORD, 3), 2: piece(ARMOR), 3: piece(SWORD), 4: piece(ARMOR), 5: piece(SWORD), 6: piece(ARMOR), 7: piece(RING),
        8: piece(SWORD), 9: piece(RING),
      },
      equipped: {},
    });
    expect(nextMerge(state.equipment, data)).toEqual([1, 3, 5]);
    const after = accepted(mergeAll(state));
    expect(after.equipment).toEqual({
      nextId: 12, owned: { 7: piece(RING), 8: piece(SWORD), 9: piece(RING), 10: piece(SHARP_SWORD), 11: piece(108) }, equipped: {},
    });
    expect(after.items).toBe(state.items);
    expect(after.battle).toBe(state.battle);
    expect(after).toEqual(pressedRepeatedly(state));
  });

  test("merges again what a merge completes", () => {
    const owned = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, piece(SWORD)]));
    // 1–3 → 7, 4–6 → 8(날 선 검 둘) → 9(오우거 전쟁검).
    const after = accepted(mergeAll(player({ nextId: 7, owned, equipped: {} }), cascading));
    expect(after.equipment).toEqual({ nextId: 10, owned: { 9: piece(110) }, equipped: {} });
  });

  test("wears the result in the slot of a worn material and goes on with it from now, refitting once", () => {
    // 입은 낡은 검 +2(1)와 검 둘, 입지 않은 가죽 갑옷 셋.
    const owned = { 1: piece(SWORD, 2), 2: piece(SWORD), 3: piece(SWORD), 4: piece(ARMOR), 5: piece(ARMOR), 6: piece(ARMOR) };
    const state = player({ nextId: 7, owned, equipped: { 1: 1 } });
    const after = accepted(mergeAll(state, data, AT + 200));
    expect(after.equipment).toEqual({ nextId: 9, owned: { 7: piece(SHARP_SWORD), 8: piece(108) }, equipped: { 1: 7 } });
    expect(after.battle.at).toBe(AT + 200);
    // 낡은 검 +2(7)에서 날 선 검(12)으로.
    expect(heroStats(after, data).attack).toEqual(Big.add(heroStats(state, data).attack, 5));
  });

  test("ends where pressing the old merge-all button again and again ends, for any bag", () => {
    const items = [...data.items.values()].filter(item => item.kind === ItemKind.Equipment);
    let rng = 7;
    const roll = (n: number) => {
      const drawn = random(rng);
      rng = drawn.state;
      return Math.floor(drawn.value * n);
    };
    let merged = 0;
    let wornUsed = 0;
    for (let bag = 0; bag < 30; bag++) {
      const owned: { [id: number]: { itemId: number; enhance: number } } = {};
      const count = roll(40);
      for (let id = 1; id <= count; id++) owned[id] = piece(items[roll(items.length)].id, roll(4));
      const equipped: { [slot: number]: number } = {};
      for (const [id, instance] of Object.entries(owned)) if (roll(4) === 0) equipped[row(instance.itemId).slot!] = Number(id);
      const state = player({ nextId: count + 1, owned, equipped });
      const pressed = pressedRepeatedly(state, cascading);
      if (pressed === state) {
        expect(mergeAll(state, cascading)).toMatchObject({ ok: false, error: { code: GameErrorCode.MergeMaterialsShort } });
        continue;
      }
      const after = accepted(mergeAll(state, cascading));
      merged++;
      if (after.equipment.equipped !== state.equipment.equipped) wornUsed++;
      expect(after.equipment).toEqual(pressed.equipment);
      expect(nextMerge(after.equipment, cascading)).toBeUndefined();
      // 전투는 합성마다가 아니라 한 번 이어 가므로 HP만 다를 수 있다(최대 HP가 줄었다 오르는 합성들).
      const hpless = (s: PlayerState) => ({ ...s, battle: { ...s.battle, hero: { ...s.battle.hero, hp: null } } });
      expect(hpless(after)).toEqual(hpless(pressed));
    }
    // 대부분의 가방이 합성하고, 그중 여럿은 입은 장비를 쓴다.
    expect(merged).toBeGreaterThan(10);
    expect(wornUsed).toBeGreaterThan(3);
  });

  test("merges a full bag in one command, and stops at its bound even for data whose merges would never end", () => {
    const full = Object.fromEntries(Array.from({ length: data.constants.equipmentCap }, (_, i) => [i + 1, piece(SWORD)]));
    const after = accepted(mergeAll(player({ nextId: data.constants.equipmentCap + 1, owned: full, equipped: {} })));
    expect(Object.values(after.equipment.owned).filter(found => found.itemId === SHARP_SWORD)).toHaveLength(33);
    expect(Object.keys(after.equipment.owned)).toHaveLength(34);
    // 하나로 하나를 만드는 순환은 장비 수가 줄지 않는다. 처음 가진 수만큼 합성하고 멈춘다.
    const looping = {
      ...data,
      items: new Map(data.items)
        .set(SWORD, { ...row(SWORD), mergeItemId: SHARP_SWORD, mergeCount: 1 })
        .set(SHARP_SWORD, { ...row(SHARP_SWORD), mergeItemId: SWORD, mergeCount: 1 }),
    };
    const stuck = accepted(mergeAll(player({ nextId: 3, owned: { 1: piece(SWORD), 2: piece(SHARP_SWORD) }, equipped: {} }), looping));
    expect(stuck.equipment.nextId).toBe(5);
  });
});
