# idle/ (키우기)

Unity 6 + PuerTS 클라이언트(`client/`), Node 서버(`server/`), 공용 TS 패키지(`shared/`), 기획 데이터(`data/`)입니다. 설명은 [MANUAL.md](MANUAL.md), 할 일은 [docs/backlog.md](docs/backlog.md)에 있습니다.

- 의존은 `client`, `server` → `shared` 방향입니다. 클라이언트와 서버는 서로 import하지 않고, 둘을 같이 쓰는 테스트는 `integration/`에 둡니다. 밸런스 시뮬레이션(`balance/`)은 `shared`와 `server`의 새 계정 생성만 씁니다. 공용 안은 `data-schema` → `big-number`, `game-core` → `codes`·`big-number`·`data-schema`, `protocol` → `codes`·`big-number`·`game-core`입니다(루트의 `scripts/check-boundaries.mjs`가 검사). 도메인 타입은 `game-core`, 와이어 번호는 `codes`, 전송 계약은 `protocol`에서 가져옵니다.
