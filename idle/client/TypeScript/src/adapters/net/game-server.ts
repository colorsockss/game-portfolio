import { GameErrorCode, Opcode } from "@idle/codes";
import type { PlayerSnapshot } from "@idle/game-core";
import {
  CloseCode, ResultCode, decodeMessage, encodeMessage, socketPath,
  type Apis, type RequestOf, type ResponseEnvelope, type Session,
} from "@idle/protocol";
import type { Signal } from "@preact/signals-core";
import type { GameServer } from "../../application/ports.js";
import type { EndReason, NetworkState, NetworkStatus } from "../../application/state/app-state.js";
import type { SocketBridge, SocketHandle } from "./ports.js";
import type { ServerClock } from "./server-clock.js";

/** 소켓이 열리기를 기다리는 시간. 넘기면 그 시도를 버린다. 멈춘 접속은 OS의 TCP 타임아웃까지 간다. */
export const CONNECT_TIMEOUT = 10_000;
/** 요청이 답을 기다리는 시간. 이를 넘기면 연결이 죽은 것으로 본다. */
export const REQUEST_TIMEOUT = 10_000;
/** 연결이 조용한 채로 이 시간이 지나면 핑을 보낸다. 서버의 30초 검사보다 짧다. */
export const PING_INTERVAL = 25_000;
/** 요청이 이만큼 기다리면 화면이 게임이 바쁘다고 보여 준다. 더 빠른 요청은 깜박이지 않는다. */
export const WAITING_DELAY = 500;
/**
 * 스크립트가 이만큼 돌지 않았다면(백그라운드, 디버거) 그 사이 소켓이 죽었거나 기기 시계가 바뀌었을 수
 * 있으므로, 돌아오자마자 핑을 보내 연결과 서버 시계를 다시 확인한다.
 */
export const RESUME_GAP = 5_000;
/** 연결되어 있는 동안 스크립트가 멈췄었는지 보는 간격. */
const WATCH_INTERVAL = 1_000;
/**
 * 재연결을 시도하기 전에 기다리는 시간. 마지막 값을 반복한다. 각 대기는 무작위로 최대 절반까지
 * 줄어서, 재시작하는 서버를 놓친 클라이언트가 모두 같은 순간에 돌아오지 않는다.
 */
export const RECONNECT_DELAYS: readonly number[] = [500, 1000, 2000, 4000, 8000];

export interface GameServerOptions {
  readonly socket: SocketBridge;
  /** 서버의 origin. 예: ws://localhost:8080. */
  readonly server: string;
  /** 이 클라이언트가 예측에 쓰는 규칙 테이블의 지문(GameData.version). 서버의 것과 다르면 서버가 업데이트하도록 닫는다. */
  readonly dataVersion: string;
  /** 요청이 나간 시각과 그 응답의 서버 시간으로 맞춘다. */
  readonly clock: ServerClock;
  /** 화면을 위해 연결의 상태를 받는다. 연결이 유일한 쓰기 주체다. */
  readonly network: Signal<NetworkState>;
}

interface Pending {
  readonly op: keyof Apis;
  readonly id: string;
  readonly body: unknown;
  /** 게임 커맨드를 예측한 서버 시각. 다시 보낼 때도 같다. */
  readonly time?: number;
  readonly resolve: (response: ResponseEnvelope) => void;
  readonly reject: (error: Error) => void;
  sent: boolean;
  /** 마지막으로 보낸 로컬 시각. 답이 서버 시계를 맞출 때 쓴다. */
  sentAt: number;
  timeout?: Timer;
  waiting?: Timer;
  slow: boolean;
}

type Timer = ReturnType<typeof setTimeout>;

// 한 소켓에 속하는 요청. 다음 소켓에서 다시 보내지 않는다: 로그인이나 재개는 처음부터 다시 하고,
// 핑은 더 증명할 것이 없으며, 저장 데이터는 재개가 준다.
const SOCKET_ONLY: ReadonlySet<keyof Apis> = new Set([Opcode.AuthLogin, Opcode.AuthResume, Opcode.Ping, Opcode.StateFetch]);

// 이 종료 코드 뒤에는 재연결해도 소용이 없다. 플레이어에게 어떤 뜻인지도 함께 둔다.
const FINAL_CLOSES: ReadonlyMap<number, EndReason> = new Map([
  [CloseCode.VersionMismatch, "update"],
  [CloseCode.SessionReplaced, "replaced"],
  [1003, "error"], // 지원하지 않는 데이터
  [1009, "error"], // 메시지가 너무 큼
]);

/**
 * 하나의 WebSocket 위의 게임 서버: 답은 id로 요청과 짝을 맞추고, 세션은 끊어진 연결을 넘어
 * 살아남는다. 요청이 REQUEST_TIMEOUT 동안 답이 없으면 소켓이 죽었다고 말하지 않았더라도
 * 죽은 것으로 보고, 그 소켓을 버리고 연결을 되살린다. 봉투, 결과 코드, 세션 토큰, 재개, 핑은
 * 여기 안에 두고, 애플리케이션은 결과만 받는다.
 */
export function createGameServer({ socket, server, dataVersion, clock, network }: GameServerOptions): GameServer {
  let status: NetworkStatus = "offline";
  let ended: EndReason | null = null;
  let handle: SocketHandle | undefined;
  // 소켓마다 올려서, 버린 소켓의 이벤트를 무시한다.
  let generation = 0;
  // 로그인에서 받아 둔다. 그 뒤로 끊어진 연결은 저절로 돌아오고, 다른 것이 나가기 전에
  // (AuthResume으로) 세션을 재개한다.
  let session: Session | undefined;
  // onResumed 리스너. 각각 서버가 재개하며 준 저장 데이터를 받는다.
  const resumed = new Set<(snapshot: PlayerSnapshot) => void>();
  // 연결이 online이 되기를 기다리는 open() 호출자.
  let opening: { promise: Promise<void>; resolve(): void; reject(error: Error): void } | undefined;
  let attempt = 0;
  let reconnectTimer: Timer | undefined;
  let connectTimer: Timer | undefined;
  let pingTimer: Timer | undefined;
  let watchTimer: ReturnType<typeof setInterval> | undefined;
  let awake = 0;
  let nextId = 0;
  let slow = 0;
  const pending = new Map<string, Pending>();

  function publish(): void {
    const next: NetworkState = { status, ended, waiting: slow > 0 || status === "reconnecting" };
    const current = network.value;
    const same = current.status === next.status && current.ended === next.ended && current.waiting === next.waiting;
    if (!same) network.value = next;
  }

  function setStatus(next: NetworkStatus, reason: EndReason | null = null): void {
    status = next;
    ended = reason;
    publish();
  }

  function dial(): void {
    const mine = ++generation;
    try {
      handle = socket.connect(`${server}${socketPath(dataVersion)}`, {
        onOpen: () => mine === generation && opened(),
        onMessage: data => mine === generation && received(data),
        onClose: (code, reason) => mine === generation && lost(code, reason),
      });
    } catch (error) {
      lost(1006, error instanceof Error ? error.message : String(error));
      return;
    }
    connectTimer = setTimeout(() => abandon("no connection"), CONNECT_TIMEOUT);
  }

  function opened(): void {
    clearTimeout(connectTimer);
    if (!session) {
      online();
      return;
    }
    const resuming = handle;
    enqueue(Opcode.AuthResume, { token: session.token }).then(response => {
      // Unity는 한 프레임의 소켓 이벤트를 한꺼번에 넘기므로, 이 소켓이 답한 직후에 닫혔을 수 있다.
      // 그러면 lost()가 이미 다음을 정했으므로 이 답은 아무 의미가 없다.
      if (handle !== resuming) return;
      if (response.code === ResultCode.Ok) {
        for (const listener of resumed) listener(response.body);
        online();
      } else if (response.code === ResultCode.Rejected) {
        end(response.error.code === GameErrorCode.SessionExpired ? "expired" : "replaced");
      } else {
        abandon(`resume failed: ${response.message}`);
      }
    }, () => {
      // 답이 오기 전에 소켓이 끊겼다. lost()가 이미 다음 시도를 예약했다.
    });
  }

  function online(): void {
    attempt = 0;
    setStatus("online");
    opening?.resolve();
    opening = undefined;
    for (const entry of pending.values()) if (!entry.sent) transmit(entry);
    armPing();
    awake = clock.local();
    clearInterval(watchTimer);
    watchTimer = setInterval(() => {
      const now = clock.local();
      if (now - awake > RESUME_GAP) ping();
      awake = now;
    }, WATCH_INTERVAL);
  }

  function received(data: Uint8Array): void {
    const response = decodeMessage(data) as ResponseEnvelope;
    const entry = pending.get(response.id);
    if (!entry) return;
    clock.observe(response.serverTime, entry.sentAt);
    settle(entry);
    entry.resolve(response);
  }

  // 소켓이 사라졌다: 서버의 통보, 네트워크, 또는 여기서의 타임아웃 때문이다.
  function lost(code: number, reason: string): void {
    handle = undefined;
    clearTimeout(connectTimer);
    clearTimeout(pingTimer);
    clearInterval(watchTimer);
    const error = new Error(`The connection closed (${code} ${reason}).`);
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.sent = false;
      if (SOCKET_ONLY.has(entry.op)) {
        settle(entry);
        entry.reject(error);
      }
    }
    const final = FINAL_CLOSES.get(code);
    if (final) end(final);
    else if (session) reconnect();
    else stop(error);
  }

  function reconnect(): void {
    setStatus("reconnecting");
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    attempt++;
    reconnectTimer = setTimeout(dial, delay / 2 + (Math.random() * delay) / 2);
  }

  // 소켓이 닫혔다고 알리기를 기다리지 않고 지금 소켓을 포기한다. 죽은 네트워크는 끝내
  // 알리지 않을 수 있다.
  function abandon(reason: string): void {
    const dead = handle;
    generation++;
    dead?.close(1000, reason);
    lost(1006, reason);
  }

  function end(reason: EndReason): void {
    session = undefined;
    stop(new Error(`The connection ended: ${reason}.`), "ended", reason);
  }

  function stop(error: Error, next: NetworkStatus = "offline", reason: EndReason | null = null): void {
    clearTimeout(reconnectTimer);
    clearTimeout(connectTimer);
    clearTimeout(pingTimer);
    clearInterval(watchTimer);
    opening?.reject(error);
    opening = undefined;
    for (const entry of [...pending.values()]) {
      settle(entry);
      entry.reject(error);
    }
    setStatus(next, reason);
  }

  /**
   * 요청을 보내고 서버의 답으로 이행한다. 연결이 돌아오는 동안 요청은 기다리다가 세션이 재개된 뒤에
   * 나가고, 연결이 끊길 때 아직 답이 없는 요청은 같은 id로 다시 나가며 서버는 이에 한 번만 답한다.
   * 그 전에 연결이 닫히거나 끝나면 reject한다.
   */
  function request<K extends keyof Apis>(op: K, body: RequestOf<K>, time?: number): Promise<ResponseEnvelope<K>> {
    if (status === "offline" || status === "ended") return Promise.reject(new Error(`Not connected (${status}).`));
    return enqueue(op, body, time);
  }

  function enqueue<K extends keyof Apis>(op: K, body: RequestOf<K>, time?: number): Promise<ResponseEnvelope<K>> {
    return new Promise((resolve, reject) => {
      const entry: Pending = {
        op, id: String(++nextId), body, time, sent: false, sentAt: 0, slow: false,
        resolve: resolve as (response: ResponseEnvelope) => void, reject,
      };
      pending.set(entry.id, entry);
      // 연결 자신의 핑과 재개는 게임이 바빠 보이게 하지 않는다.
      if (op !== Opcode.Ping && op !== Opcode.AuthResume) {
        entry.waiting = setTimeout(() => {
          entry.slow = true;
          slow++;
          publish();
        }, WAITING_DELAY);
      }
      if (handle && (status === "online" || op === Opcode.AuthResume)) transmit(entry);
    });
  }

  function transmit(entry: Pending): void {
    entry.sent = true;
    entry.sentAt = clock.local();
    entry.timeout = setTimeout(() => abandon(`no answer to ${Opcode[entry.op]}#${entry.id}`), REQUEST_TIMEOUT);
    const { op, id, body, time } = entry;
    handle!.send(encodeMessage(time === undefined ? { op, id, body } : { op, id, body, time }));
    armPing();
  }

  function settle(entry: Pending): void {
    pending.delete(entry.id);
    clearTimeout(entry.timeout);
    clearTimeout(entry.waiting);
    if (entry.slow) {
      slow--;
      publish();
    }
  }

  function armPing(): void {
    clearTimeout(pingTimer);
    if (status !== "online") return;
    pingTimer = setTimeout(ping, PING_INTERVAL);
  }

  function ping(): void {
    // 답을 받지 못한 핑은 타임아웃을 거쳐 소켓을 버리게 한다.
    enqueue(Opcode.Ping, {}).catch(() => {});
  }

  return {
    open() {
      if (status === "online") return Promise.resolve();
      if (opening) return opening.promise;
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<void>((done, fail) => ((resolve = done), (reject = fail)));
      opening = { promise, resolve, reject };
      // 재연결하는 동안은 다음 시도가 이미 예약되어 있다.
      if (status !== "reconnecting") {
        setStatus("connecting");
        dial();
      }
      return promise;
    },

    async login(loginId) {
      const answering = handle;
      const response = await request(Opcode.AuthLogin, { loginId });
      if (response.code === ResultCode.Rejected) return { ok: false, error: response.error };
      if (response.code !== ResultCode.Ok) throw new Error(`Login failed: ${ResultCode[response.code]}.`);
      // 소켓이 답과 같은 프레임에 닫혔을 수 있다. 그러면 세션도 함께 사라졌다.
      if (handle !== answering) throw new Error("The connection closed before the login completed.");
      session = response.body.session;
      return { ok: true, snapshot: response.body.snapshot };
    },

    async send(command, time) {
      // opcode는 어떤 커맨드인지 알려 주고, body는 그 나머지다.
      const { type, ...body } = command;
      const response = await request(type, body, time);
      if (response.code === ResultCode.Rejected) return { ok: false, error: response.error };
      if (response.code !== ResultCode.Ok) throw new Error(`Command failed: ${response.message}`);
      return { ok: true, sync: response.sync };
    },

    async fetch() {
      const response = await request(Opcode.StateFetch, {});
      if (response.code !== ResultCode.Ok) throw new Error(`StateFetch failed: ${ResultCode[response.code]}.`);
      return response.body;
    },

    onResumed(listener) {
      resumed.add(listener);
      return () => void resumed.delete(listener);
    },

    close() {
      session = undefined;
      const open = handle;
      generation++;
      handle = undefined;
      open?.close(1000, "Closed by the client.");
      stop(new Error("The connection was closed."));
    },
  };
}
