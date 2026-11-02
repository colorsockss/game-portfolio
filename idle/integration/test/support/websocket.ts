import type { SocketBridge } from "@idle/client/adapters/net/ports";

/**
 * Node의 WebSocket으로 실제 서버(`@idle/server/transport`)에 붙는 소켓. 루프백과 달리 바이너리 프레임과 종료 코드가
 * 네트워크를 거친다. `version`을 주면 주소의 프로토콜 버전을 바꿔 그 버전의 클라이언트인 척한다.
 */
export function createWebSocketBridge(version?: number): SocketBridge {
  return {
    connect(url, handlers) {
      const ws = new WebSocket(version === undefined ? url : url.replace(/([?&]v=)\d+/, `$1${version}`));
      ws.binaryType = "arraybuffer";
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = event => handlers.onMessage(new Uint8Array(event.data as ArrayBuffer));
      ws.onclose = event => handlers.onClose(event.code, event.reason);
      return { send: data => ws.send(data), close: (code, reason) => ws.close(code, reason) };
    },
  };
}
