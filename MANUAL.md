# 저장소 매뉴얼

저장소 전체의 구조 규칙, 설정, 명령, CI입니다. 소개는 [README.md](README.md)에, 키우기의 구조·규칙·실행·빌드는 [idle/MANUAL.md](idle/MANUAL.md)에 있습니다.

## 구조

- **게임은 서로 독립**: 게임끼리는 서로 import하지 않습니다.
- **`shared/`에는 꼭 같아야 하는 것만**: 클라이언트와 서버가 어긋나면 버그인 코드만 그 게임의 `shared/`에 둡니다.
- **툴은 두 게임이 함께 사용**: 두 게임이 함께 쓰는 것은 `tools/`뿐이고, 툴은 게임 코드를 import하지 않고 각 게임에 생성 파일을 씁니다. 툴의 테스트만 big 열·Big 모드로 만든 코드를 실제 `@idle/big-number`(개발 의존)로 실행해 봅니다.
- **한 저장소인 이유**: 툴의 출력이 바뀌면 두 게임의 생성 파일을 한 커밋에서 함께 맞추고, `npm run generate -- --check`로 원본과 어긋나지 않게 지킵니다.

import 경계는 `test:idle`과 `test:tools`가 `scripts/check-boundaries.mjs`로 검사합니다. 이 검사는 루트 `workspaces`의 워크스페이스마다 import 규칙이 있고, `typecheck:idle`·`test:idle`이나 `typecheck:tools`·`test:tools`의 `-w`가 그것을 고르는지도 봅니다. npm의 `-w <폴더>`는 그 폴더 바로 아래의 워크스페이스만 고르므로, 워크스페이스를 더하면 그 영역 스크립트의 `-w`도 맞춥니다. 키우기 안의 패키지 방향은 [idle/MANUAL.md](idle/MANUAL.md#구조)에 있습니다.

## 처음 설정

Node.js 22.13 이상, .NET SDK 10(mmo의 패킷 코드 생성과 C# 테스트, `brew install --cask dotnet-sdk`), Git LFS가 필요합니다. 이미지, 사운드, 모델, 폰트, 네이티브 플러그인, xlsx는 `.gitattributes`에 따라 LFS로 저장됩니다. **LFS를 설치하지 않고 커밋하면 이 파일들이 일반 Git 객체로 들어가므로** 첫 커밋 전에 설치하세요. 수식툴 데스크톱 앱을 실행하려면 [Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/)(Rust 툴체인)도 필요합니다.

```sh
brew install git-lfs
git lfs install
git clone https://github.com/colorsockss/game-portfolio.git
cd game-portfolio
npm ci
```

게임별 설정(키우기의 PuerTS 설치, Unity 프로젝트 열기)은 [idle/MANUAL.md](idle/MANUAL.md#처음-설정)에 있습니다.

## 명령 (루트에서)

| 명령 | 설명 |
| --- | --- |
| `npm run check` | 커밋하지 않은 변경이 있는 영역의 검사만 (`scripts/check.mjs`): 문서(`*.md`)만이면 없음, `idle/`는 idle, `idle/shared/big-number/`는 idle과 tools(툴의 테스트가 씀), `tools/`는 tools와 idle(idle이 툴의 출력을 커밋함), `mmo/`는 mmo, 그 밖(루트의 `package.json`, `scripts/` 등)은 모든 영역. 영역마다 `typecheck:*`와 `test:*`(mmo는 `test:mmo`만) |
| `npm run typecheck` | 모든 워크스페이스 타입 검사. `typecheck:idle`, `typecheck:tools`는 그 영역만 |
| `npm test` | `test:idle` → `test:tools` → `test:mmo` |
| `npm run test:idle` | idle의 생성 파일 검사 → import 경계 검사 → idle 워크스페이스 테스트 |
| `npm run test:tools` | import 경계 검사 → 툴 테스트 |
| `npm run test:mmo` | mmo의 생성 파일 검사 → C# 테스트(`dotnet test mmo/mmo.slnx`: 패킷, 서버) |
| `npm run coverage` | idle의 vitest 워크스페이스마다 커버리지 표 |
| `npm run generate` | 게임의 원본(`idle/data/`, `mmo/shared/contract/packets.proto`)에서 테이블 로더·데이터·공식·패킷 코드 재생성 (`-- --check`는 검사만, `-- idle`이나 `-- mmo`는 그 게임만) |

키우기의 실행·빌드 명령은 [idle/MANUAL.md](idle/MANUAL.md)에 있습니다.

## CI

CI는 영역마다 워크플로 하나입니다. 각 워크플로는 `main`의 푸시와 PR 가운데 그 영역의 파일이 바뀐 것, 그리고 수동 실행(`workflow_dispatch`)에서 Ubuntu 24.04로 돕니다. 영역은 `npm run check`와 같아서(`scripts/check.mjs`) 둘을 함께 고치고, 문서(`*.md`)만 바뀐 커밋에서는 돌지 않습니다. 같은 PR이나 브랜치에 새 커밋이 오면 그 워크플로의 이전 실행을 취소합니다. 다른 브랜치는 PR을 열어야 돕니다.

| 워크플로 | 도는 변경 | 단계 |
| --- | --- | --- |
| [`idle-ci.yml`](.github/workflows/idle-ci.yml) | `idle/`, `tools/`(idle이 툴의 출력을 커밋함), `scripts/`, `package.json`, `package-lock.json`, `.nvmrc` | xlsx LFS → `npm ci` → `typecheck:idle` → `test:idle` |
| [`tools-ci.yml`](.github/workflows/tools-ci.yml) | `tools/`, `idle/shared/big-number/`(툴의 테스트가 씀), `scripts/check-boundaries.mjs`, `package.json`, `package-lock.json`, `.nvmrc` | `npm ci` → `typecheck:tools` → `test:tools` |
| [`mmo-ci.yml`](.github/workflows/mmo-ci.yml) | `mmo/`, `scripts/generate.mjs`, `package.json`(`test:mmo`), `.nvmrc` | .NET SDK 10 → `test:mmo`. LFS와 `npm ci`는 없음(`generate.mjs`는 Node 내장 모듈만 씀) |

Node는 22.14.0입니다(`.nvmrc`. 로컬과 같은 버전이고, idle 서버가 `node:sqlite`를 씁니다. 릴리스 워크플로도 같은 파일을 읽습니다). npm 캐시(`~/.npm`, 약 41 MB)는 `setup-node`가 `package-lock.json` 해시로 저장합니다. 키우기 릴리스(`idle-release.yml`)도 `typecheck:idle`과 `test:idle`만 돌리므로 툴이나 mmo의 실패가 키우기 Live 내보내기를 막지 않습니다. mmo의 엔진 빌드와 테스트(Unity, Unreal)는 로컬에서 하고, 클라이언트의 엔진 없는 검사는 그 클라이언트를 시작할 때 워크플로를 더합니다([mmo/docs/backlog.md](mmo/docs/backlog.md) 7, 8, 10).

- **LFS**: 체크아웃은 포인터만 받고, `idle-ci`만 `git lfs pull --include="idle/data/*.xlsx"`로 `generate --check`가 읽는 xlsx 15개(145,711바이트)를 받습니다. LFS 전체(981개, 약 241 MB, 2026-10-31. Unity 그림·오디오·폰트가 대부분)의 0.1%도 안 되고, 무료 다운로드량 월 10 GiB로 약 7만 회 실행할 수 있습니다. 툴의 테스트는 LFS 파일을 읽지 않습니다. 테스트가 다른 LFS 파일을 읽게 되면 `--include`에 더합니다.
- **PuerTS**: `npm run setup`(약 270 MB)은 돌리지 않습니다. 클라이언트 타입 검사는 커밋된 `types/`의 선언을, 번들 실행 테스트는 가짜 호스트(`test/support/puerts-host.mjs`)를 씁니다.
- **시간**: 영역으로 나누기 전의 전체 단계(`npm ci` → `typecheck` → `test`)는 깨끗한 얕은 클론의 M4 Max에서 약 17초였습니다(`npm ci` 1.8초, 빈 캐시면 2.4초 / `typecheck` 6.4초 / `test` 7.8초, CPU 합 약 47초). 비공개 저장소의 표준 러너(2 vCPU)에서 잰 첫 실행(2026-10-22, 실행 39737281668)은 잡 111초로 로컬의 약 6.5배입니다: 체크아웃과 LFS 각 1초, `setup-node` 7초, `npm ci` 6초, `typecheck` 32초, `test` 59초. 2026-11-02에 공개 저장소가 되어 표준 러너는 무료이고, 4 vCPU 러너에서 잰 첫 실행은 잡 93초입니다. 나누기 직전의 실행(2026-11-06, 실행 42192687852)은 잡 81초였고(`setup-dotnet` 0.8초, `typecheck` 19초, `test` 49초 = 생성 파일 검사 4.5초 + idle 워크스페이스 테스트 40초 + `test:mmo` 4.2초), mmo만 바뀐 푸시도 이 81초를 다 썼습니다. 나눈 뒤 로컬(M4 Max, 캐시 있음, 2026-11-09)에서는 `typecheck:idle` 6.4초, `test:idle` 12.5초, `typecheck:tools` 2.0초, `test:tools` 2.9초, `test:mmo` 2.9초입니다. 나눈 뒤의 러너 시간은 아직 재지 않았습니다. 멈춘 테스트가 시간을 쓰지 않게 잡 한도는 10분입니다.

키우기 Live 내보내기는 단위마다 손으로 실행하는 액션입니다(`workflow_dispatch`): `idle data`(규칙 테이블과 문장·소리. 규칙이 Live 서버와 다르면 올리기만 하고, `idle server`를 `publish` 없이 돌린 뒤 `idle publish / rollback`이 함께 바꿈), `idle game (TS)`, `idle assets (Addressables)`, `idle server`, `idle APK`, `idle publish / rollback`, `idle all`(`.github/workflows/idle-*.yml`). 실제 일은 공용 워크플로 [`idle-release.yml`](.github/workflows/idle-release.yml)이 하고(액션 목록에는 Run 버튼 없이 `idle release (shared)`로 보임), 고른 단위만 이번 커밋에서 만들어 나머지는 지금 Live 버전에서 가져오며, 서버나 앱과 맞지 않는 조합은 내보내기 전에 멈춥니다. 액션은 `main`에서 실행합니다(손으로 실행하는 액션은 기본 브랜치에 파일이 있어야 보임). Unity 단계(Addressables, APK)는 LFS 전체가 필요해서 `.git/lfs`를 LFS 목록의 해시로 캐시하고 `Library`(실행마다 새로 저장하고 가장 최근 것을 받음, 압축 약 2 GB)와 PuerTS도 캐시합니다. 2026-10-31 두 번째 실행에서 체크아웃부터 테스트까지 2분 51초, Addressables 단계가 12분 4초(Library 캐시 없음)였습니다. 세 번째 실행(전체, APK 포함)은 47분 52초였고, 그 가운데 IL2CPP의 C++ 컴파일이 18분 29초, Library 캐시 없는 프로젝트 열기가 7분 52초입니다. 설계는 [idle/docs/superpowers/specs/2026-10-30-patch-design.md](idle/docs/superpowers/specs/2026-10-30-patch-design.md)의 4.12절이고, 액션별 사용법과 멈췄을 때 할 일은 [idle/docs/release.md](idle/docs/release.md)에 있습니다.
