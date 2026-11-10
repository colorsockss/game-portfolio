import type { GameError, StateSync } from "@idle/game-core";
import type { Apis, RequestOf, ResponseOf } from "./api.js";

/** 모든 요청은 이것이며, MessagePack으로 인코딩해 바이너리 WebSocket 메시지로 보낸다. */
export interface RequestEnvelope<K extends keyof Apis = keyof Apis> {
  /** 어느 API인지, Opcode로 나타낸다. */
  readonly op: K;
  /**
   * 세션 안에서 유일하며 64자 이하다. 응답이 이 값을 그대로 싣고 돌아온다. 같은 id로 다시 보낸 게임
   * 커맨드는 처음과 같은 응답을 받고 다시 실행되지 않으므로, 연결이 끊겨 응답을 놓친 클라이언트가
   * 안전하게 다시 보낼 수 있다.
   */
  readonly id: string;
  readonly body: RequestOf<K>;
  /**
   * 게임 커맨드만: 클라이언트가 커맨드를 예측한 서버 시각(epoch ms의 정수, 서버 시계의 추정치). 서버는 이것을 자기 시각의
   * `COMMAND_TIME.past`ms 전부터 `COMMAND_TIME.ahead`ms 뒤까지로 잘라 그 시각에 커맨드를 적용하므로, 보통의 지연이면 클라이언트의
   * 예측과 서버의 확정이 같은 틱에서 같은 결과를 낸다. 없으면 서버가 받은 시각이다.
   */
  readonly time?: number;
}

/**
 * 서버가 커맨드의 `time`으로 받는 범위(ms): 서버 시각보다 `past`만큼 이르거나 `ahead`만큼 늦을 수 있다. 이르게는 응답이 늦게 닿는
 * 편도 지연과 다시 보내는 커맨드를, 늦게는 클라이언트 시계 추정의 오차(왕복 시간의 절반 이하)를 받는다. 이 범위 밖이면 가장 가까운
 * 끝으로 자르고, 그러면 클라이언트의 예측과 어긋나 서버의 확정으로 맞춰진다.
 */
export const COMMAND_TIME = { past: 1_000, ahead: 500 } as const;

/**
 * 클라이언트가 응답을 받지 못한 채 보내 둘 수 있는 게임 커맨드의 수. 서버는 다시 온 커맨드를
 * 알아보려고 계정마다 이만큼의 응답을 보관한다. 이를 넘으면 다시 보낸 커맨드가 두 번 실행될 수 있다.
 *
 * 서버가 연결마다 한꺼번에 받는 커맨드의 수이기도 하다(rpc.ts의 COMMAND_RATE). 재연결한 클라이언트는 기다리던 커맨드를 한꺼번에
 * 다시 보내는데, 받는 수가 이보다 적으면 넘친 것이 TooManyRequests로 돌아와 예측이 취소된다. 답이 0.5초 늦으면 화면이 입력을
 * 막으므로(WAITING_DELAY) 기다리는 커맨드는 보통 다섯을 넘지 않는다.
 */
export const MAX_UNANSWERED_COMMANDS = 20;

/** 무슨 일이 있었는지. 숫자로 보내며, 배포된 값은 번호를 바꾸거나 재사용하지 않는다. */
export enum ResultCode {
  /** 완료. */
  Ok = 0,
  /** 게임 규칙이나 세션이 요청을 거절했고(GameErrorCode 참고) 아무것도 바뀌지 않았다. */
  Rejected = 1,
  /** 요청의 형식이 잘못되었거나 로그인 전에 보냈다: 클라이언트 버그다. */
  BadRequest = 2,
  /** 서버가 요청을 처리하지 못했다. */
  ServerError = 3,
  /**
   * 게임 커맨드, 또는 로그인·재개(AuthLogin, AuthResume)가 연결의 몫보다 잦아 처리하지 않았고 아무것도 바뀌지 않았다. 답을 기록하지
   * 않으므로 같은 id로 다시 보내면 그때 처리한다.
   */
  TooManyRequests = 4,
}

export type FailureCode = Exclude<ResultCode, ResultCode.Ok | ResultCode.Rejected>;

/** 응답 중 요청이 어떻게 끝났는지에 따라 달라지는 부분. */
export type ResponseResult<K extends keyof Apis = keyof Apis> =
  | { readonly code: ResultCode.Ok; readonly body: ResponseOf<K>; readonly sync?: StateSync }
  | { readonly code: ResultCode.Rejected; readonly error: GameError }
  /** `message`는 로그와 디버깅을 위해 실패를 설명하며, 클라이언트는 `code`를 보고 움직인다. */
  | { readonly code: FailureCode; readonly message: string };

export type ResponseEnvelope<K extends keyof Apis = keyof Apis> = ResultBase & ResponseResult<K>;

interface ResultBase {
  /** 요청의 id. */
  readonly id: string;
  /** 요청을 처리한 시점의 서버 시각(epoch ms). */
  readonly serverTime: number;
}
