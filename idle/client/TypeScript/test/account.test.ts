import { GameErrorCode } from "@idle/codes";
import type { GameError, PlayerSnapshot } from "@idle/game-core";
import { describe, expect, test, vi } from "vitest";
import { createAccount } from "../src/application/account/account.js";
import type { GameServer, LoginOutcome } from "../src/application/ports.js";
import { createAppState } from "../src/application/state/app-state.js";

const snapshot = { revision: 1, player: { profile: { loginId: "hero" } } } as unknown as PlayerSnapshot;

// 테스트가 정할 때 로그인에 답하는 서버와, Map으로 만든 기기 저장소.
function setUp(saved = new Map<string, string>()) {
  let answer: (outcome: Promise<LoginOutcome>) => void = () => {};
  const server = {
    open: vi.fn(async () => {}),
    login: vi.fn(() => new Promise<LoginOutcome>(resolve => (answer = resolve))),
    close: vi.fn(),
  } as unknown as GameServer & { open: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  const state = createAppState();
  const progress = { reset: vi.fn() };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const runtime = { restart: vi.fn() };
  const account = createAccount({
    server,
    progress,
    login: state.login,
    storage: {
      get: key => saved.get(key) ?? null,
      set: (key, value) => void saved.set(key, value),
      delete: key => void saved.delete(key),
    },
    runtime,
    logger,
  });
  return {
    account, server, progress, logger, runtime, saved,
    login: () => state.login.value,
    answer: (outcome: LoginOutcome | Error) => answer(outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)),
  };
}

describe("account", () => {
  test("logs in: pending while it runs, then the save and the saved ID", async () => {
    const t = setUp();
    const done = t.account.login("hero");
    expect(t.login()).toEqual({ pending: "hero", failed: null });
    await vi.waitFor(() => expect(t.server.login).toHaveBeenCalledWith("hero"));
    t.answer({ ok: true, snapshot });
    await done;
    expect(t.login()).toEqual({ pending: null, failed: null });
    expect(t.progress.reset).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(t.saved.get("lastLoginId")).toBe("hero");
    expect(t.account.lastLoginId()).toBe("hero");
  });

  test("a second login while one is pending does nothing", async () => {
    const t = setUp();
    const first = t.account.login("hero");
    await t.account.login("other");
    await vi.waitFor(() => expect(t.server.login).toHaveBeenCalled());
    t.answer({ ok: true, snapshot });
    await first;
    expect(t.server.login).toHaveBeenCalledOnce();
    expect(t.saved.get("lastLoginId")).toBe("hero");
  });

  test("a refused or failed login records the ID that failed and logs why", async () => {
    const refused: GameError = { code: GameErrorCode.InvalidCommand, message: "refused" };
    for (const outcome of [{ ok: false, error: refused } as const, new Error("The connection closed (1006 refused).")]) {
      const t = setUp();
      const done = t.account.login("hero");
      await vi.waitFor(() => expect(t.server.login).toHaveBeenCalled());
      t.answer(outcome);
      await done;
      expect(t.login()).toEqual({ pending: null, failed: "hero" });
      expect(t.logger.warn).toHaveBeenCalledOnce();
      expect(t.logger.warn.mock.calls[0][0]).toBe("Login failed:");
      expect(t.saved.has("lastLoginId")).toBe(false);
      expect(t.progress.reset).not.toHaveBeenCalled();
    }
  });

  test("an ID the rules refuse is not sent", async () => {
    const t = setUp();
    await t.account.login("No!");
    expect(t.server.open).not.toHaveBeenCalled();
    expect(t.login()).toEqual({ pending: null, failed: "No!" });
  });

  test("logging out forgets the ID, closes the connection and then restarts", () => {
    const t = setUp(new Map([["lastLoginId", "hero"]]));
    expect(t.account.lastLoginId()).toBe("hero");
    t.account.logout();
    expect(t.account.lastLoginId()).toBe("");
    expect(t.server.close).toHaveBeenCalledOnce();
    expect(t.runtime.restart).toHaveBeenCalledOnce();
    expect(t.server.close.mock.invocationCallOrder[0]).toBeLessThan(t.runtime.restart.mock.invocationCallOrder[0]);
  });
});
