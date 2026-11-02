import type { Big } from "@idle/big-number";

export enum BattleMode {
  Hunt = 0,
  Boss = 1,
}

/** 영웅의 전투원 id. 다른 전투원(몬스터, 소환수)과 발사체는 체크포인트의 `nextId`부터 차례로 받는다. */
export const HERO_ID = 0;

/** 전투원에 걸린 효과(Effects)의 겹 하나. 겹마다 따로 끝난다. */
export interface EffectState {
  readonly effectId: number;
  /** 남은 틱. 0이 되는 틱에 끝난다. */
  readonly ticksLeft: number;
  /** 걸 때 정한 양: 지속 피해·회복은 틱마다의 양, 보호막은 남은 흡수량, 능력치는 비율(0.3 = +30%). 그 밖의 효과는 0이다. */
  readonly amount: Big;
}

/** 체크포인트를 넘어 이어지는 전투원 하나의 상태. */
export interface CombatantState {
  readonly hp: Big;
  /** 남은 틱. 0번이 기본 공격, 그 뒤가 쓰는 스킬(목록 순서). */
  readonly cooldowns: readonly number[];
  /** 걸린 효과의 겹. 걸린 순서다. */
  readonly effects: readonly EffectState[];
  /** 월드 x. 경계에서는 아군이 0이다. */
  readonly x: number;
}

/** 체크포인트를 넘어 이어지는 소환수 하나. 능력치는 소환자의 지금 능력치와 그 소환수를 부르는 스킬의 지금 레벨에서 다시 계산한다. */
export interface SummonState extends CombatantState {
  readonly id: number;
  /** Summons 행. */
  readonly summonId: number;
  /** 부른 전투원: 영웅(`HERO_ID`)이면 영웅 편, 몬스터의 id면 적 편이다. */
  readonly by: number;
  /** 만료까지 남은 틱. 0이 되는 틱에 만료한다. */
  readonly ticksLeft: number;
}

/** 진행 중인 웨이브의 살아 있는 몬스터 하나. */
export interface MonsterState extends CombatantState {
  readonly id: number;
  /** Monsters 행. */
  readonly monsterId: number;
  readonly boss: boolean;
}

/** 날아가는 발사체 하나. 피해와 효과는 떨어질 때 쏜 전투원의 그때 능력치와 이 스킬·레벨로 정한다. */
export interface ProjectileState {
  readonly id: number;
  /** 쏜 전투원. */
  readonly by: number;
  /** 쏜 스킬(Skills 행)과 그때의 레벨. */
  readonly skillId: number;
  readonly level: number;
  /** 쏠 때 고른 대상 중 살아 있는 것. */
  readonly targets: readonly number[];
  readonly crit: boolean;
  /** 떨어질 때까지 남은 틱. */
  readonly ticksLeft: number;
}

/** 진행 중인 웨이브: 시작한 뒤 지난 틱과 그때부터 나온 수. */
export interface WaveState {
  readonly elapsed: number;
  readonly spawned: number;
}

/**
 * 전투 체크포인트. 아무 틱에서나 저장해 그대로 이어 간다: 정산은 요청한 시각의 틱까지 돌려 그 틱의 상태를 저장하고, 착용·강화·스킬
 * 커맨드는 그 틱에서 능력치만 바꿔 이어 간다. 경계(웨이브 클리어, 보스 종료, 부활)에서는 적, 발사체, 웨이브가 비어 있다.
 */
export interface BattleState {
  /** 진행 중인 웨이브의 종류. 웨이브가 없으면 다음 웨이브: Boss면 보스, Hunt면 사냥 웨이브(`bossDue`가 정한다). */
  readonly mode: BattleMode;
  /** 체크포인트의 서버 시각(ms). 0틱이 이 시각이다. */
  readonly at: number;
  /** 난수 상태(uint32). */
  readonly rng: number;
  /** 영웅(`HERO_ID`). */
  readonly hero: CombatantState;
  /** 살아 있는 소환수(양쪽). 부른 순서(id 오름차순)다. */
  readonly summons: readonly SummonState[];
  /** 이 스테이지에서 깬 사냥 웨이브 수. `Stages.waveCount`보다 오르지 않는다. */
  readonly waves: number;
  /** 웨이브 수가 차면 보스에 자동 도전한다. */
  readonly autoBoss: boolean;
  /** 다음에 나오는 전투원이나 발사체가 받을 id. 한 전투에서 id는 겹치지 않는다. */
  readonly nextId: number;
  /** 진행 중인 웨이브의 살아 있는 몬스터. 나온 순서(id 오름차순)다. */
  readonly enemies: readonly MonsterState[];
  /** 날아가는 발사체. 쏜 순서다. */
  readonly projectiles: readonly ProjectileState[];
  /** 진행 중인 웨이브. null이면 다음 틱에 `mode`의 웨이브를 시작한다. */
  readonly wave: WaveState | null;
  /** 보스 제한 시간까지 남은 틱. 보스 중이 아니거나 제한이 없으면 null. */
  readonly bossTicksLeft: number | null;
  /** 쓰러진 영웅이 일어나기까지 남은 틱. 서 있으면 null. */
  readonly reviveTicksLeft: number | null;
}
