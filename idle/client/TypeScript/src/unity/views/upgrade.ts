import { signal } from "@preact/signals-core";
import type { UpgradeEntry, UpgradeViewModel } from "../../presentation/view-models/upgrade.js";
import { button, label, list, row, text, view } from "../binding/view.js";

/** 강화 목록의 칸 하나(UpgradeCell). 오른쪽 버튼의 글자가 다음 비용이다. */
const entryRow = row<UpgradeEntry>({
  nameText: text(entry => entry.name),
  levelText: text(entry => entry.level),
  bonusText: text(entry => entry.bonus),
  costText: text(entry => entry.cost),
  // 칸은 원소가 바뀌면 다시 바인딩하므로 누를 수 있는지는 원소의 값 그대로다.
  upgradeButton: button(entry => entry.upgrade(), { enabled: entry => signal(entry.canUpgrade) }),
});

// 프리팹은 Tools/UI/Build Upgrade Prefabs(Assets/Editor/UI/UpgradePrefabs.cs)가 만든다.
export const upgradeView = view<UpgradeViewModel>("UI/UpgradeScreen", {
  items: list(vm => vm.entries, entryRow),
  closeButton: button(vm => vm.close()),
  titleLabel: label("menu.upgrade"),
  closeLabel: label("common.close"),
}, "popup");
