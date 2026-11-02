# @idle/game-core

클라이언트가 예측하고 서버가 검증하는 게임 규칙과, 그 규칙이 다루는 도메인 타입(저장 `PlayerState`, `Command`, `GameError`, 로그인 ID 규칙, `PlayerSnapshot`·`StateSync`)입니다. 클라이언트와 서버의 공유 커널입니다.

- `@idle/protocol`을 import하지 않습니다. 의존은 `codes`, `big-number`, `data-schema`뿐이고, 번호는 `@idle/codes`에서 가져옵니다.
- 와이어에 실리는 타입의 모양을 바꾸면 `PROTOCOL_VERSION`을 확인하고, `PlayerState`라면 서버 저장 마이그레이션도 추가합니다.

- 핸들러는 순수 함수입니다. 입력 `state`를 바꾸지 않고 바뀐 슬라이스만 새 객체로 만들며, 변화가 없으면 같은 `state`를 돌려줍니다.
- 규칙 위반은 `fail(code, message)`로 돌려줍니다. throw는 버그일 때만 씁니다.
- 네트워크 입력은 각 핸들러가 검증합니다.
- 시각은 `ctx.now`로만 받고, 큰 수는 `Big`으로 계산합니다.
- `src/formulas.ts`는 생성 파일입니다. 공식 key는 `E_AbilityType`에 있어야 합니다. 공식은 `Big` 코드라 `pow`는 `Big.pow`(정수 지수)이고 비결정적인 함수는 내보내기가 거절합니다. 공식의 입력(`FormulaInput`, 예: 효과의 `power`)은 `Formula.get`의 마지막 인자로 넘깁니다.
