# 클라이언트 신호와 바인딩 표 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 클라이언트 상태와 뷰모델을 `@preact/signals-core` 신호로 옮기고, 전투의 HUD와 연출을 나누고, UI 뷰를 바인딩 표 하나로 쓴다. 동작은 바꾸지 않는다.

**Architecture:** 스토어 하나 대신 슬라이스마다 신호 하나를 두고, 쓰는 쪽에만 `Signal`을 넘긴다. 뷰모델은 `computed`로 값을 만들고 뷰는 `view(prefab, { 항목: 바인더 })`로 그 값을 프리팹에 잇는다. 전투 서비스는 스냅숏을 신호로 내놓아 메인 뷰모델이 HUD를 계산하고, 연출 명령은 `BattleDirector`가 맡는다.

**Tech Stack:** TypeScript(ESM, strict), vitest, `@preact/signals-core` 1.14.4, esbuild, Unity 6000.6 + PuerTS 3.0.3(V8 13.6).

**Spec:** `docs/superpowers/specs/2026-10-14-client-signals-design.md`

## Global Constraints

- 주석과 문서 주석은 한국어, 테스트 이름·오류·로그 메시지·커밋 메시지는 영어(AGENTS.md).
- 커밋하지 않는다. 변경은 작업 트리에 남기고, 커밋은 사용자가 요청할 때 컨트롤러가 한다. `git switch/checkout/merge/stash`를 쓰지 않는다(Unity가 열려 있음). `rm`은 변수 없는 문자 그대로의 경로로만 쓴다.
- `@preact/signals-core`는 정확히 `1.14.4`. 클라이언트 `src/`가 쓰는 것은 `signal`, `computed`, `batch`, `untracked`와 타입 `Signal`, `ReadonlySignal`뿐이다. `effect`는 import하지 않는다.
- 값을 따라갈 때는 `scope.add(신호.subscribe(fn))`. `subscribe`는 지금 값으로 한 번 부르고 바뀔 때마다 다시 부르며, 콜백 안의 읽기는 추적하지 않는다. 파생 값은 `computed`이고, `computed` 안에서는 신호에 쓰지 않는다.
- 쓰기 가능한 앱 상태 신호는 `composition.ts`만 만들고 슬라이스마다 쓰는 쪽 하나에 넘긴다(flow: 앱 흐름, player: progress, network: game-server, login: account). 뷰모델이 자기 입력값(`signal()`)을, 전투 서비스가 자기 스냅숏을 갖는 것은 예외다.
- 같은 구독자 순서나 알림 시점에 기대지 않는다. 쓰고 나서 바로 `.value`를 읽으면 새 값이지만, 구독 콜백 안에서 쓴 값의 구독자는 그 콜백이 끝난 뒤에 불린다.
- 동작은 그대로다. 기존 테스트의 기대값을 바꾸지 않고 API만 옮긴다. 테스트 이름은 옛 API 이름이 들어간 경우만 바꾼다.
- 계층 규칙(`client/TypeScript/AGENTS.md`)은 그대로다. domain은 신호를 쓰지 않는다. 타입만 쓰면 `import type`, 상대 import에는 `.js`.
- 각 작업을 끝내기 전에 루트에서 `npm run typecheck`와 `npm test`를 통과시킨다.

## Review Focus

1. 로그인 성공은 `player`와 `login` 두 신호를 잇달아 쓴다. 이때 앱 흐름이 main에 정확히 한 번 들어가고 메인 화면도 한 번만 열려야 한다(Task 2 flow 테스트).
2. 바뀐 것 없이 다시 계산된 네트워크 상태(느린 요청이 하나 더 생겨도 `waiting`은 그대로)는 구독자를 다시 부르면 안 된다(Task 2 game-server 테스트).
3. 한 번의 쓰기가 화면을 닫는 구독(로그아웃 → 흐름 이동 → 스코프 해제)과 그 화면의 바인딩을 함께 깨울 수 있다. 해제된 바인딩은 그 뒤에 값을 적용하면 안 된다. 순서와 상관없는 불변식으로 검사한다(Task 2 mvvm 테스트).
4. 로그아웃이나 재로그인으로 전투 스냅숏이 사라지면 HUD는 비고 보스 버튼은 숨어야 한다(Task 3 메인 뷰모델 테스트).
5. Unity의 입력란은 코드가 `text`를 바꿔도 `onValueChanged`를 낸다. 뷰모델이 아이디를 바꿨을 때 입력란에 한 번 보이고, 그 이벤트가 되돌아와 다시 쓰거나 끝없이 돌면 안 된다(Task 2 mvvm 테스트).

---

### Task 1: 의존성과 경계 검사

**Files:**
- Modify: `client/TypeScript/package.json`, `package-lock.json`
- Modify: `scripts/check-boundaries.mjs`(규칙과 머리 주석)

**Interfaces:**
- Produces: application, adapters, presentation, composition, unity가 `@preact/signals-core`를 import할 수 있다. domain, host, main은 못 한다. 클라이언트 `src/`의 `import { …effect… } from "@preact/signals-core"`는 위반이다.

- [ ] **Step 1: 설치** — `npm install --save-exact @preact/signals-core@1.14.4 -w @idle/client`. `client/TypeScript/package.json`의 `dependencies`에 `"@preact/signals-core": "1.14.4"`.
- [ ] **Step 2: 위반 견본을 임시로 만든다**
  - `client/TypeScript/src/domain/probe.ts`: `export { signal } from "@preact/signals-core";`
  - `client/TypeScript/src/application/probe.ts`: `import { effect } from "@preact/signals-core"; export const probe = effect;`
  - `client/TypeScript/src/presentation/probe.ts`: `import { computed, signal, type ReadonlySignal } from "@preact/signals-core"; export const probe: ReadonlySignal<number> = computed(() => signal(1).value);`
- [ ] **Step 3: 실패 확인** — `node scripts/check-boundaries.mjs` → 셋 모두 "imports the external package" 위반.
- [ ] **Step 4: 구현** — `layers`의 application, adapters, presentation, composition, unity에 `external: ["@preact/signals-core"]`를 두고, 외부 패키지 분기에서 `rule.external`에 있으면 허용한다. 클라이언트 파일의 `import … from "@preact/signals-core"`에서 이름 목록(`{ … }`, `type` 접두 포함)에 `effect`가 있으면 `` `${name} imports effect from @preact/signals-core; follow a value with subscribe() in a Scope` ``를 위반으로 더한다. 머리 주석의 "외부 npm 패키지는 host/만 쓰고" 문장을 "신호 라이브러리(@preact/signals-core)는 domain 밖의 계층이 쓰고(effect는 쓰지 않는다), 나머지 외부 npm 패키지는 host/만 쓴다"로 고친다.
- [ ] **Step 5: 확인** — 다시 실행 → `domain/probe.ts`(외부 패키지)와 `application/probe.ts`(effect)만 보고되고 presentation은 통과.
- [ ] **Step 6: 견본 삭제** — `rm client/TypeScript/src/domain/probe.ts client/TypeScript/src/application/probe.ts client/TypeScript/src/presentation/probe.ts`
- [ ] **Step 7: 확인** — `npm run typecheck`, `npm test` → PASS.

### Task 2: 상태와 뷰모델을 신호로

**Files:**
- Modify: `client/TypeScript/src/application/state/app-state.ts`; Delete: `client/TypeScript/src/application/state/store.ts`
- Modify: `application/account/account.ts`, `application/progress/progress.ts`, `application/app/app-flow.ts`, `application/battle/battle.ts`(상태 읽기만), `adapters/net/game-server.ts`, `presentation/ui/waiting.ts`, `composition.ts`, `unity/boot.ts`
- Delete: `presentation/observable.ts`; Modify: `presentation/view-models/login.ts`, `presentation/view-models/main.ts`, `presentation/view-models/battle.ts`(HUD 내부만), `presentation/screens.ts`(타입), `unity/binding/bind.ts`, `unity/views/login.ts`
- Delete: `client/TypeScript/test/store.test.ts`; Modify: `test/account.test.ts`, `test/battle.test.ts`, `test/flow.test.ts`, `test/game-server.test.ts`, `test/progress.test.ts`, `test/mvvm.test.ts`, `test/screens.test.ts`, `test/battle-view-model.test.ts`
- Modify: `integration/test/battle.test.ts`, `integration/test/client-server.test.ts`, `integration/test/login.test.ts`, `integration/test/reconnect.test.ts`
(경로는 따로 적지 않으면 `client/TypeScript/src/` 아래)

**Interfaces:**
- Produces:
  ```ts
  // application/state/app-state.ts
  export interface AppStateValues { flow; player; network; login }   // 지금 AppState의 값 모양 그대로
  export const initialAppState: AppStateValues;
  export interface AppState {
    readonly flow: ReadonlySignal<AppFlowState>;
    readonly player: ReadonlySignal<PlayerState | null>;
    readonly network: ReadonlySignal<NetworkState>;
    readonly login: ReadonlySignal<LoginState>;
  }
  export type WritableAppState = { readonly [K in keyof AppStateValues]: Signal<AppStateValues[K]> };
  export function createAppState(initial?: Partial<AppStateValues>): WritableAppState;
  ```
  - 쓰는 쪽: `AccountOptions.login: Signal<LoginState>`, `ProgressOptions.player: Signal<PlayerState | null>`, game-server 옵션 `network: Signal<NetworkState>`, `AppFlowOptions.flow: Signal<AppFlowState>`.
  - 읽는 쪽: `AppFlowOptions.state`, `BattleOptions.state`, `LoginViewModelOptions.state`, `MainViewModelOptions.state`, `ScreensOptions.state`, `App.state`의 타입이 `AppState`. `blockWhileWaiting(state: AppState, block)`.
  - `LoginViewModel { readonly loginId: Signal<string>; readonly canLogin: ReadonlySignal<boolean>; readonly status: ReadonlySignal<string>; login(): Promise<void> }`. `setLoginId`는 없어진다.
  - `MainViewModel`·`BattleHud`의 `Observable<T>` 필드는 `ReadonlySignal<T>`.
  - `bind.ts`: `bindValue<T>(scope, source: ReadonlySignal<T>, apply)`, `bindText(…, source: ReadonlySignal<string>)`, `bindActive`·`bindInteractable(…, source: ReadonlySignal<boolean>)`, `bindInput(scope, target: InputTarget, source: Signal<string>)`(입력은 `source.value = text`).

옮기는 규칙(소스와 테스트 공통):

| 지금 | 바꾼 뒤 |
| --- | --- |
| `createStore(initialAppState)`, `createStore({ ...initialAppState, ...x })` | `createAppState()`, `createAppState(x)` |
| `sliceOf(store, "player")` | `state.player` |
| `store.get().player`, `slice.get()` | `state.player.value`, `signal.value` |
| `slice.update(f)` | `signal.value = f(signal.value)` (같은 객체를 돌려주면 알리지 않는 것은 같다) |
| `store.update(s => ({ ...s, a, b }))`(테스트) | 바뀌는 슬라이스마다 `state.a.value = a` |
| `store.subscribe(select, listener)` | `computed(() => select(state)).subscribe(listener)` — 지금 값으로 바로 한 번 불린다 |
| 다른 용도의 `createStore(v)` + `select(s, f)`(뷰모델 내부, 테스트의 가짜) | `signal(v)` + `computed(() => f(s.value))` |
| `observable.get()`(테스트) | `.value` |

- [ ] **Step 1: 테스트를 새 API로 옮긴다** — 위 규칙대로 테스트 파일과 `integration/test/*`를 고친다(`setLoginId(x)` → `loginId.value = x`, `loginId.get()` → `loginId.value`, `app.state.get().x` → `app.state.x.value`). `store.test.ts`를 지운다: `rm client/TypeScript/test/store.test.ts`.
- [ ] **Step 2: Review Focus 테스트를 더한다**
  - `flow.test.ts` — `test("a login that writes the save and then the login slice enters main once")`: login 상태에서 `state.player.value = save; state.login.value = { pending: null, failed: null }` → `at()`이 `"main"`이고 `shown`에 main이 한 번만 있다.
  - `game-server.test.ts` — `test("a second slow request or the first answer does not repeat an unchanged waiting state")`: `network`를 `computed(() => state.network.value.waiting).subscribe(v => seen.push(v))`로 따라가며 느린 요청 둘을 보내고(지금 "shows waiting only for requests slower than half a second" 테스트의 방식) 0.5초를 넘긴 뒤 첫 응답, 둘째 응답을 준다 → `seen`이 `[false, true, false]`.
  - `mvvm.test.ts` — `test("a binding closed by an earlier listener of the same change does not apply after closing")`: `const s = signal(0)`, 화면 스코프 `screen`에 `bindText(screen, target, computed(() => String(s.value)))`, 다른 스코프에서 `s.subscribe(v => { if (v === 1) { log.push("close"); screen.dispose(); } })`; `bindText`의 대상은 `text` setter가 `log.push("apply " + text)`. `s.value = 1` 뒤 `log`에서 `"close"` 다음에 `"apply …"`가 없다. 이어서 `s.value = 2`에도 없다.
  - `mvvm.test.ts` — `test("a binding's apply that reads another signal is not re-run when that signal changes")`: `bindValue(scope, a, v => { applied.push(v); void b.value; })`, `b.value = 1` → `applied`가 `[a의 처음 값]` 그대로.
  - `mvvm.test.ts`(로그인 화면) — `test("a login ID set from code appears in the field once and does not echo back")`: 가짜 입력란의 `text` setter가 Unity처럼 `onValueChanged`를 낸다. `vm.loginId.value = "abc"` → `idInput.text === "abc"`, 이벤트가 한 번, `vm.loginId.value === "abc"`, 바인딩의 적용이 한 번.
- [ ] **Step 3: 실패 확인** — `npm run typecheck -w @idle/client` → 새 API가 없어 FAIL.
- [ ] **Step 4: 상태 구현** — `app-state.ts`에 위 Interfaces를 만들고 `store.ts`를 지운다(`rm client/TypeScript/src/application/state/store.ts`). 쓰는 쪽 넷과 읽는 쪽을 규칙대로 옮긴다:
  - `app-flow.ts`: `follow`는 `scope.add(computed(() => select(state)).subscribe(act))` 한 줄이 된다(`subscribe`가 바로 부르므로 따로 `act(...)`를 부르지 않는다). `entered`는 `flow.value = entered`.
  - `game-server.ts`의 `publish`는 같으면 지금 객체를 그대로 두는 비교를 유지한다.
  - `waiting.ts`: `computed(() => state.network.value.waiting).subscribe(…)`. 처음 `false` 호출은 아무것도 하지 않는다.
  - `composition.ts`: `const state = createAppState();` 쓰는 쪽에 `state.network` 등을, 나머지와 `App.state`에는 `state`를 `AppState`로 넘긴다.
  - `boot.ts`: 처음 상태를 따로 찍는 줄을 지우고 `app.state.flow.subscribe(flow => console.log(`[flow] ${flow}`))`만 둔다(`subscribe`가 처음 값도 찍는다). `build.test.ts`의 기대 출력은 그대로다.
- [ ] **Step 5: 뷰모델·바인딩 구현** — `observable.ts`를 지운다(`rm client/TypeScript/src/presentation/observable.ts`).
  - 로그인 뷰모델: `loginId = signal(account.lastLoginId())`, `canLogin`·`status`는 `computed`(문구 규칙은 지금 그대로), `login`은 `canLogin.peek()`이 거짓이면 `Promise.resolve()`. `follow()`는 없어진다.
  - 메인 뷰모델: 각 값은 `computed(() => …state.player.value…)`.
  - 전투 뷰모델: 비공개 스토어를 `signal(NO_HUD)`로, 같은지 비교는 그대로, HUD 필드는 `computed(() => hud.value.kills)` 등. 모양은 Task 3이 바꾼다.
  - `bind.ts`: `bindValue`는 `scope.add(source.subscribe(apply))`. `bindInput`은 다른 곳에서 바뀐 값을 `target.text !== text`일 때만 쓰고, 입력은 `source.value = text`.
  - `views/login.ts`: `bindInput(scope, view.idInput, vm.loginId)`.
- [ ] **Step 6: 확인** — `npm run typecheck`, `npm test` → PASS(클라이언트, integration, `build.test.ts` 포함). `grep -rnE "sliceOf|ReadonlyStore|createStore|Observable|setLoginId" client/TypeScript/src client/TypeScript/test integration/test`가 아무것도 찾지 않는다.

### Task 3: 전투 — 스냅숏 신호, BattleDirector, 메인 HUD

**Files:**
- Modify: `client/TypeScript/src/application/battle/battle.ts`
- Create: `client/TypeScript/src/presentation/world/battle-director.ts`; Delete: `client/TypeScript/src/presentation/view-models/battle.ts`
- Modify: `presentation/view-models/main.ts`, `presentation/screens.ts`, `unity/views/battle.ts`(import와 타입), `unity/views/main.ts`(`vm.hud`, `vm.challenge`)
- Create: `client/TypeScript/test/battle-director.test.ts`; Delete: `client/TypeScript/test/battle-view-model.test.ts`
- Modify: `test/battle.test.ts`, `test/mvvm.test.ts`(메인 화면), `test/screens.test.ts`, `test/unity-world.test.ts`(타입)

**Interfaces:**
- Consumes: Task 2의 `AppState`, `bind.ts`.
- Produces:
  - `BattleService { advance(): readonly ShownEvent[]; readonly snapshot: ReadonlySignal<BattleSnapshot | undefined>; bossChallenge(): void; selectStage(stageId: number): void }`. `advance()`는 어느 길로 끝나든 마지막에 `snapshot.value = shown?.battle.snapshot()`을 쓴다.
  - `presentation/world/battle-director.ts`: `ActorLook`, `Direction`, `HERO_LOOK`(지금 그대로 옮김), `interface BattleDirector { frame(): readonly Direction[] }`, `interface BattleDirectorOptions { readonly battle: Pick<BattleService, "advance" | "snapshot">; readonly data: GameData }`, `createBattleDirector(options): BattleDirector`. `frame()`은 `advance()` 뒤 `battle.snapshot.value`로 지시를 만든다.
  - `presentation/view-models/main.ts`: `BattleHud { kills; bossTime; canChallenge }`(각 `ReadonlySignal`)를 여기로 옮긴다. `MainViewModel`은 `battle` 대신 `readonly hud: BattleHud`와 `challenge(): void`. `MainViewModelOptions.battle: Pick<BattleService, "selectStage" | "bossChallenge" | "snapshot">`, `battleModel`은 없어진다. HUD는 `const hud = computed(() => hudOf(battle.snapshot.value))`와 필드마다 `computed(() => hud.value.kills)` 등(`hudOf` 규칙은 그대로).
  - `Views.battle: WorldView<BattleDirector>`. `createScreens`의 main은 메인 뷰모델과 `createBattleDirector({ battle, data })`를 따로 만들어 각각 연결한다.

- [ ] **Step 1: 테스트 작성**
  - `battle-director.test.ts`: 지금 `battle-view-model.test.ts`의 지시 테스트 7개(색, 공격, 쓰러뜨린 타격, 죽음·배너, 보스 시작 뒤 일어섬, reset, 전투 전 빈 프레임의 지시 부분)를 이름과 기대값 그대로 옮긴다. 가짜 전투는 `{ advance: () => events, snapshot: signal(first) }`이고 프레임마다 `snapshot.value`를 바꾼다.
  - `mvvm.test.ts`의 메인 화면: 가짜 전투에 `snapshot = signal<BattleSnapshot | undefined>(…)`를 두고, 지금 전투 뷰모델 테스트의 HUD 테스트 5개("before there is a battle … the HUD is empty"의 HUD 부분, "the HUD shows the kill count …", "the boss challenge is offered …", "after a reset out of a boss fight …", "challenging asks the battle for the boss")를 메인 뷰모델 대상으로 옮긴다. 더한다:
    - `test("when the battle snapshot goes away the HUD empties and the boss button hides")`: 보스 버튼이 보이는 스냅숏 → `snapshot.value = undefined` → `[kills, bossTime, canChallenge]`가 `["", "", false]`이고 프리팹의 `bossButton.gameObject.active === false`.
    - `test("a new snapshot with the same HUD text does not notify")`: `kills`를 구독하고 같은 처치 수의 새 스냅숏 객체를 두 번 쓴다 → 구독 호출이 처음 한 번뿐.
  - `battle.test.ts`: `test("the snapshot signal follows the frames and empties without a save")` — 저장이 있으면 `advance()` 뒤 `snapshot.value?.kills`가 진행을 따르고, `player`를 `null`로 쓰고 `advance()`하면 `undefined`.
  - `screens.test.ts`: "the main screen and the battle view share one battle view model …"를 `test("the main state binds a battle director to the world and gives the main screen the battle's HUD")`로 바꾼다 — `views.battle.bind`가 `(scope, world, director)`로 한 번 불리고 `director.frame`이 함수, 메인 뷰모델에 `hud.kills`와 `challenge`가 있고, 다음 main은 다른 디렉터를 받는다.
  - `unity-world.test.ts`: `BattleViewModel` 가짜를 `BattleDirector`(`{ frame }`)로.
- [ ] **Step 2: 실패 확인** — `npm run typecheck -w @idle/client` → FAIL(`battle-director.js` 없음).
- [ ] **Step 3: 구현** — 위 Interfaces대로. `view-models/battle.ts`의 연출 코드를 `world/battle-director.ts`로 옮기고(`rm client/TypeScript/src/presentation/view-models/battle.ts`), HUD(`hudOf`, `NO_HUD`, `formatTimer` 사용)는 `main.ts`로 옮긴다. `unity/views/main.ts`는 `vm.hud.kills` 등과 `vm.challenge()`를 쓴다. `rm client/TypeScript/test/battle-view-model.test.ts`.
- [ ] **Step 4: 확인** — `npm run typecheck`, `npm test` → PASS. `grep -rnE "BattleViewModel|view-models/battle|battleModel" client/TypeScript/src client/TypeScript/test integration/test`이 아무것도 찾지 않는다.

### Task 4: 바인딩 표

**Files:**
- Create: `client/TypeScript/src/unity/binding/view.ts`
- Modify: `client/TypeScript/src/unity/views/login.ts`, `client/TypeScript/src/unity/views/main.ts`
- Test: `client/TypeScript/test/mvvm.test.ts`(새 `describe("binding table")`)

**Interfaces:**
- Consumes: `bind.ts`의 `bindText`, `bindClick`, `bindInteractable`, `bindActive`, `bindInput`; `refs.ts`의 `Kind`, `readRefs`, `viewRefs`; `View<VM>`(`presentation/ui/ui-stack.ts`).
- Produces:
  ```ts
  export interface Binder<VM> {
    /** 이 바인더가 읽는 ViewRefs 항목의 종류. */
    readonly kind: Kind;
    bind(scope: Scope, target: unknown, vm: VM): void;
  }
  export function view<VM>(prefab: string, bindings: Readonly<Record<string, Binder<VM>>>): View<VM>;
  export function text<VM>(get: (vm: VM) => ReadonlySignal<string>): Binder<VM>;
  export function button<VM>(click: (vm: VM) => unknown, options?: {
    readonly enabled?: (vm: VM) => ReadonlySignal<boolean>;
    readonly visible?: (vm: VM) => ReadonlySignal<boolean>;
  }): Binder<VM>;
  export function input<VM>(get: (vm: VM) => Signal<string>): Binder<VM>;
  export function active<VM>(get: (vm: VM) => ReadonlySignal<boolean>): Binder<VM>;
  ```
  - 바인더는 모두 `Kind.Object` 항목을 읽는다. `button`은 누를 때마다 `click(vm)`을 부르고(돌려준 Promise는 버린다), `visible`은 `target.gameObject`에 건다.
  - `view`는 표에서 `{ 이름: { kind } }` 선언을 만들어 열 때 `readRefs(viewRefs(root), 선언)`으로 한 번에 읽고(빠진 항목·다른 종류·빈 값을 한꺼번에 보고하는 것은 그대로), 이름마다 `bind(scope, refs[name], vm)`를 부른다.
  - `view<MainViewModel>(…, { goldText: text(vm => vm.gold) })`에서 `vm`의 타입은 표의 타입에서 추론된다(확인함). 숫자 신호를 `text`에 넣거나 없는 속성을 쓰면 타입 오류다.

- [ ] **Step 1: 테스트 작성** — `describe("binding table")`, 가짜는 이 파일의 `fakeRefs`·`fakeEvent`를 쓴다:
  - `test("a table reads its entries when the view opens and reports every mismatch at once")`: `a`가 없고 `b`가 List인 프리팹 → `bind`가 `"ViewRefs: a is missing; b is List, not Object."`로 throw.
  - `test("text, active and input bindings apply now, follow changes and stop when the scope closes")`: 처음 값이 들어가고, 신호를 바꾸면 따라가고, 입력 이벤트는 `Signal`에 쓰고, `scope.dispose()` 뒤에는 값이 바뀌어도 그대로이며 입력 이벤트의 리스너가 비어 있다.
  - `test("a button calls its action on click and follows its enabled and visible options")`: 클릭이 `click(vm)`을 부르고, `enabled`·`visible` 신호를 바꾸면 `interactable`·`gameObject.active`가 따라가며, 닫힌 뒤 클릭 리스너가 비어 있다.
  - 로그인·메인 화면의 기존 테스트는 그대로 통과해야 한다(뷰는 `loginView`·`mainView`를 통해 바인딩된다).
- [ ] **Step 2: 실패 확인** — `npm test -w @idle/client` → FAIL(`view.js` 없음).
- [ ] **Step 3: 구현** — `view.ts`. 두 뷰를 표로 바꾼다:
  ```ts
  export const loginView = view<LoginViewModel>("UI/LoginScreen", {
    idInput: input(vm => vm.loginId),
    loginButton: button(vm => vm.login(), { enabled: vm => vm.canLogin }),
    statusText: text(vm => vm.status),
  });
  ```
  `mainView`는 스펙 4.4의 표 그대로다. 두 파일의 `refs` 선언과 "Copy TS가 이것을 쓴다" 주석은 없어진다(전투 월드 뷰는 그대로 `ref.object` + `readRefs`).
- [ ] **Step 4: 확인** — `npm run typecheck`, `npm test` → PASS.

### Task 5: 문서와 Unity 확인

**Files:**
- Modify: `client/TypeScript/AGENTS.md`(App, 상태와 비동기, 화면, 테스트 절), `README.md`(클라이언트 구조 트리, App 예시, 슬라이스 소유, MVVM 표와 설명, 전투 월드·전투 뷰모델 항목), `docs/foundation-backlog.md`(원칙의 "스토어 하나", 28, 37, 42의 설명), `docs/superpowers/specs/2026-10-14-client-signals-design.md`(상태: 구현됨)

- [ ] **Step 1: 문서 고침** — 스펙의 결정을 반영한다:
  - 상태는 슬라이스마다 신호이고 쓰는 쪽만 `Signal`을 받는다.
  - 값은 `subscribe` + `Scope`로 따라가고 `effect`는 쓰지 않는다(경계 검사).
  - 뷰모델 값은 `ReadonlySignal`이고 입력은 `Signal`이다.
  - UI 뷰는 `view()` 표로 쓴다.
  - HUD는 메인 뷰모델이 스냅숏 신호로 계산하고, 연출은 `BattleDirector`가 맡는다.
  - README의 App 예시: `app.state.player.subscribe(render)`.
- [ ] **Step 2: 낡은 이름 검사** — `grep -rnE "sliceOf|ReadonlyStore|createStore|Observable|store\.ts|observable\.ts|BattleViewModel|view-models/battle|setLoginId" README.md AGENTS.md client/AGENTS.md client/TypeScript/AGENTS.md client/TypeScript/src docs/foundation-backlog.md integration`이 아무것도 찾지 않는다(`docs/superpowers/` 아래의 지난 스펙·계획은 기록이므로 그대로 둔다).
- [ ] **Step 3: 확인** — `npm run typecheck`, `npm test` → PASS.
- [ ] **Step 4: Unity 플레이 모드(컨트롤러)** — `npm run build:dev -w @idle/client`, 서버 실행, `01_Init` 씬에서 플레이 모드에 들어가 테스트 계정으로 로그인한다. 다음을 확인하고 Console에 오류가 없는지 본다:
  - 로그인 화면: 아이디 입력, 버튼의 활성·비활성, 상태 문구.
  - 메인 화면: 제목, 골드, 스테이지, 처치 수 HUD가 바뀌는 것, 보스 도전 버튼.
  - 전투 월드가 그려지는 것.
  - 로그아웃 뒤 로그인 화면으로 돌아오는 것.

  세로 화면과 기기(IL2CPP)는 확인하지 않는다고 보고에 적는다.
