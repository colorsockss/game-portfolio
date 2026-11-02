import { Big } from "@idle/big-number";
import { ItemKind, type GameData } from "@idle/data-schema";
import type { ItemAmounts } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import { formatBig } from "../format/big.js";
import type { TextKey, Translate } from "../text.js";
import { localTabs, type Tabs } from "./tabs.js";

/** 가방의 종류 탭(Items.kind)과 그 이름. `null`은 전체다. 장비는 수량이 아니라 장비 화면에 보인다. */
const KIND_TABS: readonly (readonly [ItemKind | null, TextKey])[] = [
  [null, "common.all"],
  [ItemKind.Currency, "inventory.currency"],
  [ItemKind.Material, "inventory.material"],
];

/** 가방 칸 하나. */
export interface ItemSlot {
  /** 아이콘 이름(Items.icon). 테이블에 없는 아이템은 비어 있다. */
  readonly icon: string;
  /** Items 테이블의 이름(지금 언어). */
  readonly name: string;
  /** 큰 수 표기의 수량. */
  readonly amount: string;
}

/** 가방 화면: 보이는 보유량의 아이템을 고른 종류 탭에서 칸마다 하나씩. */
export interface InventoryViewModel {
  /** 종류 탭. 처음에는 전체다. */
  readonly tabs: Tabs<ItemKind | null>;
  /** 고른 종류의 가진 아이템(수량이 0보다 큰 것)을 ID 순서로. 처치와 정산, 탭을 바꿀 때 바뀐다. */
  readonly slots: ReadonlySignal<readonly ItemSlot[]>;
  close(): void;
}

export interface InventoryViewModelOptions {
  readonly data: GameData;
  readonly t: Translate;
  /** 보이는 보유량(전투 서비스의 `items`). */
  readonly items: ReadonlySignal<ItemAmounts>;
  readonly close: () => void;
}

export function createInventoryViewModel({ data, t, items, close }: InventoryViewModelOptions): InventoryViewModel {
  const tabs = localTabs(KIND_TABS.map(([key, text]) => ({ key, label: computed(() => t(text)) })), null);
  return {
    tabs,
    // 정수 키는 오름차순으로 순회되므로 칸은 ID 순서다. 테이블에 없는 아이템은 전체에만 ID로 보인다.
    slots: computed(() => {
      const kind = tabs.selected.value;
      return Object.entries(items.value).flatMap(([id, amount]) => {
        const row = data.items.get(Number(id));
        if (Big.sign(amount) <= 0 || (kind !== null && row?.kind !== kind)) return [];
        return [{ icon: row?.icon ?? "", name: row ? t(row.nameKey) : id, amount: formatBig(amount) }];
      });
    }),
    close,
  };
}
