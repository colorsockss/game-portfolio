import { GameErrorCode, type Opcode } from "@idle/codes";
import { freshBattle } from "../battle/settle.js";
import type { CommandOf } from "../command.js";
import { isUnlocked } from "../unlock.js";
import { fail, ok, type CommandHandler } from "./types.js";

// 싸우던 몬스터를 버리는 화면 전환이므로, `now`의 틱까지 확정한 상태에서 `now`에 새 사냥을 시작한다.
export const selectStage: CommandHandler<CommandOf<Opcode.StageSelect>> = (settled, { stageId }, { now, data }) => {
  // 네트워크에서 온 잘못된 stageId는 행을 찾지 못하므로, 조회가 검증을 겸한다.
  const row = data.stages.get(stageId);
  if (row === undefined) return fail(GameErrorCode.StageNotFound, `Stage ${String(stageId)} does not exist.`);
  if (settled.stage.currentId === stageId) return ok(settled);
  // 정산이 올린 클리어와 레벨로 본다. 이미 있는 스테이지는 잠겨도(데이터 변경) 머물 수 있게 옮길 때만 본다.
  if (!isUnlocked(row, settled)) return fail(GameErrorCode.StageLocked, `Stage ${stageId} is locked.`);
  const stage = { ...settled.stage, currentId: stageId };
  return ok({ ...settled, stage, battle: freshBattle({ ...settled, stage }, data, now, settled.battle.rng) });
};
