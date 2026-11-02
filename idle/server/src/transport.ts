import { createServer, type IncomingMessage, type Server } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { CloseCode, PROTOCOL_VERSION, SOCKET_PATH } from "@idle/protocol";
import type { Logger } from "./log.js";
import type { Rpc } from "./rpc.js";

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
    if (pathOf(req) !== SOCKET_PATH) {
      socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(req, socket, head, ws => accept(ws, req));
  });

  function accept(ws: WebSocket, req: IncomingMessage): void {
    const peer = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    // 리스너가 없으면 잘못된 프레임의 오류가 처리되지 않아 서버가 죽는다.
    ws.on("error", error => log.warn(`${peer} ${error.message}`));
    ws.on("close", (code, reason) => log.info(`${peer} closed ${code}${reason.length > 0 ? ` ${reason}` : ""}`));

    const query = new URL(req.url ?? "/", "http://localhost").searchParams;
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
    ws.on("message", (data, isBinary) => {
      heard.add(ws);
      if (!isBinary) {
        ws.close(UNSUPPORTED_DATA, "Send binary MessagePack messages.");
        return;
      }
      connection.receive(toBytes(data)).then(
        response => ws.send(response),
        (error: unknown) => log.error(`${peer} failed to answer:`, error),
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

function pathOf(req: IncomingMessage): string {
  return new URL(req.url ?? "/", "http://localhost").pathname;
}
