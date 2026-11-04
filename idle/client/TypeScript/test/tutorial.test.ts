import { readFileSync } from "node:fs";
import { GameErrorCode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { afterStep, tutorialStep, waitsForTap, type BattleSnapshot, type GameError, type PlayerState } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { Commands } from "../src/application/progress/progress.js";
import { createScope } from "../src/application/scope.js";
import { createAppState } from "../src/application/state/app-state.js";
import type { ViewRoot } from "../src/presentation/ui/ports.js";
import type { ShownView, View } from "../src/presentation/ui/ui-stack.js";
import { createTutorialViewModel, type TutorialTarget } from "../src/presentation/view-models/tutorial.js";
import { bindSpotlight } from "../src/unity/binding/bind.js";
import type { EventSource } from "../src/unity/binding/components.js";
import { Kind, type RefsSource } from "../src/unity/binding/refs.js";
import { button, view } from "../src/unity/binding/view.js";
import { views } from "../src/unity/views/index.js";
import { tutorialView } from "../src/unity/views/tutorial.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t } = texts(data);

// 배포 데이터의 스텝: 1 누름, 2 3001 클리어, 3 main.equipmentButton 누름, 4 equipment.items 무기 착용,
// 5 main.equipmentButton 다시 누름(닫기), 6 레벨 5, 7 main.inventoryButton 누름, 8 main.inventoryButton 다시 누름(닫기), 9 누름(끝).
const prefabs = { main: "UI/MainScreen", equipment: "UI/EquipmentScreen", inventory: "UI/InventoryScreen", reward: "UI/RewardPopup" };
const screen = (prefab: string): ShownView => ({ prefab, layer: "screen", root: { prefab } as unknown as ViewRoot });
const popup = (prefab: string): ShownView => ({ prefab, layer: "popup", root: { prefab } as unknown as ViewRoot });
const main = screen(prefabs.main);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function setUp(stepId: number | null, changes: Partial<PlayerState> = {}) {
  // `changes`는 전투를 시작한 뒤에 덮는다.
  const state = createAppState({ flow: "main", player: { ...testPlayer(data, 0, { tutorial: { stepId } }), ...changes } });
  const snapshot = signal<BattleSnapshot | undefined>(undefined);
  const shown = signal<readonly ShownView[]>([main]);
  const clear = signal(true);
  const sent: number[] = [];
  // 거절할 답을 차례로 둔다. 비면 받아들인다. progress처럼 예측(다음 스텝으로 옮김)을 먼저 화면에 두고 서버에 보낸다.
  const refusals: GameError[] = [];
  const answers: (() => void)[] = [];
  const cmd = {
    TutorialAdvance: ({ stepId: id }: { stepId: number }) => {
      const refusal = refusals.shift();
      const save = state.player.value!;
      const step = tutorialStep(save, data)!;
      if (!refusal) state.player.value = { ...save, tutorial: afterStep(step, data) };
      sent.push(id);
      return new Promise<GameError | undefined>(resolve => answers.push(() => resolve(refusal)));
    },
  } as unknown as Commands;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const owner = createScope();
  const vm = createTutorialViewModel({
    state, data, t, battle: { snapshot }, progress: { cmd }, shown, clear, prefabs, logger, owner,
  });
  const answer = async () => {
    answers.shift()?.();
    await flush();
  };
  return { state, snapshot, shown, clear, sent, refusals, answer, logger, owner, vm };
}

describe("tutorial view model", () => {
  test("a tap step covers the screen once the transition has cleared, and a tap moves on", () => {
    const t = setUp(1);
    t.clear.value = false;
    expect(t.vm.running.value).toBe(true);
    expect(t.vm.visible.value).toBe(false);
    expect(t.vm.covering.value).toBe(false);

    t.clear.value = true;
    expect(t.vm.visible.value).toBe(true);
    expect(t.vm.covering.value).toBe(true);
    expect(t.vm.target.value).toBeNull();
    expect(t.vm.text.value).toBe("어서 오세요! 영웅은 혼자서 몬스터를 사냥합니다.");

    t.vm.tap();
    expect(t.sent).toEqual([1]);
    // 스텝 2는 3001 클리어를 기다리는 스텝이라 막지 않고 누름에도 넘어가지 않는다.
    expect(t.vm.covering.value).toBe(false);
    t.vm.tap();
    expect(t.sent).toEqual([1]);
  });

  test("a condition step sends once when met, judging the level by the visible battle", async () => {
    const t = setUp(6);
    expect(t.vm.visible.value).toBe(true);
    expect(t.vm.target.value).toBeNull();
    await flush();
    expect(t.sent).toEqual([]);
    t.snapshot.value = { hero: { level: 5 } } as unknown as BattleSnapshot;
    t.snapshot.value = { hero: { level: 6 } } as unknown as BattleSnapshot;
    await flush();
    expect(t.sent).toEqual([6]);
    expect(t.state.player.value?.tutorial).toEqual({ stepId: 7 });
  });

  test("a refused step is not sent again until the save changes", async () => {
    const t = setUp(2);
    t.refusals.push({ code: GameErrorCode.TutorialStepUnmet, message: "x" });
    const cleared = { ...t.state.player.value!, stage: { currentId: 3002, clearedIds: [3001] } };
    t.state.player.value = cleared;
    await flush();
    expect(t.sent).toEqual([2]);
    await t.answer();
    expect(t.logger.warn).toHaveBeenCalledOnce();
    expect(t.sent).toEqual([2]);
    t.state.player.value = { ...cleared, items: {} };
    await flush();
    expect(t.sent).toEqual([2, 2]);
    expect(t.state.player.value.tutorial).toEqual({ stepId: 3 });
  });

  test("stops following when its owner closes, even with a send already due", async () => {
    const t = setUp(2);
    t.state.player.value = { ...t.state.player.value!, stage: { currentId: 3002, clearedIds: [3001] } };
    t.owner.dispose();
    await flush();
    expect(t.sent).toEqual([]);
  });

  test("a step met while another command is being predicted is sent after it", async () => {
    // 5(누름)의 예측이 6(레벨 5, 이미 채움)으로 옮긴 그 자리에서 6을 보내면 서버가 6을 먼저 받아 거절한다.
    const t = setUp(5, { profile: { loginId: "hero", level: 5 } });
    t.vm.tap();
    expect(t.sent).toEqual([5]);
    await flush();
    expect(t.sent).toEqual([5, 6]);
  });

  test("aims at the topmost view of the target's screen, and steps aside while another popup is on top", () => {
    const t = setUp(3);
    const aimed = t.vm.target.value;
    expect(aimed).toEqual({ root: main.root, name: "equipmentButton" });
    expect(t.vm.covering.value).toBe(false);

    // 오프라인 보상 팝업이 위에 있으면 숨고 막지 않는다. 닫으면 같은 대상을 다시 비춘다.
    t.shown.value = [main, popup(prefabs.reward)];
    expect(t.vm.visible.value).toBe(false);
    expect(t.vm.target.value).toBeNull();
    t.shown.value = [main];
    expect(t.vm.target.value).toEqual(aimed);
    // 다른 뷰가 열고 닫혀도 대상은 같은 객체다(뷰가 다시 비추지 않는다).
    const same = t.vm.target.value;
    t.shown.value = [main, { ...screen("UI/Toast"), layer: "overlay" }];
    expect(t.vm.target.value).toBe(same);

    t.vm.tap();
    expect(t.sent).toEqual([3]);
  });

  test("a target in a closed popup lights the step's opener until the popup opens, and a tap step whose target is gone covers the screen", () => {
    // 재시작해서 장비 팝업이 닫힌 채 착용 스텝으로 돌아왔다. 팝업을 여는 장비 버튼을 비춘다.
    const t = setUp(4);
    expect(t.vm.visible.value).toBe(true);
    expect(t.vm.target.value).toEqual({ root: main.root, name: "equipmentButton" });
    expect(t.vm.covering.value).toBe(false);
    // 조건 스텝이라 장비 버튼을 눌러도 넘어가지 않는다(버튼 자신이 팝업을 연다).
    t.vm.tap();
    expect(t.sent).toEqual([]);
    const equipment = popup(prefabs.equipment);
    t.shown.value = [main, equipment];
    expect(t.vm.target.value).toEqual({ root: equipment.root, name: "items" });
    t.shown.value = [main];
    expect(t.vm.target.value).toEqual({ root: main.root, name: "equipmentButton" });

    // 아래 판에는 닫기 버튼이 없어 닫기 스텝은 같은 탭을 한 번 더 누르게 비춘다. 대상의 화면이 없으면(전환 중) 화면을 덮고
    // 아무 데나 누르면 넘어간다.
    const closing = setUp(5);
    expect(closing.vm.target.value).toEqual({ root: main.root, name: "equipmentButton" });
    closing.shown.value = [];
    expect(closing.vm.target.value).toBeNull();
    expect(closing.vm.covering.value).toBe(true);
    closing.vm.tap();
    expect(closing.sent).toEqual([5]);
  });

  test("the last step finishes the tutorial", () => {
    const t = setUp(9);
    t.vm.tap();
    expect(t.state.player.value?.tutorial).toEqual({ stepId: null });
    expect(t.vm.running.value).toBe(false);
    expect(t.vm.visible.value).toBe(false);
    expect(t.vm.covering.value).toBe(false);
  });
});

describe("tutorial data", () => {
  // 뷰를 항목이 하나도 없는 ViewRefs에 바인딩하면, 뷰가 열 때 읽으려던 항목 이름이 GetKind로 모두 지나간다.
  function names(view: View<unknown>): string[] {
    const asked: string[] = [];
    const refs = { GetKind: (name: string) => (asked.push(name), -1) } as unknown as RefsSource;
    expect(() => view.bind(createScope(), refs as unknown as ViewRoot, {}, { pressed() {}, t })).toThrow(/ViewRefs/);
    return asked;
  }

  test("every target and opener is an entry its screen's view binds, tap steps target buttons and openers are buttons on another screen", () => {
    const byKey = views as unknown as Readonly<Record<string, View<unknown> | undefined>>;
    for (const step of data.tutorialSteps.values()) {
      if (step.opener !== null) {
        const [key, name] = step.opener.split(".");
        expect(names(byKey[key]!), step.opener).toContain(name);
        expect(name, step.opener).toMatch(/Button$/);
        expect(key, step.opener).not.toBe(step.target?.split(".")[0]);
      }
      if (step.target === null) continue;
      const [key, name] = step.target.split(".");
      const view = byKey[key];
      expect(view?.prefab, step.target).toBeTypeOf("string");
      expect(names(view!), step.target).toContain(name);
      // 누름 스텝은 대상의 클릭으로 넘어가므로 대상이 버튼이어야 한다(뷰의 버튼 항목은 이름이 Button으로 끝난다).
      if (waitsForTap(step)) expect(name, step.target).toMatch(/Button$/);
    }
  });
});

describe("spotlight binding", () => {
  function fakeEvent() {
    const listeners = new Set<() => void>();
    const event: EventSource = { AddListener: call => void listeners.add(call), RemoveListener: call => void listeners.delete(call) };
    return { event, listeners, fire: () => listeners.forEach(call => call()) };
  }

  test("focuses the target's ViewRefs entry, counts its clicks as taps, and clears when there is no target", () => {
    const click = fakeEvent();
    const button = { onClick: click.event };
    const list = { FieldCount: 3 };
    const entries: Record<string, unknown> = { equipmentButton: button, items: list };
    const root = { GetObject: (name: string) => entries[name] ?? null } as unknown as ViewRoot;
    const calls: unknown[] = [];
    const spotlight = { Focus: (target: unknown) => void calls.push(target), Clear: () => void calls.push("clear") };
    const target = signal<TutorialTarget | null>(null);
    const tapped = vi.fn();
    const scope = createScope();
    bindSpotlight(scope, spotlight, target, tapped);
    expect(calls).toEqual(["clear"]);

    target.value = { root, name: "equipmentButton" };
    expect(calls.at(-1)).toBe(button);
    click.fire();
    expect(tapped).toHaveBeenCalledOnce();

    // 버튼이 아닌 대상은 비추기만 한다. 앞의 버튼은 더 듣지 않는다.
    target.value = { root, name: "items" };
    expect(calls.at(-1)).toBe(list);
    expect(click.listeners.size).toBe(0);
    // 프리팹에 없는 항목은 막지 않는다.
    target.value = { root, name: "missing" };
    expect(calls.at(-1)).toBe("clear");

    target.value = { root, name: "equipmentButton" };
    scope.dispose();
    expect(click.listeners.size).toBe(0);
  });

  test("a press in the tutorial plays the button sound once, on the spotlighted button and on the cover", () => {
    // UI 스택이 두 뷰에 같은 컨텍스트를 넘긴다.
    const context = { pressed: vi.fn(), t };
    const refsOf = (entries: Record<string, unknown>) =>
      ({ GetKind: (name: string) => (name in entries ? Kind.Object : -1), GetObject: (name: string) => entries[name] ?? null }) as unknown as ViewRoot;
    const gameObject = () => ({ SetActive() {} });
    // 대상 화면: 자기 바인딩이 있는 장비 버튼.
    const equipmentClick = fakeEvent();
    const mainRoot = refsOf({ equipmentButton: { interactable: true, onClick: equipmentClick.event, gameObject: gameObject() } });
    const opened = vi.fn();
    view<{ open(): void }>("UI/MainScreen", { equipmentButton: button(vm => vm.open()) })
      .bind(createScope(), mainRoot, { open: opened }, context);

    const tapClick = fakeEvent();
    const target = signal<TutorialTarget | null>({ root: mainRoot, name: "equipmentButton" });
    const covering = signal(false);
    const tap = vi.fn();
    const overlay = refsOf({
      spotlight: { Focus() {}, Clear() {} },
      tapButton: { interactable: true, onClick: tapClick.event, gameObject: gameObject() },
      dialog: gameObject(), dialogText: { text: "" }, hint: gameObject(), hintLabel: { text: "" },
    });
    const vm = { running: signal(true), visible: signal(true), text: signal("장비를 눌러 보세요."), target, covering, tap };
    tutorialView.bind(createScope(), overlay, vm, context);

    // 비춘 버튼을 누르면 버튼 자신의 동작과 튜토리얼이 함께 돌지만, 소리는 버튼의 바인딩이 한 번 낸다.
    equipmentClick.fire();
    expect([opened.mock.calls.length, tap.mock.calls.length, context.pressed.mock.calls.length]).toEqual([1, 1, 1]);

    // 비출 대상이 없는 누름 스텝: 화면을 덮는 누름 버튼도 한 번이다.
    target.value = null;
    covering.value = true;
    tapClick.fire();
    expect([tap.mock.calls.length, context.pressed.mock.calls.length]).toEqual([2, 2]);
  });
});
