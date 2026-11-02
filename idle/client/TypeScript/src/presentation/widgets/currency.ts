import { Big } from "@idle/big-number";
import { ItemKind, type GameData } from "@idle/data-schema";
import type { ItemAmounts } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
/** 재화 바의 한 칸: 이름이나 아이콘, 굴러가는 수량. 장비의 능력치 칸도 같은 칸이다. */
export interface Currency {
  /** 지금 언어의 이름. 재화 바는 아이콘이 대신하므로 비어 있다. */
  readonly name: ReadonlySignal<string> | string;
  /** 아이콘 이름(Items.icon). 아이콘이 없는 칸(능력치)은 비어 있다. */
  readonly icon: string;
  readonly amount: ReadonlySignal<Big>;
}

/** 재화 바: 화면 위쪽에 보이는 재화의 수량. 처치마다 굴러간다. */
export interface CurrencyBarViewModel {
  /** `Items.kind`가 재화인 아이템을 ID 순서로. 테이블에서 정해지므로 화면이 열려 있는 동안 그대로다. */
  readonly currencies: readonly Currency[];
}

export interface CurrencyBarViewModelOptions {
  readonly data: GameData;
  /** 보이는 보유량(전투 서비스의 `items`). */
  readonly items: ReadonlySignal<ItemAmounts>;
}

export function createCurrencyBarViewModel({ data, items }: CurrencyBarViewModelOptions): CurrencyBarViewModel {
  // 경험치도 재화 종류지만 레벨이 쓰고 제목과 경험치 막대가 보이므로 뺀다.
  const rows = [...data.items.values()]
    .filter(row => row.kind === ItemKind.Currency && row.id !== data.constants.expItemId)
    .sort((a, b) => a.id - b.id);
  return {
    // 보유량은 바뀐 아이템만 새 값이므로, 그 재화가 그대로인 처치는 알리지 않는다.
    currencies: rows.map(row => ({ name: "", icon: row.icon, amount: computed(() => items.value[row.id] ?? Big.ZERO) })),
  };
}
