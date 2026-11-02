import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { ItemKind, loadGameData, type GameData } from "@idle/data-schema";
import { HOUR } from "@idle/game-core";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import { createEventBus, type AppEventMap } from "../src/application/events.js";
import { createScope, type Scope } from "../src/application/scope.js";
import { createAppState } from "../src/application/state/app-state.js";
import type { ViewRoot } from "../src/presentation/ui/ports.js";
import { blockWhileWaiting } from "../src/presentation/ui/waiting.js";
import type { OpenOptions, OpenView, UiStack, View } from "../src/presentation/ui/ui-stack.js";
import { confirm, type ConfirmViewModel } from "../src/presentation/widgets/confirm.js";
import { createCurrencyBarViewModel } from "../src/presentation/widgets/currency.js";
import { showWhileWaiting, type LoadingViewModel } from "../src/presentation/widgets/loading.js";
import { createRewardViewModel } from "../src/presentation/widgets/reward.js";
import { createToastViewModel } from "../src/presentation/widgets/toast.js";
import { bindBigNumber } from "../src/unity/binding/bind.js";
import { toastView } from "../src/unity/views/widgets.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t, language } = texts(data);

// UI 스택처럼 owner 아래 스코프로 뷰를 여는 가짜. 열린 것을 테스트가 본다.
function fakeShow() {
  const opened: { view: View<unknown>; vm: unknown; owner: Scope; options?: OpenOptions; open: OpenView }[] = [];
  const show: UiStack["show"] = async (view, vm, owner, options) => {
    const scope = createScope();
    owner.add(() => scope.dispose());
    const open: OpenView = { root: {} as ViewRoot, scope, close: () => scope.dispose() };
    opened.push({ view: view as View<unknown>, vm, owner, options, open });
    return owner.disposed ? undefined : open;
  };
  return { show, opened };
}

const confirmView: View<ConfirmViewModel> = { prefab: "UI/ConfirmPopup", layer: "popup", bind() {} };

describe("confirm popup", () => {
  test("opens as a popup with the question and answers true on OK, then closes", async () => {
    const t = fakeShow();
    const owner = createScope();
    const answer = confirm(t.show, confirmView, owner, "로그아웃할까요?");
    await vi.waitFor(() => expect(t.opened).toHaveLength(1));
    const [{ vm, open }] = t.opened;
    expect((vm as ConfirmViewModel).message.value).toBe("로그아웃할까요?");

    (vm as ConfirmViewModel).ok();
    expect(await answer).toBe(true);
    expect(open.scope.disposed).toBe(true);
  });

  test("answers false on cancel, on back, and when its owner closes first", async () => {
    const t = fakeShow();
    const owner = createScope();
    const cancelled = confirm(t.show, confirmView, owner, "?");
    const backed = confirm(t.show, confirmView, owner, "?");
    const dropped = confirm(t.show, confirmView, owner, "?");
    await vi.waitFor(() => expect(t.opened).toHaveLength(3));
    (t.opened[0].vm as ConfirmViewModel).cancel();
    // 뒤로 가기는 UI 스택이 팝업을 닫는 것이다.
    t.opened[1].open.close();
    expect(await cancelled).toBe(false);
    expect(await backed).toBe(false);

    owner.dispose();
    expect(await dropped).toBe(false);
  });

  test("answers false when the popup does not open", async () => {
    const owner = createScope();
    owner.dispose();
    expect(await confirm(fakeShow().show, confirmView, owner, "?")).toBe(false);
    expect(await confirm(() => Promise.reject(new Error("missing")), confirmView, createScope(), "?")).toBe(false);
  });
});

describe("reward popup", () => {
  test("shows how long the reward took, the levels it gave and each item in ID order", () => {
    const close = vi.fn();
    const vm = createRewardViewModel({
      data, t,
      reward: { duration: 2 * HOUR + 65_000, items: { 2: Big.from(340), 1: Big.from(1250), 3: Big.ZERO }, level: { from: 3, to: 7 } },
      close,
    });
    expect(vm.duration.value).toBe("02:01:05 동안");
    expect(vm.level.value).toBe("Lv.3 → Lv.7");
    expect(vm.items.value).toBe("골드 +1.2K\n경험치 +340");
    // 받은 값은 그대로이고 문장만 그 언어로 바뀐다.
    language.value = "en";
    expect([vm.duration.value, vm.items.value]).toEqual(["Over 02:01:05", "Gold +1.2K\nEXP +340"]);
    language.value = "ko";
    vm.close();
    expect(close).toHaveBeenCalledOnce();
  });

  test("leaves the level empty when the reward raised none", () => {
    const vm = createRewardViewModel({ data, t, reward: { duration: HOUR, items: {}, level: { from: 4, to: 4 } }, close() {} });
    expect(vm.level.value).toBe("");
    expect(vm.items.value).toBe("");
  });
});

describe("toast", () => {
  test("says why a command was refused, with a plain fallback, until the view closes", () => {
    const events = createEventBus<AppEventMap>(console);
    const shown: string[] = [];
    const scope = createScope();
    const target = { Show: (text: string) => void shown.push(text) };
    const source = { GetKind: () => 0, GetObject: () => target, GetList: () => null, GetString: () => null, GetNumber: () => 0, GetBool: () => false };
    toastView.bind(scope, source as unknown as ViewRoot, createToastViewModel(events, t), { pressed() {}, t });

    const command = { type: Opcode.StageSelect, stageId: 9 } as const;
    events.emit("refused", { command, error: { code: GameErrorCode.StageNotFound, message: "" } });
    events.emit("refused", { command, error: { code: 999 as GameErrorCode, message: "" } });
    events.emit("refused", { command: { type: Opcode.StatUpgrade, upgradeId: 7001 }, error: { code: GameErrorCode.NotEnoughGold, message: "" } });
    for (const code of [
      GameErrorCode.SkillNotFound, GameErrorCode.SkillNotLearned, GameErrorCode.SkillSlotInvalid, GameErrorCode.SkillMaxLevel, GameErrorCode.SkillCostShort,
    ]) {
      events.emit("refused", { command, error: { code, message: "" } });
    }
    expect(shown).toEqual([
      "없는 스테이지입니다.", "요청이 거절되었습니다.", "골드가 부족합니다.",
      "쓸 수 없는 스킬입니다.", "아직 배우지 않은 스킬입니다.", "없는 스킬 슬롯입니다.", "이미 최대 레벨입니다.", "비용이 모자랍니다.",
    ]);

    scope.dispose();
    events.emit("refused", { command, error: { code: GameErrorCode.StageNotFound, message: "" } });
    expect(shown).toHaveLength(8);
  });

  test("each enhancement and merge refusal says its own reason", () => {
    const events = createEventBus<AppEventMap>(console);
    const shown: string[] = [];
    createToastViewModel(events, t).notices(text => void shown.push(text));
    const command = { type: Opcode.ItemEnhance, equipmentId: 1 } as const;
    for (const code of [GameErrorCode.EquipmentMaxEnhance, GameErrorCode.EquipmentNotMergeable, GameErrorCode.MergeMaterialsShort]) {
      events.emit("refused", { command, error: { code, message: "" } });
    }
    expect(shown).toEqual(["더 강화할 수 없습니다.", "합성할 수 없는 장비입니다.", "같은 장비가 모자랍니다."]);
  });

  test("a refused rebirth says the hero cannot rebirth yet", () => {
    const events = createEventBus<AppEventMap>(console);
    const shown: string[] = [];
    createToastViewModel(events, t).notices(text => void shown.push(text));
    events.emit("refused", { command: { type: Opcode.Rebirth }, error: { code: GameErrorCode.RebirthNotReady, message: "" } });
    expect(shown).toEqual(["아직 환생할 수 없습니다."]);
  });
});

describe("loading", () => {
  const loadingView: View<LoadingViewModel> = { prefab: "UI/Loading", layer: "overlay", bind() {} };

  test("opens on the overlay while the game waits on the server and closes after", async () => {
    const state = createAppState();
    const t = fakeShow();
    const owner = createScope();
    showWhileWaiting({ state, show: t.show, view: loadingView, t: texts(data).t, owner });
    expect(t.opened).toEqual([]);

    state.network.value = { ...state.network.value, status: "online", waiting: true };
    // 같은 기다림의 다른 변화는 다시 열지 않는다.
    state.network.value = { ...state.network.value, status: "reconnecting" };
    expect(t.opened).toHaveLength(1);
    const vm = t.opened[0].vm as LoadingViewModel;
    expect(vm.message.value).toBe("다시 연결하는 중…");
    state.network.value = { ...state.network.value, status: "online" };
    expect(vm.message.value).toBe("서버 응답을 기다리는 중…");

    state.network.value = { ...state.network.value, waiting: false };
    expect(t.opened[0].owner.disposed).toBe(true);
    state.network.value = { ...state.network.value, waiting: true };
    expect(t.opened).toHaveLength(2);

    owner.dispose();
    expect(t.opened[1].owner.disposed).toBe(true);
    state.network.value = { ...state.network.value, waiting: false };
    state.network.value = { ...state.network.value, waiting: true };
    expect(t.opened).toHaveLength(2);
  });
  // 답하지 않는 서버에 플레이어가 커맨드를 쌓지 못하게, 기다리는 동안 탭을 한 번만 막고 기다림이 끝나면 푼다.
  test("blocks taps once while the game waits on the server and lets go after", () => {
    const state = createAppState();
    const blocks: string[] = [];
    blockWhileWaiting(state, () => (blocks.push("block"), () => void blocks.push("unblock")));
    expect(blocks).toEqual([]);

    state.network.value = { ...state.network.value, status: "online", waiting: true };
    state.network.value = { ...state.network.value, status: "reconnecting" };
    expect(blocks).toEqual(["block"]);
    state.network.value = { ...state.network.value, waiting: false };
    state.network.value = { ...state.network.value, waiting: true };
    expect(blocks).toEqual(["block", "unblock", "block"]);
  });
});

describe("big number", () => {
  test("the currency bar shows the currency kind but experience, in ID order, and each follows only its own amount", () => {
    const row = (id: number, nameKey: string, kind: ItemKind) => [id, { id, nameKey, kind, cap: null, note: null, icon: `icon_${nameKey}` }] as const;
    const items = new Map([row(9, "gem", ItemKind.Currency), row(2, "exp", ItemKind.Currency), row(3, "iron", ItemKind.Material), row(1, "gold", ItemKind.Currency)]);
    const amounts = signal<{ readonly [id: number]: Big }>({ 1: Big.from(10) });
    const vm = createCurrencyBarViewModel({ data: { items, constants: { expItemId: 2 } } as unknown as GameData, items: amounts });
    // 이름 대신 아이콘이다.
    expect(vm.currencies.map(currency => [currency.icon, currency.name])).toEqual([["icon_gold", ""], ["icon_gem", ""]]);

    const seen: string[] = [];
    vm.currencies[0].amount.subscribe(gold => seen.push(Big.toNumber(gold).toString()));
    amounts.value = { ...amounts.value, 2: Big.from(1), 9: Big.from(3) };
    amounts.value = { 1: Big.from(25) };
    amounts.value = {};
    expect(seen).toEqual(["10", "25", "0"]);
    expect(Big.toNumber(vm.currencies[1].amount.value)).toBe(0);
  });

  test("sets the first value, rolls to each change in a few frames and skips a change it cannot show", () => {
    const calls: unknown[][] = [];
    const target = { Set: (text: string) => void calls.push(["Set", text]), Roll: (frames: string, seconds: number) => void calls.push(["Roll", frames, seconds]) };
    const value = signal(Big.from(1200));
    const scope = createScope();
    bindBigNumber(scope, target, value);
    value.value = Big.from(1220);
    value.value = Big.from(1300);
    expect(calls).toEqual([["Set", "1.2K"], ["Roll", "1.3K", 0.4]]);

    scope.dispose();
    value.value = Big.from(5);
    expect(calls).toHaveLength(2);
  });
});
