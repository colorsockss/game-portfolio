// 개발용 치트. 규칙은 다른 커맨드처럼 여기 한 벌이라 클라이언트가 예측하고 서버가 같은 코드로 확정하며, 요청 id와
// revision도 같은 길을 간다. 개발 모드가 아닌 서버는 opcode(900-999)를 보고 이 핸들러에 닿기 전에 거절한다.
// 모두 `now`의 틱까지 확정한 상태(applyCommand가 확정함)를 바꾸므로 이미 보여 준 전투를 다시 쓰지 않는다.
import { Big } from "@idle/big-number";
import { GameErrorCode, type Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import { restartBattle } from "../battle/settle.js";
import type { CommandOf } from "../command.js";
import { grant } from "../items.js";
import { levelUp } from "../level.js";
import type { PlayerState } from "../state.js";
import { HOUR } from "../time.js";
import { fail, ok, type CommandHandler, type CommandResult } from "./types.js";

/**
 * 아이템을 지급한다(장비는 인스턴스로, 상한을 넘친 것은 버린다). 경험치는 오프라인 보상처럼 그 자리에서 레벨을 올리고,
 * 레벨이 오르면 `now`에서 사냥을 다시 시작한다. 다음 경계까지 미루면 경험치 비율이 100%를 넘어 보인다.
 */
export const grantItem: CommandHandler<CommandOf<Opcode.CheatItemGrant>> = (settled, { itemId, amount }, { now, data }) => {
  if (!data.items.has(itemId) || !Number.isSafeInteger(amount) || amount <= 0) {
    return fail(GameErrorCode.InvalidCommand, `Cannot grant ${String(amount)} of item ${String(itemId)}.`);
  }
  const granted = { ...settled, ...grant(settled, { [itemId]: Big.from(amount) }, data) };
  const { profile, items } = levelUp(granted.profile, granted.items, data);
  return withLevel({ ...granted, items }, profile.level, data, now);
};

/** 영웅 레벨을 정한다. 능력치가 바뀌므로 착용처럼 `now`에서 사냥을 다시 시작한다. 경험치는 그대로다. */
export const setLevel: CommandHandler<CommandOf<Opcode.CheatLevelSet>> = (settled, { level }, { now, data }) => {
  if (!Number.isSafeInteger(level) || !data.heroLevels.has(level)) {
    return fail(GameErrorCode.InvalidCommand, `Hero level ${String(level)} does not exist.`);
  }
  return withLevel(settled, level, data, now);
};

/**
 * 스테이지를 연다: 선행 스테이지를 거슬러 올라가며 모두 클리어한 것으로 두고, 레벨이 그 길의 조건보다 낮으면 올린다.
 * 옮기지는 않는다(옮기는 것은 StageSelect).
 */
export const unlockStage: CommandHandler<CommandOf<Opcode.CheatStageUnlock>> = (settled, { stageId }, { now, data }) => {
  const row = data.stages.get(stageId);
  if (row === undefined) return fail(GameErrorCode.StageNotFound, `Stage ${String(stageId)} does not exist.`);
  const cleared = [...settled.stage.clearedIds];
  let level = settled.profile.level;
  // 선행 조건이 도는 테이블(데이터 오류)에서 멈추도록 스테이지 수만큼만 거슬러 올라간다.
  for (let at = row, steps = 0; steps <= data.stages.size; steps++) {
    level = Math.max(level, at.unlockLevel ?? 0);
    if (at.unlockStageId === null) break;
    if (!cleared.includes(at.unlockStageId)) cleared.push(at.unlockStageId);
    const before = data.stages.get(at.unlockStageId);
    if (before === undefined) throw new Error(`Stage ${at.id} needs unknown stage ${at.unlockStageId}.`);
    at = before;
  }
  if (!data.heroLevels.has(level)) {
    return fail(GameErrorCode.InvalidCommand, `Stage ${stageId} needs hero level ${level}, beyond the table.`);
  }
  const player = cleared.length === settled.stage.clearedIds.length ? settled : { ...settled, stage: { ...settled.stage, clearedIds: cleared } };
  return withLevel(player, level, data, now);
};

/**
 * `duration`만큼 더 오래 떠나 있던 것으로 둔다: 체크포인트를 그만큼 과거로 옮긴다. 다음 정산이 그 공백을 돌리거나(정산
 * 상한 이하) 오프라인 보상으로 지급한다. 공백은 오프라인 보상이 인정하는 길이(Constants.offlineCapHours)까지다.
 */
export const shiftTime: CommandHandler<CommandOf<Opcode.CheatTimeShift>> = (settled, { duration }, { data }) => {
  if (!Number.isSafeInteger(duration) || duration <= 0 || duration > data.constants.offlineCapHours * HOUR) {
    return fail(GameErrorCode.InvalidCommand, `Cannot shift time by ${String(duration)} ms.`);
  }
  return ok({ ...settled, battle: { ...settled.battle, at: settled.battle.at - duration } });
};

function withLevel(player: PlayerState, level: number, data: GameData, now: number): CommandResult {
  if (player.profile.level === level) return ok(player);
  const leveled = { ...player, profile: { ...player.profile, level } };
  return ok({ ...leveled, battle: restartBattle(leveled, data, now) });
}
