# shared/

클라이언트와 서버가 같은 코드를 돌려야 하는 것만 둡니다. 한쪽만 쓰는 것(저장 마이그레이션, 표기, 시계 등)은 그쪽에 둡니다.

- 예외: `game-core/src/testing.ts`(`@idle/game-core/testing`)는 여러 워크스페이스의 테스트가 함께 쓰는 테스트 계정(`testPlayer`)과 결과 꺼내기(`accepted`)입니다. 게임 코드에서는 import하지 않습니다.
- 호스트 API(`csharp`, `node:*`, DOM, `Date.now()`)를 쓰지 않습니다. 시각은 `now` 인자로 받습니다.
- 규칙 계산은 double의 사칙연산·비교, `Math.max/min/floor/round/abs`, 난수 생성기의 `Math.imul`과 비트 연산, `Big` 연산만 씁니다. 클라이언트와 서버 결과가 비트까지 같아야 하므로 `Math.random`, `Math.pow`, `Math.log*`는 쓰지 않습니다. 루트 `scripts/check-boundaries.mjs`가 `npm test`에서 검사합니다.
- 빌드 없이 `src/index.ts`를 내보냅니다. 테스트 타입 검사는 `test/tsconfig.json`으로 따로 합니다.
- 새 패키지는 `scripts/check-boundaries.mjs`에 등록합니다.
