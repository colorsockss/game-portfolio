import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { loadGameData } from "@idle/data-schema";
import type { ItemAmounts } from "@idle/game-core";
import { testPlayer } from "@idle/game-core/testing";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { Commands } from "../src/application/progress/progress.js";
import { createAppState } from "../src/application/state/app-state.js";
import { createUpgradeViewModel } from "../src/presentation/view-models/upgrade.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t } = texts(data);
const GOLD = data.constants.goldItemId;

describe("upgrade screen", () => {
  const player = testPlayer(data, 0);

  function setUp(gold = 0) {
    const state = createAppState({ flow: "main", player });
    const items = signal<ItemAmounts>({ [GOLD]: Big.from(gold) });
    const sent: number[] = [];
    let refuse = false;
    const cmd = {
      StatUpgrade: async ({ upgradeId }: { upgradeId: number }) => {
        sent.push(upgradeId);
        if (refuse) throw new Error("offline");
        return undefined;
      },
    } as unknown as Commands;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const vm = createUpgradeViewModel({ state, data, t, battle: { items }, progress: { cmd }, logger, close });
    const shown = () => vm.entries.value.map(({ name, level, bonus, cost, canUpgrade }) => [name, level, bonus, cost, canUpgrade]);
    return { state, items, vm, sent, logger, close, shown, refuse: () => void (refuse = true) };
  }

  test("lists each upgrade in ID order at step 0 with the cost of the first step", () => {
    const t = setUp(100);
    expect(t.vm.entries.value.map(entry => entry.upgradeId)).toEqual([...data.statUpgrades.keys()].sort((a, b) => a - b));
    expect(t.shown()).toEqual([
      ["공격", "Lv.0", "+0", "100", true],
      ["HP", "Lv.0", "+0", "100", true],
      ["치명", "Lv.0", "+0%", "100", true],
    ]);
  });

  test("shows what each step adds and the next cost from the upgradeCost formula, and MAX at the last step", () => {
    const t = setUp(1_000_000);
    t.state.player.value = { ...player, statUpgrades: { 7001: 3, 7002: 10, 7003: 50 } };
    expect(t.shown()).toEqual([
      // 공격 +5, HP +50, 치명 +0.5%p가 단계마다. 다음 비용은 floor(100 × 1.15^단계).
      ["공격", "Lv.3", "+15", "152", true],
      ["HP", "Lv.10", "+500", "404", true],
      ["치명", "Lv.50", "+25%", "최대", false],
    ]);
  });

  test("whether a step can be bought follows the shown gold, which a settle at the press keeps", () => {
    const t = setUp(99);
    expect(t.vm.entries.value.map(entry => entry.canUpgrade)).toEqual([false, false, false]);
    t.items.value = { [GOLD]: Big.from(100) };
    expect(t.vm.entries.value.map(entry => entry.canUpgrade)).toEqual([true, true, true]);
    // 비용은 단계마다 따로다.
    t.state.player.value = { ...player, statUpgrades: { 7002: 1 } };
    expect(t.vm.entries.value.map(entry => entry.canUpgrade)).toEqual([true, false, true]);
  });

  test("pressing an entry sends its upgrade, and a lost request is only logged", async () => {
    const t = setUp(1000);
    t.vm.entries.value[0].upgrade();
    t.vm.entries.value[2].upgrade();
    expect(t.sent).toEqual([7001, 7003]);
    t.refuse();
    t.vm.entries.value[1].upgrade();
    await vi.waitFor(() => expect(t.logger.warn).toHaveBeenCalledOnce());
    expect(t.sent.at(-1)).toBe(7002);
  });

  test("is empty without a save, and close closes", () => {
    const t = setUp(1000);
    t.state.player.value = null;
    expect(t.vm.entries.value).toEqual([]);
    t.vm.close();
    expect(t.close).toHaveBeenCalledOnce();
  });
});
