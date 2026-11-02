import { readFileSync } from "node:fs";
import { Big } from "@idle/big-number";
import { Opcode } from "@idle/codes";
import { loadGameData } from "@idle/data-schema";
import { applyCommand, freshBattle, NO_EQUIPMENT, NO_REBIRTH, NO_STAT_UPGRADES, type Command, type ItemAmounts, type PlayerState, type SkillsState } from "@idle/game-core";
import { signal } from "@preact/signals-core";
import { describe, expect, test, vi } from "vitest";
import type { Commands } from "../src/application/progress/progress.js";
import { createAppState } from "../src/application/state/app-state.js";
import { createSkillsViewModel } from "../src/presentation/view-models/skills.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
const { t, language } = texts(data);
const NOW = 1_000_000;

describe("skills screen", () => {
  // 새 계정처럼 연속 사격, 화염구, 늑대 소환을 배워 장착하고 연속 사격만 3레벨인 영웅. 전투의 포효와 치유의 빛은 배우지 않았다.
  const DEFAULT: SkillsState = { equipped: { 0: 1004, 1: 1005, 2: 1011 }, levels: { 1004: 3, 1005: 1, 1011: 1 } };
  function setUp(skills: SkillsState = DEFAULT, gold = 1000) {
    const base = { profile: { loginId: "hero", level: 1 }, items: {}, equipment: NO_EQUIPMENT, statUpgrades: NO_STAT_UPGRADES, rebirth: NO_REBIRTH, skills, stage: { currentId: 3001, clearedIds: [] } };
    const player: PlayerState = { ...base, items: { 1: Big.from(gold) }, battle: freshBattle(base, data, NOW), tutorial: { stepId: null } };
    const state = createAppState({ flow: "main", player });
    const items = signal<ItemAmounts>(player.items);
    const sent: Command[] = [];
    let offline = false;
    // progress처럼 보낸 커맨드를 저장 데이터에 바로 적용한다.
    const send = (type: Command["type"]) => async (fields: object) => {
      const command = { ...fields, type } as Command;
      sent.push(command);
      if (offline) throw new Error("offline");
      const result = applyCommand(state.player.value!, command, { now: NOW, data });
      if (result.ok) state.player.value = result.state;
      return result.ok ? undefined : result.error;
    };
    const cmd = {
      SkillLearn: send(Opcode.SkillLearn), SkillEquip: send(Opcode.SkillEquip),
      SkillUnequip: send(Opcode.SkillUnequip), SkillLevelUp: send(Opcode.SkillLevelUp),
    } as unknown as Commands;
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const close = vi.fn();
    const vm = createSkillsViewModel({ state, data, t, battle: { items }, progress: { cmd }, logger, close });
    return { state, items, vm, sent, logger, close, goOffline: () => void (offline = true) };
  }

  type Vm = ReturnType<typeof setUp>["vm"];
  const slotsOf = (vm: Vm) => vm.slots.value.map(({ label, name, level, selected }) => [label, name, level, selected]);
  const namesOf = (vm: Vm) => vm.slots.value.map(slot => slot.name);
  const entry = (vm: Vm, skillId: number) => vm.entries.value.find(row => row.skillId === skillId)!;

  test("slots show the equipped skills in slot order with their levels, and the first slot is chosen", () => {
    const { vm } = setUp();
    expect(slotsOf(vm)).toEqual([
      ["슬롯 1", "연속 사격", "Lv.3/10", true],
      ["슬롯 2", "화염구", "Lv.1/10", false],
      ["슬롯 3", "늑대 소환", "Lv.1/10", false],
    ]);
    // 빈 슬롯은 이름 대신 "비어 있음"이다.
    const one = setUp({ equipped: { 0: 1004 }, levels: { 1004: 1 } }).vm;
    expect(slotsOf(one).slice(1)).toEqual([["슬롯 2", "비어 있음", "", false], ["슬롯 3", "비어 있음", "", false]]);
    expect(one.slots.value.map(slot => slot.empty)).toEqual([false, true, true]);
  });

  test("entries are every skill the hero can equip with its level, what the next step costs and whether it is learned or equipped", () => {
    const { vm } = setUp();
    expect(vm.entries.value.map(({ name, level, cost, state, learned }) => [name, level, cost, state, learned])).toEqual([
      ["연속 사격", "Lv.3/10", "골드 2.5K", "장착 중", true],
      ["화염구", "Lv.1/10", "골드 1K", "장착 중", true],
      ["늑대 소환", "Lv.1/10", "골드 1K", "장착 중", true],
      ["전투의 포효", "", "골드 5K", "배우지 않음", false],
      ["치유의 빛", "", "골드 4K", "배우지 않음", false],
    ]);
    language.value = "en";
    expect(entry(vm, 1004).cost).toBe("2.5K Gold");
    language.value = "ko";
  });

  test("learning is possible while the settled holdings cover the cost, and then the skill can be equipped and leveled", () => {
    const poor = setUp();
    expect(entry(poor.vm, 1010).affordable.value).toBe(false);
    entry(poor.vm, 1010).learn();
    entry(poor.vm, 1010).equip();
    entry(poor.vm, 1010).levelUp();
    expect(poor.sent).toEqual([]);

    const { vm, sent } = setUp(DEFAULT, 6000);
    expect(entry(vm, 1010).affordable.value).toBe(true);
    entry(vm, 1010).learn();
    expect(sent).toEqual([{ type: Opcode.SkillLearn, skillId: 1010 }]);
    expect(entry(vm, 1010)).toMatchObject({ learned: true, level: "Lv.1/10", cost: "골드 1K", state: "" });
    // 배운 스킬은 다시 배우지 않는다.
    entry(vm, 1010).learn();
    expect(sent).toHaveLength(1);
    vm.slots.value[2].select();
    entry(vm, 1010).equip();
    expect(sent.at(-1)).toEqual({ type: Opcode.SkillEquip, slot: 2, skillId: 1010 });
    expect(namesOf(vm)).toEqual(["연속 사격", "화염구", "전투의 포효"]);
  });

  test("equipping goes into the chosen slot, swaps with another slot, and sends nothing for the skill already there", () => {
    const { vm, sent } = setUp();
    vm.slots.value[1].select();
    expect(vm.slots.value.map(slot => slot.selected)).toEqual([false, true, false]);
    entry(vm, 1004).equip();
    expect(sent).toEqual([{ type: Opcode.SkillEquip, slot: 1, skillId: 1004 }]);
    expect(namesOf(vm)).toEqual(["화염구", "연속 사격", "늑대 소환"]);
    entry(vm, 1004).equip();
    expect(sent).toHaveLength(1);
  });

  test("unequipping from a slot or an entry empties the slot, and sends nothing for what is not equipped", () => {
    const { vm, sent } = setUp();
    vm.slots.value[1].unequip();
    expect(sent).toEqual([{ type: Opcode.SkillUnequip, skillId: 1005 }]);
    expect(namesOf(vm)).toEqual(["연속 사격", "비어 있음", "늑대 소환"]);
    expect(entry(vm, 1005)).toMatchObject({ equipped: false, state: "", learned: true });
    vm.slots.value[1].unequip();
    entry(vm, 1005).unequip();
    expect(sent).toHaveLength(1);
    entry(vm, 1011).unequip();
    expect(namesOf(vm)).toEqual(["연속 사격", "비어 있음", "비어 있음"]);
  });

  test("leveling up is possible while the settled holdings cover the cost, and stops at the max level", () => {
    const { vm, items, sent } = setUp();
    expect(entry(vm, 1005).affordable.value).toBe(true);
    // 3레벨의 비용(2560)은 확정될 골드 1000으로 모자라 보내지 않는다.
    expect(entry(vm, 1004).affordable.value).toBe(false);
    entry(vm, 1004).levelUp();
    expect(sent).toEqual([]);

    entry(vm, 1005).levelUp();
    expect(sent).toEqual([{ type: Opcode.SkillLevelUp, skillId: 1005 }]);
    expect(entry(vm, 1005)).toMatchObject({ level: "Lv.2/10", cost: "골드 1.6K" });
    expect(slotsOf(vm)[1][2]).toBe("Lv.2/10");

    // 경계마다 확정될 보유량이 바뀌면 칸은 그대로이고 낼 수 있는지만 따라간다.
    const before = vm.entries.value;
    items.value = { 1: Big.from(5000) };
    expect(vm.entries.value).toBe(before);
    expect(entry(vm, 1004).affordable.value).toBe(true);

    const top = setUp({ equipped: { 0: 1004 }, levels: { 1004: 10 } }, 1e9);
    expect(entry(top.vm, 1004)).toMatchObject({ level: "Lv.10/10", cost: "최대 레벨" });
    expect(entry(top.vm, 1004).affordable.value).toBe(false);
  });

  test("a command that does not reach the server is logged", async () => {
    const { vm, logger, goOffline } = setUp(DEFAULT, 1e6);
    goOffline();
    entry(vm, 1010).learn();
    entry(vm, 1004).equip();
    entry(vm, 1005).unequip();
    entry(vm, 1005).levelUp();
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledTimes(3));
  });

  test("there is nothing to show while logged out", () => {
    const { vm, state } = setUp();
    state.player.value = null;
    expect(vm.slots.value).toEqual([]);
    expect(vm.entries.value).toEqual([]);
  });
});
