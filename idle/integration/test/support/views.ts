import type { Views } from "@idle/client/presentation/screens";
import type { TransitionViewModel } from "@idle/client/presentation/transition";
import type { ViewContext } from "@idle/client/presentation/ui/ui-stack";
import type { DebugViewModel } from "@idle/client/presentation/view-models/debug";
import type { LoginViewModel } from "@idle/client/presentation/view-models/login";
import type { MainViewModel } from "@idle/client/presentation/view-models/main";
import type { TutorialViewModel } from "@idle/client/presentation/view-models/tutorial";
import type { ConfirmViewModel } from "@idle/client/presentation/widgets/confirm";

export interface CapturedViews {
  readonly views: Views;
  login(): LoginViewModel | undefined;
  main(): MainViewModel | undefined;
  debug(): DebugViewModel | undefined;
  confirm(): ConfirmViewModel | undefined;
  transition(): TransitionViewModel | undefined;
  tutorial(): TutorialViewModel | undefined;
  /** UI 스택이 로그인 뷰에 넘긴 컨텍스트. 테스트가 누름을 흉내 낸다. */
  context(): ViewContext | undefined;
}

/**
 * 아무것도 바인딩하지 않는 뷰. 로그인 뷰, 메인 화면, 디버그 오버레이, 확인 팝업, 전환 화면, 튜토리얼은 테스트가 조작할 수 있게
 * 마지막으로 바인딩된 뷰모델을 보관한다.
 */
export function captureViews(): CapturedViews {
  let login: LoginViewModel | undefined;
  let main: MainViewModel | undefined;
  let debug: DebugViewModel | undefined;
  let confirm: ConfirmViewModel | undefined;
  let transition: TransitionViewModel | undefined;
  let tutorial: TutorialViewModel | undefined;
  let context: ViewContext | undefined;
  return {
    views: {
      login: { prefab: "UI/LoginScreen", layer: "screen", bind: (_scope, _root, vm, given) => void ((login = vm), (context = given)) },
      main: { prefab: "UI/MainScreen", layer: "screen", bind: (_scope, _root, vm) => void (main = vm) },
      inventory: { prefab: "UI/InventoryScreen", layer: "popup", bind() {} },
      equipment: { prefab: "UI/EquipmentScreen", layer: "popup", bind() {} },
      upgrade: { prefab: "UI/UpgradeScreen", layer: "popup", bind() {} },
      skills: { prefab: "UI/SkillScreen", layer: "popup", bind() {} },
      rebirth: { prefab: "UI/RebirthScreen", layer: "popup", bind() {} },
      settings: { prefab: "UI/SettingsScreen", layer: "popup", bind() {} },
      battle: { bind() {} },
      confirm: { prefab: "UI/ConfirmPopup", layer: "popup", bind: (_scope, _root, vm) => void (confirm = vm) },
      reward: { prefab: "UI/RewardPopup", layer: "popup", bind() {} },
      toast: { prefab: "UI/Toast", layer: "overlay", bind() {} },
      loading: { prefab: "UI/Loading", layer: "overlay", bind() {} },
      debug: { prefab: "UI/DebugOverlay", layer: "overlay", bind: (_scope, _root, vm) => void (debug = vm) },
      // C# Fade처럼 가리거나 걷을 때마다 다 갔다고 알린다(페이드 시간 없이).
      transition: {
        prefab: "UI/TransitionScreen", layer: "overlay",
        bind(scope, _root, vm) {
          transition = vm;
          scope.add(vm.covered.subscribe(() => vm.faded()));
        },
      },
      tutorial: { prefab: "UI/TutorialOverlay", layer: "overlay", bind: (_scope, _root, vm) => void (tutorial = vm) },
    },
    login: () => login,
    main: () => main,
    debug: () => debug,
    confirm: () => confirm,
    transition: () => transition,
    tutorial: () => tutorial,
    context: () => context,
  };
}
