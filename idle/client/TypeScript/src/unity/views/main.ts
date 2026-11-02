import type { MainViewModel } from "../../presentation/view-models/main.js";
import { active, button, fill, label, nested, text, view } from "../binding/view.js";
import { currencyBarView } from "./widgets.js";

export const mainView = view<MainViewModel>("UI/MainScreen", {
  titleText: text(vm => vm.title),
  expBar: fill(vm => vm.exp),
  currencyBar: nested(currencyBarView, vm => vm.currencies),
  stageText: text(vm => vm.stage),
  wavesText: text(vm => vm.hud.waves),
  bossTimeText: text(vm => vm.hud.bossTime),
  nextStageButton: button(vm => vm.nextStage(), { visible: vm => vm.canChangeStage }),
  inventoryButton: button(vm => vm.openInventory()),
  equipmentButton: button(vm => vm.openEquipment()),
  upgradeButton: button(vm => vm.openUpgrade()),
  skillsButton: button(vm => vm.openSkills()),
  rebirthButton: button(vm => vm.openRebirth()),
  equipmentBadge: active(vm => vm.equipmentBadge),
  settingsButton: button(vm => vm.openSettings()),
  bossButton: button(vm => vm.challenge(), { visible: vm => vm.hud.canChallenge }),
  // 손으로 만든 프리팹의 고정 글자. 항목은 Widget·Equipment·Settings 빌더가 넣는다.
  stageLabel: label("main.stageLabel"),
  nextStageLabel: label("main.nextStage"),
  inventoryLabel: label("menu.inventory"),
  equipmentLabel: label("menu.equipment"),
  upgradeLabel: label("menu.upgrade"),
  skillsLabel: label("menu.skills"),
  rebirthLabel: label("menu.rebirth"),
  bossLabel: label("main.bossChallenge"),
});
