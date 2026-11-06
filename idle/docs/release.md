# 키우기 내보내기 (GitHub Actions)

Live(`idle.dennou.cloud`)에 패치, 게임 서버, APK를 내는 GitHub Actions 액션의 사용법입니다. 왜 이렇게 나눴는지는 [설계 4.12절](superpowers/specs/2026-10-30-patch-design.md)에, VPS와 패치 폴더 레이아웃은 같은 문서의 4.6–4.9절에 있습니다. 이 문서는 2026-10-31의 워크플로(`.github/workflows/idle-*.yml`)를 기준으로 합니다.

## 1. 한눈에

손으로 실행하는 액션이 7개 있고, 모두 공용 워크플로 하나를 부릅니다. 액션은 "어느 단위를 켤지"만 정하고, 실제 일은 공용 워크플로가 합니다.

```text
idle data                   ─┐
idle game (TS)              ─┤
idle assets (Addressables)  ─┤                            ┌─ release 잡: 검사 → 빌드 → 조합 검사 → 올리기 → 공개
idle server                 ─┼─▶ idle release (shared) ──┤
idle APK                    ─┤   (idle-release.yml)       └─ publish 잡: 올려 둔 버전을 공개(롤백)
idle all                    ─┤
idle publish / rollback     ─┘
```

| 액션(파일) | 이번 커밋에서 만드는 것 | 입력(기본값) | Unity | 시간 |
| --- | --- | --- | --- | --- |
| `idle data`(`idle-data.yml`) | 규칙 테이블, 문장·소리 | `publish`(켬), `base`(빈칸) | 안 씀 | 약 3분 |
| `idle game (TS)`(`idle-game.yml`) | 게임 TS 번들(`main.mjs`), 고르면 서버 | `server`(끔), `publish`(켬), `base`(빈칸) | 안 씀 | 약 3분(추정) |
| `idle assets (Addressables)`(`idle-assets.yml`) | 에셋 번들과 카탈로그 | `publish`(켬), `base`(빈칸) | 씀 | 15분 27초(Library 캐시 없음) |
| `idle server`(`idle-server.yml`) | 게임 서버 | `publish`(켬) | 안 씀 | 약 3분 |
| `idle APK`(`idle-apk.yml`) | APK, 고르면 패치 네 단위와 서버 | `full_patch`(끔) | 씀 | 18분 51초(Library 캐시 있음, 없으면 48분 15초) |
| `idle publish / rollback`(`idle-publish.yml`) | 없음(올려 둔 버전을 공개) | `version`(필수) | 안 씀 | 1–2분(추정) |
| `idle all`(`idle-all.yml`) | 패치 네 단위, 서버, 고르면 APK | `apk`(켬), `publish`(켬) | 씀 | 47분 52초(APK 포함, Library 캐시 없음) |

액션 목록에는 `idle release (shared)`도 보이지만 Run 버튼이 없습니다. 다른 액션만 부를 수 있는 공용 워크플로(`workflow_call`)인데, GitHub가 워크플로 파일을 모두 목록에 보이기 때문입니다. 커밋마다 자동으로 도는 `CI`(`ci.yml`)는 타입 검사와 테스트만 하고 아무것도 내보내지 않습니다.

## 2. 용어

- **패치 버전**: `v/<버전>/`에 올라간 한 벌(매니페스트, `main.mjs`, 데이터 테이블, 에셋 카탈로그). 파일 목록과 API 지문의 해시가 버전 이름(16자리 16진수)이고, 한 번 올리면 바꾸지 않습니다. 에셋 번들(`aa/Android/`)은 버전끼리 함께 쓰고 더하기만 합니다.
- **채널 포인터**: `channels/Android/<API 지문>.json`. 앱은 자기 API의 포인터가 가리키는 버전을 받습니다. 내보내기에서 바뀌는 파일은 이것 하나입니다.
- **API 지문**: 앱의 C# API(`csharp.d.ts` 둘째 줄). TS가 부르는 public 시그니처, 프리팹이 기대는 프로젝트 스크립트의 직렬화 필드(뷰 컴포넌트의 `[SerializeField]` 등), 패키지 목록(`Packages/manifest.json`)을 셉니다. 지문이 달라지면 새 APK가 필요하고, 그 APK는 새 지문의 채널만 봅니다. 옛 APK는 자기 채널의 마지막 버전에 머뭅니다.
- **앱 기록**: `channels/app/Android.json`(`{ "api", "url" }`). APK를 낼 때 CI가 그 API와 Release 페이지로 바꿉니다. API가 다른 옛 앱은 시작할 때 새 앱의 설치 페이지를 열지 묻습니다(서버가 막았으면 "더 플레이할 수 없습니다", 아니면 넘길 수 있는 안내).
- **단위**: 패치를 이루는 네 부분과 그 밖의 둘입니다. 패치는 `game`(TS 번들), `rules`(규칙 테이블 12개), `strings`(문장·소리), `assets`(Addressables)이고, 그 밖에 `server`(게임 서버)와 `apk`가 있습니다. 매니페스트의 `parts`가 단위마다 어느 커밋에서 왔는지, `server`가 이 버전과 함께 돌 서버의 커밋을 적습니다.
- **기준 버전**: 고르지 않은 단위를 가져오는 버전. `base`를 비우면 이 커밋의 API 채널이 지금 가리키는 버전입니다.
- **짝 서버**: 패치와 함께 돌 서버. 서버를 고르면 이번 커밋이고, 아니면 지금 Live 서버입니다. 예외로, `rules`를 골랐는데 이 커밋의 규칙 지문이 Live 서버와 다르면 이번 커밋의 서버가 짝이 됩니다(3.1절).
- **올리기와 공개**: 올리기는 VPS에 파일을 더하기만 해서 Live에 영향이 없습니다. 공개는 서버를 짝 서버로 바꾼 뒤 채널 포인터를 옮깁니다. `publish`를 끄면 올리기만 합니다.
- **롤백**: 앞 버전의 공개입니다(`idle publish / rollback`). 그 버전에 적힌 서버로도 돌아갑니다.

## 3. 액션별 설명

실행은 저장소의 **Actions → 액션 → Run workflow**에서 브랜치 `main`을 고르고 입력을 정해 누릅니다. 터미널에서는 아래처럼 합니다.

```sh
gh workflow run idle-data.yml --ref main -f publish=true
gh run watch
```

실행은 고른 브랜치에 있는 워크플로 파일로 돕니다. 목록에 보이는 액션은 `main`에 있는 것뿐입니다(7절).

### 3.1 `idle data`

이번 커밋의 규칙 테이블과 문장·소리를 내고, 게임 TS와 에셋은 기준 버전의 것을 씁니다. 서버는 건드리지 않습니다.

- 문장·소리만 바뀌었거나, 이 커밋의 규칙 지문이 Live 서버와 같으면 `publish`대로 바로 공개합니다(포인터만 옮김).
- 규칙 지문이 Live 서버와 다르면 이번 커밋의 서버를 짝으로 적고, `publish`가 켜져 있어도 **올리기만** 합니다. 실행 요약의 알림(`Uploaded <버전> without publishing…`)에 버전과 다음 할 일이 나옵니다. 이어서 같은 커밋으로 `idle server`를 `publish`를 끄고 돌린 뒤, `idle publish / rollback`에 그 버전을 넣습니다(5절의 "규칙 테이블을 바꿨을 때").
- 짝 서버인지는 `node idle/client/TypeScript/tools/data-schema.mjs <데이터 폴더>`가 찍는 규칙 지문(예: `ee90224b`)으로 봅니다. 이 커밋의 것은 `idle/shared/data-schema/data`이고, Live 서버의 것은 VPS의 `releases/<커밋>/data`입니다.

### 3.2 `idle game (TS)`

이번 커밋의 게임 TS 번들을 내고, 데이터와 에셋은 기준 버전의 것을 씁니다.

- `idle/shared/`(공용 규칙과 프로토콜)가 Live 서버의 커밋과 같으면 `server`를 끈 채 냅니다.
- `idle/shared/`가 다르면 `server`를 켭니다. 같은 실행에서 서버를 빌드해 올려 두고, 공개할 때 서버를 바꾼 뒤 포인터를 옮깁니다. 서버가 다시 시작해 포인터가 옮겨지기까지 몇 초 동안 옛 패치의 앱이 끊길 수 있고, 다시 붙으면 맞춰집니다. 끈 채 내면 조합 검사 2가 멈춥니다.
- 새 TS가 새 프리팹이나 뷰 참조를 쓰면 에셋도 함께 나가야 합니다(5절의 "여러 단위를 함께 낼 때"). 게임과 에셋의 커밋이 다르고 그 사이에 `Assets/Remote`나 `src/unity/views`가 바뀌었으면 경고가 나옵니다.

### 3.3 `idle assets (Addressables)`

Unity로 이번 커밋의 에셋 번들과 카탈로그를 빌드해 냅니다(`RemoteContent.BuildForCi`). TS와 데이터는 기준 버전의 것입니다. 번들 이름은 내용을 따르므로, 내용이 같은 번들은 이름도 같아 다시 올리지 않고 앱도 다시 받지 않습니다(CI와 이 Mac의 빌드가 바이트까지 같음을 2026-10-31에 확인).

### 3.4 `idle server`

이번 커밋의 게임 서버를 빌드합니다(`npm run build -w @idle/server`, `server/dist`).

- `publish`를 켜면 Live 패치와 견준 뒤(규칙 지문, `idle/shared/`) `releases/<커밋>`으로 올리고 `current` 링크를 바꿔 다시 시작합니다. 서버가 Caddy를 거쳐 답하는지(`/ws`가 404)까지 봅니다.
- `publish`를 끄면 `releases/<커밋>`에 올려 두기만 하고 견주지 않습니다. 규칙이 바뀐 패치와 함께 낼 때 이렇게 하고, 공개는 `idle publish / rollback`이 합니다. 그 패치를 만들 때 이 서버와 이미 견줬습니다.

### 3.5 `idle APK`

부트 번들(앱에 드는 TS)과 APK를 빌드해 GitHub Release(태그 `idle-android-b<번호>`, 제목 `idle aos build <번호>`)로 냅니다. APK는 늘 공개를 함께 합니다.

- 번호는 지금까지의 `idle-android-b<번호>` 태그에서 가장 큰 것의 다음입니다(Number the APK 단계). 이 번호가 versionCode, 버전 이름(`0.1.<번호>`), 태그, Release 제목에 함께 쓰이므로, 어느 액션(`idle APK`, `idle all`)에서 내도 저장소 전체에서 늘고 앞의 APK 위에 덮어 설치됩니다. 2026-11-02에 공개 저장소로 옮기며 1부터 다시 시작했고(10절), 지금 마지막은 3(`idle aos build 3`, `7a11323`)입니다. 2는 `b28f37e`입니다. 옛 저장소의 빌드가 깔린 기기는 지우고 설치합니다(저장 데이터는 서버에 있음).

- `full_patch`를 끄면 APK만 냅니다. 채널은 그대로이고, Release 본문에 지금 Live 패치 버전을 적습니다. C# API가 Live와 같을 때만 됩니다(다르면 기준 버전 받기에서 `No patch is published for API …`로 멈춤).
- C# API가 바뀌었으면 `full_patch`를 켭니다. 새 API의 채널에는 아직 버전이 없으므로 패치 네 단위와 서버를 모두 이번 커밋에서 냅니다. Unity는 한 번만 띄워 에셋과 APK를 함께 빌드합니다(`PlayerBuild.BuildForCi`).
- Release 본문에는 `API 지문`, `패치 버전`, `빌드 번호(versionCode)`, `실행`(그 실행의 주소), `커밋`이 들어갑니다. 패치만 내는 다음 실행은 이 `API 지문` 줄로 받을 앱이 있는지 봅니다(조합 검사 3).
- 서명은 GitHub Secrets의 키스토어이고, 앱 설정은 `client/config/live.json`입니다.

### 3.6 `idle publish / rollback`

올려 둔 버전을 공개합니다. 앞 버전을 넣으면 롤백입니다.

1. VPS에서 그 버전을 받아 매니페스트로 검증합니다(크기와 sha256).
2. 매니페스트의 `server`가 지금 Live 서버와 다르면, 그 서버가 `releases/`에 있는지 보고 바꿉니다(다시 시작). 없으면 `The server … is not on the VPS; stage it first.`로 멈춥니다.
3. 그 버전의 API 채널 포인터를 옮깁니다.

2와 3은 release 잡의 Publish와 같은 스크립트(`idle/server/deploy/publish.sh <서버 커밋> <패치 버전>`)입니다.

빌드와 조합 검사는 하지 않습니다(그 버전을 만들 때 했음). 서버를 기록하지 않은 버전이면 경고하고 포인터만 옮깁니다.

### 3.7 `idle all`

패치 네 단위와 서버를 모두 이번 커밋에서 내고, `apk`를 켜면 APK도 냅니다. 첫 출시나 여러 단위가 함께 바뀐 큰 변경용입니다. 공개 저장소의 첫 실행(2026-11-02, 41457129314)이 서버 `c7922ad`, 패치 `28b79e6cf1b7cff3`, APK `idle aos build 1`을 냈고, 지금 Live는 2026-11-03 실행(41637742941)이 UI 개편(`7a11323`, 프로토콜 21, C# API `ea2aebf778c9e3fd`)으로 낸 서버 `7a11323`, 패치 `87f85487cfbb28b0`, APK `idle aos build 3`입니다. 프로토콜이 바뀌어 옛 앱(빌드 1·2)은 연결이 4000으로 닫히고 업데이트 안내를 봅니다.

## 4. 공용 워크플로의 단계

### 4.1 release 잡

위에서 아래로 돌고, 조건이 맞지 않는 단계는 건너뜁니다. "Unity"는 `assets`나 `apk`를 고른 실행입니다.

| 단계 | 조건 | 하는 일 |
| --- | --- | --- |
| Plan the run | 늘 | 고른 단위를 `parts`로 정리. 아무것도 고르지 않았거나(`Choose at least one unit.`) APK인데 `publish`를 껐으면(`An APK release always publishes.`) 멈춤 |
| Free disk space, Add swap | Unity | 러너의 쓰지 않는 도구와 Docker 이미지를 지우고, 스왑 8 GB를 임시 디스크(`/mnt`)에 더함(러너 메모리 약 7.9 GB). 남은 공간을 `df`로 찍음 |
| checkout | 늘 | 기록 전체(`fetch-depth: 0`). 조합 검사가 다른 커밋의 `idle/shared/`와 견줌 |
| LFS | 늘 | Unity면 전체(캐시), 아니면 테스트가 읽는 xlsx만 |
| setup-node, `npm ci` | 늘 | Node는 `.nvmrc`(22.14.0) |
| PuerTS 캐시, `npm run setup` | Unity | 약 270 MB |
| `npm run typecheck`, `npm test` | 늘 | 실패하면 아무것도 내보내지 않음 |
| SSH to the VPS | 늘 | 배포 키와 고정한 호스트 키로만 접속(`.github/actions/vps-ssh`, publish 잡과 같음) |
| Read the live state | 늘 | 지금 Live 서버의 커밋(`current` 링크) |
| Pull the base version | 패치 네 단위를 모두 고르지 않았을 때 | 기준 버전을 받아 검증 |
| Pair the patch with a server | 패치 단위를 골랐을 때 | 짝 서버를 정함(2절, 3.1절) |
| Library 캐시 | Unity | 가장 최근 것을 받음. 저장은 Unity 빌드 직후(6절) |
| Number the APK | `apk` | 지금까지의 Release 태그에서 다음 APK 번호를 정함(3.5절) |
| Build the boot bundle | `apk` | 앱에 드는 부트 번들(Release 환경) |
| Build remote content | `assets`이고 `apk`가 아닐 때 | Unity로 Addressables |
| Build the APK | `apk` | Unity 한 번으로 (`assets`면 Addressables까지) APK |
| Build the patch | 패치 단위를 골랐을 때 | 고른 단위는 이번 커밋, 나머지는 기준 버전으로 조합하고 매니페스트를 씀 |
| Build the game server | `server` | `server/dist` |
| Check the units fit together | 패치 단위를 골랐거나, `server`를 바로 공개할 때 | 조합 검사 1, 2, 5 |
| Check an app can run the patch | 패치 단위를 골랐고 `apk`가 아닐 때 | 조합 검사 3 |
| Report memory after a Unity failure | Unity가 실패했을 때 | 메모리, 디스크, 커널 OOM 기록 |
| Stage the game server | `server` | `releases/<커밋>`에 올리기만 |
| Upload the patch | 패치 단위를 골랐을 때 | `aa/` → `v/` 순서로 더하기만(이미 있는 이름은 건너뜀). 버전을 실행 요약에 적음 |
| Publish | `publish` | 짝 서버가 아직 없으면(3.1절) 알리고 끝. 아니면 서버를 짝 서버로 바꾸고(다르면) 포인터를 옮김(`idle/server/deploy/publish.sh`, publish 잡과 같음) |
| Publish the APK | `apk` | GitHub Release와 태그 |

### 4.2 publish 잡

`idle publish / rollback`만 씁니다. 3.6절의 세 단계이고, 체크아웃과 Node만 준비합니다(약 1–2분, 추정).

## 5. 상황별 사용법

| 바꾼 것 | 할 일 |
| --- | --- |
| 문장·소리 | `idle data` |
| 규칙 테이블 | 아래 "규칙 테이블을 바꿨을 때" |
| TS만 | `idle game (TS)` |
| TS와 `idle/shared/` | `idle game (TS)`에 `server` 켬 |
| 프리팹, 그림, 소리 파일, UI | `idle assets (Addressables)` |
| 서버 코드만(`idle/shared/`와 규칙은 그대로) | `idle server` |
| C#(API 지문이 바뀜: 파사드·뷰의 public 멤버, 직렬화 필드, 패키지) | `idle APK`에 `full_patch` 켬 |
| C#(API 지문은 그대로) | `idle APK` |
| 지문이 못 보는 변경(C# 동작만 바꿈, 에셋을 Resources와 Remote 사이로 옮김) | `TypeScriptTypings.Generation`을 올리고 `idle APK`에 `full_patch` 켬 |
| 여러 단위가 함께 바뀐 큰 변경 | `idle all` |
| 되돌리기 | `idle publish / rollback`에 앞 버전 |

**규칙 테이블을 바꿨을 때** (같은 브랜치, 같은 커밋으로):

1. `idle data`를 돌립니다. 알림에 나온 버전을 적어 둡니다.
2. `idle server`를 `publish`를 끄고 돌립니다. 서버가 VPS에 올라가기만 합니다.
3. `idle publish / rollback`에 1의 버전을 넣어 돌립니다. 서버를 바꾼 뒤 바로 포인터를 옮기므로, 어긋나는 시간은 서버가 다시 시작하는 몇 초뿐입니다.

**여러 단위를 함께 낼 때**(예: 새 프리팹을 쓰는 TS와 그 프리팹): 묶인 액션이 없으면 앞 단위를 `publish`를 끄고 올립니다(조합된 버전은 아래 "버전 찾기"). 다음 단위의 `base`에 그 버전을 넣어 올린 뒤 공개합니다. 한 번에 내려면 `idle all`을 씁니다.

**버전 찾기**: `base`나 `idle publish / rollback`의 `version`에 넣는 16자리 16진수는 아래에서 봅니다.

- 올린 실행: 실행 페이지 맨 위의 요약(Summary)에 `Patch <버전> uploaded`, 공개했으면 `Patch <버전> is live`, 서버와 APK가 나옵니다. 로그로는 `release / release` 잡 → **Build the patch** 단계의 `[TypeScript] channel Android/<API> -> <버전>` 줄. 터미널에서는 `gh run view <실행 id> --log | grep "channel Android"`입니다. 규칙이 바뀌어 올리기만 한 `idle data`는 실행 페이지 위쪽 알림(`Uploaded <버전> without publishing…`)에도 나옵니다.
- APK와 함께 낸 버전: 그 Release 본문의 `패치 버전:` 줄.
- 지금 Live 버전: `curl -s https://idle.dennou.cloud/patch/channels/Android/<API 지문>.json`, 또는 아래의 `status`. 마지막으로 낸 앱은 `curl -s https://idle.dennou.cloud/patch/channels/app/Android.json`입니다.
- 올라간 모든 버전(롤백할 앞 버전 찾기): 아래 `ls -lt` 명령이 만든 시각 순으로 보이고, 각 버전의 기록은 `curl -s https://idle.dennou.cloud/patch/v/<버전>/manifest.json | jq "{build, parts, server}"`로 봅니다(`build`가 만든 실행의 id).

**어느 버전이 Live인지 볼 때**(이 Mac에서):

```sh
PATCH_TARGET=deploy@idle.dennou.cloud:/srv/idle/patch PATCH_SSH="ssh -i $HOME/Keys/idle-deploy -o IdentitiesOnly=yes" npm run patch -w @idle/client -- status
```

```sh
ssh -i ~/Keys/idle-deploy deploy@idle.dennou.cloud 'readlink /srv/idle/server/current; ls /srv/idle/server/releases; ls -lt /srv/idle/patch/v'
```

## 6. 시간, 캐시, 비용

**잰 시간**(2026-10-31, 비공개 저장소의 표준 러너 2 vCPU):

| 실행 | 시간 | 내역 |
| --- | --- | --- |
| `idle all` + APK(41194734472, Library 캐시 없음) | 47분 52초 | 준비·검사 4분 25초, Unity 이미지 받기 3분 43초, 프로젝트 열기 7분 52초, Addressables 1분 53초, 씬·에셋 2분 43초, IL2CPP 21분 7초(C++ 컴파일 18분 29초), Gradle 3분 26초, 올리기·공개·캐시 저장 2분 43초 |
| 처음 만든 워크플로의 두 번째 실행(41183358485) | 체크아웃–테스트 2분 51초, Addressables 단계 12분 4초 | Library 캐시 없음 |
| `idle APK`(41401445577, 2026-11-02, Library 캐시 없음) | 48분 15초 | Build the APK 42분 46초, Library 저장 57초 |
| `idle assets`, `publish` 끔(41399141216) | 15분 27초 | Library 캐시 없음. 조합 검사 3에서 멈춤(그때 Release가 없었음) |
| `idle data`, `publish` 끔(41398422576) | 3분 18초 | 조합 검사 3에서 멈춤(같은 이유) |
| `idle server`, `publish` 끔(41398784285) | 3분 6초 | 서버를 올려 두기만 함 |
| `idle APK`(41412647184, Library 캐시 있음) | 18분 51초 | Build the APK 11분 48초(캐시 없을 때 42분 46초), Library 받기 54초·저장 57초, 디스크 정리 1분 58초 |
| `idle all` + APK(41457129314, 2026-11-02, 공개 저장소의 4 vCPU 러너, Library 캐시 없음) | 27분 19초 | Build the APK 21분 41초(2 vCPU에서 42분 46초), 디스크 정리 1분 46초, 테스트 53초 |
| `idle all` + APK(41637742941, 2026-11-03, 4 vCPU, Library 캐시 있음) | 11분 36초 | Build the APK 6분 19초, 디스크 정리 1분 41초, 테스트 53초, Library 받기 27초·저장 37초 |

Unity를 쓰지 않는 액션은 약 3분이고, Library 캐시가 APK 빌드를 42분 46초에서 11분 48초로 줄였습니다.

**캐시**(크기는 2026-10-31):

| 캐시 | 키 | 크기 | 쓰는 실행 |
| --- | --- | --- | --- |
| npm(`~/.npm`) | `package-lock.json` 해시 | 46 MB | 모두 |
| LFS(`.git/lfs`) | LFS 목록 해시 | 170 MB | Unity |
| PuerTS | `install-puerts.mjs` 해시 | 71 MB | Unity |
| Library(`idle/client/Library`) | `packages-lock.json`·`ProjectSettings` 해시 + 실행 id | 1,994 MB(압축) | Unity |
| GameCI CLI | 버전 | 36 MB | Unity |

캐시는 브랜치마다 따로입니다(한 실행은 자기 브랜치와 `main`의 것만 받음). `feat/p0-foundation`에서 쌓은 캐시는 `main`에서 받지 못하므로 `main`의 첫 Unity 실행은 Library 캐시 없이 돕니다. Unity 실행의 캐시(LFS, PuerTS, Library)는 잡 끝이 아니라 채운 직후에 저장해서, 뒤의 검사나 내보내기가 실패해도 남습니다(2026-11-02에 바꿈. 그전에는 `idle assets`가 Unity 빌드에 성공하고도 조합 검사에서 멈춰 캐시를 남기지 못했음). Library는 실행마다 새로 저장하고, 지난 것은 7일 동안 쓰지 않거나 저장소 합계가 10 GB를 넘으면 GitHub가 지웁니다. 10 GB까지는 무료입니다.

**비용**: 2026-11-02에 공개 저장소가 되어 표준 러너의 실행 시간은 무료입니다(그전에는 비공개 저장소라 무료 플랜 월 2,000분에서 빠졌고 APK 실행 한 번이 약 48분이었음). 공개 저장소의 Linux 표준 러너는 4 vCPU라, Library 캐시 없는 `idle all` + APK가 47분 52초에서 27분 19초로 줄었습니다. VPS는 이미 쓰는 것이라 더 드는 돈이 없습니다.

## 7. 지켜야 할 것

- **한 번에 하나**: 모든 액션이 같은 `concurrency` 그룹(`idle-live`)이라 차례로 돌고, 앞 실행을 취소하지 않습니다. 도는 실행을 손으로 취소하지 않습니다. 올리기는 더하기만 해서 괜찮지만, 공개 중에 멈추면 서버만 바뀌고 포인터는 그대로일 수 있습니다. 그때는 같은 버전을 `idle publish / rollback`으로 다시 공개합니다.
- **`main`에서 실행**: 손으로 실행하는 액션은 기본 브랜치(`main`)에 파일이 있어야 목록에 보입니다. 개발도 `main`에서 하므로 워크플로를 고치면 바로 반영됩니다. 다른 브랜치에서 새 액션을 만들면 `main`에 합친 뒤에 보입니다(2026-10-31까지는 `feat/p0-foundation`에서 개발하며 워크플로만 `main`에 복사했음).
- **비밀값**(Settings → Secrets and variables → Actions → Secrets): `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `UNITY_EMAIL`, `UNITY_PASSWORD`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEYALIAS_PASS`.
- **변수**(같은 곳의 Variables): `VPS_HOST`(`idle.dennou.cloud`), `VPS_USER`(`deploy`), `ANDROID_KEYALIAS_NAME`(`idle`). 숨길 필요가 없는 값이라 변수에 둡니다. 비밀값은 로그에서 같은 글자를 모두 `***`로 가리므로, 이 값들을 비밀값에 두면 로그의 `idle`과 `deploy`가 모두 가려집니다(2026-11-02에 옮김). `UNITY_LICENSE`는 쓰지 않습니다(Personal 라이선스 파일은 CI 컨테이너에서 거절됨).

## 8. 멈췄을 때

| 메시지 | 뜻 | 할 일 |
| --- | --- | --- |
| `No patch is published for API …; a new API needs a full patch.` | 이 커밋의 C# API 채널에 버전이 없음 | 새 C#을 내려면 `idle APK`에 `full_patch`. C#은 아직 내지 않고 데이터나 에셋만 내려면 `base`에 지금 Live 버전 이름을 넣음(게임 TS는 새 API로 빌드되므로 APK 없이 낼 수 없음) |
| `The patch's rule tables (…) differ from the server's (…)` (조합 검사 1) | 패치와 짝 서버의 규칙 지문이 다름 | 5절의 "규칙 테이블을 바꿨을 때"를 따름 |
| `idle/shared differs between the game bundle (…) and the server (…)` (조합 검사 2) | 게임 TS와 서버가 다른 공용 코드로 빌드됨 | `idle game (TS)`에 `server`를 켜거나, `idle server`를 그 TS와 함께 냄 |
| `No released APK runs API …` (조합 검사 3) | 그 API로 빌드된 APK가 Release에 없음 | `idle APK`에 `full_patch` |
| `No game server is live yet; release the server too.` | VPS에 공개된 서버가 없음 | `idle server`나 `idle all` |
| `The server … for … is not on the VPS.` | 공개할 버전의 서버를 올려 두지 않음 | 그 커밋으로 `idle server`를 `publish`를 끄고 돌린 뒤 다시 공개 |
| `The patch does not record which commit built its game bundle` | 단위 기록이 없는 옛 버전이 기준 | `idle all`(지금 Live 버전에는 기록이 있음) |
| Unity 이미지 받기에서 `no space left on device` | 러너 디스크가 모자람(Library 캐시를 풀면 약 8 GB를 더 씀) | 2026-11-02에 지우는 도구를 늘리고 스왑을 `/mnt`로 옮겼음. 다시 나면 Free disk space 단계의 `df`를 보고 더 지움 |
| 기기에서만 `TypeError: … is not a function` | IL2CPP가 TS만 부르는 엔진 멤버를 잘라냄 | 그 타입을 `TypeScriptTypings.cs`의 `[Binding]`에 넣고 Tools/TypeScript/Generate IL2CPP Bridge로 `link.xml`을 다시 만든 뒤 APK를 다시 냄(`client/AGENTS.md`) |
| `ssh: connect to host … Connection timed out` | 러너가 VPS 22번에 붙지 못함(2026-11-02에 한 번, 원인은 못 찾음) | 15초씩 네 번까지 다시 붙고 안 되면 그 단계가 멈춤. 계속되면 VPS의 `sudo ufw status verbose`와 hPanel 방화벽을 봄 |
| Unity가 `exit 137` | 커널이 Unity를 죽임 | 2026-10-31에는 GameCI의 기본 빌드 스크립트가 원인이었고 우리 빌드 메서드로 피했음. 2026-11-03 `idle all`(41623858841)도 Unity를 연 지 2초 만에 `Begin MonoManager ReloadAssembly` 바로 뒤에서 죽었는데, 메모리가 14.6 GB 남았고 OOM 기록도 없었으며 같은 입력으로 다시 돌리자 지나갔음(41637742941). 실패하면 "Report memory" 단계의 기록을 보고, 메모리 문제가 아니면 다시 돌림 |
| Unity 활성화 실패 | 계정 로그인이 안 됨 | `UNITY_EMAIL`·`UNITY_PASSWORD`를 확인(2단계 인증이 막는지는 확인하지 못함) |

## 9. 알려진 문제와 확인하지 못한 것

- **APK 번호**(2026-10-31에 고침): 처음엔 versionCode와 태그가 부른 액션의 실행 번호(`github.run_number`)였습니다. 이 번호는 액션마다 1부터 따로 세므로 `idle APK`의 첫 실행이 versionCode 1이 되어, 이미 설치된 3 위에 덮어 설치할 수 없었습니다. 지금은 Release 태그의 다음 번호를 쓰고(3.5절), 매니페스트의 `build`는 실행 id입니다. 2026-11-02 `idle APK`가 태그에서 번호를 정해 1을 냈습니다(태그를 모두 지운 뒤).
- **돌려 본 것**(2026-11-02): `idle all`, `idle APK`(Library 캐시 없이와 있게), `idle server`(`publish` 끔), `idle data`와 `idle assets`(`publish` 끔, 조합 검사 2까지 통과).
- **돌려 보지 않은 것**: `idle game (TS)`, `idle publish / rollback`, 단위 액션의 올리기와 공개, 규칙 테이블의 세 단계 흐름, Library 캐시를 받은 실행, 실행 요약의 실제 모습.
- **기기**: 2026-11-02 BlueStacks Air(이 Mac, arm64)에서 `idle aos build 2`가 부트 → 패치 → 로그인 → 전투(서버 정산 10초마다)까지 돌았습니다. 빌드 1은 로그인에서 `RemoveListener is not a function`으로 멈췄고, IL2CPP가 TS만 부르는 엔진 멤버를 잘라낸 것이라 PuerTS `[Binding]`과 `link.xml`로 고쳤습니다(`8836c16`). 실제 휴대폰에서는 아직 보지 않았습니다.

## 10. 공개 저장소로 옮기기

2026-11-02에 개발 기록 없이 공개하려고 작업 트리를 루트 커밋 하나로 만들어 새 공개 저장소 `colorsockss/game-portfolio`에 올렸습니다(백로그 76). 옛 저장소는 이름을 `game-portfolio-archive`로 바꿔 비공개로 둡니다. 개발 기록, PR 1, Actions 실행 기록, APK Release 1·2가 그곳에 남습니다.

**같은 저장소에서 강제 푸시하지 않은 이유**: GitHub은 강제 푸시 뒤에도 옛 커밋을 SHA로 열어 주고, 병합된 PR과 Actions 실행 기록도 옛 커밋을 가리킵니다. 이것을 없애려면 GitHub Support에 요청해야 합니다. 개발 기록은 공개하지 않기로 했으므로(2026-10-13 결정), 옛 커밋이 처음부터 없는 새 저장소로 옮겼습니다.

**1. 루트 커밋을 새 저장소로** (Unity가 열려 있어도 됨. 작업 트리를 바꾸지 않고 ref만 옮깁니다)

```sh
gh repo rename game-portfolio-archive -R colorsockss/game-portfolio --yes
gh repo create colorsockss/game-portfolio --public
c=$(git commit-tree 'main^{tree}' -m "<커밋 메시지>")
git push origin "${c}:refs/heads/main"
git remote add archive https://github.com/colorsockss/game-portfolio-archive.git
git update-ref refs/heads/main "$c" && git reset -q
```

**2. 비밀값**: 7절의 비밀값을 새 저장소에 다시 넣습니다(그때는 변수 3개도 비밀값이라 10개였음). 비밀값은 읽어 올 수 없으므로 원본(키 파일, 계정, 키스토어)에서 넣습니다(`gh secret set <이름> -R colorsockss/game-portfolio`).

**3. Live를 새 커밋으로 다시 내기**: Live가 옛 커밋 id를 기억합니다. 패치 매니페스트의 `parts`와 `server`, VPS의 서버 릴리스 이름(`releases/<커밋>`)이 모두 커밋을 가리키고, 조합 검사 2와 5는 그 커밋을 `git diff`로 견주므로, 이것을 마치기 전에는 단위 액션이 `Cannot compare …`로 멈춥니다. Actions → `idle all`, 브랜치 `main`, `apk` 켬. 서버(`releases/<새 커밋>`, 다시 시작), 패치, APK가 새 커밋으로 나갑니다. 조합 검사는 모든 단위가 같은 커밋이라 옛 커밋을 보지 않습니다. 새 저장소에는 태그가 없어 APK 번호가 1부터 다시 시작하므로, 옛 빌드가 깔린 기기는 지우고 설치합니다(저장 데이터는 서버에 있음).

**4. 패치 기록 고치기**(필요할 때만): 마지막 출시 뒤로 패치 내용이 바뀌지 않았으면 버전 이름도 같아서 3의 올리기가 그 버전을 건너뛰고, 매니페스트는 옛 커밋을 그대로 적고 있습니다. 실행 요약의 버전으로 확인합니다.

```sh
curl -s https://idle.dennou.cloud/patch/v/<버전>/manifest.json | jq '{parts, server}'
```

`parts`와 `server`가 새 커밋이 아니면 기록만 바꿔 올립니다(`c`는 1의 커밋이고, 새 셸이면 `c=$(git rev-parse origin/main)`). 기록은 버전 이름에 들지 않으므로 파일과 버전은 그대로입니다(2026-10-31 `e23dd7312d1f78b3`에 한 것과 같음). rsync는 임시 이름에 쓴 뒤 바꿔 넣습니다.

```sh
export PATCH_TARGET=deploy@idle.dennou.cloud:/srv/idle/patch PATCH_SSH="ssh -i $HOME/Keys/idle-deploy -o IdentitiesOnly=yes"
npm run patch -w @idle/client -- pull <버전> /tmp/idle-record
jq --arg c "$c" '.parts |= map_values($c) | .server = $c' /tmp/idle-record/manifest.json > /tmp/idle-record/manifest.new
rsync -t -e "$PATCH_SSH" /tmp/idle-record/manifest.new "deploy@idle.dennou.cloud:/srv/idle/patch/v/<버전>/manifest.json"
npm run patch -w @idle/client -- pull <버전> /tmp/idle-record-check
```

**5. 남는 것과 주의**

- **롤백**: 옮기기 전 버전으로 되돌리면 그 버전이 옛 커밋을 적고 있어, 그 뒤의 단위 액션이 다시 `Cannot compare …`로 멈춥니다. 되돌려야 하면 그 뒤에 `idle all`을 냅니다.
- **VPS**: 옛 서버 릴리스와 패치 버전은 이름에 옛 커밋이 들어 있을 뿐이라 남겨도 됩니다(정리는 설계 4.11절).
- **문서의 커밋 해시와 실행 id**(`performance.md`의 기준 커밋, 6절의 잰 실행 등)는 옛 저장소의 것이라 새 저장소에서 열리지 않습니다. 기록으로만 남깁니다.
- **한 일**(2026-11-02): 1–4를 마쳤습니다. `idle all`(41457129314)이 서버 `c7922ad`, APK `idle aos build 1`을 냈고, 패치는 옛 저장소에서 올려 둔 `28b79e6cf1b7cff3`과 같아 올리기를 건너뛰었으므로 그 기록(`parts`, `server`, `build`)을 새 커밋과 실행으로 고쳤습니다.
