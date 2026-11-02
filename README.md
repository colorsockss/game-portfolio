# 게임 개발 포트폴리오

클라이언트, 서버, 개발 툴을 처음부터 직접 만든 게임 포트폴리오입니다. 게임 두 개와 두 게임이 함께 쓰는 데이터·공식 툴이 한 저장소에 있습니다.

| 프로젝트 | 한 줄 소개 | 기술 | 상태 |
| --- | --- | --- | --- |
| [키우기 (idle)](idle/README.md) | 방치형 RPG. 클라이언트가 예측하고 서버가 같은 규칙으로 확정 | Unity 6, PuerTS(TypeScript), Node, SQLite | 개발 중, Android·Live 서버 배포 |
| [MMORPG (mmo)](mmo/README.md) | 틱 기반 상태 서버 하나에 Unity와 Unreal 클라이언트가 붙는 MMO | C#(.NET) 서버, Unity(C#), Unreal(C++) | 준비 중 |
| [데이터 툴](tools/data-tool/README.md) | Excel → MessagePack 데이터와 타입 있는 로더, 테이블 간 참조 검사 | Node | 두 게임이 함께 씀 |
| [공식 툴](tools/formula-tool/README.md) | 게임 공식 편집, 코드 생성, 전투 미리보기 데스크톱 앱 | Tauri, SvelteKit | 두 게임이 함께 씀 |

## 구조

```
idle/                키우기
  client/            Unity 프로젝트 (게임 로직은 TypeScript/, C#은 엔진 브리지만)
  server/            게임 서버
  shared/            클라이언트와 서버가 반드시 같은 코드를 써야 하는 것
  integration/       클라이언트와 서버를 함께 돌리는 테스트
  balance/           밸런스 시뮬레이션
  data/              기획 데이터 원본
  docs/              백로그, 성능, 릴리스, 설계 기록
mmo/                 MMORPG (준비 중)
tools/
  data-tool/         Excel → 데이터와 타입 있는 로더, 테이블 간 검사
  formula-tool/      공식 편집, 코드 생성, 전투 미리보기 (데스크톱 앱)
scripts/             생성 파일 갱신·검사, import 경계 검사
```

## 라이선스

[MIT](LICENSE)
