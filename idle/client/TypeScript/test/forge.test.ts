import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { EquipSlot, loadGameData } from "@idle/data-schema";
import { applyCommand, type BattleSnapshot, type EquipmentState, type ItemAmounts, type PlayerState } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import { signal } from "@preact/signals-core";
import { expect, test, vi } from "vitest";
import type { Commands } from "../src/application/progress/progress.js";
import { createAppState } from "../src/application/state/app-state.js";
import { createEquipmentBadges, createEquipmentViewModel } from "../src/presentation/view-models/equipment.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t } = texts(data);
const GOLD = data.constants.goldItemId;

function setUp(equipment: EquipmentState, gold = 0) {
  const player = testPlayer(data, 0, { items: { [GOLD]: Big.from(gold) }, equipment });
  const state = createAppState({ flow: "main", player });
  const items = signal<ItemAmounts>(player.items);
  const sent: string[] = [];
  // progress처럼 규칙을 바로 화면의 저장 데이터에 적용하고, 거절은 오류로 이행한다.
  const send = (type: Opcode) => async ({ equipmentId }: { equipmentId: number }) => {
    sent.push(`${Opcode[type]} ${equipmentId}`);
    const result = applyCommand(state.player.value!, { type, equipmentId } as never, { now: 0, data });
    if (!result.ok) return result.error;
    state.player.value = result.state;
    items.value = result.state.items;
    return undefined;
  };
  const cmd = {
    ItemEquip: send(Opcode.ItemEquip), ItemUnequip: send(Opcode.ItemUnequip), ItemEnhance: send(Opcode.ItemEnhance), ItemMerge: send(Opcode.ItemMerge),
  } as unknown as Commands;
  const badges = createEquipmentBadges({ state, data });
  const vm = createEquipmentViewModel({
    state, data, t, battle: { snapshot: signal<BattleSnapshot | undefined>(undefined), items }, progress: { cmd }, badges,
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }, close() {},
  });
  const entry = (equipmentId: number) => vm.entries.value.find(found => found.equipmentId === equipmentId)!;
  return { state, items, sent, badges, vm, entry, player: () => state.player.value as PlayerState };
}

const SWORD = 101;
const SHARP_SWORD = 107;

test("a row names its step and shows the enhanced stats, and a higher step of what is worn is better", () => {
  const t = setUp({ nextId: 3, owned: { 1: { itemId: SWORD, enhance: 0 }, 2: { itemId: SWORD, enhance: 3 } }, equipped: { 1: 1 } });
  expect(t.vm.entries.value.map(({ name, detail, state }) => [name, detail, state])).toEqual([
    ["낡은 검", "무기 · 공격 +5", "착용 중"],
    ["낡은 검 +3", "무기 · 공격 +8", "더 좋음"],
  ]);
  expect([...t.badges.better.value]).toEqual([[2, EquipSlot.Weapon]]);
  // 강화한 것을 입으면 +0은 더 좋지 않다.
  t.state.player.value = { ...t.player(), equipment: { ...t.player().equipment, equipped: { 1: 2 } } };
  expect(t.badges.any.value).toBe(false);
});

test("the forge shows the chosen piece's step and cost, and enhances it while the shown gold lasts", () => {
  const t = setUp({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 0 } }, equipped: {} }, 1000);
  const { forge } = t.vm;
  // 입은 것이 없으면 처음 가진 장비를 골라 둔다.
  expect(t.entry(1).selected).toBe(true);
  expect([forge.visible.value, forge.name.value, forge.detail.value, forge.step.value]).toEqual([true, "낡은 검", "무기 · 공격 +5", "강화 0/10"]);
  expect(forge.enhanceCost.value).toEqual(Big.from(500));
  expect(forge.canEnhance.value).toBe(true);

  forge.enhance();
  expect(t.sent).toEqual(["ItemEnhance 1"]);
  expect([forge.name.value, forge.detail.value, forge.step.value]).toEqual(["낡은 검 +1", "무기 · 공격 +6", "강화 1/10"]);
  // 남은 500은 +1 → +2의 750에 모자란다.
  expect(forge.enhanceCost.value).toEqual(Big.from(750));
  expect(forge.canEnhance.value).toBe(false);
  t.items.value = { [GOLD]: Big.from(750) };
  expect(forge.canEnhance.value).toBe(true);

  // 최대 단계에서는 비용이 0이고 강화할 수 없다.
  t.state.player.value = { ...t.player(), equipment: { ...t.player().equipment, owned: { 1: { itemId: SWORD, enhance: 10 } } } };
  expect([forge.step.value, Big.toNumber(forge.enhanceCost.value), forge.canEnhance.value]).toEqual(["강화 10/10", 0, false]);
});

test("the forge merges once enough of the same piece is held, then chooses the result", () => {
  const t = setUp({ nextId: 4, owned: { 1: { itemId: SWORD, enhance: 2 }, 2: { itemId: SWORD, enhance: 0 } }, equipped: { 1: 1 } });
  const { forge } = t.vm;
  t.entry(1).select();
  expect([forge.mergeable.value, forge.mergeCount.value, forge.mergeInto.value, forge.canMerge.value])
    .toEqual([true, "같은 장비 2/3", "합성하면 날 선 검", false]);
  expect(forge.worn.value).toBe(true);

  t.state.player.value = { ...t.player(), equipment: { ...t.player().equipment, owned: { ...t.player().equipment.owned, 3: { itemId: SWORD, enhance: 0 } } } };
  expect([forge.mergeCount.value, forge.canMerge.value]).toEqual(["같은 장비 3/3", true]);
  forge.merge();
  expect(t.sent).toEqual(["ItemMerge 1"]);
  expect(t.player().equipment).toEqual({ nextId: 5, owned: { 4: { itemId: SHARP_SWORD, enhance: 0 } }, equipped: { 1: 4 } });
  // 결과를 고른다. 날 선 검은 마지막 등급이다.
  expect([forge.name.value, forge.step.value, forge.mergeable.value, forge.mergeCount.value, forge.canMerge.value])
    .toEqual(["날 선 검", "강화 0/20", false, "", false]);
  expect(t.entry(4).selected).toBe(true);

  forge.toggle();
  expect(t.sent.at(-1)).toBe("ItemUnequip 4");
  expect(forge.worn.value).toBe(false);
});

test("the forge lets go of a piece that is gone", () => {
  const t = setUp({ nextId: 2, owned: { 1: { itemId: SWORD, enhance: 0 } }, equipped: {} });
  t.entry(1).select();
  t.state.player.value = { ...t.player(), equipment: { nextId: 2, owned: {}, equipped: {} } };
  expect([t.vm.forge.visible.value, t.vm.forge.name.value, t.vm.forge.canMerge.value]).toEqual([false, "", false]);
  // 고른 것이 없으면 보내지 않는다.
  t.vm.forge.enhance();
  t.vm.forge.merge();
  expect(t.sent).toEqual([]);
});
