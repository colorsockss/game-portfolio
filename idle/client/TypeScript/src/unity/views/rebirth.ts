import type { RebirthViewModel } from "../../presentation/view-models/rebirth.js";
import { button, label, text, view } from "../binding/view.js";

// 프리팹은 Tools/UI/Build Rebirth Prefabs(Assets/Editor/UI/RebirthPrefabs.cs)가 만든다. 메인 화면 아래 탭 위의 판이다.
// 처음으로 돌아가는 것은 여러 줄 본문 하나(resetsText)이고, 남는 것은 고정 문구(keepsLabel)다.
export const rebirthView = view<RebirthViewModel>("UI/RebirthScreen", {
  countText: text(vm => vm.count),
  rateText: text(vm => vm.rate),
  gainText: text(vm => vm.gain),
  resetsText: text(vm => vm.resets),
  keepsLabel: label("rebirth.keeps"),
  rebirthButton: button(vm => vm.rebirth(), { enabled: vm => vm.ready }),
  rebirthLabel: label("rebirth.button"),
  titleLabel: label("menu.rebirth"),
});
