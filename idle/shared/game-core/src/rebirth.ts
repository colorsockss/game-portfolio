// 환생: 확정한 레벨로 환생 포인트(공식 rebirthPoints)를 받고, 레벨·스테이지·골드 강화·골드·경험치를 처음으로 돌린다. 쌓은
// 포인트의 영구 배율(공식 rebirthRate)은 영웅의 공격·방어·최대 HP(battle/stats.ts)와 처치·클리어 보상의 수량(battle/simulation.ts)에
// 곱한다. 커맨드는 commands/rebirth.ts다.
import { Big } from "@idle/big-number";
import { E_AbilityType } from "./ability-type.js";
import { Formula, type IAbilityOwner } from "./formulas.js";

/** 환생한 횟수와 그동안 받은 포인트의 합. 배율은 포인트로만 정한다. */
export interface RebirthState {
  readonly count: number;
  readonly points: number;
}

export const NO_REBIRTH: RebirthState = Object.freeze({ count: 0, points: 0 });

// 환생 공식은 능력치를 읽지 않는다.
const NOBODY: IAbilityOwner = {
  get(type) {
    throw new Error(`A rebirth formula cannot read ${E_AbilityType[type]}.`);
  },
};

/** 영웅 레벨 `level`에서 환생하면 받는 포인트. 0이면 환생할 수 없다. */
export function rebirthPoints(level: number): number {
  return Big.toNumber(Formula.get(E_AbilityType.rebirthPoints, NOBODY, NOBODY, { level }));
}

/** 쌓은 포인트의 영구 배율. 0포인트면 정확히 1이다. */
export function rebirthRate(rebirth: RebirthState): Big {
  return Formula.get(E_AbilityType.rebirthRate, NOBODY, NOBODY, { points: rebirth.points });
}
