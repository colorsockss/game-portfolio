import { createHash } from "node:crypto";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { BundleStore } from "../src/application/ports.js";
import {
  APP, MANIFEST, UPDATE_REQUIRED, channelPath, createUpdater, parseApp, parseManifest, parsePointer, planUpdate, requestUpdate,
  versionPath,
  type Manifest, type UpdateState, type UpdateStatus,
} from "../src/application/update/update.js";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// 앱의 C# API 지문과 다른 앱의 것.
const API = "0123456789abcdef";
const OTHER_API = "fedcba9876543210";
const SOURCE = "https://cdn.test/idle/";

type Bundle = { readonly files: Record<string, string>; readonly manifest: Manifest };

/** 파일 내용으로 만든 번들: 경로 → 내용과 그 매니페스트. */
function bundle(version: string, files: Record<string, string>, api = API): Bundle {
  return {
    files,
    manifest: {
      version,
      api,
      files: Object.entries(files).map(([path, text]) => ({ path, size: text.length, sha256: sha256(text) })),
    },
  };
}

const v1 = bundle("1111111111111111", { "main.mjs": "code 1", "data/Items.bytes": "items", "data/Stages.bytes": "stages 1" });
const v2 = bundle("2222222222222222", { "main.mjs": "code 2", "data/Items.bytes": "items", "data/Stages.bytes": "stages 2" });

/** 버킷의 주소 → 내용. 앱의 채널이 `pointer`(기본은 번들의 버전)를 가리키고, 번들은 그 버전의 폴더에 있다. */
function published(remote: Bundle | undefined, pointer = remote?.manifest.version): Map<string, string> {
  if (remote === undefined || pointer === undefined) return new Map();
  const folder = `${SOURCE}${versionPath(pointer)}`;
  return new Map([
    [`${SOURCE}${channelPath(API)}`, JSON.stringify({ version: pointer })],
    [`${folder}${MANIFEST}`, JSON.stringify(remote.manifest)],
    ...Object.entries(remote.files).map(([path, text]) => [`${folder}${path}`, text] as const),
  ]);
}

describe("parsePointer", () => {
  test("reads a channel pointer", () => {
    expect(parsePointer(JSON.stringify({ version: v1.manifest.version }))).toEqual({ version: v1.manifest.version });
  });

  test.each([["not an object", "null"], ["no version", "{}"], ["a version that is not 16 hex digits", JSON.stringify({ version: "v1" })]])(
    "refuses %s",
    (_case, text) => expect(() => parsePointer(text)).toThrow(/pointer is malformed/),
  );
});

describe("parseManifest", () => {
  test("reads a manifest", () => {
    expect(parseManifest(JSON.stringify(v1.manifest))).toEqual(v1.manifest);
  });

  test.each([
    ["not an object", "[]"],
    ["no version", JSON.stringify({ api: API, files: [] })],
    ["no API", JSON.stringify({ version: "x", files: [] })],
    ["a path outside the bundle", JSON.stringify({ version: "x", api: API, files: [{ path: "../main.mjs", size: 1, sha256: sha256("a") }] })],
    ["an absolute path", JSON.stringify({ version: "x", api: API, files: [{ path: "/main.mjs", size: 1, sha256: sha256("a") }] })],
    ["the manifest itself", JSON.stringify({ version: "x", api: API, files: [{ path: MANIFEST, size: 1, sha256: sha256("a") }] })],
    ["a short hash", JSON.stringify({ version: "x", api: API, files: [{ path: "main.mjs", size: 1, sha256: "abc" }] })],
    ["a negative size", JSON.stringify({ version: "x", api: API, files: [{ path: "main.mjs", size: -1, sha256: sha256("a") }] })],
    ["a path twice", JSON.stringify({ version: "x", api: API, files: [v1.manifest.files[0], v1.manifest.files[0]] })],
  ])("refuses %s", (_case, text) => {
    expect(() => parseManifest(text)).toThrow();
  });
});

describe("parseApp", () => {
  const url = "https://github.com/owner/repo/releases/tag/idle-android-b5";

  test("reads an app record", () => {
    expect(parseApp(JSON.stringify({ api: OTHER_API, url }))).toEqual({ api: OTHER_API, url });
  });

  test.each([
    ["not an object", "null"],
    ["an API that is not 16 hex digits", JSON.stringify({ api: "x", url })],
    ["no link", JSON.stringify({ api: OTHER_API })],
    ["a link that is not https", JSON.stringify({ api: OTHER_API, url: "intent://install" })],
  ])("refuses %s", (_case, text) => expect(() => parseApp(text)).toThrow(/app record is malformed/));
});

test("planUpdate downloads what changed and copies the rest", () => {
  const { reuse, download } = planUpdate(v1.manifest, v2.manifest);
  expect(reuse.map(file => file.path)).toEqual(["data/Items.bytes"]);
  expect(download.map(file => file.path)).toEqual(["main.mjs", "data/Stages.bytes"]);
});

/**
 * 메모리의 번들 저장소. `installed`는 설치된 번들, `remote`는 올린 번들이고(`pointer`는 채널이 가리키는 버전, 기본은
 * 그 번들의 버전), `corrupt`는 받을 때 내용을 바꿀 파일이다. `damaged`는 설치된 번들에서 내용이 깨진 파일, `lost`는 사라진 파일이다.
 * 바꾸면 `committed`가 받는 곳이 되고 설치된 번들도 그것이 된다. `required`는 게임이 남긴 UPDATE_REQUIRED다. `assets`는
 * 카탈로그의 에셋 번들 중 캐시에 없는 바이트이고, 음수면 받지 못한다. `app`은 버킷의 앱 기록(없으면 받지 못함)이다.
 */
function setUp(
  installed: Bundle | null, remote: Bundle | undefined,
  { corrupt, damaged, lost, required = false, assets = 0, pointer, app }: {
    corrupt?: string; damaged?: string; lost?: string; required?: boolean; assets?: number; pointer?: string; app?: string;
  } = {},
) {
  const bucket = published(remote, pointer);
  if (app !== undefined) bucket.set(`${SOURCE}${APP}`, app);
  const update = signal<UpdateState>({ status: "idle", received: 0, total: 0 });
  const statuses: UpdateStatus[] = [];
  update.subscribe(value => statuses.push(value.status));
  const requested: string[] = [];
  let staging: Map<string, string> | undefined;
  let committed: Map<string, string> | undefined;
  // 에셋 번들을 미리 받은 카탈로그: 받는 곳(staged)이면 "staging", 설치된 것이면 "installed".
  const prefetched: string[] = [];
  const store: BundleStore = {
    current: () => (committed ? committed.get(MANIFEST)! : installed ? JSON.stringify(installed.manifest) : null),
    begin: () => void (staging = new Map()),
    async download(url, path) {
      requested.push(url);
      const text = bucket.get(url);
      if (text === undefined) throw new Error(`404 ${url}`);
      staging!.set(path, path === corrupt ? `${text}!` : text);
    },
    reuse(path) {
      if (path === lost) throw new Error(`No installed ${path}.`);
      staging!.set(path, path === damaged ? `${installed!.files[path]}?` : installed!.files[path]);
    },
    read: path => staging!.get(path)!,
    digest(path) {
      const text = staging!.get(path);
      return text === undefined ? null : { size: text.length, sha256: sha256(text) };
    },
    commit() {
      committed = staging;
      staging = undefined;
    },
    discard: () => void (staging = undefined),
    async assets(staged, progress) {
      prefetched.push(staged ? "staging" : "installed");
      if (assets < 0) throw new Error("no asset bundles");
      progress(0, assets);
      progress(assets, assets);
    },
  };
  const saved = new Map<string, string>(required ? [[UPDATE_REQUIRED, "1"]] : []);
  const storage = { get: (key: string) => saved.get(key) ?? null, set: (key: string, value: string) => void saved.set(key, value), delete: (key: string) => void saved.delete(key) };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const updater = createUpdater({ store, source: SOURCE, api: API, update, storage, logger });
  return { update, statuses, requested, prefetched, updater, logger, saved, staging: () => staging, committed: () => committed };
}

describe("the updater", () => {
  test("tells of a released app with another API after the check and empties the staging area", async () => {
    const url = "https://github.com/owner/repo/releases/tag/idle-android-b5";
    const t = setUp(v1, v1, { app: JSON.stringify({ api: OTHER_API, url }) });
    expect(await t.updater.check()).toBe(true);
    expect(await t.updater.newApp()).toEqual({ api: OTHER_API, url });
    expect(t.requested.at(-1)).toBe(`${SOURCE}channels/app/Android.json`);
    expect(t.staging()).toBeUndefined();
    expect(t.committed()).toBeUndefined();
  });

  test.each([
    ["the released app is this one", JSON.stringify({ api: API, url: "https://example.test/app" })],
    ["no app is recorded", undefined],
    ["the record is malformed", "{"],
  ])("tells of no new app when %s", async (_case, app) => {
    const t = setUp(v1, v1, { app });
    expect(await t.updater.check()).toBe(true);
    expect(await t.updater.newApp()).toBeNull();
    expect(t.staging()).toBeUndefined();
  });

  test("downloads only the changed files, verifies every file, installs the bundle and lets the game start", async () => {
    const t = setUp(v1, v2);
    expect(await t.updater.check()).toBe(true);
    // 채널 포인터를 따라 버전 폴더에서 받는다. 폴더가 바뀌지 않으므로 주소에 해시를 붙이지 않는다.
    const folder = `${SOURCE}v/${v2.manifest.version}/`;
    expect(t.requested).toEqual([
      `${SOURCE}channels/Android/${API}.json`, `${folder}manifest.json`, `${folder}main.mjs`, `${folder}data/Stages.bytes`,
    ]);
    expect(Object.fromEntries(t.committed()!)).toEqual({ ...v2.files, [MANIFEST]: JSON.stringify(v2.manifest) });
    expect(t.statuses).toEqual(["idle", "checking", "downloading", "downloading", "downloading", "updated"]);
    expect(t.update.value).toEqual({ status: "updated", received: 0, total: 0 });
  });

  test("downloads the new catalog's asset bundles before installing, continuing the progress after the files", async () => {
    const t = setUp(v1, v2, { assets: 1000 });
    const progress: [number, number][] = [];
    t.update.subscribe(value => value.status === "downloading" && progress.push([value.received, value.total]));
    expect(await t.updater.check()).toBe(true);
    const files = "code 2".length + "stages 2".length;
    expect(progress.slice(-2)).toEqual([[files, files + 1000], [files + 1000, files + 1000]]);
    expect(t.prefetched).toEqual(["staging"]);
    expect(t.committed()).toBeDefined();
    expect(t.logger.info).toHaveBeenCalledWith("assets: 1000 bytes downloaded");
  });

  test("does not install the bundle when its asset bundles cannot be downloaded", async () => {
    const t = setUp(v1, v2, { assets: -1 });
    expect(await t.updater.check()).toBe(true);
    expect(t.committed()).toBeUndefined();
    expect(t.update.value.status).toBe("failed");
  });

  test("downloads every file on the first run, when nothing is installed", async () => {
    const t = setUp(null, v1);
    expect(await t.updater.check()).toBe(true);
    expect(t.requested).toHaveLength(2 + v1.manifest.files.length);
    expect(Object.fromEntries(t.committed()!)).toEqual({ ...v1.files, [MANIFEST]: JSON.stringify(v1.manifest) });
    const total = "code 1".length + "items".length + "stages 1".length;
    expect(t.logger.info).toHaveBeenCalledWith(`none -> ${v1.manifest.version}: 3 files, ${total} bytes downloaded`);
  });

  test("reports the bytes received against the bytes to download", async () => {
    const t = setUp(v1, v2);
    const progress: number[] = [];
    t.update.subscribe(value => value.status === "downloading" && progress.push(value.received));
    await t.updater.check();
    const total = "code 2".length + "stages 2".length;
    expect(progress).toEqual([0, "code 2".length, total]);
  });

  test("starts the installed bundle when the channel points at it, fetching its asset bundles the cache lost", async () => {
    const t = setUp(v1, v1);
    expect(await t.updater.check()).toBe(true);
    // 바뀐 것이 없는 확인은 채널 포인터 하나만 받는다.
    expect(t.requested).toEqual([`${SOURCE}channels/Android/${API}.json`]);
    expect(t.staging()).toBeUndefined();
    expect(t.update.value.status).toBe("current");
    expect(t.prefetched).toEqual(["installed"]);
  });

  test.each([["damaged", { damaged: "main.mjs" }], ["lost", { lost: "main.mjs" }]])(
    "downloads an installed file that is %s again though the channel still points at the installed bundle",
    async (_case, broken) => {
      const t = setUp(v1, v1, broken);
      expect(await t.updater.check()).toBe(true);
      const folder = `${SOURCE}v/${v1.manifest.version}/`;
      expect(t.requested).toEqual([`${SOURCE}channels/Android/${API}.json`, `${folder}manifest.json`, `${folder}main.mjs`]);
      expect(Object.fromEntries(t.committed()!)).toEqual({ ...v1.files, [MANIFEST]: JSON.stringify(v1.manifest) });
      expect(t.update.value.status).toBe("updated");
      expect(t.logger.warn).toHaveBeenCalledWith("The installed bundle is damaged (main.mjs); downloading it again.");
    },
  );

  test("downloads an unchanged file whose installed copy is damaged instead of failing every later update", async () => {
    const t = setUp(v1, v2, { damaged: "data/Items.bytes" });
    expect(await t.updater.check()).toBe(true);
    expect(t.requested.at(-1)).toBe(`${SOURCE}v/${v2.manifest.version}/data/Items.bytes`);
    expect(Object.fromEntries(t.committed()!)).toEqual({ ...v2.files, [MANIFEST]: JSON.stringify(v2.manifest) });
  });

  test("keeps and starts the installed bundle when a file fails verification", async () => {
    const t = setUp(v1, v2, { corrupt: "data/Stages.bytes" });
    expect(await t.updater.check()).toBe(true);
    expect(t.committed()).toBeUndefined();
    expect(t.staging()).toBeUndefined();
    expect(t.update.value.status).toBe("failed");
    expect(t.logger.warn).toHaveBeenCalledWith("Keeping the installed bundle:", expect.objectContaining({
      message: "data/Stages.bytes does not match the manifest.",
    }));
  });

  test("keeps the installed bundle when the server cannot be reached or the manifest is malformed", async () => {
    const unreachable = setUp(v1, undefined);
    expect(await unreachable.updater.check()).toBe(true);
    expect(unreachable.update.value.status).toBe("failed");

    const malformed = setUp(v1, bundle("", {}));
    expect(await malformed.updater.check()).toBe(true);
    expect(malformed.committed()).toBeUndefined();
    expect(malformed.update.value.status).toBe("failed");
  });

  test.each([
    ["a manifest of another API", bundle(v2.manifest.version, v2.files, OTHER_API), undefined],
    ["a manifest of another version than the pointer", v2, "3333333333333333"],
  ])("keeps the installed bundle when the channel leads to %s", async (_case, remote, pointer) => {
    const t = setUp(v1, remote, { pointer });
    expect(await t.updater.check()).toBe(true);
    expect(t.logger.warn).toHaveBeenCalledWith("Keeping the installed bundle:", expect.objectContaining({
      message: expect.stringMatching(/is not the channel's/),
    }));
    expect(t.committed()).toBeUndefined();
    expect(t.update.value.status).toBe("failed");
  });

  test("reads an installed manifest of an older format as nothing and downloads every file", async () => {
    const old = { files: v1.files, manifest: { version: "v1", files: v1.manifest.files } as unknown as Manifest };
    const t = setUp(old, v2);
    expect(await t.updater.check()).toBe(true);
    expect(t.requested).toHaveLength(2 + v2.manifest.files.length);
    expect(t.update.value.status).toBe("updated");
  });

  test("does not start an installed bundle of another API when the patch cannot be checked", async () => {
    const t = setUp(bundle(v1.manifest.version, v1.files, OTHER_API), undefined);
    expect(await t.updater.check()).toBe(false);
    expect(t.update.value.status).toBe("failed");
  });

  test("cannot start the game when the first download fails", async () => {
    const t = setUp(null, undefined);
    expect(await t.updater.check()).toBe(false);
    expect(t.update.value.status).toBe("failed");
    expect(t.committed()).toBeUndefined();
  });

  test("waits once for the player when the server needed a newer client and none is published", async () => {
    const t = setUp(v1, v1, { required: true });
    expect(await t.updater.check()).toBe(false);
    expect(t.update.value.status).toBe("required");
    // 표시는 한 번만 막는다. 다시 시도하면 게임을 시작해 서버가 다시 판단한다.
    expect(t.saved.has(UPDATE_REQUIRED)).toBe(false);
    expect(await t.updater.check()).toBe(true);
    expect(t.update.value.status).toBe("current");

    const failing = setUp(v1, undefined, { required: true });
    expect(await failing.updater.check()).toBe(false);
    expect(failing.update.value.status).toBe("failed");
  });

  test("starts the game when the needed newer client is published", async () => {
    const t = setUp(v1, v2, { required: true });
    expect(await t.updater.check()).toBe(true);
    expect(t.update.value.status).toBe("updated");
    expect(t.saved.has(UPDATE_REQUIRED)).toBe(false);
  });

  test("is current at once without a source (a development build)", async () => {
    const update = signal<UpdateState>({ status: "idle", received: 0, total: 0 });
    const store = { current: vi.fn(() => JSON.stringify(v1.manifest)) } as unknown as BundleStore;
    const storage = { get: () => null, set: vi.fn(), delete: vi.fn() };
    const updater = createUpdater({ store, source: undefined, api: API, update, storage, logger: console });
    expect(await updater.newApp()).toBeNull();
    expect(await updater.check()).toBe(true);
    expect(update.value.status).toBe("current");
    expect(store.current).not.toHaveBeenCalled();
  });
});

test("requestUpdate marks the update as required and restarts from the boot", () => {
  const storage = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
  const runtime = { restart: vi.fn() };
  requestUpdate(storage, runtime);
  expect(storage.set).toHaveBeenCalledWith(UPDATE_REQUIRED, "1");
  expect(runtime.restart).toHaveBeenCalledOnce();
});
