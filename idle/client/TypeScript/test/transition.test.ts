import { readFileSync } from "node:fs";
import { loadGameData } from "@idle/data-schema";
import { signal } from "@preact/signals-core";
import { expect, test, vi } from "vitest";
import { createScope } from "../src/application/scope.js";
import type { UpdateState } from "../src/application/update/update.js";
import { createTransition, type TransitionViewModel } from "../src/presentation/transition.js";
import type { OpenView, UiStack, View } from "../src/presentation/ui/ui-stack.js";
import { texts } from "./support/text.js";

const { t } = texts(await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url))));

const view: View<TransitionViewModel> = { prefab: "UI/TransitionScreen", layer: "overlay", bind() {} };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** 전환 화면과 그 뷰모델. `opens`: 전환 화면이 열리는지(undefined면 열지 못함). */
function setUp(opens = true) {
  const update = signal<UpdateState>({ status: "idle", received: 0, total: 0 });
  const log: string[] = [];
  let blocks = 0;
  const block = () => {
    blocks++;
    return () => void blocks--;
  };
  const unloadUnused = vi.fn(() => void log.push("unload"));
  const transition = createTransition({ update, block, unloadUnused, t });
  let vm: TransitionViewModel | undefined;
  const show = (async (_view: View<TransitionViewModel>, model: TransitionViewModel) => {
    vm = model;
    return opens ? ({} as OpenView) : undefined;
  }) as UiStack["show"];
  transition.open(show, view, createScope());
  return { update, log, transition, unloadUnused, vm: () => vm!, blocks: () => blocks };
}

test("starts covered and blocking, so the first states move at once", async () => {
  const t = setUp();
  await flush();
  expect(t.vm().covered.value).toBe(true);
  expect(t.blocks()).toBe(1);
  t.transition.cover(() => t.log.push("move"));
  expect(t.log).toEqual(["move"]);
});

test("reveals a ready screen after unloading what the last state released, and unblocks once faded", async () => {
  const t = setUp();
  await flush();
  let ready!: () => void;
  t.transition.reveal(new Promise<void>(resolve => (ready = resolve)), createScope());
  await flush();
  expect(t.vm().covered.value).toBe(true);
  ready();
  await flush();
  expect(t.log).toEqual(["unload"]);
  expect(t.vm().covered.value).toBe(false);
  expect(t.blocks()).toBe(1);
  t.vm().faded();
  expect(t.blocks()).toBe(0);
});

test("a move waits until the screen is covered, and blocks taps meanwhile", async () => {
  const t = setUp();
  await flush();
  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  t.vm().faded();

  t.transition.cover(() => t.log.push("move"));
  t.transition.cover(() => t.log.push("second move"));
  expect(t.vm().covered.value).toBe(true);
  expect(t.blocks()).toBe(1);
  expect(t.log).toEqual(["unload"]);
  t.vm().faded();
  expect(t.log).toEqual(["unload", "move", "second move"]);
  // 다 가렸으면 다음 이동은 바로 간다.
  t.transition.cover(() => t.log.push("third move"));
  expect(t.log.at(-1)).toBe("third move");
});

test("does not reveal a screen whose state has gone, or while covering to leave", async () => {
  const t = setUp();
  await flush();
  const gone = createScope();
  t.transition.reveal(Promise.resolve(), gone);
  gone.dispose();
  await flush();
  expect(t.vm().covered.value).toBe(true);

  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  t.transition.cover(() => t.log.push("move"));
  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  expect(t.vm().covered.value).toBe(true);
  expect(t.unloadUnused).toHaveBeenCalledOnce();
});

test("without a transition screen it covers and reveals at once", async () => {
  const t = setUp(false);
  await flush();
  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  expect(t.blocks()).toBe(0);
  t.transition.cover(() => t.log.push("move"));
  expect(t.log).toEqual(["unload", "move"]);
});

test("shows the patch's progress, a failed download, and that a newer client is needed when there is none", async () => {
  const patch = setUp();
  await flush();
  const vm = patch.vm();
  expect(vm.message.value).toBe("불러오는 중…");
  patch.update.value = { status: "checking", received: 0, total: 0 };
  expect(vm.message.value).toBe("업데이트를 확인하는 중…");
  patch.update.value = { status: "downloading", received: 1024, total: 4096 };
  expect(vm.message.value).toBe("업데이트를 받는 중… 1 KB / 4 KB");
  expect(vm.downloading.value).toBe(true);
  expect(vm.progress.value).toBe(0.25);
  patch.update.value = { status: "updated", received: 0, total: 0 };
  expect(vm.message.value).toBe("업데이트를 적용하는 중…");
  patch.update.value = { status: "failed", received: 0, total: 0 };
  expect(vm.message.value).toMatch(/업데이트를 받지 못했습니다/);
  patch.update.value = { status: "required", received: 0, total: 0 };
  expect(vm.message.value).toMatch(/새 버전이 필요합니다/);
  expect(vm.downloading.value).toBe(false);

  // 게임의 전환 화면은 패치가 없어 늘 불러오는 중이다.
  let game: TransitionViewModel | undefined;
  const show = (async (_view: View<TransitionViewModel>, model: TransitionViewModel) => void (game = model)) as UiStack["show"];
  createTransition({ block: () => () => {}, unloadUnused: () => {}, t }).open(show, view, createScope());
  expect(game!.message.value).toBe("불러오는 중…");
});

test("lifts the cover for a popup that must be seen now, sending the moves that waited for it", async () => {
  const t = setUp();
  await flush();
  // Boot·Update 동안 가린 채로 재시작을 물어야 한다.
  t.transition.lift();
  expect(t.vm().covered.value).toBe(false);
  t.vm().faded();
  expect(t.blocks()).toBe(0);

  // 가리는 중이면 기다리던 이동을 바로 보내고 걷는다.
  t.transition.cover(() => t.log.push("move"));
  expect(t.blocks()).toBe(1);
  t.transition.lift();
  expect(t.log).toEqual(["move"]);
  expect(t.vm().covered.value).toBe(false);
  t.vm().faded();
  expect(t.blocks()).toBe(0);
  // 다음 이동은 다시 가린다.
  t.transition.cover(() => t.log.push("next move"));
  expect(t.vm().covered.value).toBe(true);
  expect(t.log).toEqual(["move"]);
});

test("is clear only once a reveal has faded out, and stops being clear as soon as it covers", async () => {
  const t = setUp();
  await flush();
  expect(t.transition.clear.value).toBe(false);
  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  expect(t.vm().covered.value).toBe(false);
  expect(t.transition.clear.value).toBe(false);
  t.vm().faded();
  expect(t.transition.clear.value).toBe(true);

  t.transition.cover(() => {});
  expect(t.transition.clear.value).toBe(false);
  t.vm().faded();
  expect(t.transition.clear.value).toBe(false);
  // 재시작 팝업을 물으려고 걷어도 다 걷힌 뒤에야 clear다.
  t.transition.lift();
  expect(t.transition.clear.value).toBe(false);
  t.vm().faded();
  expect(t.transition.clear.value).toBe(true);
});

test("is clear right away when the transition screen could not open", async () => {
  const t = setUp(false);
  await flush();
  t.transition.reveal(Promise.resolve(), createScope());
  await flush();
  expect(t.transition.clear.value).toBe(true);
});
