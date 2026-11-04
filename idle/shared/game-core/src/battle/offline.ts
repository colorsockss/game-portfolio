// 오프라인 보상: 낡은 체크포인트(정산 상한보다 오래 멈춤)의 공백은 다시 돌리지 않고, 그 체크포인트에서
// 이어지는 사냥을 떠날 때 레벨로 정산 상한만큼 돌려 번 것을 공백 시간에 비례해 늘린다. 다시 돌리면 공백
// 1시간에 약 9 ms(10분에 약 1.5 ms)가 들지만, 이것은 공백과 무관하게 정산 한 번의 상한만큼(약 1.6 ms, docs/performance.md)이다.
import { Big } from "@idle/big-number";
import type { GameData } from "@idle/data-schema";
import { NO_ITEMS, type ItemAmounts } from "../items.js";
import type { PlayerState } from "../state.js";
import { HOUR, elapsed } from "../time.js";
import { MAX_SETTLE_TICKS, TICK_MS } from "./constants.js";
import { restartBattle } from "./settle.js";
import { startBattle } from "./simulation.js";
import { BattleMode } from "./state.js";

export interface OfflineReward {
  /** 보상을 인정한 시간(ms). 상한(Constants.offlineCapHours)을 넘지 않는다. */
  readonly duration: number;
  readonly items: ItemAmounts;
}

/**
 * 체크포인트부터 `now`까지의 오프라인 보상. 체크포인트의 난수 상태에서 지금 스테이지의 사냥만(보스 도전과
 * 클리어 없이, 레벨업 없이) `MAX_SETTLE_TICKS` 돌려 번 것에 `인정 시간 / 그 길이`를 곱하고 아이템마다 내림한다.
 * 체크포인트가 없으면(`at` 0, 마이그레이션) 보상도 없다.
 */
export function offlineReward(state: PlayerState, data: GameData, now: number): OfflineReward {
  const { battle } = state;
  if (battle.at === 0) return { duration: 0, items: NO_ITEMS };
  const duration = elapsed(battle.at, now, data.constants.offlineCapHours * HOUR);
  // 레벨업이 없으면 보유량은 전투에 영향을 주지 않으므로, 빈 보유량에서 시작해 끝난 보유량이 번 것 전부다. 착용한
  // 장비는 능력치로 들어간다. 장비는 클리어와 보스의 보상이라 사냥만 재는 표본에서는 나오지 않는다(나와도 버린다).
  // 체크포인트는 싸우던 웨이브나 보스전 도중일 수 있으므로, 표본은 체크포인트의 난수로 새로 시작한 사냥이다.
  const sample = restartBattle(state, data, battle.at);
  const hunt = startBattle({
    player: { ...state, items: NO_ITEMS, battle: { ...sample, mode: BattleMode.Hunt, autoBoss: false } },
    data,
    levelUps: false,
  });
  hunt.advance(MAX_SETTLE_TICKS);
  const earned = hunt.snapshot().items;
  const scale = duration / (MAX_SETTLE_TICKS * TICK_MS);
  const items: { [itemId: number]: Big } = {};
  for (const key of Object.keys(earned)) items[Number(key)] = Big.floor(Big.mul(earned[Number(key)], scale));
  return { duration, items };
}
