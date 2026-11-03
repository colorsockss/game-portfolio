import { computed } from "@preact/signals-core";
import type { LoadoutSlot, MainTab, MainViewModel, SkillBarSlot } from "../../presentation/view-models/main.js";
import { active, button, dock, fill, icon, label, list, nested, row, text, tint, view, type Binder } from "../binding/view.js";
import { currencyBarView } from "./widgets.js";

/** 영웅 띠의 스킬 칸 하나(SkillBarSlot). 재사용 대기는 칸의 신호라 칸을 다시 바인딩하지 않고 따라간다. */
const skillRow = row<SkillBarSlot>({
  icon: icon(slot => slot.icon),
  tint: tint(slot => slot.tint),
  cooldownFill: fill(slot => slot.cooldown),
  cooldownText: text(slot => slot.seconds),
});

/** 장착 현황 판의 칸 하나(LoadoutSlot). 칸 전체가 버튼이라 누르면 그 메뉴가 열린다. */
const loadoutRow = row<LoadoutSlot>({
  tint: tint(slot => slot.tint),
  icon: icon(slot => slot.icon),
  levelText: text(slot => slot.level),
  nameText: text(slot => slot.name),
  openButton: button(slot => slot.open()),
});

// 아래 탭 하나의 바인딩: 누르면 그 판을 열거나 닫고, 열린 탭이면 노란 판이 켜진다.
function tab(key: MainTab): Readonly<Record<string, Binder<MainViewModel>>> {
  return {
    [`${key}Button`]: button(vm => vm.toggle(key)),
    [`${key}Selected`]: active(vm => computed(() => vm.tab.value === key)),
  };
}

// 프리팹은 Tools/UI/Build Screen Prefabs(Assets/Editor/UI/ScreenPrefabs.cs)가 만든다.
export const mainView = view<MainViewModel>("UI/MainScreen", {
  levelText: text(vm => vm.level),
  nameText: text(vm => vm.name),
  expBar: fill(vm => vm.exp),
  expText: text(vm => vm.expText),
  currencyBar: nested(currencyBarView, vm => vm.currencies),
  settingsButton: button(vm => vm.openSettings()),
  stageText: text(vm => vm.stage),
  prevStageButton: button(vm => vm.prevStage(), { visible: vm => vm.canChangeStage }),
  nextStageButton: button(vm => vm.nextStage(), { visible: vm => vm.canChangeStage }),
  stageProgress: fill(vm => vm.hud.progress),
  wavesText: text(vm => vm.hud.waves),
  bossTimeText: text(vm => vm.hud.bossTime),
  // 해골은 늘 보이고 도전할 수 있을 때만 눌리며, 그동안 뒤에서 빛살이 돈다.
  bossButton: button(vm => vm.challenge(), { enabled: vm => vm.hud.canChallenge }),
  bossGlow: active(vm => vm.hud.canChallenge),
  // 장착 현황 판과 영웅 띠는 고른 탭이 아니라 보이는 판을 따른다(새 판이 열릴 때까지 그대로).
  homePanel: active(vm => computed(() => vm.sheet.value === null)),
  loadoutEquipment: list(vm => vm.loadout.equipment, loadoutRow),
  loadoutSkills: list(vm => vm.loadout.skills, loadoutRow),
  loadoutEquipmentLabel: label("menu.equipment"),
  loadoutSkillsLabel: label("menu.skills"),
  // 영웅 띠는 보이는 판(탭을 모두 끄면 장착 현황 판) 바로 위로 옮겨 간다.
  heroStrip: dock(vm => computed(() => vm.sheet.value ?? "")),
  hpBar: fill(vm => vm.hero.hp),
  hpText: text(vm => vm.hero.hpText),
  attackText: text(vm => vm.hero.attack),
  critText: text(vm => vm.hero.crit),
  skills: list(vm => vm.hero.skills, skillRow),
  ...tab("upgrade"),
  ...tab("skills"),
  ...tab("equipment"),
  ...tab("inventory"),
  ...tab("rebirth"),
  equipmentBadge: active(vm => vm.equipmentBadge),
  // 프리팹의 고정 글자.
  upgradeLabel: label("menu.upgrade"),
  skillsLabel: label("menu.skills"),
  equipmentLabel: label("menu.equipment"),
  inventoryLabel: label("menu.inventory"),
  rebirthLabel: label("menu.rebirth"),
});
