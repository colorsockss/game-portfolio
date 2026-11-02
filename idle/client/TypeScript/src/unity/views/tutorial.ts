import type { TutorialViewModel } from "../../presentation/view-models/tutorial.js";
import { active, button, label, spotlight, text, view } from "../binding/view.js";

// 튜토리얼 오버레이. 프리팹은 Tools/UI/Build Tutorial Prefabs(Assets/Editor/UI/TutorialPrefabs.cs)가 만든다. 대상은 다른 뷰의
// ViewRefs 항목이라 이 표가 아니라 뷰모델이 정한다.
export const tutorialView = view<TutorialViewModel>("UI/TutorialOverlay", {
  spotlight: spotlight(vm => vm.target, vm => vm.tap()),
  tapButton: button(vm => vm.tap(), { visible: vm => vm.covering }),
  dialog: active(vm => vm.visible),
  dialogText: text(vm => vm.text),
  hint: active(vm => vm.covering),
  hintLabel: label("tutorial.tapToContinue"),
}, "guide");
