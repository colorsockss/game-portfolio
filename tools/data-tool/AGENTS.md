# @idle/data-tool

Excel → JSON·MessagePack·TS 로더 컴파일러입니다(순수 JS). 시트 규칙은 [README.md](README.md)에 있고, 테스트는 `node --test`입니다.

- 게임은 portable 출력만 씁니다. 호스트 API 없이 바이트만 받는 성질을 유지합니다.
- 데이터 검사 규칙은 스키마 시트의 검사 열(`ref`, `enum`, `range`, `length`, `when`)로만 더합니다. 게임별 테이블 이름이나 규칙을 툴 코드에 넣지 않습니다(예외는 예약 이름 `Enums`).
- 같은 입력이면 출력이 바이트까지 같아야 합니다. 시각이나 절대 경로를 출력에 넣지 않습니다.
- 출력 모양을 바꾸면 루트에서 `npm run generate`를 실행하고 함께 커밋합니다.
- `sheets/`는 예제입니다. 게임 원본은 루트 `data/`입니다.
