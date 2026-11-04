// 클라이언트와 서버가 똑같이 계산해야 하는 게임 규칙: 클라이언트는 커맨드를 즉시 적용하고, 서버는
// 같은 코드를 돌려 받아들이거나 거절한다. 도메인 타입(저장 데이터, 커맨드, 게임 오류, 로그인 ID 규칙,
// 리비전이 붙은 스냅숏과 그 동기화)도 규칙과 와이어 계약이 모두 이를 바탕으로 하므로 여기서 정의한다.
// 한쪽만 필요한 것은 그쪽에 둔다.
// csharp/puerts를 import하거나 console 외의 호스트 API를 쓰지 않는다: 이 코드는 모든 호스트에서
// 돌아야 한다.
export { E_AbilityType } from "./ability-type.js";
export { LOGIN_ID_LENGTH, LOGIN_ID_PATTERN, isValidLoginId } from "./account.js";
export { MAX_SETTLE_TICKS, TICK_MS, toTicks } from "./battle/constants.js";
export { offlineReward, type OfflineReward } from "./battle/offline.js";
export { freshBattle, isStaleCheckpoint, playerBattle, settle } from "./battle/settle.js";
export {
  bossDue,
  initialCooldowns,
  startBattle,
  type Battle,
  type BattleEvent,
  type BattleInput,
  type BattlePlayer,
  type BattleSnapshot,
  type Boundary,
  type EffectSnapshot,
  type EnemySnapshot,
  type Hit,
  type ProjectileSnapshot,
  type SkillSnapshot,
  type SummonSnapshot,
} from "./battle/simulation.js";
export {
  BattleMode, HERO_ID,
  type BattleState, type CombatantState, type EffectState, type MonsterState, type ProjectileState, type SummonState, type WaveState,
} from "./battle/state.js";
export {
  abilityOwner,
  applyModifiers,
  heroStats,
  monsterStats,
  summonStats,
  type CombatStats,
  type StatModifier,
} from "./battle/stats.js";
export type { Command, CommandOf, CommandOpcode } from "./command.js";
export { applyCommand, isCommandOpcode } from "./commands/index.js";
export { enhanceCost, equipmentStat, mergeMaterials, NO_EQUIPMENT, type EquipmentInstance, type EquipmentState } from "./equipment.js";
export type { CommandContext, CommandResult } from "./commands/types.js";
export type { GameError } from "./errors.js";
export { grant, NO_ITEMS, type Holdings, type ItemAmounts } from "./items.js";
export { Formula, type IAbilityOwner } from "./formulas.js";
export { playerFingerprint, type PlayerSnapshot, type StateSync } from "./snapshot.js";
export { NO_REBIRTH, rebirthPoints, rebirthRate, type RebirthState } from "./rebirth.js";
export { MAX_STAT_UPGRADE_STEPS, NO_STAT_UPGRADES, statUpgradeBatch, statUpgradeCost, type StatUpgradeState } from "./stat-upgrade.js";
export {
  equippableSkills,
  heroRow,
  isEquipped,
  isLearned,
  skillLevel,
  skillLevelCost,
  startSkills,
  type SkillsState,
} from "./skills.js";
export type { HeroState, PlayerState, ProfileState, StageState } from "./state.js";
export { firstStageId, isUnlocked, type UnlockCondition } from "./unlock.js";
export { afterStep, isStepDone, startTutorial, tutorialStep, waitsForTap, type TutorialState } from "./tutorial.js";
export { DAILY_RESET_UTC, DAY, HOUR, MINUTE, SECOND, elapsed, gameDay, nextDailyReset } from "./time.js";
