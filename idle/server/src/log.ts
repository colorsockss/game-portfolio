/**
 * 로그 줄의 무게. 뒤로 갈수록 무겁고, 정한 레벨보다 가벼운 줄은 버린다. 개발 모드는 debug부터, 릴리즈는 info부터
 * 남긴다(main.ts). 클라이언트(application/ports.ts)도 같은 기준이다.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** 채널 하나가 일어난 일을 알리는 곳. 줄 앞에 `[채널]`이 붙는다. */
export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

/** 줄을 받아 쓰는 곳. main.ts는 console을 넘기고, 테스트는 줄을 모은다. */
export interface LogSink {
  log(line: string): void;
  warn(line: string): void;
  error(line: string, error?: unknown): void;
}

const RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/** 채널 이름 → 그 채널의 로거. `level`보다 가벼운 메서드는 아무것도 하지 않는다. */
export function createLog(sink: LogSink, level: LogLevel): (channel: string) => Logger {
  const keeps = (at: LogLevel) => RANK[at] >= RANK[level];
  const drop = () => {};
  return channel => {
    const line = (message: string) => `[${channel}] ${message}`;
    return {
      debug: keeps("debug") ? message => sink.log(line(message)) : drop,
      info: keeps("info") ? message => sink.log(line(message)) : drop,
      warn: keeps("warn") ? message => sink.warn(line(message)) : drop,
      error: keeps("error") ? (message, error) => sink.error(line(message), error) : drop,
    };
  };
}
