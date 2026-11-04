# @idle/client

PuerTS V8에서 도는 클라이언트 로직입니다. esbuild가 두 프로그램을 각각 파일 하나로 번들합니다(`npm run dev`, `build:dev`, `build:release`): 앱에 드는 부트(`src/boot.ts`, 패치 화면과 패치)와 패치로 받는 게임(`src/main.ts`, 로그인부터). 부트 번들에는 게임 코드가 들지 않게 하고(`sideEffects`, `test/build.test.ts`가 확인), 부트가 쓰는 것은 앱에 든 에셋뿐입니다.

## 층

안쪽부터 `domain/` → `application/` → `adapters/`·`presentation/` → `composition.ts` → `unity/`입니다. 의존은 바깥에서 안쪽으로만 향하고 `scripts/check-boundaries.mjs`가 검사합니다.

- `domain/`: 클라이언트에만 있는 순수 규칙(예측). 게임 규칙 자체는 `@idle/game-core`에 둡니다.
- `application/`: 유스케이스(`account/`, `progress/`, `battle/`), 앱 흐름(`app/`), 앱 상태 신호(`state/`), 포트(`ports.ts`). `battle/`은 저장된 체크포인트에서 보이는 전투를 프레임마다 진행하고 정산을 보냅니다.
- `adapters/`: application 포트 구현(엔진 무관). `@idle/protocol`은 여기와 `composition.ts`에서만 import하고, 봉투·`ResultCode`·세션 토큰은 `adapters/net/game-server.ts` 밖으로 내보내지 않습니다.
- `presentation/`: 뷰모델, 화면 포트 구현(`screens.ts`), UI 스택, 오브젝트 풀(`pool.ts`), 전투 월드(`world/`). Unity 타입을 모르고, 프리팹 인스턴스는 불투명 핸들 `ViewRoot`로만 받습니다.
- `composition.ts`: 조립만 합니다. `startApp`이 `App`을 돌려줍니다.
- `unity/`: 브리지 구현(`world.ts` 포함), 바인딩(`binding/`), 뷰(`views/`), 부팅. `csharp`/`puerts`/`CS`는 여기서만 씁니다.
- `host/`: PuerTS에 없는 전역입니다. `main.ts`와 `boot.ts`의 첫 import로 둡니다. import만으로 부작용이 있는 모듈은 여기에만 둡니다(`package.json`의 `sideEffects`).
- `adapters/`와 `presentation/`은 서로 import하지 않습니다. `domain/`·`application/`·`presentation/`은 호스트 API(`console`, `Date.now`, 타이머, `Math.random`)를 쓰지 않고 `Clock`·`Logger`를 넘겨받습니다.
- 외부 npm 패키지는 `host/`만 import합니다. 단 `@preact/signals-core`(버전 고정)는 `domain/`·`host/`·`main.ts`를 뺀 층에서 쓰고, 그 `effect`는 import하지 않습니다(경계 검사).
- 포트는 쓰는 층이 정의합니다. application 포트는 역할 이름(`GameServer`, `DeviceStorage`, `AppRuntime`), 엔진 기본 기능을 다루는 바깥 포트는 `…Bridge`입니다.

## App

- 전역 진입점을 두지 않습니다. 필요한 것은 `App`(`app.account`, `app.progress.cmd.X(...)`, `app.battle`, 읽기 전용 `app.state`, `app.ui` …)이나 인자로 넘겨받습니다.
- 새 시스템은 컨텍스트별 묶음으로 `App`에 더합니다. `progress.cmd`는 `Opcode`에서 생기므로 손으로 쓰지 않습니다. 시스템 API는 `GameServer` 포트에 메서드를 더하고 어댑터에서 구현합니다.
- 화면은 `presentation/view-models/` + `presentation/screens.ts` + `unity/views/`입니다. 뷰는 뷰모델만 받습니다.
- 뷰모델의 값은 `ReadonlySignal`, 입력란처럼 양방향인 값은 `Signal`(`loginId`), 파생 값은 `computed`입니다. UI 뷰는 `unity/binding/view.ts`의 `view(prefab, { 항목: 바인더 })` 표 하나이고(`text`, `button`, `input`, `active`), 표의 이름이 ViewRefs 항목 이름이라 TS에 한 번만 씁니다. 버튼의 `enabled`·`visible`은 옵션이라 `Command` 타입은 없습니다.
- 전투 HUD(`hud.waves`, `hud.bossTime`, `hud.canChallenge`)는 메인 뷰모델이 전투 서비스의 `snapshot` 신호로 계산합니다. 연출은 `BattleDirector`(`presentation/world/battle-director.ts`)의 `frame(): Direction[]`이고 `createScreens`가 메인 뷰모델과 따로 만듭니다.
- 전투 월드는 UI 스택이 아니라 `World`(`presentation/world/`)가 프리팹을 올리고, `WorldView`(`unity/views/battle.ts`)가 `BattleDirector`의 `frame()` 지시를 `ActorView`·`FloatingText` 호출로 옮깁니다. 대상 객체를 직접 부르므로 바인딩 표가 아니라 `readRefs`를 씁니다. 움직임은 C# 컴포넌트의 `Update`가 그리므로 TS에서 프레임마다 위치를 밀지 않습니다. 배우와 글자는 `Pool`에서 꺼내고 돌려놓습니다.

## 상태와 비동기

- 상태는 슬라이스마다 신호(`@preact/signals-core`) 하나이고, 슬라이스마다 쓰는 곳은 하나입니다(`flow`: 앱 흐름, `player`: progress, `network`: game-server 어댑터, `login`: account). 쓰는 쪽만 `Signal`을 받고 나머지는 `AppState`(`ReadonlySignal`)를 받습니다. 쓰기 가능한 신호(`createAppState`)는 `composition.ts`만 만들어 쓰는 쪽에 나눠 줍니다. 다른 컨텍스트의 슬라이스는 그 컨텍스트의 메서드로 바꿉니다(예: `progress.clear()`).
- 값은 `scope.add(신호.subscribe(fn))`으로 따라갑니다. `subscribe`는 지금 값으로 한 번 부르고 바뀔 때마다 다시 부르며, 콜백 안에서 읽은 신호는 따라가지 않습니다. `effect`는 쓰지 않습니다. 그 안에서 읽은 값이 모두 의존이 되어 엉뚱할 때 다시 돌기 때문입니다. 파생 값은 `computed`이고, 그 안에서는 신호에 쓰지 않습니다.
- 보이는 전투(`app.battle`)는 프레임마다 바뀌므로 앱 상태에 넣지 않습니다. 앱 상태에는 서버가 확정한 체크포인트(`player.battle`)만 있고, 보이는 전투의 지금 모습은 전투 서비스의 `snapshot` 신호입니다.
- 바뀐 슬라이스만 새 객체로 만듭니다(신호는 같은 값을 쓰면 알리지 않습니다). `await` 뒤에는 `.value`로 다시 읽습니다.
- 같은 구독자 순서나 알림 시점에 기대지 않습니다. 쓰고 나서 바로 `.value`를 읽으면 새 값이지만, 구독 콜백 안에서 쓴 값의 구독자는 그 콜백이 끝난 뒤에 불립니다.
- 앱 흐름은 상태만 보고 움직입니다(밖에서 `go` 금지). 화면·구독·타이머는 `Scope`에 등록해 떠날 때 해제합니다.
- 시각은 `clock.now()`(서버 시간 추정)를 씁니다.
- 늦게 온 소켓 이벤트·응답은 `generation`을 확인해 버립니다. 재전송은 같은 id로 하고, 로그인·재개·Ping은 재전송하지 않습니다.
- Unity는 한 프레임에 쌓인 소켓 이벤트를 한 번에 넘기므로 그 사이에 마이크로태스크가 돌지 않습니다. 응답과 끊김이 같은 프레임에 올 수 있다고 보고, `await` 뒤에는 연결이 아직 있는지 확인합니다.

## PuerTS

- Node·브라우저 API가 없습니다. `csharp`/`puerts`는 default import만 됩니다(`import CS from "csharp"`).
- C# API 타입 `types/csharp.d.ts`는 Unity가 생성합니다(`Tools/TypeScript/Generate Typings`). 손으로 고치지 않습니다. PuerTS가 C# 참조를 null이 아니라고 선언하므로, null이 오는 곳은 `unity/`에 실제로 쓰는 모양의 인터페이스를 따로 선언합니다.
- 매 프레임 실행은 `setInterval(fn, 1)`입니다. `0`은 한 Tick 안에서 끝없이 반복합니다.

## 테스트

- 안쪽 층은 가짜 포트로, 화면은 일반 객체 바인딩 대상으로 검증합니다(`test/mvvm.test.ts`). 상태는 `createAppState({ flow: "main", player })`로 시작하고, 계정은 `testPlayer`(`@idle/game-core/testing`)로 만듭니다.
- 전투 서비스 테스트는 프레임을 2초(`CATCH_UP_TICKS`, 20틱) 이하씩 진행합니다. 그보다 크게 밀면 이벤트 없이 따라잡고 `reset` 하나만 냅니다.
- `test/build.test.ts`가 실제 번들을 PuerTS처럼 실행합니다. 부팅 로그를 바꾸면 기대값도 바꿉니다.
- 서버 로직과 붙이는 테스트는 `integration/`에 둡니다.
