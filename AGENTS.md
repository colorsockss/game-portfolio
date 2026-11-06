# AGENTS.md

게임 포트폴리오 두 개와 두 게임이 함께 쓰는 툴의 저장소입니다. 소개는 [README.md](README.md), 설정·명령·CI는 [MANUAL.md](MANUAL.md)에 있고, 하위 폴더의 AGENTS.md가 규칙을 더합니다.

- `idle/`: 키우기. Unity 6 + PuerTS 클라이언트, Node 서버, 공용 TS 패키지의 npm workspaces. 규칙은 [idle/AGENTS.md](idle/AGENTS.md), 할 일은 [idle/docs/backlog.md](idle/docs/backlog.md).
- `mmo/`: MMORPG. Unity(C#만, PuerTS 없음, UI Toolkit + App UI)와 Unreal(C++, UMG) 클라이언트, C# MMO 서버, Protobuf 패킷. 패킷 정의만 있는 초기 단계이며 규칙은 [mmo/MANUAL.md](mmo/MANUAL.md), 할 일은 [mmo/docs/backlog.md](mmo/docs/backlog.md).
- `tools/`: 두 게임이 함께 쓰는 데이터·공식 툴.

## 명령 (루트에서)

```sh
npm run check       # 커밋하지 않은 변경에 맞는 검사만
npm run typecheck
npm test            # 생성 파일 검사 → import 경계 검사 → 전체 테스트(mmo의 C# 포함)
npm run generate    # 게임의 원본(data/, packets.proto) → 생성 파일
```

끝내기 전에 `npm run check`를 통과시킵니다. 커밋하지 않은 변경(추적하지 않는 파일 포함)을 보고 문서(`*.md`)만이면 건너뛰고, `mmo/`는 생성 파일 검사와 `test:mmo`(C#), 나머지는 `typecheck`와 전체 `test`를 돌립니다. 검사를 건너뛰었으면 그렇다고 밝히고, Unity에서만 확인되는 변경은 확인하지 못했다고 밝힙니다. CI는 늘 전체를 돌립니다.

## 구조

- 게임끼리는 서로 import하지 않습니다. 두 게임이 함께 쓰는 것은 `tools/`뿐이고, 툴은 게임 코드를 import하지 않고 생성 파일을 쓸 뿐입니다(툴의 테스트만 생성 코드를 실제 `@idle/big-number`로 실행해 봅니다).
- 게임 안에서 클라이언트와 서버가 어긋나면 버그인 것만 그 게임의 `shared/`에 둡니다. 한쪽만 쓰는 것은 그쪽에 둡니다.
- 같은 개념을 두 번 정의하고 매핑으로 잇지 않습니다. 예: `Opcode`가 와이어 번호이자 커맨드의 `type`입니다.
- 설계는 변경량이 아니라 구조로 고르고, 기술 비교에는 성능·서버 비용 수치를 넣습니다.
- 결제, 광고, 외부 SDK는 범위 밖입니다. 로그인은 텍스트 ID입니다.

## 동시성과 데이터 무결성

- **Race Condition**: `await`마다 다른 코드가 끼어듭니다. 확인과 쓰기를 한 트랜잭션이나 한 동기 구간에 둡니다. 같은 계정이라도 재연결 전후 두 연결의 요청은 동시에 돕니다.
- **Idempotency**: 같은 요청 id가 다시 오면 한 번만 적용하고 같은 답을 줍니다. 보상·정산은 지급 기록을 지급과 같은 저장에서 갱신합니다.
- **Atomic Operation**: 읽고 계산해서 쓰는 대신 조건부 문장 하나(`UPDATE … WHERE revision = ?`, `INSERT … ON CONFLICT`)로 하고, 영향받은 행 수로 성공을 판단합니다.
- **Partial Write**: 함께 바뀌는 쓰기는 한 트랜잭션에 넣고, 실패는 throw로 되돌립니다. 원본 파일은 임시 파일에 쓴 뒤 rename으로 바꿉니다.
- **Database Transaction**: 짧게 유지합니다. 안에서는 `tx`만 쓰고 네트워크·타이머를 기다리지 않습니다. `return false`도 커밋됩니다.
- **Row Lock**: 쓰지 않고 `revision`으로 충돌을 감지합니다(낙관적 동시성). 써야 하면 짧게, 항상 같은 순서로 잠급니다.

## 생성 파일

`idle/shared/data-schema/src/tables/`, `idle/shared/data-schema/data/`, `idle/shared/game-core/src/formulas.ts`, `idle/shared/game-core/src/ability-type.ts`, `mmo/shared/contract/generated/`는 `npm run generate`의 출력입니다. 직접 고치지 않고 원본(`idle/data/`, `mmo/shared/contract/packets.proto`)과 함께 커밋합니다.

## 스타일

- 사용자에게 보이는 글은 한국어로 씁니다: 작업 중의 설명, 질문, 작업이 끝날 때의 보고와 요약(다음 단계 상자의 요약과 질문, 버튼 포함), 다른 세션에 보내는 보고. 코드 이름, 명령, 경로, 커밋 메시지는 그대로 둡니다. worktree 세션도 같습니다.
- 문서와 코드의 주석·설명(`//`, `/** */`, C# `///` 등 문서 주석 포함)은 한국어로 씁니다. 생성기가 생성 파일에 넣는 주석도 한국어입니다. 커밋 메시지, 테스트 이름, 오류·로그 메시지는 영어입니다. 주변 코드를 따릅니다.
- TS는 ESM, strict입니다. 타입만 쓰면 `import type`, 상대 import에는 `.js`를 붙입니다.
- C#은 Microsoft의 식별자 이름·코딩 규칙을 따릅니다. 이 프로젝트에 맞춘 내용과 예외는 [idle/client/AGENTS.md](idle/client/AGENTS.md)의 "C# 코딩 규칙"에 있습니다.
- 테스트는 각 워크스페이스의 `test/`에 vitest로 둡니다.
- 동작을 바꾸면 그 게임의 `MANUAL.md`를(소개에 드러나는 기능·수치가 바뀌면 `README.md`도), 백로그 항목을 끝내면 그 게임의 `docs/backlog.md`를 고칩니다.

## Git

- 커밋 메시지: `feat(client):`, `fix(server):`, `data:`, `chore:` 같은 영역 접두사 + 영어 명령문.
- 바이너리와 xlsx는 LFS입니다. `git lfs install` 없이 커밋하지 않습니다.
- Unity가 `idle/client/`를 열고 있을 수 있습니다. `switch`/`checkout`/`merge`/`stash` 대신 ref만 옮깁니다. 다른 브랜치는 `git branch -f`나 `git push origin <branch>:main`, 체크아웃된 브랜치는 `git update-ref` 뒤 `git reset -q`(인덱스만 맞춤)입니다. 다른 worktree에서 만든 커밋으로 옮겼다면 작업 트리에 그 변경이 없으므로 이어서 맞춥니다.
  - 옮기기 전에 작업 트리가 깨끗한지 봅니다. 쓰는 파일은 로컬에서 고친 것을 덮어씁니다.
  - 지운 파일을 먼저 지우고(`git diff --name-only -z --no-renames --diff-filter=D OLD NEW | xargs -0 rm -f`), 나머지를 씁니다(`--diff-filter=d … | xargs -0 git checkout --`). 지운 파일을 `checkout`하면 실패하고, `--no-renames`가 없으면 이름을 바꾼 파일의 옛 파일이 남습니다.
  - `package.json`이 바뀌었으면 `npm install`을 한 뒤 `typecheck`와 `test`를 돌립니다.
- worktree에서는 Unity 프로젝트를 열지 않습니다(배치 모드 포함). worktree에는 추적하는 파일만 있어서 `Library/`(수 GB)를 처음부터 다시 만들고 PuerTS도 `npm run setup`으로 다시 받아야 합니다. worktree는 엔진이 필요 없는 일(규칙, 서버, 클라이언트 TS, 툴, 문서, 테스트)에만 쓰고, 프리팹·씬·C#·플레이 모드 확인은 메인 체크아웃에서 한 번에 한 세션만 합니다.
