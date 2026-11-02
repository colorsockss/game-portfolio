// 네트워크 어댑터가 엔진에 바라는 것: WebSocket. Unity가 구현하고(unity/socket.ts), 테스트는
// TypeScript로 구현하므로 어댑터는 Unity 없이 돈다.

/** WebSocket. 이벤트는 onClose까지 핸들러로 도착하고, onClose는 정확히 한 번 불린다. */
export interface SocketBridge {
  connect(url: string, handlers: SocketHandlers): SocketHandle;
}

export interface SocketHandlers {
  onOpen(): void;
  onMessage(data: Uint8Array): void;
  /** 연결을 열지 못했을 때도 불린다(1006). */
  onClose(code: number, reason: string): void;
}

export interface SocketHandle {
  send(data: Uint8Array): void;
  close(code?: number, reason?: string): void;
}
