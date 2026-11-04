import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { ItemKind, Stat, loadGameData } from "@idle/data-schema";
import { describe, expect, test } from "vitest";
import { heroStats } from "../src/battle/stats.js";
import type { Command } from "../src/command.js";
import { applyCommand } from "../src/commands/index.js";
import { enhanceCost, equipmentStat, mergeMaterials, NO_EQUIPMENT, type EquipmentState } from "../src/equipment.js";
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
