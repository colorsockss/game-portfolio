import { GameErrorCode, type Opcode } from "@idle/codes";
import { freshBattle } from "../battle/settle.js";
import type { CommandOf } from "../command.js";
import { rebirthPoints } from "../rebirth.js";
import { NO_STAT_UPGRADES } from "../stat-upgrade.js";
import { firstStageId } from "../unlock.js";
import { fail, ok, type CommandHandler } from "./types.js";

// 레벨은 경계에서만 오르므로 `now`의 틱까지 확정한 레벨(마지막 경계의 레벨)로 포인트를 정한다. 포인트 지급과 초기화가 새 상태 하나라서 서버는
// 한 저장으로 바꾸고, 같은 요청 id는 기록된 답을 받는다. 두 연결이 함께 환생하면 늦게 쓰는 쪽이 1레벨에서 다시 확인해 거절된다.

/**
 * 환생한다. 레벨 1, 시작 스테이지(클리어 없음), 골드 강화 0단계, 골드와 경험치 0으로 돌리고 `now`에서 새 사냥을 시작한다. 스킬,
 * 장비(강화 단계와 착용), 다른 아이템, 튜토리얼은 남는다. 확정한 레벨에서 받을 포인트가 없으면 거절한다.
 */
export const rebirth: CommandHandler<CommandOf<Opcode.Rebirth>> = (settled, _, { now, data }) => {
  const points = rebirthPoints(settled.profile.level);
  if (points < 1) return fail(GameErrorCode.RebirthNotReady, `Level ${settled.profile.level} gives no rebirth points.`);
  const { goldItemId, expItemId } = data.constants;
  const { [goldItemId]: _gold, [expItemId]: _exp, ...items } = settled.items;
  const player = {
    ...settled,
    profile: { ...settled.profile, level: 1 },
    items,
    statUpgrades: NO_STAT_UPGRADES,
    stage: { currentId: firstStageId(data), clearedIds: [] },
    rebirth: { count: settled.rebirth.count + 1, points: settled.rebirth.points + points },
  };
  // 스테이지 선택처럼 난수 상태를 이어 받아, 클라이언트와 서버의 `now`가 달라도 같은 수열로 싸운다.
  return ok({ ...player, battle: freshBattle(player, data, now, settled.battle.rng) });
};
