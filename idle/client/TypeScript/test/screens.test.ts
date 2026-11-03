import { readFileSync } from "node:fs";
import { loadGameData, type GameData } from "@idle/data-schema";
import { NO_ITEMS, type BattleSnapshot } from "@idle/game-core";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { Account } from "../src/application/account/account.js";
import type { Commands } from "../src/application/progress/progress.js";
import { createAppFlow } from "../src/application/app/app-flow.js";
import { createEventBus, type AppEventMap } from "../src/application/events.js";
import { createScope, type Scope } from "../src/application/scope.js";
import { createAppState, type AppStateValues } from "../src/application/state/app-state.js";
import { createScreens, showOverlays, type Views } from "../src/presentation/screens.js";
import type { OpenOptions, OpenView, ShownView, UiStack, View } from "../src/presentation/ui/ui-stack.js";
import type { EquipmentViewModel } from "../src/presentation/view-models/equipment.js";
import type { InventoryViewModel } from "../src/presentation/view-models/inventory.js";
import type { LoginViewModel } from "../src/presentation/view-models/login.js";
import type { MainViewModel } from "../src/presentation/view-models/main.js";
import type { TutorialViewModel } from "../src/presentation/view-models/tutorial.js";
import type { SettingsViewModel } from "../src/presentation/view-models/settings.js";
import type { ConfirmViewModel } from "../src/presentation/widgets/confirm.js";
import type { RewardViewModel } from "../src/presentation/widgets/reward.js";
import type { World } from "../src/presentation/world/world.js";
import { languageNames } from "../src/presentation/text.js";
import { texts } from "./support/text.js";

// 화면의 문장만 실제 테이블에서 읽는다. 나머지 테이블은 테스트마다 정한다.
const { strings } = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

const views: Views = {
  login: { prefab: "UI/LoginScreen", layer: "screen", bind() {} },
  main: { prefab: "UI/MainScreen", layer: "screen", bind() {} },
  inventory: { prefab: "UI/InventoryScreen", layer: "screen", bind() {} },
  equipment: { prefab: "UI/EquipmentScreen", layer: "screen", bind() {} },
  upgrade: { prefab: "UI/UpgradeScreen", layer: "screen", bind() {} },
  skills: { prefab: "UI/SkillScreen", layer: "screen", bind() {} },
  rebirth: { prefab: "UI/RebirthScreen", layer: "screen", bind() {} },
  settings: { prefab: "UI/SettingsScreen", layer: "popup", bind() {} },
  battle: { bind: vi.fn() },
  confirm: { prefab: "UI/ConfirmPopup", layer: "popup", bind() {} },
  reward: { prefab: "UI/RewardPopup", layer: "popup", bind() {} },
  toast: { prefab: "UI/Toast", layer: "overlay", bind() {} },
  loading: { prefab: "UI/Loading", layer: "overlay", bind() {} },
  debug: { prefab: "UI/DebugOverlay", layer: "overlay", bind() {} },
  transition: { prefab: "UI/TransitionScreen", layer: "overlay", bind() {} },
  tutorial: { prefab: "UI/TutorialOverlay", layer: "overlay", bind() {} },
};
const world: World = { spawn: vi.fn(), shake: vi.fn(), hitStop: vi.fn() };

function setUp(show: UiStack["show"]) {
  const state = createAppState();
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const account: Account = { lastLoginId: () => "hero", login: vi.fn(async () => {}), logout: vi.fn() };
  const audio = { playBgm: vi.fn(), play: vi.fn() };
  const events = createEventBus<AppEventMap>(logger);
  const transition = { reveal: vi.fn(), open: vi.fn(), clear: signal(true) };
  const settings = {
    value: signal({ volume: { bgm: 0.7, sfx: 1 }, muted: { bgm: false, sfx: false }, frameRate: 60 as const, language: "ko" as const }),
    previewVolume: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), setFrameRate: vi.fn(), setLanguage: vi.fn(),
  };
  const options = {
    state,
    events,
    data: {
      // 3001과 3003은 같은 곡이다.
      stages: new Map([[3001, { bgm: "bgm.meadow" }], [3002, { bgm: "bgm.cave" }], [3003, { bgm: "bgm.meadow" }]]),
      items: new Map(), statUpgrades: new Map(), tutorialSteps: new Map(), strings,
    } as unknown as GameData,
    t: texts({ strings }).t,
    languageNames: languageNames(strings),
    account,
    battle: {
      advance: () => [], upcoming: () => [], snapshot: signal<BattleSnapshot | undefined>(undefined), items: signal(NO_ITEMS),
      bossChallenge: vi.fn(), selectStage: vi.fn(),
    },
    progress: { cmd: {} as Commands },
    ui: { show, shown: signal<readonly ShownView[]>([]), blockBack: vi.fn(() => () => {}) },
    world,
    audio,
    settings,
    transition,
    views,
    logger,
  };
  return { state, events, logger, account, audio, transition, options, screens: createScreens(options) };
}

describe("screens", () => {
  test("each state opens its view bound to a fresh view model", () => {
    const shown: { view: View<unknown>; vm: unknown }[] = [];
    const t = setUp(async (view, vm) => void shown.push({ view: view as View<unknown>, vm }));
    t.screens.login!(createScope());
    t.screens.login!(createScope());
    t.screens.main!(createScope());
    expect(shown.map(entry => entry.view)).toEqual([views.login, views.login, views.main]);
    expect(shown[0].vm).not.toBe(shown[1].vm);
    expect((shown[0].vm as LoginViewModel).loginId.value).toBe("hero");
    expect((shown[2].vm as MainViewModel).nextStage).toBeTypeOf("function");
    // 부팅과 업데이트 상태는 따로 여는 화면이 없고 전환 화면이 가린다.
    expect(t.screens.boot).toBeUndefined();
    expect(t.screens.update).toBeUndefined();
  });

  test("the main state binds a battle director to the world and gives the main screen the battle's HUD", () => {
    const shown: unknown[] = [];
    const t = setUp(async (_view, vm) => void shown.push(vm));
    vi.mocked(views.battle.bind).mockClear();
    const scope = createScope();
    t.screens.login!(scope);
    expect(views.battle.bind).not.toHaveBeenCalled();

    t.screens.main!(scope);
    expect(views.battle.bind).toHaveBeenCalledOnce();
    const [boundScope, boundWorld, director] = vi.mocked(views.battle.bind).mock.calls[0];
    expect(boundScope).toBe(scope);
    expect(boundWorld).toBe(world);
    expect(director.frame).toBeTypeOf("function");
    const main = shown[1] as MainViewModel;
    expect(main.hud.waves.value).toBe("");
    expect(main.challenge).toBeTypeOf("function");

    t.screens.main!(createScope());
    expect(vi.mocked(views.battle.bind).mock.calls[1][2]).not.toBe(director);
  });

  test("the main state plays the shown stage's music and changes it only when the stage's music changes", () => {
    const t = setUp(async () => undefined);
    const snapshot = t.options.battle.snapshot;
    snapshot.value = { stageId: 3001 } as BattleSnapshot;
    const scope = createScope();
    t.screens.login!(scope);
    expect(t.audio.playBgm).not.toHaveBeenCalled();
    t.screens.main!(scope);
    expect(t.audio.playBgm).toHaveBeenCalledExactlyOnceWith("bgm.meadow", expect.anything());
    const [, first] = t.audio.playBgm.mock.calls[0] as [string, Scope];

    // 같은 곡의 스테이지로 옮기면 다시 틀지 않는다.
    snapshot.value = { stageId: 3003 } as BattleSnapshot;
    expect(t.audio.playBgm).toHaveBeenCalledOnce();
    snapshot.value = { stageId: 3002 } as BattleSnapshot;
    expect(t.audio.playBgm).toHaveBeenLastCalledWith("bgm.cave", expect.anything());
    const [, second] = t.audio.playBgm.mock.calls[1] as [string, Scope];
    expect([first.disposed, second.disposed]).toEqual([true, false]);
    scope.dispose();
    expect(second.disposed).toBe(true);
  });

  test("a main tab opens its screen as a sheet and another tab replaces it; the same tab, closing or the back key folds it", async () => {
    const shown: { view: View<unknown>; vm: unknown; owner: Scope; options: OpenOptions | undefined }[] = [];
    const t = setUp(async (view, vm, owner, options) => {
      shown.push({ view: view as View<unknown>, vm, owner, options });
      return { close: vi.fn(), scope: createScope() } as unknown as OpenView;
    });
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    const scope = createScope();
    t.screens.main!(scope);
    const main = shown[0].vm as MainViewModel;
    // 처음에는 탭이 모두 꺼져 판이 없다(장착 현황 판은 메인 화면의 것).
    expect(shown).toHaveLength(1);

    main.toggle("inventory");
    expect(shown[1].view).toBe(views.inventory);
    const inventory = shown[1].vm as InventoryViewModel;
    expect(inventory.slots.value).toEqual([]);
    // 판은 메인 화면 스코프 아래의 따로 닫히는 스코프에 열린다.
    expect([shown[1].owner === scope, shown[1].owner.disposed]).toEqual([false, false]);

    await settle();
    expect(main.sheet.value).toBe("inventory");

    // 새 판이 열린 뒤에 앞 판을 닫는다.
    main.toggle("upgrade");
    expect(shown[2].view).toBe(views.upgrade);
    expect([shown[1].owner.disposed, main.sheet.value]).toEqual([false, "inventory"]);
    await settle();
    expect([shown[1].owner.disposed, main.sheet.value]).toEqual([true, "upgrade"]);
    // 열린 탭을 다시 누르면 판을 바로 닫는다.
    main.toggle("upgrade");
    expect([main.tab.value, main.sheet.value, shown[2].owner.disposed, shown]).toEqual([null, null, true, expect.any(Array)]);
    expect(shown).toHaveLength(3);

    main.toggle("equipment");
    expect(shown[3].view).toBe(views.equipment);
    const equipment = shown[3].vm as EquipmentViewModel;
    expect(equipment.entries.value).toEqual([]);
    equipment.close();
    expect([main.tab.value, shown[3].owner.disposed]).toEqual([null, true]);

    // 뒤로 가기도 판을 닫는다.
    main.toggle("inventory");
    shown[4].options!.back!();
    expect([main.tab.value, shown[4].owner.disposed]).toEqual([null, true]);

    // 메인 화면이 닫히면 열린 판도 닫힌다.
    main.toggle("upgrade");
    await settle();
    scope.dispose();
    expect(shown[5].owner.disposed).toBe(true);
  });

  test("a sheet still loading when the tab changes again is dropped, and the shown sheet stays until the newest one opens", async () => {
    const opens: { view: View<unknown>; vm: unknown; owner: Scope; open: () => void }[] = [];
    const t = setUp((view, vm, owner) => new Promise(resolve => {
      opens.push({
        view: view as View<unknown>, vm, owner, open: () => resolve({ close: vi.fn(), scope: createScope() } as unknown as OpenView),
      });
    }));
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));
    const scope = createScope();
    t.screens.main!(scope);
    const main = opens[0].vm as MainViewModel;

    main.toggle("inventory");
    opens[1].open();
    await settle();
    expect(main.sheet.value).toBe("inventory");
    // 성장 판을 불러오는 사이 장비 탭을 눌렀다. 성장 판은 열지 않고, 장비 판이 열릴 때까지 가방 판이 남는다.
    main.toggle("upgrade");
    main.toggle("equipment");
    expect([opens[2].view, opens[2].owner.disposed, opens[3].view]).toEqual([views.upgrade, true, views.equipment]);
    opens[2].open();
    await settle();
    expect([opens[1].owner.disposed, main.sheet.value]).toEqual([false, "inventory"]);
    opens[3].open();
    await settle();
    expect([opens[1].owner.disposed, opens[3].owner.disposed, main.sheet.value]).toEqual([true, false, "equipment"]);

    // 메인 화면이 닫힌 뒤에 열린 판은 보이는 판이 되지 않는다.
    main.toggle("inventory");
    scope.dispose();
    opens[4].open();
    await settle();
    expect([opens[4].owner.disposed, main.sheet.value]).toEqual([true, "equipment"]);
  });

  test("the main screen opens settings as a popup owned by the main state, which change the device settings", async () => {
    const shown: { view: View<unknown>; vm: unknown; owner: unknown; options: unknown }[] = [];
    const close = vi.fn();
    const t = setUp(async (view, vm, owner, options) => {
      shown.push({ view: view as View<unknown>, vm, owner, options });
      return { close, scope: createScope() } as unknown as OpenView;
    });
    const scope = createScope();
    t.screens.main!(scope);
    (shown[0].vm as MainViewModel).openSettings();
    expect(shown[1]).toMatchObject({ view: views.settings, owner: scope });

    const settings = shown[1].vm as SettingsViewModel;
    expect(settings.channels.map(channel => [channel.name.value, channel.volume.value])).toEqual([["배경음", 0.7], ["효과음", 1]]);
    settings.frameRates.select(30);
    expect(t.options.settings.setFrameRate).toHaveBeenCalledExactlyOnceWith(30);
    await vi.waitFor(() => {
      settings.close();
      expect(close).toHaveBeenCalledOnce();
    });
  });

  test("the main state shows an accepted offline reward as a popup it owns, and its settings popup asks before logging out", async () => {
    const shown: { view: View<unknown>; vm: unknown; owner: unknown; options: unknown }[] = [];
    const t = setUp(async (view, vm, owner, options) => {
      shown.push({ view: view as View<unknown>, vm, owner, options });
      return { close() {}, scope: createScope() } as unknown as OpenView;
    });
    const reward = { duration: 60_000, items: {}, level: { from: 1, to: 2 } };
    // 메인에 들어가기 전의 보상은 상태가 아니라서 나중에 보이지 않는다.
    t.events.emit("offlineReward", reward);
    const scope = createScope();
    t.screens.main!(scope);
    t.events.emit("offlineReward", reward);
    expect(shown[1]).toMatchObject({ view: views.reward, owner: scope });
    expect((shown[1].vm as RewardViewModel).level.value).toBe("Lv.1 → Lv.2");

    (shown[0].vm as MainViewModel).openSettings();
    await vi.waitFor(() => expect(shown[2]).toMatchObject({ view: views.settings, owner: scope }));
    void (shown[2].vm as SettingsViewModel).logout();
    await vi.waitFor(() => expect(shown[3]).toMatchObject({ view: views.confirm, owner: scope }));
    (shown[3].vm as ConfirmViewModel).ok();
    await vi.waitFor(() => expect(t.account.logout).toHaveBeenCalledOnce());

    scope.dispose();
    t.events.emit("offlineReward", reward);
    expect(shown).toHaveLength(4);
  });

  test("the main state opens the tutorial overlay while a step is left, and closes it once the tutorial is done", () => {
    const shown: { view: View<unknown>; vm: unknown; owner: Scope; options: unknown }[] = [];
    const t = setUp(async (view, vm, owner, options) => void shown.push({ view: view as View<unknown>, vm, owner, options }));
    const step = { id: 1, textKey: "tutorial.welcome", target: null, opener: null, unlockStageId: null, unlockLevel: null, equipSlot: null };
    (t.options.data.tutorialSteps as Map<number, typeof step>).set(1, step);
    const player = { profile: { loginId: "hero", level: 1 }, stage: { currentId: 3001 }, tutorial: { stepId: 1 } } as unknown as NonNullable<AppStateValues["player"]>;
    t.state.player.value = player;
    t.screens.main!(createScope());
    const opened = shown.filter(entry => entry.view === views.tutorial);
    expect(opened).toHaveLength(1);
    expect((opened[0].vm as TutorialViewModel).text.value).toBe("어서 오세요! 영웅은 혼자서 몬스터를 사냥합니다.");

    t.state.player.value = { ...player, tutorial: { stepId: null } };
    expect(opened[0].owner.disposed).toBe(true);
    expect(shown.filter(entry => entry.view === views.tutorial)).toHaveLength(1);
  });

  test("the overlays open apart from the flow: the transition and the toast at once, the loading while waiting", () => {
    const shown: { view: View<unknown>; options: unknown }[] = [];
    const t = setUp(async (view, _vm, _owner, options) => void shown.push({ view: view as View<unknown>, options }));
    const scope = createScope();
    showOverlays(t.options, scope);
    expect(t.transition.open).toHaveBeenCalledWith(expect.any(Function), views.transition, scope);
    expect(shown).toEqual([{ view: views.toast, options: undefined }]);
    t.state.network.value = { ...t.state.network.value, waiting: true };
    expect(shown[1]).toEqual({ view: views.loading, options: undefined });
  });

  test("login lifts the transition once its view is open and no login is running, main once its view is open", async () => {
    const opens: (() => void)[] = [];
    const t = setUp(() => new Promise(resolve => opens.push(() => resolve(undefined))));
    const settled = (ready: PromiseLike<unknown>) => {
      const result = { done: false };
      void ready.then(() => (result.done = true));
      return result;
    };
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));

    const scope = createScope();
    t.screens.login!(scope);
    expect(t.transition.reveal).toHaveBeenLastCalledWith(expect.anything(), scope);
    const login = settled(t.transition.reveal.mock.calls[0][0]);
    // 저장된 ID로 저절로 로그인하는 중이다.
    t.state.login.value = { pending: "hero", failed: null };
    opens[0]();
    await flush();
    expect(login.done).toBe(false);
    t.state.login.value = { pending: null, failed: "hero" };
    await flush();
    expect(login.done).toBe(true);

    t.screens.main!(createScope());
    const main = settled(t.transition.reveal.mock.calls[1][0]);
    await flush();
    expect(main.done).toBe(false);
    opens[1]();
    await flush();
    expect(main.done).toBe(true);
  });

  test("a battle view that does not bind is logged and the main screen still opens", () => {
    const shown: unknown[] = [];
    const t = setUp(async (_view, vm) => void shown.push(vm));
    vi.mocked(views.battle.bind).mockImplementationOnce(() => {
      throw new Error("Battle/Actor is missing.");
    });
    t.screens.main!(createScope());
    expect(shown).toHaveLength(1);
    expect(t.logger.error).toHaveBeenCalledWith("The battle view did not bind:", expect.any(Error));
  });

  test("a view that does not open is logged and the flow carries on", async () => {
    const t = setUp(() => Promise.reject(new Error("UI/LoginScreen is missing.")));
    const flow = createAppFlow({
      state: t.state,
      flow: t.state.flow,
      account: t.account,
      progress: { clear: () => void (t.state.player.value = null) },
      requestUpdate: () => {},
      screens: t.screens,
    });
    flow.start();
    await vi.waitFor(() => expect(t.logger.error).toHaveBeenCalledOnce());
    expect(t.logger.error.mock.calls[0][0]).toBe("UI/LoginScreen did not open:");
    expect(t.account.login).toHaveBeenCalledWith("hero");

    t.state.player.value = { profile: { loginId: "hero" }, stage: { currentId: 3001 }, tutorial: { stepId: null } } as unknown as NonNullable<AppStateValues["player"]>;
    expect(t.state.flow.value).toBe("main");
  });
});
