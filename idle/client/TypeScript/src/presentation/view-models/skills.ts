import { Big } from "@idle/big-number";
import type { GameData, SkillsRow } from "@idle/data-schema";
import { equippableSkills, heroRow, isEquipped, skillLevel, skillLevelCost } from "@idle/game-core";
import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { Logger } from "../../application/ports.js";
import type { Progress } from "../../application/progress/progress.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import type { Translate } from "../text.js";

/** 스킬 슬롯 하나(Heroes.skillSlots개). 누르면 고른 슬롯이 되고, 목록에서 장착하는 스킬이 그 슬롯에 들어간다. */
export interface SkillSlot {
  readonly slot: number;
  /** "슬롯 1". */
  readonly label: string;
  /** 장착한 스킬의 이름. 비었으면 "비어 있음"이다. */
  readonly name: string;
  /** "Lv.3/10". 비었으면 비어 있다. */
  readonly level: string;
  readonly empty: boolean;
  readonly selected: boolean;
  select(): void;
  /** 장착한 스킬을 뺀다. 비었으면 보내지 않는다. */
  unequip(): void;
}

/** 스킬 목록의 칸 하나: 영웅이 장착할 수 있는 스킬. 배우지 않았으면 배우기, 배웠으면 장착·해제와 레벨업이다. */
export interface SkillEntry {
  readonly skillId: number;
  /** Skills 테이블의 이름(지금 언어). */
  readonly name: string;
  readonly learned: boolean;
  /** "Lv.3/10". 배우지 않았으면 비어 있다. */
  readonly level: string;
  /** 다음에 낼 비용: 배우지 않았으면 배우는 비용, 배웠으면 다음 레벨의 비용("골드 1.6K"). 최대 레벨이면 "최대 레벨"이다. */
  readonly cost: string;
  /** "장착 중", 배우지 않았으면 "배우지 않음", 아니면 비어 있다. */
  readonly state: string;
  readonly equipped: boolean;
  /**
   * 배우지 않았으면 배울 수 있는지, 배웠으면 레벨을 올릴 수 있는지: 최대 레벨이 아니고 확정될 보유량이 비용 이상이다. 경계마다
   * 바뀌므로 칸과 따로 신호다.
   */
  readonly affordable: ReadonlySignal<boolean>;
  /** 배운다. 이미 배웠거나 낼 수 없으면 보내지 않는다. */
  learn(): void;
  /** 고른 슬롯에 장착한다(다른 슬롯에 있던 스킬이면 두 슬롯이 바뀐다). 배우지 않았거나 이미 그 슬롯이면 보내지 않는다. */
  equip(): void;
  /** 장착했으면 뺀다. */
  unequip(): void;
  /** 레벨을 하나 올린다. 배우지 않았거나 올릴 수 없으면 보내지 않는다. */
  levelUp(): void;
}

/** 스킬 화면: 슬롯과 장착할 수 있는 스킬, 레벨과 다음 비용, 누르면 배우기·장착·해제·레벨업. */
export interface SkillsViewModel {
  /** 슬롯 순서. 슬롯 순서가 전투에서 준비된 스킬을 쓰는 순서다. 처음에는 첫 슬롯을 고른다. */
  readonly slots: ReadonlySignal<readonly SkillSlot[]>;
  /** Heroes.skillIds 순서. */
  readonly entries: ReadonlySignal<readonly SkillEntry[]>;
  close(): void;
}

export interface SkillsViewModelOptions {
  /** 저장 데이터의 장착과 레벨. 보낸 커맨드는 progress가 바로 적용하므로 누르면 곧 바뀐다. */
  readonly state: AppState;
  readonly data: GameData;
  readonly t: Translate;
  /** 보이는 보유량(`items`). 배우기와 레벨업은 누른 틱까지 정산한 보유량에서 값을 치르므로 이것으로 낼 수 있는지 본다(골드 강화와 같음). */
  readonly battle: Pick<BattleService, "items">;
  /** 배우기, 장착, 해제, 레벨업을 보낸다. 거절은 토스트가 알린다. */
  readonly progress: Pick<Progress, "cmd">;
  readonly logger: Logger;
  readonly close: () => void;
}

export function createSkillsViewModel({ state, data, t, battle, progress, logger, close }: SkillsViewModelOptions): SkillsViewModel {
  const selected = signal(0);
  const skills = computed(() => state.player.value?.skills);
  const choices = equippableSkills(data);
  const levelText = (level: number, row: SkillsRow) => t("skills.level", { level, max: row.maxLevel });
  const sent = (what: string) => (error: unknown) => logger.warn(`The skill ${what} did not reach the server:`, error);
  const unequip = (skillId: number) => progress.cmd.SkillUnequip({ skillId }).catch(sent("unequip"));

  const slots = computed(() => {
    const held = skills.value;
    if (!held) return [];
    return Array.from({ length: heroRow(data).skillSlots }, (_, slot): SkillSlot => {
      const row = choices.find(skill => skill.id === held.equipped[slot]);
      return {
        slot,
        label: t("skills.slot", { slot: slot + 1 }),
        name: row ? t(row.nameKey) : t("skills.empty"),
        level: row ? levelText(skillLevel(held, row.id), row) : "",
        empty: row === undefined,
        selected: selected.value === slot,
        select: () => void (selected.value = slot),
        unequip: () => void (row && unequip(row.id)),
      };
    });
  });

  const entries = computed(() => {
    const held = skills.value;
    if (!held) return [];
    return choices.map((row): SkillEntry => {
      const level = skillLevel(held, row.id);
      const learned = level > 0;
      // 배우지 않았으면 배우는 비용, 배웠으면 다음 레벨의 비용. 최대 레벨이면 없다.
      const cost = !learned ? (row.learnCost ?? undefined) : level < row.maxLevel ? skillLevelCost(level) : undefined;
      const item = row.costItemId === null ? undefined : data.items.get(row.costItemId);
      const equipped = isEquipped(held, row.id);
      const affordable = computed(() => cost !== undefined && Big.gte(battle.items.value[row.costItemId!] ?? Big.ZERO, cost));
      return {
        skillId: row.id,
        name: t(row.nameKey),
        learned,
        level: learned ? levelText(level, row) : "",
        cost: cost === undefined
          ? t("skills.maxLevel")
          : t("skills.cost", { item: item ? t(item.nameKey) : String(row.costItemId), amount: formatBig(cost) }),
        state: equipped ? t("skills.equipped") : learned ? "" : t("skills.notLearned"),
        equipped,
        affordable,
        learn() {
          if (learned || !affordable.peek()) return;
          progress.cmd.SkillLearn({ skillId: row.id }).catch(sent("learning"));
        },
        equip() {
          const slot = selected.peek();
          if (!learned || held.equipped[slot] === row.id) return;
          progress.cmd.SkillEquip({ slot, skillId: row.id }).catch(sent("equip"));
        },
        unequip() {
          if (equipped) unequip(row.id);
        },
        levelUp() {
          if (!learned || !affordable.peek()) return;
          progress.cmd.SkillLevelUp({ skillId: row.id }).catch(sent("level-up"));
        },
      };
    });
  });

  return { slots, entries, close };
}
