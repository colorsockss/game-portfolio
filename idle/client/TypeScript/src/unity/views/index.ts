import type { Views } from "../../presentation/screens.js";
import { battleView } from "./battle.js";
import { debugView } from "./debug.js";
import { equipmentView } from "./equipment.js";
import { inventoryView } from "./inventory.js";
import { loginView } from "./login.js";
import { mainView } from "./main.js";
import { rebirthView } from "./rebirth.js";
import { settingsView } from "./settings.js";
import { skillsView } from "./skills.js";
import { transitionView } from "./transition.js";
import { tutorialView } from "./tutorial.js";
import { upgradeView } from "./upgrade.js";
import { confirmView, loadingView, rewardView, toastView } from "./widgets.js";

/** 앱 흐름이 보여 주는 화면마다의 뷰와 공용 위젯의 뷰. */
export const views: Views = {
  login: loginView, main: mainView, inventory: inventoryView, equipment: equipmentView, upgrade: upgradeView, skills: skillsView, rebirth: rebirthView,
  settings: settingsView,
  battle: battleView,
  confirm: confirmView, reward: rewardView, toast: toastView, loading: loadingView, debug: debugView,
  transition: transitionView, tutorial: tutorialView,
};
