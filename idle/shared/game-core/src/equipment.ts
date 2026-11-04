// 장비: Items의 종류가 장비인 행은 수량이 아니라 하나씩 다른 인스턴스로 가진다. 정의는 Items 행 하나이고 슬롯과
// 스탯도 그 행에서 읽으므로, 인스턴스에는 아이템 ID와 강화 단계만 둔다. 받는 길은 다른 아이템처럼 보상 지급(items.ts)이고,
// 강화와 합성(commands/equipment.ts)이 인스턴스를 바꾼다.
import { Big } from "@idle/big-number";
import type { GameData, ItemsRow, Stat } from "@idle/data-schema";
import { E_AbilityType } from "./ability-type.js";
import { NOBODY } from "./formula-owners.js";
import { Formula } from "./formulas.js";
import { required } from "./rows.js";

/** 가진 장비 하나. */
export interface EquipmentInstance {
  readonly itemId: number;
  /** 강화 단계. 0부터 그 아이템의 Items.enhanceMax까지다. */
  readonly enhance: number;
}

/** 가진 장비와 착용. */
export interface EquipmentState {
  /** 다음에 받는 장비의 ID. 1부터 오르고 다시 쓰지 않는다. 클라이언트와 서버가 같은 순서로 매긴다. */
  readonly nextId: number;
  /** 장비 ID → 인스턴스. */
  readonly owned: { readonly [equipmentId: number]: EquipmentInstance };
  /** 슬롯(Items.slot) → 착용한 장비 ID. 슬롯마다 하나다. */
  readonly equipped: { readonly [slot: number]: number };
}

export const NO_EQUIPMENT: EquipmentState = Object.freeze({ nextId: 1, owned: Object.freeze({}), equipped: Object.freeze({}) });

/** 장비 행의 슬롯. 슬롯이 없는 장비는 데이터 오류라서 던진다. */
export function slotOf(row: ItemsRow): number {
  if (row.slot === null) throw new Error(`Equipment item ${row.id} has no slot.`);
  return row.slot;
}

/** 장비 ID의 아이템 행. 가진 장비가 Items에 없으면 데이터 오류라서 던진다. */
export function equipmentRow(equipment: EquipmentState, equipmentId: number, data: GameData): ItemsRow {
  const instance = equipment.owned[equipmentId];
  if (instance === undefined) throw new Error(`Equipment ${equipmentId} is not owned.`);
  return required(data.items, instance.itemId, "item");
}

/**
 * 장비 `row`를 `amount`(내림)개 받는다. 그 아이템의 상한(Items.cap, 인스턴스 수)과 가방(Constants.equipmentCap)을
 * 넘친 것은 버리고, 받은 것이 없으면 `equipment`를 그대로 돌려준다.
 */
export function receive(equipment: EquipmentState, row: ItemsRow, amount: Big, data: GameData): EquipmentState {
  slotOf(row);
  const ids = Object.keys(equipment.owned);
  let count = Math.min(Big.toNumber(Big.floor(amount)), data.constants.equipmentCap - ids.length);
  if (row.cap !== null) {
    let held = 0;
    for (const id of ids) if (equipment.owned[Number(id)].itemId === row.id) held++;
    count = Math.min(count, Big.toNumber(row.cap) - held);
  }
  if (count <= 0) return equipment;
  const owned: { [equipmentId: number]: EquipmentInstance } = { ...equipment.owned };
  let nextId = equipment.nextId;
  for (let i = 0; i < count; i++) owned[nextId++] = { itemId: row.id, enhance: 0 };
  return { ...equipment, nextId, owned };
}

// 강화 공식은 능력치를 읽지 않고 입력(단계, 행의 스탯)만 읽는다(NOBODY).

/** 장비 행의 스탯 하나를 강화 단계만큼 키운 값(enhanceStat 공식). 행의 칸이 비었으면 null이다. */
export function equipmentStat(row: ItemsRow, enhance: number, stat: Stat.MaxHp | Stat.Attack | Stat.Defense): Big | null {
  const base = row[stat];
  return base === null ? null : Formula.get(E_AbilityType.enhanceStat, NOBODY, NOBODY, { base, step: enhance });
}

/** 강화 단계 `enhance`에서 한 단계 올리는 골드(enhanceCost 공식). */
export function enhanceCost(enhance: number): Big {
  return Formula.get(E_AbilityType.enhanceCost, NOBODY, NOBODY, { step: enhance });
}

/**
 * `equipmentId`를 합성할 때 쓰는 재료: 그 장비와, 같은 아이템의 나머지 중 입지 않은 것 → 강화 단계가 낮은 것 → ID가 작은 것
 * 순서로 Items.mergeCount − 1개. 입은 장비는 고르거나 모자랄 때만 쓴다. 모자라거나 합성할 수 없는 아이템이면 undefined다.
 */
export function mergeMaterials(equipment: EquipmentState, equipmentId: number, data: GameData): number[] | undefined {
  const row = equipmentRow(equipment, equipmentId, data);
  if (row.mergeItemId === null || row.mergeCount === null) return undefined;
  const { owned } = equipment;
  const worn = new Set(Object.values(equipment.equipped));
  const others = Object.keys(owned).map(Number)
    .filter(id => id !== equipmentId && owned[id].itemId === row.id)
    .sort((a, b) => Number(worn.has(a)) - Number(worn.has(b)) || owned[a].enhance - owned[b].enhance || a - b);
  return others.length + 1 < row.mergeCount ? undefined : [equipmentId, ...others.slice(0, row.mergeCount - 1)];
}
