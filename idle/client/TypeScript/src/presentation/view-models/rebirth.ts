import { Big } from "@idle/big-number";
import type { GameData } from "@idle/data-schema";
import { firstStageId, NO_REBIRTH, rebirthPoints, rebirthRate } from "@idle/game-core";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { BattleService } from "../../application/battle/battle.js";
import type { Logger } from "../../application/ports.js";
import { unsent, type Progress } from "../../application/progress/progress.js";
import type { AppState } from "../../application/state/app-state.js";
import { formatBig } from "../format/big.js";
import type { Translate } from "../text.js";

/** 환생 화면: 지금 배율, 환생할 수 있는지와 받을 배율, 처음으로 돌아가는 것, 누르면 확인 뒤 환생. */
export interface RebirthViewModel {
  /** "환생 2회". */
  readonly count: ReadonlySignal<string>;
  /** 지금 영구 배율. "배율 ×1.44". */
  readonly rate: ReadonlySignal<string>;
  /** 보이는 전투의 레벨에서 받을 포인트가 있다. 아니면 환생 버튼을 누를 수 없다. */
  readonly ready: ReadonlySignal<boolean>;
  /** 받을 것: "Lv.47에서 환생하면 +324포인트, 배율 ×1.44 → ×1.76". 환생할 수 없으면 "Lv.30부터 환생할 수 있습니다." */
  readonly gain: ReadonlySignal<string>;
  /** 처음으로 돌아가는 것을 한 줄에 하나씩: 레벨, 스테이지, 골드 강화 단계의 합, 골드. 남는 것은 화면의 고정 문구다. */
  readonly resets: ReadonlySignal<string>;
  /** 환생할 수 있으면 확인 팝업으로 물은 뒤 환생한다. 거절은 토스트(refused)가 알린다. */
  rebirth(): Promise<void>;
  close(): void;
}

export interface RebirthViewModelOptions {
  /** 저장 데이터의 환생, 스테이지, 골드 강화. 환생은 커맨드로만 바뀌고 그 예측이 바로 저장 데이터에 들어온다. */
  readonly state: AppState;
  readonly data: GameData;
  readonly t: Translate;
  /**
   * 레벨은 경계에서 오르고 환생은 누른 틱까지 확정한 레벨로 포인트를 정하므로 보이는 전투의 레벨(`snapshot`)을 본다(메인
   * 화면의 레벨과 같다). 골드는 보이는 보유량(`items`)이다.
   */
  readonly battle: Pick<BattleService, "heroLevel" | "items">;
  readonly progress: Pick<Progress, "cmd">;
  readonly logger: Logger;
  /** 확인 팝업으로 묻고 플레이어의 답으로 이행한다(presentation/widgets/confirm.ts). */
  readonly confirm: (message: string) => Promise<boolean>;
  readonly close: () => void;
}

// 배율은 소수 둘째 자리까지 버려서 보인다: 실제보다 큰 값이 나오지 않게 한다.
function rateText(rate: Big): string {
  return (Math.floor(Big.toNumber(rate) * 100 + 1e-9) / 100).toFixed(2);
}

export function createRebirthViewModel(
  { state, data, t, battle, progress, logger, confirm, close }: RebirthViewModelOptions,
): RebirthViewModel {
  // 환생할 수 있는 가장 낮은 레벨: 공식이 포인트를 주는 첫 레벨. 없으면(데이터) 환생할 수 없다.
  const minLevel = [...data.heroLevels.keys()].sort((a, b) => a - b).find(level => rebirthPoints(level) > 0);
  const startStage = data.stages.get(firstStageId(data))!;
  const level = battle.heroLevel;
  const points = computed(() => rebirthPoints(level.value));
  const ready = computed(() => state.player.value !== null && points.value > 0);
  return {
    count: computed(() => t("rebirth.count", { count: state.player.value?.rebirth.count ?? 0 })),
    rate: computed(() => t("rebirth.rate", { rate: rateText(rebirthRate(state.player.value?.rebirth ?? NO_REBIRTH)) })),
    ready,
    gain: computed(() => {
      const rebirth = state.player.value?.rebirth;
      if (!rebirth || !ready.value) return minLevel === undefined ? "" : t("rebirth.locked", { level: minLevel });
      const after = { count: rebirth.count + 1, points: rebirth.points + points.value };
      return t("rebirth.gain", {
        level: level.value, points: points.value, from: rateText(rebirthRate(rebirth)), to: rateText(rebirthRate(after)),
      });
    }),
    resets: computed(() => {
      const save = state.player.value;
      if (!save) return "";
      const stage = data.stages.get(save.stage.currentId);
      const steps = Object.values(save.statUpgrades).reduce((sum, step) => sum + step, 0);
      const gold = battle.items.value[data.constants.goldItemId] ?? Big.ZERO;
      return [
        t("rebirth.resetLevel", { from: level.value }),
        t("rebirth.resetStage", { from: stage ? t(stage.nameKey) : "", to: t(startStage.nameKey) }),
        t("rebirth.resetUpgrades", { steps }),
        t("rebirth.resetGold", { amount: formatBig(gold) }),
      ].join("\n");
    }),
    rebirth: async () => {
      if (!ready.value || !await confirm(t("rebirth.confirm"))) return;
      await progress.cmd.Rebirth({}).catch(unsent(logger, "The rebirth"));
    },
    close,
  };
}
