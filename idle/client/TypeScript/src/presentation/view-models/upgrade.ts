import { Big } from "@idle/big-number";
import { Stat, type GameData, type StatUpgradesRow } from "@idle/data-schema";
import { statUpgradeCost } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { Logger } from "../../application/ports.js";
import type { Progress } from "../../application/progress/progress.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import type { Translate } from "../text.js";

/** 강화 목록의 칸 하나: StatUpgrades 행 하나. */
export interface UpgradeEntry {
  readonly upgradeId: number;
  /** 강화의 이름(StatUpgrades.nameKey, 지금 언어). 예: "공격". */
  readonly name: string;
  /** 지금 단계. 예: "Lv.12". */
  readonly level: string;
  /** 지금 단계까지 더한 양. 예: "+60", 치명 확률은 "+6%". */
  readonly bonus: string;
  /** 다음 단계의 골드 비용. 최대 단계면 "최대". */
  readonly cost: string;
  /** 최대 단계가 아니고 확정될 골드로 비용을 낼 수 있다. 아니면 누를 수 없다. */
  readonly canUpgrade: boolean;
  /** 한 단계 올린다. 거절은 토스트(refused)가 알린다. */
  upgrade(): void;
}

/** 강화 화면: 강화마다 단계, 더한 양, 다음 비용, 누르면 한 단계 올리기. */
export interface UpgradeViewModel {
  /** StatUpgrades 행을 ID 순서로. 단계나 확정될 골드가 바뀌면 다시 계산한다. */
  readonly entries: ReadonlySignal<readonly UpgradeEntry[]>;
  close(): void;
}

export interface UpgradeViewModelOptions {
  /** 저장 데이터의 강화 단계. 강화는 커맨드로만 오르고 그 예측이 바로 저장 데이터에 들어온다. */
  readonly state: AppState;
  readonly data: GameData;
  readonly t: Translate;
  /** 보이는 골드(`items`). 강화는 누른 틱까지 정산한 골드로 값을 치르므로 처치마다 오르는 보이는 골드가 곧 쓸 수 있는 골드다. */
  readonly battle: Pick<BattleService, "items">;
  readonly progress: Pick<Progress, "cmd">;
  readonly logger: Logger;
  readonly close: () => void;
}

// 치명 확률은 확률이라 백분율로(소수 한 자리), 나머지는 큰 수 표기로 보인다: "+1.5%", "+1.2K".
function bonusOf(row: StatUpgradesRow, step: number): string {
  const bonus = Big.mul(row.amount, step);
  return row.stat === Stat.CritChance ? `+${Math.round(Big.toNumber(bonus) * 1000) / 10}%` : `+${formatBig(bonus)}`;
}

export function createUpgradeViewModel(
  { state, data, t, battle, progress, logger, close }: UpgradeViewModelOptions,
): UpgradeViewModel {
  const rows = [...data.statUpgrades.values()].sort((a, b) => a.id - b.id);
  const steps = computed(() => state.player.value?.statUpgrades);
  const gold = computed(() => battle.items.value[data.constants.goldItemId] ?? Big.ZERO);
  const entries = computed(() => {
    const held = steps.value;
    if (!held) return [];
    return rows.map((row): UpgradeEntry => {
      const step = held[row.id] ?? 0;
      const maxed = step >= row.maxStep;
      const cost = statUpgradeCost(step);
      const upgrade = () => {
        progress.cmd.StatUpgrade({ upgradeId: row.id })
          .catch((error: unknown) => logger.warn("The stat upgrade did not reach the server:", error));
      };
      return {
        upgradeId: row.id,
        name: t(row.nameKey),
        level: t("upgrade.level", { step }),
        bonus: bonusOf(row, step),
        cost: maxed ? t("upgrade.max") : formatBig(cost),
        canUpgrade: !maxed && Big.gte(gold.value, cost),
        upgrade,
      };
    });
  });
  return { entries, close };
}
