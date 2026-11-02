// 저장 데이터의 전투 체크포인트를 다루는 규칙: 새 사냥을 만들고, 체크포인트부터 지금의 틱까지 돌려 그 틱의 상태로
// 확정한다. 커맨드(정산, 보스 도전, 스테이지 선택, 착용, 강화, 환생)와 서버의 새 계정이 쓴다.
import type { GameData } from "@idle/data-schema";
import { grant } from "../items.js";
import { levelUp } from "../level.js";
import type { PlayerState } from "../state.js";
import { MAX_SETTLE_TICKS, TICK_MS } from "./constants.js";
import { offlineReward } from "./offline.js";
import { next } from "./rng.js";
import { bossDue, initialCooldowns, startBattle, type Battle } from "./simulation.js";
import { BattleMode, HERO_ID, type BattleState } from "./state.js";
import { heroStats } from "./stats.js";

/**
 * `now`에서 시작하는 현재 스테이지의 새 사냥. 영웅은 최대 HP, 재사용 대기는 처음부터, 걸린 효과와 소환수는 없고, 전투원
 * id는 영웅 다음부터다.
 * 난수 상태를 주지 않으면 `now`에서 시드한다(uint32로 접어 mulberry32를 한 번 돌린 상태).
 */
export function freshBattle(
  player: Pick<PlayerState, "profile" | "equipment" | "statUpgrades" | "skills" | "rebirth" | "stage">, data: GameData, now: number,
  rng?: number,
): BattleState {
  const hero = heroStats(player, data);
  return {
    mode: modeOf(player, 0, true, data),
    at: now,
    rng: rng ?? next(now >>> 0).state,
    hero: { hp: hero.maxHp, cooldowns: initialCooldowns(hero), effects: [], x: 0 },
    summons: [],
    waves: 0,
    autoBoss: true,
    nextId: HERO_ID + 1,
    enemies: [],
    projectiles: [],
    wave: null,
    bossTicksLeft: null,
    reviveTicksLeft: null,
  };
}

/**
 * `now`에서 지금 스테이지의 새 사냥을 다시 시작한다. 난수 상태, 웨이브 수, `autoBoss`, 전투원 id는 체크포인트에서
 * 이어 받고 다음 웨이브는 다시 정한다. 싸우던 웨이브와 소환수는 버리고 영웅은 지금 능력치의 최대 HP로 시작한다. 낡은
 * 체크포인트의 정산, 오프라인 보상의 표본, 치트가 쓴다.
 */
export function restartBattle(player: PlayerState, data: GameData, now: number): BattleState {
  const { rng, waves, autoBoss, nextId } = player.battle;
  // 마이그레이션이 넣은 rng 0은 이어 받지 않는다.
  const fresh = freshBattle(player, data, now, rng !== 0 ? rng : undefined);
  return { ...fresh, mode: modeOf(player, waves, autoBoss, data), waves, autoBoss, nextId };
}

/** 저장 데이터의 체크포인트에서 시작하는 전투. */
export function playerBattle(state: PlayerState, data: GameData): Battle {
  return startBattle({ player: state, data });
}

/**
 * 체크포인트부터 `now`가 든 틱까지 돌려 그 틱의 상태로 확정한다(`battle`, 클리어가 있었으면 `stage`, 처치마다 받은 보상과
 * 레벨업에 쓴 경험치를 반영한 `items`, 레벨이 올랐으면 `profile`). 싸우던 웨이브도 그대로 저장되므로 보이는 보유량이 곧 확정된
 * 보유량이다. 지난 틱이 없으면 `state` 그대로다. 체크포인트가 없거나(`at` 0, 마이그레이션) 상한보다 오래되었으면 다시 돌리지 않고
 * 오프라인 보상(`offlineReward`)을 지급하고 그 경험치로 바로 레벨을 올린 뒤 `now`에서 새 사냥을 시작한다. 웨이브 수와 `autoBoss`는
 * 남긴다. `battle.at`이 `now`의 틱으로 옮겨지므로 같은 시간을 두 번 돌리지 않는다.
 */
export function settle(state: PlayerState, data: GameData, now: number): PlayerState {
  const { battle } = state;
  if (isStaleCheckpoint(battle, now)) {
    const held = grant(state, offlineReward(state, data, now).items, data);
    const paid = { ...state, ...held, ...levelUp(state.profile, held.items, data) };
    // 새 사냥은 오른 레벨의 최대 HP로 시작한다.
    return { ...paid, battle: restartBattle(paid, data, now) };
  }
  const ticks = Math.floor((now - battle.at) / TICK_MS);
  if (ticks <= 0) return state;
  const simulation = playerBattle(state, data);
  simulation.advance(ticks);
  return { ...state, ...simulation.checkpoint().player };
}

/** 다시 돌리지 않고 오프라인 보상으로 정산하는 체크포인트인지: 없거나(`at` 0, 마이그레이션) `now`까지 상한보다 멀다. */
export function isStaleCheckpoint(battle: BattleState, now: number): boolean {
  return battle.at === 0 || now - battle.at > MAX_SETTLE_TICKS * TICK_MS;
}

function modeOf(player: Pick<PlayerState, "stage">, waves: number, autoBoss: boolean, data: GameData): BattleMode {
  return bossDue(player.stage.currentId, waves, autoBoss, data) ? BattleMode.Boss : BattleMode.Hunt;
}
