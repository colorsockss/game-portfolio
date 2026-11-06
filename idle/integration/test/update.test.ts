import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { BundleStore } from "@idle/client/application/ports";
import { UPDATE_REQUIRED, channelPath, versionPath } from "@idle/client/application/update/update";
import { runBoot, startApp } from "@idle/client/composition";
import type { NoticeViewModel } from "@idle/client/presentation/widgets/confirm";
import { PROTOCOL_VERSION } from "@idle/protocol";
import { createTestServer, loadTestData } from "@idle/server/testing";
import { createGameServer } from "@idle/server/transport";
import { expect, test, vi } from "vitest";
import { createLoopbackBridge } from "./support/loopback.js";
import { captureViews } from "./support/views.js";
import { createWebSocketBridge } from "./support/websocket.js";

const data = await loadTestData();
const quiet = { log() {}, warn() {}, error() {} };

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
// 앱의 C# API 지문(부트 번들의 RUNTIME_API).
const API = "0123456789abcdef";

/** 파일 내용으로 만든 번들의 버전, 매니페스트(JSON)와 파일. */
function bundle(files: Record<string, string>): { readonly version: string; readonly manifest: string; readonly files: Record<string, string> } {
  const listed = Object.entries(files).map(([path, text]) => ({ path, size: text.length, sha256: sha256(text) }));
  const version = sha256(JSON.stringify(listed)).slice(0, 16);
  return { version, manifest: JSON.stringify({ version, api: API, files: listed }), files };
}

/**
 * 메모리의 번들 저장소. `installed`는 설치된 번들, `cdn`은 올린 번들의 주소 → 내용이고, `corrupt`는 받을 때 내용을 바꿀
 * 경로다. 바꾸면 `committed`가 받는 곳이 된다.
 */
function bundleStore(installed: ReturnType<typeof bundle>, cdn: Map<string, string>, corrupt?: string) {
  let staging = new Map<string, string>();
  const swapped = { committed: undefined as Map<string, string> | undefined };
  const store: BundleStore = {
    current: () => installed.manifest,
    begin: () => void (staging = new Map()),
    async download(url, path) {
      const text = cdn.get(url);
      if (text === undefined) throw new Error(`404 ${url}`);
      staging.set(path, path === corrupt ? `${text}!` : text);
    },
    reuse: path => void staging.set(path, installed.files[path]),
    read: path => staging.get(path)!,
    digest(path) {
      const text = staging.get(path);
      return text === undefined ? null : { size: text.length, sha256: sha256(text) };
    },
    commit: () => void (swapped.committed = staging),
    discard: () => void (staging = new Map()),
    // 에셋 카탈로그가 없는 번들이라 받을 에셋 번들이 없다.
    assets: async () => {},
  };
  return Object.assign(swapped, { store });
}

// 게임이 떠 있는 동안 서버가 새 프로토콜 버전으로, 게임 번들이 그에 맞는 버전으로 함께 배포됐다. 서버는 실제 WebSocket
// 서버(transport)의 버전 검사로 연결을 닫고, 게임은 Update로 가서 표시를 남기고 처음(부트)부터 다시 시작한다. 부트는 모든
// 파일이 매니페스트와 맞을 때만 설치된 번들로 바꾸고 게임을 시작하며, 하나라도 다르면 설치된 번들을 두고 다시 시도를 묻는다.
test.each([
  { outcome: "installs the published bundle and starts the game", corrupt: undefined },
  { outcome: "keeps its bundle and asks to retry when a file fails verification", corrupt: "main.mjs" },
])("an outdated client closed by the server's version check restarts into the boot, which $outcome", async ({ corrupt }) => {
  const { rpc } = await createTestServer(data);
  const transport = createGameServer(rpc, { log: { debug() {}, info() {}, warn() {}, error() {} }, dataVersion: data.version });
  await new Promise<void>(resolve => transport.http.listen(0, "127.0.0.1", resolve));
  try {
    const installed = bundle({ "main.mjs": "code 1", "data/Stages.bytes": "stages" });
    const next = bundle({ "main.mjs": "code 2", "data/Stages.bytes": "stages" });
    const saved = new Map<string, string>();
    const loopback = createLoopbackBridge(rpc, saved);
    const bridge = { ...loopback, socket: createWebSocketBridge(PROTOCOL_VERSION - 1) };
    const server = `ws://127.0.0.1:${(transport.http.address() as AddressInfo).port}`;
    const app = await startApp(bridge, { server, mode: "release" }, captureViews().views, quiet);
    app.start();
    await vi.waitFor(() => expect(app.state.flow.value).toBe("login"));
    void app.account.login("hero");
    await vi.waitFor(() => expect(loopback.restarts).toBe(1));
    expect(app.state.network.value.ended).toBe("update");
    expect(app.state.flow.value).toBe("update");
    expect(saved.get(UPDATE_REQUIRED)).toBe("1");

    // 다시 시작한 부트가 같은 기기의 저장소로 패치를 받는다. 앱의 채널이 새 버전을 가리킨다.
    const folder = `https://cdn.test/${versionPath(next.version)}`;
    const cdn = new Map([
      [`https://cdn.test/${channelPath(API)}`, JSON.stringify({ version: next.version })],
      [`${folder}manifest.json`, next.manifest],
      [`${folder}main.mjs`, next.files["main.mjs"]],
    ]);
    const bundles = bundleStore(installed, cdn, corrupt);
    const notices: NoticeViewModel[] = [];
    const startGame = vi.fn();
    const views = {
      transition: { prefab: "UI/TransitionScreen", layer: "overlay", bind() {} },
      notice: { prefab: "UI/NoticePopup", layer: "overlay", bind: (_scope: unknown, _root: unknown, vm: NoticeViewModel) => void notices.push(vm) },
      // 버킷에 앱 기록이 없으므로 새 앱을 묻지 않는다.
      confirm: { prefab: "UI/ConfirmPopup", layer: "overlay", bind: () => expect.unreachable("asked about a new app") },
    } as const;
    const strings = loopback.file.read("data/Strings.bytes") as Uint8Array;
    const booting = runBoot({ ...loopback, bundle: bundles.store, startGame, openUrl: vi.fn() }, { mode: "release", api: API, patch: "https://cdn.test/" }, strings, views, quiet);
    if (corrupt) {
      await vi.waitFor(() => expect(notices).toHaveLength(1));
      expect(bundles.committed).toBeUndefined();
      expect(startGame).not.toHaveBeenCalled();
    } else {
      await booting;
      expect(Object.fromEntries(bundles.committed!)).toEqual({ ...next.files, "manifest.json": next.manifest });
      expect(startGame).toHaveBeenCalledOnce();
      expect(notices).toEqual([]);
    }
    expect(saved.has(UPDATE_REQUIRED)).toBe(false);
  } finally {
    await transport.close();
  }
});

test("a client of the server's protocol version logs in over a real WebSocket and its command is confirmed", async () => {
  const { rpc, store } = await createTestServer(data);
  const transport = createGameServer(rpc, { log: { debug() {}, info() {}, warn() {}, error() {} }, dataVersion: data.version });
  await new Promise<void>(resolve => transport.http.listen(0, "127.0.0.1", resolve));
  try {
    const bridge = { ...createLoopbackBridge(rpc), socket: createWebSocketBridge() };
    const server = `ws://127.0.0.1:${(transport.http.address() as AddressInfo).port}`;
    const app = await startApp(bridge, { server, mode: "release" }, captureViews().views, quiet);
    app.start();
    await app.account.login("hero");
    await vi.waitFor(() => expect(app.state.flow.value).toBe("main"));
    expect(await app.progress.cmd.TutorialAdvance({ stepId: 1 })).toBeUndefined();
    const saved = await store.load((await store.findAccount("hero"))!.id);
    expect(saved).toMatchObject({ revision: 2, player: { tutorial: { stepId: 2 } } });
    expect(app.state.player.value).toEqual(saved!.player);
  } finally {
    await transport.close();
  }
});
