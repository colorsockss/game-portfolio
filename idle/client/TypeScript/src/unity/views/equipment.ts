import type { EquipmentEntry, EquipmentViewModel } from "../../presentation/view-models/equipment.js";
import { active, bigNumber, button, fill, icon, label, list, row, tabBar, text, tint, view } from "../binding/view.js";
import { currencyView } from "./widgets.js";

/**
 * 장비 그리드의 칸 하나(EquipmentCell). 칸 전체가 버튼이라 누르면 고르고, 입지 않은 것이면 입는다(튜토리얼의 "무기 착용"도
 * 이것). 등급 색, 강화 단계, 합성 재료 막대, 착용 표시(E), 더 좋은 장비의 빨간 점, 고른 칸의 테두리가 있다.
 */
const entryRow = row<EquipmentEntry>({
  icon: icon(entry => entry.icon),
  tint: tint(entry => entry.tint),
  levelText: text(entry => entry.level),
  countBar: active(entry => entry.countText !== ""),
  countFill: fill(entry => entry.count),
  countText: text(entry => entry.countText),
  wornMark: active(entry => entry.worn),
  betterBadge: active(entry => entry.better),
  selectedMark: active(entry => entry.selected),
  selectButton: button(entry => entry.tap()),
});

// 프리팹은 Tools/UI/Build Equipment Prefabs(Assets/Editor/UI/EquipmentPrefabs.cs)가 만든다. 메인 화면 아래 탭 위의 판이다.
// 능력치 칸은 재화 바의 칸(CurrencySlot: 아이콘 없이 이름과 굴러가는 수)을 그대로 쓴다.
export const equipmentView = view<EquipmentViewModel>("UI/EquipmentScreen", {
  equipBestButton: button(vm => vm.equipBest(), { enabled: vm => vm.canEquipBest }),
  equipBestLabel: label("equipment.equipBest"),
  mergeAllButton: button(vm => vm.mergeAll(), { enabled: vm => vm.canMergeAll }),
  mergeAllLabel: label("equipment.mergeAll"),
  stats: list(vm => vm.stats, currencyView),
  tabs: tabBar(vm => vm.tabs),
  items: list(vm => vm.entries, entryRow),
  // 고른 장비의 강화·합성 패널. 고른 것이 없으면 숨고, 다음 장비가 없으면 합성 줄이 숨는다.
  forgePanel: active(vm => vm.forge.visible),
  forgeNameText: text(vm => vm.forge.name),
  forgeStepText: text(vm => vm.forge.step),
  forgeDetailText: text(vm => vm.forge.detail),
  equipToggleButton: button(vm => vm.forge.toggle()),
  equipToggleLabel: text(vm => vm.forge.toggleLabel),
  enhanceCostText: bigNumber(vm => vm.forge.enhanceCost),
  enhanceButton: button(vm => vm.forge.enhance(), { enabled: vm => vm.forge.canEnhance }),
  enhanceLabel: label("equipment.enhance"),
  mergeRow: active(vm => vm.forge.mergeable),
  mergeCountText: text(vm => vm.forge.mergeCount),
  mergeIntoText: text(vm => vm.forge.mergeInto),
  mergeButton: button(vm => vm.forge.merge(), { enabled: vm => vm.forge.canMerge }),
  mergeLabel: label("equipment.merge"),
  titleLabel: label("menu.equipment"),
});
