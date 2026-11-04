import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { applyCommand, NO_REBIRTH, type BattleSnapshot, type Command, type ItemAmounts, type RebirthState } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { Commands } from "../src/application/progress/progress.js";
import { createAppState } from "../src/application/state/app-state.js";
import { createRebirthViewModel } from "../src/presentation/view-models/rebirth.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t } = texts(data);
const NOW = 1_000_000;
const GOLD = data.constants.goldItemId;

describe("rebirth screen", () => {
  // 마지막 스테이지에서 성장(골드 강화)을 18단계 올린 영웅.
  function setUp(level: number, rebirth: RebirthState = NO_REBIRTH) {
    const player = testPlayer(data, NOW, {
      profile: { loginId: "hero", level }, items: { [GOLD]: Big.from(12_345) },
      statUpgrades: { 7001: 10, 7002: 5, 7003: 3 }, rebirth,
      stage: { currentId: 3006, clearedIds: [3001, 3002, 3003, 3004, 3005] },
    });
    const state = createAppState({ flow: "main", player });
    const snapshot = signal<BattleSnapshot | undefined>(undefined);
    const items = signal<ItemAmounts>(player.items);
    const sent: Command[] = [];
    let offline = false;
    let answer = true;
    const asked: string[] = [];
    // progress처럼 보낸 커맨드를 저장 데이터에 바로 적용한다.
    const cmd = {
      Rebirth: async (fields: object) => {
        const command = { ...fields, type: Opcode.Rebirth } as Command;
        sent.push(command);
        if (offline) throw new Error("offline");
        const result = applyCommand(state.player.value!, command, { now: NOW, data });
        if (result.ok) state.player.value = result.state;
        return result.ok ? undefined : result.error;
      },
    } as unknown as Commands;
    const confirm = async (message: string) => {
      asked.push(message);
      return answer;
    };
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const vm = createRebirthViewModel({ state, data, t, battle: { snapshot, items }, progress: { cmd }, logger, confirm, close });
    return {
      state, snapshot, items, vm, sent, asked, logger, close,
      answer: (yes: boolean) => void (answer = yes), goOffline: () => void (offline = true),
    };
  }

  test("below the rebirth level it says from which level, and the rebirth button does nothing", async () => {
    const t = setUp(29);
    expect(t.vm.ready.value).toBe(false);
    expect([t.vm.count.value, t.vm.rate.value, t.vm.gain.value]).toEqual(["환생 0회", "배율 ×1.00", "Lv.30부터 환생할 수 있습니다."]);
    await t.vm.rebirth();
    expect(t.asked).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  test("shows the points this level gives and the bonus before and after, from the rebirth formulas", () => {
    const t = setUp(47, { count: 1, points: 441 });
    expect(t.vm.ready.value).toBe(true);
    expect(t.vm.count.value).toBe("환생 1회");
    // (47 − 30 + 1)² = 324포인트. 배율은 1 + 0.001 × 포인트이고 소수 둘째 자리까지 버린다: 1.441 → 1.765.
    expect(t.vm.rate.value).toBe("배율 ×1.44");
    expect(t.vm.gain.value).toBe("Lv.47에서 환생하면 +324포인트, 배율 ×1.44 → ×1.76");
  });

  test("lists what starts over: the level, the stage, the gold upgrade steps and the gold shown", () => {
    const t = setUp(47);
    expect(t.vm.resets.value.split("\n")).toEqual([
      "레벨 47 → 1", "스테이지 화염 드래곤의 둥지 → 훈련의 초원", "성장 18단계 → 0", "골드 12.3K → 0",
    ]);
    t.items.value = { [GOLD]: Big.from(20_000) };
    expect(t.vm.resets.value.split("\n").at(-1)).toBe("골드 20K → 0");
  });

  test("the level is the visible battle's, which rises at boundaries before the save does", () => {
    const t = setUp(29);
    t.snapshot.value = { hero: { level: 30 } } as BattleSnapshot;
    expect(t.vm.ready.value).toBe(true);
    expect(t.vm.gain.value).toBe("Lv.30에서 환생하면 +1포인트, 배율 ×1.00 → ×1.00");
    expect(t.vm.resets.value.split("\n")[0]).toBe("레벨 30 → 1");
  });

  test("rebirth asks first, sends only on yes, and then the screen shows the new count and the lock again", async () => {
    const t = setUp(50, { count: 1, points: 441 });
    t.answer(false);
    await t.vm.rebirth();
    expect(t.asked).toEqual(["환생할까요? 레벨, 스테이지, 성장이 처음으로 돌아갑니다."]);
    expect(t.sent).toEqual([]);

    t.answer(true);
    await t.vm.rebirth();
    expect(t.sent).toEqual([{ type: Opcode.Rebirth }]);
    expect(t.state.player.value!.rebirth).toEqual({ count: 2, points: 882 });
    expect([t.vm.count.value, t.vm.rate.value, t.vm.ready.value]).toEqual(["환생 2회", "배율 ×1.88", false]);
  });

  test("a lost request is only logged, and close closes", async () => {
    const t = setUp(40);
    t.goOffline();
    await t.vm.rebirth();
    expect(t.sent).toHaveLength(1);
    expect(t.logger.warn).toHaveBeenCalledOnce();
    t.vm.close();
    expect(t.close).toHaveBeenCalledOnce();
  });

  test("is empty without a save", () => {
    const t = setUp(40);
    t.state.player.value = null;
    expect([t.vm.ready.value, t.vm.resets.value, t.vm.count.value]).toEqual([false, "", "환생 0회"]);
  });
});
