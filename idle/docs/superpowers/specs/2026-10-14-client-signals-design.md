# 클라이언트 신호와 바인딩 표 설계

- 날짜: 2026-10-14
- 범위: 클라이언트 TypeScript의 상태, 뷰모델, 뷰 바인딩 구조. 끝낸 백로그 28(상태 스토어), 37(뷰 바인딩), 42(전투 뷰)의 구조를 바꿉니다. 동작은 바꾸지 않습니다.
- 상태: 구현됨

## 1. 목적

지금 화면 코드는 WPF의 MVVM처럼 깔끔해 보이지 않습니다. 패턴이 틀려서가 아니라 바인딩 엔진이 해야 할 일을 화면마다 손으로 하기 때문입니다.

- `Observable`에 `get`/`subscribe`만 있어서, 두 값을 합친 값을 화면마다 직접 만듭니다. 로그인 뷰모델의 `follow()`(23줄)와 전투 뷰모델의 비공개 스토어가 그 예입니다.
- 프리팹 항목 이름을 네 번 씁니다: ViewRefs 항목, `ref.object(...)` 선언, `bindText(...)` 줄, 뷰모델.
- 전투 뷰모델은 HUD 값(바인딩)과 연출 명령 스트림(`frame(): Direction[]`)을 한 객체에 섞었고, 메인 뷰모델이 그 일부를 그대로 넘깁니다.

성공 기준:

- 뷰모델의 파생 값은 `computed` 한 줄입니다. `follow()`도, 뷰모델 안의 비공개 스토어도 없습니다.
- UI 화면의 뷰는 바인딩 표 하나입니다. 프리팹 항목 이름은 TS에 한 번만 씁니다.
- 전투 월드의 연출 명령과 HUD 값이 서로 다른 객체에 있습니다.
- 동작은 그대로입니다. 지금 테스트가 다루는 동작은 새 API로 옮긴 같은 테스트로 통과하고, `integration/`도 통과합니다.
- 측정한 비용이 프레임 예산 안에 있습니다. iOS(jitless)에서는 지금보다 느려지는 것을 알고 받아들입니다(3절).

## 2. 정해진 것

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| 반응형 기본 | `@preact/signals-core` 1.14.4. 버전을 정확히 고정합니다. | PuerTS V8에서 돌아가는 것을 확인했습니다. 읽기 전용 타입과 구독 의미가 지금 구조와 맞습니다. 성능은 결정 요인이 아닙니다(3절). |
| 상태 모양 | 스토어 하나 대신 슬라이스마다 신호 하나(`flow`, `player`, `network`, `login`)입니다. | 값에 기대는 것만 다시 계산하고, `sliceOf`·`Slice`·`ReadonlyStore`가 필요 없어집니다. |
| 쓰기 권한 | 슬라이스를 쓰는 쪽은 `Signal<T>`, 나머지는 `ReadonlySignal<T>`를 받습니다. | 읽는 쪽이 `.value`에 쓰면 타입 오류입니다. 다만 TypeScript는 `ReadonlySignal`을 `Signal` 자리에 넘기는 것은 막지 못하므로(구조적 타입), 쓰는 신호를 나눠 주는 곳은 composition 한 곳뿐입니다. |
| 구독 | 앱 코드는 `effect`를 직접 쓰지 않고 `신호.subscribe(fn)`을 `Scope`에 넣습니다. 파생 값은 `computed`입니다. | `subscribe`의 콜백 안에서 읽은 신호는 의존으로 잡히지 않습니다. `effect` 안에서 화면을 열거나 상태를 읽으면 그 읽기가 의존이 되어 엉뚱할 때 다시 돕니다. |
| 뷰모델 | `Observable<T>`를 `ReadonlySignal<T>`로 바꿉니다. 입력처럼 양방향인 값은 `Signal<T>`입니다. | WPF의 OneWay·TwoWay 바인딩과 같은 구분입니다. |
| 뷰 | `view(prefab, { 항목: 바인더 })` 표 하나로 씁니다. 바인더가 ref의 종류를 정합니다. | ref 선언과 bind 줄이 한 줄이 됩니다. 프리팹과 어긋나면 지금처럼 열 때 실패합니다. |
| 커맨드 | `Command` 타입을 두지 않습니다. 버튼 바인더가 `enabled`·`visible`을 옵션으로 받습니다. | 로그인 중에는 `enabled`(`canLogin`)가, 느린 요청 중의 탭은 `blockWhileWaiting`이 막고, 그 사이의 커맨드는 줄을 섭니다. 결과를 기다리는 버튼이 생기면(2단계 보상 받기) 다시 봅니다. |
| 전투 | 전투 서비스가 `snapshot`을 신호로 내놓습니다. HUD는 메인 뷰모델이 그 신호로 계산하고, 연출은 `BattleDirector`(`frame(): Direction[]`)가 맡습니다. | 상태와 명령 스트림을 나눕니다. 연출은 바인딩이 아니라 명령이 맞습니다(WPF도 애니메이션은 Storyboard입니다). |
| 전투 월드 뷰 | `unity/views/battle.ts`는 그대로 `unity/`에 둡니다. | 프레임 타이머와 시각(`setInterval`, `Date.now`)을 쓰는 곳이라 presentation에 둘 수 없습니다. |

## 3. 라이브러리 비교와 측정

### 3.1 PuerTS에서 실행 확인

- PuerTS의 V8은 13.6.233.17입니다(`client/Packages/v8/Plugins/macOS/PapiV8.bundle`).
- `@preact/signals-core`의 배포 코드에서 ECMAScript 밖의 것은 `Symbol.dispose`(대입만)와 `Symbol.for`뿐입니다. Node·브라우저 API(`process`, `require`, `window`, 타이머, `queueMicrotask`, `Promise`)는 쓰지 않습니다.
- Unity 에디터에서 프로젝트와 같은 방식(`new ScriptEnv(new BackendV8())`)으로 환경을 따로 만들고, 라이브러리를 넣은 IIFE 번들을 `Eval`로 실행했습니다. 우리가 기대는 동작 10가지가 모두 통과했습니다:
  - `subscribe`가 지금 값으로 한 번, 바뀔 때마다 부르고 같은 값에는 부르지 않는다.
  - `computed`가 값이 바뀔 때만 알린다.
  - 구독 콜백 안에서 읽은 신호는 추적하지 않는다.
  - 구독 콜백에서 다른 신호에 쓸 수 있다(앱 흐름의 `go`).
  - 다시 들어온 쓰기 뒤에는 나중 구독자가 가장 새 값을 본다.
  - `peek`, `batch`.
  - 구독자가 던진 오류가 쓴 쪽으로 가고, `computed`가 던진 오류는 읽은 쪽으로 간 뒤 회복한다.
  - `ReadonlySignal`의 런타임 표시(`Symbol.for`).
  - 구독 1만 개를 해제하면 남는 것이 없다.
- 같은 스크립트가 `Symbol.dispose`가 없는 V8 12.4(Node의 빈 `vm` 컨텍스트)에서도 통과했습니다.
- 확인하지 못한 것: iOS·Android 기기(IL2CPP 빌드)에서의 실행.

### 3.2 측정

실제 화면 모양으로 슬라이스 4개에 바인딩을 걸었습니다(플레이어 값, 네트워크 값, 로그인·흐름 값이 같은 수). 바인딩은 문자열을 계산해 받는 쪽에 넘깁니다(신호는 `computed` + 구독, 스토어는 셀렉터 구독). 측정 PC: Apple M4 Max. 같은 측정 7번의 중앙값입니다.

- **JIT 환경:** 에디터와 Android에 해당합니다. Node v22.14.0(V8 12.4), 그리고 Unity 에디터의 PuerTS(V8 13.6)에서 쟀습니다. PuerTS는 에디터 메인 스레드 제한 때문에 반복을 1/10로 줄였고, 시각이 ms 단위라 거친 값입니다.
- **jitless 환경:** iOS에 해당합니다. iOS는 JIT을 쓸 수 없어 V8이 인터프리터로만 돕니다. 기기 대신 Node를 `--jitless`로 돌린 근삿값이고, 실제 iPhone은 M4 Max보다 느립니다.

바인딩 30개(지금 화면 규모):

| | 플레이어 갱신 | 네트워크 갱신 | 화면 열고 닫기 | 전투 HUD 한 프레임 |
| --- | --- | --- | --- | --- |
| 스토어, Node JIT | 1.19 µs | 1.29 µs | 1.8 µs | 16 ns |
| preact, Node JIT | 0.80 µs | 0.45 µs | 3.2 µs | 78 ns |
| alien, Node JIT | 0.83 µs | 0.39 µs | 2.2 µs | 87 ns |
| 스토어, PuerTS 에디터 | 1.05 µs | 1.15 µs | 2.0 µs | 20 ns |
| preact, PuerTS 에디터 | 0.60 µs | 0.45 µs | 2.5 µs | 80 ns |
| 스토어, jitless | 4.2 µs | 4.5 µs | 7.0 µs | 0.15 µs |
| preact, jitless | 5.0 µs | 7.7 µs | 45 µs | 1.4 µs |
| alien, jitless | 5.2 µs | 6.0 µs | 25 µs | 1.5 µs |

바인딩 300개(화면이 커졌을 때):

| | 플레이어 갱신 | 네트워크 갱신 | 화면 열고 닫기 |
| --- | --- | --- | --- |
| 스토어, Node JIT | 13.5 µs | 13.8 µs | 18.5 µs |
| preact, Node JIT | 8.8 µs | 5.0 µs | 34 µs |
| alien, Node JIT | 8.2 µs | 3.9 µs | 22 µs |
| 스토어, jitless | 39 µs | 42 µs | 65 µs |
| preact, jitless | 48 µs | 76 µs | 437 µs |
| alien, jitless | 49 µs | 58 µs | 241 µs |

번들: 지금 릴리스 번들(`main.mjs`)이 60,839 B이고, 두 라이브러리 모두 약 4.5 KB(gzip 1.7 KB)를 더합니다. 서버 비용은 없습니다(클라이언트에만 들어갑니다). 바인딩이 C#에 값을 쓰는 호출은 어느 쪽이든 값이 바뀔 때만 일어나므로 같습니다.

### 3.3 판단

- JIT 환경에서는 신호가 갱신에서 빠르고, 바인딩이 늘수록 차이가 커집니다. 스토어는 갱신마다 모든 셀렉터를 돌리고, 신호는 바뀐 값에 기대는 것만 돌기 때문입니다. 화면 열기와 HUD는 신호가 조금 느립니다.
- jitless(iOS)에서는 측정한 모든 경우에서 지금 스토어가 빠릅니다. 신호의 그래프 관리가 인터프리터에서 비싸서, 기대는 바인딩만 도는 이점보다 큽니다. 갱신은 1.2–1.8배, 화면 열기는 3.5–6.7배, HUD는 약 10배 느립니다.
- 그래도 절대값은 작습니다. jitless에서 가장 큰 값은 바인딩 300개 화면을 열고 닫을 때 0.44 ms(화면을 열 때 한 번, 프레임 16.7 ms의 2.6%)이고, 갱신은 0.08 ms 이하, 전투 HUD는 프레임당 1.4 µs(0.01%)입니다. 프리팹을 인스턴스로 만드는 비용보다 작습니다.
- 그래서 이 선택은 성능이 아니라 구조로 합니다. 성능만 보면 iOS에서는 지금 스토어가 낫습니다.
- alien-signals는 jitless 화면 열기에서 preact보다 약 1.8배 빠르고 나머지는 비슷합니다. 그래도 아래 이유로 preact를 고릅니다. 화면 열기가 문제가 되면 바꿀 수 있습니다. 쓰는 API가 작아서 바꾸는 범위도 작습니다(8절).

`@preact/signals-core`를 고른 이유:

- `ReadonlySignal<T>` 타입이 있어서 쓰는 쪽과 읽는 쪽을 래퍼 없이 나눕니다. alien-signals는 읽기와 쓰기가 같은 함수(`s()`, `s(v)`)라서 지금의 `Slice`·`ReadonlyStore` 같은 래퍼를 다시 써야 합니다.
- `subscribe(fn)`이 지금 `bindValue`·`follow`와 같은 의미입니다. 지금 값으로 한 번 부르고 바뀔 때마다 다시 부르며, 콜백 안의 읽기는 추적하지 않습니다.
- `peek()`, `untracked()`, `batch()`가 있습니다.
- 둘 다 타이머와 마이크로태스크를 쓰지 않고 동기적으로 돕니다.

## 4. 구조

### 4.1 상태

```ts
// application/state/app-state.ts
export interface AppState {
  readonly flow: ReadonlySignal<AppFlowState>;
  readonly player: ReadonlySignal<PlayerState | null>;
  readonly network: ReadonlySignal<NetworkState>;
  readonly login: ReadonlySignal<LoginState>;
}
/** 쓰기 가능한 앱 상태. composition만 쥐고, 슬라이스마다 쓰는 쪽에 그 신호를 넘깁니다. */
export type WritableAppState = { readonly [K in keyof AppState]: AppState[K] extends ReadonlySignal<infer T> ? Signal<T> : never };
export function createAppState(initial?: Partial<AppStateValues>): WritableAppState;
```

- `AppStateValues`는 지금의 값 모양(`{ flow, player, network, login }`)이고, `initialAppState`는 그 기본값으로 남깁니다. 테스트가 `createAppState({ flow: "main", player })`로 시작합니다.
- 쓰는 쪽은 지금과 같습니다: `flow`는 앱 흐름, `player`는 progress, `network`는 game-server 어댑터, `login`은 account. `slice.update(f)`는 `signal.value = f(signal.value)`가 됩니다. 같은 값을 넣으면 알리지 않는 것도 같습니다.
- 로그인 성공은 지금처럼 `player`와 `login` 두 번의 쓰기이고, 앱 흐름은 첫 쓰기에서 main으로 갑니다. `batch`로 묶지 않습니다.
- `store.ts`, `presentation/observable.ts`를 지웁니다.

### 4.2 구독 규칙

- 값을 따라갈 때: `scope.add(신호.subscribe(value => …))`. 지금의 `store.subscribe(select, …)`는 `computed(() => select(…)).subscribe(…)`입니다.
- 파생 값: `computed(() => …)`. `computed` 안에서는 신호에 쓰지 않습니다.
- 앱 코드(`src/`)는 `effect`를 import하지 않습니다. 경계 검사에 이 규칙을 더합니다(4.7).
- `await` 뒤에는 지금처럼 `.value`로 다시 읽습니다.

### 4.3 뷰모델

```ts
// presentation/view-models/login.ts (요지)
const loginId = signal(account.lastLoginId());
const canLogin = computed(() => isValidLoginId(loginId.value) && state.login.value.pending === null);
const status = computed(() => { /* 지금 status와 같은 규칙 */ });
return { loginId, canLogin, status, login: () => (canLogin.peek() ? account.login(loginId.peek()) : Promise.resolve()) };
```

- `LoginViewModel.loginId`는 `Signal<string>`(양방향)이고, `setLoginId`는 없어집니다.
- `MainViewModel`은 `battle: Pick<BattleViewModel, …>` 대신 `hud: { kills, bossTime, canChallenge }`(각각 `ReadonlySignal`)와 `challenge()`를 직접 가집니다. 계산은 지금 `hudOf`와 같고, 전투 서비스의 `snapshot` 신호에서 합니다. `MainViewModelOptions`에서 `battleModel`이 빠집니다.
- 뷰모델의 인터페이스와 `…Options` 인터페이스는 그대로 둡니다. 뷰가 기대는 계약이고, 테스트가 가짜를 넘기는 자리입니다.

### 4.4 바인딩 표

```ts
// unity/views/main.ts
export const mainView = view<MainViewModel>("UI/MainScreen", {
  titleText: text(vm => vm.title),
  goldText: text(vm => vm.gold),
  stageText: text(vm => vm.stage),
  connectionText: text(vm => vm.connection),
  killsText: text(vm => vm.hud.kills),
  bossTimeText: text(vm => vm.hud.bossTime),
  nextStageButton: button(vm => vm.nextStage()),
  logoutButton: button(vm => vm.logout()),
  bossButton: button(vm => vm.challenge(), { visible: vm => vm.hud.canChallenge }),
});
```

- `unity/binding/view.ts`의 `view<VM>(prefab, bindings): View<VM>`가 표에서 ref 선언을 만들고(`readRefs`가 지금처럼 빠진 항목, 다른 종류, 빈 값을 한꺼번에 보고), 열 때 바인더마다 `bind(scope, target, vm)`를 부릅니다.
- 바인더: `text(get)`(TextTarget), `button(click, { enabled?, visible? })`(ButtonTarget, `click`은 누를 때 `click(vm)`을 부르므로 `vm => vm.logout()`처럼 쓴다), `input(get: vm => Signal<string>)`(InputTarget, 양방향), `active(get)`(ActiveTarget). 모두 Kind.Object 항목을 읽습니다. 바인더는 `bind.ts`의 `bindText` 등을 그대로 씁니다(인자 타입만 `ReadonlySignal`로).
- 전투 월드 뷰는 바인딩이 아니라 대상 객체를 직접 부르므로 지금처럼 `ref.object(...)` + `readRefs`를 씁니다.
- ViewRefs 인스펙터의 "Copy TS"는 그대로 둡니다.

### 4.5 전투

- `BattleService.snapshot()`(함수)을 `snapshot: ReadonlySignal<BattleSnapshot | undefined>`로 바꿉니다. `advance()`가 끝날 때마다 씁니다. 로그인 전이면 `undefined`입니다.
- `presentation/view-models/battle.ts`의 연출 부분(`Direction`, `ActorLook`, `HERO_LOOK`, 이벤트 → 지시 변환)을 `presentation/world/battle-director.ts`의 `createBattleDirector({ battle, data }): BattleDirector`(`frame(): readonly Direction[]`)로 옮깁니다. `challenge`와 HUD는 메인 뷰모델로 갑니다.
- `screens.ts`의 main: 메인 뷰모델과 디렉터를 따로 만들고, 월드 뷰는 `WorldView<BattleDirector>`입니다.
- 전투 진행이 월드 뷰의 프레임에 묶여 있는 것(월드를 못 올리면 HUD도 멈춤)은 지금과 같습니다.

### 4.6 App

- `App.state`는 `AppState`(읽기 전용 신호 묶음)입니다. 쓰기 가능한 신호는 composition 안에만 있습니다.
- `boot.ts`의 흐름 로그는 `app.state.flow.subscribe(...)`입니다. `integration/` 테스트의 `app.state.get().player`는 `app.state.player.value`가 됩니다.

### 4.7 경계 검사

`scripts/check-boundaries.mjs`:

- `@preact/signals-core`는 application, adapters, presentation, composition, unity에서 쓸 수 있습니다. domain(규칙만), host, main은 쓰지 않습니다. 나머지 외부 패키지는 지금처럼 host/만 씁니다.
- 클라이언트 `src/`에서 `@preact/signals-core`의 `effect`를 import하면 위반입니다.

## 5. 바뀌는 파일

- 지움: `application/state/store.ts`, `presentation/observable.ts`, `presentation/view-models/battle.ts`, `test/store.test.ts`, `test/battle-view-model.test.ts`
- 새로: `presentation/world/battle-director.ts`, `unity/binding/view.ts`, `test/battle-director.test.ts`(지금 `battle-view-model.test.ts`의 연출 테스트를 옮기고, HUD 테스트는 메인 뷰모델 테스트로 옮김)
- 고침:
  - application: `state/app-state.ts`, `account/account.ts`, `progress/progress.ts`, `app/app-flow.ts`, `battle/battle.ts`
  - adapters: `net/game-server.ts`
  - presentation: `ui/waiting.ts`, `screens.ts`, `view-models/login.ts`, `view-models/main.ts`
  - `composition.ts`
  - unity: `binding/bind.ts`, `views/login.ts`, `views/main.ts`, `views/battle.ts`(타입 이름), `boot.ts`
  - 테스트: account, battle, flow, game-server, mvvm, progress, screens, unity-world 테스트와 `integration/test/*`
  - `client/TypeScript/package.json`, `package-lock.json`, `scripts/check-boundaries.mjs`
  - 문서: `client/TypeScript/AGENTS.md`(상태와 비동기, 화면), `README.md`(클라이언트 구조, MVVM, 전투), `docs/foundation-backlog.md`(원칙의 "스토어 하나"와 28, 37, 42의 설명)

## 6. 테스트

- 동작 테스트는 지우지 않고 새 API로 옮깁니다. 기대값은 그대로입니다.
- 더하는 테스트:
  - 바인딩 표: 표의 항목이 빠지거나 종류가 다르면 열 때 한꺼번에 보고하고, 바인더마다 값을 넣고 바뀔 때 다시 넣으며, 스코프가 닫히면 구독과 C# 리스너를 놓는다.
  - 바인딩: 값을 적용하는 콜백이 다른 신호를 읽어도, 그 신호가 바뀐다고 다시 적용하지 않는다(4.2 규칙이 기대는 `subscribe`의 성질).
  - 메인 뷰모델: 전투 스냅숏 신호가 바뀌면 HUD 값이 바뀌고, 문자열이 같으면 알리지 않는다.
- `build.test.ts`가 라이브러리를 포함한 실제 번들을 PuerTS처럼 실행합니다.
- Unity 플레이 모드에서 로그인 → 메인, 전투 HUD, 보스 도전 버튼을 확인합니다. Unity에서만 확인되는 부분입니다.

## 7. 범위 밖

- 목록 바인딩(`items`, 셀 재활용): 2단계 인벤토리와 39(가상 스크롤)에서 합니다.
- 화면 레지스트리와 뷰모델이 팝업을 여는 방법: 첫 팝업이 생길 때 합니다.
- `Command`(실행 중 상태를 가진 동작): 결과를 기다리는 버튼이 생길 때 다시 봅니다.
- "Copy TS"가 바인더 줄을 만드는 것.
- 29(이벤트 버스): 신호는 상태용입니다. 보상 연출 같은 일회성 이벤트는 2단계에서 따로 정합니다.

## 8. 위험

- `effect` 안에서 읽은 값이 의존으로 잡히는 사고: 4.2 규칙과 경계 검사로 막습니다.
- 읽기 전용 신호가 쓰기 자리로 넘어가는 것: 타입이 막지 못합니다. 쓰는 신호는 composition에서만 나눠 주고, 양방향 바인더(`input`)에는 뷰모델이 `signal()`로 만든 값만 넣습니다.
- 라이브러리가 바뀌는 것: 버전을 정확히 고정합니다. 쓰는 API는 `signal`, `computed`, `subscribe`, `peek`, `Signal`, `ReadonlySignal`뿐이라 바꿔야 해도 범위가 작습니다.
- PuerTS V8에서의 동작: 에디터 PuerTS에서 라이브러리를 확인했고(3.1), 구현 뒤에는 `build.test.ts`가 번들을 돌리고 Unity 플레이 모드에서 확인합니다. `build.test.ts`는 Node에서 돌기 때문에 PuerTS를 대신하지 못합니다. IL2CPP 기기 확인은 이 작업에서 하지 않습니다.
- iOS(jitless) 비용: 3.2의 측정으로 지금보다 느린 것을 압니다. 화면 열기가 문제가 되면 alien-signals로 바꾸거나, 화면의 바인딩 수를 줄입니다.
