import { signal } from "@preact/signals-core";
import type { SkillEntry, SkillSlot, SkillsViewModel } from "../../presentation/view-models/skills.js";
import { active, button, icon, label, list, row, text, tint, view } from "../binding/view.js";

// 칸은 원소가 바뀌면 다시 바인딩하므로 원소의 값 그대로인 신호면 된다.
const fixed = (value: boolean) => signal(value);

/** 슬롯 줄의 칸 하나(SkillSlot). 칸 전체가 고르는 버튼이고 고른 슬롯에 주황 테두리가 켜진다. */
const slotView = row<SkillSlot>({
  labelText: text(slot => slot.label),
  icon: icon(slot => slot.icon),
  tint: tint(slot => slot.tint),
  nameText: text(slot => slot.name),
  levelText: text(slot => slot.level),
  selectedMark: active(slot => fixed(slot.selected)),
  selectButton: button(slot => slot.select()),
});

/**
 * 스킬 목록의 칸 하나(SkillCell). 동작 버튼은 같은 자리에 겹친 셋 중 하나만 보인다: 배우지 않았으면 배우기, 장착했으면 해제,
 * 아니면 장착. 레벨업은 배운 스킬에만 보인다. 배우기와 레벨업은 확정될 보유량으로 낼 수 있을 때만 누를 수 있다.
 */
const entryRow = row<SkillEntry>({
  icon: icon(entry => entry.icon),
  tint: tint(entry => entry.tint),
  nameText: text(entry => entry.name),
  levelText: text(entry => entry.level),
  stateText: text(entry => entry.state),
  costText: text(entry => entry.cost),
  learnButton: button(entry => entry.learn(), { visible: entry => fixed(!entry.learned), enabled: entry => entry.affordable }),
  equipButton: button(entry => entry.equip(), { visible: entry => fixed(entry.learned && !entry.equipped) }),
  unequipButton: button(entry => entry.unequip(), { visible: entry => fixed(entry.equipped) }),
  levelUpButton: button(entry => entry.levelUp(), { visible: entry => fixed(entry.learned), enabled: entry => entry.affordable }),
  learnLabel: label("skills.learn"),
  equipLabel: label("skills.equip"),
  unequipLabel: label("skills.unequip"),
  levelUpLabel: label("skills.levelUp"),
});

// 프리팹은 Tools/UI/Build Skill Prefabs(Assets/Editor/UI/SkillPrefabs.cs)가 만든다. 메인 화면 아래 탭 위의 판이다.
export const skillsView = view<SkillsViewModel>("UI/SkillScreen", {
  slots: list(vm => vm.slots, slotView),
  skills: list(vm => vm.entries, entryRow),
  titleLabel: label("menu.skills"),
});
