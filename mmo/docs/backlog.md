# MMORPG 기반 구현 목록

MMORPG 포트폴리오(`mmo/`)를 만들기 위해 구현할 기반 시스템 목록입니다. Unity(C#만, UI Toolkit + App UI) 클라이언트와 Unreal(C++, UMG) 클라이언트가 MMO 서버(C#) 하나에 붙고, 패킷은 Protobuf입니다. 결제, 광고, 외부 SDK 연동은 범위에 넣지 않고, 로그인은 텍스트 ID입니다.

순서는 서버(6) → Unity 클라이언트(7) → Unreal 클라이언트(8)입니다(2026-11-06 시작). Unity 클라이언트를 기능까지 다 만든 뒤, Unreal 클라이언트는 그것을 C++과 UMG로 옮기듯이(포팅) 만듭니다. 그래서 Unity 쪽에서 기능과 구조를 정하고, Unreal에서는 같은 기능을 엔진에 맞게 옮기기만 합니다.

키우기(`idle/`)의 서버는 요청-응답과 커맨드마다 저장하는 구조라서 쓰지 않습니다. MMO 서버는 틱마다 이동과 전투를 계산하고 주변 플레이어에게 계속 보내는 상태 서버입니다. 두 게임이 함께 쓰는 것은 루트의 `tools/`뿐입니다.

## 폴더

```
client-unity/        Unity, C#만, UI Toolkit + App UI
client-unreal/       Unreal, C++, UMG
server/              MMO 서버 (C#, .NET 10)
shared/contract/     packets.proto → protoc로 서버·Unity(C#), Unreal(C++) 코드 생성
data/                기획 데이터 원본
```

## 목록

### A. 먼저 정할 것

- [x] **1. 서버 언어** — C#(.NET 10)입니다. 서버 코드는 Unity 클라이언트와도 나눠 쓰지 않습니다. 두 클라이언트가 같은 조건이 되도록, Unity(C#)와 Unreal(C++) 모두 패킷 정의(3)에서 protoc가 생성한 코드를 받습니다. Unreal을 UnrealSharp(C#)로 쓰는 안은 2026-11-06에 접고 C++로 정했습니다.
- [x] **2. 전송** — TCP 위에 Protobuf의 길이 구분 형식(varint 길이 + 메시지)으로 패킷을 보냅니다. 서버(C#)와 Unity는 `System.Net.Sockets`, Unreal은 `Sockets` 모듈의 표준 소켓만 쓰고, 신뢰성 계층은 만들지 않습니다. 대신 패킷 하나가 손실되면 뒤의 패킷도 재전송을 기다리므로 손실 있는 망에서 이동이 잠깐 멈출 수 있습니다. 서버 판정에 클라이언트 보간을 하는 MMO에서는 견딜 만한 수준으로 봅니다. 패킷 형식(3)은 전송과 따로 정의하므로, 나중에 UDP로 바꿔도 소켓 계층만 바뀝니다.

### B. 공용

- [x] **3. 패킷 정의** — `shared/contract/packets.proto`(proto3)에 첫 기능(로그인, 이동, 주변 플레이어 표시)의 패킷 8개가 있습니다. `Packet`의 oneof 필드 번호가 패킷 번호이고, 배포된 번호와 enum 값은 바꾸지 않습니다. `npm run generate`가 Grpc.Tools(NuGet 2.85.0)의 protoc로 C#(`generated/Packets.cs`, Google.Protobuf 3.36.2)을 만들어 커밋하고 서버와 Unity가 함께 씁니다. `npm run test:mmo`가 왕복과 와이어 크기를 확인하고, 형식을 고른 근거와 수치는 [MANUAL](../MANUAL.md#형식을-고른-근거-2026-11-06)에 있습니다. C++ 생성은 8에서 합니다. 직접 만든 형식(`.def` 문법과 `tools/contract-tool`)은 Protobuf로 정하며 지웠습니다(2026-11-06).
- [ ] **4. 데이터** — `data/`의 xlsx를 data-tool로 변환합니다. data-tool에 C#·C++ 로더 출력을 더하고, formula-tool에 double 기준 C#·C++ 내보내기를 더합니다(키우기의 `Big`은 쓰지 않습니다). 루트의 `npm run generate -- mmo`와 `--check`가 패킷에 더해 MMO 데이터도 만들게 합니다. 이때 `mmo-ci.yml`의 `paths`에 `tools/**`, `package-lock.json`, `.gitattributes`를, 단계에 `npm ci`와 `mmo/data/*.xlsx`의 LFS를 더하고, `scripts/check.mjs`에서 `tools/`가 mmo도 검사하게 합니다.
- [ ] **5. 규칙 비교 벡터** — 클라이언트가 서버 규칙을 예측해야 하면(이동, 쿨다운 등), 서버 구현이 만든 입력 → 출력 쌍으로 두 클라이언트의 구현을 검사합니다. 예측이 필요한 규칙이 생길 때 합니다.

### C. 서버

- [ ] **6. 서버 뼈대** — 로그인(텍스트 ID), 틱 루프, 시야(AOI), 이동 검증, 저장. 같은 부하(예: 20Hz 틱, 엔티티 수천, 주변 브로드캐스트)에서 틱당 CPU, 클라이언트당 송신량, 메모리를 재고, 동접 기준 서버 비용으로 바꿔 MANUAL.md에 적습니다.
  - 저장 말고는 끝났습니다(2026-11-06, `server/`). 구조와 규칙은 [MANUAL의 서버](../MANUAL.md#서버), 봇 2,000명의 측정과 비용은 [부하 측정](../MANUAL.md#부하-측정-2026-11-06)에 있습니다.
  - 남은 것: 저장(로그아웃할 때의 위치). 저장소를 정한 뒤 시작 위치를 무작위 대신 저장한 위치로 바꿉니다.

### D. 클라이언트

- [ ] **7. Unity 클라이언트** — `client-unity/`. Unreal 클라이언트(8)가 옮겨 올 기준 구현이라 먼저 기능까지 다 만듭니다. C#만 쓰고(PuerTS 없음) UI는 UI Toolkit과 [App UI](https://docs.unity3d.com/Packages/com.unity.dt.app-ui@latest)(`com.unity.dt.app-ui`)입니다. 패킷은 생성한 C#과 Google.Protobuf 런타임을 쓰고, IL2CPP에서 도는지는 이때 확인합니다. 경계는 asmdef 참조가 지킵니다. 엔진이 필요한 테스트와 빌드는 로컬에서 합니다(10). 이때 더하는 `mmo-unity-ci.yml`은 `mmo/client-unity/**`와 생성된 C#(`mmo/shared/**/*.cs`)이 바뀌면 엔진 없는 코드만 검사합니다. 패킷·규칙 코드를 `noEngineReferences` asmdef에 두고, 같은 `.cs`를 읽는 테스트 csproj(Unity와 같은 C# 9, .NET Standard 2.1)를 `dotnet test`로 돌립니다. 이때 `mmo-ci.yml`의 `paths`에 `!mmo/client-unity/**`를 더하고 `scripts/check.mjs`의 `mmo/` 규칙도 나눠, 클라이언트만 바뀌면 서버 테스트가 돌지 않게 합니다.
- [ ] **8. Unreal 클라이언트** — `client-unreal/`. 7을 끝낸 뒤 Unity 클라이언트의 기능과 구조를 옮기듯이(포팅) 만듭니다. C++이고 UI는 UMG입니다. 패킷은 protoc가 만든 C++이고, libprotobuf는 같은 버전으로 ThirdParty 모듈에 넣습니다. 패킷·규칙 코드는 UE 타입 없는 모듈에 두고, 경계는 `Build.cs` 의존이 지킵니다. 이때 더하는 `mmo-unreal-ci.yml`은 `mmo/client-unreal/**`와 생성된 C++(`mmo/shared/**/*.h`, `mmo/shared/**/*.cc`)이 바뀌면 이 모듈과 생성된 C++을 clang과 같은 버전의 libprotobuf로 빌드해 테스트합니다. 엔진 빌드와 테스트는 로컬에서 합니다(10). GitHub 러너에는 엔진(수십 GB)을 두기 어렵고, self-hosted 러너는 공개 저장소에서 fork의 PR이 그 기기에서 코드를 돌릴 수 있어 쓰지 않습니다. 7처럼 `mmo-ci.yml`과 `scripts/check.mjs`에서 `mmo/client-unreal/`을 뺍니다.
- [ ] **9. 저장소 설정** — 루트 `.gitattributes`에 `*.uasset`, `*.umap`을 LFS로 더하고, 각 프로젝트 루트에 `.gitignore`(Unity: `Library/` 등, Unreal: `Binaries/`, `Intermediate/`, `Saved/`, `DerivedDataCache/`)를 둡니다. 에셋은 직접 만든 것이나 CC0만 넣습니다. 에셋 스토어 라이선스는 대부분 공개 저장소에 원본을 올리는 것을 허용하지 않고, Unreal Starter Content는 클론 용량만 늘립니다. 에셋이 LFS에 들어오면 `idle-release.yml`의 Unity 실행이 받는 범위(`git lfs pull`)와 LFS 캐시 키(`git lfs ls-files`)를 `idle/**`로 좁힙니다. 그러지 않으면 키우기 릴리스가 mmo 에셋까지 받고, mmo 에셋이 바뀔 때마다 키우기의 LFS 캐시가 무효가 됩니다.

### E. 배포

- [ ] **10. 배포** — 서버는 idle server처럼 손으로 실행하는 CI 액션(`workflow_dispatch`)이 GitHub 러너에서 빌드해 VPS에 올립니다. 엔진이 필요 없어 빠르고 깨끗한 환경에서 빌드되며, 배포 키는 GitHub 시크릿에 둡니다. 클라이언트(Unity의 APK·Addressables, Unreal)는 로컬에서 빌드해 올리고, CI는 엔진 없는 검사만 합니다(2026-11-09 정함).
  - 근거: 키우기를 CI에서 APK까지 내면 47분 52초가 걸렸습니다(2026-10-31, 비공개 저장소의 2 vCPU·메모리 약 7.9 GB 러너. IL2CPP 컴파일 18분 29초, Library 캐시 없는 프로젝트 열기 7분 52초). 공개 저장소의 4 vCPU 러너(메모리 약 16 GB, 2026-11-06 실행 42192688206)로 바뀐 뒤에도 저장소당 Actions 캐시 10 GB(키우기의 Library만 압축 약 2 GB)와 Unreal 엔진의 크기(수십 GB)가 한도입니다. 로컬은 Library가 이미 있어 프로젝트를 다시 열지 않습니다. 공개 저장소라 러너 비용은 어느 쪽이든 0원입니다.
  - 로컬 스크립트가 지킬 것: 작업 트리가 깨끗한 커밋에서만 빌드합니다(다른 세션이 같은 작업 트리를 씀). 빌드에 커밋 SHA를 남깁니다. 올리기 전에 엔진 없는 검사와 엔진 테스트를 돌리고, `ProtocolVersion`이 Live 서버와 맞는지 봅니다. main 체크아웃에서만 돌고(worktree에서는 Unity를 열지 않음), 에디터가 프로젝트를 열고 있으면 열린 에디터로 빌드합니다(배치 모드는 같은 프로젝트를 열 수 없음). 키스토어와 VPS 배포 키는 로컬에 둡니다.
  - 올리는 코드: 키우기의 `patch.mjs`는 키우기의 API 지문과 채널에 묶여 있습니다. 같은 방식(rsync, 이미 있는 이름은 건너뜀, 포인터는 임시 이름에 쓴 뒤 바꿈)을 쓰려면 일반적인 부분을 `tools/`로 옮깁니다.
