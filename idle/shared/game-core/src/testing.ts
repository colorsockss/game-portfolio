// 테스트용 도우미(import "@idle/game-core/testing"). 게임 코드는 import하지 않으므로 번들에 들지 않는다. 계정을
// 테스트마다 손으로 채우지 않게 해서, 슬라이스를 더할 때 여기 한 곳만 고친다.
import type { GameData } from "@idle/data-schema";
import { freshBattle } from "./battle/settle.js";
import type { CommandResult } from "./commands/types.js";
import { NO_EQUIPMENT } from "./equipment.js";
import { NO_REBIRTH } from "./rebirth.js";
import { startSkills } from "./skills.js";
import type { PlayerState } from "./state.js";
import { NO_STAT_UPGRADES } from "./stat-upgrade.js";
import { firstStageId } from "./unlock.js";

/**
 * 튜토리얼을 마치고 첫 스테이지에서 사냥하는 1레벨 영웅 "hero"에 `changes`를 덮은 계정. 스킬은 새 계정과 같다.
 * `battle`을 넘기지 않으면 덮은 슬라이스로 `at`에 새로 시작한 전투다.
 */
export function testPlayer(data: GameData, at: number, changes: Partial<PlayerState> = {}): PlayerState {
  const player = {
    profile: { loginId: "hero", level: 1 },
    items: {},
    equipment: NO_EQUIPMENT,
    statUpgrades: NO_STAT_UPGRADES,
    skills: startSkills(data),
    stage: { currentId: firstStageId(data), clearedIds: [] },
    rebirth: NO_REBIRTH,
    tutorial: { stepId: null },
    ...changes,
  };
  return { ...player, battle: changes.battle ?? freshBattle(player, data, at) };
}

/** 받아들여진 커맨드 결과(`applyCommand`)의 상태. 거절이면 그 메시지로 throw한다. */
export function accepted(result: CommandResult): PlayerState {
  if (!result.ok) throw new Error(result.error.message);
  return result.state;
}
