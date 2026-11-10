import { Opcode } from "@idle/codes";
import type { CommandOf, CommandOpcode, PlayerSnapshot } from "@idle/game-core";
import type { Session } from "./account.js";

/**
 * 이 패키지에 호환되지 않는 변경이 생기거나, 와이어가 싣는 game-core 타입(PlayerState, Command,
 * PlayerSnapshot, StateSync, GameError)의 모양이 바뀌면 올린다. 클라이언트가 예측에 쓰는 규칙이 바뀌어
 * 옛 클라이언트의 예측이 서버와 어긋날 때도 올린다. 다른 버전의 클라이언트는 업데이트해야 한다.
 */
export const PROTOCOL_VERSION = 23;

export interface LoginResult {
  readonly snapshot: PlayerSnapshot;
  readonly session: Session;
}

// 연결은 인증되지 않은 채로 시작한다. AuthLogin이나 AuthResume이 연결을 계정에 묶으며, 다른 API는
// 그것이 먼저 필요하다. 계정에는 한 번에 연결 하나만 있다: 다른 연결을 묶으면 이전 연결은
// CloseCode.SessionReplaced로 닫힌다.
interface SystemApis {
  /** 이 ID의 계정을 찾거나 만들고(game-core의 isValidLoginId 참고) 새 세션을 시작한다. */
  [Opcode.AuthLogin]: { readonly request: { readonly loginId: string }; readonly response: LoginResult };
  /**
   * 재연결한 뒤 새 연결에서 세션을 이어 간다. SessionExpired나 SessionReplaced로 거절되면, 그 뒤에는
   * 플레이어가 다시 로그인해야 한다.
   */
  [Opcode.AuthResume]: { readonly request: { readonly token: string }; readonly response: PlayerSnapshot };
  /**
   * 한동안 보낼 것이 없던 클라이언트가 로그인 여부와 관계없이 보낸다. 응답은 연결이 아직 살아 있음을
   * 보여 주고 서버 시각을 싣는다. 서버는 소식을 받는 연결에는 핑을 보내지 않는다.
   */
  [Opcode.Ping]: { readonly request: Record<string, never>; readonly response: null };
  /**
   * 로그인한 계정의 지금 저장 데이터. 커맨드 답의 지문이 클라이언트가 예측한 결과의 지문과 다를 때(StateSync 참고)만 보낸다. 한
   * 연결의 요청은 차례로 처리하므로, 이보다 먼저 보낸 커맨드는 모두 이 저장 데이터에 들어 있다.
   */
  [Opcode.StateFetch]: { readonly request: Record<string, never>; readonly response: PlayerSnapshot };
}

// 게임 커맨드의 요청은 `type`을 뺀 커맨드다(오퍼코드가 이미 어느 커맨드인지 알려 준다). 커맨드가
// 저장 데이터에 미친 영향은 응답 본문이 아니라 `sync`로 돌아온다.
type CommandApis = {
  readonly [K in CommandOpcode]: {
    readonly request: Omit<CommandOf<K>, "type">;
    readonly response: null;
  };
};

/** Opcode → 요청과 응답 본문 타입. 클라이언트와 서버가 함께 쓴다. */
export type Apis = SystemApis & CommandApis;
/** 게임 커맨드가 아닌 오퍼코드. */
export type SystemOpcode = keyof SystemApis;
export type RequestOf<K extends keyof Apis> = Apis[K]["request"];
export type ResponseOf<K extends keyof Apis> = Apis[K]["response"];
