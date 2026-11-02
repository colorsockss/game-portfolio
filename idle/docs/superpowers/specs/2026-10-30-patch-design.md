# 패치 서버와 배포 설계

- 날짜: 2026-10-30. 2026-10-31에 Live를 Cloudflare R2·Railway에서 사용자가 이미 쓰는 Hostinger VPS로 바꿨습니다.
- 범위: 백로그 74의 패치를 어디에 어떤 모양으로 올리고 부트가 어떻게 찾는지, 앱이 환경(로컬, Live)을 어떻게 고르는지, APK·패치·게임 서버를 CI로 어떻게 함께 내보내는지. 부트의 확인 흐름(`client/TypeScript/src/application/update/update.ts`), 릴리스 빌드(`tools/build.mjs`, `tools/manifest.mjs`), 새 올리기 도구, Addressables 빌드 출력(`Assets/Editor/Patch/RemoteContent.cs`), 앱 설정, VPS의 웹 서버와 게임 서버 설정, 새 CI 워크플로를 바꿉니다. 에셋을 번들로 나누는 방식(그룹)과 받는 시점(설치 전에 모두 받음)은 바꾸지 않습니다. Android만 다룹니다.
- 상태: 7절의 1–4단계가 끝났고 Live가 떠 있습니다(2026-10-31, 백로그 75). VPS를 준비했고(`server/deploy/setup.sh`), 이 Mac에서 패치를 올려 채널 포인터를 옮겼으며(`npm run patch`), 게임 서버를 한 번 배포했습니다(`server/deploy/deploy.sh`). 5단계의 CI 워크플로(`.github/workflows/idle-android.yml`)는 썼고, 2026-10-31 두 번째 실행에서 Unity 활성화와 Addressables 빌드까지 확인했습니다(APK 빌드와 내보내기는 아직). 내보내기를 단위로 나눠(4.12절) 단위마다 액션을 두었고(2026-10-31), 전체 액션이 세 번째 실행에서 끝까지 돌아 서버 `ea63042`, 패치 `e23dd7312d1f78b3`, APK Release `idle-android-b3`이 Live였습니다. 2026-11-02에 그 Release와 태그를 지우고 `idle APK`로 `idle aos build 1`을 다시 냈고, 단위 액션은 `publish` 없이 시험했습니다(백로그 75). 같은 날 공개 저장소로 옮겨 Live는 서버 `c7922ad`, 패치 `28b79e6cf1b7cff3`, APK `idle aos build 1`입니다(백로그 76).

## 1. 목적

전에는 패치를 폴더 하나(`client/TypeScript/dist/release/`)째 정적 서버가 내준다고 보았고, 게임 서버 주소(`src/unity/game.ts`)와 패치 주소(`src/unity/boot.ts`)가 코드에 `localhost`로 박혀 있었습니다. 외부에 내보내려면 다섯 가지가 막혔습니다.

- **올리는 동안 섞임**: 새 버전이 같은 경로(`main.mjs`, `data/*.bytes`)를 덮어씁니다. 옛 매니페스트를 읽은 클라이언트가 새 파일을 받으면 해시가 어긋나 실패합니다(받는 곳을 지우고 다시 시도하면 회복됨).
- **앱과 맞지 않는 번들**: 새 C#을 부르는 번들이 옛 APK에 가면 돌지 않습니다. 매니페스트에 그 번들이 필요로 하는 API가 없었습니다.
- **옛 번들**: 부트는 버전이 같아도 캐시에서 지워진 에셋 번들을 다시 받습니다(`prefetch(false, 0)`). 설치된 카탈로그가 가리키는 번들은 서버에 남아 있어야 합니다.
- **환경**: 로컬과 외부(Live)가 게임 서버와 패치 주소가 다른데, 고르는 곳이 없었습니다.
- **패치와 서버의 순서**: 서버는 클라이언트의 데이터 지문이 자기 것과 다르면 막습니다(소켓 경로의 `d=`). 테이블을 바꾼 패치는 서버와 같은 때 나가야 합니다.

성공 기준:

- 어느 순간에 읽어도 클라이언트가 섞인 버전을 보지 않습니다. 올린 뒤 바뀌는 파일은 채널 포인터 하나뿐입니다.
- 앱의 C# API와 맞지 않는 게임 번들은 받지 않습니다.
- APK, 패치, 게임 서버가 한 번의 CI 실행에서 같은 커밋으로 나가고, 패치 → 서버 → 포인터 순서로 내보냅니다.
- 롤백은 그 버전의 서버로 되돌리고 포인터를 되돌리는 것이고, 클라이언트는 그것을 새 버전처럼 받습니다.
- 로컬 시연(`npm run serve:bundle`)이 Live와 같은 레이아웃이라 에디터의 Release에서 같은 흐름을 봅니다.

## 2. 정해진 것

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| 환경 | 로컬과 Live 둘. QA·Dev 채널은 두지 않습니다. | 포트폴리오라 단계를 늘리지 않습니다. 로컬은 로컬 서버와 로컬 버킷, Live는 VPS의 게임 서버와 패치 폴더입니다. |
| 앱 설정 | 커밋된 `client/config/local.json`·`live.json` 가운데 빌드가 고른 것을 앱에 넣습니다(4.5절). 환경 이름, 게임 서버 주소, 패치 주소가 들어갑니다. | 같은 패치가 어느 환경에서나 돌도록 주소를 게임 번들에서 뺍니다. |
| 호스팅 | 사용자가 이미 쓰는 Hostinger VPS(KVM 4) 하나에 패치 파일과 게임 서버를 모두 둡니다. | 추가 비용이 없고 자원이 남습니다(3.3절). |
| 주소 | `idle.dennou.cloud`. 패치는 `https://idle.dennou.cloud/patch/`, 게임 서버는 `wss://idle.dennou.cloud`(경로 `/ws`)입니다. | IP 주소에는 인증서를 달 수 없습니다. 사용자의 도메인이고(DNS는 Hostinger), VPS를 옮겨도 DNS만 바꾸면 되어 APK를 다시 빌드하지 않습니다. |
| 웹 서버 | VPS에서 이미 80·443을 맡은 Caddy 2.6.2에 사이트 하나를 더합니다(4.6절). | 인증서를 기존 사이트처럼 받고 갱신하고, WebSocket을 넘기고, 정적 파일에 헤더를 붙입니다. |
| 바뀌는 것 | 채널 포인터만 다시 씁니다. 나머지는 한 번 쓰면 다시 쓰지 않습니다. | 어느 순간에 읽어도 포인터가 가리키는 것은 모두 있습니다. |
| 게임 파일 | `v/<버전>/` 아래 | 같은 경로를 덮어쓰지 않으므로 섞이지 않고, 주소에 `?<sha256>`도 필요 없습니다. |
| 에셋 번들 | 모든 버전이 `aa/Android/<이름>_<해시>.bundle`을 함께 씁니다. | 같은 내용은 이름이 같아 한 번만 저장하고 한 번만 받습니다(3.2절). Addressables의 로드 경로(`{PatchSource}aa/[BuildTarget]`)를 그대로 씁니다. |
| 채널 | `channels/Android/<API 지문>.json` = `{ "version": "<버전>" }` | API가 같은 APK들이 같은 패치를 받습니다. 바뀐 것이 없는 확인(대부분)은 31B만 받습니다. |
| 앱과 맞는 번들 | `client/TypeScript/types/csharp.d.ts` 머리의 API 지문 | Facades·Views의 public 시그니처와 Unity 버전으로 만들고 C#이 바뀌면 다시 씁니다(4.3절). |
| 빌드 번호 | APK는 Release 태그의 다음 번호, 매니페스트는 CI 실행 id | APK 번호(`versionCode`, 버전 이름, 태그)는 지금까지의 `idle-android-b<번호>` 태그에서 가장 큰 것의 다음이라 저장소 전체에서 늘고, 다시 커밋할 것이 없습니다. 처음엔 `run_number`였는데 부른 액션마다 1부터 따로 세서 낮은 번호가 나오므로 2026-10-31에 바꿨습니다. 매니페스트의 `build`는 그 버전을 만든 실행의 id(`run_id`)입니다. |
| CI | GitHub 호스트 러너(Ubuntu), 손으로 실행할 때만(`workflow_dispatch`). 단위(데이터 테이블 + 서버, 게임 TS, Addressables, 서버, APK)마다 액션이 따로 있고, 고르지 않은 단위는 Live 버전에서 가져옵니다. 공개·롤백도 따로 된 액션이고, 일은 공용 워크플로 하나에 있습니다. | 4.8절, 4.12절 |
| 결과물 | 로컬 APK는 `client/Builds/Android/`(커밋하지 않음), CI APK는 GitHub Release | Actions artifact는 기한이 지나면 지워지지만 Release는 남습니다. |
| APK 서명 | 전용 키스토어 | CI의 디버그 키는 실행마다 달라서 업데이트 설치가 안 됩니다. |
| 앱 ID | Android `cloud.dennou.idle`(2026-10-31, Unity 템플릿의 기본값에서 바꿈) | 도메인을 따릅니다. 첫 APK가 나간 뒤에 바꾸면 다른 앱이 되어 다시 설치해야 합니다. |
| 게임 서버 | VPS의 systemd 서비스. `127.0.0.1`에만 열고 Caddy가 `/ws`를 넘깁니다. SQLite 파일은 VPS 디스크에 둡니다. 자동 배포 없이 CI가 배포합니다. | 서버 번들이 Node 하나로 돌고 VPS에 Node 22.23.1이 있습니다. 패치와 순서를 맞춥니다(4.8절). |
| 올리는 도구 | SSH의 `rsync`. CI 전용 사용자 `deploy`와 전용 키를 씁니다. | 이미 있는 파일 건너뛰기(`--ignore-existing`)가 되고, 파일 하나를 임시 이름에 쓴 뒤 바꿔 넣으며(포인터), 러너와 VPS에 이미 있어 의존이 없습니다. |
| 옛 파일 | 지우지 않습니다. | 100번 내보내도 370MB 이하이고 디스크에 180GB가 남습니다(3.3절). |

## 3. 측정과 비교

### 3.1 지금 파일 (Android, 2026-10-30)

| 종류 | 파일 | 크기 |
| --- | --- | --- |
| 게임 파일 | `main.mjs`, `data/*.bytes` 14개, `aa/Android/catalog_remote.bin` | 약 170KB |
| 에셋 번들 | `remotebattle_assets_all_…` | 2,534,546B |
| | `remoteui_assets_all_…` | 776,597B |
| | `remoteaudio_assets_all_…` | 198,137B |
| | `…_monoscripts_…` | 3,346B |
| 채널 포인터 | `channels/Android/<API 지문>.json` | 31B |
| APK | IL2CPP, ARM64 | 45.5MB |

### 3.2 번들 이름이 내용을 따르는가

같은 프로젝트에서 Addressables 원격 콘텐츠를 두 번 빌드했습니다(`RemoteContent.Build`).

- 첫 빌드(63.5초): 오늘 바뀐 메인 화면 프리팹이 든 UI 번들만 새 이름(`…_6910afb4….bundle`)이 되었고, 전투·소리·monoscripts 번들은 이전 빌드와 이름과 크기가 같았습니다.
- 바꾼 것 없이 다시 빌드(1.7초, 캐시): 모든 번들의 이름과 크기가 같고 카탈로그도 바이트 단위로 같습니다.
- Addressables는 `ServerData/Android/`에서 옛 번들을 지우지 않습니다. 그래서 빌드가 그 폴더를 비운 뒤 만듭니다(4.4절, 구현함).

같은 내용이면 같은 이름이므로, 올리는 도구는 VPS에 없는 이름만 올리고 클라이언트는 바뀐 번들만 받습니다. Live에 나가는 것은 CI만 빌드하므로, 다른 컴퓨터에서 이름이 달라지는지는 CI와 CI 사이에서만 중요합니다(10절).

### 3.3 비용과 용량

| 항목 | 월 비용 | 근거 |
| --- | --- | --- |
| VPS | $0 추가 | 이미 쓰는 KVM 4(4 vCPU, 16GB RAM, NVMe 200GB, 월 대역폭 16TB). 2026-10-31에 메모리 15GiB 중 12GiB, 디스크 193GB 중 180GB가 비어 있었습니다. 다른 서비스(node 앱, PostgreSQL, Caddy)와 함께 씁니다. |
| 대역폭 | $0 | 첫 설치 한 번이 약 3.68MB라 월 16TB면 약 430만 번입니다. 바뀐 것이 없는 확인은 포인터 31B입니다. |
| 게임 서버 | $0 | 개발 서버의 메모리가 55MB입니다. 부하 테스트(M4 Max)에서 15,000명이 초당 1,500요청을 CPU 49%, RSS 247MiB로 받았습니다(README의 성능). VPS에서는 재지 않았습니다. |
| GitHub Actions | $0 | 공개 저장소라 표준 러너는 무료입니다(2026-11-02 공개 전에는 비공개 저장소의 무료 2,000분/월). Unity 빌드 시간은 첫 실행에서 잽니다. |
| GitHub LFS 전송 | $0 | 무료 월 10GiB. Unity 빌드는 LFS 전체(981개, 약 241MB, 2026-10-31)가 필요하므로 캐시 없이는 월 약 44번입니다. LFS 객체를 Actions 캐시에 두어 바뀐 것만 받습니다(4.8절). |
| GitHub Release | $0 | APK(약 45MB)는 파일당 2GiB 한도 안이고 저장소 크기에 세지 않습니다. |

비교한 것: 전의 설계는 Cloudflare R2(저장 10GB·읽기 1,000만 회까지 무료, 전송 무료)와 Railway Hobby(월 $5, 사용량 $5 포함)로 월 $5였습니다. Render는 무료 웹 서비스가 15분 뒤 잠들고 파일이 남지 않아 SQLite를 쓸 수 없고, 유료 웹과 디스크면 약 $7.25입니다.

### 3.4 고르지 않은 것

- **Cloudflare R2 + Railway**(2026-10-30의 설계): 여러 서비스를 써 보려던 것이지만 월 $5가 나가고 계정과 토큰이 둘 더 생깁니다. 이미 있는 VPS가 둘 다 할 수 있습니다.
- **VPS의 기본 호스트 이름**(`srv<번호>.hstgr.cloud`): `hstgr.cloud`가 Public Suffix List에 있어 인증서는 받을 수 있지만, VPS를 바꾸면 이름이 바뀌어 APK를 다시 빌드해야 합니다.
- **기존 사이트의 하위 경로**: 서버 주소는 origin이고 소켓 경로가 `/ws`로 정해져 있어, 기존 페이지와 경로를 나눠 써야 합니다. 서브도메인이면 섞이지 않습니다.
- **Docker**: VPS에 없고, 서버 번들이 Node 하나로 돌아 systemd로 충분합니다.
- **nginx + certbot**: Caddy가 이미 80·443을 맡고 인증서를 다룹니다.
- **채널에 매니페스트를 통째로 둠**: 요청은 하나 줄지만 바뀌는 파일이 커지고(2.3KB), 같은 매니페스트가 두 곳에 생깁니다.
- **게임 파일도 내용 주소(`files/<sha256>`)로**: 겹치는 것이 내보내기마다 170KB뿐이고, 설치된 번들의 같은 파일은 지금도 복사합니다(`planUpdate`).
- **QA 채널**: 처음에는 두려 했지만 포트폴리오에 맞게 뺐습니다. 필요해지면 `channels/Android/<API 지문>.qa.json`과 QA 설정 파일을 더하면 됩니다.
- **자동 배포**(브랜치에 push하면 서버 배포): 서버만 먼저 바뀌어, 패치를 내보내기 전까지 옛 클라이언트가 막히고 작업 중인 커밋까지 Live에 나갑니다.

## 4. 구조

### 4.1 패치 폴더 레이아웃

```
aa/Android/<이름>_<해시>.bundle              모든 버전이 함께 씀. 더하기만 함
v/<버전>/manifest.json                        { version, api, build, parts, server, files }
v/<버전>/main.mjs, data/<테이블>.bytes
v/<버전>/aa/Android/catalog_remote.bin        이 버전의 번들 목록(이름·크기·CRC)
channels/Android/<API 지문>.json              { "version": "<버전>" }. 다시 쓰는 것은 이것뿐
```

`version`은 파일 목록의 해시이고 API 지문도 함께 넣어 만듭니다. 그래서 같은 버전 폴더에 다른 API의 매니페스트가 들어가지 않습니다. `build`(만든 CI 실행의 id, 로컬은 0), `parts`(단위마다 온 커밋), `server`(함께 돌 서버의 커밋)는 기록용이라 버전에 넣지 않습니다(4.12절). 같은 내용을 다른 실행에서 다시 빌드하면 버전이 같아 올리기를 건너뛰고, 처음 올린 실행의 기록이 남습니다. Live의 첫 버전 `e23dd7312d1f78b3`은 이 Mac에서 이전 형식(`commit` 하나)으로 먼저 올라가 CI의 기록이 남지 않았으므로, 2026-10-31에 그 매니페스트만 CI 실행 3의 기록(`build` 3, 단위와 서버 모두 `ea63042`)으로 한 번 바꿔 올렸습니다(파일 16개는 같음). 버전 폴더를 바꿔 쓴 것은 이 한 번입니다. 로컬 버킷(`dist/patch/`)과 VPS의 `/srv/idle/patch/`가 같은 레이아웃입니다.

### 4.2 부트의 확인 (구현함)

`createUpdater`의 `download()`입니다. 받는 곳(staging), 복사, 검증, 미리 받기, 설치는 74 그대로입니다.

1. `channels/Android/<API 지문>.json`을 받아 읽습니다(`parsePointer`: `version`이 16자리 16진수인지 봅니다).
2. 설치된 매니페스트의 버전과 같으면 캐시에서 지워진 번들만 다시 받고 끝(`current`)입니다.
3. 다르면 `v/<버전>/manifest.json`을 받아 `parseManifest`로 읽고, `version`이 포인터와 같고 `api`가 부트의 API 지문과 같은지 봅니다. 다르면 `failed`이고 설치된 번들로 시작합니다.
4. 바뀐 파일만 `v/<버전>/<경로>`에서 받습니다.
5. 모든 파일을 검증하고, 에셋 번들을 미리 받고(`{PatchSource}aa/Android/`, `PatchSource`는 패치 주소), 설치합니다.

설치된 매니페스트를 읽지 못하면(이 변경 전의 형식) 설치된 것이 없다고 보고 모두 받습니다. 받지 못했을 때 설치된 번들로 시작하는 것은 그 번들의 `api`가 앱과 같을 때뿐입니다(새 API의 앱을 설치한 직후 옛 번들로 시작하지 않음).

서버가 요구한 업데이트(`UPDATE_REQUIRED`)는 그대로입니다. 앱의 채널에 새 버전이 없으면(새 C#이 필요해 새 APK의 채널에만 올림) `required`가 되어 "새 버전이 필요합니다" 팝업이 뜨고, 그때는 새 APK를 설치해야 합니다.

### 4.3 앱과 맞는 번들 (구현함)

API 지문은 `TypeScriptTypings`가 Unity 버전과 Facades·Views 타입의 public 시그니처로 만든 16자리 16진수로, `csharp.d.ts`의 둘째 줄(`// API 지문: …`)에 있습니다. 스크립트를 다시 불러올 때 바뀌었으면 파일을 다시 씁니다.

- 릴리스 빌드가 그 줄을 읽어 부트와 게임 번들에 `RUNTIME_API`로 넣고(esbuild `define`), 매니페스트에 `api`로 적습니다.
- 부트 번들은 앱에 들어가므로 부트의 `RUNTIME_API`가 곧 APK의 API입니다. 플레이어 빌드 전처리(`TypeScriptBuildValidation`)가 Resources의 `boot.mjs`에 지금 지문이 들어 있는지 보고, 없으면(C#을 고친 뒤 릴리스 빌드를 다시 하지 않음) 빌드를 멈춥니다.
- Facades에 메서드를 더하기만 해도 지문이 바뀝니다. 새 번들이 그 메서드를 쓰면 옛 APK에서는 돌지 않으므로, 더하기도 맞지 않는 변경으로 다룹니다.
- CI가 패치만 빌드하는데 지문이 마지막 Release APK의 지문과 다르면, 그 패치를 받을 APK가 없으므로 실행을 멈추고 APK도 함께 빌드하라고 알립니다(4.8절).

### 4.4 빌드 (구현함)

- `RemoteContent.Build`: 빌드하기 전에 `ServerData/Android/`을 비웁니다(3.2절).
- `npm run build:release`: 부트 번들은 `Assets/Resources/TypeScript/boot.mjs`에 쓰고, 게임 번들은 로컬 버킷 `client/TypeScript/dist/patch/`에 4.1절의 레이아웃으로 더합니다. `main.mjs`, `data/`, 카탈로그로 매니페스트를 만들어 `v/<버전>/`에 쓰고(다 만든 임시 폴더를 이름만 바꿈), 번들을 `aa/Android/`에 복사하고, 로컬 시연이 바로 새 버전을 보도록 `channels/Android/<API 지문>.json`도 씁니다. 로컬 버킷은 지우지 않고 더하므로 옛 버전과 옛 번들이 남습니다(지우려면 폴더를 지움). 빌드 번호와 커밋은 환경 변수(`BUILD_NUMBER`, `GITHUB_SHA`)가 있으면 매니페스트에 적습니다.
- `npm run serve:bundle`은 `dist/patch/`를 내줍니다.

### 4.5 앱 설정 (구현함)

```json
// client/config/local.json
{ "environment": "local", "server": "ws://localhost:8080", "patch": "http://localhost:8081/" }
// client/config/live.json
{ "environment": "live", "server": "wss://idle.dennou.cloud", "patch": "https://idle.dennou.cloud/patch/" }
```

- 플레이어 빌드가 고른 파일(배치 모드 인자 `-idleEnvironment live`, 없으면 `local`)을 Resources의 `AppConfig.json`으로 넣습니다. 빌드 출력이라 커밋하지 않습니다. 에디터는 이 파일과 상관없이 늘 `local.json`을 읽습니다. 마지막 플레이어 빌드가 남긴 Live 설정으로 에디터가 Live에 붙지 않게 하기 위해서입니다. 전처리는 자리표시(`<…>`)가 남아 있으면 빌드를 멈춥니다.
- C# `RuntimeFacade.Config()`가 그 글을 돌려주고, 부트와 게임이 각자 읽어 검사합니다(`parseAppConfig`: 필드와 주소 모양). 부트는 `patch`로 패치하고, 게임은 `server`로 접속합니다.
- 에디터의 Development 모드는 그대로 패치하지 않고 로컬 출력으로 게임을 시작합니다(`server`만 설정에서 읽음).
- 주소는 비밀이 아니므로 커밋합니다. 비밀값은 GitHub Secrets에만 둡니다(9절).

### 4.6 VPS의 폴더와 웹 서버

```
/srv/idle/patch/                      Caddy가 /patch/로 내줌. deploy가 씀
/srv/idle/server/releases/<커밋>/      서버 번들(main.mjs, main.mjs.map, data/)
/srv/idle/server/current              → releases/<커밋>. 서비스가 여기서 돎
/srv/idle/data/game.sqlite            SQLite(WAL 파일 둘이 옆에 생김)
```

모두 `deploy`의 것이고, Caddy(사용자 `caddy`)가 읽도록 패치 폴더는 755, 파일은 644이며, 저장 데이터 폴더는 750입니다. VPS의 Caddyfile(2026-10-31)에는 다른 사이트들이 있고 Caddy는 그 파일로 돕니다(`caddy run --config /etc/caddy/Caddyfile`). `server/deploy/setup.sh`가 아래 사이트를 `/etc/caddy/idle.caddy`로 쓰고, Caddyfile 끝에는 `import /etc/caddy/idle.caddy` 한 줄만 더합니다. 검사(`caddy validate`)가 실패하면 Caddyfile을 되돌립니다.

```
idle.dennou.cloud {
	handle /ws {
		reverse_proxy 127.0.0.1:8080
	}
	handle_path /patch/* {
		root * /srv/idle/patch
		header /channels/* Cache-Control "no-cache"
		header /aa/* Cache-Control "public, max-age=31536000, immutable"
		header /v/* Cache-Control "public, max-age=31536000, immutable"
		file_server
	}
	handle {
		respond 404
	}
}
```

- 인증서는 Caddy가 Let's Encrypt로 받고 갱신합니다(기존 사이트와 같음). DNS에 `idle` A 레코드가 먼저 있어야 합니다.
- 채널 포인터는 CDN이 없으므로 캐시하지 않게 합니다. 바뀌지 않는 `aa/`·`v/`는 1년 동안 캐시해도 됩니다.
- 압축(`encode`)은 켜지 않습니다. UnityWebRequest가 `Content-Encoding: gzip`을 풀어 파일에 쓰는지 기기에서 보지 않았고, 풀지 않으면 해시가 맞지 않습니다. 확인한 뒤 켜면 `main.mjs`가 142KB에서 약 48KB가 됩니다.
- 설정을 바꿀 때는 `caddy validate` 뒤 `systemctl reload caddy`로 바꿉니다. 다시 시작하지 않으므로 기존 사이트가 끊기지 않습니다. 이 Mac에는 Caddy가 없어 사이트 설정은 VPS의 검사에서 처음 확인됩니다.

### 4.7 올리기와 내보내기

`client/TypeScript/tools/patch.mjs`(`npm run patch -w @idle/client -- <명령>`, 구현함). 읽기와 쓰기가 모두 `rsync`입니다.

- `upload`: 로컬 버킷의 `aa/`를 먼저, `v/`를 그다음에 올립니다(`rsync -rt --ignore-existing`). 이미 있는 이름은 건너뛰고, 숨은 파일과 빌드가 쓰다 남긴 `*.tmp`는 올리지 않습니다. `channels/`는 올리지 않습니다. 권한은 로컬 파일의 것(644·755)을 따릅니다. macOS의 `openrsync`는 `--chmod`가 없어 쓰지 않습니다.
- `release <버전>`: 올라간 `v/<버전>/manifest.json`을 받아 버전과 `api`가 지금 `csharp.d.ts`의 지문과 같은지 본 뒤 포인터를 씁니다. `rsync`는 임시 이름에 쓴 뒤 바꿔 넣으므로 클라이언트가 반쯤 쓴 포인터를 읽지 않습니다.
- `status`: 올라간 포인터마다 API 지문과 가리키는 버전을 보입니다.
- `pull <버전|current> <폴더>`: 올라간 버전 폴더를 받아 매니페스트로 검증합니다. `current`는 이 커밋의 API 채널이 가리키는 버전이고, 채널이 없으면(새 API) 멈춥니다. 단위로 나눠 낼 때의 기준 버전입니다(4.12절).
- `release`는 그 버전이 맞춰 빌드된 API(매니페스트의 `api`)의 채널을 옮깁니다. 그래서 다른 API의 앞 버전으로 돌아가는 롤백도 같은 명령입니다. 서버를 맞추는 공개는 워크플로가 `deploy.sh`와 함께 합니다.

대상은 `PATCH_TARGET`(Live는 `deploy@idle.dennou.cloud:/srv/idle/patch`)이고 SSH 옵션은 `PATCH_SSH`(예: `ssh -i ~/Keys/idle-deploy`)입니다. 대상이 로컬 폴더여도 같으므로 테스트는 임시 폴더를 VPS 대신 씁니다. CI는 `VPS_SSH_KEY`를 키 파일로, `VPS_KNOWN_HOSTS`를 `known_hosts`로 씁니다(처음 보는 호스트 키를 믿지 않음). 로컬에서도 같은 명령을 쓸 수 있지만, Live에 내보내는 것은 서버와 순서를 맞추는 CI로만 합니다.

### 4.8 CI

아래는 처음 만든 `idle-android.yml`(한 커밋에서 패치 전체·서버·APK)의 기록입니다. 2026-10-31에 단위 액션과 공용 워크플로 `idle-release.yml`로 바뀌었고(4.12절), 아래의 러너·캐시·APK 빌드·내보내기 순서는 그대로 공용 워크플로에 있습니다. 지금의 `ci.yml`(타입 검사와 테스트)은 그대로 둡니다. 실행은 한 번에 하나이고(`concurrency`), 앞 실행을 취소하지 않습니다(반쯤 내보낸 채 멈추지 않게).

- **실행**: `workflow_dispatch`만. 실행 화면에서 브랜치를 고르고, 입력은 `apk`(APK 빌드), `patch`(패치 빌드와 내보내기), `server`(패치와 함께 서버 배포, 기본 켬. 테이블과 프로토콜이 그대로면 끌 수 있음), `rollback`(되돌릴 버전. 있으면 나머지를 무시)입니다.
- **러너**: `ubuntu-24.04`, Unity는 GameCI 이미지 `unityci/editor:ubuntu-6000.6.0f1-android-3`(있는 것을 확인함). 디스크를 비우는 단계를 먼저 둡니다(이미지와 `Library`가 큼).
- **캐시**: `idle/client/Library`(키: `Packages/packages-lock.json`, `ProjectSettings` 해시와 실행 id. 실행마다 새로 저장하고 가장 최근 것을 받습니다. 처음엔 해시만이라 같은 키면 저장을 건너뛰어 첫 실행의 Library에 머물렀습니다(2026-10-31에 바꿈). 압축해 약 2 GB이고, 지난 것은 GitHub가 지웁니다(7일 동안 쓰지 않거나 저장소 합계 10 GB 초과. 10 GB까지 무료), LFS 객체(`.git/lfs`, 키: `git lfs ls-files` 목록의 해시), PuerTS(`npm run setup`의 약 270MB, 키: 설치 스크립트의 버전).
- **빌드 단계**(실패하면 아무것도 내보내지 않음):
  1. 체크아웃(LFS 전체), Node 22.14.0, `npm ci`, `npm run setup`, `npm run typecheck`, `npm test`.
  2. 패치: `game-ci/unity-builder@v6`의 `buildMethod`로 `RemoteContent.Build` → 설정 JSON의 TS 환경을 Release로 바꾸고(`jq`, 플레이어 빌드 전처리가 요구함) `BUILD_NUMBER=${{ github.run_number }} npm run build:release`. 버전과 API 지문은 빌드가 쓴 로컬 포인터에서 읽습니다.
  3. 지문 검사: 패치만 빌드하면 지금 API 지문이 마지막 Release 본문의 `API 지문`과 같아야 합니다. Release가 없거나 다르면 APK도 함께 빌드하라며 멈춥니다.
  4. APK: Unity는 한 번만 띄웁니다. `unity-builder`의 `buildMethod`로 `PlayerBuild.BuildForCi`를 부르고(`customParameters: -idleEnvironment live`, Addressables도 내면 `-idleRemoteContent`를 더해 같은 실행에서 원격 콘텐츠도 빌드), 출력 경로·`androidVersionCode`(실행 번호)·버전 이름 `0.1.<실행 번호>`·키스토어는 GameCI가 넘기는 인자에서 읽습니다. GameCI의 기본 빌드 스크립트를 쓴 두 번의 실행(2026-10-31)은 Unity가 어셈블리를 불러오다 메모리 부족 없이 죽어서(exit 137, 스왑 11 GB에도 같음) 쓰지 않습니다. 부트 번들은 Unity 전에 만들고, 패치는 Unity가 카탈로그를 만든 뒤 조합합니다.
  5. 서버: `npm run build -w @idle/server`(`server/dist/`의 `main.mjs`와 `data/`. 의존 패키지를 번들에 넣어 `node_modules`가 필요 없음).
- **내보내기 단계**(순서): `~/.ssh/config`에 배포 키와 `known_hosts`를 두고 → `patch.mjs upload` → 서버 배포(`server/deploy/deploy.sh <커밋>`: 서버 번들을 `releases/<커밋>/`에 임시 이름으로 올려 이름을 바꾸고, `current`를 임시 링크의 rename으로 옮긴 뒤 `sudo systemctl restart idle-server`, `https://idle.dennou.cloud/ws`가 404(서버가 답함)인지 봄. 502는 Caddy가 못 닿음) → `patch.mjs release <버전>` → GitHub Release(태그 `idle-android-b<실행 번호>`, APK 첨부, 본문에 빌드 번호·패치 버전·API 지문·커밋). 서버가 바뀐 뒤 포인터를 옮기기까지 짧게 어긋날 수 있지만, 막힌 클라이언트는 "새 버전이 필요합니다"에서 다시 시도하면 맞춰집니다.
- **롤백**(따로 된 잡): `rollback` 버전의 매니페스트에서 `commit`을 읽어, VPS에 `releases/<그 커밋>/`이 있으면 `deploy.sh <그 커밋>`(올리기 없이 `current`만 옮겨 다시 시작)을 하고 포인터를 되돌립니다. 서버 없이 패치만 낸 버전(`server` 끔)은 그 커밋의 서버가 없으므로, 그때는 서버를 그대로 두고 포인터만 되돌립니다(테이블과 프로토콜이 그대로라 끈 것이므로).
- **로컬 APK**: 비밀값이나 CI 없이 기기에서 보려면 에디터 메뉴 `Tools/Build/Android APK (Local)`·`(Live)`(`Assets/Editor/Build/PlayerBuild.cs`)가 `client/Builds/Android/idle-<환경>.apk`를 만듭니다. 서명은 플레이어 설정의 것(키스토어가 없으면 디버그 키)이라, CI의 APK와는 서로 덮어 설치할 수 없습니다.

### 4.9 게임 서버 (VPS)

- systemd 서비스 `idle-server`(`server/deploy/setup.sh`가 만들고 켜 둠. 첫 배포가 `current`를 만든 뒤 시작): 사용자 `deploy`, 작업 폴더 `/srv/idle/server/current`, 환경 `HOST=127.0.0.1`, `PORT=8080`, `DATABASE_PATH=/srv/idle/data/game.sqlite`, `SERVER_MODE`는 비워 `release`(치트 꺼짐), 실행 `/usr/local/bin/node --enable-source-maps main.mjs`, `Restart=on-failure`. 쓰기는 저장 데이터 폴더만 되게 막습니다(`ProtectSystem=strict`, `ReadWritePaths=/srv/idle/data`, `ProtectHome`, `PrivateTmp`, `NoNewPrivileges`).
- Node는 VPS에 이미 있는 것을 다른 앱과 함께 씁니다(`/usr/local/bin/node`, v22.23.1).
- 서버 코드에는 `HOST`를 더했습니다(구현함). VPS에서는 Caddy 뒤의 `127.0.0.1`에만 열고, 정하지 않으면 지금처럼 모든 인터페이스에 엽니다(로컬 개발).
- `deploy`에게는 sudo를 주지 않고, 서비스를 다시 시작하는 한 줄만 허락합니다(`/etc/sudoers.d/idle-deploy`: `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart idle-server`, `visudo`로 검사한 뒤 넣음).
- 다시 시작하면 접속이 끊기고, 클라이언트는 지금의 재연결로 다시 붙습니다. 인스턴스는 하나이고, SQLite가 한 프로세스만 쓰는 지금 구조와 맞습니다.
- SQLite 파일은 Hostinger의 주간 백업에 함께 들어갑니다.

### 4.10 검증이 이어지는 길

포인터 → 매니페스트(버전이 포인터와 같고 `api`가 앱과 같음, 파일마다 크기와 SHA-256) → 카탈로그(매니페스트의 SHA-256) → 번들(카탈로그의 CRC, 그룹의 `UseAssetBundleCrc`가 켜져 있음). 전송은 HTTPS가 지키고, 쓰기는 `deploy`의 SSH 키가 지킵니다.

### 4.11 옛 파일

지우지 않습니다. 나중에 지우려면 살아 있는 포인터가 가리키는 버전과 최근 N개를 남기고, 남긴 버전의 카탈로그가 가리키는 번들만 남깁니다. 카탈로그는 바이너리라 읽기 어려우므로, 그때는 빌드가 `v/<버전>/` 옆에 번들 이름 목록을 함께 적게 합니다(클라이언트는 받지 않음). 서버 릴리스 폴더도 같은 때 정리합니다.

### 4.12 내보내기 단위 (2026-10-31, 구현함, 전체 액션만 돌려 봄)

지금 워크플로(4.8절)는 한 커밋에서 패치 전체, 서버, APK를 한 번에 만듭니다. 그래서 TS만 고쳐 내려 해도 같은 브랜치에서 작업 중인 테이블이나 에셋이 함께 나가고, TS만 바꿔도 Unity 빌드를 기다립니다. 내보내기를 **함께 나가야 하는 것끼리**의 단위로 나눕니다. 고른 단위만 이번 커밋에서 만들고, 나머지는 지금 Live 버전의 것을 그대로 가져옵니다.

#### 단위

| 단위 | 담기는 것 | 함께 나가야 하는 것 | 만드는 데 드는 것 |
| --- | --- | --- | --- |
| `strings` 문장·소리 | `data/Strings.bytes`, `data/Sounds.bytes` | 없음 | 생성되어 커밋된 파일 복사(초) |
| `rules` 규칙 테이블 | 나머지 12개 `data/*.bytes` | `server`(같은 커밋) | 복사(초) |
| `game` 게임 TS | `main.mjs` | 함께 돌 서버의 커밋과 `idle/shared/`가 다르면 `server` | 타입 검사와 esbuild(CI의 타입 검사 21초) |
| `assets` Addressables | 에셋 카탈로그와 에셋 번들 | 새 TS가 새 프리팹이나 뷰 참조를 쓰면 그 `game` | Unity(CI 12분 4초, Library 캐시 없음) |
| `server` 게임 서버 | `server/dist/`(서버 번들과 그 커밋의 규칙 테이블) | 단독은 규칙 지문과 `idle/shared/`가 Live 패치와 같을 때만 | esbuild(초) |
| `apk` 앱 | C#, 부트 번들(부트 화면의 Strings 포함) | C# API가 바뀌면 그 API의 전체 패치(`game`, `rules`, `strings`, `assets` 모두) | Unity IL2CPP(CI에서 재지 않음) |

근거:

- 서버는 규칙 테이블 12개의 지문(`RULE_TABLES`, 소켓 경로의 `d=`)이 자기 것과 다르면 연결을 끊습니다. Strings와 Sounds는 클라이언트만 써서 지문에 들어가지 않습니다.
- 클라이언트의 예측과 서버의 확정은 같은 `idle/shared/`(game-core 규칙, 생성된 공식, 프로토콜) 코드로 돌아야 합니다. 프로토콜 버전(`PROTOCOL_VERSION`)이 다르면 서버가 받지 않습니다.
- 부트 번들은 앱 안에 있어 패치로 바뀌지 않습니다. 부트 화면의 문장도 앱에 든 Strings입니다(게임 화면의 문장은 패치의 Strings).
- 새 API의 채널은 비어 있어 가져올 Live 버전이 없습니다.

CI 시간(2026-10-31 두 번째 실행 41183358485): 체크아웃부터 테스트까지 2분 51초(디스크 비우기 61초, LFS 14초, 타입 검사 21초, 테스트 53초). Addressables 단계는 12분 4초였습니다. 이미지 받기와 GameCI 준비가 5분 34초, 활성화 5초, Library 캐시 없는 가져오기와 컴파일 5분 8초, 빌드 61초입니다. 그래서 TS나 테이블만 내는 실행은 Unity를 건너뛰어 약 4분이 됩니다(추정). 전체 액션의 세 번째 실행(41194734472, APK 포함, Library 캐시 없음)은 47분 52초였습니다: 준비와 검사 4분 25초, 이미지 받기 3분 43초, 프로젝트 열기(컴파일과 가져오기) 7분 52초, Addressables 1분 53초, 플레이어 빌드의 씬·에셋 2분 43초, IL2CPP 21분 7초(이 가운데 C++ 1,320개 컴파일이 2 vCPU에서 18분 29초), Gradle 3분 26초, 올리기·공개·캐시 저장 2분 43초. 앞의 실패한 실행들은 Library를 저장하지 못했고, 이 실행이 처음 저장했습니다(압축 1.99 GB). 더 줄일 곳은 IL2CPP 코드 생성 옵션(Faster (smaller) builds)과 더 큰 러너(4코어 분당 $0.012, 8코어 $0.022, 무료 분이 적용되지 않음)이고, Library 캐시를 받은 실행의 시간을 잰 뒤 정합니다.

#### 패치 조합

- **기준 버전**: 기본은 그 API의 채널이 지금 가리키는 버전이고, `base` 입력으로 바꿀 수 있습니다. CI가 VPS에서 그 버전의 파일을 받아 옵니다(`patch.mjs pull <버전>`).
- **조합**: 고른 단위의 파일은 이번 커밋에서 만들고, 고르지 않은 단위의 파일은 기준 버전의 것을 그대로 씁니다. 둘을 모아 매니페스트를 만들고 지금처럼 `v/<버전>/`에 올립니다. 버전은 지금처럼 파일과 API로 정해지므로 바뀐 것이 없으면 같은 버전이 됩니다.
- **매니페스트의 기록**: 지금의 `commit` 대신 단위마다 어느 커밋에서 왔는지(`parts: { game, rules, strings, assets }`)와 이 버전과 함께 돌 서버의 커밋(`server`)을 적습니다. `server`는 이번에 `server`를 골랐으면 이번 커밋, 아니면 그때 Live 서버의 커밋(VPS의 `current` 링크)입니다. 다만 `rules`를 골랐는데 이 커밋의 규칙 지문이 Live 서버와 다르면 이번 커밋을 적고(짝 서버) 올리기만 합니다. 클라이언트는 이 필드를 읽지 않습니다.
- **API**: `game`을 고르지 않으면 기준 버전의 `main.mjs`를 쓰므로 API도 기준 버전의 것입니다. `apk`가 새 API를 가지면 기준이 없으므로 패치 네 단위를 모두 골라야 합니다.

#### 조합 검사

사람이 묶음을 기억하지 않도록 CI가 맞지 않는 조합에서 멈춥니다.

1. 조합한 패치의 규칙 지문이 함께 돌 서버의 규칙 지문과 다르면 멈춥니다(`rules`를 골랐는데 `server`를 고르지 않은 경우 등).
2. 패치의 `game` 커밋과 함께 돌 서버의 커밋이 `idle/shared/`에서 다르면 멈춥니다(`git diff --quiet <게임 커밋> <서버 커밋> -- idle/shared`).
3. 패치의 API로 빌드된 APK가 Release에 없고 이번에 `apk`도 고르지 않았으면 멈춥니다(받을 앱이 없음). `apk`가 새 API면 패치 네 단위를 모두 골라야 합니다.
4. `server`만 골라 바로 공개하면 1과 2를 지금 Live 패치에 대해 봅니다. 올려 두기만 하면(`publish` 끔) 보지 않습니다. 공개할 패치가 만들 때 그 서버와 이미 견줬습니다.
5. 경고만 냅니다: `game` 커밋과 `assets` 커밋이 `idle/client/Assets/Remote/`나 `TypeScript/src/unity/views/`에서 다르면 알립니다. 프리팹 키나 뷰 참조가 어긋났는지는 CI가 판단하지 못합니다.

#### 올리기와 공개

- **올리기**는 `v/<버전>/`, 에셋 번들, 서버 릴리스 폴더(`releases/<커밋>/`)를 더하기만 하므로 Live에 영향이 없습니다.
- **공개**는 그 버전의 `server` 커밋으로 서버를 맞추고(지금과 다르면 `deploy.sh`), 채널 포인터를 그 버전으로 옮기는 것입니다. 순서는 지금처럼 서버 → 포인터입니다.
- **롤백**은 앞 버전의 공개와 같습니다. 그래서 지금의 `rollback` 입력은 공개·롤백 액션(공용 워크플로의 `publish_version`)이 되고, 앞으로 가든 뒤로 가든 같은 단계입니다.
- `server`만 고른 실행의 공개는 서버를 다시 시작하는 것이고 포인터는 그대로입니다.

#### 액션

단위마다 GitHub Actions에 따로 실행하는 액션(워크플로)을 둡니다. 각자 Run 버튼과 실행 기록이 있습니다. 사용법은 [release.md](../../release.md)에 있습니다. 실제 일(빌드, 조합, 검사, 올리기, 공개)은 공용 워크플로 하나(`idle-release.yml`, `workflow_call`)에만 있고, 단위 액션은 정해진 단위로 그것을 부르는 짧은 파일입니다. 같은 일을 여러 파일에 쓰지 않습니다. 공용 워크플로는 `workflow_call`만 있어 Run 버튼이 없지만, GitHub가 워크플로 파일을 모두 목록에 보이므로 `idle release (shared)`로 보입니다. 액션 이름(`name:`)은 영어이고 입력 설명은 한국어입니다. 규칙 테이블과 문장·소리는 따로 낼 일이 없어 한 액션으로 합쳤고(2026-10-31), 매니페스트는 그대로 `rules`와 `strings`를 따로 적습니다. 처음엔 서버도 함께였다가(`idle data + server`) 같은 날 서버를 뺐습니다.

| 액션(파일) | 부르는 단위 | 실행 화면의 입력 |
| --- | --- | --- |
| `idle data`(`idle-data.yml`) | `rules`, `strings` | `publish`(규칙 테이블이 Live 서버와 다르면 켜도 올리기만 하고 이 커밋의 서버를 짝으로 적음), `base` |
| `idle game (TS)`(`idle-game.yml`) | `game`(+ `server`) | `server`(서버도 함께, 기본 끔. `idle/shared/`가 다른데 끄면 검사 2가 멈춤), `publish`, `base` |
| `idle assets (Addressables)`(`idle-assets.yml`) | `assets` | `publish`, `base` |
| `idle server`(`idle-server.yml`) | `server` | `publish`(켜면 바로 다시 시작) |
| `idle APK`(`idle-apk.yml`) | `apk`(+ 패치 네 단위) | `full_patch`(API가 바뀌었으면 켜야 함. 끄고 API가 다르면 검사 3이 멈춤) |
| `idle publish / rollback`(`idle-publish.yml`) | 없음 | `version`(올라가 있는 버전. 그 버전의 서버로 맞추고 포인터를 옮김) |
| `idle all`(`idle-all.yml`) | 여섯 단위 모두 | `publish`. 첫 출시나 큰 변경용으로, 지금의 `idle-android.yml`을 대신함 |

- **공용 워크플로의 입력**: `game`, `rules`, `strings`, `assets`, `server`, `apk`(불), `base`, `publish`, `publish_version`. 비밀값은 `secrets: inherit`로 넘깁니다. Unity 단계는 `assets`나 `apk`일 때만 돕니다.
- **한 번에 하나**: 모든 단위 액션이 같은 `concurrency` 그룹(`idle-live`)을 써서, 두 내보내기가 섞이지 않고 차례로 돕니다(앞 실행을 취소하지 않음).
- **규칙 테이블을 바꿀 때**: 서버는 데이터와 따로 냅니다(2026-10-31, 사용자 결정). `idle data`가 패치를 올리고 이 커밋의 서버를 짝으로 적습니다. 같은 커밋으로 `idle server`를 `publish`를 끈 채 돌려 서버를 올려 두고, `idle publish / rollback`에 그 버전을 넣으면 서버를 바꾼 뒤 포인터를 옮깁니다. 서버와 패치가 한 실행에서 바뀌어 어긋나는 시간이 다시 시작하는 몇 초뿐입니다. 문장·소리만 바뀌었거나 규칙이 Live 서버와 같으면 `idle data` 하나로 공개됩니다. 짝 서버인지는 `tools/data-schema.mjs <데이터 폴더>`가 찍는 규칙 지문으로 봅니다.
- **여러 단위를 함께 낼 때**: 게임 TS와 Addressables처럼 함께 나가야 하는데 묶인 액션이 없으면, 앞 단위를 `publish`를 끈 채 올리고(조합된 버전이 나옴) 다음 단위를 `base`에 그 버전을 넣어 올린 뒤 공개합니다. 바로 함께 내려면 전체 액션을 씁니다.
- **실행 시간**: Unity가 없는 액션(데이터 + 서버, 게임 TS, 서버, 공개)은 체크아웃부터 테스트까지 약 3분에 내보내기를 더한 정도이고, Addressables와 APK와 전체는 Unity 단계가 더해집니다(위 CI 시간). 액션마다 체크아웃과 테스트를 따로 돕니다.
- **기본 브랜치**: 손으로 실행하는 액션은 기본 브랜치(`main`)에 그 파일이 있어야 보입니다. 2026-10-31까지는 `feat/p0-foundation`에서 개발하며 워크플로만 `main`에 복사했고, 그날부터 `main`에서 개발해 따로 맞출 것이 없습니다.

#### 나중에

- 배우와 발사체의 모습(클립, 색, 크기) 열이 규칙 테이블(Heroes, Monsters, Summons, Projectiles)에 있어서, 모습만 바꿔도 규칙 지문이 바뀌어 `server`를 함께 내야 합니다. 모습 열을 따로 떼면 `strings`처럼 단독으로 낼 수 있습니다.

## 5. 바뀌는 파일

1–2단계(구현함, 0c9eebd): `RemoteContent.cs`, `RuntimeFacade.cs`, `TypeScriptEnvironmentMenu.cs`, `TypeScriptTypings.cs`, `client/config/*.json`, `update.ts`, `boot.ts`, `game.ts`, `composition.ts`, `tools/build.mjs`, `tools/manifest.mjs`, `tools/serve.mjs`와 그 테스트.

3단계의 저장소 쪽(구현함, 2026-10-31): `TypeScript/tools/patch.mjs`와 `tools/api.mjs`(API 지문 읽기를 빌드와 나눠 씀), `TypeScript/package.json`(`patch`), `server/src/main.ts`(`HOST`), `server/deploy/setup.sh`(Caddy 사이트, 폴더, `deploy`, 서비스, sudoers).

4–5단계(2026-10-31): `server/deploy/deploy.sh`(서버 배포와 롤백), `Assets/Editor/Build/PlayerBuild.cs`(로컬 APK 메뉴. CI는 GameCI의 기본 빌드를 써서 배치 모드 진입점이 필요 없음), `TypeScriptBuildValidation`(메뉴가 고른 환경을 먼저 봄), `RemoteContent.BuildForCi`(GameCI가 성공으로 읽는 줄을 남김), `.github/workflows/idle-android.yml`, `README.md`의 패치 절과 루트 `README.md`의 CI 절(LFS 수치).

내보내기 단위(4.12절, 구현함 2026-10-31):

- `shared/data-schema`: `RULE_TABLES`를 내보냄. `TypeScript/tools/data-schema.mjs`가 그것과 `fingerprint`를 esbuild로 불러와 도구가 같은 목록을 따로 정의하지 않음.
- `TypeScript/tools/build.mjs`: 고른 단위만 만들고(`--parts=game,rules,strings,assets`) 나머지는 검증한 기준 버전의 폴더에서 복사(`--base=<폴더>`), `--server=<커밋>`, 더할 버킷 `--bucket=<폴더>`. `tools/manifest.mjs`: 매니페스트의 `parts`와 `server`, `verifyManifest`.
- `TypeScript/tools/patch.mjs`: `pull <버전|current> <폴더>`, `release`는 그 버전의 API 채널.
- `TypeScript/tools/release-check.mjs`(새 파일): 조합 검사 1, 2, 5. 검사 3(받을 앱)은 워크플로가 Release 본문의 API 지문으로 봄.
- `server/deploy/deploy.sh`: `--stage`(올리기만).
- `.github/workflows/idle-release.yml`(새 파일, `workflow_call`): 4.12절의 입력, 기준 버전 받기, 조합 검사, Unity 단계 조건, 올리기와 공개, `publish_version`(롤백).
- 단위 액션 7개(새 파일): `idle-data.yml`(처음엔 `idle-strings.yml`과 `idle-rules.yml`이었다가 2026-10-31에 합침), `idle-game.yml`, `idle-assets.yml`, `idle-server.yml`, `idle-apk.yml`, `idle-publish.yml`, `idle-all.yml`. `idle-android.yml`은 지웠습니다.
- `README.md`의 패치 절, 루트 `README.md`의 CI 절, `client/AGENTS.md`의 내보내기 규칙.

## 6. 테스트

- 구현함: `update.test.ts`(포인터가 같으면 매니페스트를 받지 않음, `v/<버전>/`에서 받음, `api`나 버전이 다르면 `failed`, 주소에 쿼리 없음, 이전 형식의 설치, 다른 API의 설치), `build.test.ts`(로컬 버킷 레이아웃, 번들은 매니페스트에 없음, `api`가 바뀌면 버전도 바뀜, `build`·`commit`은 버전을 바꾸지 않음, 다시 빌드해도 덮지 않음), `config.test.ts`, `integration/test/update.test.ts`.
- 구현함: `patch.test.ts`(임시 폴더를 VPS 대신 씀: 번들과 버전 폴더만 올리고 이미 있는 것과 포인터는 두며, `release`는 올라간 이 API의 버전만 받음, `status`), 서버의 `bundle.test.ts`(`HOST=127.0.0.1`로 띄워 그 주소로 로그인).
- Unity: 에디터의 Release로 첫 설치, 같은 버전(포인터만), 새 버전, 롤백을 로컬 버킷으로 확인했습니다(2026-10-30).
- VPS 첫 배포(2026-10-31, 확인함): 패치를 올려 포인터를 `e23dd7312d1f78b3`으로 옮긴 뒤, HTTPS로 매니페스트의 16개 파일을 받아 크기와 SHA-256이 모두 맞았고, 포인터는 `no-cache`, 버전 폴더와 번들은 `immutable`, 압축 없음이었습니다. 서버(`releases/b64d9f3…`)는 `/ws`에 404로 답했고, `wss://idle.dennou.cloud`로 맞는 데이터 지문의 연결은 열리고 틀린 지문은 `4000`(버전 불일치)으로 닫혔습니다(로그인은 하지 않음). 기존 사이트 둘은 그대로 200입니다.
- CI 첫 실행: 빌드 시간, 캐시 크기, LFS 전송량을 재서 README에 적고, 받은 APK를 Android 기기에 설치해 Live에서 첫 설치 → 로그인을 확인합니다. 두 번째 실행(2026-10-31)까지 Unity 활성화와 Addressables 빌드를 확인했고 시간은 4.12절에 있습니다.
- 내보내기 단위(4.12절, 구현함): `build.test.ts`가 고르지 않은 단위(문장)는 기준 버전의 파일과 커밋 기록을 잇고, 고른 단위(규칙 테이블)는 이번 커밋의 것이며, 기준 버전이 매니페스트와 다르면 멈추는지 봅니다. `patch.test.ts`가 `pull`(지금 버전, 이름으로, 매니페스트와 다르면 멈춤)과 `release`가 그 버전의 API 채널을 옮기는지 봅니다. `release-check.test.ts`가 임시 git 저장소와 진짜 테이블로 검사 1, 2, 5와 단위 기록이 없는 버전을 봅니다. 워크플로와 공개(서버를 맞춘 뒤 포인터를 옮김)는 전체 액션의 실행 3(2026-10-31)에서 처음 돌았고, 단위 액션은 아직 돌려 보지 않았습니다.

## 7. 순서

1. 앱 설정과 주소 옮기기(로컬만으로 확인). 끝남.
2. 로컬 버킷 레이아웃, 포인터, API 지문(로컬 시연으로 확인). 끝남.
3. VPS 준비와 `patch.mjs`(로컬에서 VPS로 올려 확인). 끝남.
4. VPS 게임 서버(손으로 한 번 배포). 끝남.
5. CI 워크플로(APK, 패치, 서버, Release, 롤백). 썼고 비밀값도 넣었습니다(2026-10-31). Unity 활성화와 Addressables 빌드까지 확인했습니다.
6. 내보내기를 단위로 나누기(4.12절: 단위마다 액션, 공용 워크플로 하나). 구현했고 돌려 보지 않았습니다. 첫 실행은 전체 액션입니다.

## 8. 범위 밖

- 매니페스트 서명(배포 키가 뚫린 경우). TLS와 키의 범위(`deploy` 사용자)로 막습니다.
- "새 버전이 필요합니다" 팝업에서 APK를 받는 곳으로 가는 링크.
- 번들을 더 잘게 나누기(배우마다)와 필요할 때 받기. `Actor.prefab`이 모든 클립 묶음을 참조하는 구조를 바꾸는 일과 함께 따로 합니다.
- Play Console 올리기, iOS.
- 부팅 확인과 앞 슬롯으로 돌아가기, 이전 번들 캐시 정리(`CleanBundleCache`). 지금의 알려진 한계 그대로입니다.
- Hostinger 주간 백업 밖의 SQLite 백업.

## 9. 할 일 (직접 하셔야 하는 것)

| 곳 | 할 일 | GitHub Secrets |
| --- | --- | --- |
| DNS | hPanel의 `dennou.cloud`에 A 레코드 `idle` → 187.127.101.236. 끝남(2026-10-31) | 없음 |
| VPS | CI 전용 SSH 키(`~/Keys/idle-deploy`)를 만들고 VPS에서 root로 `server/deploy/setup.sh`를 돌림. 끝남(2026-10-31). 비밀값만 남음 | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS` |
| Unity | 계정 이메일·비밀번호. 끝남(2026-10-31). Personal은 CI가 계정으로 좌석을 받습니다(라이선스 파일 `.ulf`는 만든 컴퓨터에 묶여 CI 컨테이너에서 거절되므로 `UNITY_LICENSE`는 쓰지 않음) | `UNITY_EMAIL`, `UNITY_PASSWORD` |
| Android | 전용 키스토어 만들기(잃으면 업데이트 설치가 안 되니 따로 백업), base64로 바꾸기 | `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASS`, `ANDROID_KEYALIAS_NAME`, `ANDROID_KEYALIAS_PASS` |

GitHub Release는 태그가 빌드한 커밋을 붙잡습니다. 그래서 2026-11-02에 기록 없이 공개할 때 같은 저장소를 강제 푸시하지 않고 새 공개 저장소로 옮겼고, 옛 Release와 태그는 비공개로 둔 옛 저장소(`game-portfolio-archive`)에 남았습니다([release.md 10절](../../release.md#10-공개-저장소로-옮기기)).

## 10. 위험

- GameCI 이미지에서 PuerTS 네이티브 플러그인과 IL2CPP Android 빌드가 도는지는 해 보지 않았습니다. 로컬 macOS에서만 빌드했습니다.
- Unity Personal의 CI 활성화가 실패하면 빌드 단계가 멈춥니다. 첫 실행(2026-10-31)은 `.ulf`로 활성화하려다 `TimeStamp validation failed`로 멈췄고, 그 뒤 계정 방식(GameCI CLI의 personal)으로 바꿨습니다. 계정에 2단계 인증이 켜져 있으면 이 방식이 막힐 수 있습니다.
- 번들 이름의 안정성은 같은 컴퓨터, 같은 Unity(6000.6.0f1)에서만 확인했습니다. CI의 첫 빌드는 로컬과 이름이 달라 한 번은 모두 새로 올라갈 수 있습니다. 그 뒤로는 CI끼리 같아야 하고, 아니면 매번 다시 받습니다(맞게는 돎).
- API 지문은 Facades·Views만 셉니다. TS가 그 밖의 C#을 부르게 되면 지문이 그 변경을 놓칩니다(지금은 Unity 컴포넌트를 `ViewRefs`로만 씀).
- VPS를 다른 서비스와 함께 씁니다. Caddy 설정을 잘못 바꾸면 다른 사이트도 멈추므로 `caddy validate` 뒤 reload만 합니다. 다른 서비스가 CPU나 메모리를 다 쓰면 게임 서버도 느려집니다. Node도 다른 앱의 것이라, 그 앱이 Node를 바꾸거나 지우면 게임 서버도 따라 바뀝니다(22.13보다 낮아지면 시작하지 못함).
- VPS 하나가 패치와 서버를 모두 맡아, VPS가 멈추면 둘 다 멈춥니다. 설치된 번들로 시작은 하지만 로그인은 되지 않습니다.
- 배포 키가 새면 패치와 서버 코드를 바꿀 수 있습니다. 키는 `deploy` 사용자로만 좁히고, 새면 VPS의 `authorized_keys`에서 바로 지웁니다.
- 서버 배포와 포인터 사이의 짧은 어긋남 동안 접속이 막힐 수 있습니다(다시 시도로 회복).
- 단위로 나누면 한 패치에 여러 커밋의 파일이 섞입니다. 테스트는 커밋 하나 안에서만 맞는지 보므로, 조합 검사(4.12절)가 잡지 못하는 어긋남(TS가 쓰는 프리팹 키나 뷰 참조, 테이블이 고른 클립 이름)은 Live에서 처음 드러날 수 있습니다. 그런 변경은 관련 단위를 함께 고르고, 경고(검사 5)를 무시하지 않습니다.
- 기준 버전의 파일은 VPS에서 받아 오므로, 받은 파일을 그 버전의 매니페스트로 검증한 뒤에만 조합에 씁니다.
