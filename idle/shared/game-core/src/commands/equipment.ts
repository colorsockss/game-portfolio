import { GameErrorCode, type Opcode } from "@idle/codes";
import type { GameData, ItemsRow } from "@idle/data-schema";
import type { CommandOf } from "../command.js";
import { enhanceCost, equipmentRow, mergeMaterials, slotOf, type EquipmentState } from "../equipment.js";
import { spend } from "../items.js";
import type { PlayerState } from "../state.js";
import { fail, ok, refit, type CommandHandler, type CommandResult } from "./types.js";

// 착용, 해제, 입은 장비의 강화·합성은 능력치를 바꾸므로 `now`의 틱까지 확정한 상태에서 그 틱의 새 능력치로 전투를 이어 간다
// (`refit`: 싸우던 웨이브와 적, 재사용 대기는 그대로, 최대 HP가 오른 만큼 HP도 오름). 입지 않은 장비의 강화·합성도 골드와
// 재료는 확정한 보유량에서 본다.
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
    return settled.equipment.equipped[slotOf(row)] === id ? refit(settled, player, data) : ok(player);
  });

/**
 * 이 장비와 같은 장비(mergeMaterials가 고른 재료)를 합쳐 다음 등급(Items.mergeItemId) 장비 하나를 +0으로 새 ID에 만든다.
 * 재료의 강화 단계는 사라진다. 재료 중 입은 것이 있으면 결과를 그 슬롯에 입는다(다음 등급은 같은 슬롯이다).
 */
export const mergeItem: CommandHandler<CommandOf<Opcode.ItemMerge>> = (settled, { equipmentId }, { data }) =>
  withOwned(settled, equipmentId, data, (id, row) => {
    if (row.mergeItemId === null) return fail(GameErrorCode.EquipmentNotMergeable, `Item ${row.id} has no next grade.`);
    const used = mergeMaterials(settled.equipment, id, data);
    if (!used) return fail(GameErrorCode.MergeMaterialsShort, `Merging item ${row.id} needs ${row.mergeCount} of it.`);
    const slot = slotOf(row);
    const result = data.items.get(row.mergeItemId);
    if (result === undefined || slotOf(result) !== slot) throw new Error(`Item ${row.id} merges into ${row.mergeItemId}, not equipment of slot ${slot}.`);
    const { nextId, equipped } = settled.equipment;
    const owned = { ...settled.equipment.owned };
    for (const material of used) delete owned[material];
    owned[nextId] = { itemId: result.id, enhance: 0 };
    const worn = used.includes(equipped[slot]);
    const player = withEquipment(settled, { nextId: nextId + 1, owned, equipped: worn ? { ...equipped, [slot]: nextId } : equipped });
    return worn ? refit(settled, player, data) : ok(player);
  });
