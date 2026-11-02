# @idle/protocol

클라이언트·서버 통신 계약(패킷별 요청·응답 모양, 봉투, 세션, 소켓 경로, 코덱)입니다. 동작은 넣지 않습니다. 도메인 타입(`PlayerState`, `Command`, `GameError` 등)은 `@idle/game-core`, 번호(`Opcode`, `GameErrorCode`)는 `@idle/codes`에 있고, 여기서 다시 내보내지 않습니다.

- `ResultCode`, `CloseCode`는 값을 명시한 숫자 enum입니다. 배포된 번호는 바꾸거나 다시 쓰지 않고, 문자열을 와이어에 싣지 않습니다.
- 와이어 크기는 필드별 바이트부터 보입니다. 압축 같은 개선은 제안만 합니다.
- 호환이 깨지면 `PROTOCOL_VERSION`을 올립니다. 이 패키지뿐 아니라 game-core의 와이어 타입(`PlayerState`, `Command`, `PlayerSnapshot`, `StateSync`, `GameError`)이 바뀔 때도 확인합니다. `PlayerState`가 바뀌면 서버 `save.ts`에 마이그레이션을 추가합니다.
- `test/wire.test.ts`가 대표 메시지의 바이트를 스냅숏으로 고정합니다. 실패하면 와이어가 바뀐 것입니다. 일부러 바꾼 경우에만 `PROTOCOL_VERSION` 판단과 함께 스냅숏을 갱신합니다.

**커맨드 추가**: codes `Opcode`에 번호 → game-core `Command` 유니온에 타입 → 필요하면 codes `GameErrorCode` → game-core `handlers`에 핸들러. 클라이언트 `app.progress.cmd`와 서버 처리는 자동으로 생깁니다.

**시스템 API 추가**: codes `Opcode`에 번호 → `api.ts`의 `SystemApis` → 서버 `rpc.ts`의 `systemApis` → 클라이언트 `application/ports.ts`의 `GameServer`에 메서드, `adapters/net/game-server.ts`에 구현.
