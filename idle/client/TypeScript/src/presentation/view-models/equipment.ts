import { Big } from "@idle/big-number";
import { EquipSlot, Stat, type GameData, type ItemsRow } from "@idle/data-schema";
import {
  enhanceCost, equipmentStat, heroStats, mergeMaterials, type CombatStats, type EquipmentInstance, type EquipmentState,
} from "@idle/game-core";
import { computed, signal, type ReadonlySignal, type Signal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { Logger } from "../../application/ports.js";
import { unsent, type Progress } from "../../application/progress/progress.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import type { TextKey, Translate } from "../text.js";
import { anyOf, type Badge } from "../widgets/badge.js";
import type { Currency } from "../widgets/currency.js";
import { localTabs, type Tabs } from "./tabs.js";

/** 슬롯 탭(Items.slot)과 그 이름. `null`은 전체다. 장비 화면은 슬롯마다 탭이 있고, 탭의 이름이 슬롯의 이름이다. */
const SLOT_TABS: readonly (readonly [EquipSlot | null, TextKey])[] = [
  [null, "common.all"],
  [EquipSlot.Weapon, "equipment.weapon"],
  [EquipSlot.Armor, "equipment.armor"],
  [EquipSlot.Accessory, "equipment.accessory"],
];

/** 장비 행의 스탯 열과 그 이름. 능력치 줄도 같은 이름을 쓴다. */
const STATS: readonly { readonly stat: Stat.Attack | Stat.Defense | Stat.MaxHp; readonly label: TextKey }[] = [
  { stat: Stat.Attack, label: "stat.attack" },
  { stat: Stat.Defense, label: "stat.defense" },
  { stat: Stat.MaxHp, label: "stat.maxHp" },
];

/** 슬롯마다의 뱃지와 그 슬롯의 탭에 쓰는 슬롯. */
const SLOTS = SLOT_TABS.flatMap(([key]) => (key === null ? [] : [key]));

/** 장비의 알림 뱃지 트리: 입은 것보다 좋은 장비(목록의 칸) → 슬롯(슬롯 탭) → 어느 슬롯이든(메인의 장비 버튼, 전체 탭). */
export interface EquipmentBadges {
  /** 입은 것보다 좋은 가진 장비: 장비 ID → 슬롯. */
  readonly better: ReadonlySignal<ReadonlyMap<number, EquipSlot>>;
  readonly slots: Readonly<Record<EquipSlot, Badge>>;
  readonly any: Badge;
}

/** 가진 장비 하나와 그 행. */
interface Piece {
  readonly row: ItemsRow;
  readonly enhance: number;
}

// 강화 단계를 반영한 스탯. 빈 칸은 0이다.
const statOf = (piece: Piece | undefined, stat: (typeof STATS)[number]["stat"]) =>
  (piece && equipmentStat(piece.row, piece.enhance, stat)) ?? Big.ZERO;

// 입은 것(없으면 모두 0)보다 강화 단계를 반영한 모든 스탯이 같거나 크고 하나는 크다. 스탯 사이의 가중치(전투력)는 게임에
// 정의가 없으므로, 하나는 오르고 하나는 내리는 장비는 더 좋다고 하지 않는다.
function isBetter(piece: Piece, worn: Piece | undefined): boolean {
  return STATS.every(({ stat }) => Big.gte(statOf(piece, stat), statOf(worn, stat)))
    && STATS.some(({ stat }) => Big.gt(statOf(piece, stat), statOf(worn, stat)));
}

// 테이블에 없는 아이템은 undefined다.
function pieceOf(instance: EquipmentInstance | undefined, data: GameData): Piece | undefined {
  const row = instance && data.items.get(instance.itemId);
  return row && { row, enhance: instance.enhance };
}

/**
 * 저장 데이터의 장비로 장비 뱃지를 계산한다. 메인 화면이 만들어 장비 버튼과 장비 화면이 같은 트리를 본다. 상태에서
 * 계산하므로 "본 적 있음" 같은 저장할 것이 없다.
 */
export function createEquipmentBadges({ state, data }: { readonly state: AppState; readonly data: GameData }): EquipmentBadges {
  const equipment = computed(() => state.player.value?.equipment);
  const better = computed(() => {
    const held = equipment.value;
    const found = new Map<number, EquipSlot>();
    if (!held) return found;
    const worn = new Set(Object.values(held.equipped));
    for (const [key, instance] of Object.entries(held.owned)) {
      const piece = pieceOf(instance, data);
      if (!piece || piece.row.slot === null || worn.has(Number(key))) continue;
      const wornId = held.equipped[piece.row.slot];
      if (isBetter(piece, wornId === undefined ? undefined : pieceOf(held.owned[wornId], data))) found.set(Number(key), piece.row.slot);
    }
    return found;
  });
  const slots = Object.fromEntries(
    SLOTS.map(slot => [slot, computed(() => [...better.value.values()].includes(slot))]),
  ) as Record<EquipSlot, Badge>;
  return { better, slots, any: anyOf(Object.values(slots)) };
}

/** 장비 그리드의 칸 하나. */
export interface EquipmentEntry {
  /** 장비(인스턴스) ID. */
  readonly equipmentId: number;
  readonly worn: boolean;
  /** 입은 것보다 좋은 장비(뱃지의 잎)인지. 칸의 빨간 점이다. */
  readonly better: boolean;
  /** 고른 장비(강화·합성 패널의 장비)인지. */
  readonly selected: boolean;
  /** 아이콘 이름(Items.icon). */
  readonly icon: string;
  /** 칸의 등급 색 번호(Items.grade). */
  readonly tint: number;
  /** 강화 단계. 예: "+3"(+0이면 비어 있다). */
  readonly level: string;
  /** 같은 장비의 수 / 합성에 드는 수의 비율(0~1). 다음 장비가 없으면 0이다. */
  readonly count: number;
  /** "2/3"(같은 장비의 수/합성에 드는 수). 다음 장비가 없으면 비어 있다. */
  readonly countText: string;
  /** Items 테이블의 이름(지금 언어)과 강화 단계. 예: "낡은 검 +3"(+0이면 이름만). */
  readonly name: string;
  /** 슬롯과 강화 단계를 반영해 더하는 스탯. 예: "무기 · 공격 +8". */
  readonly detail: string;
  /** 입었으면 "착용 중", 입은 것보다 좋으면 "더 좋음"(뱃지의 잎), 아니면 비어 있다. */
  readonly state: string;
  /** 입었으면 벗고, 아니면 그 슬롯에 입는다. */
  toggle(): void;
  /** 이 장비를 강화·합성 패널에 고른다. */
  select(): void;
  /** 칸을 누른다: 고르고, 입지 않은 것이면 입는다. 벗기는 패널의 버튼이 한다. */
  tap(): void;
}

/** 고른 장비의 강화와 합성. 고른 장비가 없으면 글자는 비고 버튼은 꺼진다. */
export interface ForgeViewModel {
  /** 고른 장비가 있다. 패널을 보이고 숨긴다. */
  readonly visible: ReadonlySignal<boolean>;
  /** 칸과 같은 이름과 스탯: "낡은 검 +3", "무기 · 공격 +8". */
  readonly name: ReadonlySignal<string>;
  readonly detail: ReadonlySignal<string>;
  /** "강화 3/10". */
  readonly step: ReadonlySignal<string>;
  /** 한 단계 올리는 골드(enhanceCost 공식). 최대 단계면 0이다. */
  readonly enhanceCost: ReadonlySignal<Big>;
  /** 최대 단계가 아니고, 보이는 골드(`items`, 누른 틱까지 정산한 골드)가 비용 이상이다. 강화는 그 골드로 낸다. */
  readonly canEnhance: ReadonlySignal<boolean>;
  /** 다음 등급이 있다. 없으면 합성 줄을 숨긴다. */
  readonly mergeable: ReadonlySignal<boolean>;
  /** "같은 장비 2/3"(고른 것 포함)과 "합성하면 날 선 검". */
  readonly mergeCount: ReadonlySignal<string>;
  readonly mergeInto: ReadonlySignal<string>;
  /** 재료(Items.mergeCount)가 모였다. */
  readonly canMerge: ReadonlySignal<boolean>;
  /** 입었는지. 패널의 착용 버튼이 쓴다. */
  readonly worn: ReadonlySignal<boolean>;
  /** 패널의 착용 버튼 글자: 입었으면 "해제", 아니면 "장착". */
  readonly toggleLabel: ReadonlySignal<string>;
  /** 고른 장비를 입거나 벗는다(칸의 toggle과 같다). */
  toggle(): void;
  /** 한 단계 강화한다. 거절은 토스트(refused)가 알린다. */
  enhance(): void;
  /** 합성하고 결과(새 장비)를 고른다. */
  merge(): void;
}

/** 장비 화면: 영웅의 능력치, 고른 슬롯의 가진 장비, 누르면 입고 벗기. */
export interface EquipmentViewModel {
  /** 공격, 방어, HP. 보이는 전투의 레벨에 입은 장비와 강화를 더한 능력치라서 입고 벗거나 강화하거나 레벨이 오르면 굴러간다. */
  readonly stats: readonly Currency[];
  /** 슬롯 탭. 처음에는 전체다. 더 좋은 장비가 있는 슬롯의 탭에 뱃지가 있다. */
  readonly tabs: Tabs<EquipSlot | null>;
  /** 고른 슬롯의 가진 장비를 슬롯, 아이템 ID, 장비 ID 순서로. */
  readonly entries: ReadonlySignal<readonly EquipmentEntry[]>;
  /** 칸의 select()로 고른 장비의 강화·합성. 처음에는 입은 장비(없으면 처음 가진 장비)를 골라 둔다. */
  readonly forge: ForgeViewModel;
  /** 입은 것보다 좋은 장비가 있는 슬롯이 있다. */
  readonly canEquipBest: ReadonlySignal<boolean>;
  /** 슬롯마다 가장 좋은 장비(다른 어느 것보다 나쁘지 않은 것)를 입는다. */
  equipBest(): void;
  /** 재료가 모인 장비가 있다. */
  readonly canMergeAll: ReadonlySignal<boolean>;
  /** 재료가 모인 장비를 남김없이 합성한다. 합성한 결과로 다시 모이면 그것도 합성한다. */
  mergeAll(): void;
  close(): void;
}

export interface EquipmentViewModelOptions {
  /** 저장 데이터의 장비와 레벨. 장비는 처치가 아니라 클리어와 보스의 보상이고 그 정산은 바로 나가므로 저장 데이터로 충분하다. */
  readonly state: AppState;
  readonly data: GameData;
  readonly t: Translate;
  /** 보이는 전투의 레벨(스냅숏)과 확정될 보유량(강화에 쓸 골드). */
  readonly battle: Pick<BattleService, "heroLevel" | "items">;
  /** 착용, 해제, 강화, 합성을 보낸다. 거절은 토스트(refused)가 알린다. */
  readonly progress: Pick<Progress, "cmd">;
  /** 메인 화면의 장비 뱃지 트리(createEquipmentBadges). 슬롯 탭과 칸이 그 마디다. */
  readonly badges: EquipmentBadges;
  readonly logger: Logger;
  readonly close: () => void;
}

// 슬롯의 이름과 강화 단계를 반영해 더하는 스탯: "무기 · 공격 +5 · HP +30".
function detailOf(piece: Piece, t: Translate): string {
  const { row } = piece;
  const slot = SLOT_TABS.find(([key]) => key === row.slot);
  const stats = STATS.flatMap(({ stat, label }) => (row[stat] === null ? [] : [`${t(label)} +${formatBig(statOf(piece, stat))}`]));
  return [slot ? t(slot[1]) : t("equipment.slot", { slot: row.slot ?? "" }), ...stats].join(" · ");
}

const nameOf = ({ row, enhance }: Piece, t: Translate) =>
  enhance === 0 ? t(row.nameKey) : t("equipment.enhanced", { name: t(row.nameKey), step: enhance });

/** 일괄 합성이 한 번에 보내는 최대 합성 수. 거절되어 상태가 그대로면 그 전에 멈춘다. */
const MAX_MERGES = 50;

export function createEquipmentViewModel(
  { state, data, t, battle, progress, badges, logger, close }: EquipmentViewModelOptions,
): EquipmentViewModel {
  const tabs = localTabs(
    SLOT_TABS.map(([key, text]) => ({
      key, label: computed(() => t(text)), badge: key === null ? badges.any : badges.slots[key],
    })),
    null,
  );
  // 레벨은 경계에서 오르므로 보이는 전투를 따른다. 저장 데이터가 없으면(로그아웃 중) 능력치는 0이다.
  const level = battle.heroLevel;
  const equipment = computed(() => state.player.value?.equipment);
  const hero = computed((): CombatStats | undefined => {
    const save = state.player.value;
    if (!save) return undefined;
    return heroStats({ ...save, hero: { ...save.hero, level: level.value } }, data);
  });
  // 커맨드는 즉시 적용되고, 서버에 닿지 못한 것은 로그만 남긴다(적용한 것은 취소된다).
  const sent = (command: Promise<unknown>) => void command.catch(unsent(logger, "The equipment change"));
  const wornIds = computed((): ReadonlySet<number> => new Set(Object.values(equipment.value?.equipped ?? {})));
  const toggle = (equipmentId: number) =>
    sent(wornIds.value.has(equipmentId) ? progress.cmd.ItemUnequip({ equipmentId }) : progress.cmd.ItemEquip({ equipmentId }));
  // 패널이 비지 않게 처음에는 입은 장비(슬롯 순서), 입은 것이 없으면 처음 가진 장비를 골라 둔다.
  const held = equipment.peek();
  const selectedId = signal<number | null>(
    held ? (Object.values(held.equipped)[0] ?? (Object.keys(held.owned).map(Number)[0] ?? null)) : null,
  );
  // 아이템마다 가진 수. 합성 재료 막대가 쓴다.
  const counts = computed(() => {
    const found = new Map<number, number>();
    for (const instance of Object.values(equipment.value?.owned ?? {})) found.set(instance.itemId, (found.get(instance.itemId) ?? 0) + 1);
    return found;
  });

  const entries = computed(() => {
    const held = equipment.value;
    if (!held) return [];
    const worn = wornIds.value;
    const better = badges.better.value;
    const slot = tabs.selected.value;
    // 정수 키는 오름차순으로 순회되고 정렬은 안정적이라, 같은 아이템끼리는 장비 ID 순서다. 테이블에 없는 아이템은 뺀다.
    const shown = Object.entries(held.owned).flatMap(([key, instance]) => {
      const piece = pieceOf(instance, data);
      return piece && (slot === null || piece.row.slot === slot) ? [{ equipmentId: Number(key), piece }] : [];
    });
    shown.sort((a, b) => (a.piece.row.slot ?? 0) - (b.piece.row.slot ?? 0) || a.piece.row.id - b.piece.row.id);
    return shown.map(({ equipmentId, piece }): EquipmentEntry => {
      const on = worn.has(equipmentId);
      const mark = on ? t("equipment.worn") : better.has(equipmentId) ? t("equipment.better") : "";
      const held = counts.value.get(piece.row.id) ?? 0;
      const need = piece.row.mergeItemId === null ? 0 : piece.row.mergeCount ?? 0;
      return {
        equipmentId, worn: on, better: better.has(equipmentId), selected: selectedId.value === equipmentId, icon: piece.row.icon,
        tint: piece.row.grade ?? 0, level: piece.enhance === 0 ? "" : `+${piece.enhance}`,
        count: need > 0 ? Math.min(1, held / need) : 0, countText: need > 0 ? `${held}/${need}` : "",
        name: nameOf(piece, t), detail: detailOf(piece, t), state: mark,
        toggle: () => toggle(equipmentId),
        select: () => void (selectedId.value = equipmentId),
        tap: () => {
          selectedId.value = equipmentId;
          if (!on) toggle(equipmentId);
        },
      };
    });
  });

  // 슬롯마다 입은 것보다 좋은 장비 중 다른 어느 후보보다 나쁘지 않은 것. 입은 것이 가장 좋으면 그 슬롯은 없다.
  const bestIds = computed(() => {
    const held = equipment.value;
    if (!held) return [];
    return SLOTS.flatMap(slot => {
      const wornId = held.equipped[slot];
      let bestId = wornId;
      let best = wornId === undefined ? undefined : pieceOf(held.owned[wornId], data);
      for (const [key, instance] of Object.entries(held.owned)) {
        const piece = pieceOf(instance, data);
        if (piece?.row.slot === slot && isBetter(piece, best)) [bestId, best] = [Number(key), piece];
      }
      return bestId !== undefined && bestId !== wornId ? [bestId] : [];
    });
  });
  const mergeable = () => {
    const held = equipment.value;
    return held && Object.keys(held.owned).map(Number).find(id => mergeMaterials(held, id, data) !== undefined);
  };

  return {
    canEquipBest: computed(() => bestIds.value.length > 0),
    equipBest: () => {
      for (const equipmentId of bestIds.peek()) sent(progress.cmd.ItemEquip({ equipmentId }));
    },
    canMergeAll: computed(() => mergeable() !== undefined),
    // 커맨드는 화면에 즉시 적용되므로 보낼 때마다 다음 재료를 다시 찾는다. 거절되어 같은 장비가 다시 나오면 멈춘다.
    mergeAll: () => {
      const tried = new Set<number>();
      for (let i = 0; i < MAX_MERGES; i++) {
        const equipmentId = mergeable();
        if (equipmentId === undefined || tried.has(equipmentId)) return;
        tried.add(equipmentId);
        sent(progress.cmd.ItemMerge({ equipmentId }));
      }
    },
    stats: STATS.map(({ stat, label }) => ({
      name: computed(() => t(label)),
      icon: "",
      amount: computed(() => hero.value?.[stat] ?? Big.ZERO),
    })),
    tabs,
    entries,
    forge: createForge({ equipment, wornIds, selectedId, data, t, battle, progress, sent, toggle }),
    close,
  };
}

interface ForgeOptions extends Pick<EquipmentViewModelOptions, "data" | "t" | "battle" | "progress"> {
  readonly equipment: ReadonlySignal<EquipmentState | undefined>;
  readonly wornIds: ReadonlySignal<ReadonlySet<number>>;
  readonly selectedId: Signal<number | null>;
  readonly sent: (command: Promise<unknown>) => void;
  readonly toggle: (equipmentId: number) => void;
}

function createForge({ equipment, wornIds, selectedId, data, t, battle, progress, sent, toggle }: ForgeOptions): ForgeViewModel {
  // 고른 장비가 없어지면(합성의 재료, 거절된 합성의 결과) 고른 것이 없다.
  const piece = computed(() => {
    const id = selectedId.value;
    return id === null ? undefined : pieceOf(equipment.value?.owned[id], data);
  });
  const atMax = computed(() => !piece.value || piece.value.enhance >= (piece.value.row.enhanceMax ?? 0));
  const cost = computed(() => (atMax.value ? Big.ZERO : enhanceCost(piece.value!.enhance)));
  const next = computed(() => {
    const id = piece.value?.row.mergeItemId;
    return id == null ? undefined : data.items.get(id);
  });
  const held = computed(() => {
    const itemId = piece.value?.row.id;
    return Object.values(equipment.value?.owned ?? {}).filter(instance => instance.itemId === itemId).length;
  });
  const withSelected = (act: (equipmentId: number) => void) => () => {
    const id = selectedId.value;
    if (id !== null && piece.value) act(id);
  };
  return {
    visible: computed(() => piece.value !== undefined),
    name: computed(() => (piece.value ? nameOf(piece.value, t) : "")),
    detail: computed(() => (piece.value ? detailOf(piece.value, t) : "")),
    step: computed(() => (piece.value ? t("equipment.step", { step: piece.value.enhance, max: piece.value.row.enhanceMax ?? 0 }) : "")),
    enhanceCost: cost,
    canEnhance: computed(() => !atMax.value && Big.gte(battle.items.value[data.constants.goldItemId] ?? Big.ZERO, cost.value)),
    mergeable: computed(() => next.value !== undefined),
    mergeCount: computed(() => (next.value ? t("equipment.mergeCount", { held: held.value, need: piece.value!.row.mergeCount ?? 0 }) : "")),
    mergeInto: computed(() => (next.value ? t("equipment.mergeInto", { name: t(next.value.nameKey) }) : "")),
    canMerge: computed(() => {
      const id = selectedId.value;
      return id !== null && piece.value !== undefined && mergeMaterials(equipment.value!, id, data) !== undefined;
    }),
    worn: computed(() => selectedId.value !== null && wornIds.value.has(selectedId.value)),
    toggleLabel: computed(() => t(selectedId.value !== null && wornIds.value.has(selectedId.value) ? "equipment.unequip" : "equipment.equip")),
    toggle: withSelected(toggle),
    enhance: withSelected(equipmentId => sent(progress.cmd.ItemEnhance({ equipmentId }))),
    // 커맨드는 화면에 즉시 적용되므로, 보내기 전의 다음 ID가 곧 결과의 ID다.
    merge: withSelected(equipmentId => {
      const resultId = equipment.value!.nextId;
      sent(progress.cmd.ItemMerge({ equipmentId }));
      if (equipment.value?.owned[resultId]) selectedId.value = resultId;
    }),
  };
}
