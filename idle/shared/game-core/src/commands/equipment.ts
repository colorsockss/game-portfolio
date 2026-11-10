import { GameErrorCode, type Opcode } from "@idle/codes";
import type { GameData, ItemsRow } from "@idle/data-schema";
import type { CommandOf } from "../command.js";
import { enhanceCost, equipmentRow, mergeMaterials, nextMerge, slotOf, type EquipmentState } from "../equipment.js";
import { spend } from "../items.js";
import type { PlayerState } from "../state.js";
import { fail, ok, refit, type CommandHandler, type CommandResult } from "./types.js";

// 착용, 해제, 입은 장비의 강화·합성은 능력치를 바꾸므로 `now`의 틱까지 확정한 상태에서 그 틱의 새 능력치로 전투를 이어 간다
// (`refit`: 싸우던 웨이브와 적, 재사용 대기는 그대로). 되돌릴 수 없는 강화·합성은 최대 HP가 오른 만큼 HP도 올리고, 착용·해제는
// HP를 새 최대 HP로 자르기만 한다(올리면 벗고 입기를 되풀이해 회복한다). 입지 않은 장비의 강화·합성도 골드와 재료는 확정한
// 보유량에서 본다.
//
// 강화에는 실패 확률이 없다. 클라이언트가 결과를 예측하려면 난수의 상태를 알아야 하는데, 그러면 고친 클라이언트가 다음
// 결과를 미리 보고 실패할 차례를 싼 장비로 넘길 수 있다(MANUAL의 장비 강화·합성).

/**
 * 확정한 저장 데이터에서 장비의 행을 찾아 `change`에 넘긴다. 확정이 막 지급한 장비도 고를 수 있다. 네트워크에서 온 값이므로
 * 정수이고 가진 장비의 키인지 본다(`constructor` 같은 키는 프로토타입에 있다).
 */
function withOwned(
  settled: PlayerState, equipmentId: unknown, data: GameData, change: (id: number, row: ItemsRow) => CommandResult,
): CommandResult {
  const { owned } = settled.equipment;
  if (!Number.isSafeInteger(equipmentId) || !Object.prototype.hasOwnProperty.call(owned, equipmentId as number)) {
    return fail(GameErrorCode.EquipmentNotFound, `Equipment ${String(equipmentId)} is not owned.`);
  }
  const id = equipmentId as number;
  return change(id, equipmentRow(settled.equipment, id, data));
}

function withEquipment(settled: PlayerState, equipment: Partial<EquipmentState>): PlayerState {
  return { ...settled, equipment: { ...settled.equipment, ...equipment } };
}

/** 그 슬롯에 장비를 착용한다(있던 것은 벗는다). 이미 착용했으면 확정만 한다. */
export const equipItem: CommandHandler<CommandOf<Opcode.ItemEquip>> = (settled, { equipmentId }, { data }) =>
  withOwned(settled, equipmentId, data, (id, row) => {
    const slot = slotOf(row);
    const { equipped } = settled.equipment;
    return equipped[slot] === id ? ok(settled) : refit(settled, withEquipment(settled, { equipped: { ...equipped, [slot]: id } }), data);
  });

/** 장비를 벗는다. 착용하지 않은 장비면 확정만 한다. */
export const unequipItem: CommandHandler<CommandOf<Opcode.ItemUnequip>> = (settled, { equipmentId }, { data }) =>
  withOwned(settled, equipmentId, data, (id, row) => {
    const { [slotOf(row)]: worn, ...rest } = settled.equipment.equipped;
    return worn === id ? refit(settled, withEquipment(settled, { equipped: rest }), data) : ok(settled);
  });

/** 장비를 한 단계 강화한다. 비용(enhanceCost 공식)은 골드(Constants.goldItemId)로 내고, 최대 단계는 Items.enhanceMax다. */
export const enhanceItem: CommandHandler<CommandOf<Opcode.ItemEnhance>> = (settled, { equipmentId }, { data }) =>
  withOwned(settled, equipmentId, data, (id, row) => {
    const instance = settled.equipment.owned[id];
    if (instance.enhance >= (row.enhanceMax ?? 0)) {
      return fail(GameErrorCode.EquipmentMaxEnhance, `Equipment ${id} is at its highest enhancement ${instance.enhance}.`);
    }
    const items = spend(settled.items, data.constants.goldItemId, enhanceCost(instance.enhance));
    if (!items) return fail(GameErrorCode.NotEnoughGold, `Enhancing equipment ${id} needs more gold.`);
    const player = withEquipment(
      { ...settled, items },
      { owned: { ...settled.equipment.owned, [id]: { ...instance, enhance: instance.enhance + 1 } } },
    );
    return settled.equipment.equipped[slotOf(row)] === id ? refit(settled, player, data, true) : ok(player);
  });

/**
 * 합성 하나(ItemMerge와 ItemMergeAll이 함께 쓴다): 재료(mergeMaterials의 결과, 첫째가 고른 장비)를 지우고 다음 등급
 * (Items.mergeItemId) 장비 하나를 +0으로 새 ID(`nextId`)에 만든다. 재료의 강화 단계는 사라진다. 재료 중 입은 것이 있으면 결과를 그
 * 슬롯에 입고(다음 등급은 같은 슬롯이다) `worn`이 참이다. 전투는 부르는 쪽이 이어 간다.
 */
function merge(state: PlayerState, used: readonly number[], data: GameData): { readonly player: PlayerState; readonly worn: boolean } {
  const row = equipmentRow(state.equipment, used[0], data);
  const slot = slotOf(row);
  const result = row.mergeItemId === null ? undefined : data.items.get(row.mergeItemId);
  if (result === undefined || slotOf(result) !== slot) throw new Error(`Item ${row.id} merges into ${row.mergeItemId}, not equipment of slot ${slot}.`);
  const { nextId, equipped } = state.equipment;
  const owned = { ...state.equipment.owned };
  for (const material of used) delete owned[material];
  owned[nextId] = { itemId: result.id, enhance: 0 };
  const worn = used.includes(equipped[slot]);
  return { player: withEquipment(state, { nextId: nextId + 1, owned, equipped: worn ? { ...equipped, [slot]: nextId } : equipped }), worn };
}

/** 이 장비와 같은 장비(mergeMaterials가 고른 재료)를 합쳐 다음 등급 장비 하나로 만든다(merge). */
export const mergeItem: CommandHandler<CommandOf<Opcode.ItemMerge>> = (settled, { equipmentId }, { data }) =>
  withOwned(settled, equipmentId, data, (id, row) => {
    if (row.mergeItemId === null) return fail(GameErrorCode.EquipmentNotMergeable, `Item ${row.id} has no next grade.`);
    const used = mergeMaterials(settled.equipment, id, data);
    if (!used) return fail(GameErrorCode.MergeMaterialsShort, `Merging item ${row.id} needs ${row.mergeCount} of it.`);
    const { player, worn } = merge(settled, used, data);
    return worn ? refit(settled, player, data, true) : ok(player);
  });

/**
 * 재료가 모인 장비를 남김없이 합성한다: 다음 합성(nextMerge)을 ItemMerge와 같은 merge로 하나씩, 남은 것이 없을 때까지. 결과로 다시
 * 모인 것도 합성한다. 전투는 입은 장비를 썼을 때만 누른 틱에서 한 번 이어 가고(합성마다 이으면 최대 HP가 줄었다 오르는 합성들이 HP를
 * 더 올린다), 합성할 것이 없으면 거절한다. 합성에는 비용이 없어 중간에 멈추지 않는다.
 */
export const mergeAllItems: CommandHandler<CommandOf<Opcode.ItemMergeAll>> = (settled, _, { data }) => {
  let player = settled;
  let worn = false;
  // 합성마다 장비가 mergeCount − 1(데이터가 2 이상으로 검사)개 이상 줄므로 처음 가진 수만큼 합성하기 전에 끝난다. 데이터가
  // 틀려도(mergeCount 1의 순환) 여기서 멈춘다.
  for (let left = Object.keys(settled.equipment.owned).length; left > 0; left--) {
    const used = nextMerge(player.equipment, data);
    if (!used) break;
    const merged = merge(player, used, data);
    player = merged.player;
    worn ||= merged.worn;
  }
  if (player === settled) return fail(GameErrorCode.MergeMaterialsShort, "No equipment has enough of the same piece to merge.");
  return worn ? refit(settled, player, data, true) : ok(player);
};
