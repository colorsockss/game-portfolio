import { describe, expect, test, vi } from "vitest";
import { createScope } from "../src/application/scope.js";
import type { AssetHandle, UiBridge, UiLayer, ViewRoot } from "../src/presentation/ui/ports.js";
import { createResources } from "../src/presentation/ui/resources.js";
import { createUiStack, popup, type View } from "../src/presentation/ui/ui-stack.js";

const root = {} as ViewRoot;

// 로드를 테스트가 끝내 주고, 뷰에 일어나는 일을 기록하는 엔진.
function setUp() {
  const log: string[] = [];
  const loads = new Map<string, { resolve(asset: AssetHandle): void; reject(error: Error): void }>();
  // 이 프리팹들은 닫는 연출이 있고, 테스트가 연출을 끝낸다.
  const motions = new Map<string, () => void>();
  let backHandler: (() => void) | undefined;
  const ui: UiBridge = {
    create(prefab, layer: UiLayer) {
      const name = (prefab as AssetHandle & { key: string }).key;
      log.push(`create ${name} on ${layer}`);
      return {
        root,
        dismiss: () => (motions.has(name) ? new Promise(resolve => {
          log.push(`dismiss ${name}`);
          motions.set(name, resolve);
        }) : undefined),
        destroy: () => log.push(`destroy ${name}`),
      };
    },
    setBlocking: blocking => log.push(blocking ? "block" : "unblock"),
    onBack(handler) {
      backHandler = handler;
      log.push("listen back");
      return () => {
        backHandler = undefined;
        log.push("stop back");
      };
    },
  };
  const resources = createResources({
    load: key => new Promise((resolve, reject) => loads.set(key, { resolve, reject })),
  });
  const context = { pressed: () => log.push("pressed"), t: (key: string) => key };
  const stack = createUiStack({ ui, resources, context });
  const finish = (key: string) => loads.get(key)!.resolve({ key, release: () => log.push(`release ${key}`) } as AssetHandle);
  return {
    log, stack, context, finish, motions, fail: (key: string) => loads.get(key)!.reject(new Error(`no ${key}`)), back: () => backHandler?.(),
  };
}

describe("resources", () => {
  test("an asset lives as long as the scope it was loaded for", async () => {
    const released: string[] = [];
    const resources = createResources({ load: async key => ({ release: () => released.push(key) }) });
    const scope = createScope();
    expect(await resources.load("a", scope)).toBeDefined();
    expect(await resources.load("b", scope)).toBeDefined();
    scope.dispose();
    expect(released).toEqual(["b", "a"]);

    // 스코프가 닫힌 뒤에 로드됐다. 즉시 해제하고, 호출자는 아무것도 받지 못한다.
    expect(await resources.load("c", scope)).toBeUndefined();
    expect(released).toEqual(["b", "a", "c"]);
  });
});

describe("UI stack", () => {
  test("a view loads with taps blocked, opens on its layer, and closes with its owner", async () => {
    const t = setUp();
    const owner = createScope();
    const opening = t.stack.open("Login", owner);
    expect(t.log).toEqual(["block"]);
    t.finish("Login");
    const view = await opening;
    expect(view?.root).toBe(root);
    expect(t.log).toEqual(["block", "create Login on screen", "unblock"]);

    owner.dispose();
    // 프리팹을 해제하기 전에 먼저 파괴한다.
    expect(t.log.slice(3)).toEqual(["destroy Login", "release Login"]);
    expect(view?.scope.disposed).toBe(true);
  });

  test("shown lists the open views in the order they opened, each with its prefab and layer", async () => {
    const t = setUp();
    const main = t.stack.open("Main", createScope());
    t.finish("Main");
    await main;
    const popupOwner = createScope();
    const popup = t.stack.open("Popup", popupOwner, { layer: "popup" });
    // 불러오는 중인 뷰는 아직 화면에 없다.
    expect(t.stack.shown.value).toEqual([{ prefab: "Main", layer: "screen", root, back: undefined }]);
    t.finish("Popup");
    await popup;
    expect(t.stack.shown.value.map(view => [view.prefab, view.layer])).toEqual([["Main", "screen"], ["Popup", "popup"]]);
    popupOwner.dispose();
    expect(t.stack.shown.value.map(view => view.prefab)).toEqual(["Main"]);
  });

  test("a view whose owner closed while it loaded never appears", async () => {
    const t = setUp();
    const owner = createScope();
    const opening = t.stack.open("Login", owner);
    owner.dispose();
    t.finish("Login");
    expect(await opening).toBeUndefined();
    expect(t.log).toEqual(["block", "release Login", "unblock"]);

    // 로드가 끝난 뒤, 스택이 이어서 만들기 전에 닫혔다(자동 로그인이 로그인 화면을 바로 닫을 때). 이미 해제한
    // 프리팹으로 만들지 않는다.
    const late = createScope();
    const lateOpening = t.stack.open("Login", late);
    t.finish("Login");
    await null;
    late.dispose();
    expect(await lateOpening).toBeUndefined();
    expect(t.log.slice(3)).toEqual(["block", "release Login", "unblock"]);
  });

  test("a view with a close motion is destroyed and released only after the motion, with taps blocked meanwhile", async () => {
    const t = setUp();
    t.motions.set("Popup", () => {});
    const owner = createScope();
    const opening = t.stack.open("Popup", owner, { layer: "popup" });
    t.finish("Popup");
    const view = await opening;
    owner.dispose();
    // 스택에서는 바로 빠진다(튜토리얼이 닫히는 팝업을 비추지 않는다).
    expect(t.stack.shown.value).toEqual([]);
    expect(view?.scope.disposed).toBe(true);
    expect(t.log).toEqual(["block", "create Popup on popup", "listen back", "unblock", "stop back", "dismiss Popup", "block"]);

    t.motions.get("Popup")!();
    await vi.waitFor(() => expect(t.log.slice(7)).toEqual(["destroy Popup", "release Popup", "unblock"]));
  });

  test("a prefab that cannot load rejects and leaves taps unblocked", async () => {
    const t = setUp();
    const opening = t.stack.open("Missing", createScope());
    t.fail("Missing");
    await expect(opening).rejects.toThrow("no Missing");
    expect(t.log).toEqual(["block", "unblock"]);
  });

  test("show binds the view in its scope with the stack's context, and a view that fails to bind closes", async () => {
    const t = setUp();
    const bound: string[] = [];
    const seen: ViewRoot[] = [];
    const contexts: unknown[] = [];
    const good: View<string> = {
      prefab: "Main",
      layer: "screen",
      bind: (scope, viewRoot, vm, context) => (seen.push(viewRoot), contexts.push(context), bound.push(vm), scope.add(() => bound.push("unbound"))),
    };
    const owner = createScope();
    const shown = t.stack.show(good, "vm", owner);
    t.finish("Main");
    await shown;
    expect(bound).toEqual(["vm"]);
    // bind가 받는 핸들은 그 인스턴스 자신의 것이다.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(root);
    // 뷰마다 같은 컨텍스트(버튼 소리)를 받는다.
    expect(contexts).toEqual([t.context]);
    owner.dispose();
    expect(bound).toEqual(["vm", "unbound"]);

    const bad: View<string> = { prefab: "Drifted", layer: "screen", bind: () => { throw new Error("ViewRefs: title is missing."); } };
    const failing = t.stack.show(bad, "vm", createScope());
    t.finish("Drifted");
    await expect(failing).rejects.toThrow("title is missing");
    expect(t.log.slice(-2)).toEqual(["destroy Drifted", "release Drifted"]);
  });

  test("back goes to the top popup, which closes by default, then to the top screen", async () => {
    const t = setUp();
    const owner = createScope();
    const backs: string[] = [];
    const open = async (key: string, layer: UiLayer, back?: () => void) => {
      const opening = t.stack.open(key, owner, { layer, back });
      t.finish(key);
      return opening;
    };
    // 아직 뒤로 가기 키를 받는 곳이 없으니 키를 듣는 것도 없다.
    await open("Main", "screen");
    expect(t.log).not.toContain("listen back");

    await open("Shop", "screen", () => backs.push("shop"));
    await open("Confirm", "popup");
    await open("Toast", "overlay", () => backs.push("toast"));
    expect(t.log.filter(line => line === "listen back")).toHaveLength(1);

    t.back();
    expect(t.log).toContain("destroy Confirm");
    t.back();
    expect(backs).toEqual(["shop"]);

    // 탭이 막혀 있는 동안에는 뒤로 가기도 기다린다.
    const unblock = t.stack.block();
    t.back();
    expect(backs).toEqual(["shop"]);
    unblock();
    unblock();
    t.back();
    expect(backs).toEqual(["shop", "shop"]);

    // 뒤로 가기만 막으면(튜토리얼) 탭은 그대로 두고 키만 아무것도 하지 않는다.
    const blocked = t.log.filter(line => line === "block").length;
    const release = t.stack.blockBack();
    t.back();
    expect(backs).toEqual(["shop", "shop"]);
    expect(t.log.filter(line => line === "block")).toHaveLength(blocked);
    release();
    release();
    t.back();
    expect(backs).toEqual(["shop", "shop", "shop"]);

    owner.dispose();
    expect(t.log).toContain("stop back");
  });

  test("blocks add up", () => {
    const t = setUp();
    const first = t.stack.block();
    const second = t.stack.block();
    first();
    expect(t.log).toEqual(["block"]);
    second();
    expect(t.log).toEqual(["block", "unblock"]);
  });
});

describe("popup", () => {
  test("resolves with what the view model hands to done, undefined when closed or not opened, and closes on done", async () => {
    const t = setUp();
    const view: View<{ done: (result?: number) => void }> = { prefab: "Pick", layer: "popup", bind() {} };
    const owner = createScope();
    let vm: { done: (result?: number) => void } | undefined;
    const picked = popup<{ done: (result?: number) => void }, number>(t.stack.show, view, owner, done => (vm = { done }));
    t.finish("Pick");
    await vi.waitFor(() => expect(t.log).toContain("create Pick on popup"));
    vm!.done(7);
    expect(await picked).toBe(7);
    expect(t.log).toContain("destroy Pick");

    // 닫기 버튼(done()), 뒤로 가기, owner가 닫히는 것은 결과가 없다.
    const backed = popup<{ done: (result?: number) => void }, number>(t.stack.show, view, owner, done => ({ done }));
    t.finish("Pick");
    await vi.waitFor(() => expect(t.log.filter(line => line === "create Pick on popup")).toHaveLength(2));
    t.back();
    expect(await backed).toBeUndefined();

    owner.dispose();
    const dropped = popup<{ done: (result?: number) => void }, number>(t.stack.show, view, owner, done => ({ done }));
    t.finish("Pick");
    expect(await dropped).toBeUndefined();
  });

  test("a popup whose view model is done before it opens closes as soon as it opens", async () => {
    const t = setUp();
    const view: View<unknown> = { prefab: "Early", layer: "popup", bind() {} };
    const early = popup<unknown, number>(t.stack.show, view, createScope(), done => done(1));
    t.finish("Early");
    expect(await early).toBe(1);
    await vi.waitFor(() => expect(t.log).toContain("destroy Early"));
  });
});
