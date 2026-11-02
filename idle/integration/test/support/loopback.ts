import { readFileSync } from "node:fs";
import type { SocketBridge } from "@idle/client/adapters/net/ports";
import type { Bridge } from "@idle/client/composition";
import type { ViewRoot } from "@idle/client/presentation/ui/ports";
import type { createTestServer } from "@idle/server/testing";

type Rpc = Awaited<ReturnType<typeof createTestServer>>["rpc"];

const dataDirectory = new URL("../../../shared/data-schema/data/", import.meta.url);

// 소켓 이벤트는 실제 네트워크처럼 이벤트 루프의 다음 턴에 도착한다.
function later(event: () => void): void {
  setTimeout(event, 0);
}

export interface LoopbackBridge extends Bridge {
  /** 클라이언트가 재시작을 요청한 횟수. 다음 클라이언트는 테스트가 직접 시작한다. */
  readonly restarts: number;
  /** 열린 연결을 네트워크가 끊듯이 끊는다: 양쪽 모두 닫힘(1006)을 본다. */
  drop(): void;
  /** 서버는 다음 요청을 처리하지만, 응답이 도착하기 전에 연결이 끊긴다. */
  loseNextAnswer(): void;
  /** 낸 효과음의 볼륨. 클립은 비어 있으므로 볼륨만 남긴다. */
  readonly sfx: readonly number[];
}

/**
 * 소켓이 같은 프로세스 안의 서버에 연결되고 파일은 배포된 테이블인 클라이언트 Bridge.
 * `saved`는 기기의 저장소이며, 같은 맵을 받은 클라이언트들은 같은 기기에서 도는 것으로 본다.
 */
export function createLoopbackBridge(rpc: Rpc, saved = new Map<string, string>()): LoopbackBridge {
  let dropOpen: (() => void) | undefined;
  let loseNext = false;
  let restarts = 0;
  const sfx: number[] = [];

  const socket: SocketBridge = {
    connect(_url, handlers) {
      let open = true;
      // 어느 쪽이 닫든 서버는 연결을 잊고 클라이언트는 닫힘을 전달받는다.
      const closeBoth = (code: number, reason: string) => {
        if (!open) return;
        open = false;
        connection.closed();
        later(() => handlers.onClose(code, reason));
      };
      const connection = rpc.connect({ name: "loopback", close: closeBoth });
      dropOpen = () => closeBoth(1006, "dropped");
      later(() => open && handlers.onOpen());
      return {
        send(data) {
          later(() => {
            if (!open) return;
            void connection.receive(data).then(response => {
              if (loseNext) {
                loseNext = false;
                closeBoth(1006, "the answer was lost");
              } else {
                later(() => open && handlers.onMessage(response));
              }
            });
          });
        },
        close: (code = 1000, reason = "") => closeBoth(code, reason),
      };
    },
  };
  return {
    file: { read: path => readFileSync(new URL(path.replace(/^data\//, ""), dataDirectory)) },
    socket,
    // 에셋과 인스턴스(UI, 월드)는 비워 둔다. 테스트의 뷰(support/views.ts)는 뷰모델만 보관한다.
    resources: { load: async () => ({ release() {} }), unloadUnused() {} },
    ui: {
      create: () => ({ root: {} as ViewRoot, dismiss: () => undefined, destroy() {} }),
      setBlocking: () => {},
      onBack: () => () => {},
    },
    world: { create: () => ({ root: {} as ViewRoot, setActive() {}, destroy() {} }), shake() {}, hitStop() {} },
    audio: { playBgm() {}, setBgmVolume() {}, stopBgm() {}, playSfx: (_clip, volume) => void sfx.push(volume) },
    storage: {
      get: key => saved.get(key) ?? null,
      set: (key, value) => void saved.set(key, value),
      delete: key => void saved.delete(key),
    },
    display: { setFrameRate() {}, language: () => "ko" },
    runtime: { restart: () => void restarts++ },
    get restarts() {
      return restarts;
    },
    sfx,
    drop: () => dropOpen?.(),
    loseNextAnswer: () => void (loseNext = true),
  };
}
