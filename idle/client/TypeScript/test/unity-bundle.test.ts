import { afterEach, expect, test, vi } from "vitest";
import { createBundleStore, type BundleFacade } from "../src/unity/bundle.js";

afterEach(() => vi.useRealTimers());

// TypeScript에서 보이는 BundleFacade. 받기는 테스트가 지시할 때 끝나고, 매 프레임 폴링된다.
function fakeBundles() {
  const states = new Map<number, number>();
  let lastId = 0;
  const facade = {
    Downloading: 0, Downloaded: 1,
    Download: () => (states.set(++lastId, 0), lastId),
    Poll: (id: number) => states.get(id) ?? 2,
    Size: (path: string) => (path === "main.mjs" ? 6 : -1),
    Sha256: () => "a".repeat(64),
  } as unknown as BundleFacade;
  return { facade, finish: (id: number, state: number) => states.set(id, state) };
}

test("a download resolves once C# has the file and rejects when it failed", async () => {
  vi.useFakeTimers();
  const fake = fakeBundles();
  const store = createBundleStore(fake.facade);
  const done = vi.fn();
  const failed = vi.fn();
  void store.download("http://cdn.test/main.mjs", "main.mjs").then(done);
  void store.download("http://cdn.test/data/Items.bytes", "data/Items.bytes").catch(failed);
  await vi.advanceTimersByTimeAsync(10);
  expect(done).not.toHaveBeenCalled();
  fake.finish(1, 1);
  fake.finish(2, 2);
  await vi.advanceTimersByTimeAsync(10);
  expect(done).toHaveBeenCalledOnce();
  expect(failed).toHaveBeenCalledWith(new Error("Could not download http://cdn.test/data/Items.bytes."));
  // 끝난 받기는 더 묻지 않는다.
  expect(vi.getTimerCount()).toBe(0);
});

test("the asset bundles report their bytes every frame and settle once C# is done", async () => {
  vi.useFakeTimers();
  let state = 0;
  let received = 0;
  const downloads: boolean[] = [];
  const facade = {
    Downloading: 0, Downloaded: 1,
    DownloadAssets: (staged: boolean) => void downloads.push(staged),
    PollAssets: () => state,
    AssetBytesReceived: () => received,
    AssetBytesTotal: () => 300,
  } as unknown as BundleFacade;
  const store = createBundleStore(facade);
  const progress: number[] = [];
  const done = vi.fn();
  void store.assets(true, got => void progress.push(got)).then(done);
  expect(downloads).toEqual([true]);
  received = 100;
  await vi.advanceTimersByTimeAsync(10);
  expect(done).not.toHaveBeenCalled();
  received = 300;
  state = 1;
  await vi.advanceTimersByTimeAsync(10);
  expect(done).toHaveBeenCalledOnce();
  expect(progress.at(-1)).toBe(300);
  expect(vi.getTimerCount()).toBe(0);

  state = 2;
  const failed = expect(store.assets(false, () => {})).rejects.toThrow("Could not download the asset bundles.");
  await vi.advanceTimersByTimeAsync(10);
  await failed;
});

test("a missing file has no digest", () => {
  const store = createBundleStore(fakeBundles().facade);
  expect(store.digest("main.mjs")).toEqual({ size: 6, sha256: "a".repeat(64) });
  expect(store.digest("data/Items.bytes")).toBeNull();
});
