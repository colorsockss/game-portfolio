import { Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import {
  isStaleCheckpoint, NO_ITEMS, offlineReward, playerBattle, TICK_MS,
  type Battle, type BattleEvent, type BattleSnapshot, type BattleState, type Command, type ItemAmounts, type PlayerState,
} from "@idle/game-core";
import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import type { AppEventMap, EventBus } from "../events.js";
import type { Clock, Logger } from "../ports.js";
import type { Progress } from "../progress/progress.js";
import type { AppState } from "../state/app-state.js";

/** 보스가 끝나지 않으면 마지막 정산을 보낸 뒤 이만큼 지나 다시 보낸다. */
export const SETTLE_INTERVAL_MS = 60_000;
/** 한 번에 이만큼 넘게 밀리면(앱이 멈췄다 돌아옴) 이벤트 없이 따라잡고 reset 하나만 낸다. */
export const CATCH_UP_TICKS = 20;

/**
 * 보이는 전투의 이벤트. reset은 그 프레임의 유일한 이벤트이고 "지금 상태는 snapshot"이라는 뜻이다.
 * 틱은 보이는 전투가 마지막으로 reset한 체크포인트부터 센다.
 */
export type ShownEvent = BattleEvent | { readonly tick: number; readonly type: "reset" };

/** 보이는 전투가 이대로 가면 곧 할 공격. */
export interface UpcomingAttack {
  readonly by: number;
  readonly skillId: number;
  /** 타격까지 남은 시간(ms). */
  readonly inMs: number;
}

export interface BattleService {
  /** 서버 시각 추정치까지 보이는 전투를 진행하고 그동안의 이벤트를 돌려준다. 화면이 프레임마다 부른다. */
  advance(): readonly ShownEvent[];
  /** 보이는 전투의 지금 상태. `advance()`가 끝날 때마다 갱신하고, 보여 줄 전투가 없으면(로그인 전) undefined. */
  readonly snapshot: ReadonlySignal<BattleSnapshot | undefined>;
  /**
   * 보이는 보유량: 보이는 전투가 저장 데이터의 보유량에서 시작해 처치마다 지급하고 레벨업에 쓴 것. 그래서 처치마다
   * 오르고, 정산이 확정해도 그대로다. 커맨드는 지금의 틱까지 정산한 보유량으로 값을 치르므로, 이것이 곧 쓸 수 있는 보유량이다.
   * 보이는 전투가 없으면 저장 데이터의 보유량이고, 그것도 없으면 비어 있다.
   */
  readonly items: ReadonlySignal<ItemAmounts>;
  /**
   * 보이는 전투를 앞질러 간 예측 전투에서 지금부터 `ms` 안에 올 공격. 연출이 타격 프레임을 타격 틱에 맞추려고
   * 선딜레이만큼 먼저 재생한다. 같은 프레임의 `advance()` 뒤에 부르고, 같은 공격은 한 번만 준다. 저장 데이터가 바뀌어
   * 길이 달라지면 준 공격이 오지 않거나 주지 않은 공격이 올 수 있다(그때는 reset이 배우를 다시 세운다).
   */
  upcoming(ms: number): readonly UpcomingAttack[];
  bossChallenge(): void;
  selectStage(stageId: number): void;
}

export interface BattleOptions {
  /** 저장된 체크포인트(`player`)를 읽는다. progress가 쓴다. */
  readonly state: AppState;
  readonly data: GameData;
  readonly clock: Clock;
  readonly progress: Pick<Progress, "send">;
  /**
   * 낡은 체크포인트의 정산이 받아들여지면 `offlineReward`를 낸다. 값은 이 클라이언트의 시각으로 계산한 예측이라
   * 서버의 확정과 RTT만큼의 보상이 다를 수 있다.
   */
  readonly events: Pick<EventBus<AppEventMap>, "emit">;
  readonly logger: Logger;
}

// 보이는 전투와 그 전투를 시작한 저장 데이터.
interface Shown {
  readonly battle: Battle;
  readonly player: PlayerState;
}

/**
 * 저장된 체크포인트에서 시작한 전투를 프레임마다 서버 시각까지 진행해 보여 준다. 보이는 전투는 프레임마다
 * 바뀌므로 앱 상태에 넣지 않는다. 결과는 정산 커맨드로 서버가 같은 시뮬레이션을 돌려 확정한다.
 */
export function createBattle({ state, data, clock, progress, events: appEvents, logger }: BattleOptions): BattleService {
  let shown: Shown | undefined;
  // 마지막 `advance()`의 서버 시각.
  let frameAt = 0;
  // `upcoming()`의 예측 전투와 그것을 만든 보이는 전투. 보이는 전투가 바뀌면 다시 만든다.
  let ahead: { readonly of: Shown; readonly battle: Battle } | undefined;
  // 예측 전투가 이 서버 시각까지의 공격을 이미 알렸다. 다시 만든 예측 전투가 같은 공격을 또 알리지 않게 한다.
  let announcedUntil = -Infinity;
  const snapshot = signal<BattleSnapshot | undefined>(undefined);
  // 보이는 틱 0의 서버 시각. reset할 때 보이는 전투의 체크포인트로 옮긴다.
  let origin = 0;
  let settleAt: number | undefined;
  let settling = false;
  // 이번 프레임에 새 보스 종료나 스테이지 클리어가 있었다(조용히 진행한 구간 포함). 그러면 바로 정산한다.
  let concluded = false;
  // 이미 정산할 때로 본 마지막 보스 종료·클리어의 서버 시각. 실패한 정산이 되돌린 체크포인트에서 같은
  // 것을 다시 지나도 서두르지 않는다(60초 주기가 맡는다).
  let concludedAt = -Infinity;
  const watch = (source: BattleState) => (event: BattleEvent) => {
    if (event.type !== "bossEnd" && event.type !== "stageClear") return;
    const time = source.at + event.tick * TICK_MS;
    if (time <= concludedAt) return;
    concludedAt = time;
    concluded = true;
  };

  const start = (player: PlayerState): Shown => ({ battle: playerBattle(player, data), player });
  const tickAt = (source: BattleState, time: number) => Math.floor((time - source.at) / TICK_MS);
  const timeOf = ({ battle, player }: Shown) => player.battle.at + battle.tick * TICK_MS;

  // 저장 데이터가 없으면 보이는 전투도 없다. 다음 저장 데이터는 reset으로 새로 시작한다.
  function forget(): void {
    shown = undefined;
    ahead = undefined;
    announcedUntil = -Infinity;
    settleAt = undefined;
    concludedAt = -Infinity;
    snapshot.value = undefined;
  }

  function reset(view: Shown, events: ShownEvent[]): void {
    origin = view.player.battle.at;
    events.length = 0;
    events.push({ tick: view.battle.tick, type: "reset" });
  }

  // 보이는 전투를 `tick`까지 진행한다. 너무 많이 밀렸으면 조용히 따라잡고 reset 하나만 낸다.
  function run(view: Shown, tick: number, events: ShownEvent[]): void {
    if (tick - view.battle.tick > CATCH_UP_TICKS) {
      view.battle.advance(tick, watch(view.player.battle));
      reset(view, events);
      return;
    }
    const offset = (view.player.battle.at - origin) / TICK_MS;
    const seen = watch(view.player.battle);
    view.battle.advance(tick, event => {
      seen(event);
      events.push(offset === 0 ? event : { ...event, tick: event.tick + offset });
    });
  }

  // 저장 데이터가 바뀌었다. 그 전투를 보이는 전투와 같은 서버 시각까지 진행해 같은 길이면(보이는 전투가
  // 지나온 경계, 보스 도전처럼 다음 경계에서야 쓰이는 autoBoss만 바뀜, 길을 바꾸지 않는 보유량) 조용히
  // 바꾸고, 다르면(서버의 시각 차이, 거절, 재개, 스테이지 이동) 바꾸고 reset한다.
  function sync(player: PlayerState, now: number, events: ShownEvent[]): Shown {
    const old = shown!;
    const next = start(player);
    next.battle.advance(tickAt(next.player.battle, now), watch(next.player.battle));
    const time = Math.max(timeOf(old), timeOf(next));
    const tick = Math.ceil((time - old.player.battle.at) / TICK_MS);
    // 보이는 전투가 많이 밀렸으면(로그아웃 동안 프레임이 멈춤) 돌리지 않는다. 따라잡아도 reset이 나므로 같다.
    if (tick - old.battle.tick > CATCH_UP_TICKS) {
      reset(next, events);
      return next;
    }
    run(old, tick, events);
    next.battle.advance(Math.ceil((time - next.player.battle.at) / TICK_MS), watch(next.player.battle));
    if (old.battle.pathSignature() !== next.battle.pathSignature()) {
      logger.debug("reset: the saved checkpoint is off the shown path");
      reset(next, events);
    }
    return next;
  }

  // 서버가 받아들였는지로 이행한다.
  function send(command: Command): Promise<boolean> {
    const name = Opcode[command.type];
    return progress.send(command).then(
      error => {
        if (error) logger.warn(`${name} was refused:`, error.message);
        return error === undefined;
      },
      (error: unknown) => {
        logger.warn(`${name} did not reach the server:`, error);
        return false;
      },
    );
  }

  // progress가 정산을 바로 적용하므로 돌아오면 앱 상태에 예측한 체크포인트가 있다. 서버가 받아들이면 `accepted`를 부른다.
  function settle(now: number, accepted?: () => void): void {
    if (settling) return;
    settling = true;
    settleAt = now + SETTLE_INTERVAL_MS;
    void send({ type: Opcode.BattleSettle }).then(ok => {
      settling = false;
      if (ok) accepted?.();
    });
  }

  // 보이는 전투를 서버 시각까지 진행한다. 끝나는 길이 여럿이라 스냅숏은 `advance()`가 한곳에서 갱신한다.
  function step(): readonly ShownEvent[] {
    const now = clock.now();
    frameAt = now;
    concluded = false;
    let player = state.player.value;
    // 낡은 체크포인트는 돌리지 않는다. 정산이 오프라인 보상을 주고 지금에서 새로 시작한 체크포인트로 바꾼다.
    if (player !== null && isStaleCheckpoint(player.battle, now)) {
      shown = undefined;
      const away = player;
      // 정산을 보내면 progress가 바로 적용하므로, 그 뒤의 저장 데이터에 보상의 경험치로 오른 레벨이 있다.
      let level = away.hero.level;
      // 실패한 정산은 다음 프레임에 다시 보내므로, 보상은 받아들여진 한 번만 계산해 알린다.
      settle(now, () => {
        const reward = offlineReward(away, data, now);
        if (reward.duration > 0) appEvents.emit("offlineReward", { ...reward, level: { from: away.hero.level, to: level } });
      });
      player = state.player.value;
      level = player?.hero.level ?? level;
      if (player !== null && isStaleCheckpoint(player.battle, now)) return [];
    }
    if (player === null) {
      forget();
      return [];
    }
    settleAt ??= now + SETTLE_INTERVAL_MS;

    const events: ShownEvent[] = [];
    if (shown === undefined) {
      // 아직 보여 준 것이 없다. 화면이 배우를 세우도록 reset으로 시작한다.
      shown = start(player);
      shown.battle.advance(tickAt(shown.player.battle, now), watch(shown.player.battle));
      reset(shown, events);
    } else {
      // 전투는 체크포인트, 스테이지, 레벨, 보유량을 모두 읽으므로 저장 데이터가 바뀌면 맞춰 본다.
      if (shown.player !== player) shown = sync(player, now, events);
      run(shown, tickAt(shown.player.battle, now), events);
    }

    // 보스가 끝나거나 클리어하면 바로 정산할 때다. 정산이 오가는 중이면 답이 온 뒤의 첫 프레임에 보낸다.
    if (concluded) settleAt = now;
    if (now >= settleAt) settle(now);
    return events;
  }

  // 세션이 끝나 저장 데이터가 치워지면 화면이 닫혀 advance()가 불리지 않으므로 여기서 잊는다. 그래야 곧바로
  // 다시 로그인해도 새 화면이 reset으로 배우를 세우고, 지난 세션의 HUD를 보이지 않는다.
  state.player.subscribe(player => {
    if (player === null) forget();
  });

  // 스냅숏의 보유량은 다음 처치까지 같은 객체라서, 프레임마다 바뀌는 스냅숏에도 처치와 정산 때만 바뀐다.
  const items = computed(() => snapshot.value?.items ?? state.player.value?.items ?? NO_ITEMS);

  return {
    advance() {
      const events = step();
      snapshot.value = shown?.battle.snapshot();
      return events;
    },

    snapshot,

    items,

    upcoming(ms) {
      const view = shown;
      if (!view) return [];
      if (ahead?.of !== view) {
        const battle = playerBattle(view.player, data);
        battle.advance(view.battle.tick);
        ahead = { of: view, battle };
      }
      const at = view.player.battle.at;
      const attacks: UpcomingAttack[] = [];
      ahead.battle.advance(tickAt(view.player.battle, frameAt + ms), event => {
        const time = at + event.tick * TICK_MS;
        // 따라잡느라 지나간 공격(보이는 전투가 이미 냈다)과 앞의 예측 전투가 알린 공격은 뺀다.
        if (event.type !== "attack" || time <= frameAt || time <= announcedUntil) return;
        attacks.push({ by: event.by, skillId: event.skillId, inMs: time - frameAt });
      });
      announcedUntil = Math.max(announcedUntil, at + ahead.battle.tick * TICK_MS);
      return attacks;
    },

    bossChallenge: () => void send({ type: Opcode.BossChallenge }),

    selectStage: stageId => void send({ type: Opcode.StageSelect, stageId }),
  };
}
