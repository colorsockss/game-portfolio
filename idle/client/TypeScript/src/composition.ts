import { deserializeStringsMessagePack, loadGameData, type GameData } from "@idle/data-schema";
import { computed, signal } from "@preact/signals-core";
import { MAX_UNANSWERED_COMMANDS } from "@idle/protocol";
import { createLog, type LogSink } from "./adapters/log.js";
import { createGameServer } from "./adapters/net/game-server.js";
import type { SocketBridge } from "./adapters/net/ports.js";
import { createServerClock } from "./adapters/net/server-clock.js";
import { createAccount, type Account } from "./application/account/account.js";
import { createAppFlow } from "./application/app/app-flow.js";
import { createBattle, type BattleService } from "./application/battle/battle.js";
import { createEventBus, type AppEventMap, type AppEvents } from "./application/events.js";
import type { AppRuntime, BundleStore, Clock, DeviceStorage, Display, Logger } from "./application/ports.js";
import { createProgress, type Progress } from "./application/progress/progress.js";
import { createScope } from "./application/scope.js";
import { createSettings, type Language, type SettingsService } from "./application/settings/settings.js";
import { createAppState, type AppState } from "./application/state/app-state.js";
import { createUpdater, requestUpdate, type UpdateState } from "./application/update/update.js";
import { createAudio } from "./presentation/audio/audio.js";
import type { AudioBridge } from "./presentation/audio/ports.js";
import { createScreens, showDebugOverlay, showOverlays, type ScreensOptions, type Views } from "./presentation/screens.js";
import { createTranslate, languageNames } from "./presentation/text.js";
import { createTransition, type TransitionViewModel } from "./presentation/transition.js";
import type { ResourceBridge, UiBridge } from "./presentation/ui/ports.js";
import { createResources, type Resources } from "./presentation/ui/resources.js";
import { createUiStack, type UiStack, type View } from "./presentation/ui/ui-stack.js";
import { blockWhileWaiting } from "./presentation/ui/waiting.js";
import { confirm, notice, type ConfirmViewModel, type NoticeViewModel } from "./presentation/widgets/confirm.js";
import { createCrashReporter } from "./presentation/widgets/crash.js";
import type { WorldBridge } from "./presentation/world/ports.js";
import { createWorld } from "./presentation/world/world.js";

export interface FileBridge {
  /** 게임 번들의 진입 모듈 옆에 담긴 파일(예: data/Items.bytes)을 읽는다. */
  read(path: string): ArrayBuffer | Uint8Array;
}

/** 게임이 엔진에 바라는 것. Unity가 구현하고(unity/bridge.ts), 테스트는 TypeScript로 구현한다. */
export interface Bridge {
  readonly file: FileBridge;
  readonly socket: SocketBridge;
  readonly resources: ResourceBridge;
  readonly ui: UiBridge;
  readonly world: WorldBridge;
  readonly audio: AudioBridge;
  readonly storage: DeviceStorage;
  readonly display: Display;
  readonly runtime: AppRuntime;
}

export interface ClientConfig {
  /** 게임 서버의 origin. 예: ws://localhost:8080. */
  readonly server: string;
  /**
   * 개발 빌드는 debug 로그를 남기고 디버그 오버레이(치트 포함)를 연다. 릴리즈 빌드는 info부터 남기고 열지 않는다.
   * Unity에서는 번들의 빌드 모드(BUILD_MODE)다.
   */
  readonly mode: "development" | "release";
}

/** 화면과 엔진 쪽이 클라이언트에서 쓰는 것. 상태의 쓰기 가능한 부분은 안에 숨긴다. */
export interface App {
  readonly data: GameData;
  readonly state: AppState;
  /** 보상 연출, 토스트 같은 일회성 알림. 듣기만 한다. */
  readonly events: AppEvents;
  readonly clock: Clock;
  readonly account: Account;
  /** 이 기기의 설정(볼륨, 초당 프레임, 언어). */
  readonly settings: SettingsService;
  readonly progress: Pick<Progress, "send" | "cmd">;
  /** 보이는 전투. 화면이 프레임마다 진행한다. */
  readonly battle: BattleService;
  readonly ui: UiStack;
  readonly resources: Resources;
  /** 채널 이름 → 그 채널의 로거. 버리는 레벨은 빌드 모드가 정한다. */
  readonly log: (channel: string) => Logger;
  /** 처리되지 않은 오류를 알린다: 로그에 남기고 재시작을 묻는다. 엔진이 잡은 것을 넘긴다(unity/uncaught.ts). */
  crash(error: unknown): void;
  /** 호출한 쪽이 화면을 받을 준비가 되었을 때 앱 흐름을 시작한다. */
  start(): void;
}

/**
 * 모든 서비스를 의존 순서대로 만들고 각각에 의존 대상을 넘긴다. 전역은 없다.
 * `views`는 앱 흐름의 화면에 쓸 엔진의 뷰이고, `sink`는 로그 줄을 받는다. 서비스마다 채널을 여기서 정한다.
 */
export function createApp(bridge: Bridge, config: ClientConfig, data: GameData, views: Views, sink: LogSink = console): App {
  const development = config.mode === "development";
  const log = createLog(sink, development ? "debug" : "info");
  const state = createAppState();
  const events = createEventBus<AppEventMap>(log("events"));
  const names = languageNames(data.strings);
  const settings = createSettings({
    storage: bridge.storage, display: bridge.display, languages: Object.keys(names) as Language[], logger: log("settings"),
  });
  const t = createTranslate(data.strings, computed(() => settings.value.value.language));
  const clock = createServerClock();
  const server = createGameServer({ socket: bridge.socket, server: config.server, dataVersion: data.version, clock, network: state.network });
  const progress = createProgress({
    player: state.player, server, data, clock, maxUnanswered: MAX_UNANSWERED_COMMANDS, events, logger: log("progress"),
  });
  const battle = createBattle({ state, data, clock, progress, events, logger: log("battle") });
  const resources = createResources(bridge.resources);
  const audio = createAudio({ bridge: bridge.audio, resources: bridge.resources, data, settings: settings.value, logger: log("audio") });
  // 무언가를 누를 때마다 나는 소리는 뷰 바인딩이 한 곳에서 낸다(unity/binding/bind.ts의 listenPress).
  const ui = createUiStack({ ui: bridge.ui, resources, context: { pressed: () => audio.play(data.constants.clickSfx), t } });
  const world = createWorld({ bridge: bridge.world, resources });
  blockWhileWaiting(state, ui.block);
  const transition = createTransition({ block: ui.block, unloadUnused: () => bridge.resources.unloadUnused(), t });
  // 로그아웃의 재시작은 화면이 다 가려진 뒤에 한다. 새 스크립트 환경은 가린 채 시작해 로그인 화면을 페이드 인한다.
  const account = createAccount({
    server, progress, login: state.login, storage: bridge.storage, logger: log("login"),
    runtime: { restart: () => transition.cover(() => bridge.runtime.restart()) },
  });
  const screens: ScreensOptions = {
    state, events, data, t, languageNames: names, account, battle, progress, ui, world, audio, settings, transition, views,
    logger: log("ui"),
  };
  const flow = createAppFlow({
    state, flow: state.flow, account, progress, screens: createScreens(screens), cover: transition.cover,
    requestUpdate: () => requestUpdate(bridge.storage, bridge.runtime),
  });
  // 앱의 수명. 오버레이와 재시작 팝업이 여기 열린다. 재시작은 스크립트 환경째 버리므로 해제하지 않는다.
  const lifetime = createScope();
  const report = createCrashReporter({
    show: ui.show, view: views.confirm, scope: lifetime, runtime: bridge.runtime, t, logger: log("crash"),
  });
  // 재시작을 묻는 팝업이 전환 화면 아래에 가려 누를 수 없게 되지 않도록, 묻기 전에 전환 화면을 걷는다.
  const crash = (error: unknown) => {
    transition.lift();
    report(error);
  };
  const start = () => {
    flow.start();
    showOverlays(screens, lifetime);
    if (development) showDebugOverlay(screens, clock, lifetime);
  };
  return { data, state, events, clock, account, settings, progress, battle, ui, resources, log, crash, start };
}

/** 부팅: 테이블을 불러와 앱을 만든다. 시작은 호출한 쪽이 준비되었을 때 한다. */
export async function startApp(bridge: Bridge, config: ClientConfig, views: Views, sink?: LogSink): Promise<App> {
  const data = await loadGameData(table => bridge.file.read(`data/${table}.bytes`));
  return createApp(bridge, config, data, views, sink);
}

/** 부트 프로그램이 엔진에 바라는 것. 앱에 든 것(패치 화면)만 쓴다. */
export interface BootBridge extends Pick<Bridge, "resources" | "ui" | "storage" | "display"> {
  /** 패치가 받은 게임 번들을 두는 곳. */
  readonly bundle: BundleStore;
  /** 이 스크립트 환경을 버리고 설치된 게임 번들로 게임 프로그램을 시작한다. */
  startGame(): void;
  /** https 주소를 기기의 브라우저로 연다(새 앱의 설치 페이지). */
  openUrl(url: string): void;
}

export interface BootConfig {
  readonly mode: ClientConfig["mode"];
  /** 앱의 C# API 지문. 이 API의 채널이 가리키는 패치만 받는다. Unity에서는 부트 번들의 RUNTIME_API다. */
  readonly api: string;
  /** 패치 버킷의 주소(끝이 `/`, 예: http://localhost:8081/). 없으면 패치하지 않고 바로 게임을 시작한다(개발 빌드). */
  readonly patch?: string;
}

/**
 * 부트 프로그램의 뷰: 패치 화면(전환 화면), 다시 시도를 기다리는 알림 팝업, 새 앱의 설치 페이지를 열지 묻는 확인 팝업. 모두
 * 앱에 든다.
 */
export interface BootViews {
  readonly transition: View<TransitionViewModel>;
  readonly notice: View<NoticeViewModel>;
  readonly confirm: View<ConfirmViewModel>;
}

/**
 * 부트 프로그램: 패치 화면을 띄우고 게임 번들을 맞춘 뒤 게임 프로그램을 시작한다. 시작할 수 없으면 알림 팝업으로 플레이어가
 * 다시 시도하기를 기다린다. API가 다른 새 앱이 나왔으면 그 설치 페이지를 열지 묻는다: 서버가 이 앱을 막았으면 다시 시도하기
 * 전에, 아니면 게임을 시작하기 전에(넘길 수 있음). `strings`는 부트 번들에 든 Strings 표(MessagePack)라 패치 전에도 화면의
 * 문장이 있다.
 */
export async function runBoot(bridge: BootBridge, config: BootConfig, strings: Uint8Array, views: BootViews, sink: LogSink = console): Promise<void> {
  const log = createLog(sink, config.mode === "development" ? "debug" : "info");
  const table = await deserializeStringsMessagePack(strings);
  const names = languageNames(table);
  const settings = createSettings({
    storage: bridge.storage, display: bridge.display, languages: Object.keys(names) as Language[], logger: log("settings"),
  });
  const t = createTranslate(table, computed(() => settings.value.value.language));
  // 소리는 패치로 받으므로 부트의 버튼은 소리가 없다.
  const ui = createUiStack({ ui: bridge.ui, resources: createResources(bridge.resources), context: { pressed: () => {}, t } });
  const update = signal<UpdateState>({ status: "idle", received: 0, total: 0 });
  // 전환 화면 아래에는 화면이 없으므로 가린 동안에도 탭을 막지 않는다. 그 위에 여는 알림 팝업을 누를 수 있다.
  const transition = createTransition({ update, block: () => () => {}, unloadUnused: () => {}, t });
  // 부트의 수명. 게임을 시작하면 스크립트 환경째 버리므로 해제하지 않는다.
  const lifetime = createScope();
  transition.open(ui.show, views.transition, lifetime);
  const updater = createUpdater({
    store: bridge.bundle, source: config.patch, api: config.api, update, storage: bridge.storage, logger: log("update"),
  });
  while (!(await updater.check())) {
    // 서버가 막았는데 새 패치가 없으면, 이 앱의 채널이 멈춘 것(새 앱이 나옴)이거나 아직 패치가 올라오는 중이다.
    const app = update.value.status === "required" ? await updater.newApp() : null;
    if (app === null) {
      await notice(ui.show, views.notice, lifetime, t(update.value.status === "required" ? "transition.updateRequired" : "transition.failed"));
    } else if (await confirm(ui.show, views.confirm, lifetime, t("transition.appRequired"))) {
      bridge.openUrl(app.url);
    }
  }
  // 받지 못하고 설치된 번들로 시작하면 기록도 받지 못하므로 다시 기다리지 않는다.
  const app = update.value.status === "failed" ? null : await updater.newApp();
  if (app !== null && await confirm(ui.show, views.confirm, lifetime, t("transition.appAvailable"))) bridge.openUrl(app.url);
  bridge.startGame();
}
