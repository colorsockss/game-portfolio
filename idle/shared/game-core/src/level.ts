// 영웅 레벨: 경험치(Constants.expItemId 아이템)가 그 레벨의 요구량(HeroLevels.expToNext)에 닿으면 쓰고 레벨을 올린다.
// 전투가 경계마다 부르므로 레벨은 경계에서만 바뀌고, 이미 보여 준 전투를 다시 쓰지 않는다.
import { Big } from "@idle/big-number";
import type { GameData } from "@idle/data-schema";
import { minus, type ItemAmounts } from "./items.js";
import type { HeroState } from "./state.js";

/**
 * 경험치가 닿는 만큼 레벨을 올리고(여러 번일 수 있다) 쓴 경험치를 뺀다. 요구량이 빈 칸인 레벨이 최대 레벨이고,
 * 거기서는 경험치가 쌓이기만 한다. 오르지 않으면 받은 객체를 그대로 돌려준다.
 */
export function levelUp(
  hero: HeroState, items: ItemAmounts, data: GameData,
): { readonly hero: HeroState; readonly items: ItemAmounts } {
  const { expItemId } = data.constants;
  let level = hero.level;
  let exp = items[expItemId] ?? Big.ZERO;
  for (;;) {
    const need = data.heroLevels.get(level)?.expToNext;
    if (need === undefined) throw new Error(`Unknown hero level ${level}.`);
    if (need === null || Big.lt(exp, need)) break;
    exp = minus(exp, need);
    level++;
  }
  if (level === hero.level) return { hero, items };
  return { hero: { ...hero, level }, items: { ...items, [expItemId]: exp } };
}
