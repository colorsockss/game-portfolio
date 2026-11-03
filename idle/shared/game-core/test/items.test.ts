import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { EquipSlot, ItemKind, loadGameData, type ItemsRow } from "@idle/data-schema";
import { expect, test } from "vitest";
import { NO_EQUIPMENT, type EquipmentState } from "../src/equipment.js";
import { addReward, grant, NO_ITEMS, type Holdings, type ItemAmounts } from "../src/items.js";

const loaded = await loadGameData(table => readFileSync(new URL(`../../data-schema/data/${table}.bytes`, import.meta.url)));
const row = (id: number, change: Partial<ItemsRow>): [number, ItemsRow] =>
  [id, { id, nameKey: "item.gold", cap: null, note: null, kind: ItemKind.Material, slot: null, attack: null, defense: null, maxHp: null, enhanceMax: null, mergeItemId: null, mergeCount: null, icon: "", grade: null, ...change }];
// 지금 데이터에는 상한이 있는 재료와 장비, 슬롯이 없는 장비가 없으므로 더한다.
const STONE = 3;
const RING = 900;
const BROKEN = 901;
const SWORD = 902;
const data = {
  ...loaded,
  items: new Map([
    ...loaded.items,
    row(STONE, { cap: Big.from(999) }),
    row(RING, { kind: ItemKind.Equipment, slot: EquipSlot.Accessory }),
    row(BROKEN, { kind: ItemKind.Equipment }),
    row(SWORD, { kind: ItemKind.Equipment, slot: EquipSlot.Weapon, cap: Big.from(1) }),
  ]),
};
const EQUIPMENT_CAP = data.constants.equipmentCap;
const held = (items: ItemAmounts, equipment: EquipmentState = NO_EQUIPMENT): Holdings => ({ items, equipment });

test("a table row's reward columns add up per item and keep the quantities whole", () => {
  const before = held({ 1: Big.from(1234) });
  expect(addReward(before, [1, 2, 1], [Big.from(5), Big.from(10), Big.from(7)], data).items).toEqual({ 1: Big.from(1246), 2: Big.from(10) });
  expect(before.items).toEqual({ 1: Big.from(1234) });
  expect(addReward(before, [], [], data)).toBe(before);
  expect(() => addReward(before, [1, 2], [Big.from(5)], data)).toThrow("2 item ids but 1 amounts");
  // 1.1e3 + i처럼 2진수로 정확하지 않은 가수도 천 번 더한 뒤 Big.from과 같다.
  let sum = held(NO_ITEMS);
  for (let i = 0; i < 1000; i++) sum = addReward(sum, [1], [Big.from(1.1e3 + i)], data);
  expect(sum.items[1]).toEqual(Big.from(1_599_500));
});

test("a table row's reward keeps only up to an item's cap", () => {
  expect(addReward(held({ [STONE]: Big.from(990) }), [STONE, STONE], [Big.from(5), Big.from(20)], data).items).toEqual({ [STONE]: Big.from(999) });
  const over = { [STONE]: Big.from(1500) };
  expect(addReward(held(over), [STONE], [Big.from(1)], data).items).toEqual(over);
  expect(() => addReward(held(NO_ITEMS), [9999], [Big.from(1)], data)).toThrow("Unknown item 9999.");
});

test("granting adds to what is held and leaves other items alone", () => {
  const before = held({ 1: Big.from(100), 2: Big.from(7) });
  const granted = grant(before, { 1: Big.from(50) }, data);
  expect(granted).toEqual(held({ 1: Big.from(150), 2: Big.from(7) }));
  expect(granted.equipment).toBe(before.equipment);
  expect(before.items).toEqual({ 1: Big.from(100), 2: Big.from(7) });
  expect(grant(held(NO_ITEMS), { 2: Big.parse("1.5e40") }, data).items).toEqual({ 2: Big.parse("1.5e40") });
});

test("granting nothing new returns the same holdings", () => {
  const before = held({ 1: Big.from(100) });
  expect(grant(before, NO_ITEMS, data)).toBe(before);
  expect(grant(before, { 2: Big.ZERO }, data)).toBe(before);
  const full = held({ [STONE]: Big.from(999) });
  expect(grant(full, { [STONE]: Big.from(5) }, data)).toBe(full);
});

test("an item over its cap keeps only up to the cap", () => {
  expect(grant(held({ [STONE]: Big.from(990) }), { [STONE]: Big.from(20) }, data).items).toEqual({ [STONE]: Big.from(999) });
  expect(grant(held(NO_ITEMS), { [STONE]: Big.from(5000), 1: Big.from(5000) }, data).items).toEqual({ 1: Big.from(5000), [STONE]: Big.from(999) });
  // 상한이 낮아지기 전에 넘게 가진 것은 줄이지 않는다.
  const over = held({ [STONE]: Big.from(1500) });
  expect(grant(over, { [STONE]: Big.from(1) }, data)).toBe(over);
});

test("granting an item that is not in Items throws", () => {
  expect(() => grant(held(NO_ITEMS), { 9999: Big.from(1) }, data)).toThrow("Unknown item 9999.");
});

test("equipment rewards become instances numbered in order, not amounts", () => {
  const before = held({ 1: Big.from(10) });
  const after = addReward(before, [RING, 1, RING], [Big.from(2), Big.from(5), Big.from(1.9)], data);
  expect(after.items).toEqual({ 1: Big.from(15) });
  expect(after.equipment).toEqual({ nextId: 4, owned: { 1: { itemId: RING, enhance: 0 }, 2: { itemId: RING, enhance: 0 }, 3: { itemId: RING, enhance: 0 } }, equipped: {} });
  // 장비만 받으면 수량은 같은 객체다.
  expect(addReward(before, [RING], [Big.from(1)], data).items).toBe(before.items);
  expect(grant(after, { [RING]: Big.from(1) }, data).equipment.owned[4]).toEqual({ itemId: RING, enhance: 0 });
});

test("equipment keeps only up to its item's cap and the bag's cap, and ids are never reused", () => {
  const sword = addReward(held(NO_ITEMS), [SWORD, SWORD], [Big.from(1), Big.from(1)], data);
  expect(sword.equipment).toEqual({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 0 } }, equipped: {} });
  expect(grant(sword, { [SWORD]: Big.from(1) }, data)).toBe(sword);
  // 가방이 차면 상한 없는 장비도 버린다.
  const full = grant(held(NO_ITEMS), { [RING]: Big.from(EQUIPMENT_CAP + 5) }, data);
  expect(Object.keys(full.equipment.owned)).toHaveLength(EQUIPMENT_CAP);
  expect(full.equipment.nextId).toBe(EQUIPMENT_CAP + 1);
  expect(grant(full, { [RING]: Big.from(1) }, data)).toBe(full);
  // 잃은 장비가 있어도(장차 분해) 다음 ID는 이어서 매긴다.
  const lost = { ...full.equipment, owned: { 50: { itemId: RING, enhance: 0 } } };
  expect(grant(held(NO_ITEMS, lost), { [RING]: Big.from(1) }, data).equipment.owned[EQUIPMENT_CAP + 1]).toEqual({ itemId: RING, enhance: 0 });
});

test("equipment without a slot is a data error", () => {
  expect(() => grant(held(NO_ITEMS), { [BROKEN]: Big.from(1) }, data)).toThrow(`Equipment item ${BROKEN} has no slot.`);
});
