import { GameErrorCode, Opcode } from "@idle/codes";
import type { GameData } from "@idle/data-schema";
import {
  LOGIN_ID_LENGTH, applyCommand, isCommandOpcode, isValidLoginId, playerFingerprint,
  type Command, type CommandOpcode, type PlayerState, type StateSync,
} from "@idle/game-core";
import {
  COMMAND_TIME, CloseCode, ResultCode, decodeMessage, encodeMessage,
  type Apis, type FailureCode, type RequestEnvelope, type ResponseEnvelope, type ResponseOf,
  type ResponseResult, type SystemOpcode,
} from "@idle/protocol";
import { SESSION_LIFETIME, createToken, hashToken } from "./auth.js";
import type { Logger } from "./log.js";
import { createPlayer } from "./save.js";
import type { Account, Store } from "./store.js";

/** 서버가 시각을 읽는 곳. 요청마다 한 번 읽어서 게임 규칙에 `now`로 넘긴다. */
export interface Clock {
  now(): number;
}

export interface RpcOptions {
  readonly store: Store;
  readonly clock: Clock;
  readonly data: GameData;
  /** 요청마다 한 줄을 받는다: 연결, 계정, opcode, 결과, 걸린 시간. */
  readonly log: Logger;
  /** 치트 커맨드(opcode 900-999)를 받는지. 개발 모드의 서버만 받는다(main.ts). 기본은 받지 않는다. */
  readonly cheats?: boolean;
}

/** 연결의 맞은편 끝. 전송 계층이 rpc에 넘겨 주는 모양이다. */
export interface Peer {
  /** 로그에 쓰는 이름. 예: 127.0.0.1:53422. */
  readonly name: string;
  /** 이쪽에서 연결을 닫는다. 예: 그 계정이 다른 곳에서 로그인했을 때. */
  close(code: CloseCode, reason: string): void;
}

/** 전송 계층이 보는 클라이언트 연결 하나. */
export interface Connection {
  /**
   * 요청 메시지 하나를 처리해서 응답 메시지를 돌려준다. 한 연결의 요청은 받은 순서대로 하나씩
   * 처리하므로 답도 그 순서로 돌아온다.
   */
  receive(message: Uint8Array): Promise<Uint8Array>;
  /** 연결이 끊겼음을 rpc에 알린다. */
  closed(): void;
}

export type Rpc = ReturnType<typeof createRpc>;

/** 연결에서 온 API 하나의 요청을 처리한다. */
type Handler<K extends Opcode = Opcode> = (connection: ConnectionState, request: RequestEnvelope<K>, now: number) => Promise<ResponseResult>;

interface ConnectionState {
  readonly peer: Peer;
  /** AuthLogin과 AuthResume이 정한다. */
  account?: Account;
  /** 연결이 묶인 세션의 토큰 해시. `account`와 함께 정해지고 지워진다. */
  tokenHash?: Uint8Array;
  /** 전송 계층이 잃은 연결. 이미 받은 요청은 계속 처리하지만 어느 계정에도 묶지 않는다. */
  gone: boolean;
  /** 게임 커맨드를 받을 수 있는 수(토큰 버킷)와 마지막으로 채운 서버 시각. */
  tokens: number;
  filledAt: number;
}

// 그 사이 다른 요청이 같은 계정을 저장했을 때 커맨드를 처음부터 다시 시작하는 횟수.
const SAVE_ATTEMPTS = 3;
const MAX_REQUEST_ID = 64;
/**
 * 연결마다 게임 커맨드를 초당 `perSecond`개, 한꺼번에 `burst`개까지 받는다. 사람이 강화를 연타해도(초당 10번 안팎) 걸리지 않고,
 * 조작한 클라이언트 하나가 커맨드마다 드는 정산과 커밋으로 프로세스를 채우지 못하게 한다.
 * shortcut: 연결마다 세므로 다시 연결하면 처음부터 센다. 재연결을 되풀이하는 클라이언트까지 막으려면 계정마다 센다.
 */
const COMMAND_RATE = { perSecond: 10, burst: 20 };

/**
 * 어떤 메시지 전송 위에서든 돌아가는 게임 프로토콜. WebSocket 서버가 연결마다 바이너리 메시지를
 * `receive`에 넘기고, 테스트는 직접 부른다.
 */
export function createRpc({ store, clock, data, log, cheats = false }: RpcOptions) {
  // 시스템 API마다 핸들러 하나이며, 하나라도 빠지면 타입 오류다. 게임 커맨드는 모두 runCommand를
  // 거치고, 거기서 game-core의 리듀서가 커맨드 자체의 핸들러를 고른다.
  const systemApis: { readonly [K in SystemOpcode]: Handler<K> } = {
    [Opcode.AuthLogin]: login,
    [Opcode.AuthResume]: resume,
    [Opcode.Ping]: async () => ok(null),
    [Opcode.StateFetch]: fetchState,
  };
  // 계정 ID → 그 계정에 묶인 하나뿐인 연결.
  const bound = new Map<number, ConnectionState>();
  return { connect };

  function connect(peer: Peer): Connection {
    const connection: ConnectionState = { peer, gone: false, tokens: COMMAND_RATE.burst, filledAt: clock.now() };
    let last: Promise<unknown> = Promise.resolve();
    return {
      receive(message) {
        const response = last.then(() => handle(connection, message));
        last = response.catch(() => undefined);
        return response;
      },
      closed() {
        connection.gone = true;
        unbind(connection);
      },
    };
  }

  // 계정에는 연결이 하나뿐이다. 새 연결을 묶으면 이전 연결은 닫힌다.
  function bind(connection: ConnectionState, account: Account, tokenHash: Uint8Array): void {
    unbind(connection);
    if (connection.gone) return;
    const previous = bound.get(account.id);
    if (previous && previous !== connection) {
      previous.account = undefined;
      previous.tokenHash = undefined;
      log.info(`${previous.peer.name} ${account.loginId} replaced by ${connection.peer.name}`);
      previous.peer.close(CloseCode.SessionReplaced, "The account logged in elsewhere.");
    }
    connection.account = account;
    connection.tokenHash = tokenHash;
    bound.set(account.id, connection);
  }

  function unbind(connection: ConnectionState): void {
    if (connection.account && bound.get(connection.account.id) === connection) bound.delete(connection.account.id);
    connection.account = undefined;
    connection.tokenHash = undefined;
  }

  async function handle(connection: ConnectionState, bytes: Uint8Array): Promise<Uint8Array> {
    const started = performance.now();
    const now = clock.now();
    const request = parseRequest(bytes);
    let reply: ResponseResult;
    try {
      reply = request ? await dispatch(connection, request, now) : fail(ResultCode.BadRequest, "Malformed request envelope.");
    } catch (error) {
      log.error(`${connection.peer.name} ${describe(request)} failed:`, error);
      reply = fail(ResultCode.ServerError, "The server failed to handle the request.");
    }
    const response: ResponseEnvelope = { id: request?.id ?? "", serverTime: now, ...reply };
    const encoded = encodeMessage(response);
    const ms = (performance.now() - started).toFixed(1);
    // 한가한 클라이언트는 모두 ping을 보내므로, ping을 로그에 남기면 중요한 요청이 묻힌다.
    if (request?.op !== Opcode.Ping) log.info(`${connection.peer.name} ${connection.account?.loginId ?? "-"} ${describe(request)} ${outcome(reply)} ${ms}ms`);
    return encoded;
  }

  async function dispatch(connection: ConnectionState, request: RequestEnvelope, now: number): Promise<ResponseResult> {
    const { op } = request;
    const handler = Object.prototype.hasOwnProperty.call(systemApis, op) ? systemApis[op as SystemOpcode]
      : isCommandOpcode(op) ? runCommand
      : undefined;
    if (!handler) return fail(ResultCode.BadRequest, `Unknown opcode: ${op}.`);
    // 맵이 opcode마다 자기 핸들러를 짝지어 두는데, TypeScript는 `op`를 거치면 이를 따라가지 못한다.
    return (handler as Handler)(connection, request, now);
  }

  // 계정을 찾거나 만들고, 새 세션을 시작한 뒤(이전 세션은 끝난다) 연결을 그 세션에 묶는다. 찾기·만들기, 읽기,
  // 세션 시작을 한 트랜잭션에 두므로 그 사이에 다른 요청이 끼어들지 않는다. 같은 계정을 함께 만들려던 로그인은
  // 먼저 만든 계정을 찾고, 돌려주는 저장 데이터는 새 세션이 시작한 그대로다(그 뒤 옛 세션의 커맨드는 거절된다).
  async function login(connection: ConnectionState, request: RequestEnvelope<Opcode.AuthLogin>, now: number): Promise<ResponseResult> {
    const { loginId } = request.body;
    if (!isValidLoginId(loginId)) return fail(ResultCode.BadRequest, `loginId must be ${LOGIN_ID_LENGTH.min} to ${LOGIN_ID_LENGTH.max} lowercase letters, digits or underscores.`);
    const token = createToken();
    const tokenHash = hashToken(token);
    const expiresAt = now + SESSION_LIFETIME;
    const { account, saved } = await store.transaction(async tx => {
      const account = await tx.findAccount(loginId) ?? await tx.createAccount(loginId, createPlayer(loginId, data, now), now);
      const saved = account && await tx.load(account.id);
      if (!account || !saved) throw new Error(`The account ${loginId} has no save.`);
      await tx.startSession(account.id, tokenHash, expiresAt);
      return { account, saved };
    });
    bind(connection, account, tokenHash);
    return ok({ snapshot: saved, session: { token, expiresAt } });
  }

  // 토큰이 속한 세션이 아직 현재 세션이면, 새 연결을 그 세션에 묶는다. 확인과 읽기를 한 트랜잭션에
  // 두고 곧바로 묶으므로, 같은 계정의 로그인은 그보다 먼저 끝나 이 재개를 거절하게 하거나, 뒤에 와서
  // 이 연결을 밀어낸다.
  async function resume(connection: ConnectionState, request: RequestEnvelope<Opcode.AuthResume>, now: number): Promise<ResponseResult> {
    const { token } = request.body;
    if (typeof token !== "string") return fail(ResultCode.BadRequest, "token must be a string.");
    const tokenHash = hashToken(token);
    const found = await store.transaction(async tx => {
      const session = await tx.findSession(tokenHash);
      return session && { session, saved: await tx.load(session.account.id) };
    });
    if (!found) return reject(GameErrorCode.SessionReplaced, "The token is not the account's session any more.");
    const { session, saved } = found;
    if (session.expiresAt <= now) return reject(GameErrorCode.SessionExpired, "The session has expired.");
    if (!saved) throw new Error(`The account ${session.account.loginId} has no save.`);
    bind(connection, session.account, tokenHash);
    return ok(saved);
  }

  // 지금 저장 데이터. 클라이언트가 커맨드 답의 지문이 예측과 다를 때 맞추려고 보낸다.
  async function fetchState(connection: ConnectionState): Promise<ResponseResult> {
    const { account } = connection;
    if (!account) return fail(ResultCode.BadRequest, "Log in first.");
    const saved = await store.load(account.id);
    if (!saved) throw new Error(`The account ${account.loginId} has no save.`);
    return ok(saved);
  }

  // 공용 규칙으로 커맨드를 검증하고, 결과를 저장하고, 결과의 지문을 답으로 준다(받은 시각을 잘랐으면 바뀐 슬라이스도). 그 사이 같은 계정에
  // 대한 다른 요청이 저장하면 그 저장 데이터에서 다시 시작하므로, 커맨드는 항상 가장 새 상태에
  // 적용된다.
  //
  // 답은 저장과 같은 트랜잭션에서 요청 id로 기록한다. 답을 못 받은 클라이언트(연결이 끊김)가 같은
  // 요청을 다시 보내면 그 답을 돌려받으므로, 커맨드는 두 번 적용되지 않는다. 기록된 답은 먼저
  // 찾지 않고 바로 그 트랜잭션 안에서 찾는다. 재연결한 뒤 새 연결로 다시 보낸 요청이 옛 연결의
  // 첫 요청이 아직 도는 동안 실행될 수 있고, 나중에 쓰는 쪽은 먼저 쓴 쪽의 답으로 답해야 하기
  // 때문이다.
  //
  // 기록은 세션의 것이다. 새 로그인은 기록을 비우고 요청 번호를 처음부터 다시 매기므로, 그 트랜잭션
  // 안에서 이 연결의 세션이 아직 현재 세션인지 보고 아니면 저장도 기록도 하지 않는다.
  async function runCommand(connection: ConnectionState, request: RequestEnvelope<CommandOpcode>, now: number): Promise<ResponseResult> {
    const { account, tokenHash } = connection;
    if (!account || !tokenHash) return fail(ResultCode.BadRequest, "Log in first.");
    // 모드는 프로세스 내내 같으므로, 이 거절은 기록하지 않아도 같은 id에 같은 답이다.
    if (!cheats && isCheat(request.op)) return reject(GameErrorCode.CheatDisabled, "Cheats are open only on a development server.");

    if (!take(connection, now)) {
      // 다시 보낸 커맨드는 이미 처리했을 수 있다. 그 답은 거르지 않는다.
      const recorded = await store.transaction(tx => tx.findResult(account.id, request.id));
      if (recorded) return decodeMessage(recorded) as ResponseResult;
      return fail(ResultCode.TooManyRequests, "Too many commands; send it again later.");
    }

    // `type`은 opcode이고 맨 뒤에 둬서, body가 다른 커맨드를 가리킬 수 없게 한다.
    const command = { ...request.body, type: request.op } as Command;
    // 클라이언트가 예측한 시각을 받을 수 있는 범위로 자른다. 체크포인트보다 앞서지 않는 것은 applyCommand가 맡는다.
    const at = typeof request.time === "number" ? Math.min(Math.max(request.time, now - COMMAND_TIME.past), now + COMMAND_TIME.ahead) : now;
    // 받은 시각 그대로 적용하면 클라이언트가 같은 결과를 예측했으므로 지문만 보낸다. 시각을 잘랐거나 없었으면 예측과 다를 것을
    // 알므로 바뀐 슬라이스도 보낸다.
    const predicted = at === request.time;
    for (let attempt = 0; attempt < SAVE_ATTEMPTS; attempt++) {
      const saved = await store.load(account.id);
      if (!saved) throw new Error(`The account ${account.loginId} has no save.`);
      const result = applyCommand(saved.player, command, { now: at, data });
      // 거절된 커맨드나 아무것도 바꾸지 않는 커맨드는 저장하지 않지만, 답은 기록한다.
      const changes = result.ok ? changedSlices(saved.player, result.state) : {};
      const changed = Object.keys(changes).length > 0;
      const reply = result.ok
        ? ok(null, {
          revision: changed ? saved.revision + 1 : saved.revision,
          fingerprint: playerFingerprint(result.state),
          ...(predicted ? {} : { changes }),
        })
        : reject(result.error.code, result.error.message);

      const answer = await store.transaction(async tx => {
        if (!await tx.findSession(tokenHash)) return reject(GameErrorCode.SessionReplaced, "The account logged in elsewhere.");
        const recorded = await tx.findResult(account.id, request.id);
        if (recorded) return decodeMessage(recorded) as ResponseResult;
        if (result.ok && changed && !await tx.save(account.id, result.state, saved.revision, now)) return undefined;
        await tx.recordResult(account.id, request.id, encodeMessage(reply));
        return reply;
      });
      if (answer) return answer;
    }
    throw new Error(`The save of ${account.loginId} kept changing during ${SAVE_ATTEMPTS} attempts.`);
  }
}

// 연결의 토큰 버킷을 지금까지 채우고 커맨드 하나만큼 꺼낸다. 남은 것이 없으면 false.
function take(connection: ConnectionState, now: number): boolean {
  const refill = (Math.max(0, now - connection.filledAt) * COMMAND_RATE.perSecond) / 1000;
  connection.tokens = Math.min(COMMAND_RATE.burst, connection.tokens + refill);
  connection.filledAt = now;
  if (connection.tokens < 1) return false;
  connection.tokens--;
  return true;
}

// `after`의 최상위 슬라이스 중 `before`와 같은 객체가 아닌 것. 규칙은 커맨드가 건드리지 않은
// 슬라이스를 참조 그대로 두므로, 이것이 곧 커맨드가 바꾼 것이다.
function changedSlices(before: PlayerState, after: PlayerState): Partial<PlayerState> {
  const changes: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof PlayerState)[]) {
    if (before[key] !== after[key]) changes[key] = after[key];
  }
  return changes as Partial<PlayerState>;
}

// Opcode의 900-999 묶음이 치트다.
function isCheat(op: Opcode): boolean {
  return op >= 900 && op <= 999;
}

// AuthLogin#1처럼 opcode 이름(모르는 opcode는 번호)과 요청 id.
function describe(request: RequestEnvelope | undefined): string {
  if (!request) return "?";
  return `${Opcode[request.op] ?? request.op}#${request.id}`;
}

// 예: Ok, Rejected StageNotFound, BadRequest (Log in first.)
function outcome(reply: ResponseResult): string {
  if (reply.code === ResultCode.Ok) return "Ok";
  if (reply.code === ResultCode.Rejected) return `Rejected ${GameErrorCode[reply.error.code] ?? reply.error.code}`;
  return `${ResultCode[reply.code]} (${reply.message})`;
}

function parseRequest(bytes: Uint8Array): RequestEnvelope | undefined {
  let value: unknown;
  try {
    value = decodeMessage(bytes);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { op, id, body, time } = value as Record<string, unknown>;
  if (!Number.isInteger(op) || typeof body !== "object" || body === null) return undefined;
  // MessagePack은 undefined를 nil로 보내므로 null도 없는 것으로 본다.
  if (time !== undefined && time !== null && !Number.isFinite(time)) return undefined;
  // 커맨드의 답을 id로 저장하므로 id는 짧아야 한다.
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_REQUEST_ID) return undefined;
  return value as RequestEnvelope;
}

function ok(body: ResponseOf<keyof Apis>, sync?: StateSync): ResponseResult {
  return { code: ResultCode.Ok, body, sync };
}

function reject(code: GameErrorCode, message: string): ResponseResult {
  return { code: ResultCode.Rejected, error: { code, message } };
}

function fail(code: FailureCode, message: string): ResponseResult {
  return { code, message };
}
