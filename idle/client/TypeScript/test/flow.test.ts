import { describe, expect, test, vi } from "vitest";
import { createAppFlow } from "../src/application/app/app-flow.js";
import { createFlow, type FlowState } from "../src/application/app/flow.js";
import type { Scope } from "../src/application/scope.js";
import { createAppState, type AppFlowState, type AppStateValues } from "../src/application/state/app-state.js";

describe("createFlow", () => {
  type S = "a" | "b" | "c";

  // 진입과 해제를 기록하는 상태들. `a`와 `b`는 나열된 어느 상태로든 갈 수 있다.
  function setUp(enterA: (scope: Scope, go: (next: S) => void) => void = () => {}) {
    const log: string[] = [];
    const gos: Partial<Record<S, (next: S) => void>> = {};
    const state = (name: S, next: S[], extra: (scope: Scope, go: (next: S) => void) => void = () => {}): FlowState<S> => ({
      next,
      enter(scope, go) {
        log.push(`enter ${name}`);
        gos[name] = go;
        scope.add(() => log.push(`release ${name}`));
        extra(scope, go);
      },
    });
    const flow = createFlow<S>({
      initial: "a",
      states: { a: state("a", ["b"], enterA), b: state("b", ["a", "c"]), c: state("c", []) },
      entered: name => log.push(`entered ${name}`),
    });
    return { flow, log, gos };
  }

  test("enters the first state on start and releases each state before entering the next", () => {
    const t = setUp();
    t.flow.start();
    expect(t.flow.current).toBe("a");
    t.gos.a!("b");
    t.gos.b!("c");
    expect(t.flow.current).toBe("c");
    expect(t.log).toEqual(["entered a", "enter a", "release a", "entered b", "enter b", "release b", "entered c", "enter c"]);
    expect(() => t.flow.start()).toThrow(/already started/);
  });

  test("a move asked for while a state is entered waits until it is set up", () => {
    const t = setUp((scope, go) => {
      go("b");
      scope.add(() => t.log.push("release a's later setup"));
    });
    t.flow.start();
    expect(t.flow.current).toBe("b");
    expect(t.log).toEqual(["entered a", "enter a", "release a's later setup", "release a", "entered b", "enter b"]);
  });

  test("refuses moves the state does not allow", () => {
    const t = setUp();
    t.flow.start();
    expect(() => t.gos.a!("c")).toThrow("The flow cannot go from a to c.");
    expect(t.flow.current).toBe("a");
  });

  test("a state's go does nothing once it has been left", () => {
    const t = setUp();
    t.flow.start();
    const firstA = t.gos.a!;
    firstA("b");
    t.gos.b!("a");
    // a에 새로 들어가면 그 진입만의 go가 생기고, 처음 진입의 go는 이미 쓴 것이다.
    firstA("b");
    expect(t.flow.current).toBe("a");
  });

  test("only the first move a state asks for counts", () => {
    const t = setUp((_scope, go) => {
      go("b");
      go("b");
    });
    t.flow.start();
    expect(t.flow.current).toBe("b");
    expect(t.log.filter(line => line === "enter b")).toHaveLength(1);
  });
});

describe("the app flow", () => {
  const save = { profile: { loginId: "hero" } } as unknown as NonNullable<AppStateValues["player"]>;

  /** `lastLoginId`: 기기가 마지막 로그인 때 저장해 둔 ID. `cover`: 상태를 바꾸기 전에 화면을 가리는 것. */
  function setUp(lastLoginId = "", cover?: (then: () => void) => void) {
    const state = createAppState();
    const requestUpdate = vi.fn();
    const shown: string[] = [];
    const screen = (state: AppFlowState) => (scope: Scope) => {
      shown.push(`open ${state}`);
      scope.add(() => shown.push(`close ${state}`));
    };
    // 상태를 바꾸지 않는 로그인. 상태는 테스트가 직접 옮긴다.
    const account = { lastLoginId: () => lastLoginId, login: vi.fn(async (_loginId: string) => {}) };
    const progress = { clear: vi.fn(() => void (state.player.value = null)) };
    const flow = createAppFlow({
      state,
      flow: state.flow,
      account,
      progress,
      requestUpdate,
      screens: { boot: screen("boot"), update: screen("update"), login: screen("login"), main: screen("main") },
      cover,
    });
    flow.start();
    const end = (ended: AppStateValues["network"]["ended"]) => void (state.network.value = { status: "ended", ended, waiting: false });
    const logins = () => account.login.mock.calls.map(([loginId]) => loginId);
    return { state, shown, logins, progress, requestUpdate, flow, end, at: () => state.flow.value };
  }

  test("starts through boot to login, closing each state's screens", () => {
    const t = setUp();
    expect(t.at()).toBe("login");
    expect(t.shown).toEqual(["open boot", "close boot", "open login"]);
    expect(t.requestUpdate).not.toHaveBeenCalled();
  });

  test("logs in by itself when it starts with a saved ID, and only then", () => {
    expect(setUp().logins()).toEqual([]);
    // 규칙은 서버의 것이다. 서버가 거절할 저장된 ID는 보내지 않는다.
    expect(setUp("No!").logins()).toEqual([]);

    const t = setUp("hero");
    expect(t.logins()).toEqual(["hero"]);
    // 계정이 다른 곳에서 로그인해서 로그인 화면으로 돌아왔다. 곧바로 다시 로그인하면
    // 그쪽에서 계정을 도로 빼앗게 된다.
    t.state.player.value = save;
    t.end("replaced");
    expect(t.at()).toBe("login");
    expect(t.logins()).toEqual(["hero"]);
  });

  test("logs in again by itself when the session expired, so an app left running does not stop at the login screen", () => {
    const t = setUp("hero");
    t.state.player.value = save;
    t.end("expired");
    expect(t.at()).toBe("login");
    expect(t.logins()).toEqual(["hero", "hero"]);

    // 서버가 메시지를 거절해 끝난 연결은 다시 로그인해도 같으므로 플레이어를 기다린다.
    const broken = setUp("hero");
    broken.state.player.value = save;
    broken.end("error");
    expect(broken.logins()).toEqual(["hero"]);
  });

  test("goes to main when a save arrives", () => {
    const t = setUp();
    t.state.player.value = save;
    expect(t.at()).toBe("main");
    expect(t.shown.slice(-2)).toEqual(["close login", "open main"]);
  });

  test("a login that writes the save and then the login slice enters main once", () => {
    const t = setUp();
    t.state.player.value = save;
    t.state.login.value = { pending: null, failed: null };
    expect(t.at()).toBe("main");
    expect(t.shown.filter(line => line.endsWith(" main"))).toEqual(["open main"]);
  });

  test.each(["replaced", "expired", "error"] as const)("goes back to login without the old save when the session ends (%s)", ended => {
    const t = setUp();
    t.state.player.value = save;
    t.end(ended);
    expect(t.at()).toBe("login");
    // 로그인에 들어가면 저장 데이터를 지운다. 처음 들어갈 때와 지금, 두 번이다.
    expect(t.progress.clear).toHaveBeenCalledTimes(2);
    expect(t.state.player.value).toBeNull();
    expect(t.state.network.value.ended).toBe(ended);
  });

  test("goes to update and asks the boot for a patch when the server needs a newer client, from main or from login", () => {
    const t = setUp();
    t.state.player.value = save;
    t.end("update");
    expect(t.at()).toBe("update");
    expect(t.shown.slice(-2)).toEqual(["close main", "open update"]);
    expect(t.requestUpdate).toHaveBeenCalledOnce();
    t.state.player.value = null;
    expect(t.at()).toBe("update");

    const fresh = setUp();
    fresh.end("update");
    expect(fresh.at()).toBe("update");
    expect(fresh.requestUpdate).toHaveBeenCalledOnce();
  });

  test("covers the screen before it leaves a state, and the state lasts until then", () => {
    const covers: (() => void)[] = [];
    const t = setUp("", then => void covers.push(then));
    // 부팅도 가린 뒤에 떠난다.
    expect(t.at()).toBe("boot");
    covers.shift()!();
    expect(t.at()).toBe("login");
    t.state.player.value = save;
    expect(t.at()).toBe("login");
    expect(t.shown.at(-1)).toBe("open login");
    // 가리는 동안 같은 상태가 다시 부른 이동은 버려진다: 로그인은 메인으로 가려고 가리는 중에 업데이트로도 가려 한다.
    t.end("update");
    covers.shift()!();
    expect(t.at()).toBe("main");
    covers.shift()!();
    expect(t.at()).toBe("main");
    // 메인은 들어가자마자 업데이트로 가려고 다시 가린다.
    covers.shift()!();
    expect(t.at()).toBe("update");
  });
});
