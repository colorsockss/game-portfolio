import type { LogLevel, Logger } from "../application/ports.js";

/** 줄을 받아 쓰는 곳. PuerTS의 console은 log를 Debug.Log로, warn과 error를 LogWarning과 LogError로 보낸다. */
export interface LogSink {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

const RANK: Readonly<Record<LogLevel, number>> = { debug: 0, info: 1, warn: 2, error: 3 };

/** 채널 이름 → 그 채널의 로거. 줄 앞에 `[채널]`을 붙이고, `level`보다 가벼운 메서드는 아무것도 하지 않는다. */
export function createLog(sink: LogSink, level: LogLevel): (channel: string) => Logger {
  const keeps = (at: LogLevel) => RANK[at] >= RANK[level];
  const drop = () => {};
  return channel => {
    const tag = `[${channel}]`;
    return {
      debug: keeps("debug") ? (...args) => sink.log(tag, ...args) : drop,
      info: keeps("info") ? (...args) => sink.log(tag, ...args) : drop,
      warn: keeps("warn") ? (...args) => sink.warn(tag, ...args) : drop,
      error: keeps("error") ? (...args) => sink.error(tag, ...args) : drop,
    };
  };
}
