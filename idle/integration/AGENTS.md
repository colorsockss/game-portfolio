# @idle/integration

클라이언트 앱(`startApp`이 돌려주는 `App`)과 실제 서버 처리(`@idle/server/testing`)를 함께 돌리는 테스트만 둡니다. 한쪽만 보는 테스트는 그 워크스페이스에 둡니다.

- 클라이언트는 소스 경로로 import합니다(`@idle/client/composition`, `@idle/client/presentation/...`). `csharp`를 쓰는 `unity/` 모듈은 가져오지 않습니다.
- 화면의 뷰모델은 `test/support/views.ts`의 `captureViews()`로 잡습니다. 뷰는 로드 뒤에 바인딩되므로 `vi.waitFor`로 기다립니다.
- 연결은 `test/support/loopback.ts`를 씁니다. `drop`, `loseNextAnswer`로 장애를 재현합니다.
- 실제 WebSocket 서버(`@idle/server/transport`)를 거쳐야 하는 흐름(프로토콜 버전 검사, 종료 코드)은 `test/support/websocket.ts`의 소켓을 씁니다.
- 비동기 결과는 `vi.waitFor`로 기다립니다.
