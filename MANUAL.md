# 저장소 매뉴얼

저장소 전체의 구조 규칙, 설정, 명령, CI입니다. 소개는 [README.md](README.md)에, 키우기의 구조·규칙·실행·빌드는 [idle/MANUAL.md](idle/MANUAL.md)에 있습니다.

## 구조

- **게임은 서로 독립**: 게임끼리는 서로 import하지 않습니다.
- **`shared/`에는 꼭 같아야 하는 것만**: 클라이언트와 서버가 어긋나면 버그인 코드만 그 게임의 `shared/`에 둡니다.
- **툴은 두 게임이 함께 사용**: 두 게임이 함께 쓰는 것은 `tools/`뿐이고, 툴은 게임 코드를 import하지 않고 각 게임에 생성 파일을 씁니다. 툴의 테스트만 big 열·Big 모드로 만든 코드를 실제 `@idle/big-number`(개발 의존)로 실행해 봅니다.
- **한 저장소인 이유**: 툴의 출력이 바뀌면 두 게임의 생성 파일을 한 커밋에서 함께 맞추고, `npm run generate -- --check`로 원본과 어긋나지 않게 지킵니다.

import 경계는 `npm test`가 `scripts/check-boundaries.mjs`로 검사합니다. 키우기 안의 패키지 방향은 [idle/MANUAL.md](idle/MANUAL.md#구조)에 있습니다.

## 처음 설정

Node.js 22.13 이상과 Git LFS가 필요합니다. 이미지, 사운드, 모델, 폰트, 네이티브 플러그인, xlsx는 `.gitattributes`에 따라 LFS로 저장됩니다. **LFS를 설치하지 않고 커밋하면 이 파일들이 일반 Git 객체로 들어가므로** 첫 커밋 전에 설치하세요. 수식툴 데스크톱 앱을 실행하려면 [Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/)(Rust 툴체인)도 필요합니다.

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
| `npm run typecheck` | 모든 워크스페이스 타입 검사 |
| `npm test` | 생성 파일 검사 → import 경계 검사 → 전체 테스트 |
| `npm run coverage` | idle의 vitest 워크스페이스마다 커버리지 표 |
| `npm run generate` | 게임의 `data/`에서 테이블 로더·데이터·공식 코드 재생성 (`-- --check`는 검사만) |

키우기의 실행·빌드 명령은 [idle/MANUAL.md](idle/MANUAL.md)에 있습니다.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml)이 `main`의 푸시, 모든 PR, 수동 실행(`workflow_dispatch`)에서 Ubuntu 24.04와 Node 22.14.0(로컬과 같은 버전. 서버가 `node:sqlite`를 씁니다)으로 `npm ci` → `npm run typecheck` → `npm test`를 돌립니다. 같은 PR이나 브랜치에 새 커밋이 오면 이전 실행을 취소합니다. 다른 브랜치는 PR을 열어야 돕니다. npm 캐시(`~/.npm`, 약 41 MB)는 `setup-node`가 `package-lock.json` 해시로 저장합니다.

- **LFS**: 체크아웃은 포인터만 받고, `git lfs pull --include="idle/data/*.xlsx"`로 `generate --check`가 읽는 xlsx 15개(145,711바이트)만 받습니다. LFS 전체(981개, 약 241 MB, 2026-10-31. Unity 그림·오디오·폰트가 대부분)의 0.1%도 안 되고, 무료 다운로드량 월 10 GiB로 약 7만 회 실행할 수 있습니다. 테스트가 다른 LFS 파일을 읽게 되면 `--include`에 더합니다.
- **PuerTS**: `npm run setup`(약 270 MB)은 돌리지 않습니다. 클라이언트 타입 검사는 커밋된 `types/`의 선언을, 번들 실행 테스트는 가짜 호스트(`test/support/puerts-host.mjs`)를 씁니다.
- **시간**: 깨끗한 얕은 클론에서 같은 단계를 돌리면 M4 Max에서 약 17초입니다(`npm ci` 1.8초, 빈 캐시면 2.4초 / `typecheck` 6.4초 / `test` 7.8초, CPU 합 약 47초). 비공개 저장소의 표준 러너(2 vCPU)에서 잰 첫 실행(2026-10-22, 실행 39737281668)은 잡 111초로 로컬의 약 6.5배입니다: 체크아웃과 LFS 각 1초, `setup-node` 7초, `npm ci` 6초, `typecheck` 32초, `test` 59초. 2026-11-02에 공개 저장소가 되어 표준 러너는 무료이고, 4 vCPU 러너에서 잰 첫 실행은 잡 93초입니다. 멈춘 테스트가 시간을 쓰지 않게 잡 한도는 10분입니다.

키우기 Live 내보내기는 단위마다 손으로 실행하는 액션입니다(`workflow_dispatch`): `idle data`(규칙 테이블과 문장·소리. 규칙이 Live 서버와 다르면 올리기만 하고, `idle server`를 `publish` 없이 돌린 뒤 `idle publish / rollback`이 함께 바꿈), `idle game (TS)`, `idle assets (Addressables)`, `idle server`, `idle APK`, `idle publish / rollback`, `idle all`(`.github/workflows/idle-*.yml`). 실제 일은 공용 워크플로 [`idle-release.yml`](.github/workflows/idle-release.yml)이 하고(액션 목록에는 Run 버튼 없이 `idle release (shared)`로 보임), 고른 단위만 이번 커밋에서 만들어 나머지는 지금 Live 버전에서 가져오며, 서버나 앱과 맞지 않는 조합은 내보내기 전에 멈춥니다. 액션은 `main`에서 실행합니다(손으로 실행하는 액션은 기본 브랜치에 파일이 있어야 보임). Unity 단계(Addressables, APK)는 LFS 전체가 필요해서 `.git/lfs`를 LFS 목록의 해시로 캐시하고 `Library`(실행마다 새로 저장하고 가장 최근 것을 받음, 압축 약 2 GB)와 PuerTS도 캐시합니다. 2026-10-31 두 번째 실행에서 체크아웃부터 테스트까지 2분 51초, Addressables 단계가 12분 4초(Library 캐시 없음)였습니다. 세 번째 실행(전체, APK 포함)은 47분 52초였고, 그 가운데 IL2CPP의 C++ 컴파일이 18분 29초, Library 캐시 없는 프로젝트 열기가 7분 52초입니다. 설계는 [idle/docs/superpowers/specs/2026-10-30-patch-design.md](idle/docs/superpowers/specs/2026-10-30-patch-design.md)의 4.12절이고, 액션별 사용법과 멈췄을 때 할 일은 [idle/docs/release.md](idle/docs/release.md)에 있습니다.
