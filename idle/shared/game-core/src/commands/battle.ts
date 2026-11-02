import type { Opcode } from "@idle/codes";
import { settle } from "../battle/settle.js";
import type { CommandOf } from "../command.js";
import { ok, type CommandHandler } from "./types.js";

export const settleBattle: CommandHandler<CommandOf<Opcode.BattleSettle>> = (state, _command, { now, data }) =>
  ok(settle(state, data, now));

// autoBoss는 경계에서만 쓰이므로, 싸우던 몬스터는 그대로 이어지고 다음 경계 뒤에 보스가 나온다.
// 보스가 없는 스테이지에서 켜면 처치 수가 찰 때 다시 클리어하므로(마지막 스테이지) 확정만 한다.
export const challengeBoss: CommandHandler<CommandOf<Opcode.BossChallenge>> = (state, _command, { now, data }) => {
  const settled = settle(state, data, now);
  const hasBoss = (data.stages.get(settled.stage.currentId)?.bossId ?? null) !== null;
  if (settled.battle.autoBoss || !hasBoss) return ok(settled);
  return ok({ ...settled, battle: { ...settled.battle, autoBoss: true } });
};
