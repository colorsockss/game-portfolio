import type { GameData } from "@idle/data-schema";
import { computed, type ReadonlySignal } from "@preact/signals-core";
import type { Account } from "../application/account/account.js";
import type { Screens } from "../application/app/app-flow.js";
import type { BattleService } from "../application/battle/battle.js";
import type { AppEvents, OfflineRewarded } from "../application/events.js";
import type { Clock, Logger } from "../application/ports.js";
import type { Progress } from "../application/progress/progress.js";
import { createScope, type Scope } from "../application/scope.js";
import type { Language, SettingsService } from "../application/settings/settings.js";
import type { AppState } from "../application/state/app-state.js";
import type { Audio } from "./audio/audio.js";
import type { Translate } from "./text.js";
import type { Transition, TransitionViewModel } from "./transition.js";
import { popup, type OpenOptions, type OpenView, type UiStack, type View } from "./ui/ui-stack.js";
import { createDebugViewModel, type DebugViewModel } from "./view-models/debug.js";
import {
  createEquipmentBadges,
  createEquipmentViewModel,
  type EquipmentBadges,
  type EquipmentViewModel,
} from "./view-models/equipment.js";
import { createInventoryViewModel, type InventoryViewModel } from "./view-models/inventory.js";
import { createLoginViewModel, type LoginViewModel } from "./view-models/login.js";
import { createMainViewModel, type MainViewModel } from "./view-models/main.js";
import { createRebirthViewModel, type RebirthViewModel } from "./view-models/rebirth.js";
import { createSettingsViewModel, type SettingsViewModel } from "./view-models/settings.js";
import { createSkillsViewModel, type SkillsViewModel } from "./view-models/skills.js";
import { createTutorialViewModel, type TutorialViewModel } from "./view-models/tutorial.js";
import { createUpgradeViewModel, type UpgradeViewModel } from "./view-models/upgrade.js";
import { confirm, type ConfirmViewModel } from "./widgets/confirm.js";
import { showWhileWaiting, type LoadingViewModel } from "./widgets/loading.js";
import { createRewardViewModel, type RewardViewModel } from "./widgets/reward.js";
import { createToastViewModel, type ToastViewModel } from "./widgets/toast.js";
import { createBattleDirector, type BattleDirector } from "./world/battle-director.js";
import type { World, WorldView } from "./world/world.js";

/** 화면마다 엔진이 가진 뷰(unity/views/). */
export interface Views {
  readonly login: View<LoginViewModel>;
  readonly main: View<MainViewModel>;
  /** 메인 화면 위에 팝업으로 여는 가방. */
  readonly inventory: View<InventoryViewModel>;
  /** 메인 화면 위에 팝업으로 여는 장비. */
  readonly equipment: View<EquipmentViewModel>;
  /** 메인 화면 위에 팝업으로 여는 골드 능력치 강화. */
  readonly upgrade: View<UpgradeViewModel>;
  /** 메인 화면 위에 팝업으로 여는 스킬(배우기, 장착, 레벨업). */
  readonly skills: View<SkillsViewModel>;
  /** 메인 화면 위에 팝업으로 여는 환생. 누르면 확인 팝업으로 묻는다. */
  readonly rebirth: View<RebirthViewModel>;
  /** 메인 화면 위에 팝업으로 여는 설정. */
  readonly settings: View<SettingsViewModel>;
  /** 메인 화면 뒤의 전투 월드. UI 뷰가 아니라 프리팹을 월드에 올린다. */
  readonly battle: WorldView<BattleDirector>;
  /** 공용 위젯(presentation/widgets/). 확인과 보상은 팝업, 토스트와 로딩 표시는 오버레이다. */
  readonly confirm: View<ConfirmViewModel>;
  readonly reward: View<RewardViewModel>;
  readonly toast: View<ToastViewModel>;
  readonly loading: View<LoadingViewModel>;
  /** 개발 빌드에서만 여는 디버그 오버레이. */
  readonly debug: View<DebugViewModel>;
  /** 상태 사이와 Boot·Update 동안 화면을 가리는 전환 화면(오버레이). */
  readonly transition: View<TransitionViewModel>;
  /** 튜토리얼을 마칠 때까지 메인 화면 위에 여는 대사 창과 막(오버레이). */
  readonly tutorial: View<TutorialViewModel>;
}

export interface ScreensOptions {
  readonly state: AppState;
  /** 오프라인 보상(보상 팝업)과 거절된 커맨드(토스트)를 듣는다. */
  readonly events: AppEvents;
  readonly data: GameData;
  /** 화면의 문장. 설정의 언어를 따라가서, 언어가 바뀌면 열린 화면이 다시 그려진다. */
  readonly t: Translate;
  /** 설정 화면의 언어 탭(presentation/text.ts의 languageNames). */
  readonly languageNames: Readonly<Record<Language, string>>;
  readonly account: Account;
  readonly battle: BattleService;
  /** 장비 화면이 착용과 해제를, 튜토리얼이 스텝을, 디버그 오버레이가 치트를 보낸다. */
  readonly progress: Pick<Progress, "cmd">;
  /** 뷰를 열고, 튜토리얼이 열린 뷰에서 대상을 찾는다. */
  readonly ui: Pick<UiStack, "show" | "shown" | "blockBack">;
  readonly world: World;
  readonly audio: Audio;
  /** 설정 화면이 바꾼다. */
  readonly settings: SettingsService;
  /** 상태의 화면이 준비되면 가린 것을 걷는다. 전환 화면은 앱 내내 있는 오버레이와 함께 연다. 튜토리얼은 다 걷힌 뒤에 보인다. */
  readonly transition: Pick<Transition, "reveal" | "open" | "clear">;
  readonly views: Views;
  readonly logger: Logger;
}

// 열리지 않는 뷰는 로그에 남기고, 흐름은 그것 없이 이어 간다.
function logged(ui: Pick<UiStack, "show">, logger: Logger): UiStack["show"] {
  return <VM>(view: View<VM>, vm: VM, scope: Scope, options?: Pick<OpenOptions, "back">): Promise<OpenView | undefined> =>
    ui.show(view, vm, scope, options).catch(error => {
      logger.error(`${view.prefab} did not open:`, error);
      return undefined;
    });
}

// `condition`이 참이 되면 이행한다. `scope`가 닫히면 더 따라가지 않는다.
function until(condition: ReadonlySignal<boolean>, scope: Scope): Promise<void> {
  return new Promise(resolve => scope.add(condition.subscribe(met => met && resolve())));
}

/**
 * 앱 흐름이 상태마다 보여 주는 것: 새 뷰모델을 만들어 그 상태가 이어지는 동안 뷰에 연결해 두고, 화면이 열리면 전환
 * 화면을 걷는다. Boot와 Update는 따로 보여 줄 것이 없고 전환 화면이 업데이트의 진행을 보인다.
 */
export function createScreens(
  {
    state, events, data, t, languageNames, account, battle, progress, ui, world, audio, settings, transition, views, logger,
  }: ScreensOptions,
): Screens {
  const show = logged(ui, logger);
  // 튜토리얼의 대상은 화면 이름(Views의 키)으로 적으므로 그 뷰의 프리팹으로 바꾼다. 전투 월드는 UI 뷰가 아니다.
  const prefabs = Object.fromEntries(Object.entries(views).map(([key, view]) => [key, "prefab" in view ? view.prefab : undefined]));

  // 메인 화면 위의 팝업은 메인 화면과 함께 닫힌다. 닫기(보상은 확인) 버튼과 뒤로 가기가 닫는다. 장비의 뱃지는 메인 화면의
  // 장비 버튼과 같은 트리이고, 설정에서 바꾼 것은 설정 서비스가 저장하며 소리는 오디오가 바로 따라간다.
  const popups = {
    inventory: (owner: Scope) =>
      popup(show, views.inventory, owner, close => createInventoryViewModel({ data, t, items: battle.items, close })),
    equipment: (owner: Scope, badges: EquipmentBadges) =>
      popup(show, views.equipment, owner, close =>
        createEquipmentViewModel({ state, data, t, battle, progress, badges, logger, close })),
    upgrade: (owner: Scope) =>
      popup(show, views.upgrade, owner, close => createUpgradeViewModel({ state, data, t, battle, progress, logger, close })),
    skills: (owner: Scope) =>
      popup(show, views.skills, owner, close => createSkillsViewModel({ state, data, t, battle, progress, logger, close })),
    rebirth: (owner: Scope) =>
      popup(show, views.rebirth, owner, close => createRebirthViewModel({
        state, data, t, battle, progress, logger, confirm: message => confirm(show, views.confirm, owner, message), close,
      })),
    settings: (owner: Scope) =>
      popup(show, views.settings, owner, close => createSettingsViewModel({
        settings, t, languageNames, account, confirm: message => confirm(show, views.confirm, owner, message), close,
      })),
    reward: (owner: Scope, reward: OfflineRewarded) =>
      popup(show, views.reward, owner, close => createRewardViewModel({ data, t, reward, close })),
  };

  // 메인 화면이 열려 있는 동안 보이는 전투의 스테이지 BGM(Stages의 bgm)을 튼다. 스테이지가 바뀌어 곡이 바뀌면 바꾼다.
  function playStageBgm(owner: Scope): void {
    const key = computed(() => {
      const stageId = battle.snapshot.value?.stageId ?? state.player.value?.stage.currentId;
      return stageId === undefined ? undefined : data.stages.get(stageId)?.bgm;
    });
    let playing: Scope | undefined;
    owner.add(() => playing?.dispose());
    owner.add(key.subscribe(bgm => {
      // 새 곡을 먼저 틀어야 앞 곡의 스코프를 닫을 때 BGM이 멈췄다가 다시 나지 않는다.
      const next = createScope();
      if (bgm) audio.playBgm(bgm, next);
      playing?.dispose();
      playing = next;
    }));
  }

  // 튜토리얼은 메인 화면 위의 오버레이다. 지금 스텝이 있는 동안 열어 두고, 마치면 닫는다. 조건은 메인 상태 내내 따라간다.
  function openTutorial(owner: Scope): void {
    const vm = createTutorialViewModel({
      state, data, t, battle, progress, shown: ui.shown, clear: transition.clear, prefabs, logger, owner,
    });
    let open: Scope | undefined;
    owner.add(() => open?.dispose());
    // 튜토리얼이 보이는 동안은 뒤로 가기를 막는다. 비춘 팝업을 Esc로 닫아 스텝을 건너뛰지 않게 한다.
    let backBlocked: (() => void) | undefined;
    owner.add(() => backBlocked?.());
    owner.add(vm.visible.subscribe(visible => {
      if (visible) {
        backBlocked ??= ui.blockBack();
      } else {
        backBlocked?.();
        backBlocked = undefined;
      }
    }));
    owner.add(vm.running.subscribe(running => {
      if (running && !open) {
        open = createScope();
        void show(views.tutorial, vm, open);
      } else if (!running && open) {
        open.dispose();
        open = undefined;
      }
    }));
  }

  return {
    login(scope) {
      const opened = show(views.login, createLoginViewModel({ state, account, t }), scope);
      // 저장된 ID로 저절로 로그인하는 동안은 가린 채로 둔다. 곧 메인으로 가면 로그인 화면이 잠깐 보였다 사라지기 때문이다.
      const idle = computed(() => state.login.value.pending === null);
      transition.reveal(opened.then(() => until(idle, scope)), scope);
    },
    main(scope) {
      // 메인 화면은 전투의 스냅숏으로 수치를 만들고, 전투 월드는 연출자에게서 지시를 받는다.
      const badges = createEquipmentBadges({ state, data });
      const vm = createMainViewModel({
        state, data, t, battle,
        openInventory: () => void popups.inventory(scope),
        openEquipment: () => void popups.equipment(scope, badges),
        openUpgrade: () => void popups.upgrade(scope),
        openSkills: () => void popups.skills(scope),
        openRebirth: () => void popups.rebirth(scope),
        equipmentBadge: badges.any,
        openSettings: () => void popups.settings(scope),
      });
      transition.reveal(show(views.main, vm, scope), scope);
      playStageBgm(scope);
      scope.add(events.on("offlineReward", reward => void popups.reward(scope, reward)));
      openTutorial(scope);
      // 월드를 못 올려도 메인 화면과 앱 흐름은 이어 간다.
      try {
        views.battle.bind(scope, world, createBattleDirector({ battle, data, t, audio }));
      } catch (error) {
        logger.error("The battle view did not bind:", error);
      }
    },
  };
}

/**
 * 앱 내내 화면 위에 있는 것: 전환 화면, 거절된 커맨드의 토스트, 서버를 기다리는 동안의 로딩 표시. `scope`는 앱의
 * 수명이다. 앱 흐름의 상태와 따로 열어서 상태가 바뀌어도 이어진다. 전환 화면을 먼저 열어 오버레이 맨 아래에 둔다.
 */
export function showOverlays({ state, events, t, ui, transition, views, logger }: ScreensOptions, scope: Scope): void {
  const show = logged(ui, logger);
  transition.open(show, views.transition, scope);
  void show(views.toast, createToastViewModel(events, t), scope);
  showWhileWaiting({ state, show, view: views.loading, t, owner: scope });
}

/** 개발 빌드에서만 여는 디버그 오버레이(FPS, 서버 시간, 상태 덤프, 치트). `scope`는 앱의 수명이다. */
export function showDebugOverlay({ state, progress, t, ui, views, logger }: ScreensOptions, clock: Clock, scope: Scope): void {
  void logged(ui, logger)(views.debug, createDebugViewModel({ state, clock, progress, t }), scope);
}
