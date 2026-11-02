# @idle/server

WebSocket 게임 서버입니다(Node 22, `node:sqlite`, `ws`). `npm start -w @idle/server`는 빌드된 `dist/main.mjs`를 실행합니다.

- 커맨드는 game-core `applyCommand`로 검증합니다. 규칙을 서버에 따로 쓰지 않습니다.
- 시각은 요청마다 주입된 `Clock`에서 한 번 읽습니다.
- `store.ts`의 `schema`와 `save.ts`의 `migrations`는 끝에 덧붙이기만 합니다. `PlayerState`가 바뀌면 마이그레이션을 추가합니다.
- 계정당 연결은 하나입니다. DB에는 토큰 해시만 두고, 토큰을 로그에 남기지 않습니다.
- 로그는 주입된 `Logger`로 남깁니다. SQLite 세부는 `store.ts` 밖으로 내보내지 않습니다.

## 동시성

- 한 연결의 요청은 차례로, 다른 연결의 요청은 동시에 돕니다. store 호출 하나는 원자적이지만 호출 사이에는 다른 요청이 끼어듭니다.
- `store.transaction(tx => …)` 안에서는 `tx`만 씁니다. 바깥 `store`를 부르면 멈춥니다. 안에서 I/O를 기다리지 않습니다.
- "기록된 답이 있는가", "계정이 있는가" 같은 확인은 쓰기와 같은 트랜잭션에서 합니다.
- 저장은 `revision` 조건부 갱신입니다. 밀리면 다시 읽어 재적용합니다(최대 `SAVE_ATTEMPTS`).
- 커맨드의 답은 저장과 같은 트랜잭션에 요청 id로 기록합니다. 상태를 바꾸는 새 API도 같은 방식을 따릅니다.
- 연결 맵(`bound`) 같은 공유 메모리는 `await` 없이 바꿉니다.

## 테스트

저장소는 `openStore(":memory:")`, 시계는 주입합니다. 경합은 store 래퍼로 재현합니다(`test/rpc.test.ts`의 `racing`, `holding`).

## 부하 테스트

`tools/load/`(`npm run load`)는 배포 번들을 별도 프로세스로 띄우고 실제 WebSocket 클라이언트로 잽니다. 측정하려고 서버 코드를 바꾸지 않습니다. 서버 안의 값(CPU, 힙, 이벤트 루프, SQLite 시간)은 `--import`로 넣는 `probe.mjs`가 재고, DB는 임시 폴더에 둡니다.
