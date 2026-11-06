import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import type { BundleStore } from "../src/application/ports.js";
import { APP, MANIFEST, UPDATE_REQUIRED, channelPath, versionPath } from "../src/application/update/update.js";
import { runBoot, type BootBridge, type BootViews } from "../src/composition.js";
import type { AssetHandle, ViewRoot } from "../src/presentation/ui/ports.js";
import type { ConfirmViewModel, NoticeViewModel } from "../src/presentation/widgets/confirm.js";

const strings = readFileSync(new URL("../../../shared/data-schema/data/Strings.bytes", import.meta.url));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const API = "0123456789abcdef";
const SOURCE = "https://cdn.test/idle/";
const NEW_APP = { api: "fedcba9876543210", url: "https://github.com/owner/repo/releases/tag/idle-android-b5" };

/**
 * 프리팹이 바로 열리는 부트. 올린 번들은 `publish`로, 버킷의 앱 기록은 `release`로 정하고, 그 전에는 받지 못한다. 받아
 * 바꾼 번들은 설치된 것이 된다. 뷰가 받은 알림·확인 팝업의 뷰모델을 모은다.
 */
function setUp() {
  const bucket = new Map<string, string>();
  const staged = new Map<string, string>();
  const opened: string[] = [];
  const notices: NoticeViewModel[] = [];
  const confirms: ConfirmViewModel[] = [];
  let installed: string | null = null;
  const startGame = vi.fn();
  const saved = new Map<string, string>();
  const store = {
    current: () => installed,
    begin: () => staged.clear(),
    download: vi.fn(async (url: string, path: string) => {
      const text = bucket.get(url);
      if (text === undefined) throw new Error("offline");
      staged.set(path, text);
    }),
    read: (path: string) => staged.get(path)!,
    commit: () => void (installed = staged.get(MANIFEST) ?? null),
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
    openUrl: vi.fn(),
  };
  const views: BootViews = {
    transition: { prefab: "UI/TransitionScreen", layer: "overlay", bind() {} },
    notice: { prefab: "UI/NoticePopup", layer: "overlay", bind: (_scope, _root, vm) => void notices.push(vm) },
    confirm: { prefab: "UI/ConfirmPopup", layer: "overlay", bind: (_scope, _root, vm) => void confirms.push(vm) },
  };
  const sink = { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  // 파일이 없는 번들을 올린다: 앱의 채널이 그 버전을 가리킨다.
  const publish = (version: string) => {
    bucket.set(`${SOURCE}${channelPath(API)}`, JSON.stringify({ version }));
    bucket.set(`${SOURCE}${versionPath(version)}${MANIFEST}`, JSON.stringify({ version, api: API, files: [] }));
  };
  // APK를 내면 버킷에 그 앱의 기록이 남는다.
  const release = (app: { api: string; url: string }) => void bucket.set(`${SOURCE}${APP}`, JSON.stringify(app));
  // 받아 둔 번들이 있는 앱: 다음 확인에서 같은 버전이면 받지 않는다.
  const install = (version: string) => void (installed = JSON.stringify({ version, api: API, files: [] }));
  return { bridge, views, sink, opened, notices, confirms, startGame, saved, store, publish, release, install };
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
  expect(t.store.download).toHaveBeenCalledWith(`${SOURCE}v/1111111111111111/${MANIFEST}`, MANIFEST);
  expect(t.startGame).toHaveBeenCalledOnce();
  // 앱 기록이 없으므로(아직 APK를 내지 않은 버킷) 묻지 않는다.
  expect(t.confirms).toHaveLength(0);
});

test("the boot asks to open the new app's page instead of waiting for a patch when the server blocks this app", async () => {
  const t = setUp();
  t.publish("1111111111111111");
  t.install("1111111111111111");
  t.release(NEW_APP);
  t.saved.set(UPDATE_REQUIRED, "1");
  const booting = runBoot(t.bridge, { mode: "release", api: API, patch: SOURCE }, strings, t.views, t.sink);
  await vi.waitFor(() => expect(t.confirms).toHaveLength(1));
  expect(t.confirms[0].message.value).toMatch(/이 앱으로는 더 플레이할 수 없습니다/);
  expect(t.opened).toEqual(["UI/TransitionScreen on overlay", "UI/ConfirmPopup on overlay"]);
  expect(t.notices).toHaveLength(0);
  t.confirms[0].ok();
  await vi.waitFor(() => expect(t.bridge.openUrl).toHaveBeenCalledWith(NEW_APP.url));

  // 다시 시도하면 서버가 다시 판단하도록 이 앱으로도 시작하되, 그 전에 새 앱을 넘길 수 있게 알린다.
  await vi.waitFor(() => expect(t.confirms).toHaveLength(2));
  expect(t.confirms[1].message.value).toMatch(/앞으로의 업데이트는 새 앱으로만/);
  expect(t.startGame).not.toHaveBeenCalled();
  t.confirms[1].cancel();
  await booting;
  expect(t.bridge.openUrl).toHaveBeenCalledOnce();
  expect(t.startGame).toHaveBeenCalledOnce();
});

test("the boot offers the new app's page before starting and does not ask when the released app is this one", async () => {
  const t = setUp();
  t.publish("1111111111111111");
  t.release(NEW_APP);
  const booting = runBoot(t.bridge, { mode: "release", api: API, patch: SOURCE }, strings, t.views, t.sink);
  await vi.waitFor(() => expect(t.confirms).toHaveLength(1));
  t.confirms[0].ok();
  await booting;
  expect(t.bridge.openUrl).toHaveBeenCalledWith(NEW_APP.url);
  expect(t.startGame).toHaveBeenCalledOnce();

  const same = setUp();
  same.publish("1111111111111111");
  same.release({ ...NEW_APP, api: API });
  await runBoot(same.bridge, { mode: "release", api: API, patch: SOURCE }, strings, same.views, same.sink);
  expect(same.confirms).toHaveLength(0);
  expect(same.startGame).toHaveBeenCalledOnce();
});
