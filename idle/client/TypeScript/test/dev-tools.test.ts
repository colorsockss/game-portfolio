import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { GameErrorCode, Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, type GameError } from "@idle/game-core";
import { describe, expect, test, vi } from "vitest";
import { createLog } from "../src/adapters/log.js";
import type { Commands } from "../src/application/progress/progress.js";
import { createScope } from "../src/application/scope.js";
import { createAppState } from "../src/application/state/app-state.js";
import type { ViewRoot } from "../src/presentation/ui/ports.js";
import type { OpenView, UiStack, View } from "../src/presentation/ui/ui-stack.js";
import { createDebugViewModel } from "../src/presentation/view-models/debug.js";
import type { ConfirmViewModel } from "../src/presentation/widgets/confirm.js";
import { createCrashReporter } from "../src/presentation/widgets/crash.js";
import { catchUncaught, guarded, type Timers } from "../src/unity/uncaught.js";
import { texts } from "./support/text.js";

const { t, language } = texts(await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url))));
const CHEAT_USAGE = "grant <아이템> [수량] · level <레벨> · unlock <스테이지> · time <분>";

describe("log", () => {
  function lines(level: "debug" | "info" | "warn" | "error") {
    const out: unknown[][] = [];
    const sink = { log: (...args: unknown[]) => out.push(["log", ...args]), warn: (...args: unknown[]) => out.push(["warn", ...args]), error: (...args: unknown[]) => out.push(["error", ...args]) };
    const battle = createLog(sink, level)("battle");
    battle.debug("d");
    battle.info("i", 1);
    battle.warn("w");
    battle.error("e");
    return out;
  }

  test("tags the channel and drops lines below the level", () => {
    expect(lines("debug")).toEqual([["log", "[battle]", "d"], ["log", "[battle]", "i", 1], ["warn", "[battle]", "w"], ["error", "[battle]", "e"]]);
    // 릴리즈 빌드의 레벨.
    expect(lines("info")).toEqual([["log", "[battle]", "i", 1], ["warn", "[battle]", "w"], ["error", "[battle]", "e"]]);
    expect(lines("warn")).toEqual([["warn", "[battle]", "w"], ["error", "[battle]", "e"]]);
  });
});

describe("uncaught errors", () => {
  function setUp() {
    const due: (() => void)[] = [];
    const timers: Timers = {
      setTimeout: callback => due.push(callback),
      setInterval: callback => due.push(callback),
    };
    let rejected: ((reason: unknown) => void) | undefined;
    const caught: unknown[] = [];
    catchUncaught({ on: (_event, listener) => void (rejected = listener) }, timers, error => caught.push(error));
    return { timers, due, caught, reject: (reason: unknown) => rejected!(reason) };
  }

  test("timer callbacks, listeners and promise rejections report instead of escaping to C#", () => {
    const t = setUp();
    const boom = new Error("boom");
    t.timers.setTimeout(() => {
      throw boom;
    });
    t.timers.setInterval(() => {});
    expect(() => t.due.forEach(run => run())).not.toThrow();
    expect(t.caught).toEqual([boom]);

    const click = guarded(() => {
      throw new Error("click");
    });
    expect(() => click()).not.toThrow();
    t.reject("no handler");
    expect(t.caught).toEqual([boom, new Error("click"), "no handler"]);
  });

  test("a handler that throws does not escape either", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    catchUncaught({ on() {} }, { setTimeout: () => 0, setInterval: () => 0 }, () => {
      throw new Error("handler");
    });
    expect(() => guarded(() => {
      throw new Error("first");
    })()).not.toThrow();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});

describe("restart popup", () => {
  function setUp() {
    const opened: { vm: ConfirmViewModel; open: OpenView }[] = [];
    const show: UiStack["show"] = async (_view, vm, owner) => {
      const scope = createScope();
      owner.add(() => scope.dispose());
      const open: OpenView = { root: {} as ViewRoot, scope, close: () => scope.dispose() };
      opened.push({ vm: vm as ConfirmViewModel, open });
      return open;
    };
    const runtime = { restart: vi.fn() };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const view: View<ConfirmViewModel> = { prefab: "UI/ConfirmPopup", layer: "popup", bind() {} };
    const crash = createCrashReporter({ show, view, scope: createScope(), runtime, t, logger });
    return { crash, opened, runtime, logger };
  }

  test("logs every error, asks once at a time and restarts on OK", async () => {
    const t = setUp();
    t.crash(new Error("first"));
    t.crash(new Error("second"));
    expect(t.logger.error).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(t.opened).toHaveLength(1));
    expect(t.opened[0].vm.message.value).toBe("문제가 생겼습니다. 다시 시작할까요?");

    t.opened[0].vm.ok();
    await vi.waitFor(() => expect(t.runtime.restart).toHaveBeenCalledOnce());
  });

  test("goes on after cancel and asks again on the next error", async () => {
    const t = setUp();
    t.crash(new Error("first"));
    await vi.waitFor(() => expect(t.opened).toHaveLength(1));
    t.opened[0].vm.cancel();
    await vi.waitFor(() => expect(t.opened[0].open.scope.disposed).toBe(true));
    // 답은 비동기로 돌아온다.
    await new Promise(resolve => setTimeout(resolve));
    t.crash(new Error("second"));
    await vi.waitFor(() => expect(t.opened).toHaveLength(2));
    expect(t.runtime.restart).not.toHaveBeenCalled();
  });
});

describe("debug overlay", () => {
  function setUp(answer: (op: Opcode, fields: object) => Promise<GameError | undefined> = async () => undefined) {
    const state = createAppState({
      flow: "main",
      player: {
        profile: { loginId: "hero" },
        hero: { level: 3 },
        items: { 1: Big.from(1500) },
        equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH,
        skills: { equipped: {}, levels: {} },
        stage: { currentId: 3001, clearedIds: [] },
        battle: {
          mode: 0, at: 1, rng: 1, hero: { hp: Big.from(100), cooldowns: [], effects: [], x: 0 }, summons: [], waves: 0, autoBoss: true, nextId: 1,
          enemies: [], projectiles: [], wave: null, bossTicksLeft: null, reviveTicksLeft: null,
        },
        tutorial: { stepId: null },
      },
    });
    const sent: [Opcode, object][] = [];
    const send = (op: Opcode) => (fields: object) => {
      sent.push([op, fields]);
      return answer(op, fields);
    };
    const cmd = {
      CheatItemGrant: send(Opcode.CheatItemGrant),
      CheatLevelSet: send(Opcode.CheatLevelSet),
      CheatStageUnlock: send(Opcode.CheatStageUnlock),
      CheatTimeShift: send(Opcode.CheatTimeShift),
    } as unknown as Commands;
    // 2026-10-21 05:20:31.5 UTC.
    const vm = createDebugViewModel({ state, clock: { now: () => Date.UTC(2026, 9, 21, 5, 20, 31, 500) }, progress: { cmd }, t });
    return { vm, sent };
  }

  test("refresh shows the frame rate, the server time and the app state with big numbers formatted", () => {
    const { vm } = setUp();
    vm.refresh(59.6);
    expect(vm.fps.value).toBe("60 FPS");
    expect(vm.serverTime.value).toBe("2026-10-21 05:20:31 UTC");
    const dump = JSON.parse(vm.dump.value);
    expect(dump).toMatchObject({ flow: "main", player: { hero: { level: 3 }, items: { 1: "1.5K" }, battle: { hero: { hp: "100" } } } });
  });

  test("toggles the panel", () => {
    const { vm } = setUp();
    expect(vm.open.value).toBe(false);
    vm.toggle();
    expect(vm.open.value).toBe(true);
  });

  test("runs a cheat line as its command and shows how it went", async () => {
    const t = setUp(async op => (op === Opcode.CheatLevelSet ? { code: GameErrorCode.CheatDisabled, message: "no" } : undefined));
    for (const line of ["grant 1 1000", "grant 101", " unlock  3006 ", "time 90", "level 10"]) {
      t.vm.cheat.value = line;
      await t.vm.runCheat();
    }
    expect(t.sent).toEqual([
      [Opcode.CheatItemGrant, { itemId: 1, amount: 1000 }],
      [Opcode.CheatItemGrant, { itemId: 101, amount: 1 }],
      [Opcode.CheatStageUnlock, { stageId: 3006 }],
      [Opcode.CheatTimeShift, { duration: 90 * 60_000 }],
      [Opcode.CheatLevelSet, { level: 10 }],
    ]);
    expect(t.vm.cheatResult.value).toBe("거절 CheatDisabled: level 10");

    t.vm.cheat.value = "time 1";
    await t.vm.runCheat();
    expect(t.vm.cheatResult.value).toBe("적용: time 1");
  });

  test("does not send an unknown cheat and says when the server was not reached", async () => {
    const t = setUp(() => Promise.reject(new Error("offline")));
    t.vm.cheat.value = "constructor 1";
    await t.vm.runCheat();
    expect(t.sent).toEqual([]);
    expect(t.vm.cheatResult.value).toBe(`모르는 치트: constructor 1. ${CHEAT_USAGE}`);

    t.vm.cheat.value = "grant 1 5";
    await t.vm.runCheat();
    expect(t.vm.cheatResult.value).toBe("서버에 닿지 않음: grant 1 5 (Error: offline)");
  });

  test("shows how to use cheats until one is sent, in the language of the settings", () => {
    const { vm } = setUp();
    expect(vm.cheatResult.value).toBe(CHEAT_USAGE);
    language.value = "en";
    expect(vm.cheatResult.value).toBe("grant <item> [amount] · level <level> · unlock <stage> · time <minutes>");
    language.value = "ko";
  });
});
