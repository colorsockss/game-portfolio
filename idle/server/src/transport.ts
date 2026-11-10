import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { CloseCode, MAX_UNANSWERED_COMMANDS, PROTOCOL_VERSION, SOCKET_PATH } from "@idle/protocol";
import type { Logger } from "./log.js";
import { take, type Bucket, type Rate, type Rpc } from "./rpc.js";

export interface GameServerOptions {
  /** 연결이 열리거나 닫히거나 실패할 때 한 줄을 받는다. */
  readonly log: Logger;
  /** 서버가 읽은 규칙 테이블의 지문(GameData.version). 다른 지문의 클라이언트는 업데이트하도록 닫는다. */
  readonly dataVersion: string;
  /**
   * 연결을 얼마나 자주 확인하는지. 지난 확인 이후 아무것도 보내지 않은 연결에는 ping을 보내고,
   * 다음 확인까지 그 ping에 답하지 않은 연결은 닫는다. 네트워크가 끊기거나 앱이 인사 없이 강제
   * 종료된 경우다. 클라이언트는 한가할 때 스스로 ping을 보내므로(Opcode.Ping), 살아 있는
   * 클라이언트에는 서버가 ping을 보낼 일이 드물다.
   */
  readonly heartbeatMs?: number;
}

export interface GameServer {
  readonly http: Server;
  /** 모든 연결을 닫고 수신을 멈춘다. */
  close(): Promise<void>;
}

// 요청은 작으므로 이보다 큰 메시지는 버그나 공격이며, ws가 1009로 닫는다.
const MAX_MESSAGE_BYTES = 64 * 1024;
// 엔드포인트가 받지 않는 종류의 메시지에 쓰는 WebSocket 종료 코드.
const UNSUPPORTED_DATA = 1003;
// 아래 몫을 넘긴 연결에 쓰는 WebSocket 종료 코드.
const POLICY_VIOLATION = 1008;
// 클라이언트가 한꺼번에 가질 수 있는 요청: 답을 기다리는 커맨드 MAX_UNANSWERED_COMMANDS개와 로그인이나 재개, StateFetch, 핑 한두 개.
// 재연결하면 이것을 한꺼번에 보낸다. 아래 두 몫은 그 두 배다.
const CLIENT_BURST = 2 * MAX_UNANSWERED_COMMANDS;
/**
 * 연결마다 메시지를 초당 20개(커맨드 빈도의 두 배), 한꺼번에 CLIENT_BURST개까지 받고, 넘치면 닫는다. 거절하는 답도 처리하는 답만큼
 * 들므로(핑이든 깨진 메시지든 버킷에 걸린 커맨드든 연결 하나가 초당 8만–20만 개로 이벤트 루프를 채웠다, M4 Max) 답 대신 연결을 끊는다.
 */
const MESSAGE_RATE: Rate = { perSecond: 20, burst: CLIENT_BURST };
/**
 * 받았지만 답이 아직 소켓에 다 쓰이지 않은 요청이 이보다 많으면 닫는다. 답을 읽지 않으면서 보내기만 하는 연결이 쌓는 메모리(차례를
 * 기다리는 요청과 보내지 못한 답)를 연결마다 이만큼으로 묶는다.
 */
const MAX_WAITING = CLIENT_BURST;

/** /ws?v=<version>에서 바이너리 WebSocket 메시지로 오가는 게임 프로토콜. */
export function createGameServer(rpc: Rpc, { log, dataVersion, heartbeatMs = 30_000 }: GameServerOptions): GameServer {
  const http = createServer((_req, res) => res.writeHead(404).end());
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });
  // 지난 확인 이후 소식이 있었던 연결과, 그때 ping을 보낸 연결.
  const heard = new WeakSet<WebSocket>();
  const pinged = new WeakSet<WebSocket>();

  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (heard.has(ws)) {
        heard.delete(ws);
        pinged.delete(ws);
      } else if (pinged.has(ws)) {
        ws.terminate();
      } else {
        pinged.add(ws);
        ws.ping();
      }
    }
  }, heartbeatMs);

  http.on("upgrade", (req, socket, head) => {
    // `//`처럼 URL이 되지 않는 대상도 오므로 던지지 않고 파싱한다. 리스너에서 던지면 프로세스가 죽는다.
    const url = URL.parse(req.url ?? "/", "http://localhost");
    if (url?.pathname !== SOCKET_PATH) {
      // Node는 upgrade를 넘기기 전에 소켓의 error 리스너를 떼므로, 답하는 사이 상대가 끊어도 죽지 않게 단다.
      socket.on("error", () => socket.destroy());
      socket.end(`HTTP/1.1 ${url ? "404 Not Found" : "400 Bad Request"}\r\n\r\n`);
      return;
    }
    sockets.handleUpgrade(req, socket, head, ws => accept(ws, req, url.searchParams));
  });

  function accept(ws: WebSocket, req: IncomingMessage, query: URLSearchParams): void {
    const peer = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    // 리스너가 없으면 잘못된 프레임의 오류가 처리되지 않아 서버가 죽는다.
    ws.on("error", error => log.warn(`${peer} ${error.message}`));
    ws.on("close", (code, reason) => log.info(`${peer} closed ${code}${reason.length > 0 ? ` ${reason}` : ""}`));

    // 다른 규칙 테이블로 예측하는 클라이언트는 다른 버전의 클라이언트처럼 업데이트해야 한다.
    if (Number(query.get("v")) !== PROTOCOL_VERSION || query.get("d") !== dataVersion) {
      ws.close(CloseCode.VersionMismatch, `The server speaks protocol ${PROTOCOL_VERSION} with data ${dataVersion}.`);
      return;
    }
    log.info(`${peer} open`);

    const connection = rpc.connect({ name: peer, close: (code, reason) => ws.close(code, reason) });
    ws.on("close", () => connection.closed());
    heard.add(ws);
    ws.on("pong", () => heard.add(ws));
    const messages: Bucket = { tokens: MESSAGE_RATE.burst, filledAt: performance.now() };
    let waiting = 0;
    ws.on("message", (data, isBinary) => {
      heard.add(ws);
      // ws는 닫는 중에도(상대의 닫기 프레임이나 30초를 기다림) 받은 메시지를 넘긴다. 닫기로 한 연결의 요청은 처리하지 않는다.
      if (ws.readyState !== ws.OPEN) return;
      if (!isBinary) {
        ws.close(UNSUPPORTED_DATA, "Send binary MessagePack messages.");
        return;
      }
      if (!take(messages, MESSAGE_RATE, performance.now())) {
        ws.close(POLICY_VIOLATION, "Too many messages.");
        return;
      }
      if (++waiting > MAX_WAITING) {
        ws.close(POLICY_VIOLATION, "Too many requests are waiting for answers.");
        return;
      }
      // send의 콜백은 답이 소켓에 다 쓰인 뒤에 온다. 상대가 읽지 않아 OS 버퍼가 차 있으면 오지 않는다.
      connection.receive(toBytes(data)).then(
        response => ws.send(response, () => waiting--),
        (error: unknown) => {
          waiting--;
          log.error(`${peer} failed to answer:`, error);
        },
      );
    });
  }

  return {
    http,
    close() {
      clearInterval(heartbeat);
      for (const ws of sockets.clients) ws.close(1001, "The server is shutting down.");
      return new Promise((resolve, reject) => http.close(error => (error ? reject(error) : resolve())));
    },
  };
}

function toBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  return data instanceof ArrayBuffer ? new Uint8Array(data) : data;
}
