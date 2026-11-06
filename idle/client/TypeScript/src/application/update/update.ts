import type { Signal } from "@preact/signals-core";
import type { AppRuntime, BundleStore, DeviceStorage, Logger } from "../ports.js";

/** 번들 파일 하나: 번들 디렉터리 기준 경로(`/`로 나눔), 크기, SHA-256(소문자 16진수). */
export interface BundleFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

/**
 * 번들의 매니페스트. 릴리스 빌드가 버킷의 `v/<버전>/`에 만든다(client/TypeScript/tools/manifest.mjs). `version`은 파일
 * 목록과 `api`에서 나오므로 둘이 같으면 버전도 같다. 빌드 번호와 커밋도 적히지만 기록용이라 읽지 않는다.
 */
export interface Manifest {
  readonly version: string;
  /** 번들이 맞춰 빌드된 C# API의 지문(RUNTIME_API). 앱의 것과 같아야 돈다. */
  readonly api: string;
  readonly files: readonly BundleFile[];
}

/** 매니페스트 자신의 경로. 번들 안에 함께 있고 목록에는 없다. */
export const MANIFEST = "manifest.json";

// 받는 곳에 채널 포인터를 잠시 받아 두는 경로. 읽은 뒤 받는 곳을 비우므로 번들에 남지 않는다.
const POINTER = "channel.json";

// 받는 곳에 앱 기록을 잠시 받아 두는 경로. 포인터처럼 읽은 뒤 받는 곳을 비운다.
const APP_FILE = "app.json";

const SHA256 = /^[0-9a-f]{64}$/;
const VERSION = /^[0-9a-f]{16}$/;
const API = /^[0-9a-f]{16}$/;

/**
 * 패치를 내보내는 플랫폼. Android만 내보낸다(docs/superpowers/specs/2026-10-30-patch-design.md). 버킷의 채널 포인터와 에셋
 * 번들(`aa/<플랫폼>/`)이 이 이름 아래에 있다. 도구(tools/update.mjs)도 이 레이아웃을 그대로 쓴다.
 */
export const PLATFORM = "Android";

/** 채널 포인터가 모인 버킷의 폴더. */
export const CHANNELS = `channels/${PLATFORM}/`;

/** 버킷의 채널 포인터 경로. API 지문마다 하나이고(`{ "version": … }`), 올린 뒤 다시 쓰는 파일은 이것뿐이다. */
export const channelPath = (api: string) => `${CHANNELS}${api}.json`;

/** 버전의 게임 파일(매니페스트, 코드, 표, 에셋 카탈로그)이 있는 버킷의 폴더. 한 번 쓰면 바뀌지 않는다. */
export const versionPath = (version: string) => `v/${version}/`;

/** 버전의 모양(매니페스트 해시의 16진수 16자리)인지. */
export const isVersion = (value: string) => VERSION.test(value);

/**
 * 마지막으로 낸 앱(APK)의 기록. 버킷의 APP에 있고 APK를 낼 때마다 다시 쓴다(tools/patch.mjs app). 이 앱과 API가 다르면 이 앱의
 * 채널은 더 움직이지 않으므로, 새 앱을 설치해야 업데이트를 받는다.
 */
export interface AppRelease {
  /** 그 앱의 C# API 지문. */
  readonly api: string;
  /** 그 앱을 내려받는 페이지(https). */
  readonly url: string;
}

/** 버킷의 앱 기록 경로. 채널 포인터처럼 다시 쓰므로 캐시하지 않는 channels/ 아래에 두되, 포인터의 폴더(CHANNELS)와는 나눈다. */
export const APP = `channels/app/${PLATFORM}.json`;

/** 앱 기록을 검사해 읽는다. 받아 온 주소를 브라우저로 열므로 https만 받는다. 틀리면 throw한다. */
export function parseApp(text: string): AppRelease {
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) || typeof value.api !== "string" || !API.test(value.api)
    || typeof value.url !== "string" || !value.url.startsWith("https://")
  ) {
    throw new Error(`The app record is malformed: ${text}`);
  }
  return { api: value.api, url: value.url };
}

/** 채널 포인터를 검사해 읽는다. 틀리면 throw한다. */
export function parsePointer(text: string): { readonly version: string } {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || typeof value.version !== "string" || !isVersion(value.version)) {
    throw new Error(`The channel pointer is malformed: ${text}`);
  }
  return { version: value.version };
}

/**
 * 매니페스트를 검사해 읽는다. 받아 온 것이므로 모양을 모두 확인하고, 경로는 번들 밖이나 매니페스트 자신을 가리킬 수
 * 없다. 틀리면 throw한다.
 */
export function parseManifest(text: string): Manifest {
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) || typeof value.version !== "string" || value.version === ""
    || typeof value.api !== "string" || value.api === "" || !Array.isArray(value.files)
  ) {
    throw new Error("The manifest is malformed.");
  }
  const paths = new Set<string>();
  const files = value.files.map((file: unknown): BundleFile => {
    if (
      !isRecord(file) || typeof file.path !== "string" || !isBundlePath(file.path) || paths.has(file.path)
      || typeof file.size !== "number" || !Number.isSafeInteger(file.size) || file.size < 0
      || typeof file.sha256 !== "string" || !SHA256.test(file.sha256)
    ) {
      throw new Error(`The manifest has a malformed file: ${JSON.stringify(file)}.`);
    }
    paths.add(file.path);
    return { path: file.path, size: file.size, sha256: file.sha256 };
  });
  return { version: value.version, api: value.api, files };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// 번들 안의 상대 경로: 빈 조각, `.`, `..`, 역슬래시가 없다. C#(SafePath)도 번들 밖을 막는다.
function isBundlePath(path: string): boolean {
  return path !== MANIFEST && path.split("/").every(part => part !== "" && part !== "." && part !== ".." && !part.includes("\\"));
}

/** 다음 번들의 파일을 지금 번들에서 복사할 것(같은 경로에 같은 해시)과 받을 것으로 나눈다. */
export function planUpdate(current: Manifest, next: Manifest): { readonly reuse: BundleFile[]; readonly download: BundleFile[] } {
  const have = new Map(current.files.map(file => [file.path, file.sha256]));
  return {
    reuse: next.files.filter(file => have.get(file.path) === file.sha256),
    download: next.files.filter(file => have.get(file.path) !== file.sha256),
  };
}

/**
 * 패치의 진행. idle: 아직 확인하지 않음. checking: 채널 포인터와 올린 번들의 매니페스트를 받는 중. downloading: 바뀐 파일을 받는 중.
 * updated: 새 번들로 바꿨고 그것으로 게임을 시작함. current: 설치된 번들이 최신이거나 패치를 쓰지 않음(개발 빌드). failed:
 * 확인하거나 받지 못함. required: 서버가 새 클라이언트를 요구했는데 올린 번들이 설치된 것과 같음.
 */
export type UpdateStatus = "idle" | "checking" | "downloading" | "updated" | "current" | "failed" | "required";

export interface UpdateState {
  readonly status: UpdateStatus;
  /** downloading 동안 받은 바이트와 받을 바이트. */
  readonly received: number;
  readonly total: number;
}

/**
 * 게임이 서버에게 새 클라이언트를 요구받았다는 표시(DeviceStorage의 키). 게임이 적고 다시 시작하면, 부트의 다음 확인이
 * 읽고 지운다. 새 번들을 받지 못했으면 게임을 저절로 시작하지 않고 플레이어가 다시 시도하기를 기다린다.
 */
export const UPDATE_REQUIRED = "updateRequired";

/** 게임 쪽: 서버가 새 클라이언트를 요구한다. 표시를 남기고 처음(부트)부터 다시 시작해 패치를 받는다. */
export function requestUpdate(storage: DeviceStorage, runtime: AppRuntime): void {
  storage.set(UPDATE_REQUIRED, "1");
  runtime.restart();
}

// 설치된 번들이 없는 첫 실행: 모든 파일을 받는다.
const NOTHING: Manifest = { version: "", api: "", files: [] };

export interface UpdaterOptions {
  readonly store: BundleStore;
  /** 패치 버킷의 주소(끝이 `/`). 그 아래가 channelPath와 versionPath의 레이아웃이다. 없으면 패치하지 않는다(개발 빌드). */
  readonly source: string | undefined;
  /** 앱의 C# API 지문. 이 API의 채널을 따르고, 다른 API의 번들은 받지도 시작하지도 않는다. */
  readonly api: string;
  /** 업데이트 슬라이스. 업데이트가 유일한 쓰기 주체다. */
  readonly update: Signal<UpdateState>;
  /** 게임이 남긴 UPDATE_REQUIRED를 읽고 지운다. */
  readonly storage: DeviceStorage;
  readonly logger: Logger;
}

export interface Updater {
  /**
   * 게임을 시작해도 되는지 맞춘다. 올린 번들이 설치된 것과 다르면 바뀐 파일만 받고, 모든 파일을 매니페스트로 검증한 뒤
   * 설치된 번들로 바꾼다. 진행은 `update` 슬라이스에 있다. 받지 못하면 설치된 번들을 그대로 두고, 그것이 이 앱의 API로
   * 빌드된 것이면 그것으로 시작한다. 시작해도 되면 true이고, false면(받지 못했는데 시작할 번들이 없거나, 서버가 요구한 새
   * 번들이 없음) 플레이어가 다시 시도하면 다시 부른다.
   */
  check(): Promise<boolean>;
  /**
   * 이 앱과 API가 다른 앱이 나왔으면 그 기록을 돌려준다(그 앱이 이 앱보다 먼저 빌드된 것이어도). 패치하지 않거나(개발 빌드)
   * 기록을 받지 못하면 null이다. 받는 곳을 함께 쓰므로 check가 끝난 뒤에 부른다.
   */
  newApp(): Promise<AppRelease | null>;
}

/** 패치. 부트 프로그램이 게임을 시작하기 전에 부른다. */
export function createUpdater({ store, source, api, update, storage, logger }: UpdaterOptions): Updater {
  const report = (status: UpdateStatus, received = 0, total = 0) => void (update.value = { status, received, total });

  // 설치된 번들의 매니페스트. 읽지 못하면(이전 형식) 없는 것으로 보고 모두 다시 받는다.
  function installed(): Manifest | null {
    const text = store.current();
    if (text === null) return null;
    try {
      return parseManifest(text);
    } catch {
      return null;
    }
  }

  // 카탈로그의 에셋 번들을 미리 받는다. 받을 것이 있으면 앞서 받은 `before` 바이트에 이어 진행을 보인다.
  async function prefetch(staged: boolean, before: number): Promise<void> {
    let total = 0;
    await store.assets(staged, (received, all) => {
      total = all;
      if (all > 0) report("downloading", before + received, before + all);
    });
    if (total > 0) logger.info(`assets: ${total} bytes downloaded`);
  }

  // 받아서 바꿨으면 true, 설치된 것이 최신이면 false. 받지 못하면 throw한다. 에셋 번들은 설치하기 전에 받아 두므로 게임이
  // 시작하자마자 쓸 수 있다.
  async function download(from: string): Promise<boolean> {
    report("checking");
    const current = installed() ?? NOTHING;
    store.begin();
    await store.download(`${from}${channelPath(api)}`, POINTER);
    const { version } = parsePointer(store.read(POINTER));
    if (version === current.version) {
      store.discard();
      // 버전은 같아도 캐시에서 지워진 에셋 번들이 있으면 다시 받는다.
      await prefetch(false, 0);
      return false;
    }
    // 포인터는 번들의 파일이 아니므로 받는 곳을 비우고 매니페스트부터 받는다.
    store.begin();
    const folder = `${from}${versionPath(version)}`;
    await store.download(`${folder}${MANIFEST}`, MANIFEST);
    const next = parseManifest(store.read(MANIFEST));
    if (next.version !== version || next.api !== api) {
      throw new Error(`The manifest ${next.version} (API ${next.api}) is not the channel's ${version} (API ${api}).`);
    }
    const { reuse, download } = planUpdate(current, next);
    for (const file of reuse) store.reuse(file.path);
    const total = download.reduce((sum, file) => sum + file.size, 0);
    let received = 0;
    report("downloading", received, total);
    for (const file of download) {
      // 버전 폴더는 바뀌지 않으므로 CDN이 캐시한 것도 이 버전의 파일이다.
      await store.download(`${folder}${file.path}`, file.path);
      received += file.size;
      report("downloading", received, total);
    }
    // 복사한 파일도 검증한다. 하나라도 다르면 바꾸지 않는다.
    for (const file of next.files) {
      const digest = store.digest(file.path);
      if (digest?.size !== file.size || digest.sha256 !== file.sha256) throw new Error(`${file.path} does not match the manifest.`);
    }
    await prefetch(true, total);
    store.commit();
    logger.info(`${current.version || "none"} -> ${next.version}: ${download.length} files, ${total} bytes downloaded`);
    return true;
  }

  return {
    async check() {
      // 표시는 한 번만 막는다. 다시 시도하면 서버가 다시 판단하도록 게임을 시작한다.
      const required = storage.get(UPDATE_REQUIRED) !== null;
      storage.delete(UPDATE_REQUIRED);
      try {
        if (source !== undefined && await download(source)) {
          report("updated");
          return true;
        }
        report(required ? "required" : "current");
        return !required;
      } catch (error) {
        logger.warn("Keeping the installed bundle:", error);
        store.discard();
        report("failed");
        // 다른 API의 번들(앱을 새로 설치하기 전에 받은 것)은 이 앱의 C#과 맞지 않을 수 있어 시작하지 않는다.
        return !required && installed()?.api === api;
      }
    },
    async newApp() {
      if (source === undefined) return null;
      try {
        store.begin();
        await store.download(`${source}${APP}`, APP_FILE);
        const app = parseApp(store.read(APP_FILE));
        return app.api === api ? null : app;
      } catch (error) {
        // 아직 APK를 기록하지 않은 버킷(로컬)도 여기로 온다. 안내만 못 할 뿐 게임은 시작한다.
        logger.info("No app record:", error);
        return null;
      } finally {
        store.discard();
      }
    },
  };
}
