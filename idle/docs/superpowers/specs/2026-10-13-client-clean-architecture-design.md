# 클라이언트 DDD·클린 아키텍처 재구성 설계

- 날짜: 2026-10-13
- 범위: `shared/`(타입 위치와 의존 방향), `client/TypeScript`, `client/Assets/Scripts`, `integration/`, 서버의 import
- 상태: 검토 대기

## 1. 목적

클라이언트의 C#과 TypeScript를 DDD와 클린 아키텍처 원칙에 맞게 다시 짭니다. 리뷰어가 폴더와 의존 규칙만 보고 층과 컨텍스트를 알아볼 수 있어야 하고, M2 기능(전투, 오프라인 보상, 스탯, 인벤토리)이 정해진 자리에 붙어야 합니다. 기존 구조와 이름은 지키지 않아도 됩니다.

성공 기준:

- 모든 층의 의존이 안쪽을 향하고, `scripts/check-boundaries.mjs`와 C# asmdef가 그것을 막습니다.
- 도메인이 전송 계약(`@idle/protocol`)에 의존하지 않습니다.
- 클라이언트 application과 presentation이 와이어 형식과 Unity를 모릅니다.
- 전역 서비스 로케이터(`nm`)가 없고, 의존은 인자로 보입니다.
- 와이어 바이트, 저장 형식, 서버 동작이 그대로입니다.
- 화면 동작(로그인, 자동 로그인, 스테이지 변경, 재연결, 로그아웃)이 지금과 같습니다.

## 2. 정해진 것

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| C#의 역할 | 엔진 드라이버로 유지합니다. 게임 로직과 상태는 TS에만 둡니다. | 재시작(새 ScriptEnv)과 서버와의 규칙 공유가 그대로 유지됩니다. |
| 도메인 모델 형태 | 불변 상태 + 순수 함수(함수형 DDD)를 유지합니다. `PlayerState`가 애그리거트이고 `game-core`의 핸들러가 그 행위입니다. | 측정(Node, 커맨드 1건): 일반 객체 1.083 µs, 엔티티 클래스 변환 1.095 µs로 차이가 인코딩에 묻힙니다. 클래스는 같은 개념을 두 번 정의하게 만들고, 슬라이스 참조 비교와 예측 되돌리기를 깹니다. |
| TS 폴더 구성 | 층을 먼저 나누고 그 안에 컨텍스트를 둡니다. | 의존 규칙을 최상위 폴더로 검사할 수 있고, 지금 크기(약 1,800줄)에서 폴더가 잘게 쪼개지지 않습니다. |
| `nm` | 없앱니다. `startApp`이 컨텍스트별로 묶은 `App`을 돌려주고, 필요한 곳에 넘깁니다. | 서비스 로케이터는 의존을 숨기고, 유스케이스를 건너뛰는 길(`nm.net.req`, `nm.unity`)을 엽니다. |
| 번호 목록 | `Opcode`와 `GameErrorCode`는 각각 한 목록으로 두고, 의존이 없는 새 패키지 `@idle/codes`로 옮깁니다. | 도메인이 전송 패키지에 의존하지 않으면서 번호를 한곳에서 관리합니다. |
| VContainer, UniTask, NuGetForUnity | 설치된 채로 두고 이 설계에서는 쓰지 않습니다. | C#에 조립할 객체 그래프가 없고, 비동기는 TS가 매 프레임 가져가는 방식입니다. |

### 일부러 남기는 것

- `@idle/protocol`의 봉투와 `ResultCode`는 클라이언트 adapters에서만 해석합니다. application과 서버 사이에 별도 DTO를 만들지 않고, 도메인 타입(`Command`, `PlayerState`, `GameError`)은 와이어와 같은 정의를 씁니다. 공유 커널이므로 매핑 계층이 없습니다.
- 스토어는 하나입니다. 대신 쓰기는 소유 컨텍스트만 합니다(4.3).
- Facade가 static인 것은 PuerTS가 static 멤버를 부르는 방식 때문입니다. 수명은 Runtime이 관리합니다(6).
- 서버 내부 구조는 이번 범위가 아닙니다. 서버는 import만 고칩니다.
- 메인 뷰모델의 "다음 스테이지"는 스테이지 ID 순서로 고릅니다. 스테이지 순서는 도메인 지식이지만, 아직 진행 규칙이 없는 임시 버튼이라 그대로 둡니다. 스테이지 진행(M2)을 만들 때 `game-core`로 옮깁니다.

## 3. shared: 도메인 타입의 위치

### 3.1 지금의 위배

`game-core`(도메인)가 `PlayerState`, `Command`, `GameErrorCode`, `Opcode`를 쓰려고 `protocol`에 의존합니다. `protocol`에는 봉투, 코덱, 소켓 경로, close 코드 같은 전송 계약이 함께 있으므로, 엔티티가 바깥 층에 의존하는 클린 아키텍처 위배이고 도메인 언어를 전송 쪽이 정의하는 DDD 위배입니다.

### 3.2 바뀐 뒤

```
codes        (의존 없음)       Opcode, GameErrorCode
big-number   (의존 없음)
data-schema  (의존 없음)
game-core  → codes, big-number, data-schema
protocol   → codes, big-number, game-core
```

| 항목 | 지금 | 바뀐 뒤 |
| --- | --- | --- |
| `Opcode` (한 목록) | protocol | codes |
| `GameErrorCode` (한 목록) | protocol | codes |
| `PlayerState`, `ProfileState`, `CurrencyState`, `StageState` | protocol | game-core |
| `Command`, `CommandOf`, `CommandOpcode` | protocol | game-core |
| `GameError` | protocol | game-core |
| `LOGIN_ID_PATTERN`, `isValidLoginId` | protocol | game-core (클라이언트와 서버가 함께 적용하는 계정 규칙) |
| `PlayerSnapshot`, `StateSync` | protocol | game-core (revision은 저장 애그리거트의 버전) |
| `Apis`, `RequestOf`, `ResponseOf`, `LoginResult`, `Session`, `SystemOpcode` | protocol | protocol |
| 봉투, `ResultCode`, `FailureCode`, `MAX_UNANSWERED_COMMANDS`, `PROTOCOL_VERSION`, `CloseCode`, `SOCKET_PATH`, 코덱 | protocol | protocol |

- `protocol`은 도메인 타입을 다시 내보내지 않습니다. 같은 것을 두 경로로 가져오지 않도록, 도메인 타입은 `game-core`에서, 번호는 `codes`에서, 전송 계약은 `protocol`에서 가져옵니다.
- `codes`는 숫자 목록만 둡니다. `ResultCode`와 `CloseCode`는 도메인이 쓰지 않는 전송 개념이라 `protocol`에 남습니다.
- `codes`의 테스트가 각 enum의 값이 겹치지 않는지 확인합니다.

### 3.3 와이어가 그대로임을 확인하는 방법

바뀌는 것은 타입의 위치뿐이고 enum 값은 같으므로 MessagePack 바이트가 같습니다. 이 단계를 시작할 때 지금 커밋에서 opcode마다 요청과 응답(Ok, Ok + sync, Rejected, ServerError)을 `Big` 값이 든 저장과 함께 인코딩해 16진 문자열로 `shared/protocol/test/wire.test.ts`에 고정하고, 옮긴 뒤 같은 바이트가 나오는지 검사합니다. 따라서 `PROTOCOL_VERSION`은 1 그대로이고, 저장 마이그레이션이 필요 없으며, 서버 비용이 바뀌지 않습니다.

## 4. client/TypeScript

### 4.1 층과 컨텍스트

```
src/
  domain/                        클라이언트에만 있는 순수 규칙
    progress/prediction.ts         predict, confirm
  application/                   유스케이스, 상태, 포트
    ports.ts                       GameServer, Clock, DeviceStorage, AppRuntime, Logger
    scope.ts                       수명 (화면, 구독, 타이머)
    state/                         store.ts (Store, ReadonlyStore, Slice), app-state.ts
    app/                           flow.ts (범용 상태 기계), app-flow.ts (Screens 포트)
    account/account.ts             login, logout, lastLoginId
    progress/progress.ts           커맨드 대기열과 전송, cmd.X
  adapters/                      application 포트 구현 (엔진 무관)
    net/game-server.ts             GameServer 구현 (WebSocket 연결, 재연결, 재개, Ping, 봉투 해석)
    net/server-clock.ts            Clock 구현 (+ observe)
    net/ports.ts                   SocketBridge 포트
  presentation/                  화면 (엔진 무관)
    observable.ts                  Observable, select
    ui/                            ui-stack.ts, resources.ts, waiting.ts, ports.ts
    format/                        big.ts, time.ts
    view-models/                   login.ts, main.ts
    screens.ts                     Screens 구현
  composition.ts                 조립: Bridge, FileBridge, ClientConfig, App, startApp
  unity/                         엔진 드라이버
    bridge.ts, socket.ts, resources.ts, ui.ts, frame.ts
    binding/                       bind.ts, components.ts, refs.ts
    views/                         login.ts, main.ts, index.ts
    boot.ts
  host/                          PuerTS에 없는 전역
  main.ts
```

컨텍스트:

- **account**: 로그인 ID, 로그인과 로그아웃, 이 기기에 저장된 마지막 ID.
- **progress**: 플레이어 저장(`PlayerState` 애그리거트)과 그것을 바꾸는 커맨드, 예측과 서버 확인.
- **connection**: 서버와의 연결 상태(`network`). 구현은 adapters에 있습니다.
- **app**: 앱 흐름(boot → update → login → main).

게임 규칙 자체는 공유 커널 `@idle/game-core`에 있고, `domain/`에는 클라이언트에만 있는 규칙(예측)만 둡니다.

### 4.2 의존 규칙

| 위치 | import할 수 있는 것 |
| --- | --- |
| `domain/` | `domain/`, `@idle/game-core`, `@idle/codes`, `@idle/big-number`, `@idle/data-schema` |
| `application/` | 위 + `application/` |
| `adapters/` | 위 + `adapters/`, `@idle/protocol` |
| `presentation/` | `domain/`, `application/`, `presentation/`, 공용 패키지(`@idle/protocol` 제외) |
| `composition.ts` | `unity/`와 `host/`를 뺀 전부 |
| `unity/` | `domain/`, `application/`, `adapters/`, `presentation/`, `composition.ts`, `unity/`, `csharp`, `puerts`, 공용 패키지(`@idle/protocol` 제외) |
| `host/` | `host/`와 외부 패키지(`fast-text-encoding`)만 |
| `main.ts` | `host/`, `unity/` |

- `adapters/`와 `presentation/`은 서로 import하지 않습니다.
- `unity/`는 가장 바깥 고리라 안쪽 포트를 모두 구현합니다. 예를 들어 `unity/socket.ts`는 `adapters/net/ports.ts`의 `SocketBridge`를 구현합니다.
- `csharp`, `puerts`, `CS`는 `unity/`에서만 씁니다.
- `domain/`, `application/`, `presentation/`은 호스트 API(`console`, `Date.now`, `setTimeout`·`setInterval`·`clearTimeout`, `Math.random`)를 쓰지 않습니다. 시각은 `Clock`, 로그는 `Logger`로 받습니다. 지금 이것들을 쓰는 곳은 연결 어댑터(타이머, `Date.now`, 재연결 지터의 `Math.random`)와 뷰모델의 `console.warn`뿐입니다.
- `globalThis`에 서비스를 두지 않습니다(`nm` 없음).

`check-boundaries.mjs`가 이 표를 그대로 검사합니다.

### 4.3 지금 코드의 위배와 수정

**B. 전역 `nm` (서비스 로케이터)**
`nm`과 `unity/nm.ts`, `net/by-name.ts`의 `createRequests`를 없앱니다. `startApp`이 `App`을 돌려줍니다.

```ts
export interface App {
  readonly data: GameData;
  readonly state: ReadonlyStore<AppState>;
  readonly clock: Clock;
  readonly account: Account;                       // login, logout, lastLoginId
  readonly progress: Pick<Progress, "send" | "cmd">;
  readonly ui: UiStack;                            // open, show, block
  readonly resources: Resources;
  start(): void;                                   // 앱 흐름을 시작
}
```

`cmd.StageSelect({ stageId })`는 `Opcode`에서 커맨드 번호만 골라 생성합니다(지금의 `createCommands`). 시스템 API를 부르는 일은 유스케이스와 adapters만 합니다.

**C. 컨텍스트끼리 스토어에 직접 씀**
스토어는 하나이고, 슬라이스마다 소유자 하나만 씁니다.

| 슬라이스 | 소유자 | 쓰는 방법 |
| --- | --- | --- |
| `flow` | app (`app-flow.ts`) | `Slice<AppFlowState>` |
| `player` | progress | `Slice<PlayerState \| null>` |
| `network` | connection (`adapters/net/game-server.ts`) | `Slice<NetworkState>` |
| `login` | account | `Slice<LoginState>` |

나머지는 `ReadonlyStore<AppState>`(get, subscribe)만 받습니다. 앱 흐름이 login에 들어가며 저장을 비우는 일은 `progress.clear()`를 부릅니다. `Slice`는 `store.update`로 자기 키만 바꾸는 얇은 래퍼라 알림 규칙은 그대로입니다. 그 대신 두 컨텍스트의 슬라이스를 한 번의 갱신으로 함께 바꿀 수는 없습니다. 지금은 그런 경우가 없고, 로그인 성공은 `player`(progress) → `login`(account) 두 번의 갱신이며 앱 흐름은 첫 갱신에서 main으로 갑니다.

**D. application이 와이어 결과를 해석함**
application 포트 `GameServer`는 application의 말로 답합니다. 봉투, `ResultCode`, `Session`, AuthResume, Ping은 adapter 안에서만 다룹니다(부패 방지 계층).

```ts
export interface GameServer {
  /** 소켓을 엽니다. 열리지 않으면 reject. */
  open(): Promise<void>;
  /** 로그인. 성공하면 adapter가 세션을 쥐고, 끊겨도 스스로 다시 붙어 재개합니다. */
  login(loginId: string): Promise<LoginOutcome>;
  /** 커맨드 전송. 규칙 거절은 값으로, 전송 실패와 서버 오류는 reject로. */
  send(command: Command): Promise<CommandOutcome>;
  /** 재개 때 서버가 돌려준 저장을 받습니다. */
  onResumed(listener: (snapshot: PlayerSnapshot) => void): () => void;
  close(): void;
}
type LoginOutcome = { readonly ok: true; readonly snapshot: PlayerSnapshot } | { readonly ok: false; readonly error: GameError };
type CommandOutcome = { readonly ok: true; readonly sync?: StateSync } | { readonly ok: false; readonly error: GameError };
```

`MAX_UNANSWERED_COMMANDS`는 조립 지점이 `progress`에 숫자로 넘깁니다.

**E. presentation이 Unity를 앎**
`binding/components.ts`(Unity 타입 이름, UnityEvent 모양), `binding/refs.ts`(ViewRefs C# API, C# 배열 모양), `binding/bind.ts`를 `unity/binding/`으로 옮깁니다. presentation의 UI 포트는 프리팹 인스턴스를 불투명 핸들로 넘깁니다.

```ts
// presentation/ui/ports.ts
export interface ViewRoot { readonly __viewRoot: never }   // 엔진의 인스턴스. presentation은 읽지 않음
export interface UiInstance { readonly root: ViewRoot; destroy(): void }
// presentation/ui/ui-stack.ts
export interface View<VM> { readonly prefab: string; bind(scope: Scope, root: ViewRoot, vm: VM): void }
```

`unity/binding/refs.ts`의 `viewRefs(root)`가 핸들을 `RefsSource`로 한 번 바꿉니다.

**F. 안쪽 층이 전역 `console`을 씀**
application 포트 `Logger { info, warn, error }`를 두고, 유스케이스와 뷰모델은 넘겨받은 것만 씁니다. 조립 지점이 `console`로 만든 것을 넘깁니다. 백로그 46번(로그)이 이 포트를 구현합니다.

**G. 포트에 adapter만 쓰는 멤버**
application은 `Clock { now() }`만 받습니다. `observe`는 adapter의 `ServerClock`에만 있습니다.

**앱 흐름이 뷰모델을 앎 (application → presentation)**
`app-flow.ts`는 출력 포트 `Screens`만 압니다.

```ts
export type Screens = { readonly [S in AppFlowState]?: (scope: Scope) => void };
```

"저장된 ID로 자동 로그인하되, 세션이 끝나서 돌아온 때는 하지 않는다"는 정책은 앱 흐름에 둡니다. login에 들어갈 때 `network.ended === null`이고 `account.lastLoginId()`가 유효하면 `void account.login(saved)`를 부릅니다. `presentation/screens.ts`의 `createScreens`가 상태마다 뷰모델을 만들고 `ui.show(views.x, vm, scope)`로 엽니다. `unity/flow.ts`는 없어지고, `unity/views/index.ts`가 뷰 정의만 넘깁니다. `[flow] …` 로그는 `unity/boot.ts`가 지금 `state.flow`를 먼저 남기고 바뀔 때마다 남깁니다. 처음 상태 `boot`는 바뀌는 것이 아니라 구독만으로는 찍히지 않기 때문이고, `test/build.test.ts`가 기대하는 `[flow] boot → update → login` 순서를 그대로 지킵니다.

**예측 로직이 유스케이스와 섞임**
`net/sync.ts`의 순수 계산을 `domain/progress/prediction.ts`로 옮깁니다.

```ts
export interface PendingCommand { readonly command: Command; readonly now: number }
/** 확인된 저장 위에 예측 중 커맨드를 순서대로 다시 적용합니다. 이제 규칙이 거절하는 것은 건너뜁니다. */
export function predict(confirmed: PlayerState, pending: readonly PendingCommand[], data: GameData): PlayerState;
/** 응답의 sync를 확인된 저장에 반영합니다. 확인된 revision 이하는 그대로 둡니다. */
export function confirm(confirmed: PlayerSnapshot, sync: StateSync): PlayerSnapshot;
```

`application/progress/progress.ts`에는 대기열, 재개 때 예측 표시 끄기, 전송, `player` 슬라이스 반영이 남습니다.

### 4.4 주요 흐름

- **로그인**: 로그인 뷰모델 `login()` → `account.login(id)` → `login` 슬라이스 `pending = id` → `gameServer.open()`, `gameServer.login(id)` → 성공하면 `progress.reset(snapshot)`, `deviceStorage.set(lastLoginId)`, `pending = null` → 앱 흐름이 `player`를 보고 main으로. 실패하면 `failed = id`, `logger.warn`.
- **로그인 화면 표시**: 뷰모델이 가진 상태는 입력 중인 ID뿐입니다. `canLogin = isValidLoginId(입력) && pending === null`. 문구 우선순위는 진행 중 → `failed === 입력`이면 실패 → 잘못된 ID 안내 → `network.ended`의 이유입니다. 다른 ID를 입력하면 실패 문구는 저절로 사라집니다.
- **자동 로그인**: 앱 흐름의 login 상태가 위 정책으로 `account.login(saved)`를 부릅니다. 화면은 같은 `login` 슬라이스로 진행을 보여 줍니다.
- **커맨드**: 메인 뷰모델 → `progress.send(command)` → `predict`로 바로 화면 반영 → `gameServer.send` → `confirm` 또는 거절 시 제거 → `predict`로 다시 계산.
- **재연결**: adapter가 끊김을 감지해 `network`를 reconnecting으로 쓰고, 세션으로 재개한 뒤 `onResumed` 리스너(progress)가 확인된 저장을 바꿉니다. 응답을 못 받은 커맨드는 adapter가 같은 id로 다시 보냅니다.
- **로그아웃**: `account.logout()` → 저장된 ID 삭제 → `appRuntime.restart()`.

### 4.5 오류 처리

동작은 지금과 같습니다.

- 로그인 실패는 reject하지 않고 `login.failed`와 로그로 남습니다.
- 규칙 거절은 `GameError` 값으로 돌아오고, 전송 실패와 서버 오류는 reject입니다. 둘 다 예측을 되돌립니다.
- 프리팹과 뷰 선언이 어긋나면 뷰를 여는 순간 모든 문제를 한 번에 throw하고, UI 스택이 그 뷰를 닫습니다.

## 5. integration

- `startApp`을 `@idle/client/composition`에서 가져오고, `createNm` 대신 `App`을 씁니다.
- loopback 브리지의 `resources`와 `ui`는 빈 에셋과 빈 인스턴스를 돌려줘서, 테스트용 뷰가 뷰모델을 잡을 수 있게 합니다.

## 6. client/Assets/Scripts (C#)

### 6.1 어셈블리

| 폴더 | asmdef | 참조 |
| --- | --- | --- |
| `Scripts/Views/` | `PortfolioIdleRpg.Views` | UnityEngine |
| `Scripts/Facades/` | `PortfolioIdleRpg.Facades` | Views, `com.tencent.puerts.core`, `Unity.TextMeshPro`, `Unity.InputSystem`, `UnityEngine.UI` |
| `Scripts/Runtime/` | `PortfolioIdleRpg.Runtime` | Facades, `com.tencent.puerts.core`, `com.tencent.puerts.v8` |
| `Editor/` | `PortfolioIdleRpg.Editor` (Editor 전용) | 위 셋, `com.tencent.puerts.core.Editor` |

PuerTS는 `CS.X` 타입 조회(`Utils.GetAllTypes`)와 `[Configure]` 클래스 탐색(`Configure.cs`)을 모두 `AppDomain.CurrentDomain.GetAssemblies()`로 하므로, 어셈블리를 나눠도 TS 쪽 호출과 타입 정의 생성 설정을 찾습니다.

의존 방향은 Runtime → Facades → Views입니다. Facades는 `InternalsVisibleTo("PortfolioIdleRpg.Runtime")`로 수명 관리용 internal 멤버를 Runtime에만 엽니다.

### 6.2 지금 코드의 위배와 수정

| # | 위배 | 수정 |
| --- | --- | --- |
| C1 | Facades와 Runtime이 서로 참조합니다. `RuntimeFacade`가 `TypeScriptRuntime.RequestRestart()`를, `FileFacade`가 `TypeScriptRuntimeSettings`를 씁니다. | 재시작 요청은 `RuntimeFacade`가 들고 Runtime이 Tick마다 `TakeRestartRequest()`로 가져갑니다. 스크립트 폴더는 Runtime이 시작할 때 `FileFacade`에 넣습니다. 경로 검사 `ResolveChildPath`는 Facades로 옮겨 둘 다 씁니다. 읽을 때마다 설정 에셋을 다시 로드하던 일도 없어집니다. |
| C2 | Runtime이 Facade마다 정리 방법을 압니다. | `FacadeLifecycle.Shutdown()` 하나가 UI → 소켓 → 리소스 순서로 정리하고, Runtime은 스크립트 환경을 버리기 직전에 그것만 부릅니다. 지금은 소켓과 리소스를 환경을 버린 뒤에 정리하지만, 그 사이에 스크립트가 돌지 않으므로 앞으로 옮겨도 결과가 같습니다. 뷰를 먼저 없애는 순서(뷰가 사라지는 동안 스크립트를 부르지 않게)는 그대로입니다. |
| C3 | `UiFacade`가 TS API, UI 루트 구성, 한글 폰트 대체를 함께 맡습니다. | `UiFacade`는 TS가 부르는 얇은 API만 남기고, `UiRoot`(캔버스, 레이어, 차단막, EventSystem)와 `KoreanFontFallback`을 internal 클래스로 나눕니다. `WebSocketFacade`는 이미 연결을 내부 `Socket` 클래스로 나눠 두어 바꾸지 않습니다. |
| C4 | `TypeScriptTypings`가 `FileFacade`의 어셈블리 하나만 훑습니다. | Facades와 Views 어셈블리를 둘 다 훑습니다. 생성 결과(`types/csharp.d.ts`)는 같아야 합니다. |

`Assets/Samples/PuerTSHelloWorld`는 Assembly-CSharp에 남고, asmdef의 자동 참조로 Runtime을 그대로 씁니다.

## 7. 진행 순서

단계마다 커밋 하나로 나누고, 단계마다 `npm run typecheck`와 `npm test`를 통과시킵니다.

1. **shared**: `@idle/codes`를 만들고 도메인 타입을 `game-core`로 옮겨 `protocol → game-core`로 바꿉니다. 와이어 기준 바이트 테스트를 먼저 넣습니다. 서버, 클라이언트, integration의 import와 `check-boundaries`의 workspace 규칙을 고칩니다. 각 패키지의 `package.json` 의존(`protocol`에 `game-core`·`codes` 추가, `game-core`에서 `protocol`을 빼고 `codes` 추가)을 고치고 `npm install`로 `package-lock.json`의 workspace 링크를 갱신합니다. `game-core`와 `protocol`의 테스트는 서로를 import하지 않으므로 순환이 생기지 않습니다.
2. **client TS**: 4장의 배치와 수정(B~G, 화면 포트, 예측 분리)을 적용하고, `check-boundaries`에 층 규칙을 넣습니다. integration 테스트를 `App`으로 바꿉니다.
3. **C#**: asmdef 넷과 C1~C4를 적용합니다.
4. **문서**: README의 리포지토리 구조, 클라이언트 구조, MVVM 절을 고치고 `nm` 설명을 없앱니다. `docs/foundation-backlog.md`의 설계 원칙(`core/`·`unity/`·`nm`을 설명하는 줄)과 32번 항목의 "검증 규칙은 `protocol`에서 서버와 공유"를 고칩니다.

## 8. 테스트와 확인

- 새 테스트:
  - `shared/codes`: enum 값이 겹치지 않음
  - `shared/protocol`: 와이어 기준 바이트
  - `client`: `predict`·`confirm`, account 유스케이스(진행, 실패, 잘못된 ID 거절), 앱 흐름의 자동 로그인 정책, `GameServer` adapter의 봉투 해석, 슬라이스가 자기 키만 바꿈
- 기존 테스트는 경로와 포트를 고쳐 그대로 통과시킵니다(지금 client 63, server 33, integration 8).
- 수치: 릴리스 번들 크기를 재구성 전후로 재서 보고합니다.
- Unity(단계 3 뒤):
  - 다시 컴파일했을 때 오류가 없는지
  - 타입 정의가 다시 생성되고 내용이 같은지
  - 플레이 모드에서 로그인 → 메인 → 다음 스테이지 → 로그아웃 → 저장된 ID로 자동 로그인이 지금처럼 되는지
- 확인하지 못하는 것: 플레이어(IL2CPP) 빌드에서 어셈블리를 나눈 뒤의 코드 제거(stripping), 안드로이드 뒤로 가기

## 9. 범위 밖

- 서버 내부 구조 점검
- 엔티티 클래스 도입
- VContainer, UniTask 사용
- 새 기능
- 커밋하지 않은 `AGENTS.md` 파일들의 수정. 이 재구성으로 맞지 않게 되는 줄(루트의 `game-core → protocol` 의존, `client/TypeScript/AGENTS.md`의 `core/`, `nm`, 손으로 쓰는 `csharp.d.ts` 등)은 끝날 때 목록으로 드립니다.
