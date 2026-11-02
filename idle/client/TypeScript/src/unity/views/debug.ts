import type { View } from "../../presentation/ui/ui-stack.js";
import type { DebugViewModel } from "../../presentation/view-models/debug.js";
import { active, button, input, label, text, view } from "../binding/view.js";
import { EVERY_FRAME } from "../frame.js";

// 디버그 오버레이의 뷰. 프리팹은 Tools/UI/Build Debug Prefabs(Assets/Editor/UI/DebugPrefabs.cs)가 만든다.

/** FPS와 서버 시간, 상태 덤프를 다시 보이는 간격. */
const REFRESH_MS = 500;

const table = view<DebugViewModel>("UI/DebugOverlay", {
  toggleButton: button(vm => vm.toggle()),
  panel: active(vm => vm.open),
  fpsText: text(vm => vm.fps),
  serverTimeText: text(vm => vm.serverTime),
  dumpText: text(vm => vm.dump),
  cheatInput: input(vm => vm.cheat),
  cheatButton: button(vm => vm.runCheat()),
  cheatResultText: text(vm => vm.cheatResult),
  toggleLabel: label("debug.toggle"),
  cheatLabel: label("debug.run"),
  cheatPlaceholder: label("debug.placeholder"),
}, "debug");

/** 패널이 펼쳐진 동안만 Unity의 프레임(스크립트 Tick)을 세어 `REFRESH_MS`마다 뷰모델에 초당 프레임을 넘긴다. */
export const debugView: View<DebugViewModel> = {
  prefab: table.prefab,
  layer: table.layer,
  bind(scope, root, vm, context) {
    table.bind(scope, root, vm, context);
    let stop: (() => void) | undefined;
    scope.add(vm.open.subscribe(open => {
      stop?.();
      stop = open ? measure(vm) : undefined;
    }));
    scope.add(() => stop?.());
  },
};

function measure(vm: DebugViewModel): () => void {
  let frames = 0;
  let since = Date.now();
  vm.refresh(0);
  const timer = setInterval(() => {
    frames++;
    const now = Date.now();
    if (now - since < REFRESH_MS) return;
    vm.refresh((frames * 1000) / (now - since));
    frames = 0;
    since = now;
  }, EVERY_FRAME);
  return () => clearInterval(timer);
}
