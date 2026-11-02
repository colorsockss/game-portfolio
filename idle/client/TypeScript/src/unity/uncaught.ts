// 처리되지 않은 오류를 잡는 곳. PuerTS V8에는 window.onerror도 process의 uncaughtException도 없고, C#에서 JS로
// 들어오는 길마다 잡히는 곳이 다르다.
// - 처리하지 않은 Promise 거부: puerts/promises.mjs가 모든 마이크로태스크 뒤에 puer의 "unhandledRejection"으로 알린다.
// - 타이머 콜백(setTimeout, setInterval)에서 던진 것: puerts/timer.mjs의 Tick 핸들러를 빠져나가 C# ScriptEnv.Tick이
//   던지고, Unity Console에만 남는다. 그 Tick에 기한이 된 나머지 타이머도 다음 Tick으로 밀린다.
// - UnityEvent 리스너(버튼 클릭, 입력, 목록 칸, 탭)에서 던진 것: C# UnityEvent.Invoke를 빠져나가 EventSystem이 남긴다.
// 그래서 C# 콜백을 더하지 않고 JS 쪽에서 타이머와 리스너를 감싸 오류를 한곳으로 모은다.

/** 오류를 받는 곳. 앱이 서기 전에는 Console에만 쓴다. */
let report: (error: unknown) => void = error => console.error("[TypeScript] Uncaught:", error);

/** `fn`이 던진 것을 다시 던지지 않고 처리되지 않은 오류로 알리는 함수. */
export function guarded<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    try {
      fn(...args);
    } catch (error) {
      report(error);
    }
  };
}

/** PuerTS의 puer(import puer from "puerts")에서 쓰는 것. */
export interface UncaughtHost {
  on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
}

/** 감쌀 타이머 전역. Unity에서는 globalThis(puerts/timer.mjs가 설치한 것)다. */
export interface Timers {
  setTimeout(callback: () => void, delay?: number): number;
  setInterval(callback: () => void, delay?: number): number;
}

/**
 * 이 뒤로 처리되지 않은 오류를 `handler`로 보낸다. Promise 거부를 듣고, `timers`의 setTimeout·setInterval을 콜백을 감싸는
 * 것으로 바꾼다(그 뒤에 예약한 타이머부터). UnityEvent 리스너는 바인딩이 `guarded`로 감싼다. 부팅할 때 한 번 부른다.
 */
export function catchUncaught(host: UncaughtHost, timers: Timers, handler: (error: unknown) => void): void {
  // 받는 쪽이 던지면 오류가 다시 C#으로 빠져나가므로 Console에 둘 다 남기고 삼킨다.
  report = error => {
    try {
      handler(error);
    } catch (failure) {
      console.error("[TypeScript] Uncaught:", error, "and its handler failed:", failure);
    }
  };
  host.on("unhandledRejection", reason => report(reason));
  const { setTimeout, setInterval } = timers;
  timers.setTimeout = (callback, delay) => setTimeout(guarded(callback), delay);
  timers.setInterval = (callback, delay) => setInterval(guarded(callback), delay);
}
