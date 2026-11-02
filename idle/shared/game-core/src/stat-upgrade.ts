// 골드 능력치 강화: StatUpgrades 행마다 단계가 있고, 단계 n이면 그 행의 `amount × n`을 영웅 능력치에 고정 가산으로
// 더한다(battle/stats.ts). 다음 단계의 골드 비용은 공식 upgradeCost(입력 step = 지금 단계)이고, 그 거듭제곱은 결정적인
// 정수 거듭제곱(Big.pow)이라 클라이언트와 서버가 같은 비트를 낸다. 올리는 커맨드는 commands/stat-upgrade.ts다.
import type { Big } from "@idle/big-number";
import { E_AbilityType } from "./ability-type.js";
import { Formula, type IAbilityOwner } from "./formulas.js";

/** 강화(StatUpgrades.id) → 단계. 키가 없으면 0단계다. */
export type StatUpgradeState = { readonly [upgradeId: number]: number };

export const NO_STAT_UPGRADES: StatUpgradeState = Object.freeze({});

// upgradeCost는 시전자와 대상을 읽지 않는다.
const NOBODY: IAbilityOwner = {
  get(type) {
    throw new Error(`upgradeCost cannot read ${E_AbilityType[type]}: an upgrade has no caster or target.`);
  },
};

/** `step`단계에서 다음 단계로 올리는 데 드는 골드. */
export function statUpgradeCost(step: number): Big {
  return Formula.get(E_AbilityType.upgradeCost, NOBODY, NOBODY, { step });
}
