# @idle/data-schema

`src/tables/`와 `data/`는 생성 파일이므로 고치지 않습니다. 값은 `idle/data/*.xlsx`에서, 코드 모양은 `tools/data-tool`에서 바꿉니다.

- 손으로 쓰는 파일은 `src/index.ts`뿐입니다. 테이블을 추가하면 `TABLES`에 이름 하나를 더하면 `loadGameData`가 생성된 `deserialize<이름>MessagePack`으로 읽어 `GameData`의 `<첫 글자를 소문자로 한 이름>`에 둡니다.
- 로더에 호스트 API를 넣지 않습니다. 파일을 읽는 방법은 각 호스트가 넘깁니다.
