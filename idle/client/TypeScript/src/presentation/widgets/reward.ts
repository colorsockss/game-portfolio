import { Big } from "@idle/big-number";
import type { GameData } from "@idle/data-schema";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { OfflineRewarded } from "../../application/events.js";
import { formatBig } from "../format/big.js";
import { formatTimer } from "../format/time.js";
import type { Translate } from "../text.js";

/** 보상 팝업: 받은 아이템과, 그것으로 오른 레벨. 받는 순간의 값이라 언어가 바뀔 때만 문장이 바뀐다. */
export interface RewardViewModel {
  /** 보상을 모은 시간. 예: "02:13:05 동안". */
  readonly duration: ReadonlySignal<string>;
  /** "Lv.3 → Lv.7". 레벨이 오르지 않았으면 비어 있다. */
  readonly level: ReadonlySignal<string>;
  /** 아이템 ID 순서로 한 줄에 하나씩: "골드 +1.2K". */
  readonly items: ReadonlySignal<string>;
  close(): void;
}

export interface RewardViewModelOptions {
  /** 아이템 이름을 읽는다. */
  readonly data: GameData;
  readonly t: Translate;
  readonly reward: OfflineRewarded;
  readonly close: () => void;
}

export function createRewardViewModel({ data, t, reward, close }: RewardViewModelOptions): RewardViewModel {
  const { from, to } = reward.level;
  // 정수 키는 오름차순으로 순회되므로 줄은 ID 순서다.
  const got = Object.entries(reward.items).filter(([, amount]) => Big.sign(amount) > 0);
  const name = (id: string) => {
    const row = data.items.get(Number(id));
    return row ? t(row.nameKey) : id;
  };
  return {
    duration: computed(() => t("reward.duration", { time: formatTimer(reward.duration, t) })),
    level: computed(() => (to > from ? t("reward.level", { from, to }) : "")),
    items: computed(() => got.map(([id, amount]) => t("reward.item", { name: name(id), amount: formatBig(amount) })).join("\n")),
    close,
  };
}
