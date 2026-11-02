import type { TransitionViewModel } from "../../presentation/transition.js";
import { active, fade, fill, text, view } from "../binding/view.js";

// 상태 사이의 전환 화면. 프리팹은 Tools/UI/Build Widget Prefabs(Assets/Editor/UI/WidgetPrefabs.cs)가 만든다.
export const transitionView = view<TransitionViewModel>("UI/TransitionScreen", {
  fade: fade(vm => vm.covered, vm => vm.faded()),
  messageText: text(vm => vm.message),
  progressBar: active(vm => vm.downloading),
  progressFill: fill(vm => vm.progress),
}, "overlay");
