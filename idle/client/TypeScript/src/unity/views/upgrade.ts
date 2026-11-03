import { signal } from "@preact/signals-core";
import type { UpgradeEntry, UpgradeViewModel } from "../../presentation/view-models/upgrade.js";
import { button, icon, label, list, row, tabBar, text, view } from "../binding/view.js";

/** 강화 목록의 칸 하나(UpgradeCell). 오른쪽 버튼의 글자가 고른 배수의 비용이고, 길게 누르면 되풀이해 눌린다. */
const entryRow = row<UpgradeEntry>({
  icon: icon(entry => entry.icon),
  nameText: text(entry => entry.name),
  levelText: text(entry => entry.level),
  bonusText: text(entry => entry.bonus),
  nextText: text(entry => entry.next),
  costText: text(entry => entry.cost),
  // 칸은 원소가 바뀌면 다시 바인딩하므로 누를 수 있는지는 원소의 값 그대로다.
  upgradeButton: button(entry => entry.upgrade(), { enabled: entry => signal(entry.canUpgrade) }),
});

// 프리팹은 Tools/UI/Build Upgrade Prefabs(Assets/Editor/UI/UpgradePrefabs.cs)가 만든다. 메인 화면 아래 탭 위의 판이다.
export const upgradeView = view<UpgradeViewModel>("UI/UpgradeScreen", {
  multipliers: tabBar(vm => vm.multipliers),
  items: list(vm => vm.entries, entryRow),
  titleLabel: label("menu.upgrade"),
  holdHintLabel: label("upgrade.holdHint"),
});
