import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { ViewRoot } from "../src/presentation/ui/ports.js";
import type { EventSource } from "../src/unity/binding/components.js";
import type { RefsSource } from "../src/unity/binding/refs.js";
import { createResourceBridge, type UnityAsset } from "../src/unity/resources.js";
import { createUiBridge } from "../src/unity/ui.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// TypeScript에서 보이는 ResourceFacade. 로드는 테스트가 지시할 때 끝나고, 매 프레임 폴링된다.
function fakeResources() {
  const states = new Map<number, number>();
  const released: number[] = [];
  let polls = 0;
  let lastId = 0;
  const facade = {
    Loading: 0, Loaded: 1, Missing: 2,
    Load: () => (states.set(++lastId, 0), lastId),
    Poll: (id: number) => (polls++, states.get(id) ?? 2),
    Release: (id: number) => void released.push(id),
    UnloadUnused: () => {},
  };
  return { facade, released, polls: () => polls, finish: (id: number, state: number) => states.set(id, state) };
}

test("a load resolves once C# has it, and a missing asset rejects and is released", async () => {
  const fake = fakeResources();
  const bridge = createResourceBridge(fake.facade);
  const found = bridge.load("UI/Login");
  // 거부되기 전에 미리 받아 두어, 거부가 처리되지 않은 채 남지 않게 한다.
  const missing = expect(bridge.load("UI/Nothing")).rejects.toThrow("There is no asset at UI/Nothing.");
  await vi.advanceTimersByTimeAsync(5);
  fake.finish(1, 1);
  fake.finish(2, 2);
  await vi.advanceTimersByTimeAsync(1);

  const asset = (await found) as UnityAsset;
  expect(asset.id).toBe(1);
  await missing;
  expect(fake.released).toEqual([2]);
  asset.release();
  asset.release();
  expect(fake.released).toEqual([2, 1]);

  // 로딩 중인 것이 없으면 폴링도 하지 않는다.
  const polls = fake.polls();
  await vi.advanceTimersByTimeAsync(10);
  expect(fake.polls()).toBe(polls);
});

test("views go on the facade's layers, and back is asked about only while someone listens", async () => {
  const created: [number, number][] = [];
  let pressed = false;
  let asked = 0;
  const destroyed: RefsSource[] = [];
  const refs = {} as RefsSource;
  let motion: { Finished: EventSource; finish(): void } | null = null;
  const bridge = createUiBridge({
    Screen: 0, Popup: 1, Guide: 2, Overlay: 3, Debug: 4,
    Create: (assetId, layer) => (created.push([assetId, layer]), refs),
    Destroy: view => void destroyed.push(view),
    Close: () => motion,
    SetBlocking: () => {},
    BackPressed: () => (asked++, pressed),
  });
  const asset: UnityAsset = { id: 7, release: () => {} };
  const instance = bridge.create(asset, "popup");
  expect(instance.root).toBe(refs as unknown as ViewRoot);
  expect(created).toEqual([[7, 1]]);
  // 닫는 연출이 없으면 기다릴 것이 없다.
  expect(instance.dismiss()).toBeUndefined();
  instance.destroy();
  expect(destroyed).toHaveLength(1);
  expect(destroyed[0]).toBe(refs);

  // 있으면 C#이 Finished를 낼 때 이행하고 더 듣지 않는다.
  const listeners = new Set<() => void>();
  motion = {
    Finished: { AddListener: call => void listeners.add(call), RemoveListener: call => void listeners.delete(call) },
    finish: () => listeners.forEach(call => call()),
  };
  let finished = false;
  void instance.dismiss()!.then(() => (finished = true));
  expect(listeners.size).toBe(1);
  motion.finish();
  await Promise.resolve();
  expect(finished).toBe(true);
  expect(listeners.size).toBe(0);

  await vi.advanceTimersByTimeAsync(5);
  expect(asked).toBe(0);
  const backs: string[] = [];
  const stop = bridge.onBack(() => backs.push("back"));
  await vi.advanceTimersByTimeAsync(3);
  pressed = true;
  await vi.advanceTimersByTimeAsync(1);
  expect(backs).toEqual(["back"]);
  stop();
  const before = asked;
  await vi.advanceTimersByTimeAsync(5);
  expect(asked).toBe(before);
});
