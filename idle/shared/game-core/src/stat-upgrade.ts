// 골드 능력치 강화: StatUpgrades 행마다 단계가 있고, 단계 n이면 그 행의 `amount × n`을 영웅 능력치에 고정 가산으로
// 더한다(battle/stats.ts). 다음 단계의 골드 비용은 공식 upgradeCost(입력 step = 지금 단계)이고, 그 거듭제곱은 결정적인
// 정수 거듭제곱(Big.pow)이라 클라이언트와 서버가 같은 비트를 낸다. 올리는 커맨드는 commands/stat-upgrade.ts다.
import { Big } from "@idle/big-number";
import { E_AbilityType } from "./ability-type.js";
import { NOBODY } from "./formula-owners.js";
import { Formula } from "./formulas.js";

/** 강화(StatUpgrades.id) → 단계. 키가 없으면 0단계다. */
export type StatUpgradeState = { readonly [upgradeId: number]: number };

export const NO_STAT_UPGRADES: StatUpgradeState = Object.freeze({});


/** `step`단계에서 다음 단계로 올리는 데 드는 골드. */
export function statUpgradeCost(step: number): Big {
  return Formula.get(E_AbilityType.upgradeCost, NOBODY, NOBODY, { step });
}

/** StatUpgrade 커맨드가 한 번에 올릴 수 있는 단계 수(`steps`)의 상한. 화면의 ×1/×10/×100 배수의 최대다. */
export const MAX_STAT_UPGRADE_STEPS = 100;

/**
 * `step`단계에서 `wanted`단계까지 올릴 때 실제로 오르는 단계 수와 그 골드 합. `maxStep`에 닿거나 `gold`로 다음 단계의 비용을 더
 * 낼 수 없으면 멈춘다. StatUpgrade 커맨드와 화면이 같은 규칙을 쓰도록 이 함수 하나로 센다.
 */
export function statUpgradeBatch(step: number, maxStep: number, gold: Big, wanted: number): { steps: number; cost: Big } {
  let cost = Big.ZERO;
  let steps = 0;
  for (; steps < wanted && step + steps < maxStep; steps++) {
    // 비용은 정수라 더할 때마다 내림해 가수의 반올림 오차(347이 346.99…)가 쌓이지 않게 한다(items.ts의 added와 같다).
    const total = Big.floor(Big.add(cost, statUpgradeCost(step + steps)));
    if (Big.lt(gold, total)) break;
    cost = total;
  }
  return { steps, cost };
}
