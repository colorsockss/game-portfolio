// PuerTS V8 전역. 브라우저/Node API는 일부러 여기에 선언하지 않는다.
declare const console: {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
};

declare function setTimeout(callback: () => void, delay?: number): number;
// 브라우저와 Node처럼 undefined를 지우는 호출은 아무 일도 하지 않는다(puerts/timer.mjs는 id만 기록한다).
declare function clearTimeout(id: number | undefined): void;
declare function setInterval(callback: () => void, delay?: number): number;
declare function clearInterval(id: number | undefined): void;

/**
 * 이 번들의 빌드 모드. tools/build.mjs가 esbuild define으로 넣는다(build:dev는 "development", build:release는
 * "release"). unity/game.ts와 unity/boot.ts가 읽어 두 프로그램의 설정으로 넘긴다.
 */
declare const BUILD_MODE: "development" | "release";

/**
 * 이 번들이 맞춰 빌드된 C# API의 지문(16자리 16진수). tools/build.mjs가 types/csharp.d.ts의 둘째 줄에서 읽어 넣는다. 앱에
 * 든 부트 번들의 것이 곧 앱의 API라, 부트가 그 API의 패치 채널에서 받는다(unity/boot.ts).
 */
declare const RUNTIME_API: string;

// PuerTS가 주는 puer 전역(import puer from "puerts"). 쓰는 것만 선언한다.
declare module "puerts" {
  const puer: {
    /**
     * PuerTS의 이벤트를 듣는다. "unhandledRejection"은 처리하지 않은 Promise 거부를 이유와 함께 알리고(puerts/promises.mjs),
     * 듣는 쪽이 있으면 기본 경고를 내지 않는다.
     */
    on(event: "unhandledRejection", listener: (reason: unknown) => void): void;
  };
  export default puer;
}

// 빌드가 번들에 넣는 바이트 파일(esbuild의 binary 로더). 부트 번들의 Strings 표(unity/boot.ts)가 쓴다.
declare module "*.bytes" {
  const bytes: Uint8Array;
  export default bytes;
}
