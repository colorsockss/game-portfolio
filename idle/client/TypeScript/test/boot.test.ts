import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import type { BundleStore } from "../src/application/ports.js";
import { MANIFEST, channelPath, versionPath } from "../src/application/update/update.js";
import { runBoot, type BootBridge, type BootViews } from "../src/composition.js";
import type { AssetHandle, ViewRoot } from "../src/presentation/ui/ports.js";
import type { NoticeViewModel } from "../src/presentation/widgets/confirm.js";

const strings = readFileSync(new URL("../../../shared/data-schema/data/Strings.bytes", import.meta.url));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const API = "0123456789abcdef";
const SOURCE = "https://cdn.test/idle/";

/**
 * 프리팹이 바로 열리는 부트. 올린 번들은 `publish`로 정하고, 그 전에는 받지 못한다. 뷰가 받은 알림 팝업의 뷰모델을
 * 모은다.
 */
function setUp() {
  let bucket = new Map<string, string>();
  const staged = new Map<string, string>();
  const opened: string[] = [];
  const notices: NoticeViewModel[] = [];
  const startGame = vi.fn();
  const saved = new Map<string, string>();
  const store = {
    current: () => null,
    begin: () => staged.clear(),
    download: vi.fn(async (url: string, path: string) => {
      const text = bucket.get(url);
      if (text === undefined) throw new Error("offline");
      staged.set(path, text);
    }),
    read: (path: string) => staged.get(path)!,
    commit() {},
    discard() {},
    // 에셋 카탈로그가 없는 번들이라 받을 에셋 번들이 없다.
    assets: async () => {},
  } as unknown as BundleStore;
  const bridge: BootBridge = {
    resources: { load: async key => ({ key, release() {} }) as AssetHandle, unloadUnused() {} },
    ui: {
      create(prefab, layer) {
        opened.push(`${(prefab as AssetHandle & { key: string }).key} on ${layer}`);
        return { root: {} as ViewRoot, dismiss: () => undefined, destroy() {} };
      },
      setBlocking() {},
      onBack: () => () => {},
    },
    storage: { get: key => saved.get(key) ?? null, set: (key, value) => void saved.set(key, value), delete: key => void saved.delete(key) },
    display: { setFrameRate() {}, language: () => "ko" },
    bundle: store,
    startGame,
  };
  const views: BootViews = {
    transition: { prefab: "UI/TransitionScreen", layer: "overlay", bind() {} },
    notice: { prefab: "UI/NoticePopup", layer: "overlay", bind: (_scope, _root, vm) => void notices.push(vm) },
  };
  const sink = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  // 파일이 없는 번들을 올린다: 앱의 채널이 그 버전을 가리킨다.
  const publish = (version: string) => {
    bucket = new Map([
      [`${SOURCE}${channelPath(API)}`, JSON.stringify({ version })],
      [`${SOURCE}${versionPath(version)}${MANIFEST}`, JSON.stringify({ version, api: API, files: [] })],
    ]);
  };
  return { bridge, views, sink, opened, notices, startGame, store, publish };
}

test("the boot starts the game at once when there is no patch source (a development build)", async () => {
  const t = setUp();
  await runBoot(t.bridge, { mode: "development", api: API }, strings, t.views, t.sink);
  expect(t.startGame).toHaveBeenCalledOnce();
  expect(t.store.download).not.toHaveBeenCalled();
  expect(t.opened).toEqual(["UI/TransitionScreen on overlay"]);
});

test("the boot asks to retry until the first patch downloads, then starts the game", async () => {
  const t = setUp();
  const booting = runBoot(t.bridge, { mode: "release", api: API, patch: SOURCE }, strings, t.views, t.sink);
  await vi.waitFor(() => expect(t.notices).toHaveLength(1));
  expect(t.notices[0].message.value).toMatch(/업데이트를 받지 못했습니다/);
  expect(t.opened).toEqual(["UI/TransitionScreen on overlay", "UI/NoticePopup on overlay"]);
  expect(t.startGame).not.toHaveBeenCalled();

  // 아무것도 바뀌지 않았으니 다시 묻는다.
  t.notices[0].ok();
  await vi.waitFor(() => expect(t.notices).toHaveLength(2));
  expect(t.store.download).toHaveBeenCalledTimes(2);
  await flush();
  expect(t.startGame).not.toHaveBeenCalled();

  // 번들이 올라왔다(파일이 없는 번들이라 포인터와 매니페스트만 받는다).
  t.publish("1111111111111111");
  t.notices[1].ok();
  await booting;
  expect(t.store.download).toHaveBeenLastCalledWith(`${SOURCE}v/1111111111111111/${MANIFEST}`, MANIFEST);
  expect(t.startGame).toHaveBeenCalledOnce();
});
