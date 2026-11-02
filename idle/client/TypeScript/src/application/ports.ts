import type { Command, GameError, PlayerSnapshot, StateSync } from "@idle/game-core";

// 애플리케이션이 바깥에 바라는 것: 게임 서버, 시간, 저장한 문자열, 화면 출력, 재시작, 번들 저장소, 로그. 어댑터와 Unity가
// 구현하고(adapters/net/, unity/bridge.ts), 테스트는 TypeScript로 구현하므로 앱은 Unity나 서버
// 없이 돈다.

export type LoginOutcome =
  | { readonly ok: true; readonly snapshot: PlayerSnapshot }
  | { readonly ok: false; readonly error: GameError };

export type CommandOutcome =
  | { readonly ok: true; readonly sync?: StateSync }
  | { readonly ok: false; readonly error: GameError };

/**
 * 애플리케이션 관점의 게임 서버. 서버에 닿는 방법(봉투, 결과 코드, 세션 토큰, 재개, 핑)은
 * 어댑터 안에 둔다.
 */
export interface GameServer {
  /** 연결이 열려 있지 않으면 연다. 열 수 없으면 reject한다. */
  open(): Promise<void>;
  /** 로그인한다. 로그인한 뒤에는 끊어진 연결이 저절로 돌아오고 세션을 재개한다. */
  login(loginId: string): Promise<LoginOutcome>;
  /**
   * 게임 커맨드를 보낸다. `time`은 커맨드를 예측한 서버 시각이고, 서버는 그 시각(받을 수 있는 범위 안)에 커맨드를 적용한다.
   * 게임 규칙이 거절하는 것은 값으로 돌려주고, 커맨드가 서버에 닿지 못하거나 서버가 처리하지 못하면 reject한다. 답을 받지 못한
   * 커맨드는 재개 뒤에 같은 시각으로 다시 나간다.
   */
  send(command: Command, time: number): Promise<CommandOutcome>;
  /** 지금 서버의 저장 데이터. 커맨드 답의 지문이 예측과 다를 때 쓴다. 연결이 끊기면 reject하고, 그때는 재개가 저장 데이터를 준다. */
  fetch(): Promise<PlayerSnapshot>;
  /** 재연결할 때마다 서버가 세션을 재개하며 준 저장 데이터를 받는다. 구독 해제 함수를 돌려준다. */
  onResumed(listener: (snapshot: PlayerSnapshot) => void): () => void;
  /** 완전히 닫는다(로그아웃 같은 경우). 답을 받지 못한 커맨드는 reject된다. */
  close(): void;
}

/** 게임 규칙이 도는 시간: 서버에서 돌 때처럼 서버의 시간. */
export interface Clock {
  /** 서버 시간(epoch ms). */
  now(): number;
}

/** 이 기기에 실행 사이에 남겨 두는 작은 문자열. Unity는 PlayerPrefs에 둔다. */
export interface DeviceStorage {
  /** `key`로 저장한 값. 없으면 null. */
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

/** 화면 출력. Unity는 Application.targetFrameRate에 두고, 언어는 Application.systemLanguage에서 읽는다. */
export interface Display {
  /** 초당 프레임의 목표. */
  setFrameRate(frameRate: number): void;
  /** 기기의 표시 언어(ISO 639-1, 예: ko). 모르는 언어면 빈 글자다. */
  language(): string;
}

export interface AppRuntime {
  /**
   * 지금 도는 스크립트가 끝나면 이 스크립트 환경을 버리고 처음(부트 프로그램의 패치 확인)부터 클라이언트를 다시
   * 시작한다. 이번 실행의 것은 상태도 타이머도 소켓도 남지 않는다.
   */
  restart(): void;
}

/** 받는 곳에 있는 파일 하나의 크기와 SHA-256(소문자 16진수). */
export interface FileDigest {
  readonly size: number;
  readonly sha256: string;
}

/**
 * 패치가 게임 번들을 받아 두는 곳. 새 번들은 설치된 번들과 떨어진 받는 곳에 모았다가 `commit`으로 한 번에 설치된 번들이
 * 되므로, 반쯤 받은 번들로 시작하는 일이 없다. Unity는 persistentDataPath 아래에 둔다(BundleFacade).
 */
export interface BundleStore {
  /** 설치된 게임 번들의 매니페스트(JSON). 설치된 번들이 없으면(첫 실행) null이다. */
  current(): string | null;
  /** 받는 곳을 비우고 새로 시작한다. */
  begin(): void;
  /** `url`을 받는 곳의 `path`에 받는다. 받지 못하면 reject한다. */
  download(url: string, path: string): Promise<void>;
  /** 설치된 번들의 `path`를 받는 곳에 복사한다(바뀌지 않은 파일). */
  reuse(path: string): void;
  /** 받는 곳의 `path`를 글자로 읽는다. */
  read(path: string): string;
  /** 받는 곳의 `path`의 크기와 해시. 없으면 null. */
  digest(path: string): FileDigest | null;
  /**
   * 게임 번들에 든 에셋 카탈로그의 에셋 번들을 모두 미리 받는다(이미 받은 것은 건너뜀). `staged`면 받는 곳의 카탈로그를,
   * 아니면 설치된 번들의 것을 쓰고, 카탈로그가 없으면 바로 이행한다. 에셋 번들은 올린 게임 번들의 주소 아래
   * `aa/<플랫폼>/`에 있다(주소는 엔진이 시작할 때 받는다). 받는 동안 받은 바이트와 받을 바이트로 `progress`를 부른다. 받지
   * 못하면 reject한다.
   */
  assets(staged: boolean, progress: (received: number, total: number) => void): Promise<void>;
  /** 받는 곳을 설치된 번들로 바꾼다. 앞 번들은 다음 업데이트까지 남는다. */
  commit(): void;
  /** 받는 곳을 지운다. */
  discard(): void;
}


/**
 * 로그 줄의 무게. 뒤로 갈수록 무겁고, 정한 레벨보다 가벼운 줄은 버린다. 개발 빌드는 debug부터, 릴리즈 빌드는 info부터
 * 남긴다(composition.ts). 서버(server/src/log.ts)도 같은 기준이다.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * 앱이 한 일과 잘못된 일을 개발자를 위해 적는 곳. 채널 하나의 것이라 줄 앞에 `[채널]`이 붙고, 어느 채널을 받을지는
 * composition이 정한다. 플레이어에게는 화면으로 알린다.
 */
export interface Logger {
  /** 개발할 때만 보는 자세한 줄. 릴리즈 빌드는 버린다. */
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}
