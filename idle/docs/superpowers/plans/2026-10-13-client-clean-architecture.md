# 클라이언트 DDD·클린 아키텍처 재구성 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도메인 타입과 와이어 번호의 위치를 바로잡고, TypeScript 클라이언트를 domain / application / adapters / presentation / unity 층으로, C#을 Views / Facades / Runtime 어셈블리로 나눕니다. 와이어와 화면 동작은 그대로 둡니다.

**Architecture:** 공유 커널 `@idle/game-core`가 도메인 타입을 소유하고, `@idle/protocol`은 그것을 와이어에 싣는 바깥 계약이 됩니다. 클라이언트는 포트를 쓰는 층이 정의하고 바깥 층이 구현하며, 조립은 `composition.ts`가 맡고 전역 `nm` 대신 `App`을 넘깁니다. C#은 asmdef로 Runtime → Facades → Views 방향만 허용합니다.

**Tech Stack:** TypeScript 5.9(ESM, strict), vitest 4, esbuild, npm workspaces, Node 22; Unity 6000.6, PuerTS 3.0.3(V8), uGUI·TMP·Input System; `unity` CLI(Pipeline).

**Spec:** [docs/superpowers/specs/2026-10-13-client-clean-architecture-design.md](../specs/2026-10-13-client-clean-architecture-design.md)

## Global Constraints

- 와이어 바이트, `PROTOCOL_VERSION = 1`, 저장 형식, 서버 동작은 바뀌지 않습니다. Task 1의 기준 바이트 스냅숏을 갱신(`-u`)하지 않습니다.
- 화면 문구는 그대로입니다: "로그인 중…", "로그인하지 못했습니다. 잠시 후 다시 시도해 주세요.", "아이디는 영문 소문자, 숫자, _로 4~16자입니다.", "다른 곳에서 같은 아이디로 로그인했습니다.", "연결이 오래 끊겨 다시 로그인해야 합니다.", "서버와 주고받지 못해 연결을 끊었습니다. 다시 로그인해 주세요.", "새 버전이 필요합니다.", "다시 연결하는 중…", "서버 응답을 기다리는 중…".
- 로그 접두사는 그대로입니다: `[flow] <state>`, `[GameData] Items: …`, `[login] Login failed:`, `[main] …`, `[ui] <prefab> did not open:`, `[TypeScript] …`.
- TS는 ESM·strict, 타입만 쓰면 `import type`, 상대 import에는 `.js`. 코드 주석과 커밋 메시지는 영어, 문서는 한국어입니다.
- 새 외부 의존을 더하지 않습니다(`@idle/codes` workspace만 추가).
- 파일 이동은 `git mv`로 해서 이력을 남깁니다.
- 단계(Phase) 끝마다 루트에서 `npm run typecheck`와 `npm test`를 통과시킵니다.
- Unity가 `client/`를 열고 있습니다. `git switch`/`checkout`/`merge`/`stash`를 쓰지 않습니다.
- 커밋은 단계 끝에서 사용자 확인 후 합니다. 커밋되지 않은 `AGENTS.md` 파일들이 여러 폴더에 있으므로 `git add -A <폴더>`를 쓰지 않고, `git add -u`와 새 파일 경로를 직접 지정한 뒤 `git status --short`로 `AGENTS.md`가 빠졌는지 확인합니다. 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`를 붙입니다.
- `AGENTS.md` 파일, `client/Packages/core`, `client/Packages/v8`, `Library/`는 고치지 않습니다.
- `Assets/`에 새로 만든 파일의 `.meta`는 Unity가 만들게 하고(Refresh) 함께 커밋합니다.

## Review Focus

1. 자동 로그인이 진행 중일 때 플레이어가 로그인 버튼을 누르면 AuthLogin은 한 번만 나가야 합니다. → Task 9 `account.test.ts` "a second login while one is pending does nothing".
2. 서버가 로그인을 거절(Rejected)하면 로그인 화면에 실패 문구가 나오고 login 상태에 머물러야 합니다. → Task 8 "a refused login resolves with the error and keeps no session", Task 9 "a refused or failed login records the ID that failed and logs why".
3. 로그인 프리팹이 열리지 않아도 자동 로그인과 앱 흐름은 계속되어야 하고, 실패는 로그로 남아야 합니다. → Task 9 `screens.test.ts` "a view that does not open is logged and the flow carries on".
4. 한 슬라이스의 구독자가 다른 슬라이스를 바꿔도(세션 종료 → 앱 흐름이 저장을 비움) 뒤 구독자는 최신 상태를 봐야 합니다. → Task 6 `store.test.ts` "an update made from another slice's listener is seen by later listeners".
5. 어셈블리를 나눈 뒤 로그아웃 → 재시작이 한 번만 일어나고, 재시작한 스크립트도 테이블 파일을 읽어야 합니다. → Task 13 플레이 모드 확인.

---

## Phase 1 — shared

### Task 1: 와이어 기준 바이트 고정

**Files:**
- Create: `shared/protocol/test/wire.test.ts`, `shared/protocol/test/tsconfig.json`
- Modify: `shared/protocol/package.json`

**Interfaces:**
- Consumes: 지금의 `@idle/protocol`(`Opcode`, `GameErrorCode`, `ResultCode`, `encodeMessage`).
- Produces: `shared/protocol/test/__snapshots__/wire.test.ts.snap`. 이후 작업은 이 파일을 바꾸지 않습니다.

- [ ] **Step 1: protocol에 테스트 실행을 붙입니다**

`package.json`의 scripts를 `"typecheck": "tsc -p tsconfig.json && tsc -p test/tsconfig.json"`, `"test": "vitest run"`으로, devDependencies에 `"@types/node": "22.20.5"`를 넣습니다. `test/tsconfig.json`은 `shared/big-number/test/tsconfig.json`과 같은 내용입니다.

- [ ] **Step 2: 메시지마다 바이트를 스냅숏으로 고정하는 테스트를 씁니다**

```ts
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");
const player = {
  profile: { loginId: "hero", level: 3, exp: { m: 1.5, e: 3 } },
  currencies: { gold: { m: 7.25, e: 42 } },
  stage: { currentId: 3002, clearedIds: [3001] },
};
const messages = {
  "AuthLogin request": { op: Opcode.AuthLogin, id: "1", body: { loginId: "hero" } },
  "AuthResume request": { op: Opcode.AuthResume, id: "2", body: { token: "t" } },
  "Ping request": { op: Opcode.Ping, id: "3", body: {} },
  "StageSelect request": { op: Opcode.StageSelect, id: "4", body: { stageId: 3002 } },
  "Ok login response": { id: "1", serverTime: 1000, code: ResultCode.Ok, body: { snapshot: { player, revision: 1 }, session: { token: "t", expiresAt: 2000 } } },
  "Ok command response with sync": { id: "4", serverTime: 1000, code: ResultCode.Ok, body: null, sync: { revision: 2, changes: { stage: player.stage } } },
  "Rejected by a rule": { id: "4", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.StageNotFound, message: "x" } },
  "Rejected session": { id: "2", serverTime: 1000, code: ResultCode.Rejected, error: { code: GameErrorCode.SessionExpired, message: "x" } },
  "ServerError response": { id: "4", serverTime: 1000, code: ResultCode.ServerError, message: "x" },
};
test.each(Object.entries(messages))("%s keeps its bytes", (_name, message) => {
  expect(hex(encodeMessage(message))).toMatchSnapshot();
});
```

- [ ] **Step 3: 실행해 스냅숏을 만듭니다**

Run: `npm test -w @idle/protocol`
Expected: 9 passed, `test/__snapshots__/wire.test.ts.snap`에 16진 문자열 9개가 생깁니다.

- [ ] **Step 4: 다시 실행해 그대로 통과하는지 봅니다**

Run: `npm test -w @idle/protocol && npm run typecheck -w @idle/protocol`
Expected: 9 passed, "Snapshots … written" 없음.

### Task 2: `@idle/codes` 패키지와 번호 목록 이동

**Files:**
- Create: `shared/codes/package.json`, `shared/codes/tsconfig.json`, `shared/codes/src/index.ts`, `shared/codes/test/codes.test.ts`, `shared/codes/test/tsconfig.json`
- Move: `shared/protocol/src/opcode.ts` → `shared/codes/src/opcode.ts`
- Create: `shared/codes/src/errors.ts` (`GameErrorCode` enum만. `shared/protocol/src/errors.ts`에는 `GameError` 인터페이스가 남습니다)
- Modify: `shared/protocol/src/{index,api,commands,envelope,errors}.ts`, `shared/protocol/package.json`, `shared/game-core/src/commands/{index,stage,types}.ts`, `shared/game-core/package.json`, `scripts/check-boundaries.mjs`, `Opcode`·`GameErrorCode`를 가져오는 모든 파일(서버 `rpc.ts`·테스트 3개, 클라이언트 `connection.ts`·`session.ts`·`by-name.ts`·`view-models/main.ts`·테스트, integration 테스트 2개, `shared/protocol/test/wire.test.ts`)

**Interfaces:**
- Produces: `@idle/codes` → `export enum Opcode { AuthLogin = 1, AuthResume = 2, Ping = 3, StageSelect = 100 }`, `export enum GameErrorCode { InvalidCommand = 1, UnknownCommand = 2, SessionExpired = 10, SessionReplaced = 11, StageNotFound = 100 }`. 문서 주석은 옮겨 옵니다. `@idle/protocol`은 둘을 다시 내보내지 않습니다.

- [ ] **Step 1: 값 중복 검사 테스트를 씁니다**

```ts
test.each([["Opcode", Opcode], ["GameErrorCode", GameErrorCode]] as const)("%s values are unique", (_name, codes) => {
  const values = Object.values(codes).filter(value => typeof value === "number");
  expect(new Set(values).size).toBe(values.length);
});
```

- [ ] **Step 2: 패키지가 없어 실패하는지 봅니다**

Run: `npx vitest run --root shared/codes`
Expected: FAIL (`../src/index.js`를 찾지 못함)

- [ ] **Step 3: 패키지를 만들고 enum을 옮깁니다**

`package.json`은 `shared/big-number/package.json`과 같은 모양(`name: "@idle/codes"`, 의존 없음)입니다. 루트에서 `npm install`을 실행해 `node_modules/@idle/codes` 링크와 `package-lock.json`을 갱신합니다.

- [ ] **Step 4: 모든 사용처가 `@idle/codes`에서 가져오게 고칩니다**

`protocol`과 `game-core`의 `package.json` dependencies에 `"@idle/codes": "*"`를 넣습니다. `check-boundaries.mjs`의 `shared` 목록에 `@idle/codes`, `allowed`에 `"shared/codes": []`를 넣고, `shared/protocol`과 `shared/game-core` 항목에 `@idle/codes`를 더합니다.

- [ ] **Step 5: 전체 검사**

Run: `npm run typecheck && npm test`
Expected: 모두 통과, `wire.test.ts` 9개 통과(스냅숏 변경 없음), `codes.test.ts` 2개 통과.

### Task 3: 도메인 타입을 `game-core`로, 의존을 `protocol → game-core`로

**Files:**
- Move: `shared/protocol/src/state.ts` → `shared/game-core/src/state.ts`; `shared/protocol/src/commands.ts` → `shared/game-core/src/command.ts`
- Create: `shared/game-core/src/account.ts` (`LOGIN_ID_PATTERN`, `isValidLoginId`를 `protocol/src/account.ts`에서 옮김), `shared/game-core/src/snapshot.ts` (`PlayerSnapshot`을 `api.ts`에서, `StateSync`를 `envelope.ts`에서 옮김), `shared/game-core/src/errors.ts` (`GameError`를 `protocol/src/errors.ts`에서 옮기고 그 파일은 지움)
- Modify: `shared/game-core/src/index.ts`, `shared/game-core/src/commands/*.ts`, `shared/game-core/package.json`, `shared/protocol/src/{index,api,account,envelope}.ts`, `shared/protocol/package.json`, `scripts/check-boundaries.mjs`, 서버 `rpc.ts`·`save.ts`·`store.ts`·테스트, 클라이언트 `src/core/**`·`test/*`, integration 테스트, `shared/protocol/test/wire.test.ts`(import만)

**Interfaces:**
- Produces (`@idle/game-core`에서 새로 내보냄): `PlayerState`, `ProfileState`, `CurrencyState`, `StageState`, `Command`, `CommandOf<K>`, `CommandOpcode`, `GameError`, `LOGIN_ID_PATTERN`, `isValidLoginId`, `PlayerSnapshot`, `StateSync`. 정의와 문서 주석은 그대로 옮깁니다.
- `@idle/protocol`에 남는 것: `PROTOCOL_VERSION`, `Apis`, `LoginResult`, `RequestOf`, `ResponseOf`, `SystemOpcode`, `Session`, `MAX_UNANSWERED_COMMANDS`, `ResultCode`, `FailureCode`, `RequestEnvelope`, `ResponseEnvelope`, `ResponseResult`, `CloseCode`, `SOCKET_PATH`, `socketPath`, `decodeMessage`, `encodeMessage`. 도메인 타입을 다시 내보내지 않습니다.

- [ ] **Step 1: 타입을 옮기고 `game-core`에서 내보냅니다**

`game-core/package.json`: dependencies에서 `@idle/protocol`을 빼고 `@idle/big-number`(state의 `Big`), `@idle/codes`, `@idle/data-schema`를 둡니다. `protocol/package.json`: `@idle/game-core`를 더합니다. 루트에서 `npm install`.

- [ ] **Step 2: 사용처의 import를 나눕니다**

도메인 타입은 `@idle/game-core`, 번호는 `@idle/codes`, 전송 계약은 `@idle/protocol`에서 가져옵니다. 서버의 `isValidLoginId`, `PlayerState`, `PlayerSnapshot`도 `@idle/game-core`로 바뀝니다.

- [ ] **Step 3: 경계 규칙을 새 방향으로 바꿉니다**

`allowed`를 `"shared/game-core": ["@idle/codes", "@idle/big-number", "@idle/data-schema"]`, `"shared/protocol": ["@idle/codes", "@idle/big-number", "@idle/game-core"]`로 바꾸고, 머리 주석의 workspace 설명을 새 방향에 맞춥니다.

- [ ] **Step 4: 와이어가 그대로인지와 전체 검사를 봅니다**

Run: `npm run typecheck && npm test`
Expected: 모두 통과. `wire.test.ts` 9개가 스냅숏 변경 없이 통과. 서버 33, client 63, integration 8 그대로.

- [ ] **Step 5: 이전 경로가 남지 않았는지 봅니다**

Run: `grep -rn "@idle/protocol" shared/game-core; grep -rnE "^export (interface|type|enum|const|function) (PlayerState|ProfileState|CurrencyState|StageState|Command|CommandOf|CommandOpcode|GameError|PlayerSnapshot|StateSync|LOGIN_ID_PATTERN|isValidLoginId)\b" shared/protocol/src`
Expected: 둘 다 출력 없음.

- [ ] **Step 6: Phase 1 커밋 (사용자 확인 후)**

```bash
git add -u && git add shared/codes/package.json shared/codes/tsconfig.json shared/codes/src shared/codes/test shared/game-core/src shared/protocol/test package-lock.json
git status --short   # AGENTS.md가 staged 목록에 없는지 확인
git commit -m "refactor(shared): own domain types in game-core and wire codes in @idle/codes"
```

---

## Phase 2 — client TypeScript

### Task 4: 층 배치로 파일 옮기기 (동작 변경 없음)

**Files (모두 `client/TypeScript/src/` 기준, `git mv`):**

| 지금 | 옮길 곳 |
| --- | --- |
| `core/binding/scope.ts` | `application/scope.ts` |
| `core/state/store.ts`, `core/state/app-state.ts` | `application/state/` |
| `core/app/flow.ts`, `core/app/app-flow.ts` | `application/app/` |
| `core/app/session.ts` | `application/account/account.ts` |
| `core/net/sync.ts` | `application/progress/progress.ts` |
| `core/net/connection.ts` | `adapters/net/game-server.ts` |
| `core/net/server-clock.ts` | `adapters/net/server-clock.ts` |
| `core/net/by-name.ts` | `unity/by-name.ts` |
| `core/binding/observable.ts` | `presentation/observable.ts` |
| `core/binding/bind.ts`, `components.ts`, `refs.ts` | `unity/binding/` |
| `core/ui/ui-stack.ts`, `core/ui/resources.ts` | `presentation/ui/` |
| `core/format/*` | `presentation/format/` |
| `core/view-models/*` | `presentation/view-models/` |
| `core/app/services.ts` | `composition.ts` |
| `core/bridge.ts` | 나눔(아래), 그 뒤 삭제 |

`core/bridge.ts`의 내용은 그대로 옮기며 나눕니다: `SocketBridge`·`SocketHandlers`·`SocketHandle` → `adapters/net/ports.ts`; `AssetHandle`·`ResourceBridge`·`UiLayer`·`UiBridge`·`UiInstance` → `presentation/ui/ports.ts`; `StorageBridge` → `application/ports.ts`의 `DeviceStorage`, `RuntimeBridge` → `AppRuntime`(이름만 바꿈); `FileBridge`·`Bridge` → `composition.ts`.

- Modify: 위 파일들과 `unity/*`, `test/*.ts`, `test/support/puerts-host.mjs`(경로를 참조하면), `integration/test/*.ts`, `integration/test/support/loopback.ts`의 import 경로. `@idle/client/core/app/services` → `@idle/client/composition`, `@idle/client/core/view-models/login` → `@idle/client/presentation/view-models/login`, `@idle/client/core/bridge`의 `Bridge` → `@idle/client/composition`, `SocketBridge` → `@idle/client/adapters/net/ports`.

**Interfaces:**
- Produces: 위 경로. 함수와 타입 이름은 `DeviceStorage`, `AppRuntime` 말고는 그대로입니다(`createSession`, `createSync`, `createConnection`은 Task 8~9에서 바뀝니다).

- [ ] **Step 1: 바뀌기 전 릴리스 번들 크기를 기록합니다**

Run: `npm run build:release -w @idle/client && wc -c client/TypeScript/dist/release/main.mjs`
Expected: 바이트 수 하나. 계획 실행 메모에 적어 Task 11에서 비교합니다.

- [ ] **Step 2: 표대로 옮기고 import 경로를 고칩니다**

- [ ] **Step 3: `core/`가 비었는지와 전체 검사를 봅니다**

Run: `test ! -e client/TypeScript/src/core && npm run typecheck && npm test`
Expected: 모두 통과, 테스트 수 그대로.

### Task 5: 프리팹 인스턴스를 불투명 핸들 `ViewRoot`로 넘기기

**Files:**
- Modify: `src/presentation/ui/ports.ts`, `src/presentation/ui/ui-stack.ts`, `src/unity/ui.ts`, `src/unity/binding/refs.ts`, `src/unity/views/login.ts`, `src/unity/views/main.ts`
- Test: `test/ui.test.ts`, `test/unity-ui.test.ts`, `test/mvvm.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // presentation/ui/ports.ts
  /** The engine's instance of a view's prefab. Only the engine's view code reads it. */
  export interface ViewRoot { readonly __viewRoot: never }
  export interface UiInstance { readonly root: ViewRoot; destroy(): void }
  // presentation/ui/ui-stack.ts
  export interface View<VM> { readonly prefab: string; bind(scope: Scope, root: ViewRoot, vm: VM): void }
  export interface OpenView { readonly root: ViewRoot; readonly scope: Scope; close(): void }
  // unity/binding/refs.ts
  export function viewRefs(root: ViewRoot): RefsSource;   // the ViewRefs the Unity UI bridge put behind the handle
  ```
- `presentation/`에 `RefsSource`가 더는 나타나지 않습니다.

- [ ] **Step 1: 테스트를 새 모양으로 바꿉니다**

`ui.test.ts`의 가짜 `UiBridge.create`는 `{ root: {} as ViewRoot, destroy }`를 돌려주고, "show binds the view in its scope…"는 `bind`가 받은 `root`가 그 객체인지 확인합니다. `mvvm.test.ts`의 뷰 바인딩 도우미는 가짜 `RefsSource`를 `as unknown as ViewRoot`로 넘깁니다. `unity-ui.test.ts`는 `create`의 결과 `root`가 facade가 돌려준 ViewRefs인지 확인합니다.

- [ ] **Step 2: 타입 검사가 실패하는지 봅니다**

Run: `npm run typecheck -w @idle/client`
Expected: FAIL (`root`/`ViewRoot` 없음)

- [ ] **Step 3: 포트, UI 스택, Unity 브리지, 뷰를 바꿉니다**

`unity/ui.ts`는 facade가 준 ViewRefs를 `as unknown as ViewRoot`로 한 번 감싸고 `destroy`에서 되돌려 `facade.Destroy`에 넘깁니다. 뷰는 `readRefs(viewRefs(root), refs)`로 읽습니다.

- [ ] **Step 4: 통과 확인**

Run: `npm run typecheck -w @idle/client && npm test -w @idle/client`
Expected: 모두 통과.

### Task 6: 스토어 슬라이스와 소유자

**Files:**
- Modify: `src/application/state/store.ts`, `src/presentation/observable.ts`, `src/adapters/net/game-server.ts`, `src/application/progress/progress.ts`, `src/application/app/app-flow.ts`, `src/presentation/view-models/*.ts`, `src/composition.ts`
- Create: `test/store.test.ts`
- Test: `test/connection.test.ts`, `test/sync.test.ts`, `test/flow.test.ts`, `test/mvvm.test.ts`

**Interfaces:**
- Produces (`application/state/store.ts`):
  ```ts
  export type ReadonlyStore<S> = Pick<Store<S>, "get" | "subscribe">;
  /** One key of a store, for the context that owns it; others only read. */
  export interface Slice<T> { get(): T; update(update: (value: T) => T): void }
  export function sliceOf<S, K extends keyof S>(store: Store<S>, key: K): Slice<S[K]>;
  ```
  `update`가 같은 값을 돌려주면 상태 객체를 바꾸지 않습니다(알림 없음).
- 소유: `createConnection({ socket, server, clock, network: Slice<NetworkState> })`; `createSync({ player: Slice<PlayerState | null>, … })`에 `clear(): void` 추가(확인된 저장과 대기열을 비우고 `player`를 `null`로); `createAppFlow({ state: ReadonlyStore<AppState>, flow: Slice<AppFlowState>, progress: { clear(): void }, screens, presenters })`. `select(store: ReadonlyStore<S>, …)`와 뷰모델은 `ReadonlyStore<AppState>`를 받습니다.

- [ ] **Step 1: 슬라이스 테스트를 씁니다**

```ts
test("a slice replaces only its own key, and leaves the state alone when nothing changed", () => {
  const store = createStore({ a: 1, b: { x: 1 } });
  const before = store.get();
  const b = sliceOf(store, "b");
  b.update(value => value);
  expect(store.get()).toBe(before);
  b.update(() => ({ x: 2 }));
  expect(store.get()).toEqual({ a: 1, b: { x: 2 } });
});
test("an update made from another slice's listener is seen by later listeners", () => {
  const store = createStore({ a: 1, b: { x: 1 } });
  store.subscribe(s => s.a, a => a === 2 && sliceOf(store, "b").update(() => ({ x: 9 })));
  const seen: number[] = [];
  store.subscribe(s => s.b.x, x => seen.push(x));
  sliceOf(store, "a").update(() => 2);
  expect(store.get().b.x).toBe(9);
  expect(seen).toEqual([9]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -w @idle/client -- test/store.test.ts`
Expected: FAIL (`sliceOf` 없음)

- [ ] **Step 3: `sliceOf`를 구현하고 소유자에게 슬라이스를 넘깁니다**

앱 흐름의 login 진입은 `store.update(… player: null …)` 대신 `progress.clear()`를 부릅니다. `composition.ts`가 `sliceOf(store, "flow" | "player" | "network")`를 만들어 넘기고, 나머지에는 `store`를 `ReadonlyStore`로 넘깁니다. 기존 테스트는 같은 방식으로 슬라이스를 만들어 넘기도록 고칩니다.

- [ ] **Step 4: 통과 확인**

Run: `npm run typecheck -w @idle/client && npm test -w @idle/client`
Expected: 모두 통과(+2).

### Task 7: 예측을 `domain/`으로

**Files:**
- Create: `src/domain/progress/prediction.ts`, `test/prediction.test.ts`
- Modify: `src/application/progress/progress.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PendingCommand { readonly command: Command; readonly now: number }
  export function predict(confirmed: PlayerState, pending: readonly PendingCommand[], data: GameData): PlayerState;
  export function confirm(confirmed: PlayerSnapshot, sync: StateSync): PlayerSnapshot;
  ```
  `predict`는 아무것도 다시 적용되지 않으면 `confirmed` 자체를 돌려주고, 규칙이 거절하는 커맨드는 건너뜁니다. `confirm`은 `sync.revision <= confirmed.revision`이면 `confirmed` 자체를, 아니면 `{ player: { ...confirmed.player, ...sync.changes }, revision: sync.revision }`을 돌려줍니다.

- [ ] **Step 1: 테스트를 씁니다** (테이블은 `test/sync.test.ts`와 같은 방식으로 `loadGameData`로 읽습니다)

```ts
test("predict redoes pending commands in order on the confirmed save", () => {
  expect(predict(save, [select(3002), select(3003)], data).stage.currentId).toBe(3003);
});
test("predict skips a command the rules now refuse", () => {
  expect(predict(save, [select(9999), select(3002)], data).stage.currentId).toBe(3002);
});
test("predict hands back the confirmed save itself when nothing is pending", () => {
  expect(predict(save, [], data)).toBe(save);
});
test("confirm takes newer changes and keeps what they do not touch", () => {
  const next = confirm({ player: save, revision: 2 }, { revision: 3, changes: { stage: { currentId: 3002, clearedIds: [] } } });
  expect(next.revision).toBe(3);
  expect(next.player.stage.currentId).toBe(3002);
  expect(next.player.profile).toBe(save.profile);
});
test("confirm ignores an answer at or below the confirmed revision", () => {
  const confirmed = { player: save, revision: 3 };
  expect(confirm(confirmed, { revision: 3, changes: {} })).toBe(confirmed);
});
```
(`select(id)`는 `{ command: { type: Opcode.StageSelect, stageId: id }, now: 0 }`을 만드는 테스트 도우미, `save`는 `stage.currentId = 3001`인 저장입니다.)

- [ ] **Step 2: 실패 확인** — Run: `npm test -w @idle/client -- test/prediction.test.ts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: `prediction.ts`를 구현하고 `progress.ts`의 `show()`·`confirm()`이 그것을 쓰게 합니다** (`predicted`가 꺼진 항목은 `pending`에 넣지 않습니다)

- [ ] **Step 4: 통과 확인** — Run: `npm test -w @idle/client` / Expected: 모두 통과(+5), `sync.test.ts` 그대로 통과.

### Task 8: `GameServer` 포트와 부패 방지 계층

**Files:**
- Modify: `src/application/ports.ts`, `src/adapters/net/game-server.ts`, `src/adapters/net/server-clock.ts`, `src/application/progress/progress.ts`, `src/application/account/account.ts`, `src/composition.ts`, `src/unity/nm.ts`, `src/unity/by-name.ts`
- Move: `test/connection.test.ts` → `test/game-server.test.ts`, `test/sync.test.ts` → `test/progress.test.ts`
- Test: `integration/test/client-server.test.ts`

**Interfaces:**
- Produces (`application/ports.ts`):
  ```ts
  export type LoginOutcome = { readonly ok: true; readonly snapshot: PlayerSnapshot } | { readonly ok: false; readonly error: GameError };
  export type CommandOutcome = { readonly ok: true; readonly sync?: StateSync } | { readonly ok: false; readonly error: GameError };
  export interface GameServer {
    open(): Promise<void>;
    login(loginId: string): Promise<LoginOutcome>;
    send(command: Command): Promise<CommandOutcome>;
    onResumed(listener: (snapshot: PlayerSnapshot) => void): () => void;
    close(): void;
  }
  export interface Clock { now(): number }
  ```
- `adapters/net/server-clock.ts`: `export interface ServerClock extends Clock { observe(serverTime: number): void }`, `createServerClock(local?: () => number): ServerClock`.
- `adapters/net/game-server.ts`: `createGameServer({ socket, server, clock: ServerClock, network: Slice<NetworkState> }): GameServer`. 상수 `REQUEST_TIMEOUT`, `PING_INTERVAL`, `WAITING_DELAY`, `RECONNECT_DELAYS`는 값 그대로 이 파일에서 내보냅니다. AuthLogin이 Ok이면 adapter가 세션을 쥐고(지금의 `keep`), 재개가 성공할 때마다 `onResumed` 리스너를 부릅니다. Ok → `ok: true`, Rejected → `ok: false`, 그 밖의 코드 → `Error` reject(`Login failed: <ResultCode 이름>.`, `Command failed: <message>`). AuthResume, Ping, `Session`, `ResultCode`는 이 파일 밖으로 나가지 않습니다.
- `application/progress/progress.ts`: `createProgress({ player, server: GameServer, data, clock: Clock, maxUnanswered: number }): Progress`. `Progress`는 `reset`, `resume`, `clear`, `send(command): Promise<GameError | undefined>`. 생성할 때 `server.onResumed(resume)`을 등록합니다.
- `application/account/account.ts`(이 작업에선 아직 `createSession`): `login`이 `server.open()` → `server.login(id)` → `ok`면 `progress.reset(snapshot)` 후 ID 저장, 아니면 throw.
- `nm.net`과 `createRequests`를 없앱니다(시스템 API를 부를 길이 adapter 밖에 없어짐).

- [ ] **Step 1: adapter 테스트를 새 API로 바꾸고 새 경우를 더합니다**

`online()` 도우미는 `server.open()` → `onOpen` → `server.login("hero")` → AuthLogin에 `{ snapshot, session }`으로 답합니다. `keep` 호출은 없앱니다. 더할 테스트:

```ts
test("login answers with the save and keeps the session, which a dropped connection resumes", …);
  // onResumed 리스너가 재개 스냅숏을 받는지, 재개 요청 body가 { token: session.token }인지
test("a refused login resolves with the error and keeps no session", …);
  // Rejected(SessionExpired 아님, StageNotFound 같은 임의 코드) → { ok: false, error }; 이어서 끊기면 status "offline", 재연결 없음
test("send resolves an accepted command's sync and a refused one's error; other failures reject", …);
  // Ok+sync → { ok: true, sync }, Rejected → { ok: false, error }, ServerError → rejects /Command failed/
```
나머지 기존 테스트(재연결 지연, 무응답 포기, ping, waiting, close)는 이름과 기대를 그대로 둡니다.

`progress.test.ts`는 가짜 연결 대신 가짜 `GameServer`(`send`가 테스트가 쥔 Promise를 돌려줌, `onResumed`가 리스너를 저장)를 씁니다. 테스트 이름과 기대는 그대로이고, `maxUnanswered`에 `MAX_UNANSWERED_COMMANDS`를 넘깁니다.

- [ ] **Step 2: 실패 확인** — Run: `npm run typecheck -w @idle/client` / Expected: FAIL

- [ ] **Step 3: 포트와 adapter, progress, account를 구현합니다**

`composition.ts`가 `createServerClock()`을 adapter에, 같은 객체를 `Clock`으로 progress에 넘기고, `MAX_UNANSWERED_COMMANDS`를 `@idle/protocol`에서 가져와 넘깁니다. integration `client-server.test.ts`의 `nm.net.req` 기대 줄을 지웁니다.

- [ ] **Step 4: application이 protocol을 모르는지와 전체 검사를 봅니다**

Run: `grep -rn "@idle/protocol" client/TypeScript/src/{domain,application,presentation} ; npm run typecheck && npm test`
Expected: grep 출력 없음, 모두 통과.

### Task 9: account 유스케이스, 로그인 상태, `Logger`, 화면 포트

**Files:**
- Modify: `src/application/ports.ts`, `src/application/state/app-state.ts`, `src/application/account/account.ts`, `src/application/app/app-flow.ts`, `src/presentation/view-models/login.ts`, `src/presentation/view-models/main.ts`, `src/composition.ts`, `src/unity/boot.ts`, `src/unity/nm.ts`
- Create: `src/presentation/screens.ts`, `src/presentation/ui/waiting.ts`, `src/unity/views/index.ts`, `test/account.test.ts`, `test/screens.test.ts`, `integration/test/support/views.ts`
- Delete: `src/unity/flow.ts`
- Test: `test/flow.test.ts`, `test/mvvm.test.ts`, `test/build.test.ts`(기대 그대로), `integration/test/*.test.ts`, `integration/test/support/loopback.ts`

**Interfaces:**
- Produces:
  ```ts
  // application/ports.ts
  export interface Logger { info(...args: unknown[]): void; warn(...args: unknown[]): void; error(...args: unknown[]): void }
  // application/state/app-state.ts
  export interface LoginState { readonly pending: string | null; readonly failed: string | null }
  // AppState에 `readonly login: LoginState`, initialAppState.login = { pending: null, failed: null }
  // application/account/account.ts
  export interface Account { lastLoginId(): string; login(loginId: string): Promise<void>; logout(): void }
  export function createAccount(options: {
    server: GameServer; progress: Pick<Progress, "reset">; login: Slice<LoginState>;
    storage: DeviceStorage; runtime: AppRuntime; logger: Logger;
  }): Account;
  // application/app/app-flow.ts
  export type Screens = { readonly [S in AppFlowState]?: (scope: Scope) => void };
  export function createAppFlow(options: {
    state: ReadonlyStore<AppState>; flow: Slice<AppFlowState>;
    account: Pick<Account, "lastLoginId" | "login">; progress: Pick<Progress, "clear">; screens: Screens;
  }): Flow<AppFlowState>;
  // presentation/screens.ts
  export interface Views { readonly login: View<LoginViewModel>; readonly main: View<MainViewModel> }
  export function createScreens(options: {
    state: ReadonlyStore<AppState>; data: GameData; account: Account; progress: Pick<Progress, "send">;
    ui: Pick<UiStack, "show">; views: Views; logger: Logger;
  }): Screens;
  // presentation/ui/waiting.ts — moved from services.ts unchanged
  export function blockWhileWaiting(state: ReadonlyStore<AppState>, block: () => () => void): void;
  // presentation/view-models/login.ts
  export function createLoginViewModel(options: { state: ReadonlyStore<AppState>; account: Pick<Account, "login" | "lastLoginId"> }): LoginViewModel;
  // presentation/view-models/main.ts
  export function createMainViewModel(options: {
    state: ReadonlyStore<AppState>; data: GameData; progress: Pick<Progress, "send">;
    account: Pick<Account, "logout">; logger: Logger;
  }): MainViewModel;
  // unity/views/index.ts
  export const views: Views;
  ```
- `account.login(id)`는 reject하지 않습니다: `pending !== null`이면 아무것도 안 함; `!isValidLoginId(id)`면 서버에 보내지 않고 `{ pending: null, failed: id }`; 아니면 `{ pending: id, failed: null }` → `server.open()`, `server.login(id)` → ok면 `progress.reset(snapshot)`, `storage.set("lastLoginId", id)`, `{ pending: null, failed: null }`; 거절·실패면 `logger.warn("[login] Login failed:", 이유)`, `{ pending: null, failed: id }`. `logout()`은 지금과 같습니다.
- 앱 흐름의 login 진입: `progress.clear()` → `screens.login?.(scope)` → 구독 둘(지금과 같음) → `network.ended === null`이고 `isValidLoginId(account.lastLoginId())`면 `void account.login(saved)`.
- 로그인 뷰모델: 상태는 입력 중인 ID뿐(처음 값 `account.lastLoginId()`). `canLogin = isValidLoginId(입력) && login.pending === null`. `status` 우선순위: `pending !== null` → "로그인 중…"; `failed === 입력` → 실패 문구; 입력이 비지 않았고 무효 → 형식 안내; `network.ended` → 그 이유 문구; 그 밖 "". `login()`은 `canLogin`일 때만 `account.login(입력)`.
- `createScreens`: `login`/`main` 상태에서 뷰모델을 만들어 `ui.show(views.x, vm, scope)`; reject되면 `logger.error(\`[ui] ${view.prefab} did not open:\`, error)`. boot/update는 화면이 없습니다.
- `unity/boot.ts`: `[flow] <state>`를 지금 `state.flow`로 한 번 찍고, 바뀔 때마다 찍습니다(구독은 `start()` 전에).

- [ ] **Step 1: account 테스트를 씁니다** (가짜 `GameServer`, `Map` 저장소, `vi.fn()` 로거)

```ts
test("logs in: pending while it runs, then the save and the saved ID", …);
  // 진행 중 login === { pending: "hero", failed: null }; 끝나면 { pending: null, failed: null }, progress.reset(snapshot) 1회, storage.get("lastLoginId") === "hero"
test("a second login while one is pending does nothing", …);
  // 첫 login이 끝나기 전 두 번째 호출 → server.login 호출 1회
test("a refused or failed login records the ID that failed and logs why", …);
  // { ok: false, error } 와 reject 둘 다: login === { pending: null, failed: "hero" }, logger.warn 1회, storage에 저장 없음
test("an ID the rules refuse is not sent", …);
  // login("No!") → server.open 호출 0회, failed === "No!"
test("logging out forgets the ID and restarts", …);
```

- [ ] **Step 2: 화면·흐름·뷰모델 테스트를 씁니다**

`test/screens.test.ts`:
```ts
test("each state opens its view bound to a fresh view model", …);
  // 가짜 ui.show가 (view, vm) 기록: login → views.login과 LoginViewModel, main → views.main
test("a view that does not open is logged and the flow carries on", …);
  // ui.show가 reject → logger.error가 "[ui] UI/LoginScreen did not open:"로 1회; 앱 흐름은 저장이 오면 main으로 감
```
`flow.test.ts`의 앱 흐름 테스트는 가짜 `account`(`lastLoginId`, `login: vi.fn()`)와 `progress`(`clear: vi.fn()`)로 바꾸고, 이름과 기대(자동 로그인 조건, 세션 종료 시 login으로·저장 비움 = `clear` 호출)를 유지합니다. `mvvm.test.ts`의 로그인 테스트는 스토어의 `login`·`network` 슬라이스로 상태를 만들고, "a failure shows on screen until the ID changes"는 `failed: "hero"`일 때 입력 "hero" → 실패 문구, 입력 "hero2" → 실패 문구가 사라짐을 확인합니다.

- [ ] **Step 3: 실패 확인** — Run: `npm run typecheck -w @idle/client` / Expected: FAIL

- [ ] **Step 4: 구현합니다**

`composition.ts`가 `sliceOf(store, "login")`을 account에, `createScreens({ … views, logger })`의 결과를 `createAppFlow`에 넘기고 `blockWhileWaiting(store, ui.block)`을 부릅니다. `startApp(bridge, config, views, logger = console)`로 바꿉니다. `unity/nm.ts`의 `nm.session`은 Task 10에서 `nm`이 없어질 때까지 `account`를 가리킵니다.

integration: `support/views.ts`의 `captureViews(): { views: Views; login(): LoginViewModel | undefined }`는 login 뷰의 `bind`에서 마지막 VM을 기억하고 main 뷰의 `bind`는 아무것도 하지 않습니다. 세 테스트 파일 모두 `startApp(bridge, config, captureViews().views)`로 부릅니다. loopback의 `resources.load`는 `{ release() {} }`로 resolve, `ui.create`는 `{ root: {} as ViewRoot, destroy() {} }`를 돌려주게 바꿉니다. 뷰는 로드 뒤에 바인딩되므로 `login.test.ts`의 `startClient`는 `vi.waitFor(() => expect(captured.login()).toBeDefined())`로 기다립니다.

- [ ] **Step 5: 통과 확인**

Run: `npm run typecheck && npm test`
Expected: 모두 통과. `build.test.ts`가 `[flow] boot\n[flow] update\n[flow] login\n`을 그대로 봅니다.

### Task 10: `nm`을 없애고 `App`으로

**Files:**
- Modify: `src/composition.ts`, `src/application/progress/progress.ts`, `src/unity/boot.ts`, `integration/test/*.test.ts`
- Delete: `src/unity/nm.ts`, `src/unity/by-name.ts`

**Interfaces:**
- Produces:
  ```ts
  // application/progress/progress.ts — `cmd` joins Progress
  export type Commands = { readonly [N in CommandName]: (fields: Omit<CommandOf<(typeof Opcode)[N]>, "type">) => Promise<GameError | undefined> };
  // Progress에 `readonly cmd: Commands` (Opcode에서 isCommandOpcode인 것만, by-name.ts의 byName 그대로 옮김)
  // composition.ts
  export interface App {
    readonly data: GameData;
    readonly state: ReadonlyStore<AppState>;
    readonly clock: Clock;
    readonly account: Account;
    readonly progress: Pick<Progress, "send" | "cmd">;
    readonly ui: UiStack;
    readonly resources: Resources;
    start(): void;
  }
  export function createApp(bridge: Bridge, config: ClientConfig, data: GameData, views: Views, logger?: Logger): App;
  export function startApp(bridge: Bridge, config: ClientConfig, views: Views, logger?: Logger): Promise<App>;
  ```

- [ ] **Step 1: integration 테스트를 `App`으로 바꿉니다**

`createNm(...)`을 지우고 `startApp`의 결과를 씁니다: `nm.session.*` → `app.account.*`, `nm.game.cmd` → `app.progress.cmd`, `nm.state` → `app.state`, `nm.time.clock` → `app.clock`. 흐름을 시작하던 곳은 `app.start()`. 테스트 이름과 기대값은 그대로이고, `client-server.test.ts`는 `expect(Object.keys(app.progress.cmd)).toEqual(["StageSelect"])`를 유지합니다.

- [ ] **Step 2: 실패 확인** — Run: `npm run typecheck -w @idle/integration` / Expected: FAIL (`App` 없음)

- [ ] **Step 3: `App`과 `cmd`를 만들고 `nm`을 지웁니다**

`unity/boot.ts`는 `const app = await startApp(unityBridge, config, views)` → `[GameData]` 로그(`app.data`) → flow 로그 구독 → `app.start()`. `globalThis.nm` 선언이 사라집니다.

- [ ] **Step 4: 남은 사용처가 없는지와 전체 검사**

Run: `grep -rn "\bnm\b\|createNm\|by-name" client/TypeScript/src client/TypeScript/test integration/test ; npm run typecheck && npm test`
Expected: grep 출력 없음, 모두 통과.

### Task 11: 층 규칙 검사와 Phase 2 마무리

**Files:**
- Modify: `scripts/check-boundaries.mjs`

**Interfaces:**
- Consumes: 스펙 4.2의 표.
- Produces: `checkClientLayers`가 파일의 층(`domain`, `application`, `adapters`, `presentation`, `composition`(`composition.ts`), `unity`, `host`, `main`(`main.ts`))을 정하고, 상대 import의 대상 층이 표에 있는지, `@idle/protocol`이 `adapters`·`composition`에서만, `csharp`·`puerts`·`CS.`가 `unity`에서만, `/\b(console\.|Date\.now|setTimeout|setInterval|clearTimeout|clearInterval|Math\.random)/`가 `domain`·`application`·`presentation`에 없는지 검사합니다. 기존 `core/`·`nm` 규칙과 머리 주석을 이 규칙으로 바꿉니다.

- [ ] **Step 1: 규칙을 구현하고 지금 코드가 통과하는지 봅니다**

Run: `node scripts/check-boundaries.mjs`
Expected: `Workspace and client layer boundaries hold.`

- [ ] **Step 2: 규칙이 실제로 잡는지 봅니다**

`src/domain/progress/prediction.ts`에 `console.log(1);`, `src/presentation/observable.ts`에 `import "../adapters/net/ports.js";`, `src/application/scope.ts`에 `import "@idle/protocol";`을 임시로 넣고 실행합니다.
Run: `node scripts/check-boundaries.mjs`
Expected: exit 1, 세 위반이 모두 출력됨. 그 뒤 세 줄을 되돌리고 다시 실행해 통과를 봅니다.

- [ ] **Step 3: 번들 크기를 비교합니다**

Run: `npm run build:release -w @idle/client && wc -c client/TypeScript/dist/release/main.mjs`
Expected: 바이트 수. Task 4 Step 1 값과의 차이를 결과 보고에 적습니다.

- [ ] **Step 4: 전체 검사**

Run: `npm run typecheck && npm test`
Expected: 모두 통과.

- [ ] **Step 5: Phase 2 커밋 (사용자 확인 후)**

```bash
git add -u && git add client/TypeScript/src client/TypeScript/test integration/test/support
git status --short   # client/TypeScript/AGENTS.md, integration/AGENTS.md가 staged 목록에 없는지 확인
git commit -m "refactor(client): split the TypeScript client into clean architecture layers"
```

---

## Phase 3 — C#

### Task 12: 어셈블리 분리와 Facades ↔ Runtime 순환 제거 (C1, C2)

**Files (`client/Assets/` 기준):**
- Create: `Scripts/Views/PortfolioIdleRpg.Views.asmdef`, `Scripts/Facades/PortfolioIdleRpg.Facades.asmdef`, `Scripts/Runtime/PortfolioIdleRpg.Runtime.asmdef`, `Editor/PortfolioIdleRpg.Editor.asmdef`, `Scripts/Facades/AssemblyInfo.cs`, `Scripts/Facades/SafePath.cs`, `Scripts/Facades/FacadeLifecycle.cs` (+ Unity가 만드는 `.meta`)
- Modify: `Scripts/Facades/RuntimeFacade.cs`, `Scripts/Facades/FileFacade.cs`, `Scripts/Runtime/TypeScriptRuntime.cs`, `Scripts/Runtime/TypeScriptRuntimeSettings.cs`, `Scripts/Runtime/TypeScriptFileLoader.cs`

**Interfaces:**
- asmdef 참조:
  - Views → 없음
  - Facades → `PortfolioIdleRpg.Views`, `com.tencent.puerts.core`, `Unity.TextMeshPro`, `Unity.InputSystem`, `UnityEngine.UI`
  - Runtime → `PortfolioIdleRpg.Facades`, `com.tencent.puerts.core`, `com.tencent.puerts.v8`
  - Editor(`includePlatforms: ["Editor"]`) → 위 셋, `com.tencent.puerts.core`, `com.tencent.puerts.core.Editor`
- `AssemblyInfo.cs`: `[assembly: InternalsVisibleTo("PortfolioIdleRpg.Runtime")]`
- `SafePath`: `internal static string ResolveChild(string root, string relativePath)` — `TypeScriptRuntimeSettings.ResolveChildPath`의 본문을 옮긴 것. 그 메서드는 지우고 사용처(설정, 로더, 런타임, FileFacade)가 이것을 씁니다.
- `RuntimeFacade`: `[Preserve] public static void Restart()`가 내부 플래그를 세우고, `internal static bool TakeRestartRequest()`가 값을 돌려주며 끕니다. `TypeScriptRuntime`의 `restartRequested`와 `RequestRestart`는 지웁니다. `Start`는 `RuntimeFacade.TakeRestartRequest()`로 남은 요청을 버리고, `Tick`은 `if (!RuntimeFacade.TakeRestartRequest()) return;`.
- `FileFacade`: `internal static string Root { get; set; }`. `Read`는 `Root`가 없으면 `InvalidOperationException("FileFacade.Read was called before the TypeScript runtime started.")`, 있으면 `SafePath.ResolveChild(Root, relativePath)`를 읽습니다. `TypeScriptRuntime.Start`가 스크립트 환경을 만들기 전에 `FileFacade.Root = root`.
- `FacadeLifecycle`: `internal static void Shutdown()` — `UiFacade.DestroyAll()` → `WebSocketFacade.CloseAll()` → `ResourceFacade.ReleaseAll()`. `TypeScriptRuntime.Dispose`는 `FacadeLifecycle.Shutdown(); scriptEnv?.Dispose(); scriptEnv = null;`.

- [ ] **Step 1: Unity가 연결되어 있는지 봅니다**

Run: `unity status`
Expected: 포트 7800, 상태 `ready`, 프로젝트 `…/portfolio-idle-rpg/client`.

- [ ] **Step 2: asmdef와 코드 변경을 씁니다**

- [ ] **Step 3: Unity에서 다시 가져오고 컴파일합니다**

Run: `unity command eval 'UnityEditor.AssetDatabase.Refresh();' && unity command recompile && unity command recompile_status`
Expected: 컴파일 완료, `compilationFailed: false`.

- [ ] **Step 4: 오류가 없고 어셈블리가 나뉘었는지 봅니다**

Run: `unity command console` 과 `unity command eval 'return typeof(PortfolioIdleRpg.Facades.UiFacade).Assembly.GetName().Name + "," + typeof(PortfolioIdleRpg.Views.ViewRefs).Assembly.GetName().Name + "," + typeof(PortfolioIdleRpg.Runtime.TypeScriptRuntime).Assembly.GetName().Name;'`
Expected: 콘솔 오류 0; `PortfolioIdleRpg.Facades,PortfolioIdleRpg.Views,PortfolioIdleRpg.Runtime`. 새 `.meta` 7개가 생겼습니다(`git status --short client/Assets`).

### Task 13: UiFacade 분리(C3), 타입 정의 생성(C4), 플레이 모드 확인

**Files (`client/Assets/` 기준):**
- Create: `Scripts/Facades/UiRoot.cs`, `Scripts/Facades/KoreanFontFallback.cs` (+ `.meta`)
- Modify: `Scripts/Facades/UiFacade.cs`, `Editor/TypeScript/TypeScriptTypings.cs`

**Interfaces:**
- `UiRoot`(internal static): 지금 `UiFacade`의 `EnsureRoot`, `Stretched`, `Discard`와 `root`·`layers`·`blocker` 필드, `DestroyAll`의 본문을 옮깁니다. 멤버: `Transform Layer(int layer)`, `void SetBlocking(bool blocking)`, `void DestroyAll()`.
- `KoreanFontFallback`(internal static): `KoreanFonts` 목록과 `AddKoreanFallback` 본문, `DestroyAll`의 대체 폰트 제거. 멤버: `void Add()`, `void Remove()`.
- `UiFacade`: TS가 부르는 public 멤버(`Screen`, `Popup`, `Overlay`, `Create`, `Destroy`, `SetBlocking`, `BackPressed`)와 `internal static void DestroyAll()`(→ `UiRoot.DestroyAll(); KoreanFontFallback.Remove();`)만 남깁니다. public 시그니처는 그대로입니다.
- `TypeScriptTypings.Types`: `typeof(Facades.FileFacade).Assembly`와 `typeof(Views.ViewRefs).Assembly` 둘의 타입을 훑습니다.

- [ ] **Step 1: 분리하고 컴파일합니다**

Run: `unity command eval 'UnityEditor.AssetDatabase.Refresh();' && unity command recompile && unity command recompile_status && unity command console`
Expected: `compilationFailed: false`, 콘솔 오류 0.

- [ ] **Step 2: 타입 정의가 그대로 생성되는지 봅니다**

Run: `unity command eval --timeout 120000 'PortfolioIdleRpg.Editor.TypeScriptTypings.Generate();' && git diff --exit-code client/TypeScript/types/csharp.d.ts`
Expected: exit 0(변경 없음). 변경이 있으면 선언 순서만 바뀌었는지 보고, 멤버가 빠지거나 늘었으면 멈추고 원인을 찾습니다.

- [ ] **Step 3: 플레이 모드에서 지금 동작과 같은지 봅니다**

로컬 서버를 띄우고(README "개발 시작"의 서버 명령) `npm run build:dev -w @idle/client` 뒤, `unity command editor_play`로 `Scenes/01_Init`을 실행합니다. 확인할 것:
- 콘솔: `[TypeScript] Development: …`, `[GameData] Items: …`, `[flow] boot`, `[flow] update`, `[flow] login` 순서, 오류 0
- 잘못된 ID 입력 시 형식 안내와 비활성 버튼 → 유효한 ID로 로그인 → `[flow] main`, 메인 화면에 `<ID>  Lv.1`과 스테이지 이름
- 다음 스테이지 버튼 → 스테이지 이름이 바뀜
- 로그아웃 → `[TypeScript] Restarting.` 한 번, LoginScreen 하나, 입력 칸 빈 값
- 다시 로그인 → 플레이 종료 → 다시 플레이 → 저장된 ID로 자동 로그인해 main

`unity command capture_game_view`의 저장 경로는 `Temp/…`로 주고, 끝나면 생긴 `Assets/Temp`를 지웁니다. 끝나면 `unity command editor_stop`, 서버 종료, PlayerPrefs `lastLoginId` 삭제.

- [ ] **Step 4: Phase 3 커밋 (사용자 확인 후)**

```bash
git add -u && git add client/Assets/Scripts client/Assets/Editor/PortfolioIdleRpg.Editor.asmdef client/Assets/Editor/PortfolioIdleRpg.Editor.asmdef.meta
git status --short   # client/AGENTS.md, Assets/Temp가 없는지 확인
git commit -m "refactor(client): split the C# scripts into Views, Facades and Runtime assemblies"
```

---

## Phase 4 — 문서

### Task 14: README와 백로그, 남은 확인

**Files:**
- Modify: `README.md`, `docs/foundation-backlog.md`

- [ ] **Step 1: README를 고칩니다**

- "리포지토리 구조": `shared/codes` 추가, 공용 패키지 의존 방향(`game-core → codes, big-number, data-schema`, `protocol → codes, big-number, game-core`).
- "클라이언트 구조": 층 표(스펙 4.1·4.2), 컨텍스트, 포트 위치, `App`(전역 `nm` 없음), 슬라이스 소유.
- "화면: MVVM": `Screens` 포트와 `createScreens`, 로그인 상태가 스토어에 있다는 것, 바인딩이 `unity/binding`에 있고 `ViewRoot`로 넘어온다는 것.
- 서버 절의 "게임 커맨드를 추가할 때는 protocol의 `Opcode`와 `Command`에 정의" → "`@idle/codes`의 `Opcode`와 `game-core`의 `Command`에 정의".
- C# 쪽 설명에 asmdef 넷과 의존 방향, `FacadeLifecycle`.

- [ ] **Step 2: 백로그를 고칩니다**

설계 원칙의 `core/`·`unity/`·`nm` 줄을 층 구조와 `App` 설명으로, 32번 항목의 "검증 규칙은 `protocol`에서 서버와 공유"를 "`game-core`에서"로 바꿉니다.

- [ ] **Step 3: 이전 이름이 문서에 남지 않았는지 봅니다**

Run: `grep -n "nm\.\|core/\|createNm\|services\.ts\|core/bridge" README.md docs/foundation-backlog.md`
Expected: 출력 없음(다른 뜻의 `core/`, 예를 들어 `Packages/core/`는 허용).

- [ ] **Step 4: 전체 검사**

Run: `npm run typecheck && npm test`
Expected: 모두 통과.

- [ ] **Step 5: 맞지 않게 된 `AGENTS.md` 줄을 모아 보고합니다**

Run: `grep -n "core/\|nm\b\|nm\.\|game-core\` → \`protocol\|손으로 선언\|csharp.d.ts" AGENTS.md */AGENTS.md */*/AGENTS.md`
Expected: 고칠 줄 목록. 파일은 고치지 않고 사용자에게 보여 줍니다.

- [ ] **Step 6: Phase 4 커밋 (사용자 확인 후)**

```bash
git add README.md docs/foundation-backlog.md docs/superpowers
git commit -m "docs: describe the layered client and where domain types live"
```
