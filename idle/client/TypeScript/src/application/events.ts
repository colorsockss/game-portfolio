import type { Command, GameError, OfflineReward } from "@idle/game-core";
import type { Logger } from "./ports.js";

/**
 * 앱이 화면에 알리는 일회성 사실(보상 연출, 토스트). 상태가 아니라서 값을 쥐지 않는다: 늦게 구독한 쪽은
 * 지난 것을 받지 않고, 같은 값도 날 때마다 알린다. 사실만 싣고 어떤 위젯으로 보일지는 presentation이
 * 정한다. 이벤트마다 내는 곳은 하나다.
 */
export interface AppEventMap {
  /** 서버가 받아들인 오프라인 보상. 전투 서비스가 낸다. */
  readonly offlineReward: OfflineRewarded;
  /** 게임 규칙(이 클라이언트의 예측이나 서버)이 거절한 커맨드. progress가 낸다. */
  readonly refused: Refused;
}

export interface OfflineRewarded extends OfflineReward {
  /** 떠날 때의 레벨과, 보상의 경험치로 오른 정산 뒤의 레벨. 오르지 않았으면 같다. */
  readonly level: { readonly from: number; readonly to: number };
}

export interface Refused {
  readonly command: Command;
  readonly error: GameError;
}

export interface EventBus<E> {
  /** 지금 구독한 쪽을 구독한 순서대로 부른다. 구독자가 던진 것은 로그에 남기고 다음 구독자로 넘어간다. */
  emit<K extends keyof E>(type: K, payload: E[K]): void;
  /** 이 뒤에 나는 `type`마다 `handler`를 부른다. 돌려준 함수를 부르면 그만둔다(`scope.add(events.on(…))`). */
  on<K extends keyof E>(type: K, handler: (payload: E[K]) => void): () => void;
}

/** 일회성 알림의 흐름 하나: 날 때마다 `handler`를 부르고, 돌려준 함수를 부르면 그만둔다. */
export type Listen<T> = (handler: (value: T) => void) => () => void;

/** 읽는 쪽이 받는 앱 이벤트. 내는 쪽만 `emit`을 받는다(composition이 나눠 준다). */
export type AppEvents = Pick<EventBus<AppEventMap>, "on">;

export function createEventBus<E>(logger: Logger): EventBus<E> {
  const handlers: { [K in keyof E]?: ((payload: E[K]) => void)[] } = {};
  return {
    emit(type, payload) {
      // 부르는 사이 구독이 바뀌어도 이번에 부를 쪽은 그대로다.
      for (const handler of [...(handlers[type] ?? [])]) {
        try {
          handler(payload);
        } catch (error) {
          logger.error(`A ${String(type)} handler failed:`, error);
        }
      }
    },
    on(type, handler) {
      const list = (handlers[type] ??= []);
      list.push(handler);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        list.splice(list.indexOf(handler), 1);
      };
    },
  };
}
