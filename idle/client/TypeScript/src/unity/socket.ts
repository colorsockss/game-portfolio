import type CS from "csharp";
import type { SocketBridge, SocketHandlers } from "../adapters/net/ports.js";
import { EVERY_FRAME } from "./frame.js";

type Generated = typeof CS.PortfolioIdleRpg.Facades.WebSocketFacade;

/**
 * 이 브리지가 쓰는 WebSocketFacade의 부분. PuerTS는 C# 참조를 null이 아닌 것으로 선언하므로,
 * C#이 실제로 넘기는 null을 여기에 적는다: 기다리는 이벤트가 없을 때의 Poll, Message가 아닌
 * 이벤트의 Data, 닫힐 때 이유가 없는 Reason. 파사드 자체는 여전히 이에 맞아야 한다(unity/bridge.ts).
 */
export interface SocketFacade extends Pick<Generated, "Opened" | "Message" | "Closed" | "Open" | "Send" | "Close"> {
  Poll(id: number): SocketEvent | null;
}

export interface SocketEvent {
  readonly Kind: number;
  readonly Data: ArrayBuffer | null;
  readonly Code: number;
  readonly Reason: string | null;
}

/**
 * C# WebSocketFacade 위에 만든 SocketBridge(adapters/net/ports.ts). 소켓은 C# 스레드에서 돌며 이벤트를
 * 큐에 쌓는다. 소켓이 하나라도 열려 있는 동안은 매 프레임 JavaScript를 실행하는 스레드에서 이벤트를
 * 여기로 가져와 SocketHandlers에 넘긴다.
 */
export function createSocketBridge(facade: SocketFacade): SocketBridge {
  const { Opened, Message } = facade;
  const open = new Map<number, SocketHandlers>();
  let polling: ReturnType<typeof setInterval> | undefined;

  function poll(): void {
    for (const [id, handlers] of open) {
      for (let event = facade.Poll(id); event !== null; event = facade.Poll(id)) {
        const { Kind } = event;
        if (Kind === Opened) deliver(() => handlers.onOpen());
        else if (Kind === Message) deliver(() => handlers.onMessage(new Uint8Array(event.Data!)));
        else {
          open.delete(id);
          deliver(() => handlers.onClose(event.Code, event.Reason ?? ""));
          break;
        }
      }
    }
    if (open.size === 0) {
      clearInterval(polling);
      polling = undefined;
    }
  }

  return {
    connect(url, handlers) {
      const id = facade.Open(url);
      open.set(id, handlers);
      polling ??= setInterval(poll, EVERY_FRAME);
      return {
        send: data => facade.Send(id, bufferOf(data)),
        close: (code = 1000, reason = "") => facade.Close(id, code, reason),
      };
    },
  };
}

// 핸들러가 throw해도 이 소켓의 다른 이벤트나 다른 소켓의 이벤트를 막아서는 안 된다.
function deliver(handle: () => void): void {
  try {
    handle();
  } catch (error) {
    console.error("[socket] A handler failed:", error);
  }
}

// PuerTS는 C#에 ArrayBuffer 전체를 넘기므로, 더 큰 버퍼의 일부를 가리키는 뷰는 먼저 복사해 낸다.
function bufferOf(data: Uint8Array): ArrayBuffer {
  const whole = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength;
  return (whole ? data.buffer : data.slice().buffer) as ArrayBuffer;
}
