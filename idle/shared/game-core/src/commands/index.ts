import { GameErrorCode, Opcode } from "@idle/codes";
import type { Command, CommandOf, CommandOpcode } from "../command.js";
import { settle } from "../battle/settle.js";
import type { PlayerState } from "../state.js";
import { challengeBoss, settleBattle } from "./battle.js";
import { grantItem, setLevel, shiftTime, unlockStage } from "./cheat.js";
import { enhanceItem, equipItem, mergeItem, unequipItem } from "./equipment.js";
import { rebirth } from "./rebirth.js";
import { equipSkill, learnSkill, levelUpSkill, unequipSkill } from "./skills.js";
import { selectStage } from "./stage.js";
import { upgradeStat } from "./stat-upgrade.js";
import { advanceTutorial } from "./tutorial.js";
import { fail, type CommandContext, type CommandHandler, type CommandResult } from "./types.js";

// Command 유니온의 커맨드마다 핸들러가 하나씩 있다. 하나라도 빠지면 타입 오류다.
const handlers: { readonly [K in CommandOpcode]: CommandHandler<CommandOf<K>> } = {
  [Opcode.StageSelect]: selectStage,
  [Opcode.BattleSettle]: settleBattle,
  [Opcode.BossChallenge]: challengeBoss,
  [Opcode.ItemEquip]: equipItem,
  [Opcode.ItemUnequip]: unequipItem,
  [Opcode.ItemEnhance]: enhanceItem,
  [Opcode.ItemMerge]: mergeItem,
  [Opcode.StatUpgrade]: upgradeStat,
  [Opcode.SkillLearn]: learnSkill,
  [Opcode.SkillEquip]: equipSkill,
  [Opcode.SkillUnequip]: unequipSkill,
  [Opcode.SkillLevelUp]: levelUpSkill,
  [Opcode.TutorialAdvance]: advanceTutorial,
  [Opcode.Rebirth]: rebirth,
  [Opcode.CheatItemGrant]: grantItem,
  [Opcode.CheatLevelSet]: setLevel,
  [Opcode.CheatStageUnlock]: unlockStage,
  [Opcode.CheatTimeShift]: shiftTime,
};

export function isCommandOpcode(op: unknown): op is CommandOpcode {
  return typeof op === "number" && Object.prototype.hasOwnProperty.call(handlers, op);
}

/**
 * (state, command, ctx) → 새 상태 또는 게임 오류. `state`는 수정하지 않는다. 네트워크에서 온
 * 커맨드는 믿을 수 없으므로, type은 여기서 검사하고 필드는 각 핸들러가 검증한다.
 *
 * 핸들러는 `now`의 틱까지 확정한(settle) 상태를 받는다. 모든 커맨드가 지금까지의 전투를 확정한 뒤 바꾸므로, 핸들러마다
 * 확정할지와 검사의 앞뒤를 정하지 않는다. 거절될 커맨드도 확정하지만 확정 한 번에는 상한(MAX_SETTLE_TICKS)이 있고, 서버는
 * 연결마다 받는 커맨드 수를 묶는다. 확정한 뒤에 거절하는 커맨드(없는 장비 등)가 원래 있어서 최악의 비용은 같다.
 */
export function applyCommand(state: PlayerState, command: Command, ctx: CommandContext): CommandResult {
  const type: unknown = typeof command === "object" && command !== null ? command.type : undefined;
  if (typeof type !== "number") return fail(GameErrorCode.InvalidCommand, "A command needs a numeric type.");
  if (!isCommandOpcode(type)) return fail(GameErrorCode.UnknownCommand, `Unknown command type: ${type}.`);
  // TypeScript는 handlers[type]을 그에 맞는 커맨드 변종과 짝지을 수 없다. 위의 검사가 그 역할을 한다.
  const handler = handlers[type] as CommandHandler<Command>;
  // 커맨드의 시각은 체크포인트보다 앞서지 않는다. 클라이언트가 고른 시각(서버가 1초 전까지 받음)으로 지나온 시간을 다시 돌리지 않는다.
  const now = Math.max(ctx.now, state.battle.at);
  return handler(settle(state, ctx.data, now), command, now === ctx.now ? ctx : { ...ctx, now });
}
