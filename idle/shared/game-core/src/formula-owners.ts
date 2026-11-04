import { E_AbilityType } from "./ability-type.js";
import type { IAbilityOwner } from "./formulas.js";

/** 능력치를 읽지 않는 공식(강화, 비용, 환생)에 넘기는 시전자와 대상. 그런 공식이 능력치를 읽으면 데이터가 어긋난 것이라 던진다. */
export const NOBODY: IAbilityOwner = {
  get(type) {
    throw new Error(`This formula has no caster or target, but it read ${E_AbilityType[type]}.`);
  },
};
