import type { Opcode } from "@idle/codes";
import type { CommandOf } from "../command.js";
import { ok, type CommandHandler } from "./types.js";

// 확정은 applyCommand가 핸들러를 부르기 전에 하므로, 정산 커맨드는 확정한 상태를 그대로 받아들인다.
export const settleBattle: CommandHandler<CommandOf<Opcode.BattleSettle>> = settled => ok(settled);

// autoBoss는 경계에서만 쓰이므로, 싸우던 몬스터는 그대로 이어지고 다음 경계 뒤에 보스가 나온다.
// 보스가 없는 스테이지에서 켜면 처치 수가 찰 때 다시 클리어하므로(마지막 스테이지) 확정만 한다.
export const challengeBoss: CommandHandler<CommandOf<Opcode.BossChallenge>> = (settled, _command, { data }) => {
  const hasBoss = (data.stages.get(settled.stage.currentId)?.bossId ?? null) !== null;
  if (settled.battle.autoBoss || !hasBoss) return ok(settled);
  return ok({ ...settled, battle: { ...settled.battle, autoBoss: true } });
};
