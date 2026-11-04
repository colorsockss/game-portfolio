// 보상과 보유량: 둘 다 아이템(Items.id)별 수량이다. 골드와 경험치도 Items의 행이라서, 보상을 받는 길은
// 지급 하나다. 전투는 처치마다 addReward로, 오프라인 보상은 grant로 지급한다. 장비인 행은 수량이 아니라
// 인스턴스로 받는다(equipment.ts).
import { Big } from "@idle/big-number";
import { ItemKind, type GameData, type ItemsRow } from "@idle/data-schema";
import { receive } from "./equipment.js";
import { required } from "./rows.js";
import type { PlayerState } from "./state.js";

/** 아이템(Items.id)별 수량. 키가 없으면 0이다. 저장 데이터의 보유량과 보상이 같은 모양을 쓴다. */
export type ItemAmounts = { readonly [itemId: number]: Big };

/** 보상을 받는 곳: 쌓이는 아이템의 수량과 장비. 한 아이템은 종류에 따라 둘 중 한 곳에만 있다. */
export type Holdings = Pick<PlayerState, "items" | "equipment">;

export const NO_ITEMS: ItemAmounts = Object.freeze({});

/**
 * 보유량에서 쓴 만큼 뺀다(레벨업의 경험치, 강화와 스킬의 비용). m × 10^e의 가수는 이진수로 정확하지 않아 가까운 두 정수를
 * Big.sub로 빼면 내림의 허용치보다 크게 어긋난다(230 − 100 − 120이 9.99…가 되어 내림하면 9). 그래서 double이 정확히 담는
 * 정수 범위에서는 double로 뺀다.
 */
export function minus(held: Big, amount: Big): Big {
  const value = Big.toNumber(held);
  return value <= Number.MAX_SAFE_INTEGER ? Big.from(value - Big.toNumber(amount)) : Big.floor(Big.sub(held, amount));
}

function rowOf(id: number, data: GameData): ItemsRow {
  return required(data.items, id, "item");
}

// 보유 `held`에 `amount`를 더한 값. 수량은 정수라서 더할 때마다 내림해 반올림 오차가 쌓이지 않게 한다.
// 상한(Items.cap)을 넘친 만큼은 버리고, 상한이 낮아져 이미 넘게 가진 것은 줄이지 않는다.
function added(held: Big, row: ItemsRow, amount: Big): Big {
  const next = Big.floor(Big.add(held, amount));
  return row.cap === null ? next : Big.min(next, Big.max(held, row.cap));
}

/**
 * 테이블 행의 보상 열(같은 순서의 아이템 ID 목록과 수량 목록)을 지급한다. 골드(Constants.goldItemId)의 수량에는 `goldRate`(환생
 * 배율)를 곱한다. 보상이 비었으면 `held`를 그대로 돌려주고, 바뀌지 않은 쪽은 같은 객체다. 전투가 처치마다 부르므로 수량은 새
 * 객체 하나에 모아 더한다. 없는 아이템은 데이터 오류라서 던진다.
 */
export function addReward(
  held: Holdings, ids: readonly number[], amounts: readonly Big[], data: GameData, goldRate: Big = Big.ONE,
): Holdings {
  if (ids.length !== amounts.length) {
    throw new Error(`A reward has ${ids.length} item ids but ${amounts.length} amounts.`);
  }
  if (ids.length === 0) return held;
  let sum: { [itemId: number]: Big } | undefined;
  let equipment = held.equipment;
  for (let i = 0; i < ids.length; i++) {
    const row = rowOf(ids[i], data);
    if (row.kind === ItemKind.Equipment) {
      equipment = receive(equipment, row, amounts[i], data);
    } else {
      sum ??= { ...held.items };
      const amount = ids[i] === data.constants.goldItemId ? Big.mul(amounts[i], goldRate) : amounts[i];
      sum[ids[i]] = added(sum[ids[i]] ?? Big.ZERO, row, amount);
    }
  }
  return { items: sum ?? held.items, equipment };
}

/** 보유량에서 `itemId`를 `amount`만큼 쓴다. 모자라면 undefined다. */
export function spend(items: ItemAmounts, itemId: number, amount: Big): ItemAmounts | undefined {
  const held = items[itemId] ?? Big.ZERO;
  return Big.lt(held, amount) ? undefined : { ...items, [itemId]: minus(held, amount) };
}

/** 보상을 지급한다. 바뀌지 않은 쪽은 같은 객체이므로 그 슬라이스를 다시 보내지 않는다. */
export function grant(held: Holdings, reward: ItemAmounts, data: GameData): Holdings {
  let { items, equipment } = held;
  // 정수 키는 오름차순으로 순회되므로 어느 호스트에서든 같은 순서로 더한다.
  for (const key of Object.keys(reward)) {
    const id = Number(key);
    const row = rowOf(id, data);
    if (row.kind === ItemKind.Equipment) {
      equipment = receive(equipment, row, reward[id], data);
      continue;
    }
    const before = held.items[id] ?? Big.ZERO;
    const next = added(before, row, reward[id]);
    if (!Big.eq(next, before)) items = { ...items, [id]: next };
  }
  return items === held.items && equipment === held.equipment ? held : { items, equipment };
}
