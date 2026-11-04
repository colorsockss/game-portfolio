import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { EquipSlot, ItemKind, loadGameData, SoundChannel, type GameData, type StringsId } from "@idle/data-schema";
import { BattleMode, statUpgradeBatch, TICK_MS, type BattleSnapshot, type ItemAmounts } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import { computed, signal, type Signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { EventSource, TextTarget } from "../src/unity/binding/components.js";
import { Kind, readRefs, ref, type RefsSource } from "../src/unity/binding/refs.js";
import { createScope, type Scope } from "../src/application/scope.js";
import type { ViewRoot } from "../src/presentation/ui/ports.js";
import type { ViewContext } from "../src/presentation/ui/ui-stack.js";
import { createLoginViewModel, type LoginViewModel } from "../src/presentation/view-models/login.js";
import { createAppState, type AppStateValues } from "../src/application/state/app-state.js";
import { bindText, bindValue } from "../src/unity/binding/bind.js";
import { active, button, input, text, view } from "../src/unity/binding/view.js";
import type { Commands } from "../src/application/progress/progress.js";
import { createEquipmentBadges, createEquipmentViewModel } from "../src/presentation/view-models/equipment.js";
import { createInventoryViewModel } from "../src/presentation/view-models/inventory.js";
import { createMainViewModel, type MainTab } from "../src/presentation/view-models/main.js";
import { equipmentView } from "../src/unity/views/equipment.js";
import { upgradeView } from "../src/unity/views/upgrade.js";
import { skillsView } from "../src/unity/views/skills.js";
import { rebirthView } from "../src/unity/views/rebirth.js";
import { createRebirthViewModel } from "../src/presentation/view-models/rebirth.js";
import { createSkillsViewModel } from "../src/presentation/view-models/skills.js";
import { createUpgradeViewModel } from "../src/presentation/view-models/upgrade.js";
import { inventoryView } from "../src/unity/views/inventory.js";
import { loginView } from "../src/unity/views/login.js";
import { mainView } from "../src/unity/views/main.js";
import { settingsView } from "../src/unity/views/settings.js";
import { createSettings, SETTINGS_KEY, type Language } from "../src/application/settings/settings.js";
import { createSettingsViewModel } from "../src/presentation/view-models/settings.js";
import { createAudio } from "../src/presentation/audio/audio.js";
import { anyOf } from "../src/presentation/widgets/badge.js";
import { createTranslate, languageNames, type Translate } from "../src/presentation/text.js";
import { formatBig } from "../src/presentation/format/big.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
// 화면의 문장은 한국어다. 언어를 바꾸는 테스트는 설정의 언어로 따로 만든다.
const { t } = texts(data);

// Unity 컴포넌트와 같은 모양의 평범한 객체(unity/binding/components.ts 참고).

/** UI 스택이 넘기는 뷰 컨텍스트. 누름(버튼 소리)을 센다. */
function fakeContext(translate: Translate = t) {
  return { pressed: vi.fn(), t: translate } satisfies ViewContext;
}

/**
 * 이 항목들을 가진 ViewRefs 컴포넌트. 고정 글자 항목(…Label, …Placeholder)은 주지 않으면 빈 텍스트를 만들어 `labels`에
 * 둔다.
 */
function fakeRefs(entries: Record<string, [Kind, unknown]>, labels: Record<string, TextTarget> = {}): RefsSource {
  const entry = (name: string): [Kind, unknown] | undefined =>
    entries[name] ?? (/(Label|Placeholder)$/.test(name) ? [Kind.Object, (labels[name] ??= { text: "" })] : undefined);
  const list = (name: string) => {
    const items = entry(name)?.[1] as unknown[] | undefined;
    return items ? { Length: items.length, get_Item: (index: number) => items[index] } : null;
  };
  return {
    GetKind: name => entry(name)?.[0] ?? -1,
    GetObject: name => entry(name)?.[1] ?? null,
    GetList: list,
    GetString: name => (entry(name)?.[1] as string | undefined) ?? null,
    GetNumber: name => (entry(name)?.[1] as number | undefined) ?? NaN,
    GetBool: name => (entry(name)?.[1] as boolean | undefined) ?? false,
  };
}
function fakeEvent<A extends unknown[] = []>() {
  const listeners = new Set<(...args: A) => void>();
  const event: EventSource<A> = {
    AddListener: call => void listeners.add(call),
    RemoveListener: call => void listeners.delete(call),
  };
  // UnityEvent처럼 낼 때의 리스너만 부른다. 리스너가 칸을 다시 바인딩해 새로 더한 리스너는 다음 번부터 불린다.
  return { event, listeners, fire: (...args: A) => [...listeners].forEach(call => call(...args)) };
}

/**
 * ItemList(ViewList, ScrollList)처럼 칸을 만들고 칸마다 보일 원소를 알리는 목록. `cell`이 칸 하나의 ViewRefs 항목을 만든다.
 * 원소 수가 바뀌면 ViewList처럼 바로 알리고, 칸 번호가 원소 번호다. `calls`에 원소 수를 적는다.
 */
function fakeList(cell: (slot: number) => Record<string, [Kind, unknown]>) {
  const shown = fakeEvent();
  const cells: Record<string, [Kind, unknown]>[] = [];
  const calls: string[] = [];
  const target = {
    Shown: shown.event, ShownItem: undefined as unknown as RefsSource, ShownIndex: -1, ShownSlot: -1,
    SetCount(count: number) {
      calls.push(`count ${count}`);
      while (cells.length > count) {
        show(cells.length - 1, -1);
        cells.pop();
      }
      while (cells.length < count) {
        cells.push(cell(cells.length));
        show(cells.length - 1, cells.length - 1);
      }
    },
  };
  // C#처럼 칸 하나에 보일 원소를 알린다(ScrollList가 스크롤해서 칸을 다시 쓸 때).
  function show(slot: number, index: number): void {
    target.ShownItem = fakeRefs(cells[slot]);
    target.ShownIndex = index;
    target.ShownSlot = slot;
    shown.fire();
  }
  return { target, cells, calls, show, listeners: shown.listeners };
}

/** RollingText처럼 부름을 기록하고, 굴러간 끝의 글자를 알려 준다. */
function fakeRollingText() {
  const calls: (["Set", string] | ["Roll", string, number])[] = [];
  return {
    calls,
    Set: (text: string) => void calls.push(["Set", text]),
    Roll: (frames: string, seconds: number) => void calls.push(["Roll", frames, seconds]),
    shown(): string | undefined {
      const last = calls.at(-1);
      return last?.[0] === "Set" ? last[1] : last?.[1].split("\n").at(-1);
    },
  };
}

/** IconView처럼 마지막으로 보인 아이콘 이름을 기억한다. */
function fakeIcon() {
  return { shown: "", Show(name: string) { this.shown = name; } };
}

function fakeLoginPrefab() {
  const typed = fakeEvent<[string]>();
  const clicked = fakeEvent();
  const idInput = { text: "", onValueChanged: typed.event };
  const loginButton = { interactable: true, onClick: clicked.event };
  const statusText = { text: "" };
  const source = fakeRefs({
    idInput: [Kind.Object, idInput],
    loginButton: [Kind.Object, loginButton],
    statusText: [Kind.Object, statusText],
  });
  // Unity의 InputField처럼 text를 설정하면 onValueChanged가 발생한다.
  const type = (text: string) => {
    idInput.text = text;
    typed.fire(text);
  };
  return { source, idInput, loginButton, statusText, type, click: clicked.fire, typed, clicked };
}

/** 뷰가 열릴 때 UI 스택이 하듯이, 새 스코프에서 로그인 뷰를 바인딩한다. */
function bindLoginView(source: RefsSource, vm: LoginViewModel): Scope {
  const scope = createScope();
  loginView.bind(scope, source as unknown as ViewRoot, vm, fakeContext());
  return scope;
}

/**
 * 테스트가 값을 쓰는 앱 상태 위의 로그인 뷰모델. 계정은 로그인 요청만 기록하고,
 * 로그인이 어떻게 진행되는지는 계정의 `login` 슬라이스가 나타내며 테스트가 직접 정한다.
 */
function loginScreen(lastLoginId = "", values: Partial<AppStateValues> = {}) {
  const state = createAppState(values);
  const logins: string[] = [];
  const vm = createLoginViewModel({ state, account: { lastLoginId: () => lastLoginId, login: async id => void logins.push(id) }, t });
  const setLogin = (login: AppStateValues["login"]) => void (state.login.value = login);
  return { state, vm, logins, setLogin };
}

describe("MVVM: prefab refs ↔ view ↔ view model", () => {
  test("state flows to the components and input flows back as actions", () => {
    const prefab = fakeLoginPrefab();
    const t = loginScreen();
    bindLoginView(prefab.source, t.vm);
    expect(prefab.loginButton.interactable).toBe(false);

    // 서버가 쓰는 규칙(game-core의 isValidLoginId)으로 검사한다.
    prefab.type("Hero ");
    expect(prefab.loginButton.interactable).toBe(false);
    expect(prefab.statusText.text).toBe("아이디는 영문 소문자, 숫자, _로 4~16자입니다.");
    prefab.type("hero");
    expect(prefab.loginButton.interactable).toBe(true);
    expect(prefab.statusText.text).toBe("");

    prefab.click();
    expect(t.logins).toEqual(["hero"]);
    t.setLogin({ pending: "hero", failed: null });
    expect(prefab.statusText.text).toBe("로그인 중…");
    expect(prefab.loginButton.interactable).toBe(false);

    t.setLogin({ pending: null, failed: null });
    expect(prefab.statusText.text).toBe("");
    expect(prefab.loginButton.interactable).toBe(true);
  });

  test("a failure shows on screen until the ID changes", () => {
    const prefab = fakeLoginPrefab();
    const t = loginScreen("", { login: { pending: null, failed: "hero" } });
    bindLoginView(prefab.source, t.vm);
    prefab.type("hero");
    expect(prefab.statusText.text).toBe("로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    prefab.type("hero2");
    expect(prefab.statusText.text).toBe("");
  });

  test("the screen starts from the saved ID and says why the last session ended", () => {
    const prefab = fakeLoginPrefab();
    const ended = { status: "ended", ended: "replaced", waiting: false } as const;
    bindLoginView(prefab.source, loginScreen("hero", { network: ended }).vm);
    expect(prefab.idInput.text).toBe("hero");
    expect(prefab.loginButton.interactable).toBe(true);
    expect(prefab.statusText.text).toBe("다른 곳에서 같은 아이디로 로그인했습니다.");
  });

  test("closing the view releases every C# listener and signal subscription", () => {
    const prefab = fakeLoginPrefab();
    const { vm } = loginScreen();
    const scope = bindLoginView(prefab.source, vm);
    expect(prefab.typed.listeners.size).toBe(1);
    expect(prefab.clicked.listeners.size).toBe(1);

    scope.dispose();
    expect(prefab.typed.listeners.size).toBe(0);
    expect(prefab.clicked.listeners.size).toBe(0);
    vm.loginId.value = "hero";
    expect(prefab.loginButton.interactable).toBe(false);
  });

  test("a login ID set from code appears in the field once and does not echo back", () => {
    // Unity의 입력란처럼 코드가 text를 바꿔도 onValueChanged가 발생한다.
    const changed = fakeEvent<[string]>();
    const writes: string[] = [];
    let shown = "";
    const idInput = {
      get text() {
        return shown;
      },
      set text(value: string) {
        shown = value;
        writes.push(value);
        changed.fire(value);
      },
      onValueChanged: changed.event,
    };
    const source = fakeRefs({
      idInput: [Kind.Object, idInput],
      loginButton: [Kind.Object, { interactable: true, onClick: fakeEvent().event }],
      statusText: [Kind.Object, { text: "" }],
    });
    const t = loginScreen();
    bindLoginView(source, t.vm);
    const events: string[] = [];
    changed.event.AddListener(text => void events.push(text));
    expect(writes).toEqual([]);

    t.vm.loginId.value = "abc";
    expect(idInput.text).toBe("abc");
    expect(events).toEqual(["abc"]);
    expect(t.vm.loginId.value).toBe("abc");
    expect(writes).toEqual(["abc"]);
  });
});

describe("bindings", () => {
  test("a binding closed by an earlier listener of the same change does not apply after closing", () => {
    // 닫는 구독이 바인딩보다 먼저 등록된 경우와 나중인 경우 둘 다에서, 닫은 뒤에는 적용하지 않는다.
    for (const closerFirst of [true, false]) {
      const s = signal(0);
      const log: string[] = [];
      const screen = createScope();
      const closer = createScope();
      const target: TextTarget = {
        set text(text: string) {
          log.push("apply " + text);
        },
      } as TextTarget;
      const close = () => closer.add(s.subscribe(value => {
        if (value === 1) {
          log.push("close");
          screen.dispose();
        }
      }));
      if (closerFirst) close();
      bindText(screen, target, computed(() => String(s.value)));
      if (!closerFirst) close();

      s.value = 1;
      expect(log).toContain("close");
      expect(log.slice(log.indexOf("close") + 1).filter(line => line.startsWith("apply"))).toEqual([]);
      s.value = 2;
      expect(log.slice(log.indexOf("close") + 1).filter(line => line.startsWith("apply"))).toEqual([]);
    }
  });

  test("a binding's apply that reads another signal is not re-run when that signal changes", () => {
    const a = signal(1);
    const b = signal(0);
    const applied: number[] = [];
    bindValue(createScope(), a, value => {
      applied.push(value);
      void b.value;
    });
    b.value = 1;
    expect(applied).toEqual([1]);
  });
});

describe("binding table", () => {
  interface Panel {
    readonly label: Signal<string>;
    readonly shown: Signal<boolean>;
    readonly name: Signal<string>;
    readonly enabled: Signal<boolean>;
    press(): void;
  }
  function panel(): Panel {
    return { label: signal("a"), shown: signal(true), name: signal("hero"), enabled: signal(true), press: vi.fn() };
  }
  const gameObject = () => {
    const target = { active: false, SetActive: (value: boolean) => void (target.active = value) };
    return target;
  };

  test("a table reads its entries when the view opens and reports every mismatch at once", () => {
    const labelled = view<Panel>("UI/Panel", { a: text(vm => vm.label), b: text(vm => vm.label) });
    const source = fakeRefs({ b: [Kind.List, []] });
    expect(() => labelled.bind(createScope(), source as unknown as ViewRoot, panel(), fakeContext()))
      .toThrow("ViewRefs: a is missing; b is List, not Object.");
  });

  test("text, active and input bindings apply now, follow changes and stop when the scope closes", () => {
    const typed = fakeEvent<[string]>();
    const label = { text: "" };
    const shown = gameObject();
    const field = { text: "", onValueChanged: typed.event };
    const source = fakeRefs({ label: [Kind.Object, label], shown: [Kind.Object, shown], field: [Kind.Object, field] });
    const vm = panel();
    const scope = createScope();
    view<Panel>("UI/Panel", { label: text(vm => vm.label), shown: active(vm => vm.shown), field: input(vm => vm.name) })
      .bind(scope, source as unknown as ViewRoot, vm, fakeContext());
    expect([label.text, shown.active, field.text]).toEqual(["a", true, "hero"]);

    vm.label.value = "b";
    vm.shown.value = false;
    vm.name.value = "hero2";
    expect([label.text, shown.active, field.text]).toEqual(["b", false, "hero2"]);
    typed.fire("typed");
    expect(vm.name.value).toBe("typed");

    scope.dispose();
    expect(typed.listeners.size).toBe(0);
    vm.label.value = "c";
    vm.shown.value = true;
    vm.name.value = "hero3";
    expect([label.text, shown.active, field.text]).toEqual(["b", false, "typed"]);
  });

  test("a button plays the press sound and calls its action on click, and follows its enabled and visible options", () => {
    const clicked = fakeEvent();
    const plainClicked = fakeEvent();
    const full = { interactable: false, onClick: clicked.event, gameObject: gameObject() };
    const plain = { interactable: false, onClick: plainClicked.event, gameObject: gameObject() };
    const source = fakeRefs({ full: [Kind.Object, full], plain: [Kind.Object, plain] });
    const vm = panel();
    const scope = createScope();
    const context = fakeContext();
    view<Panel>("UI/Panel", {
      full: button(vm => vm.press(), { enabled: vm => vm.enabled, visible: vm => vm.shown }),
      plain: button(vm => vm.press()),
    }).bind(scope, source as unknown as ViewRoot, vm, context);
    const state = (target: { interactable: boolean; gameObject: { active: boolean } }) => [target.interactable, target.gameObject.active];
    expect(state(full)).toEqual([true, true]);
    // 옵션이 없는 버튼은 신호를 따라가지 않는다. 신호의 지금 값(true)과 다른 값으로 시작해 확인한다.
    expect(state(plain)).toEqual([false, false]);

    clicked.fire();
    plainClicked.fire();
    expect(vm.press).toHaveBeenCalledTimes(2);
    // 누를 때마다 소리가 액션보다 먼저 난다.
    expect(context.pressed).toHaveBeenCalledTimes(2);
    expect(context.pressed.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(vm.press).mock.invocationCallOrder[0]);

    // enabled와 visible은 서로 독립이다: 하나만 바꾸면 그 대상만 따라간다.
    vm.enabled.value = false;
    expect(state(full)).toEqual([false, true]);
    vm.shown.value = false;
    expect(state(full)).toEqual([false, false]);
    vm.enabled.value = true;
    expect(state(full)).toEqual([true, false]);
    vm.shown.value = true;
    expect(state(full)).toEqual([true, true]);
    expect(state(plain)).toEqual([false, false]);

    scope.dispose();
    expect(clicked.listeners.size).toBe(0);
    expect(plainClicked.listeners.size).toBe(0);
    vm.enabled.value = false;
    vm.shown.value = false;
    expect(state(full)).toEqual([true, true]);
  });
});

describe("reading ViewRefs", () => {
  test("every kind arrives as its JS value, lists as arrays", () => {
    const button = { interactable: true, onClick: fakeEvent().event };
    const source = fakeRefs({
      confirm: [Kind.Object, button],
      slots: [Kind.List, ["a", "b"]],
      title: [Kind.String, ""],
      maxCount: [Kind.Number, 0],
      autoPlay: [Kind.Bool, false],
    });
    const refs = readRefs(source, {
      confirm: ref.object("UnityEngine.UI.Button"),
      slots: ref.list("UnityEngine.GameObject"),
      title: ref.string(),
      maxCount: ref.number(),
      autoPlay: ref.bool(),
    });
    expect(refs).toEqual({ confirm: button, slots: ["a", "b"], title: "", maxCount: 0, autoPlay: false });
  });

  test("a prefab that drifted from its view fails as the view opens, with every problem at once", () => {
    const source = fakeRefs({ title: [Kind.Number, 3], icon: [Kind.Object, null] });
    expect(() => readRefs(source, { title: ref.string(), icon: ref.object("UnityEngine.UI.Image"), slots: ref.list("UnityEngine.GameObject") }))
      .toThrow("ViewRefs: title is Number, not String; icon has nothing assigned; slots is missing.");
    expect(() => bindLoginView(fakeRefs({}), loginScreen().vm))
      .toThrow("idInput is missing; loginButton is missing; statusText is missing");
  });
});

describe("main screen", () => {
  const player = testPlayer(data, 0, { hero: { level: 3 }, items: { 1: Big.from(12_345) } });

  const hero = {
    level: 3, hp: Big.from(50), maxHp: Big.from(100), down: false, effects: [], x: -2, moving: false, attack: Big.from(10), critChance: 0, skills: [],
  };
  const monster = { id: 1, monsterId: 2001, boss: false, hp: Big.from(5000), maxHp: Big.from(10_000), effects: [], x: 1, moving: false };

  function snapshot(overrides: Partial<BattleSnapshot> = {}): BattleSnapshot {
    return {
      stageId: 3001, mode: BattleMode.Hunt, waves: 1, wavesNeeded: 3, autoBoss: true, hasBoss: true,
      bossTicksLeft: null, hero, enemies: [monster], summons: [], projectiles: [], items: {}, ...overrides,
    };
  }

  function fakeMainPrefab() {
    const text = () => ({ text: "" });
    const active = () => ({ active: false, SetActive(on: boolean) { this.active = on; } });
    const button = () => {
      const clicked = fakeEvent();
      const gameObject = { active: true, SetActive: (on: boolean) => void (gameObject.active = on) };
      return { interactable: true, onClick: clicked.event, gameObject, click: clicked.fire, listeners: clicked.listeners };
    };
    // 재화 바는 중첩 프리팹이라 자기 ViewRefs를 가지고, 그 ViewList가 재화마다 칸을 복제한다.
    const slots: { name: { text: string }; icon: ReturnType<typeof fakeIcon>; amount: ReturnType<typeof fakeRollingText> }[] = [];
    const currencies = fakeList(() => {
      const slot = { name: text(), icon: fakeIcon(), amount: fakeRollingText() };
      slots.push(slot);
      return { nameText: [Kind.Object, slot.name], icon: [Kind.Object, slot.icon], amountText: [Kind.Object, slot.amount] };
    });
    // 영웅 띠의 스킬 칸.
    const skillSlots: { icon: ReturnType<typeof fakeIcon>; tint: { index: number }; fill: { fillAmount: number }; seconds: { text: string } }[] = [];
    const skills = fakeList(slot => {
      const cell = { icon: fakeIcon(), tint: { index: -1 }, fill: { fillAmount: -1 }, seconds: text() };
      skillSlots[slot] = cell;
      return {
        icon: [Kind.Object, cell.icon], tint: [Kind.Object, { Show: (index: number) => void (cell.tint.index = index) }],
        cooldownFill: [Kind.Object, cell.fill], cooldownText: [Kind.Object, cell.seconds],
      };
    });
    const tabs = Object.fromEntries(
      ["upgrade", "skills", "equipment", "inventory", "rebirth"].flatMap(key => [[`${key}Button`, button()], [`${key}Selected`, active()]]),
    ) as Record<`${MainTab}Button`, ReturnType<typeof button>> & Record<`${MainTab}Selected`, ReturnType<typeof active>>;
    // 장착 현황 판의 칸.
    const loadoutCells = () => {
      const cells: { tint: { index: number }; icon: ReturnType<typeof fakeIcon>; level: { text: string }; name: { text: string }; open: ReturnType<typeof button> }[] = [];
      const list = fakeList(slot => {
        const cell = { tint: { index: -1 }, icon: fakeIcon(), level: text(), name: text(), open: button() };
        cells[slot] = cell;
        return {
          tint: [Kind.Object, { Show: (index: number) => void (cell.tint.index = index) }], icon: [Kind.Object, cell.icon],
          levelText: [Kind.Object, cell.level], nameText: [Kind.Object, cell.name], openButton: [Kind.Object, cell.open],
        };
      });
      return { cells, list };
    };
    const loadoutEquipment = loadoutCells();
    const loadoutSkills = loadoutCells();
    const parts = {
      levelText: text(), nameText: text(), expBar: { fillAmount: -1 }, expText: text(),
      currencyBar: fakeRefs({ currencies: [Kind.Object, currencies.target] }), settingsButton: button(),
      stageText: text(), prevStageButton: button(), nextStageButton: button(), stageProgress: { fillAmount: -1 },
      wavesText: text(), bossTimeText: text(), bossButton: button(), bossGlow: active(),
      heroStrip: { key: "?", Show(key: string) { this.key = key; } },
      homePanel: active(), loadoutEquipment: loadoutEquipment.list.target, loadoutSkills: loadoutSkills.list.target,
      hpBar: { fillAmount: -1 }, hpText: text(), attackText: text(), critText: text(), skills: skills.target,
      ...tabs,
      equipmentBadge: active(),
    };
    const labels: Record<string, TextTarget> = {};
    const source = fakeRefs(Object.fromEntries(Object.entries(parts).map(([name, part]) => [name, [Kind.Object, part]])), labels);
    return {
      source, slots, skillSlots, skillCalls: skills.calls, labels, get goldText() { return slots[0].amount; },
      equipmentCells: loadoutEquipment.cells, skillCells: loadoutSkills.cells, ...parts,
    };
  }

  function setUp(first: BattleSnapshot | null = snapshot({ waves: 2 }), translate: Translate = t) {
    const state = createAppState({ flow: "main", player });
    const selected: number[] = [];
    // 전투 서비스의 스냅숏은 테스트가 정한다.
    const shown = signal<BattleSnapshot | undefined>(first ?? undefined);
    // 보이는 보유량과 레벨도 테스트가 정한다.
    const items = signal<ItemAmounts>(player.items);
    const heroLevel = signal(player.hero.level);
    const bossChallenge = vi.fn();
    const openSettings = vi.fn();
    // 장비 뱃지는 테스트가 정한다.
    const equipmentBadge = signal(false);
    const vm = createMainViewModel({
      state, data, t: translate,
      battle: { selectStage: stageId => void selected.push(stageId), bossChallenge, snapshot: shown, items, heroLevel },
      equipmentBadge,
      openSettings,
    });
    const prefab = fakeMainPrefab();
    const scope = createScope();
    mainView.bind(scope, prefab.source as unknown as ViewRoot, vm, fakeContext(translate));
    const hudNow = () => [vm.hud.waves.value, vm.hud.bossTime.value, vm.hud.canChallenge.value];
    const header = () => [prefab.levelText.text, prefab.nameText.text, prefab.expText.text];
    return { state, selected, vm, shown, items, heroLevel, hudNow, header, bossChallenge, openSettings, equipmentBadge, prefab, scope };
  }

  test("shows the save and follows it", () => {
    const t = setUp();
    expect(t.header()).toEqual(["3", "hero", "0%"]);
    expect(t.prefab.expBar.fillAmount).toBe(0);
    // 재화는 골드 하나이고(경험치는 경험치 막대가 보인다) 이름 대신 아이콘이다. 처음 골드는 굴리지 않고 보인다.
    expect(t.prefab.slots.map(slot => [slot.icon.shown, slot.name.text])).toEqual([["currency_gold", ""]]);
    expect(t.prefab.goldText.calls).toEqual([["Set", "12.3K"]]);
    expect(t.prefab.stageText.text).toBe("훈련의 초원");

    t.items.value = { 1: Big.from(2_000_000), 2: Big.from(5) };
    expect(t.prefab.goldText.shown()).toBe("2M");
    t.items.value = { 2: Big.from(5) };
    expect(t.prefab.goldText.shown()).toBe("0");
    // 3레벨의 요구량은 144다.
    t.items.value = { 2: Big.from(72) };
    expect(t.header()).toEqual(["3", "hero", "50%"]);
    expect(t.prefab.expBar.fillAmount).toBe(0.5);
    // 골드가 그대로면 다시 굴리지 않는다.
    expect(t.prefab.goldText.calls).toHaveLength(3);
  });

  test("switching the language redraws the open screen: its fixed labels, the stage and the HUD", () => {
    const { t: translate, language } = texts(data);
    const t = setUp(snapshot({ mode: BattleMode.Boss, bossTicksLeft: 864_010 }), translate);
    expect(t.prefab.labels.inventoryLabel.text).toBe("가방");
    expect(t.prefab.labels.loadoutSkillsLabel.text).toBe("스킬");
    expect(t.prefab.stageText.text).toBe("훈련의 초원");
    expect([t.prefab.wavesText.text, t.prefab.bossTimeText.text]).toEqual(["보스", "1일 00:00:01"]);

    language.value = "en";
    expect(Object.fromEntries(Object.entries(t.prefab.labels).map(([name, label]) => [name, label.text]))).toEqual({
      upgradeLabel: "Growth", skillsLabel: "Skills", equipmentLabel: "Gear", inventoryLabel: "Bag", rebirthLabel: "Rebirth",
      loadoutEquipmentLabel: "Gear", loadoutSkillsLabel: "Skills",
    });
    expect(t.prefab.stageText.text).toBe("Training Meadow");
    expect([t.prefab.wavesText.text, t.prefab.bossTimeText.text]).toEqual(["Boss", "1d 00:00:01"]);
    expect(t.header()).toEqual(["3", "hero", "0%"]);

    // 닫힌 화면은 따라가지 않는다.
    t.scope.dispose();
    language.value = "ko";
    expect(t.prefab.labels.inventoryLabel.text).toBe("Bag");
  });

  test("the level and exp follow the shown level and show MAX at the last level", () => {
    const t = setUp();
    t.items.value = { 2: Big.from(43) };
    // 4레벨의 요구량은 172다.
    t.heroLevel.value = 4;
    expect(t.header()).toEqual(["4", "hero", "25%"]);
    t.heroLevel.value = 50;
    expect(t.header()).toEqual(["50", "hero", "MAX"]);
    expect(t.prefab.expBar.fillAmount).toBe(1);
    t.heroLevel.value = 3;
    expect(t.header()).toEqual(["3", "hero", "29%"]);
    // 경계 전에 요구량을 넘게 모아도 100%에서 멈춘다.
    t.items.value = { 2: Big.from(1000) };
    expect([t.header()[2], t.prefab.expBar.fillAmount]).toEqual(["100%", 1]);
  });

  test("its arrows move through the unlocked stages both ways, wrapping at the ends", () => {
    const t = setUp();
    // 아무것도 클리어하지 않았으면 3001만 열려 있어 옮길 곳이 없다.
    expect([t.prefab.prevStageButton.gameObject.active, t.prefab.nextStageButton.gameObject.active]).toEqual([false, false]);

    // 3001–3003을 클리어해 3004까지 열렸다.
    const at = (currentId: number) => ({ ...player, stage: { currentId, clearedIds: [3001, 3002, 3003] } });
    t.state.player.value = at(3002);
    expect([t.prefab.prevStageButton.gameObject.active, t.prefab.nextStageButton.gameObject.active]).toEqual([true, true]);
    t.prefab.nextStageButton.click();
    t.prefab.prevStageButton.click();
    t.state.player.value = at(3004);
    t.prefab.nextStageButton.click();
    t.state.player.value = at(3001);
    t.prefab.prevStageButton.click();
    expect(t.selected).toEqual([3003, 3001, 3001, 3004]);

    // 3006은 3005를 클리어해도 15레벨이 되어야 열린다. 레벨은 보이는 레벨을 따른다.
    t.state.player.value = { ...player, stage: { currentId: 3005, clearedIds: [3001, 3002, 3003, 3004, 3005] } };
    t.prefab.nextStageButton.click();
    t.heroLevel.value = 15;
    t.prefab.nextStageButton.click();
    expect(t.selected.slice(4)).toEqual([3001, 3006]);

    t.scope.dispose();
    expect(t.prefab.nextStageButton.listeners.size).toBe(0);
  });

  test("the tabs start folded with the loadout showing; a tab lights at once, and the loadout and hero strip follow the sheet once it shows", () => {
    const t = setUp();
    const lit = () => (["upgrade", "skills", "equipment", "inventory", "rebirth"] as const).filter(key => t.prefab[`${key}Selected`].active);
    const bottom = () => [t.prefab.homePanel.active, t.prefab.heroStrip.key];
    // 영웅 띠는 보이는 판의 이름(없으면 빈 이름)의 자리로 옮겨 간다.
    expect([t.vm.tab.value, lit(), ...bottom()]).toEqual([null, [], true, ""]);
    t.prefab.equipmentButton.click();
    // 판을 불러오는 동안에는 장착 현황 판과 띠가 그대로다.
    expect([t.vm.tab.value, lit(), ...bottom()]).toEqual(["equipment", ["equipment"], true, ""]);
    t.vm.sheetShown("equipment");
    expect(bottom()).toEqual([false, "equipment"]);
    t.prefab.upgradeButton.click();
    expect([t.vm.tab.value, lit(), ...bottom()]).toEqual(["upgrade", ["upgrade"], false, "equipment"]);
    t.vm.sheetShown("upgrade");
    expect(bottom()).toEqual([false, "upgrade"]);
    t.prefab.upgradeButton.click();
    t.vm.sheetShown(null);
    expect([t.vm.tab.value, lit(), ...bottom()]).toEqual([null, [], true, ""]);
    t.prefab.rebirthButton.click();
    t.vm.closeTab();
    expect([t.vm.tab.value, lit()]).toEqual([null, []]);

    t.prefab.settingsButton.click();
    expect(t.openSettings).toHaveBeenCalledOnce();
    // 장비 탭의 뱃지는 뱃지 트리의 뿌리를 따른다.
    expect(t.prefab.equipmentBadge.active).toBe(false);
    t.equipmentBadge.value = true;
    expect(t.prefab.equipmentBadge.active).toBe(true);
  });

  test("the hero strip shows HP, attack and crit, and the skill bar counts the equipped skills' cooldowns down", () => {
    const skill = (skillId: number, readyInTicks: number) => ({ skillId, cooldownTicks: 40, readyInTicks });
    const t = setUp(snapshot({ hero: { ...hero, attack: Big.from(1234), critChance: 0.065, skills: [skill(1005, 0), skill(1004, 30)] } }));
    expect([t.prefab.hpBar.fillAmount, t.prefab.hpText.text, t.prefab.attackText.text, t.prefab.critText.text])
      .toEqual([0.5, "50 / 100", "1.2K", "6.5%"]);
    // 칸은 슬롯 순서이고 속성 색 번호는 SkillElement의 선언 순서에 1을 더한 것이다(불 3, 물리 1).
    const bar = () => t.prefab.skillSlots.map(slot => [slot.icon.shown, slot.tint.index, slot.fill.fillAmount, slot.seconds.text]);
    expect(bar()).toEqual([["skill_fireball", 3, 0, ""], ["skill_volley", 1, 0.75, `${Math.ceil((30 * TICK_MS) / 1000)}`]]);

    // 재사용 대기만 흐르면 칸을 다시 만들지 않고 칸의 신호가 따라간다.
    const counted = t.prefab.skillCalls.length;
    t.shown.value = snapshot({ hero: { ...hero, skills: [skill(1005, 40), skill(1004, 0)] } });
    expect(bar()).toEqual([["skill_fireball", 3, 1, `${Math.ceil((40 * TICK_MS) / 1000)}`], ["skill_volley", 1, 0, ""]]);
    expect(t.prefab.skillCalls.length).toBe(counted);

    // 전투가 없으면 띠가 빈다.
    t.shown.value = undefined;
    expect([t.prefab.hpBar.fillAmount, t.prefab.hpText.text, t.prefab.skillSlots.length]).toEqual([0, "", 2]);
  });

  test("the stage bar fills with the waves and stays full during the boss", () => {
    const t = setUp();
    expect(t.prefab.stageProgress.fillAmount).toBeCloseTo(2 / 3);
    t.shown.value = snapshot({ mode: BattleMode.Boss, bossTicksLeft: 290 });
    expect(t.prefab.stageProgress.fillAmount).toBe(1);
    t.shown.value = undefined;
    expect(t.prefab.stageProgress.fillAmount).toBe(0);
  });

  test("it shows the battle HUD, and the boss skull is pressable and glowing only while the boss can be challenged", () => {
    const t = setUp();
    const skull = () => [t.prefab.bossButton.interactable, t.prefab.bossGlow.active];
    expect(t.prefab.wavesText.text).toBe("2/3");
    expect(t.prefab.bossTimeText.text).toBe("");
    expect(skull()).toEqual([false, false]);

    t.shown.value = snapshot({ waves: 3, autoBoss: false });
    expect(t.prefab.wavesText.text).toBe("3/3");
    expect(skull()).toEqual([true, true]);
    t.prefab.bossButton.click();
    expect(t.bossChallenge).toHaveBeenCalledTimes(1);

    t.shown.value = snapshot({ mode: BattleMode.Boss, bossTicksLeft: 290 });
    expect(t.prefab.wavesText.text).toBe("보스");
    expect(t.prefab.bossTimeText.text).toBe("00:29");
    expect(skull()).toEqual([false, false]);

    t.scope.dispose();
    expect(t.prefab.bossButton.listeners.size).toBe(0);
  });

  test("before there is a battle, the HUD is empty", () => {
    const t = setUp(null);
    expect(t.hudNow()).toEqual(["", "", false]);
  });

  test("when the battle snapshot goes away the HUD empties and the boss skull stops glowing", () => {
    const t = setUp(snapshot({ waves: 3, autoBoss: false }));
    expect(t.hudNow()).toEqual(["3/3", "", true]);
    expect([t.prefab.bossButton.interactable, t.prefab.bossGlow.active]).toEqual([true, true]);

    t.shown.value = undefined;
    expect(t.hudNow()).toEqual(["", "", false]);
    expect([t.prefab.bossButton.interactable, t.prefab.bossGlow.active]).toEqual([false, false]);
  });

  test("the loadout shows what is equipped and each slot opens its menu", () => {
    const t = setUp();
    // 장비는 아무것도 입지 않았고, 새 계정은 연속 사격·화염구·늑대 소환을 장착한 채 시작한다.
    expect(t.prefab.equipmentCells.map(cell => [cell.icon.shown, cell.tint.index, cell.level.text, cell.name.text])).toEqual([
      ["slot_weapon", 0, "", "비어 있음"], ["slot_armor", 0, "", "비어 있음"], ["slot_accessory", 0, "", "비어 있음"],
    ]);
    expect(t.prefab.skillCells.map(cell => [cell.icon.shown, cell.tint.index, cell.level.text])).toEqual([
      ["skill_volley", 1, "Lv.1"], ["skill_fireball", 3, "Lv.1"], ["skill_wolf", 1, "Lv.1"],
    ]);

    // 낡은 검(+2, 일반)을 입으면 칸이 바뀐다.
    const equipment = { nextId: 2, owned: { 1: { itemId: 101, enhance: 2 } }, equipped: { 1: 1 } };
    t.state.player.value = { ...player, equipment };
    expect([t.prefab.equipmentCells[0].icon.shown, t.prefab.equipmentCells[0].tint.index, t.prefab.equipmentCells[0].level.text, t.prefab.equipmentCells[0].name.text])
      .toEqual(["slot_weapon", 1, "+2", "낡은 검"]);

    t.prefab.equipmentCells[1].open.click();
    expect(t.vm.tab.value).toBe("equipment");
    t.vm.closeTab();
    t.prefab.skillCells[0].open.click();
    expect(t.vm.tab.value).toBe("skills");
  });

  test("the HUD shows the wave count while hunting and the countdown during a boss, and changes with the snapshot", () => {
    const t = setUp(null);
    const { waves, bossTime } = t.vm.hud;
    const seen: string[] = [];
    waves.subscribe(value => seen.push(value));
    expect(t.hudNow()).toEqual(["", "", false]);

    t.shown.value = snapshot();
    expect(t.hudNow()).toEqual(["1/3", "", false]);

    t.shown.value = snapshot({ mode: BattleMode.Boss, bossTicksLeft: 420, enemies: [{ ...monster, boss: true }] });
    expect(t.hudNow()).toEqual(["보스", "00:42", false]);
    t.shown.value = snapshot({ mode: BattleMode.Boss, bossTicksLeft: 419 });
    expect(bossTime.value).toBe("00:42");
    t.shown.value = snapshot({ mode: BattleMode.Boss, bossTicksLeft: null });
    expect(bossTime.value).toBe("");

    // 값이 그대로인 스냅숏은 알리지 않는다. 구독은 처음 값("")도 알린다.
    t.shown.value = snapshot();
    t.shown.value = snapshot();
    expect(seen).toEqual(["", "1/3", "보스", "1/3"]);
  });

  test("a new snapshot with the same HUD text does not notify", () => {
    const t = setUp();
    const notified = vi.fn();
    t.vm.hud.waves.subscribe(notified);
    t.shown.value = snapshot({ waves: 2 });
    t.shown.value = snapshot({ waves: 2 });
    expect(notified).toHaveBeenCalledTimes(1);
  });

  test("the boss challenge is offered once the waves are in and nothing will start the boss on its own", () => {
    const t = setUp();
    const offered = (overrides: Partial<BattleSnapshot>) => {
      t.shown.value = snapshot({ waves: 3, autoBoss: false, ...overrides });
      return t.vm.hud.canChallenge.value;
    };
    expect(offered({})).toBe(true);
    expect(offered({ waves: 2 })).toBe(false);
    expect(offered({ autoBoss: true })).toBe(false);
    expect(offered({ hasBoss: false })).toBe(false);
    expect(offered({ mode: BattleMode.Boss })).toBe(false);
  });

  test("after the snapshot leaves a boss fight the HUD is the hunt again", () => {
    const t = setUp(snapshot({ mode: BattleMode.Boss, bossTicksLeft: 300 }));
    expect(t.hudNow()).toEqual(["보스", "00:30", false]);

    t.shown.value = snapshot({ waves: 3, autoBoss: false });
    expect(t.hudNow()).toEqual(["3/3", "", true]);
  });

  test("challenging asks the battle for the boss", () => {
    const t = setUp();
    t.vm.challenge();
    expect(t.bossChallenge).toHaveBeenCalledOnce();
  });
});

describe("inventory screen", () => {
  const STONE = 3;
  const STONE_KEY = "item.stone" as StringsId;
  // 재료 탭을 보려고 재료 하나와 그 이름을 더한 데이터. 지금 Items에는 재화(골드, 경험치)뿐이다.
  const withStone: GameData = {
    ...data,
    items: new Map([...data.items, [STONE, { id: STONE, nameKey: STONE_KEY, cap: null, note: null, kind: ItemKind.Material, slot: null, attack: null, defense: null, maxHp: null, enhanceMax: null, mergeItemId: null, mergeCount: null, icon: "stone", grade: null }]]),
    strings: new Map([...data.strings, [STONE_KEY, { id: STONE_KEY, ko: "강화석", en: "Upgrade Stone" }]]),
  };

  function setUp(first: ItemAmounts, fields = ["icon", "nameText", "amountText", "tint"]) {
    const items = signal<ItemAmounts>(first);
    const close = vi.fn();
    const vm = createInventoryViewModel({ data: withStone, t: texts(withStone).t, items, close });
    // 칸의 글자와 아이콘에 쓰는 것을 "칸 항목 값"으로 적는다.
    const calls: string[] = [];
    const list = fakeList(slot => Object.fromEntries(fields.map(field => [field, [Kind.Object, {
      set text(value: string) {
        calls.push(`${slot} ${field} ${value}`);
      },
      Show(name: string) {
        calls.push(`${slot} ${field} ${name}`);
      },
    }]])));
    const tabClicks = [fakeEvent(), fakeEvent(), fakeEvent()];
    const tabCalls: string[] = [];
    const tabs = {
      SetCount: (count: number) => void tabCalls.push(`count ${count}`),
      SetLabel: (index: number, label: string) => void tabCalls.push(`${index} ${label}`),
      Select: (index: number) => void tabCalls.push(`select ${index}`),
      GetClickEvent: (index: number) => tabClicks[index].event,
    };
    const scope = createScope();
    const refs = fakeRefs({ tabs: [Kind.Object, tabs], items: [Kind.Object, list.target] });
    const context = fakeContext();
    inventoryView.bind(scope, refs as unknown as ViewRoot, vm, context);
    const counts = list.calls;
    return {
      items, close, vm, calls, counts, list, tabCalls, tabClicks, scope, context,
    };
  }

  test("lists what is held in item ID order with the table's names, leaving out what is empty", () => {
    const t = setUp({ 2: Big.from(1_500), 1: Big.from(12_345), 9: Big.ZERO });
    expect(t.vm.slots.value).toEqual([
      { icon: "currency_gold", name: "골드", amount: "12.3K", tint: 0 }, { icon: "currency_exp", name: "경험치", amount: "1.5K", tint: 0 },
    ]);
    expect(t.counts).toEqual(["count 2"]);
    expect(t.calls).toEqual([
      "0 icon currency_gold", "0 nameText 골드", "0 amountText 12.3K", "0 tint 0",
      "1 icon currency_exp", "1 nameText 경험치", "1 amountText 1.5K", "1 tint 0",
    ]);
  });

  test("rebinds only the cells whose item changed, and a cell the list shows again", () => {
    const t = setUp({ 1: Big.from(12_345), 2: Big.from(1_500) });
    t.calls.length = 0;
    t.items.value = { 1: Big.from(12_345), 2: Big.from(2_000) };
    expect(t.calls).toEqual(["1 icon currency_exp", "1 nameText 경험치", "1 amountText 2K", "1 tint 0"]);
    t.items.value = { 2: Big.from(2_000) };
    expect(t.counts).toEqual(["count 2", "count 1"]);
    expect(t.calls.slice(4)).toEqual(["0 icon currency_exp", "0 nameText 경험치", "0 amountText 2K", "0 tint 0"]);
    // 스크롤해서 칸을 다시 쓰면 그 칸을 그 원소로 다시 잇는다. 같은 원소를 다시 알리면 그대로다.
    t.list.show(0, 0);
    expect(t.calls).toHaveLength(8);
    t.items.value = { 1: Big.from(5), 2: Big.from(2_000) };
    t.list.show(1, 0);
    expect(t.calls.slice(-4)).toEqual(["1 icon currency_gold", "1 nameText 골드", "1 amountText 5", "1 tint 0"]);

    t.scope.dispose();
    const written = t.calls.length;
    t.items.value = { 1: Big.from(1) };
    t.list.show(0, 0);
    expect(t.calls).toHaveLength(written);
    expect(t.list.listeners.size).toBe(0);
  });

  test("shows the kind tabs with everything picked first", () => {
    const t = setUp({});
    expect(t.vm.tabs.selected.value).toBeNull();
    expect(t.tabCalls).toEqual(["count 3", "0 전체", "1 재화", "2 재료", "select 0"]);
  });

  test("a tab narrows the list to its kind, and the tab bar follows the picked tab", () => {
    const t = setUp({ 1: Big.from(10), 2: Big.from(20), [STONE]: Big.from(3) });
    expect(t.vm.slots.value.map(slot => slot.name)).toEqual(["골드", "경험치", "강화석"]);

    t.tabClicks[2].fire();
    expect(t.context.pressed).toHaveBeenCalledOnce();
    expect(t.vm.tabs.selected.value).toBe(ItemKind.Material);
    expect(t.vm.slots.value).toEqual([{ icon: "stone", name: "강화석", amount: "3", tint: 0 }]);
    expect(t.tabCalls.at(-1)).toBe("select 2");
    expect(t.counts.at(-1)).toBe("count 1");
    expect(t.calls.slice(-4)).toEqual(["0 icon stone", "0 nameText 강화석", "0 amountText 3", "0 tint 0"]);

    t.vm.tabs.select(ItemKind.Currency);
    expect(t.vm.slots.value.map(slot => slot.name)).toEqual(["골드", "경험치"]);
    expect(t.tabCalls.at(-1)).toBe("select 1");
  });

  test("a cell that lacks an entry its row binds is reported when the list shows it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    setUp({ 1: Big.from(1) }, ["icon", "nameText"]);
    expect(error).toHaveBeenCalledWith("[TypeScript] Uncaught:", expect.objectContaining({ message: expect.stringContaining("amountText") }));
    error.mockRestore();
  });

  test("closing stops listening to the tabs", () => {
    const t = setUp({});
    expect(t.calls).toEqual([]);
    expect(t.counts).toEqual([]);
    t.scope.dispose();
    expect(t.tabClicks.every(click => click.listeners.size === 0)).toBe(true);
  });
});

describe("equipment screen", () => {
  // 낡은 검(1, 공격 +5)을 입고 오우거 대검(2, 공격 +25)과 가죽 갑옷(3, 방어 +3, HP +30)을 가진 1레벨 영웅.
  const owned = { 1: { itemId: 101, enhance: 0 }, 2: { itemId: 104, enhance: 0 }, 3: { itemId: 102, enhance: 0 } };
  const player = testPlayer(data, 0, { equipment: { nextId: 4, owned, equipped: { 1: 1 } } });

  function setUp() {
    const state = createAppState({ flow: "main", player });
    const heroLevel = signal(player.hero.level);
    const items = signal<ItemAmounts>({});
    const sent: string[] = [];
    let refuse = false;
    const send = (name: string) => async ({ equipmentId }: { equipmentId: number }) => {
      sent.push(`${name} ${equipmentId}`);
      if (refuse) throw new Error("offline");
      return undefined;
    };
    const cmd = { ItemEquip: send("equip"), ItemUnequip: send("unequip"), ItemEnhance: send("enhance"), ItemMerge: send("merge") } as unknown as Commands;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const badges = createEquipmentBadges({ state, data });
    const vm = createEquipmentViewModel({ state, data, t, battle: { heroLevel, items }, progress: { cmd }, badges, logger, close });

    const stats: { name: { text: string }; icon: ReturnType<typeof fakeIcon>; amount: ReturnType<typeof fakeRollingText> }[] = [];
    const statList = fakeList(() => {
      const stat = { name: { text: "" }, icon: fakeIcon(), amount: fakeRollingText() };
      stats.push(stat);
      return { nameText: [Kind.Object, stat.name], icon: [Kind.Object, stat.icon], amountText: [Kind.Object, stat.amount] };
    });
    // 장비 칸: 등급 색 칸의 아이콘, 강화 단계, 합성 재료 막대와 수, 착용·더 좋음·고름 표시, 칸 전체의 버튼.
    const shownFlag = () => ({ active: true, SetActive(active: boolean) { this.active = active; } });
    const cells: {
      icon: ReturnType<typeof fakeIcon>; tint: { index: number }; level: { text: string }; countBar: ReturnType<typeof shownFlag>;
      count: { fillAmount: number }; countText: { text: string };
      worn: ReturnType<typeof shownFlag>; better: ReturnType<typeof shownFlag>; selected: ReturnType<typeof shownFlag>; click: ReturnType<typeof fakeEvent>;
    }[] = [];
    const list = fakeList(() => {
      const cell = {
        icon: fakeIcon(), tint: { index: -1 }, level: { text: "" }, countBar: shownFlag(), count: { fillAmount: -1 }, countText: { text: "" },
        worn: shownFlag(), better: shownFlag(), selected: shownFlag(), click: fakeEvent(),
      };
      cells.push(cell);
      return {
        icon: [Kind.Object, cell.icon], tint: [Kind.Object, { Show: (index: number) => void (cell.tint.index = index) }],
        levelText: [Kind.Object, cell.level], countBar: [Kind.Object, cell.countBar], countFill: [Kind.Object, cell.count],
        countText: [Kind.Object, cell.countText],
        wornMark: [Kind.Object, cell.worn], betterBadge: [Kind.Object, cell.better], selectedMark: [Kind.Object, cell.selected],
        selectButton: [Kind.Object, { interactable: true, onClick: cell.click.event, gameObject: { SetActive() {} } }],
      };
    });
    // 강화·합성 패널과 머리의 일괄 버튼.
    const forgeButton = () => {
      const click = fakeEvent();
      return { click, target: { interactable: true, onClick: click.event, gameObject: { SetActive() {} } } };
    };
    const forge = {
      panel: shownFlag(), mergeRow: shownFlag(), name: { text: "" }, step: { text: "" }, detail: { text: "" },
      cost: fakeRollingText(), mergeCount: { text: "" }, mergeInto: { text: "" }, enhance: forgeButton(), merge: forgeButton(),
      equip: forgeButton(), equipBest: forgeButton(), mergeAll: forgeButton(),
    };
    // 칸 번호가 원소 번호인 목록이라 보이는 칸이 곧 목록이다: 아이콘, 등급 색, 강화 단계, 재료 수, 착용(E), 더 좋음(!).
    const shown = () => cells.slice(0, list.cells.length).map(cell => [
      cell.icon.shown, cell.tint.index, cell.level.text, cell.countText.text, cell.worn.active ? "E" : "", cell.better.active ? "!" : "",
    ]);
    const tabClicks = [fakeEvent(), fakeEvent(), fakeEvent(), fakeEvent()];
    // 탭 틀의 뱃지. 탭마다 하나다.
    const tabBadges = tabClicks.map(() => ({ active: false, SetActive(active: boolean) { this.active = active; } }));
    const tabs = {
      SetCount() {}, SetLabel() {}, Select() {},
      GetClickEvent: (index: number) => tabClicks[index].event,
      GetBadge: (index: number) => tabBadges[index],
    };
    const scope = createScope();
    const refs = fakeRefs({
      stats: [Kind.Object, statList.target], tabs: [Kind.Object, tabs], items: [Kind.Object, list.target],
      forgePanel: [Kind.Object, forge.panel], forgeNameText: [Kind.Object, forge.name], forgeStepText: [Kind.Object, forge.step],
      forgeDetailText: [Kind.Object, forge.detail], enhanceCostText: [Kind.Object, forge.cost],
      enhanceButton: [Kind.Object, forge.enhance.target], mergeRow: [Kind.Object, forge.mergeRow],
      mergeCountText: [Kind.Object, forge.mergeCount], mergeIntoText: [Kind.Object, forge.mergeInto],
      mergeButton: [Kind.Object, forge.merge.target], equipToggleButton: [Kind.Object, forge.equip.target],
      equipBestButton: [Kind.Object, forge.equipBest.target], mergeAllButton: [Kind.Object, forge.mergeAll.target],
    });
    const context = fakeContext();
    equipmentView.bind(scope, refs as unknown as ViewRoot, vm, context);
    const click = (index: number) => cells[index].click.fire();
    return {
      state, heroLevel, vm, badges, sent, logger, close, stats, shown, cells, list, tabClicks, tabBadges, context, scope, click, forge, items,
      refuse: () => void (refuse = true),
    };
  }

  test("tapping a cell picks it for the forge panel, which shows its step and cost and sends enhance and merge", () => {
    const t = setUp();
    // 처음에는 입은 장비(낡은 검)를 골라 두어 패널이 보인다.
    expect([t.forge.panel.active, t.forge.name.text, t.cells[0].selected.active]).toEqual([true, "낡은 검", true]);
    t.items.value = { [data.constants.goldItemId]: Big.from(1_000_000) };
    // 입은 칸을 누르면 고르기만 한다.
    t.click(0);
    expect(t.sent).toEqual([]);
    expect(t.cells[0].selected.active).toBe(true);
    expect(t.forge.panel.active).toBe(true);
    expect([t.forge.name.text, t.forge.step.text, t.forge.detail.text]).toEqual([t.vm.forge.name.value, t.vm.forge.step.value, t.vm.forge.detail.value]);
    expect(t.forge.name.text).toBe("낡은 검");
    // 0단계의 강화 비용은 enhanceCost 공식의 floor(500 × 1.5^0)이다.
    expect(t.forge.cost.shown()).toBe("500");
    expect(t.forge.enhance.target.interactable).toBe(true);
    // 낡은 검은 다음 등급이 있어 합성 줄이 보이지만, 같은 장비가 모자라 누를 수 없다.
    expect([t.forge.mergeRow.active, t.forge.merge.target.interactable]).toEqual([true, false]);
    t.forge.enhance.click.fire();
    expect(t.sent).toEqual(["enhance 1"]);
    // 입지 않은 칸을 누르면 고르고 입는다(튜토리얼의 착용).
    t.click(1);
    expect(t.sent).toEqual(["enhance 1", "equip 2"]);
    expect(t.forge.name.text).toBe("오우거 대검");
  });

  test("lists what is owned by slot and item with what it adds, marking what is worn and what is better", () => {
    const t = setUp();
    expect(t.vm.entries.value.map(({ name, detail, state }) => [name, detail, state])).toEqual([
      ["낡은 검", "무기 · 공격 +5", "착용 중"],
      ["오우거 대검", "무기 · 공격 +25", "더 좋음"],
      ["가죽 갑옷", "방어구 · 방어 +3 · HP +30", "더 좋음"],
    ]);
    // 칸은 등급 색(낡은 검·가죽 갑옷은 일반 1, 오우거 대검은 희귀 3)과 합성 재료(셋 중 하나)를 보인다.
    expect(t.shown()).toEqual([
      ["slot_weapon", 1, "", "1/3", "E", ""],
      ["slot_weapon", 3, "", "1/3", "", "!"],
      ["slot_armor", 1, "", "1/3", "", "!"],
    ]);
    expect(t.cells.slice(0, 3).map(cell => cell.count.fillAmount)).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  test("the stats are the hero's with what is worn, and roll when what is worn or the shown level changes", () => {
    const t = setUp();
    expect(t.stats.map(stat => [stat.name.text, stat.amount.shown()])).toEqual([["공격", "25"], ["방어", "5"], ["HP", "200"]]);

    t.state.player.value = { ...player, equipment: { ...player.equipment, equipped: { 1: 2, 2: 3 } } };
    expect(t.stats.map(stat => stat.amount.shown())).toEqual(["45", "8", "230"]);
    expect(t.stats[0].amount.calls.at(-1)?.[0]).toBe("Roll");
    expect(t.shown().map(([, , , , worn]) => worn)).toEqual(["", "E", "E"]);

    // 레벨은 보이는 전투를 따른다(2레벨: HP 224, 공격 22, 방어 6).
    t.heroLevel.value = 2;
    expect(t.stats.map(stat => stat.amount.shown())).toEqual(["47", "9", "254"]);
  });

  test("a slot tab narrows the list to that slot", () => {
    const t = setUp();
    t.tabClicks[2].fire();
    expect(t.vm.entries.value.map(entry => entry.name)).toEqual(["가죽 갑옷"]);
    expect(t.list.calls.at(-1)).toBe("count 1");
    expect(t.shown()).toEqual([["slot_armor", 1, "", "1/3", "", "!"]]);
  });

  test("tapping a cell wears what is not worn, the forge button takes it off, and a lost request is only logged", async () => {
    const t = setUp();
    t.click(0);
    t.click(1);
    expect(t.sent).toEqual(["equip 2"]);
    // 고른 것이 입은 것이면 패널의 버튼이 벗긴다. 이 테스트의 커맨드는 상태를 바꾸지 않아 1이 입은 채다.
    t.click(0);
    expect(t.vm.forge.toggleLabel.value).toBe("해제");
    t.forge.equip.click.fire();
    expect(t.sent).toEqual(["equip 2", "unequip 1"]);
    // 누를 때마다 소리가 난다.
    expect(t.context.pressed).toHaveBeenCalledTimes(4);
    t.refuse();
    t.click(2);
    await vi.waitFor(() => expect(t.logger.warn).toHaveBeenCalledOnce());
    expect(t.sent.at(-1)).toBe("equip 3");
  });

  test("equip best wears the best of each slot, and merge all merges what has its materials", () => {
    const t = setUp();
    expect([t.forge.equipBest.target.interactable, t.forge.mergeAll.target.interactable]).toEqual([true, false]);
    t.forge.equipBest.click.fire();
    expect(t.sent).toEqual(["equip 2", "equip 3"]);

    // 낡은 검을 셋 모으면 합성할 수 있다. 이 테스트의 커맨드는 상태를 바꾸지 않아 같은 재료가 다시 나오면 멈춘다.
    t.state.player.value = { ...player, equipment: { nextId: 4, owned: { 1: owned[1], 2: { itemId: 101, enhance: 0 }, 3: { itemId: 101, enhance: 0 } }, equipped: {} } };
    expect(t.forge.mergeAll.target.interactable).toBe(true);
    t.forge.mergeAll.click.fire();
    expect(t.sent.slice(2).filter(sent => sent.startsWith("merge"))).toHaveLength(1);
  });

  test("the badge tree lights a slot tab for better equipment and the root for any slot, and goes out once it is worn", () => {
    const t = setUp();
    // 무기는 낡은 검(공격 +5)보다 오우거 대검(+25)이, 비어 있는 방어구는 가죽 갑옷이 더 좋다. 장신구는 없다.
    expect([...t.badges.better.value]).toEqual([[2, EquipSlot.Weapon], [3, EquipSlot.Armor]]);
    expect(t.tabBadges.map(badge => badge.active)).toEqual([true, true, true, false]);

    t.state.player.value = { ...player, equipment: { ...player.equipment, equipped: { 1: 2 } } };
    expect(t.tabBadges.map(badge => badge.active)).toEqual([true, false, true, false]);
    t.state.player.value = { ...player, equipment: { ...player.equipment, equipped: { 1: 2, 2: 3 } } };
    expect(t.tabBadges.map(badge => badge.active)).toEqual([false, false, false, false]);
    expect(t.badges.any.value).toBe(false);

    t.scope.dispose();
  });

  test("equipment that raises one stat and lowers another is not better, nor is a copy of what is worn", () => {
    // 가죽 갑옷(방어 +3, HP +30)을 입고, 방어는 높고 HP는 낮은 가시 갑옷과 같은 가죽 갑옷을 하나 더 가졌다.
    const THORNS = 900;
    const withThorns: GameData = {
      ...data,
      items: new Map([...data.items, [THORNS, { ...data.items.get(102)!, id: THORNS, defense: Big.from(20), maxHp: Big.from(10) }]]),
    };
    const armor = { nextId: 4, owned: { 1: { itemId: 102, enhance: 0 }, 2: { itemId: THORNS, enhance: 0 }, 3: { itemId: 102, enhance: 0 } }, equipped: { [EquipSlot.Armor]: 1 } };
    const state = createAppState({ flow: "main", player: { ...player, equipment: armor } });
    const badges = createEquipmentBadges({ state, data: withThorns });
    expect(badges.better.value.size).toBe(0);
    expect(badges.slots[EquipSlot.Armor].value).toBe(false);
    // 아무것도 입지 않은 슬롯에는 어느 것이든 더 좋다.
    state.player.value = { ...player, equipment: { ...armor, equipped: {} } };
    expect([...badges.better.value.keys()]).toEqual([1, 2, 3]);
    expect(badges.any.value).toBe(true);
  });

  test("a tab bar whose tabs have no badge object does not open", () => {
    const state = createAppState({ flow: "main", player });
    const vm = createEquipmentViewModel({
      state, data, t, battle: { heroLevel: signal(player.hero.level), items: signal({}) }, progress: { cmd: {} as Commands },
      badges: createEquipmentBadges({ state, data }), logger: console, close() {},
    });
    const tabs = { SetCount() {}, SetLabel() {}, Select() {}, GetClickEvent: () => fakeEvent().event, GetBadge: () => null };
    const list = fakeList(() => ({}));
    const stats = fakeList(() => ({ nameText: [Kind.Object, { text: "" }], icon: [Kind.Object, fakeIcon()], amountText: [Kind.Object, fakeRollingText()] }));
    const refs = fakeRefs({
      stats: [Kind.Object, stats.target],
      tabs: [Kind.Object, tabs], items: [Kind.Object, list.target],
      ...Object.fromEntries(["forgePanel", "mergeRow"].map(name => [name, [Kind.Object, { SetActive() {} }]])),
      ...Object.fromEntries(["forgeNameText", "forgeStepText", "forgeDetailText", "mergeCountText", "mergeIntoText"].map(name => [name, [Kind.Object, { text: "" }]])),
      enhanceCostText: [Kind.Object, fakeRollingText()],
      ...Object.fromEntries(["enhanceButton", "mergeButton", "equipToggleButton", "equipBestButton", "mergeAllButton"].map(
        name => [name, [Kind.Object, { interactable: true, onClick: fakeEvent().event, gameObject: { SetActive() {} } }]],
      )),
    });
    expect(() => equipmentView.bind(createScope(), refs as unknown as ViewRoot, vm, fakeContext())).toThrow("The tab 전체 has no badge.");
  });

  test("closing stops listening to the list and its cells", () => {
    const t = setUp();
    t.scope.dispose();
    expect(t.list.listeners.size).toBe(0);
    expect(t.cells.every(cell => cell.click.listeners.size === 0)).toBe(true);
  });
});

describe("badges", () => {
  test("a parent badge is on while any child is, and tells only when that changes", () => {
    const a = signal(false);
    const b = signal(false);
    const parent = anyOf([a, b]);
    const seen: boolean[] = [];
    parent.subscribe(on => void seen.push(on));
    a.value = true;
    b.value = true;
    a.value = false;
    b.value = false;
    expect(seen).toEqual([false, true, false]);
  });
});

describe("settings screen", () => {
  /** 놓을 때를 알리는 슬라이더(ReleaseSlider). 끄는 동안 값마다 onValueChanged가 나고, 코드가 놓은 값은 알리지 않는다. */
  function fakeSlider() {
    const changed = fakeEvent<[number]>();
    const released = fakeEvent();
    const target = {
      value: -1,
      SetValueWithoutNotify: (value: number) => void (target.value = value),
      onValueChanged: changed.event,
      Released: released.event,
      drag(value: number) {
        target.value = value;
        changed.fire(value);
      },
      release: released.fire,
      listeners: () => changed.listeners.size + released.listeners.size,
    };
    return target;
  }

  /** Toggle. 플레이어가 누르면 바뀐 값으로 onValueChanged가 난다. */
  function fakeToggle() {
    const changed = fakeEvent<[boolean]>();
    const target = {
      isOn: false,
      SetIsOnWithoutNotify: (on: boolean) => void (target.isOn = on),
      onValueChanged: changed.event,
      tap() {
        target.isOn = !target.isOn;
        changed.fire(target.isOn);
      },
    };
    return target;
  }

  async function setUp() {
    const values = new Map<string, string>();
    const storage = { get: (key: string) => values.get(key) ?? null, set: vi.fn((key: string, value: string) => void values.set(key, value)), delete() {} };
    const display = { setFrameRate: vi.fn(), language: () => "ko" };
    const names = languageNames(data.strings);
    const settings = createSettings({ storage, display, languages: Object.keys(names) as Language[], logger: console });
    // 앱처럼 문장이 설정의 언어를 따라간다.
    const translate = createTranslate(data.strings, computed(() => settings.value.value.language));
    // 메인 화면의 BGM이 돌고 있다.
    const bridge = { playBgm: vi.fn(), setBgmVolume: vi.fn(), stopBgm: vi.fn(), playSfx: vi.fn() };
    const audio = createAudio({ bridge, resources: { load: async () => ({ release() {} }) }, data, settings: settings.value, logger: console });
    audio.playBgm(data.stages.get(3001)!.bgm, createScope());
    await vi.waitFor(() => expect(bridge.playBgm).toHaveBeenCalledOnce());

    const rows: { name: TextTarget; slider: ReturnType<typeof fakeSlider>; mute: ReturnType<typeof fakeToggle> }[] = [];
    const channels = fakeList(() => {
      const row = { name: { text: "" }, slider: fakeSlider(), mute: fakeToggle() };
      rows.push(row);
      return { nameText: [Kind.Object, row.name], volumeSlider: [Kind.Object, row.slider], muteToggle: [Kind.Object, row.mute] };
    });
    // 탭 막대 하나: 고른 탭과 탭 이름을 부름 순서대로 적는다.
    const tabBar = () => {
      const clicks = [fakeEvent(), fakeEvent()];
      const calls: string[] = [];
      return {
        clicks, calls,
        target: {
          SetCount() {}, SetLabel: (index: number, label: string) => void calls.push(`${index} ${label}`),
          Select: (index: number) => void calls.push(`select ${index}`), GetClickEvent: (index: number) => clicks[index].event,
          GetBadge: () => null,
        },
      };
    };
    const frameRates = tabBar();
    const languages = tabBar();
    const closeClick = fakeEvent();
    const logoutClick = fakeEvent();
    const close = vi.fn();
    // 확인 팝업의 답은 테스트가 정한다.
    const confirm = vi.fn(async (_message: string) => true);
    const account = { logout: vi.fn() };
    const scope = createScope();
    const context = fakeContext(translate);
    const labels: Record<string, TextTarget> = {};
    const refs = fakeRefs({
      channels: [Kind.Object, channels.target], frameRates: [Kind.Object, frameRates.target], languages: [Kind.Object, languages.target],
      closeButton: [Kind.Object, { interactable: true, onClick: closeClick.event, gameObject: { SetActive() {} } }],
      logoutButton: [Kind.Object, { interactable: true, onClick: logoutClick.event, gameObject: { SetActive() {} } }],
    }, labels);
    const vm = createSettingsViewModel({ settings, t: translate, languageNames: names, account, confirm, close });
    settingsView.bind(scope, refs as unknown as ViewRoot, vm, context);
    const saved = () => JSON.parse(values.get(SETTINGS_KEY) ?? "null");
    return {
      settings, storage, display, bridge, rows, tabCalls: frameRates.calls, tabClicks: frameRates.clicks, languages, labels, close,
      closeClick, logoutClick, confirm, account, scope, context, saved,
    };
  }

  test("shows a row per channel with its volume and mute, and the frame rate tabs", async () => {
    const t = await setUp();
    expect(t.rows.map(row => [row.name.text, row.slider.value, row.mute.isOn])).toEqual([["배경음", 0.7, false], ["효과음", 1, false]]);
    expect(t.tabCalls).toEqual(["0 30 FPS", "1 60 FPS", "select 1"]);
    expect(t.languages.calls).toEqual(["0 한국어", "1 English", "select 0"]);
    expect(Object.fromEntries(Object.entries(t.labels).map(([name, label]) => [name, label.text]))).toEqual({
      titleLabel: "설정", frameRateLabel: "초당 프레임", languageLabel: "언어", logoutLabel: "로그아웃",
    });
  });

  test("its logout button asks first and logs out only on yes", async () => {
    const t = await setUp();
    t.confirm.mockResolvedValueOnce(false);
    t.logoutClick.fire();
    await vi.waitFor(() => expect(t.confirm).toHaveBeenCalledWith("로그아웃할까요?"));
    expect(t.context.pressed).toHaveBeenCalledOnce();
    expect(t.account.logout).not.toHaveBeenCalled();
    t.logoutClick.fire();
    await vi.waitFor(() => expect(t.account.logout).toHaveBeenCalledOnce());
  });

  test("picking a language saves it and redraws the open screen in that language, keeping each language's own name", async () => {
    const t = await setUp();
    t.languages.clicks[1].fire();
    expect(t.context.pressed).toHaveBeenCalledOnce();
    expect(t.saved().language).toBe("en");
    expect(t.languages.calls.at(-1)).toBe("select 1");
    expect(t.labels.titleLabel.text).toBe("Settings");
    expect(t.labels.frameRateLabel.text).toBe("Frame rate");
    expect(t.rows.map(row => row.name.text)).toEqual(["Music", "Sound FX"]);
    // 언어 탭의 이름은 그 언어로 쓴 것이라 바뀌지 않고, 같은 글자는 다시 보내지 않는다.
    expect(t.languages.calls.filter(call => !call.startsWith("select"))).toEqual(["0 한국어", "1 English"]);

    t.settings.setLanguage("ko");
    expect(t.labels.titleLabel.text).toBe("설정");
    expect(t.rows.map(row => row.name.text)).toEqual(["배경음", "효과음"]);
  });

  test("dragging a volume is heard at once and saved on release, without the slider echoing back", async () => {
    const t = await setUp();
    const [bgm] = t.rows;
    const bgmRow = data.sounds.get(data.stages.get(3001)!.bgm)!;
    bgm.slider.drag(0.5);
    bgm.slider.drag(0.25);
    expect(t.bridge.setBgmVolume).toHaveBeenLastCalledWith(0.25 * bgmRow.volume);
    expect(t.storage.set).not.toHaveBeenCalled();
    bgm.slider.release();
    expect(t.storage.set).toHaveBeenCalledOnce();
    expect(t.saved().volume.bgm).toBe(0.25);
    // 슬라이더는 소리를 내지 않는다(효과음이 끄는 동안 계속 나지 않게).
    expect(t.context.pressed).not.toHaveBeenCalled();

    // 다른 곳에서 바뀐 값은 알리지 않고 보인다.
    t.settings.setVolume(SoundChannel.Bgm, 0.9);
    expect(bgm.slider.value).toBe(0.9);
    expect(t.storage.set).toHaveBeenCalledTimes(2);
  });

  test("a mute toggle saves at once and silences that channel, keeping its volume", async () => {
    const t = await setUp();
    const [bgm] = t.rows;
    bgm.mute.tap();
    expect(t.context.pressed).toHaveBeenCalledOnce();
    expect(t.saved().muted.bgm).toBe(true);
    expect(t.bridge.setBgmVolume).toHaveBeenLastCalledWith(0);
    expect(bgm.slider.value).toBe(0.7);
    t.settings.setMuted(SoundChannel.Bgm, false);
    expect(bgm.mute.isOn).toBe(false);
  });

  test("a frame rate tab applies it to the display and saves it, and the close button closes", async () => {
    const t = await setUp();
    t.tabClicks[0].fire();
    expect(t.display.setFrameRate).toHaveBeenLastCalledWith(30);
    expect(t.saved().frameRate).toBe(30);
    expect(t.tabCalls.at(-1)).toBe("select 0");
    t.closeClick.fire();
    expect(t.close).toHaveBeenCalledOnce();
    expect(t.context.pressed).toHaveBeenCalledTimes(2);

    t.scope.dispose();
    expect(t.rows.every(row => row.slider.listeners() === 0)).toBe(true);
  });
});

describe("upgrade screen", () => {
  const player = testPlayer(data, 0, { statUpgrades: { 7003: 50 } });

  function setUp(gold: number) {
    const state = createAppState({ flow: "main", player });
    const items = signal<ItemAmounts>({ [data.constants.goldItemId]: Big.from(gold) });
    const sent: [number, number][] = [];
    const cmd = {
      StatUpgrade: async ({ upgradeId, steps }: { upgradeId: number; steps: number }) => void sent.push([upgradeId, steps]),
    } as unknown as Commands;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const vm = createUpgradeViewModel({ state, data, t, battle: { items }, progress: { cmd }, logger, close });
    // 강화 칸: 아이콘, 글자 다섯(이름, 단계, 지금 양, 올린 뒤의 양, 버튼 글자인 비용)과 강화 버튼.
    const cells: { icon: ReturnType<typeof fakeIcon>; texts: { text: string }[]; click: ReturnType<typeof fakeEvent>; button: { interactable: boolean } }[] = [];
    const list = fakeList(() => {
      const click = fakeEvent();
      const cell = {
        icon: fakeIcon(), texts: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }], click,
        button: { interactable: true, onClick: click.event, gameObject: { SetActive() {} } },
      };
      cells.push(cell);
      const [name, level, bonus, next, cost] = cell.texts;
      return {
        icon: [Kind.Object, cell.icon], nameText: [Kind.Object, name], levelText: [Kind.Object, level], bonusText: [Kind.Object, bonus],
        nextText: [Kind.Object, next], costText: [Kind.Object, cost], upgradeButton: [Kind.Object, cell.button],
      };
    });
    const tabClicks = [fakeEvent(), fakeEvent(), fakeEvent()];
    const tabLabels: string[] = [];
    const tabs = {
      SetCount() {}, SetLabel: (index: number, label: string) => void (tabLabels[index] = label), Select() {},
      GetClickEvent: (index: number) => tabClicks[index].event,
    };
    const refs = fakeRefs({ multipliers: [Kind.Object, tabs], items: [Kind.Object, list.target] });
    upgradeView.bind(createScope(), refs as unknown as ViewRoot, vm, fakeContext());
    const rows = () => cells.map(cell => [cell.icon.shown, ...cell.texts.map(text => text.text)]);
    return { items, sent, close, cells, rows, tabClicks, tabLabels };
  }

  test("each row shows its upgrade and its next cost on the button, enabled only when the shown gold covers it", () => {
    const t = setUp(100);
    // 치명 확률(7003)은 최대 단계라 누를 수 없다.
    expect(t.rows()).toEqual([
      ["stat_attack", "공격", "Lv.0", "+0", "→ +5", "100"], ["stat_maxHp", "HP", "Lv.0", "+0", "→ +50", "100"],
      ["stat_critChance", "치명", "Lv.50", "+25%", "", "최대"],
    ]);
    expect(t.cells.map(cell => cell.button.interactable)).toEqual([true, true, false]);
    t.cells[0].click.fire();
    expect(t.sent).toEqual([[7001, 1]]);

    // 보이는 골드가 모자라면 모든 버튼이 꺼진다. 비용은 한 단계의 비용을 보인다.
    t.items.value = { [data.constants.goldItemId]: Big.from(99) };
    expect(t.cells.map(cell => cell.button.interactable)).toEqual([false, false, false]);
    expect(t.rows()[0].at(-1)).toBe("100");
  });

  test("the multiplier tabs buy up to that many steps, as many as the shown gold covers, by the command's own rule", () => {
    const t = setUp(1000);
    expect(t.tabLabels).toEqual(["×1", "×10", "×100"]);
    t.tabClicks[1].fire();
    const batch = statUpgradeBatch(0, 100, Big.from(1000), 10);
    expect(batch.steps).toBeGreaterThan(1);
    expect(t.rows()[0]).toEqual(["stat_attack", "공격", "Lv.0", "+0", `→ +${5 * batch.steps}`, formatBig(batch.cost)]);
    t.cells[0].click.fire();
    expect(t.sent).toEqual([[7001, 10]]);
  });
});

describe("skill screen", () => {
  const player = testPlayer(data, 0);
  const fakeButton = () => {
    const click = fakeEvent();
    return { click, target: { interactable: true, onClick: click.event, gameObject: { active: true, SetActive(active: boolean) { this.active = active; } } } };
  };

  test("slots and skills show their texts, and each row shows only the buttons its state allows", () => {
    const state = createAppState({ flow: "main", player });
    const gold = data.constants.goldItemId;
    const items = signal<ItemAmounts>({ [gold]: Big.from(1_000_000) });
    const sent: string[] = [];
    const record = (name: string) => async (fields: object) => void sent.push(`${name} ${JSON.stringify(fields)}`);
    const cmd = {
      SkillLearn: record("learn"), SkillEquip: record("equip"), SkillUnequip: record("unequip"), SkillLevelUp: record("levelUp"),
    } as unknown as Commands;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const vm = createSkillsViewModel({ state, data, t, battle: { items }, progress: { cmd }, logger, close: vi.fn() });

    // 아이콘 칸과 속성 색. 칸마다 마지막으로 보인 것을 기억한다.
    const tile = () => {
      const shown = { icon: "", tint: -1 };
      return { shown, icon: { Show: (name: string) => void (shown.icon = name) }, tint: { Show: (index: number) => void (shown.tint = index) } };
    };
    const slots: {
      texts: { text: string }[]; tile: ReturnType<typeof tile>; mark: { active: boolean; SetActive(active: boolean): void }; select: ReturnType<typeof fakeButton>;
    }[] = [];
    const slotList = fakeList(() => {
      const slot = {
        texts: [{ text: "" }, { text: "" }, { text: "" }], tile: tile(), mark: { active: false, SetActive(active: boolean) { this.active = active; } },
        select: fakeButton(),
      };
      slots.push(slot);
      const [labelText, nameText, levelText] = slot.texts;
      return {
        labelText: [Kind.Object, labelText], nameText: [Kind.Object, nameText], levelText: [Kind.Object, levelText],
        icon: [Kind.Object, slot.tile.icon], tint: [Kind.Object, slot.tile.tint],
        selectedMark: [Kind.Object, slot.mark], selectButton: [Kind.Object, slot.select.target],
      };
    });
    type Row = {
      texts: { text: string }[]; tile: ReturnType<typeof tile>; buttons: Record<"learn" | "equip" | "unequip" | "levelUp", ReturnType<typeof fakeButton>>;
    };
    const rows: Row[] = [];
    const skillList = fakeList(() => {
      const cell: Row = {
        texts: [{ text: "" }, { text: "" }, { text: "" }, { text: "" }], tile: tile(),
        buttons: { learn: fakeButton(), equip: fakeButton(), unequip: fakeButton(), levelUp: fakeButton() },
      };
      rows.push(cell);
      const [nameText, levelText, stateText, costText] = cell.texts;
      const label = () => [Kind.Object, { text: "" }] as [Kind, unknown];
      return {
        icon: [Kind.Object, cell.tile.icon], tint: [Kind.Object, cell.tile.tint], nameText: [Kind.Object, nameText], levelText: [Kind.Object, levelText], stateText: [Kind.Object, stateText], costText: [Kind.Object, costText],
        learnButton: [Kind.Object, cell.buttons.learn.target], equipButton: [Kind.Object, cell.buttons.equip.target],
        unequipButton: [Kind.Object, cell.buttons.unequip.target], levelUpButton: [Kind.Object, cell.buttons.levelUp.target],
        learnLabel: label(), equipLabel: label(), unequipLabel: label(), levelUpLabel: label(),
      };
    });
    const refs = fakeRefs({ slots: [Kind.Object, slotList.target], skills: [Kind.Object, skillList.target] });
    skillsView.bind(createScope(), refs as unknown as ViewRoot, vm, fakeContext());

    // 새 계정은 속사·화염구·늑대 소환을 세 슬롯에 장착하고, 첫 슬롯을 고른 채 연다.
    expect(slots.map(slot => [...slot.texts.map(text => text.text), slot.mark.active])).toEqual([
      ["슬롯 1", vm.slots.value[0].name, "Lv.1/10", true], ["슬롯 2", vm.slots.value[1].name, "Lv.1/10", false], ["슬롯 3", vm.slots.value[2].name, "Lv.1/10", false],
    ]);
    // 슬롯과 줄의 칸은 스킬 아이콘과 속성 색(SkillElement 선언 순서 + 1)이고, 배우지 않은 스킬은 잠긴 색(0)이다.
    expect(slots.map(slot => slot.tile.shown)).toEqual(vm.slots.value.map(slot => ({ icon: slot.icon, tint: slot.tint })));
    expect(slots[1].tile.shown).toEqual({ icon: "skill_fireball", tint: 3 });
    expect(rows.map(row => row.tile.shown.tint).slice(3)).toEqual([0, 0]);
    const visible = (row: Row) => Object.entries(row.buttons).filter(([, button]) => button.target.gameObject.active).map(([name]) => name);
    // 장착한 스킬은 해제와 레벨업, 배우지 않은 스킬은 배우기만 보인다.
    expect(rows.map(visible)).toEqual([["unequip", "levelUp"], ["unequip", "levelUp"], ["unequip", "levelUp"], ["learn"], ["learn"]]);
    expect(rows[3].texts.map(text => text.text)).toEqual([vm.entries.value[3].name, "", "배우지 않음", vm.entries.value[3].cost]);

    rows[3].buttons.learn.click.fire();
    rows[0].buttons.levelUp.click.fire();
    slots[1].select.click.fire();
    expect(slots.map(slot => slot.mark.active)).toEqual([false, true, false]);
    expect(sent).toEqual([`learn {"skillId":${vm.entries.value[3].skillId}}`, `levelUp {"skillId":${vm.entries.value[0].skillId}}`]);

    // 낼 수 없으면 배우기와 레벨업 버튼이 꺼진다.
    items.value = {};
    expect(rows.map(row => row.buttons.levelUp.target.interactable).slice(0, 3)).toEqual([false, false, false]);
    expect(rows[4].buttons.learn.target.interactable).toBe(false);
  });
});

describe("rebirth screen", () => {
  function setUp(level: number) {
    const player = testPlayer(data, 0, {
      hero: { level }, items: { [data.constants.goldItemId]: Big.from(1234) }, statUpgrades: { 7001: 3, 7002: 2 },
    });
    const state = createAppState({ flow: "main", player });
    const sent: object[] = [];
    const cmd = { Rebirth: async (fields: object) => void sent.push(fields) } as unknown as Commands;
    const confirm = vi.fn(async (_message: string) => true);
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const vm = createRebirthViewModel({
      state, data, t, battle: { heroLevel: signal(level), items: signal(player.items) }, progress: { cmd }, logger, confirm, close,
    });
    const texts = { count: { text: "" }, rate: { text: "" }, gain: { text: "" }, resets: { text: "" } };
    const click = fakeEvent();
    const rebirthButton = { interactable: true, onClick: click.event, gameObject: { SetActive() {} } };
    const refs = fakeRefs({
      countText: [Kind.Object, texts.count], rateText: [Kind.Object, texts.rate], gainText: [Kind.Object, texts.gain],
      resetsText: [Kind.Object, texts.resets], rebirthButton: [Kind.Object, rebirthButton],
    });
    rebirthView.bind(createScope(), refs as unknown as ViewRoot, vm, fakeContext());
    return { texts, rebirthButton, click, sent, confirm };
  }

  test("below the first rebirth level the button is off and the screen says from which level", () => {
    const t = setUp(10);
    expect([t.texts.count.text, t.texts.rate.text, t.texts.gain.text]).toEqual(["환생 0회", "배율 ×1.00", "Lv.30부터 환생할 수 있습니다."]);
    expect(t.rebirthButton.interactable).toBe(false);
  });

  test("at level 40 it shows the points and rates and what starts over, and rebirths after the confirm", async () => {
    const t = setUp(40);
    // (40 − 29)² = 121포인트, 배율 1 + 0.001 × 121.
    expect(t.texts.gain.text).toBe("Lv.40에서 환생하면 +121포인트, 배율 ×1.00 → ×1.12");
    expect(t.texts.resets.text.split("\n")).toEqual(["레벨 40 → 1", "스테이지 훈련의 초원 → 훈련의 초원", "성장 5단계 → 0", "골드 1.2K → 0"]);
    expect(t.rebirthButton.interactable).toBe(true);
    t.click.fire();
    await vi.waitFor(() => expect(t.sent).toEqual([{}]));
    expect(t.confirm).toHaveBeenCalledWith("환생할까요? 레벨, 스테이지, 성장이 처음으로 돌아갑니다.");
  });
});
