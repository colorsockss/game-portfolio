import type { EquipmentEntry, EquipmentViewModel } from "../../presentation/view-models/equipment.js";
import { active, bigNumber, button, icon, label, list, row, tabBar, text, view } from "../binding/view.js";
import { currencyView } from "./widgets.js";

/**
 * 장비 목록의 칸 하나(EquipmentCell). 칸 전체가 입고 벗는 버튼이고(튜토리얼의 "무기 착용"도 이것), 오른쪽 끝의 강화 버튼이 그
 * 장비를 아래 강화·합성 패널에 고른다.
 */
const entryRow = row<EquipmentEntry>({
  icon: icon(entry => entry.icon),
  nameText: text(entry => entry.name),
  detailText: text(entry => entry.detail),
  stateText: text(entry => entry.state),
  selectButton: button(entry => entry.toggle()),
  forgeButton: button(entry => entry.select()),
  forgeLabel: label("equipment.enhance"),
});

// 프리팹은 Tools/UI/Build Equipment Prefabs(Assets/Editor/UI/EquipmentPrefabs.cs)가 만든다. 능력치 칸은 재화 바의
// 칸(CurrencySlot: 아이콘 없이 이름과 굴러가는 수)을 그대로 쓴다.
export const equipmentView = view<EquipmentViewModel>("UI/EquipmentScreen", {
  stats: list(vm => vm.stats, currencyView),
  tabs: tabBar(vm => vm.tabs),
  items: list(vm => vm.entries, entryRow),
  // 고른 장비의 강화·합성 패널. 고른 것이 없으면 숨고, 다음 등급이 없으면 합성 줄이 숨는다.
  forgePanel: active(vm => vm.forge.visible),
  forgeNameText: text(vm => vm.forge.name),
  forgeStepText: text(vm => vm.forge.step),
  forgeDetailText: text(vm => vm.forge.detail),
  enhanceCostText: bigNumber(vm => vm.forge.enhanceCost),
  enhanceButton: button(vm => vm.forge.enhance(), { enabled: vm => vm.forge.canEnhance }),
  enhanceLabel: label("equipment.enhance"),
  mergeRow: active(vm => vm.forge.mergeable),
  mergeCountText: text(vm => vm.forge.mergeCount),
  mergeIntoText: text(vm => vm.forge.mergeInto),
  mergeButton: button(vm => vm.forge.merge(), { enabled: vm => vm.forge.canMerge }),
  mergeLabel: label("equipment.merge"),
  closeButton: button(vm => vm.close()),
  titleLabel: label("menu.equipment"),
  closeLabel: label("common.close"),
}, "popup");
