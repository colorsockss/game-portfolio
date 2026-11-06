# 키우기 (idle)

방치형 RPG 포트폴리오입니다. Unity 6000.6.0f1 + PuerTS Core/V8 3.0.3 클라이언트와 Node 서버로 이루어지고, 워크스페이스는 저장소 루트의 npm workspaces에 들어 있습니다. 이 문서의 경로는 이 폴더(`idle/`) 기준이고(루트의 `tools/`, `scripts/` 제외), 명령은 저장소 루트에서 실행합니다. 현재 TS 실행 환경은 **Development**입니다.

## 구조

```
client/              Unity 프로젝트 (Assets, Packages, ProjectSettings). Packages/core·v8(PuerTS)는 npm run setup이 받음
  TypeScript/        클라이언트 게임 로직 (PuerTS, @idle/client)
server/              게임 서버 (@idle/server)
shared/              클라이언트와 서버가 반드시 같은 코드를 써야 하는 것만
  codes/             숫자 목록: 패킷 번호 Opcode, 게임 실패 코드 GameErrorCode (@idle/codes)
  protocol/          통신 계약: 패킷의 요청·응답 형태, 봉투, 결과·종료 코드, 세션, 직렬화 (@idle/protocol)
  game-core/         양쪽이 같은 결과를 내야 하는 게임 규칙과 도메인 타입: 저장 데이터·커맨드 형태, 커맨드 적용, 공식, 시간 (@idle/game-core, formulas.ts는 생성 파일)
  big-number/        저장 데이터와 규칙이 쓰는 큰 수 타입과 연산 (@idle/big-number)
  data-schema/       테이블 타입·MessagePack 로더·데이터 (@idle/data-schema, 생성 파일)
integration/         클라이언트 앱을 서버 로직에 붙여 함께 돌리는 테스트 (@idle/integration)
balance/             밸런스 시뮬레이션: 새 계정으로 N시간 플레이한 성장 곡선 (@idle/balance)
data/                기획 데이터 원본 (*.xlsx 테이블, formulas.json 공식 프로젝트)
docs/                백로그(backlog.md), 설계 기록(superpowers/)
```

데이터·공식 툴(`tools/`)과 생성·경계 검사 스크립트(`scripts/`)는 저장소 루트에 있고 MMORPG(`mmo/`)와 함께 씁니다.

공용(`shared/`)에 둘지는 "클라이언트와 서버가 반드시 같아야 하는가"로 정합니다. 통신 계약, 클라이언트가 즉시 적용하고 서버가 같은 코드로 검증하는 게임 규칙, 저장 데이터가 쓰는 큰 수, 테이블은 양쪽이 어긋나면 버그이므로 `shared/`에 한 벌만 둡니다. 한쪽만 쓰는 것은 그쪽에서 구현합니다. 예를 들어 새 플레이어 생성과 저장 데이터 마이그레이션은 서버가, 큰 수 표기(1.2K, 3.4aa)와 타이머 표시는 클라이언트가 맡고, 시계는 각자 둡니다. 같은 계약의 양 끝도 각자 구현합니다. 예를 들어 `StateSync`의 지문과 바뀐 슬라이스를 내는 일은 서버가, 예측의 지문과 견주거나 받은 슬라이스를 적용하는 일은 클라이언트가 합니다.

의존 방향은 `client`, `server` → `shared` 한쪽이고, 클라이언트와 서버는 서로를 의존하지 않습니다. `tools`는 `shared`에 생성 파일을 쓸 뿐 import하지는 않습니다. 클라이언트를 실제 서버 로직에 붙여 보는 테스트는 둘을 모두 의존하는 `integration/`에 둡니다. 밸런스 시뮬레이션(`balance/`)은 공용 패키지와 서버의 새 계정 생성(`@idle/server/save`)을 씁니다. npm은 모든 워크스페이스를 루트 `node_modules`에 연결하므로 선언하지 않은 import도 해석됩니다. 그래서 `npm test`가 먼저 `scripts/check-boundaries.mjs`로 각 워크스페이스가 import하는 패키지와 클라이언트 안의 층 사이 import를 검사합니다. `shared/*`는 빌드 단계 없이 TS 소스(`src/index.ts`)를 그대로 내보내고, 사용하는 쪽이 각자 esbuild로 번들합니다.

공용 패키지 사이의 방향은 `codes`, `big-number`가 아무것도 의존하지 않는 맨 아래이고, `data-schema` → `big-number`(테이블의 `big` 열), `game-core` → `codes`, `big-number`, `data-schema`, `protocol` → `codes`, `big-number`, `game-core`입니다. 게임 규칙이 전송 계약에 기대지 않고, 전송 계약이 그 규칙의 타입 위에 얹힙니다. codes에는 숫자 목록만 있습니다. 패킷 번호(`Opcode` 하나에 시스템 API와 게임 커맨드가 모두 있음)와 게임 실패 코드(`GameErrorCode`)는 규칙과 전송이 모두 쓰므로, 어느 쪽도 의존하지 않는 패키지에 한 번만 정의합니다. game-core는 도메인 타입도 정의합니다. 저장 데이터(`PlayerState`와 그 슬라이스), 커맨드(`Command`, `CommandOf`, `CommandOpcode`), 규칙이 거절한 이유(`GameError`), 로그인 ID 규칙(`LOGIN_ID_LENGTH`, `LOGIN_ID_PATTERN`, `isValidLoginId`), 버전이 붙은 저장(`PlayerSnapshot`)과 그 변경분(`StateSync`)의 형태이고, 커맨드를 적용하는 규칙이 이를 씁니다. protocol은 그 위의 와이어 계약입니다. opcode별 요청·응답(`Apis`), 봉투, 결과 코드(`ResultCode`), 세션(`Session`), 종료 코드(`CloseCode`), 소켓 경로, MessagePack 직렬화, `PROTOCOL_VERSION`, `MAX_UNANSWERED_COMMANDS`가 여기에 있습니다. protocol은 도메인 타입을 다시 내보내지 않으므로, 도메인 타입은 game-core에서, 번호는 codes에서, 전송 계약은 protocol에서 가져옵니다.

통신 형식을 바꾸는 변경은 대부분 protocol 안에서 일어나지만, 와이어에 실리는 game-core 타입(`PlayerState`, `Command`, `PlayerSnapshot`, `StateSync`, `GameError`)의 형태를 바꿔도 바이트가 달라집니다. 어느 쪽을 고쳤든 `PROTOCOL_VERSION`을 올려야 하는지 확인하고, `PlayerState`의 형태가 바뀌면 서버에 저장된 데이터의 마이그레이션도 필요합니다. `shared/protocol/test/wire.test.ts`가 대표 요청과 응답 33개의 MessagePack 바이트를 스냅숏으로 고정해 두므로 의도하지 않은 바이트 변경은 이 테스트가 잡고, 스냅숏은 와이어를 일부러 바꿀 때만 `PROTOCOL_VERSION` 판단과 함께 갱신합니다.

큰 수 `Big`은 `{ m, e }` 일반 객체(m × 10^e, 1 ≤ |m| < 10)라서 저장 데이터와 메시지에 별도 변환 없이 실립니다. 연산은 `Big.add(a, b)`처럼 함수로 하며 숫자도 그대로 받습니다. 클라이언트가 예측한 결과와 서버가 검증한 결과가 비트까지 같아야 하므로, double의 사칙연산·비교와 정확히 표현되는 10의 거듭제곱(10^22까지)만 쓰고 엔진마다 마지막 비트가 다를 수 있는 `Math.pow`·`Math.log10`은 쓰지 않습니다. 그래서 거듭제곱은 정수 지수만 받습니다. 1234는 1.234 × 10^3으로 저장되는데 1.234가 2진수로 정확하지 않아서, 다른 연산으로 만든 같은 정수가 마지막 비트에서 다를 수 있습니다. 재화·아이템 수량은 `Big.floor`로 맞추면 `Big.from`으로 만든 값과 같아집니다. int64 테이블 값(`bigint`)은 `Big.from`으로 바꿉니다. 테이블의 `big` 열은 십진 텍스트(`1.5e40`)로 저장하고 로더가 `Big.parse`로 읽습니다. `Big.parse`는 소수점을 문자열에서 옮겨 가수와 정수 지수를 따로 구한 뒤 `Number`를 한 번만 부르므로 double을 넘는 값도 받고, 같은 십진 값(`0.07e41`, `7e39`)은 쓴 모양과 상관없이 같은 `Big`이 됩니다. 형식이 틀리면 `RangeError`입니다. 표기(1.2K, 3.4aa)는 클라이언트의 `presentation/format/big.ts`가 맡습니다.

규칙은 시계를 읽지 않습니다. 서버는 요청마다 한 번, 클라이언트는 서버 시간 추정치에서 시각을 읽어 epoch ms `now`로 넘기므로, 같은 입력이면 양쪽 답이 같고 테스트는 아무 시각이나 고를 수 있습니다. game-core의 `time.ts`에 일일 리셋(`gameDay`, `nextDailyReset`, 한국 시간 09:00)과 경과 시간 상한(`elapsed`)이 있습니다. 두 시각의 `gameDay`가 다르면 그 사이에 리셋이 지난 것입니다.

`shared/*`는 모든 호스트(PuerTS V8, Node, 브라우저)에서 같은 코드가 돌아야 하므로 `csharp`/`puerts` import와 표준 전역 외의 호스트 API를 쓰지 않습니다. PuerTS V8에 없는 표준 전역(MessagePack이 쓰는 `TextEncoder`/`TextDecoder`)은 클라이언트가 공유 패키지보다 먼저 채우며(`src/host/`), 클라이언트 빌드 테스트는 이 전역 없이 번들을 실행해 순서를 검사합니다. 공유 패키지의 tsconfig에는 DOM lib과 `@types`가 없어서 이를 어기면 `npm run typecheck`에서 오류가 납니다. 테스트는 vitest로 각 워크스페이스의 `test/`에 둡니다. vitest 타입이 Node 타입을 함께 가져오므로 테스트는 `test/tsconfig.json`으로 따로 검사해 `src/` 검사에 Node API가 섞이지 않게 합니다.

## 데이터와 공식

`data/`의 원본을 고친 뒤 `npm run generate`를 실행하면 두 도구로 생성 파일을 갱신합니다.

| 원본 | 도구 | 생성 파일 |
| --- | --- | --- |
| `data/*.xlsx` (Git LFS) | data-tool | `shared/data-schema/src/tables/` (테이블 타입·로더), `shared/data-schema/data/` (`.bytes`, 검토용 `.json`) |
| `data/formulas.json` | formula-tool, `scripts/generate.mjs` | `shared/game-core/src/formulas.ts`, `shared/game-core/src/ability-type.ts` (`E_AbilityType`) |

생성 파일은 원본과 함께 커밋합니다. xlsx는 diff가 보이지 않으므로 생성된 TS·JSON의 diff로 변경을 검토합니다. `npm test`는 먼저 `npm run generate -- --check`와 같은 검사를 실행해 생성 파일이 원본과 다르면 실패합니다. 생성 파일은 직접 수정하지 않습니다.

- **테이블**: 시트 작성 규칙은 [tools/data-tool/README.md](../tools/data-tool/README.md)를 참고하세요. 클라이언트와 서버는 같은 호스트 중립 로더(data-tool의 portable 출력, 파일 접근과 폴리필 없음)를 쓰며(`loadGameData`), 각자 `.bytes`를 읽는 방법만 넘깁니다. 테이블을 추가하면 `shared/data-schema/src/index.ts`의 `TABLES`에 이름을 더합니다(`loadGameData`가 그 목록으로 읽음). 지금 열네 개(`Items`, `Skills`, `Effects`, `Projectiles`, `Summons`, `Monsters`, `Stages`, `Heroes`, `HeroLevels`, `StatUpgrades`, `Sounds`, `Constants`, `TutorialSteps`, `Strings`)와 Enum 정의(`Enums`)이고, `Effects`는 스킬이 거는 버프·디버프, `Projectiles`는 스킬이 쏘는 발사체의 속도, `Summons`는 스킬이 부르는 소환수이며(아래 전투의 효과, 발사체, 소환수), `StatUpgrades`는 골드로 올리는 능력치 강화이고(아래 골드 강화), `Strings`는 화면의 문장이며(아래 문장과 언어), `Items`는 가질 수 있는 것(골드, 경험치)과 그 보유 상한이고(아래 보상과 보유량), `HeroLevels`는 레벨별 능력치와 다음 레벨까지의 경험치 요구량입니다(아래 레벨). `Sounds`는 클라이언트만 쓰는 소리 키와 클립이지만(아래 소리) 테이블은 모두 한곳에서 읽으므로 서버도 393바이트를 더 읽습니다. `big` 열(HP, 공격력처럼 double을 넘을 수 있는 값)이 있는 테이블의 로더는 `Big`을 가져와야 하므로 data-tool에 `--big-module @idle/big-number`를 넘기며, `npm run generate`가 이를 합니다.
- **검사**: 변환이 타입과 id 중복에 더해 스키마 시트의 검사 열을 확인합니다. `ref`(값이 그 테이블의 id), `enum`(`Enums`의 멤버), `range`(`0..`, `0..1` 같은 값 범위), `length`(배열 원소 수의 범위 `1..`나 길이가 같아야 하는 짝 배열), `when`(`kind=Equipment`처럼 조건이 맞는 행에만 있는 열. `kind=Damage|Heal`처럼 값을 여럿 적을 수 있습니다. 다른 행은 비워야 하고, 조건이 맞는 행에서는 열의 타입대로 필수거나 선택)입니다. 지금 데이터에 건 규칙은 `Stages.monsterIds`·`bossId` → `Monsters`(사냥할 몬스터는 하나 이상), `clearItemIds`·`Monsters.rewardItemIds` → `Items`, `unlockStageId` → `Stages`, `recommendedLevel`·`unlockLevel` → `HeroLevels`, `Heroes`·`Monsters.skillIds` → `Skills`, `Skills.effectIds`·`Effects.effectIds` → `Effects`(정화의 목록은 하나 이상), `Skills.projectileId` → `Projectiles`(적 대상 스킬만, `Projectiles.speed`는 `0.1..`), `Skills.summonId` → `Summons`(자신 대상 스킬만), `Skills.costItemId` → `Items`(`maxLevel`과 `Heroes.skillSlots`는 `1..`, `learnCost`는 `0..`), `Summons.skillIds` → `Skills`(`maxHpRate`는 `0.01..`, `durationSeconds`는 `0.1..`, `maxCount`는 `1..`), `StatUpgrades`의 `amount`는 `0..`, `maxStep`은 `1..`, 보상 수량 배열과 아이템 배열의 길이, 수량·능력치·상한·시간의 `0..`(최대 HP, 스킬의 최대 대상 수, 웨이브의 몬스터 수는 `1..`, 웨이브의 등장 간격은 `0.1..`, 확률과 소리 크기는 `0..1`), `Items.slot`·`grade`와 스탯 열은 장비만(`slot`과 `grade`는 장비에 필수), `Skills.powerMultiplier`는 적 대상 스킬만, `Effects`의 `stat`·`tickSeconds`·`power`·`effectIds`는 그 열을 쓰는 종류만(`tickSeconds`는 `0.1..`), 종류·슬롯·등급·소리 채널·스킬 속성·대상·대상 규칙·효과 종류·능력치의 Enum, `Constants`의 영웅·경험치·골드·소리 키 참조, `TutorialSteps`의 조건 열(`Stages`, `HeroLevels`, `EquipSlot`), 이름과 대사의 키 열(`nameKey`, `textKey`) → `Strings`입니다. `Strings`의 언어 열은 필수라 번역이 빠진 칸도 변환이 실패합니다. 위반은 모아서 한 번에 `파일: 시트!셀 (열): 내용`으로 알리고(예: `idle/data/Stages.xlsx: Data!D2 (monsterIds[1]): 2999 is not an id in Monsters`), 하나라도 있으면 아무 파일도 쓰지 않아 `npm run generate`와 `npm test`(`--check`)가 실패합니다. 검사는 데이터 툴 한 번(0.14–0.15 s, 전과 같음) 중 참조 검사가 약 8 µs입니다(Apple M4 Max, Node 22.14). 변환이 검사하지 않는 것: `HeroLevels`의 레벨이 1부터 최대 레벨까지 이어지는지(빠지면 레벨업이 던짐. game-core 테스트가 배포 데이터로 확인), `Constants`의 소리 키가 맞는 채널인지(틀리면 클라이언트가 경고하고 소리를 내지 않음. 클라이언트 테스트가 확인), `TutorialSteps.target`이 그 뷰의 항목인지(클라이언트 테스트가 배포 데이터로 확인, 아래 튜토리얼), 영웅이 장착할 수 있는 스킬에 `learnCost`와 `costItemId`가 있는지(`when`은 같은 행의 값만 보므로 game-core 테스트가 배포 데이터로 확인, 아래 스킬), 같은 키의 언어들이 같은 `{이름}` 인자를 쓰는지(클라이언트 테스트가 확인, 아래 문장과 언어).

  규칙은 코드가 아니라 스키마 시트에 둡니다. 규칙은 열의 성질이라 타입·기본값·설명과 같은 행에 두면 열을 더하거나 바꿀 때 한 곳만 고치고, data-tool은 게임 코드를 모른 채(두 게임이 함께 쓰는 툴) 같은 규칙을 읽으며, 검사가 셀을 읽는 자리에서 돌아 시트·행·열을 바로 짚습니다. 코드에 두면 `idle/` 쪽 규칙 파일이 열 이름을 문자열로 다시 적어 같은 개념이 두 곳에 생기고, 툴이 게임 코드를 불러야 합니다. 시트로 적기 어려운 규칙(위의 레벨 연속)은 아직 시뮬레이션이 던지는 것으로 둡니다.
- **상수와 Enum**: 기획이 조정하는 규칙 값과, 코드가 고르는 테이블 행은 `data/Constants.xlsx`에 있습니다. 시트 하나에 상수 하나가 행 하나인 키-값 시트(`index`, `name`, `type`, `value`, `description`과 검사 열 `ref`·`range` 등, data-tool의 키-값 시트)라서 상수를 더하면 행 하나가 늡니다. 값은 그 행의 `type`으로 읽으므로 타입이 틀리거나 빈 값은 `npm run generate`가 그 셀을 짚어 실패하고(`Constants!D4 (offlineCapHours): invalid number (expected double)`), 없는 Sounds 키 같은 참조는 다른 테이블처럼 `ref`가 잡습니다. 생성 코드는 필드마다 타입이 있는 행 하나(`ConstantsRow`)라서 로더가 Map 대신 그 행을 돌려줘 `data.constants.offlineCapHours`처럼 읽고, 시트에 없는 이름을 쓰는 코드는 `npm run typecheck`가 실패합니다. 지금 영웅(`heroId`), 경험치 아이템(`expItemId`), 골드 아이템(`goldItemId`, 강화가 비용을 냄), 오프라인 보상 상한(`offlineCapHours`, 12), 장비 가방(`equipmentCap`, 100), 몬스터가 나오는 영웅 앞 거리(`spawnDistance`, 5.5), 기본 공격 스킬이 없을 때의 사거리(`meleeRange`, 1), 부활 시간(`reviveSeconds`, 3), 전투 효과음과 누름 소리의 키(`hitSfx` … `clickSfx`. BGM은 스테이지마다 `Stages.bgm`)입니다. 다른 테이블처럼 `.bytes`로 읽는 데이터라서 데이터만 바꿔 조정하고(92바이트), 읽는 비용은 속성 하나입니다. 바이너리는 이름 없이 `index` 순서의 값 배열입니다. 이름-값 쌍으로 저장하면 상수 13개 기준으로 84바이트가 231바이트가 되고 로드가 0.4 µs에서 1.3 µs로 늘며(Node 22.14), Strings처럼 문자열 값의 Map으로 두면 319바이트에 읽을 때마다 파싱하고 타입 있는 접근도 없어서 고르지 않았습니다. Enum은 `data/Enums.xlsx`의 행(`ItemKind.Equipment` | 3)이 정의하고, 변환이 TS enum(`shared/data-schema/src/tables/Enums.ts`)을 만들며 그 Enum을 쓰는 열의 타입이 됩니다(`ItemsRow.kind: ItemKind`). 정수 Enum(`ItemKind`, `EquipSlot`, `Grade`)과 문자열 Enum(`SoundChannel`, `SkillElement`, `SkillTarget`, `TargetRule`, `EffectKind`, `Stat`)이 있고, 검사와 코드가 같은 정의를 쓰도록 따로 있던 game-core의 `ItemKind`, 클라이언트의 `EquipSlot`과 채널 이름(`Channel`), `StatModifier.stat`과 장비 화면의 스탯 이름을 이것으로 바꿨습니다. Enum은 타입이라 런타임 데이터가 아니라 생성 코드입니다.

  코드에 남긴 상수와 이유: `TICK_MS`(저장된 체크포인트의 재사용 대기와 보스 시간이 틱 수라서 바꾸면 이미 저장된 전투의 뜻이 바뀜), `MAX_SETTLE_TICKS`(정산 한 번의 서버 CPU 상한이자 오프라인 표본 길이. 보상은 인정 시간 / 표본 길이로 늘리므로 기대 보상을 바꾸지 않음), `LOGIN_ID_LENGTH`(신뢰 경계의 입력 검사이고 이미 있는 계정 ID가 걸림), `DAILY_RESET_UTC`(아직 쓰는 규칙이 없고, 바꾸면 저장된 게임 일자가 밀림), 서버·전송의 타임아웃과 `PROTOCOL_VERSION`·`MAX_UNANSWERED_COMMANDS`(코드의 동작과 함께 배포해야 하고 데이터로 바뀌면 안 됨), 클라이언트의 표시 값(위치, 색, 기본 볼륨). 공식 상수(`formulas.json`의 `minDamage`, `elementStrong`, `upgradeCostGrowth` 등)는 공식 식만 읽으므로 Formula Lab이 시뮬레이션할 수 있게 그대로 두고, 코드가 읽는 값만 `Constants`에 둡니다. 두 곳에 같은 값은 없습니다.
- **공식**: `data/formulas.json`을 Formula Lab(`npm run tauri dev -w @idle/formula-tool`)에서 열어 편집·시뮬레이션하고 저장합니다. 앱의 "TS로 내보내기" 대신 `npm run generate`를 써도 같은 코드가 나옵니다. 공식이 참조하는 스탯·공식 key의 `E_AbilityType`(`shared/game-core/src/ability-type.ts`)도 `npm run generate`가 같은 프로젝트의 키(스탯 다음 공식)로 만듭니다. 툴은 게임의 enum을 가져다 쓸 뿐(`exportSettings.abilityTypeImport`) 만들지 않습니다. 공식은 `exportSettings.numeric: "big"`로 `Big`을 돌려주는 코드가 됩니다. 그래서 거듭제곱 `pow`는 `Big.pow`(정수 지수, 제곱을 거듭하는 곱셈이라 비트가 같음)이고 `sqrt`, `round`, `ceil`, `rand`, `randInt`, `%`는 쓸 수 없으며, Formula Lab의 편집기가 그 자리를 짚습니다. 조건식(`비교 ? 값 : 값`, `&& || !`)을 씁니다. 공식은 스탯과 상수 말고 부르는 쪽이 넘기는 **입력**(`inputs`, 생성 코드의 `FormulaInput`)을 읽으며 `Formula.get(type, caster, target, { power })`의 마지막 인자로 넘깁니다([tools/formula-tool/README.md](../tools/formula-tool/README.md)). 현재 공식은 열일곱 개입니다:
  - `damage`: 공격 하나의 피해(시뮬레이션이 공격마다 부르고 스킬 배율과 치명을 곱함). 식 `max(minDamage, caster.attack - target.defense)`의 값은 샘플입니다.
  - `dotDamage`, `heal`, `shield`: 효과(`Effects`)의 지속 피해·회복 한 번의 양과 보호막의 흡수량. 걸 때 시전자, 대상, 입력 `power`(`Effects.power`)와 `skillLevel`(건 스킬의 레벨)로 정하고 지금 식은 `floor(caster.attack * power * skillLevelRate)`입니다.
  - `statBuff`: 능력치 효과의 비율(0.3 = +30%). 다른 효과처럼 걸 때 시전자, 대상, `power`, `skillLevel`로 정해 겹에 담고, 지금 식은 `power * skillLevelRate`입니다.
  - `skillLevelRate`, `skillMultiplier`, `skillLevelCost`: 스킬 레벨(67, 아래 스킬). `skillLevelRate`는 입력 `skillLevel`의 배율 `1 + skillRatePerLevel * (skillLevel - 1)`(1레벨이 정확히 1, 지금 레벨마다 +10%)이고 다른 공식이 부릅니다. `skillMultiplier`는 레벨을 반영한 피해 배율 `powerMultiplier * skillLevelRate`(입력 `powerMultiplier`는 `Skills.powerMultiplier`), `skillLevelCost`는 배운 스킬을 한 레벨 올리는 비용 `floor(skillLevelBaseCost * pow(skillLevelCostGrowth, skillLevel - 1))`(1000, 1600, 2560 … 9 → 10레벨 42,949, 10레벨까지 합 112,863)입니다.
  - `elementMultiplier`: 속성 상성 배율(입력 `elementAdvantage`가 1이면 `elementStrong`, -1이면 `elementWeak`). 몬스터에 속성이 없어 아직 부르는 곳이 없습니다(`Monsters`에 `element` 열과 상성표가 생기면 피해에 곱함).
  - `upgradeCost`: 강화 비용 `floor(upgradeBaseCost * pow(upgradeCostGrowth, step))`. 골드 강화가 입력 `step`(지금 단계)으로 부릅니다(`statUpgradeCost`, 아래 골드 강화). 장비 강화는 곡선을 따로 맞추려고 아래 `enhanceCost`를 씁니다.
  - `enhanceCost`, `enhanceStat`: 장비 강화(68, 아래 강화와 합성). `enhanceCost`는 단계 `step`에서 한 단계 올리는 골드 `floor(enhanceBaseCost * pow(enhanceCostGrowth, step))`(500 × 1.5^step), `enhanceStat`은 강화한 스탯 하나 `floor(base * (1 + enhanceStatPerStep * step))`(입력 `base`는 장비 행의 스탯, 단계마다 +20%)입니다.
  - `rebirthPoints`, `rebirthRate`: 환생(69, 아래 환생). `rebirthPoints`는 입력 `level`(확정한 영웅 레벨)에서 환생하면 받는 포인트 `level >= rebirthMinLevel ? pow(level - rebirthMinLevel + 1, 2) : 0`(30레벨 1, 50레벨 441, 0이면 환생할 수 없음), `rebirthRate`는 입력 `points`(쌓은 포인트)의 영구 배율 `1 + rebirthRatePerPoint * points`(0포인트가 정확히 1, 포인트마다 +0.1%)입니다.
  - `summonMaxHp`, `summonAttack`, `summonDefense`: 소환수의 능력치(59). 시전자는 소환자의 효과 전 능력치, 대상은 `Summons` 행, 입력 `skillLevel`은 소환 스킬의 레벨이고 코드가 내림합니다(지금 식은 소환자 능력치 × 배율 × `skillLevelRate`, 아래 소환수).


커밋 메시지에는 `feat(client):`, `fix(server):`, `data:`처럼 영역을 붙여 영역별 이력을 추적합니다.

## 처음 설정

[저장소 MANUAL](../MANUAL.md)의 처음 설정(Node.js, Git LFS, 클론, `npm ci`)을 먼저 합니다.

PuerTS(Core/V8 3.0.3)는 네이티브 바이너리가 약 270 MB라서 저장소에 넣지 않습니다. LFS에 두면 클론할 때마다 저장소 주인의 LFS 다운로드량(무료 월 10 GiB)을 그만큼 씁니다. 대신 클론한 뒤 `npm run setup`이 공식 GitHub 릴리스에서 받아 체크섬을 확인하고 `client/Packages/core`와 `Packages/v8`에 풉니다(`tar` 명령을 쓰며, macOS·Linux·Windows 10 이상에 기본으로 있습니다). 같은 버전이 이미 있으면 받지 않으므로 다시 실행해도 됩니다. 두 폴더는 `.gitignore`에 있습니다. PuerTS 버전을 올리려면 `client/TypeScript/tools/install-puerts.mjs`의 `VERSION`과 두 sha256을 함께 바꿉니다.

```sh
npm run setup
```

Unity Hub에서 저장소 루트가 아닌 `idle/client/` 폴더를 프로젝트로 추가합니다. `npm run setup` 전에 열면 PuerTS 패키지를 찾지 못해 컴파일 오류가 납니다.

## 개발 시작

리포지토리 루트에서 실행합니다.

```sh
npm run build:dev
npm run dev
```

`npm run dev`는 TS를 저장할 때마다 타입 검사를 하고, 오류가 없으면 `client/TypeScript/dist/development/`의 `boot.js`와 `main.js`, 소스맵을 다시 번들합니다. `shared/*`의 변경도 감지합니다. 터미널을 켜 둔 상태로 서버(`npm run build -w @idle/server && npm run start -w @idle/server`)를 띄우고, Unity에서 `Assets/Scenes/01_Init.unity` 씬을 열고 Play를 누르세요. 로그인 화면이 뜨고, Console에 `[TypeScript] Development Boot: ...`, `[TypeScript] Starting the game.`, `[TypeScript] Development Game: ...`, `[data] Items: ...`, `[flow] login`이 표시되며 왼쪽 위에 디버그 오버레이의 DEV 버튼이 있습니다(아래 개발과 릴리즈). 치트를 쓰려면 서버를 `SERVER_MODE=development`로 띄웁니다. `01_Init`은 빌드의 첫 씬이고, 그 안의 `TypeScriptHost`가 앱 내내 스크립트 환경을 유지합니다.

코드 진입점은 두 개입니다: 부트 프로그램의 `client/TypeScript/src/boot.ts`(패치 화면, 앱에 듦)와 게임 프로그램의 `src/main.ts`(로그인부터, 패치로 받음). 아래 패치. TS를 변경하고 `development output updated` 로그를 확인한 뒤 Play를 종료하고 다시 실행하면 반영됩니다. 실행 중인 모듈의 자동 재로딩/HMR은 지원하지 않습니다. 타입 오류가 있으면 번들을 갱신하지 않고 마지막 성공 결과를 남깁니다.

개발/릴리즈 모두 esbuild가 두 진입점을 각각 단일 파일로 번들합니다(둘은 코드를 나누지 않음). PuerTS는 패키지 경로를 해석하지 않지만 번들 단계에서 해결되므로 워크스페이스 패키지(`@idle/*`)와 순수 JS npm 라이브러리를 import할 수 있습니다. Node/browser 전용 API는 PuerTS V8에서 자동 제공되지 않습니다. 상대 import에는 `.js` 확장자를 사용합니다. 예: `import { createAppState } from "./application/state/app-state.js"`. TS에서 호출하는 C# API의 타입은 PuerTS가 생성한 `client/TypeScript/types/csharp.d.ts`에 있습니다(아래 C# 쪽 설명).

### 클라이언트 구조

공용과 클라이언트·서버를 나눈 기준을 클라이언트 안에도 적용해, 층을 먼저 나누고 그 안에 컨텍스트를 둡니다. 안쪽 층은 바깥 층을 모르고, Unity와 서버처럼 바깥에 있는 것은 안쪽이 정한 포트(인터페이스)를 구현해 끼웁니다.

```
src/
  domain/                   클라이언트에만 있는 순수 규칙 (게임 규칙 자체는 공용 game-core에 있음)
    progress/prediction.ts  예측: predict, confirm
  application/              유스케이스, 상태, 포트
    ports.ts                GameServer, Clock, DeviceStorage, Display, AppRuntime, BundleStore, Logger와 LogLevel
    scope.ts                수명: 화면·구독·타이머를 묶어 한 번에 해제
    events.ts               이벤트 버스: 보상 연출, 토스트 같은 일회성 알림(상태와 따로)
    state/                  앱 상태(app-state.ts): 슬라이스마다 신호 하나
    app/                    범용 상태 기계(flow.ts)와 앱 흐름(app-flow.ts, Screens 포트)
    account/account.ts      로그인, 로그아웃, 이 기기에 저장된 마지막 ID
    progress/progress.ts    커맨드 대기열과 전송, 서버 확정, cmd.X
    settings/settings.ts    설정: 볼륨·뮤트·초당 프레임·언어를 기기에 저장하고 적용
    update/update.ts        패치(부트 프로그램): 매니페스트 비교, 바뀐 파일만 받기, 검증, 설치, 게임을 시작해도 되는지. 게임 쪽의 업데이트 요청(requestUpdate)
    battle/battle.ts        전투 서비스: 저장된 체크포인트에서 보이는 전투를 프레임마다 서버 시각까지 진행하고, 정산·보스 도전·스테이지 선택 커맨드를 보냄. 보이는 보유량(items, 커맨드가 누른 틱까지 정산해 쓰므로 곧 쓸 수 있는 보유량), 보이는 영웅 레벨(heroLevel, 보이는 전투의 레벨, 없으면 저장된 레벨), 앞질러 간 예측 전투의 곧 올 공격(upcoming)
  adapters/                 application 포트의 구현 중 엔진과 무관한 것
    log.ts                  Logger: 채널마다 줄 앞에 [채널]을 붙이고 레벨보다 가벼운 줄을 버림
    net/game-server.ts      GameServer: WebSocket 연결, 재연결, 재개, Ping, 봉투 해석
    net/server-clock.ts     Clock: 서버 시간 추정
    net/ports.ts            SocketBridge: 엔진에 요구하는 WebSocket
  presentation/             화면. Unity를 모름
    pool.ts                 오브젝트 풀: 엔진과 무관한 Pool<T>, 스코프가 닫히면 모두 없앰
    audio/                  소리: 엔진 포트 AudioBridge(ports.ts), 테이블 키로 BGM·효과음을 내는 Audio(audio.ts)
    ui/                     UI 스택(ui-stack.ts), 리소스 로더(resources.ts), 입력 차단(waiting.ts), 엔진 포트(ports.ts)
    world/                  전투 월드: 엔진 포트 WorldBridge(ports.ts), 프리팹 인스턴스를 스코프에 묶는 World와 월드 뷰의 모양 WorldView(world.ts), 전투 이벤트를 화면 지시(Direction)로 바꾸는 BattleDirector(battle-director.ts)
    text.ts                 화면의 문장: 키와 이름 붙인 인자로 설정의 언어의 문장을 만드는 t, 언어 이름
    format/                 화면 표기: 큰 수(1.2K, 3.4aa), 타이머(04:59, 1일 23:59:59. 날 단위는 언어마다)
    view-models/            화면별 뷰모델: 보여 줄 값(ReadonlySignal)과 동작. 프리팹을 모름. main.ts가 전투 HUD도 계산함, inventory.ts는 가방, equipment.ts는 장비와 장비 뱃지 트리, upgrade.ts는 골드 강화(화면은 아직 없음), rebirth.ts는 환생(화면은 아직 없음), settings.ts는 설정, tabs.ts는 탭 막대, debug.ts는 디버그 오버레이
    widgets/                공용 위젯의 뷰모델과 여는 방법: 확인 팝업과 확인만 있는 알림 팝업(confirm.ts), 보상 팝업, 토스트, 로딩 표시, 재화 바, 알림 뱃지(badge.ts), 처리되지 않은 오류의 재시작 팝업(crash.ts)
    screens.ts              Screens 구현: 앱 흐름의 상태마다 뷰모델(메인은 BattleDirector도)을 만들어 뷰에 연결. 앱 내내 있는 오버레이(showOverlays), 개발 빌드의 디버그 오버레이(showDebugOverlay)
    transition.ts           전환 화면: 상태 사이와 부트의 패치 동안 가리는 로딩 화면과 페이드, 패치의 진행 문구, 씬 정리(놓은 에셋 내리기)
  composition.ts            조립: 게임(Bridge, FileBridge, ClientConfig, App, createApp, startApp)과 부트(BootBridge, BootConfig, runBoot)
  unity/                    Unity에 붙는 층. csharp는 여기서만 import
    bridge.ts               게임 Bridge의 Unity 구현: 파일·재시작은 파사드에 바로, 나머지는 아래 파일에
    device.ts               부트와 게임이 함께 쓰는 기기 저장소(DeviceStorage)와 화면 출력(Display)
    socket.ts               C# WebSocketFacade를 SocketBridge로: 소켓 이벤트를 매 프레임 가져옴
    resources.ts            C# ResourceFacade를 ResourceBridge로: 로드가 끝났는지 매 프레임 확인
    ui.ts                   C# UiFacade를 UiBridge로
    world.ts                C# WorldFacade를 WorldBridge로
    bundle.ts               C# BundleFacade를 BundleStore로: 받기가 끝났는지 매 프레임 확인
    frame.ts                매 프레임 실행 간격(1ms)
    uncaught.ts             처리되지 않은 오류 잡기: 타이머 콜백과 UnityEvent 리스너를 감싸고 Promise 거부를 들음
    binding/                MVVM 바인딩: 바인딩 함수(bind.ts), 뷰의 바인딩 표 view()와 바인더(view.ts), Unity 컴포넌트의 모양(components.ts), ViewRefs 읽기(refs.ts)
    views/                  화면별 뷰: 프리팹 키와 바인딩 표(view()). index.ts가 Views로 모음. battle.ts는 UI가 아니라 전투 월드 뷰, widgets.ts는 공용 위젯, notice.ts는 부트의 알림 팝업, settings.ts는 설정 화면, debug.ts는 디버그 오버레이(펼친 동안 프레임을 셈), transition.ts는 전환 화면
    game.ts                 게임: 오류 잡기를 켜고 앱 설정의 서버로 앱을 만들어 시작함. [config], [data](debug), [flow] 로그를 남김. 모드는 번들의 BUILD_MODE
    boot.ts                 부트: 부트 번들에 든 Strings 표로 패치 화면을 띄우고 앱 설정의 버킷에서 앱의 API 채널(RUNTIME_API)로 패치한 뒤 게임으로 넘어감(RuntimeFacade.StartGame)
  host/                     PuerTS에 없는 표준 전역 보강 (TextEncoder/TextDecoder)
  boot.ts                   부트 번들의 진입점: 폴리필 → unity/boot
  main.ts                   게임 번들의 진입점: 폴리필 → unity/game
```

컨텍스트는 여섯 가지입니다. **account**는 로그인 ID와 로그인·로그아웃, 이 기기에 저장된 마지막 ID입니다. **progress**는 플레이어 저장(`PlayerState` 애그리거트)과 그것을 바꾸는 커맨드, 예측과 서버 확인입니다. **battle**은 저장된 전투 체크포인트에서 시작한 보이는 전투와 그 정산입니다(상태 슬라이스는 없고 저장된 체크포인트는 progress의 `player`에 있습니다). **connection**은 서버와의 연결 상태(`network`)이고 구현은 `adapters/net/`에 있습니다. **update**는 패치(올린 게임 번들 확인, 받기, 검증, 설치)이고 부트 프로그램이 씁니다(상태 슬라이스는 없고 진행은 부트의 신호에 있습니다). **app**은 게임의 흐름(boot → login → main, 서버가 새 클라이언트를 요구하면 update)입니다.

import할 수 있는 것은 층마다 정해져 있습니다.

| 층 | 위치 | import할 수 있는 것 |
| --- | --- | --- |
| domain | `domain/` | `domain/`, 공용 패키지(`@idle/protocol` 제외) |
| application | `application/` | 위 + `application/` |
| adapters | `adapters/` | 위 + `adapters/`, `@idle/protocol` |
| presentation | `presentation/` | `domain/`, `application/`, `presentation/`, 공용 패키지(`@idle/protocol` 제외) |
| 조립 | `composition.ts` | `unity/`와 `host/`를 뺀 전부 |
| unity | `unity/` | `domain/`, `application/`, `adapters/`, `presentation/`, `composition.ts`, `unity/`, `csharp`, `puerts`, 공용 패키지(`@idle/protocol` 제외) |
| host | `host/` | `host/`와 외부 패키지(`fast-text-encoding`)만 |
| 진입점 | `main.ts` | `host/`, `unity/` |

- `adapters/`와 `presentation/`은 서로 import하지 않습니다.
- `unity/`는 가장 바깥 고리라 안쪽 포트를 구현합니다. 예를 들어 `unity/socket.ts`는 `adapters/net/ports.ts`의 `SocketBridge`를 구현합니다.
- `csharp`, `puerts`, `CS`는 `unity/`에서만 씁니다. 외부 npm 패키지는 `host/`에서만 import합니다. 단 신호 라이브러리 `@preact/signals-core`(버전 고정)는 `application/`, `adapters/`, `presentation/`, `composition.ts`, `unity/`에서 쓰고(`domain/`, `host/`, `main.ts`는 쓰지 않음) 그 `effect`는 import하지 않습니다(아래 앱 상태).
- `domain/`, `application/`, `presentation/`은 호스트 API(`console`, `Date.now`, `setTimeout`·`setInterval`·`clearTimeout`·`clearInterval`, `Math.random`)를 쓰지 않습니다. 시각은 `Clock`, 로그는 `Logger`로 받습니다. 지금 이것들을 쓰는 곳은 서버 연결 어댑터와 서버 시계(타이머, `Date.now`, 재연결 지터의 `Math.random`), 조립 지점의 기본 로거(`console`), `unity/`, `main.ts`뿐입니다.
- 전역에 서비스를 두지 않습니다.

`scripts/check-boundaries.mjs`가 이 표와 규칙을 그대로 검사합니다. 그래서 앱 전체가 Unity 없이 Node에서 돌고, 한 프로세스에 클라이언트를 여러 개 띄울 수도 있습니다. 클라이언트를 실제 서버 로직(`@idle/server/testing`)이나 실제 WebSocket 서버(`@idle/server/transport`)에 붙여 보는 테스트는 `integration/`에 있으며, `@idle/client/composition`처럼 소스 경로로 클라이언트 모듈을 가져옵니다.

포트는 그것을 쓰는 층에 둡니다. application이 바깥에 요구하는 `GameServer`, `Clock`, `DeviceStorage`, `Display`, `AppRuntime`, `BundleStore`, `Logger`는 `application/ports.ts`에, 서버 연결 어댑터가 엔진에 요구하는 WebSocket(`SocketBridge`)은 `adapters/net/ports.ts`에, UI 스택이 엔진에 요구하는 `ResourceBridge`와 `UiBridge`는 `presentation/ui/ports.ts`에, 전투 월드가 요구하는 `WorldBridge`(프리팹 인스턴스 만들기·보이기·없애기)는 `presentation/world/ports.ts`에, 오디오가 요구하는 `AudioBridge`는 `presentation/audio/ports.ts`에 있습니다. 앱 흐름이 화면에 요구하는 출력 포트 `Screens`는 `application/app/app-flow.ts`에 있습니다. 엔진이 채울 포트들은 `Bridge`(`composition.ts`: 파일 `FileBridge`, 소켓, 리소스, UI, 전투 월드, 오디오, 기기 저장소, 화면 출력, 재시작, 번들 저장소)로 모이며, `unity/bridge.ts`가 Unity 구현을, 테스트가 TS 구현을 넘깁니다.

**`App`**: `startApp`이 테이블을 읽은 뒤 서비스를 의존 순서대로 만들어(`createApp`) 돌려줍니다. 전역 서비스 로케이터는 없고, 쓰는 곳(뷰모델, 테스트)에 `App`의 일부를 인자로 넘깁니다.

```ts
const app = await startApp(bridge, { server: "ws://localhost:8080", mode: "development" }, views);
app.data.stages.get(3001)                       // 테이블
app.state.player.subscribe(render)               // 신호 읽기·구독: .value, subscribe (쓰기는 슬라이스 소유자만)
app.events.on("offlineReward", show)             // 일회성 알림 듣기: 해제 함수를 돌려줌 (내기는 이벤트마다 정한 곳만)
app.clock.now()                                  // 서버 시간 추정치 (타이머, 규칙의 now)
app.account.login("hero")                        // logout(), lastLoginId()도 있음
app.settings.setVolume("bgm", 0.5)               // 기기 설정: value 신호, previewVolume, setMuted, setFrameRate, setLanguage
app.progress.cmd.StageSelect({ stageId: 3002 })  // 게임 커맨드: 즉시 반영 후 서버 확정
app.battle.advance()                             // 보이는 전투를 서버 시각까지 진행하고 이벤트를 받음 (화면이 프레임마다)
app.battle.upcoming(500)                         // 0.5초 안에 올 공격(공격자, 스킬, 타격까지 ms). 연출이 선딜레이를 먼저 재생
app.ui.show(mainView, vm, scope)                 // 프리팹을 열어 뷰모델에 바인딩, scope가 닫히면 닫힘
app.ui.open("UI/Confirm", scope, { layer: "popup" })
app.ui.block()                                   // 입력 차단, 돌려받은 함수로 해제
app.resources.load("Icons/Gold", scope)          // scope가 닫히면 해제
app.log("battle").debug("reset")                 // 채널의 로거. 릴리즈 빌드는 debug를 버림
app.crash(error)                                 // 처리되지 않은 오류: 로그와 재시작 팝업 (unity/uncaught.ts가 부름)
app.start()                                      // 앱 흐름 시작 (개발 빌드면 디버그 오버레이도)
```

`progress.cmd`는 `Opcode`에서 커맨드 번호만 골라 자동으로 만들어지므로 커맨드를 추가하면 바로 생기고, 필드 타입도 자동완성됩니다. 시스템 API(`AuthLogin` 등)를 부르는 길은 `App`에 없습니다. 서버 연결 어댑터만 부릅니다.

**슬라이스 소유**: 상태는 슬라이스마다 신호(`@preact/signals-core`) 하나이고, 슬라이스마다 쓰는 컨텍스트는 하나입니다. 소유자는 자기 슬라이스의 `Signal`을 받아 `.value`로 자기 값만 바꾸고, 나머지는 슬라이스마다 `ReadonlySignal`인 `AppState`만 받아 읽고 따라갑니다. 쓰기 가능한 신호(`createAppState`)는 `composition.ts`만 만들어 소유자에게 하나씩 나눠 줍니다. TypeScript는 `ReadonlySignal`을 `Signal` 자리에 넘기는 것을 막지 못하므로(구조적 타입) 나눠 주는 곳을 한 곳으로 두었습니다. 두 슬라이스를 `batch`로 묶어 함께 바꾸지 않습니다. 그래서 로그인 성공은 `player`(progress)와 `login`(account) 두 번의 쓰기이고, 앱 흐름은 첫 쓰기에서 main으로 갑니다.

| 슬라이스 | 쓰는 쪽 |
| --- | --- |
| `flow` | 앱 흐름(`application/app/app-flow.ts`) |
| `player` | progress(`application/progress/progress.ts`) |
| `network` | 서버 연결 어댑터(`adapters/net/game-server.ts`) |
| `login` | account(`application/account/account.ts`) |

- `composition.ts`: 서비스를 의존 순서대로 한곳에서 조립하고, 각 서비스에 필요한 것을 인자로 넘깁니다. 쓰기 가능한 신호는 소유자에게만, `App.state`는 읽기 전용(`AppState`)으로 나눠 줍니다.
- `application/app/app-flow.ts`: 게임의 흐름 Boot → Login → Main입니다. 패치는 그 앞의 부트 프로그램이 끝냈습니다. 상태는 `flow` 신호에 있습니다.
  - **상태가 정하는 이동**: 흐름은 앱 상태만 보고 움직이고, 밖에서 `go`를 부르지 않으므로 흐름과 상태가 어긋나지 않습니다. 저장 데이터가 도착하면 Main으로 갑니다. 세션이 끝나면(다른 곳에서 로그인, 만료) 이전 저장 데이터를 지우고(`progress.clear()`) Login으로 돌아가며, 이유는 `network.ended`에 남습니다. 서버가 새 클라이언트를 요구하면(`network.ended === "update"`) Update로 가서 화면을 가린 채 표시(`UPDATE_REQUIRED`)를 남기고 처음(부트)부터 다시 시작해 새 게임 번들을 받습니다(`requestUpdate`, 아래 패치).
  - **정리**: 상태마다 스코프(`Scope`)를 하나씩 받습니다. 그 상태의 화면·구독을 이 스코프에 등록하면, 상태를 떠날 때 다음 상태로 들어가기 전에 모두 해제됩니다. 앱 흐름은 화면이 무엇인지 모르고 출력 포트 `Screens`(상태마다 `(scope) => void`)만 압니다. 구현은 `presentation/screens.ts`의 `createScreens`로, 상태마다 뷰모델을 만들어 뷰에 연결합니다(아래 화면: MVVM). 지금 화면이 있는 상태는 Login과 Main이고 Boot와 Update는 전환 화면이 가립니다. 상태를 떠날 때는 화면을 다 가린 뒤에 떠나고(`cover`), 들어간 상태의 화면이 열리면 놓은 에셋을 내리고 걷습니다(아래 씬 전환).
  - **로그인**: 로그인 중과 실패는 `login` 신호(`pending`, `failed`)에 있고 account만 씁니다. 로그인 뷰모델(`presentation/view-models/login.ts`)은 입력 중인 아이디만 자기 `Signal`(`loginId`)로 두고, 진행·실패·세션이 끝난 이유는 앱 상태에서 읽어 `computed`로 문구를 만듭니다. 아이디는 서버와 같은 규칙(game-core의 `isValidLoginId`)으로 검사해서, 서버가 거절할 아이디는 보내지 않습니다. 로그인에 성공하면 아이디를 기기에 저장하고(`DeviceStorage`, Unity에서는 PlayerPrefs), 다음 시작 때 그 아이디로 저절로 로그인하는 정책은 앱 흐름이 갖습니다. Login에 들어갈 때 `network.ended`가 없고 저장된 아이디가 유효하면 `account.login`을 부릅니다. 세션이 끝나서 돌아온 경우에는 자동 로그인하지 않습니다. 다른 곳에서 로그인해서 끝났을 때 곧바로 다시 로그인하면 계정을 도로 빼앗아 오기 때문입니다. 화면은 그 이유를 보여 줍니다.
  - **로그아웃**: `app.account.logout()`은 저장한 아이디를 지우고, 서버 연결을 정상 종료(`GameServer.close()`, 1000)한 뒤 재시작합니다(`AppRuntime.restart()`). 조립(`composition.ts`)이 계정에 넘기는 `restart`는 전환 화면이 다 가린 뒤에 재시작하므로, 메인이 페이드 아웃하고 새 스크립트 환경은 가린 채 시작해 로그인 화면을 페이드 인합니다. 세션 토큰은 서버 연결 어댑터가 스크립트 환경 안에서만 쥐고 있으므로 재시작과 함께 사라지고, 새 시작은 로그인 화면에서 기다립니다.
  - **순서**: 상태에 들어가는 도중 요청된 이동은 그 상태가 다 준비된 뒤에 처리하고, 허용되지 않은 이동은 오류로 막습니다(`application/app/flow.ts`).
- `application/state/app-state.ts`: 클라이언트 상태는 슬라이스마다 신호 하나입니다(`flow`, `player`, `network`, `login`, `update`). 값은 `scope.add(신호.subscribe(fn))`으로 따라갑니다. `subscribe`는 지금 값으로 한 번 부르고 바뀔 때마다 다시 부르며(같은 값은 알리지 않음), 콜백 안에서 읽은 신호는 따라가지 않습니다. 파생 값은 `computed`이고 그 안에서는 신호에 쓰지 않습니다. `effect`는 쓰지 않습니다. 그 안에서 읽은 값이 모두 의존이 되어 화면을 열거나 상태를 읽을 때 엉뚱하게 다시 돌기 때문이며, 경계 검사가 import를 막습니다. 쓰고 나서 바로 `.value`를 읽으면 새 값이지만, 구독 콜백 안에서 쓴 값의 구독자는 그 콜백이 끝난 뒤에 불리므로 구독자의 순서나 알림 시점에 기대지 않습니다.
- `application/events.ts`: 이벤트 버스입니다. 보상 연출과 토스트처럼 한 번 알리고 끝나는 일을 상태와 따로 둡니다. 신호는 지금 값을 쥐고 새 구독자에게 바로 그 값을 주므로, "마지막으로 받은 보상"을 신호로 두면 화면을 다시 열 때 팝업이 또 뜹니다. 버스는 값을 쥐지 않아 구독한 뒤에 난 것만 받고, 같은 값도 날 때마다 알립니다. `on(type, handler)`이 해제 함수를 돌려주므로 `scope.add(events.on(…))`으로 화면과 함께 놓습니다. 부르기는 동기이고 구독한 순서이며, 구독자가 던진 것은 `[events]` 로그로 남기고 다음 구독자로 넘어가므로 이벤트를 낸 쪽(전투 프레임)이 끊기지 않습니다. 이벤트는 앱의 사실이고 어떤 위젯으로 보일지는 presentation이 정합니다. 이벤트마다 내는 곳은 하나이고(슬라이스와 같은 규칙), composition이 버스를 만들어 내는 쪽에는 `emit`을, 나머지(`App.events`, 화면)에는 `on`만(`AppEvents`) 넘깁니다.

  | 이벤트 | 내는 쪽 | 싣는 것 | 받는 쪽 |
  | --- | --- | --- | --- |
  | `offlineReward` | 전투 서비스 | 서버가 받아들인 오프라인 보상(`OfflineReward`)과 정산 전후 레벨(`level.from`, `level.to`) | 보상 팝업 |
  | `refused` | progress | 게임 규칙(이 클라이언트의 예측이나 서버)이 거절한 커맨드와 `GameError`. 화면에서 그 효과가 빠진 뒤에 납니다. 서버에 닿지 못한 것은 거절이 아니라서 내지 않습니다. | 토스트 |

  전투의 레벨업 글자는 버스로 옮기지 않았습니다. 전투 이벤트(`advance()`)가 이미 프레임마다 가져가는 일회성 흐름이고, 보이는 전투의 시각과 자리(영웅 머리 위)에 묶여 있어서 버스로도 보내면 같은 일이 두 길이 되기 때문입니다.
- `adapters/net/game-server.ts`: `GameServer` 포트의 구현으로, 서버와의 WebSocket 하나입니다. 봉투, 결과 코드(`ResultCode`), 세션 토큰, `AuthResume`, `Ping`은 이 안에서만 다루고, application에는 `LoginOutcome`과 `CommandOutcome`으로 답합니다. 규칙의 거절은 값으로, 전송 실패와 서버 오류는 reject로 돌려줍니다. 응답은 요청 `id`로 짝지어 돌려줍니다. 로그인한 뒤에는 세션을 쥐고 있다가 연결이 끊기면 스스로 다시 연결합니다.
  - **재연결**: 0.5·1·2·4·8초(이후 8초) 간격에 최대 절반까지 무작위로 줄여 다시 연결합니다. 서버가 재시작될 때 클라이언트가 한꺼번에 몰리지 않게 하기 위해서입니다. 연결되면 `AuthResume`으로 세션을 먼저 잇고, 서버가 돌려준 저장 데이터를 `onResumed` 리스너(progress)에 넘겨 다시 맞춥니다.
  - **재전송**: 끊긴 동안의 요청은 기다렸다가, 답을 못 받은 요청은 같은 id로 재개 뒤 순서대로 다시 보냅니다. 서버가 같은 id는 한 번만 처리하므로 커맨드가 두 번 적용되지 않습니다. 로그인·재개·Ping·StateFetch 같은 시스템 API는 그 연결에서만 의미가 있어 다시 보내지 않고, 게임 커맨드(`isCommandOpcode`)만 다시 보냅니다.
  - **끊김 감지**: 소켓이 10초 안에 열리지 않거나 요청에 10초 안에 답이 없으면 소켓이 죽은 것으로 보고 버린 뒤 다시 연결합니다(세션이 없으면 `open()`이 실패합니다). 25초 동안 보낸 것이 없으면 `Ping`을 보내므로, 조용한 연결도 늦어도 35초 안에 끊김을 알아챕니다. 연결된 동안 1초마다 로컬 시각을 보고 스크립트가 5초(`RESUME_GAP`) 넘게 돌지 않았으면(백그라운드, 디버거) 돌아오자마자 `Ping`을 보내므로, 그 사이 죽은 소켓은 10초 안에 알아채고 서버 시계도 다시 맞춥니다.
  - **끝**: 버전 불일치(4000), 다른 곳에서 로그인(4001), 재개 거절(만료·교체), 서버가 받을 수 없는 메시지(1003·1009)는 다시 연결하지 않고 `ended`가 되며 이유(`update`, `replaced`, `expired`, `error`)를 남깁니다. 4001을 받고 스스로 다시 로그인하면 상대 기기를 밀어내게 되므로 플레이어의 로그인을 기다립니다.
  - **상태**: `network` 슬라이스에 연결 상태와 `waiting`(요청이 0.5초 넘게 답이 없거나 재연결 중)을 둡니다. 0.5초보다 빠른 요청은 표시가 깜빡이지 않게 넘깁니다. 이 슬라이스는 이 어댑터만 씁니다.
- `application/progress/progress.ts`: 커맨드를 game-core 규칙으로 즉시 적용한 뒤 `GameServer`로 보내고, 서버의 답으로 확정합니다. 규칙에는 서버 시간 추정치(`Clock`)를 `now`로 넘깁니다. 커맨드는 보낸 순서대로 나가고 서버도 그 순서로 답하므로, 화면은 항상 "서버가 마지막으로 확정한 저장 데이터 + 아직 답이 없는 커맨드를 보낸 순서대로 적용한 결과"입니다. 이 계산(`predict`, `confirm`)은 `domain/progress/prediction.ts`의 순수 함수이고, progress에는 대기열과 전송, `player` 슬라이스 반영이 남습니다.
  - 답이 오면 확정 데이터에 그 커맨드를 보낸 시각으로 적용한 결과의 지문(`playerFingerprint`)을 답의 지문과 견주어, 같으면 그 결과를 확정하고 커맨드를 큐에서 뺍니다(위 커맨드의 확정). 앞에 기다리는 커맨드가 없을 때 보낸 것은 보낼 때의 예측이 곧 그 결과라 다시 계산하지 않습니다. 답이 바뀐 슬라이스를 실었으면(서버가 시각을 자름) 그것을 반영합니다. 지문이 다르면 경고 로그를 남기고 `StateFetch`로 서버의 저장 데이터를 받아 와 확정하며, 받아 오는 동안 그 커맨드와 뒤에 온 답은 큐에 남아 화면에서 효과가 빠지지 않습니다. 받아 온 저장 데이터에 아직 없는 답(revision이 더 큼)은 그 위에서 다시 견줍니다. 거절되면 그 커맨드만 빠지므로 효과가 되돌려지고 뒤의 커맨드는 확정 데이터 위에 다시 적용됩니다.
  - 확정된 revision 이하의 답은 무시합니다. 재개 뒤 다시 보낸 커맨드에 서버가 예전 답을 돌려줄 때, 재개로 받은 최신 상태가 그 예전 답으로 덮이지 않게 하기 위해서입니다. 재개 전에 보낸 커맨드는 서버가 이미 적용했을 수 있으므로 답이 올 때까지 화면에 다시 적용하지 않습니다.
  - 답을 기다리는 커맨드는 최대 `MAX_UNANSWERED_COMMANDS`(100, protocol)개이고, 조립 지점이 이 숫자를 progress에 넘깁니다. 서버가 계정마다 이만큼만 답을 기억하므로, 넘으면 다시 보낸 커맨드가 두 번 실행될 수 있기 때문입니다.
- `adapters/net/server-clock.ts`: `Clock`의 구현입니다. 기기 시계가 틀려도 타이머와 규칙은 서버 시간을 따릅니다. application은 `Clock { now() }`만 받고, 요청이 나간 시각을 재는 `local()`과 응답을 받는 `observe`는 서버 연결 어댑터가 쓰는 `ServerClock`에만 있습니다.
  - **지연 보정**: 서버는 요청이 나간 로컬 시각 t0와 답이 온 t1 사이에 응답의 `serverTime`(S)을 찍으므로, 서버 시계 − 로컬 시계는 반드시 [S − t1, S − t0] 안에 있습니다. 시계는 답마다 이 구간을 지금까지의 구간과 겹쳐 좁히고, 추정치는 구간의 가운데라 오차가 구간 폭(왕복 시간)의 절반을 넘지 않습니다. 겹치지 않으면 어느 쪽 시계가 바뀐 것이므로(기기 시계를 고침, 서버 시계 보정) 새 구간에서 다시 시작합니다. 표본은 이미 오가는 모든 응답(커맨드, 60초 정산, 25초 `Ping`, `AuthResume`)이라 동기화용 요청이 따로 없습니다.
  - **정확도**: 마지막 응답의 시각을 그대로 쓰던 이전 방식은 늘 편도 지연 + 서버 처리 + 최대 1프레임(Unity가 소켓 이벤트를 프레임마다 넘김)만큼 늦었습니다(왕복 60ms, 60fps면 30–47ms). 구간이 좁혀지면 추정치가 수 ms 뒤로 갈 수 있는데, 보이는 전투는 지난 틱으로 되돌리지 않으므로 그 사이 멈출 뿐입니다.
  - **비용**: 늘어나는 요청은 백그라운드에서 돌아올 때의 `Ping` 하나입니다. 서버의 rpc가 `Ping` 하나를 처리하는 데 1.56µs(M4 Max, Node 22.14, ws와 커널 제외), 본문은 요청 18B·응답 43B입니다. 동접 1만 명이 10분마다 돌아온다면 초당 17건으로 코어 하나의 0.003%, 약 3KB/s입니다(유휴 `Ping`은 이미 초당 400건). 돌아올 때 `Ping` 여러 발을 묶어 보내는 방식(NTP)은 비용이 그 배수인데 평소 응답이 같은 일을 하고, 서버의 수신·송신 시각을 따로 싣는 전용 opcode는 프로토콜을 바꾸면서 얻는 것이 서버 처리 시간(`Ping`은 µs)뿐이라 두지 않았습니다.
- `application/settings/settings.ts`: 이 기기의 설정(채널 `bgm`·`sfx`마다 볼륨 0–1과 뮤트, 초당 프레임 30·60, 화면의 언어)입니다. `DeviceStorage`의 키 `settings` 하나에 JSON(`{"volume":{"bgm":0.7,"sfx":1},"muted":{"bgm":false,"sfx":false},"frameRate":60,"language":"ko"}`)으로 두므로 한 번에 쓰이고, 바꾸면 바로 저장합니다. 볼륨만은 `previewVolume`이 값을 바꾸되 저장하지 않으므로(슬라이더를 끄는 동안), 저장은 놓을 때의 `setVolume`이나 다음 변경이 함께 합니다. Unity의 `StorageFacade.Set`은 쓸 때마다 `PlayerPrefs.Save`(디스크 쓰기)를 하므로, 끄는 동안 값마다(프레임마다) 저장하지 않으려는 것입니다. 읽을 때는 필드마다 검사해서 틀리거나 없는 필드만 기본값으로 두므로, 필드를 더해도 버전이나 마이그레이션이 필요 없습니다. 서비스가 자기 신호(`settings.value`)의 유일한 쓰기 주체이고, 초당 프레임은 시작할 때와 바뀔 때 `Display`(Unity는 `Application.targetFrameRate`)로 적용합니다. 두 품질 레벨(Mobile, PC)은 이 게임에서 거의 같아서 건드리지 않습니다. 채널은 Enums 테이블의 `SoundChannel`(생성된 TS enum)이라 Sounds 테이블의 `channel`과 한 정의입니다. 설정 화면은 아래 화면 목록에 있습니다.

### 화면: MVVM

| 층 | 위치 | 하는 일 |
| --- | --- | --- |
| Model | `application/state`, `application/progress` | 앱 상태(슬라이스마다 신호)와, 커맨드로 상태를 바꾸는 진행 |
| ViewModel | `presentation/view-models/` | 화면에 보일 값(`ReadonlySignal`, 입력처럼 양방향이면 `Signal`, 파생은 `computed`)과 동작. 의존은 인자로 받아 Node에서 테스트 |
| View | `unity/views/` + 프리팹의 `ViewRefs` | 바인딩 표 하나(`view(prefab, { 항목: 바인더 }, 레이어)`)로 뷰모델 값과 컴포넌트를 잇는 얇은 연결. 뷰모델만 받음 |
| Binder | `unity/binding/` | 바인더(`text`, `label`, `button`, `input`, `toggle`, `slider`, `active`, `list`, `tabBar`, `bigNumber`, `fill`, `fade`, `toast`, `spotlight`, `nested`)와 바인딩 함수. 값이 바뀔 때만 C#을 부르고, 등록한 것을 `Scope`에 모아 화면을 닫을 때 한 번에 해제 |

화면 하나는 뷰 정의(`View`: 프리팹 키와 `bind`)로 적고, UI 화면은 `unity/binding/view.ts`의 `view()` 표가 이를 만듭니다. 앱 흐름은 상태에 들어갈 때 `Screens` 포트를 부르고, `presentation/screens.ts`의 `createScreens`가 그 상태의 뷰모델을 만들어 `ui.show(views.login, vm, scope)`처럼 엽니다. 뷰 정의는 `unity/views/index.ts`가 `Views`로 모아 `startApp`에 넘깁니다. 뷰는 뷰모델만 받고 앱 상태나 서비스를 직접 건드리지 않습니다. 로그인 중·실패처럼 화면이 보여 줄 상태는 앱 상태(`login` 신호)에 있고 뷰모델이 읽어서 문구로 만듭니다. UI 스택은 프리팹을 불러와 레이어에 올리고, 뷰의 스코프에서 `bind`를 부릅니다. `bind`는 프리팹 인스턴스를 불투명한 `ViewRoot`로 받으므로 presentation은 Unity 타입을 모르고, 뷰만 `unity/binding/refs.ts`의 `viewRefs(root)`로 그 `ViewRefs`를 읽습니다. 상태를 떠나면 그 스코프가 닫히면서 바인딩(신호 구독, C# 이벤트 리스너), 인스턴스, 프리팹이 이 순서로 해제됩니다. 프리팹과 뷰가 어긋나 `bind`가 실패하면 연 화면을 다시 닫고 오류를 냅니다(`[ui] <prefab> did not open:` 로그). 레이어는 여는 곳이 아니라 뷰 정의가 정합니다(가방은 `view("UI/InventoryScreen", 표, "popup")`). 프리팹이 그 레이어에 맞게 만들어지기 때문입니다. 팝업은 `popup(show, view, owner, done => 뷰모델)`이 열고, 뷰모델이 `done(결과)`를 부르면 닫히며 그 결과로 이행합니다. 닫기 버튼(`done()`), 뒤로 가기, owner가 닫히는 것, 열리지 않는 것은 `undefined`입니다. 확인 팝업(`Promise<boolean>`)도 이것으로 엽니다.

- **리소스 로더**(`presentation/ui/resources.ts`): 키로 에셋을 불러 스코프에 묶고, 스코프가 닫히면 해제합니다. 불러오는 사이 스코프가 닫히면 받자마자 해제하고 `undefined`를 돌려줍니다. 키는 경로 모양(`UI/MainScreen`)이고, C# `ResourceFacade`가 불러온 에셋 카탈로그에 그 키가 있으면 패치로 받은 Addressables 원격 그룹(`Assets/Remote/` 아래 경로가 주소)에서, 없으면 앱에 든 Resources(`Assets/Resources/` 아래 경로)에서 불러오므로 TS는 어디에 있는지 모릅니다(아래 패치). Addressables의 에셋은 해제하면 바로 내려갑니다. Resources는 프리팹 하나만 내릴 수 없어서, 해제는 참조를 놓는 것이고 메모리는 앱 흐름의 상태가 바뀔 때 전환 화면이 가린 동안 부르는 `unloadUnused()`(C# `Resources.UnloadUnusedAssets`)에 돌아옵니다. 씬을 하나만 쓰므로 씬 로드가 대신 불러 주지 않습니다.
- **UI 스택**(`presentation/ui/ui-stack.ts`): 화면(screen), 팝업(popup), 안내(guide), 오버레이(overlay), 디버그(debug) 레이어가 이 순서로 쌓이고, 새 뷰는 자기 레이어의 맨 위에 올라갑니다. 튜토리얼은 안내 레이어라서 전환 화면, 토스트, 로딩 표시(오버레이)가 튜토리얼 막 위에 보입니다. 디버그 레이어는 C# `UiRoot`가 차단막 위에 두어서 디버그 오버레이가 언제나 맨 위에 보이고, 튜토리얼 막이나 전환 화면이 막는 동안에도 눌립니다(펼친 패널은 재시작 팝업도 가립니다). 뒤로 가기(Android back, Esc)는 맨 위 팝업에, 팝업이 없으면 맨 위 화면에 갑니다. 팝업은 기본으로 닫히고, 화면은 처리 함수를 준 경우에만 반응하며, 오버레이는 받지 않습니다. 받을 뷰가 있을 때만 C#에 매 프레임 키를 묻습니다. `shown`은 화면에 있는 뷰(프리팹, 레이어, 인스턴스)를 연 순서로 내놓고, 튜토리얼이 비출 대상과 맨 위 팝업을 여기서 봅니다. 뷰를 불러오는 동안과 `block()`을 쥔 동안에는 탭과 뒤로 가기를 막고, `blockBack()`을 쥔 동안에는 뒤로 가기만 막습니다. 튜토리얼이 보이는 동안 `blockBack()`을 쥐어서, 비춘 팝업을 Esc로 닫아 스텝을 건너뛸 수 없습니다(설정처럼 대상이 아닌 팝업을 열면 튜토리얼이 숨으므로 그때는 뒤로 가기로 닫힙니다). 팝업은 열고 닫을 때 바탕이 나타나고 패널이 조금 작은 크기에서 커지며(C# `PopupMotion`, 0.15초. 팝업 틀 부품에 있어 팝업마다 붙음), 닫을 때는 스택에서 바로 빠지되 거꾸로 돌아가는 0.12초 동안 입력을 막고 연출이 끝난 뒤에 인스턴스를 없애고 프리팹을 해제합니다(`UiInstance.dismiss`). 화면과 오버레이는 연출이 없어 바로 없앱니다. 요청이 오래 걸리거나 다시 연결하는 동안(`network.waiting`)에도 막아(`presentation/ui/waiting.ts`), 응답하지 않는 서버에 커맨드가 쌓이지 않게 합니다.
- **UI 빌더**(`idle/client/Assets/Editor/UI/`): 프리팹을 모두 코드로 만들고, 다시 빌드해도 fileID가 그대로라 내용이 바뀐 프리팹만 diff에 나옵니다. 세 층입니다. 테마 에셋(`UiTheme.asset`)이 색, 글꼴 크기(여덟 단계: Display 96, Large 76, Title 56, Body 44, Label 38, Small 32, Caption 28, Tiny 22. 빌더는 이 중에서 고르고, 자동 크기 조절의 하한은 Tiny), 간격, 9-slice 스프라이트를 쥐고, 공용 부품(`Assets/UI/Parts/`: 버튼 다섯 종류, 뱃지, 탭 막대, 팝업 틀, 게이지, 토글, 슬라이더, 입력란)이 테마로 만들어져 화면에 중첩 프리팹으로 들어가며, 팝업과 아래 판은 위에서부터 쌓는 명세(`UiSpec.Popup("SettingsScreen", 960f, 1260f)…`, 메인 화면 아래 탭 위의 판은 `UiSpec.Sheet("EquipmentScreen", ScreenPrefabs.SheetHeight("equipment")).Header().Row(…).Tabs("tabs").Grid(…).Save()`)로 적습니다. 아래 판은 화면을 덮는 바탕이 없어 전투와 메인 화면을 가리지 않습니다. 판 자체도 테두리 카드 없이 아래 탭과 영웅 띠 사이를 틈 없이 채우는 크림색 면 하나(`UiParts.AddSheet`, 테마 `Sheet` 색, 양옆은 세이프 에어리어 밖까지)이고, 위아래 경계는 영웅 띠와 아래 탭 막대의 외곽선이 맡습니다. 어두운 아래 영역 위에 크림색 카드를 한 겹 더 두면 두 번 감싼 것처럼 보여서입니다. 머리의 제목은 버튼처럼 보이지 않게 바탕 없는 글자와 구분선입니다. 닫기 버튼(글자 없이 빨간 동그라미 안의 X 아이콘 `ui_close`)은 팝업에만 있고, 아래 판은 같은 탭이나 뒤로 가기로 닫으므로 없습니다(`UiSpec.Header`가 판의 종류로 정함). 누르는 것(버튼, 장비 칸, 스킬 슬롯, 장착 현황 칸)은 볼록한 그림, 보기만 하는 칸(강화·스킬 줄의 아이콘, 영웅 띠의 스킬, 가방)은 위쪽 안에 그림자가 진 오목한 그림(`slot.png`)이라 둘이 구별됩니다. 고르는 탭(장비 슬롯, 가방 종류, 강화 배수, 설정)은 버튼처럼 떠 있지 않게, 어두운 홈 안에서 고른 칸만 주황의 납작한 칸(`chip.png`)으로 채우는 세그먼트입니다(공용 부품 `TabBar`). 그래서 테마나 부품 하나를 고치면 모든 화면이 바뀌고, 그림을 넣을 때(백로그 55)는 테마의 스프라이트만 바꿉니다. UI 그림은 `Assets/UI/Sprites/`에 두고, 그 폴더를 SpriteAtlas(`Assets/UI/Ui.spriteatlasv2`, Sprite Atlas V2)가 통째로 묶습니다. 앱에 드는 패치 화면이 쓰는 버튼·패널·게이지만 `Assets/UI/BootSprites/`와 그 아틀라스(`Boot.spriteatlasv2`)에 따로 두어, 앱에는 작은 아틀라스만 듭니다(아래 패치). 9-slice와 `Image` 메시가 사각형을 가정하므로 회전과 타이트 패킹은 껐습니다. 테마 그림 13장(버튼, 크림색 판, 누르는 칸, 보기만 하는 칸, 세그먼트 칸, 빛살, 판 안의 줄, HUD·탭 막대·영웅 띠의 띠, 어두운 알약, 입력란의 9-slice와 게이지, 동그라미, 체크)은 짙은 외곽선과 두 단 면의 그림체로 스크립트(`idle/art/source/ui-kit/draw.py`)가 그립니다. 회색조 그림에는 테마 색이 곱해지고, 크림색 판·줄·알약은 색을 넣어 그려 흰색을 곱합니다(출처는 [docs/art.md](docs/art.md)). 글자는 OFL 글꼴 Jua의 TMP 동적 에셋이고(`Tools/UI/Build Font`, `UiFont.cs`), 기본 재질은 짙은 외곽선과 아래 그림자, 크림색 판 위의 글자는 외곽선 없는 잉크 재질(`TextStyle.Ink…`)입니다. 동적 아틀라스는 플레이 모드가 끝나면 비워(`DynamicFontReset`) 커밋한 에셋이 바뀌지 않습니다. 장비 등급과 스킬 속성의 색표는 빌더가 테마에서 C# `TintView`에 넣고, TS는 번호만 보냅니다(`tint` 바인더). 아이콘은 `Assets/UI/Sprites/Icons/`에 두면 `Tools/UI/Build All Prefabs`가 먼저 임포트 설정(128픽셀로 줄임)을 맞추고 묶음(`Assets/UI/Icons.asset`, C# `IconSet`)을 다시 채웁니다. 아래 탭의 아이콘은 빌더가 넣고, 아이템의 아이콘은 `Items.icon`, 스킬은 `Skills.icon`, 강화 줄은 능력치 키(`stat_attack`)의 이름을 `icon` 바인더가 C# `IconView.Show`로 넘깁니다(없는 이름이면 칸이 숨고, 테이블의 이름마다 그림이 있는지는 클라이언트의 `icons.test.ts`가 봅니다). 지금 아이콘 28장은 같은 그림체의 SVG(`idle/art/source/ui-kit/icons.svg`, `render.html`로 굽기)이고 Codex 그림으로 바꿀 임시입니다. 그림을 처음 넣었을 때(2026-10-23) 메인 화면의 SetPass는 21.6에서 19.8(아이콘을 더한 뒤 19.5)로 줄었습니다. 드로우콜은 26.7에서 26.1·27.4(아이콘 뒤 26.9)로, 전투 장면에 따라 흔들리는 범위(22–37) 안입니다(에디터의 `UnityStats`, 같은 계정·스테이지, 35–42초). 명세가 ViewRefs 항목 이름(`titleLabel`, `closeButton`, `okButton`)을 정하므로 TS 뷰는 빌더를 몰라도 됩니다. 프리팹은 패치로 받는 `Assets/Remote/UI/`에 저장하고, 부트의 패치 화면이 쓰는 둘(`TransitionScreen`, `NoticePopup`)만 `Save(inApp: true)`로 앱에 드는 `Assets/Resources/UI/`에 저장합니다. `Tools/UI/Build All Prefabs`가 글꼴과 아이콘, 부품부터 차례로 모두 만듭니다.
- **화면**: 로그인(`UI/LoginScreen`), 메인(`UI/MainScreen`), 메인의 아래 탭이 여는 판 다섯(강화 `UI/UpgradeScreen`, 스킬 `UI/SkillScreen`, 장비 `UI/EquipmentScreen`, 가방 `UI/InventoryScreen`, 환생 `UI/RebirthScreen`), 설정(`UI/SettingsScreen`, 팝업)이 있습니다. 메인은 슬레이어 키우기식으로 전투를 늘 보이며 키우는 배치입니다(1080×1920 기준, 위에서부터).
  - **HUD**(위 150): 레벨 별(`levelText`, 보이는 전투의 레벨), 아이디(`nameText`), 경험치 막대와 비율(`expBar`, `expText`, 최대 레벨이면 `MAX`), 재화 바, 설정 버튼.
  - **스테이지 막대**: 스테이지 이름 알약(`stageText`)과 양옆 화살표(`prevStageButton`, `nextStageButton`: 해금된 스테이지를 ID 순서로 앞뒤로 돌고, 옮길 곳이 없으면 숨음, 아래 해금), 알약 아래 가운데의 웨이브 진행 막대(`stageProgress`, 안에 `wavesText` `2/3`, 보스 중에는 꽉 차고 `보스`)와 그 오른쪽 끝에 붙은 보스 해골 버튼(`bossButton`. 그림 왼쪽의 투명한 여백만큼 당겨 해골 그림이 막대 끝에 닿고, 해골 칸이 다음 화살표에 닿지 않게 막대 폭은 300), 보스 남은 시간(`bossTimeText`). 해골은 늘 보이고 도전할 수 있을 때만 눌리며(아래 전투), 그동안 뒤에서 노란 빛살(`bossGlow`, `Spinner`가 초당 60도로 돌림)이 돌아 누를 때를 알립니다. 누르면 `BossChallenge`를 보냅니다.
  - **전투**: 그 아래로 비치는 월드. 배우는 전투 띠(`BattleFrame`: 스테이지 막대의 아래 가장자리 `StageBarArea`와 영웅 띠의 위 가장자리 사이)의 가운데에 섭니다. 월드 카메라의 받침(`CameraFraming`)이 프레임마다 그 띠의 가운데를 화면 픽셀로 재어, 배우 무리의 가운데(월드 y 0.45)가 거기 오게 받침의 y를 옮깁니다. 해상도, 세이프 에어리어, 판을 따라 옮겨 가는 영웅 띠가 모두 잰 값에 들어 있어 따로 맞추지 않습니다. 기준 화면에서 작은 판일 때 카메라 y는 -1.01(예전 고정값 -1.1)이고, 큰 판을 열면 띠가 420 올라간 만큼의 절반(1.09유닛) 내려가 배우가 띠를 따라 올라갑니다. 메인 화면이 없으면 배우를 화면 가운데에 둡니다. 흔들림(`HitFeel`)은 받침 안에서 카메라를 옮기므로 이것과 부딪치지 않습니다.
  - **영웅 띠**(나무색, 열린 판 바로 위): HP 막대와 수치(`hpBar`, `hpText` `1.02K / 1.38K`), 공격(`attackText`)과 치명(`critText`, 걸린 효과 포함), 장착 스킬 칸(`skills`, `SkillBarSlot`: 속성 색 칸의 아이콘과 위에서 시계 방향으로 덮이는 재사용 대기, 남은 초). 모두 `BattleSnapshot.hero`에서 읽고, 스킬 칸은 장착이 바뀔 때만 새로 만들며 재사용 대기는 칸의 신호가 따라갑니다. 띠와 그 아래로 화면 밖까지 깔린 어두운 바탕은 한 묶음(`heroStrip`)이고, 열린 판(탭을 모두 끄면 장착 현황 판)의 바로 위로 옮겨 갑니다. TS는 열린 탭의 이름(꺼지면 빈 이름)만 `dock` 바인더로 C# `DockView.Show`에 넘기고, 탭마다의 높이는 빌더가 판 높이(`ScreenPrefabs.SheetHeight`)로 넣습니다. 그래서 큰 판을 여는 동안 전투는 스테이지 막대와 띠 사이로 좁아지고, 카메라가 따라 올라가 배우를 그 사이에 세웁니다(위 전투).
  - **아래 탭**(아래 180): 성장·스킬·장비·가방·환생. 누르면 그 화면이 아래 탭 위의 판으로 열리고(고른 탭에 노란 판 `…Selected`), 다른 탭을 누르면 바뀌며, 같은 탭이나 뒤로 가기가 판을 닫습니다(판에는 닫기 버튼이 없음. `MainViewModel.tab`, `toggle`, `closeTab`. `createScreens`의 `openSheets`가 탭마다 판의 뷰모델을 만들고 앞 판을 닫음). 처음에는 탭이 모두 꺼져 있습니다. 탭을 바꾸면 고른 탭의 노란 판은 바로 옮겨 가지만, 앞 판은 새 판이 다 열린 뒤에 닫히고 그때 보이는 판(`MainViewModel.sheet`, `sheetShown`)이 바뀝니다. 영웅 띠와 장착 현황 판이 보이는 판을 따르므로, 새 판을 불러오는 몇 프레임 동안 아래 영역이 비어 어두운 바탕이 비치거나 띠가 먼저 튀지 않습니다(깜빡임). 불러오는 사이 탭이 또 바뀌면 그 판은 열지 않고, 탭을 끄면 판을 바로 닫습니다.
  - **장착 현황 판**(`homePanel`): 탭이 모두 꺼졌을 때 작은 판 자리에 보입니다. 슬레이어 키우기가 메뉴를 닫으면 전투 아래에 장착 스킬 덱을 보이는 것을 따라, 지금 입은 장비 세 칸(`loadoutEquipment`: 무기·방어구·장신구, 등급 색, 강화 단계, 이름, 빈 슬롯은 "비어 있음")과 장착 스킬 칸(`loadoutSkills`: 슬롯 순서, 속성 색, `Lv.3`, 이름)을 보이고, 칸을 누르면 그 메뉴(장비, 스킬)가 열립니다(`MainViewModel.loadout`). 장착 현황 판도 아래 판과 같은 크림색 면입니다. 영웅 띠 아래에는 화면 밖까지 어두운 바탕이 깔려 있어, 판을 바꾸는 사이(새 판을 불러오는 동안)에도 전투가 비치지 않습니다. 고른 탭의 노란 판은 아래 탭 막대 안에 들어가, 바로 위에서 시작하는 판에 가리지 않습니다. 성장은 작은 판(580), 나머지는 큰 판(1000)이고, 어느 판이든 영웅 띠가 그 위에 보여 강화하거나 장비를 입는 동안 띠의 수치가 바로 오르는 것이 보입니다. 장비 탭에는 더 좋은 장비의 뱃지가 있습니다.
  메인과 로그인 프리팹은 `Tools/UI/Build Screen Prefabs`(`Assets/Editor/UI/ScreenPrefabs.cs`)가 만듭니다(아래 UI 빌더). 튜토리얼의 대사 창과 로딩 표시는 HUD 아래에 뜨고, 대사 창은 설정 버튼의 너비만큼 오른쪽을 비웁니다(`ScreenPrefabs.SettingsButtonReach`). 다른 비율과 노치는 아래 세이프 에어리어가 맞춥니다.
- **설정 화면**(`UI/SettingsScreen`, 뷰모델 `presentation/view-models/settings.ts`, 뷰 `unity/views/settings.ts`): 메인의 설정 버튼이 메인과 함께 닫히는 팝업으로 엽니다. 맨 아래의 로그아웃 버튼은 확인 팝업으로 물은 뒤 로그아웃하고, 로그아웃하면 메인과 함께 설정도 닫힙니다. 채널(Enums의 `SoundChannel`)마다 한 줄(`UI/SettingsChannel`: 이름, 볼륨 슬라이더, 음소거 토글)을 `ViewList`로 복제하고, 아래에 초당 프레임 탭(30 FPS, 60 FPS)과 언어 탭(한국어, English. 아래 문장과 언어)이 있습니다. 슬라이더를 끄는 동안은 `previewVolume`으로 바로 들리고(BGM은 오디오가 설정 신호를 따라 `SetBgmVolume`), 놓을 때 `setVolume`으로 저장합니다. 놓는 때는 C# `ReleaseSlider`(`Slider`를 이어 `OnPointerUp`에 `Released`를 냄)가 알리고, 키보드·게임패드로는 움직이지 않게 해서(`Navigation.Mode.None`) 놓지 않고 바뀌는 길이 없습니다. 토글과 탭은 누를 때 바로 저장합니다. 고른 탭은 설정 서비스가 쥐므로 탭 막대의 `selected`가 설정의 `frameRate`입니다(아래 목록과 탭). 프리팹은 `Tools/UI/Build Settings Prefabs`(`Assets/Editor/UI/SettingsPrefabs.cs`)가 만듭니다. 튜토리얼 중에는 막이 있는 스텝이면 눌리지 않고, 조건을 기다리는 스텝에서 열면 설정이 맨 위 팝업이라 튜토리얼이 숨습니다.
- **세이프 에어리어와 해상도**: UI 레이어 셋(화면, 팝업, 오버레이)은 `UiRoot`가 한 곳에서 `Screen.safeArea`(노치, 홈 인디케이터를 뺀 곳)에 맞춥니다. 캔버스 배율은 세이프 에어리어가 기준 해상도 1080×1920을 가로세로 모두 담는 가장 큰 값(`min(안전 너비/1080, 안전 높이/1920)`, `CanvasScaler`의 Constant Pixel Size)이라, 어느 기기에서나 뷰는 1080×1920 이상의 영역에 놓이고 남는 쪽(더 길쭉하면 위아래, 더 넓으면 양옆)만 늘어납니다. 이전 설정(Scale With Screen Size, match 0.5)은 19.5:9 아이폰(1170×2532)에서 캔버스 너비가 979, 20:9 안드로이드에서 966이 되어 1080 너비로 짠 위쪽 막대의 제목과 재화 바가 겹쳤습니다. Expand는 화면 전체로는 1080×1920을 지키지만, 홈 인디케이터가 있는 4:3 iPad는 안전 높이가 1,887이라 33이 모자랍니다. 화면이 회전하거나 창 크기가 바뀌면 `ScreenWatcher`(Facades의 internal 컴포넌트, 프레임마다 화면 크기와 세이프 에어리어를 비교만 함)가 다시 맞춥니다. 월드 카메라는 전투 띠도 따라야 해서 `CameraFraming`이 프레임마다 맞춥니다. 값을 쓸 수 없는 프레임(크기 0이나 NaN. 에디터에서 창을 숨기거나 옮길 때)은 `SafeAreaFit.TryFit`이 거절해 지난 배치를 두고, 값이 돌아오면 다시 맞춥니다. 그런 값이 레이어 앵커에 한 번 들어가면 그 아래 RectTransform이 모두 NaN으로 저장되어 값이 돌아와도 UI가 통째로 사라진 채 남으므로, 레이어 위치가 NaN이면 오류를 남기고 스크립트 환경을 다시 시작해 UI를 새로 만듭니다. 화면 끝까지 깔려야 하는 바탕(팝업 뒤의 어두운 바탕, 전환 화면, 로그인 화면, 메인의 HUD 위와 아래 탭·영웅 띠의 양옆, 튜토리얼의 막과 누름 버튼)은 빌더가 세이프 에어리어 밖으로 600만큼 늘입니다(`UiPrefabs.Bleed`. 사방으로 같은 만큼 늘이므로 가운데의 패널은 세이프 에어리어의 가운데에 남음). 전투 월드의 카메라(`WorldRoot`가 만들고 `CameraFraming`이 맞춤)는 화면 전체에 그리고, 1080×1920 화면에서 보이는 영역(세로 반폭 5, 가로 반폭 2.81)을 어느 비율에서나 다 보이게 직교 크기를 `5 × max(1, (1080/1920) / 화면 비율)`로 둡니다. 19.5:9 화면은 크기 6.09로 위아래를 더 보이고, 고정 크기 5였다면 가로 반폭이 2.31이라 x=±2에 선 배우(폭 1)가 잘렸습니다. 세로 게임이라 Player 설정의 가로 자동 회전은 껐습니다(세로와 뒤집은 세로만).
- **전투 월드**: 메인 화면이 열려 있는 동안 화면 뒤에 프레임 애니메이션 배우(그림이 생기기 전에는 코드로 그린 임시 클립)의 2D 전투가 보입니다. UI 스택이 아니라 `presentation/world/`의 `World`가 프리팹을 월드에 올리고(키마다 한 번 불러와 스코프에 묶음), 뷰(`unity/views/battle.ts`)가 `ViewRefs`로 `ActorView`와 `FloatingText`를 읽어 씁니다. `createScreens`가 메인 상태에서 메인 뷰모델(HUD, 보스 도전)과 `BattleDirector`(화면 지시)를 따로 만들어 각각 메인 화면과 월드 뷰에 넘깁니다. 둘 다 전투 서비스를 보지만 HUD는 `snapshot` 신호를, 화면 지시는 `advance()`의 이벤트와 `upcoming()`의 예측한 공격을 봅니다.
- **공용 위젯**(`presentation/widgets/`, 뷰는 `unity/views/widgets.ts`): 화면마다 다시 만들지 않는 UI입니다. 프리팹은 `Tools/UI/Build Widget Prefabs`(`Assets/Editor/UI/WidgetPrefabs.cs`)가 코드로 만듭니다(아래 씬 전환의 전환 화면 `UI/TransitionScreen`도). 메인 화면은 재화 바를 중첩 프리팹으로 넣습니다. 보상 팝업은 스크롤 목록을 쓰지 않고 줄마다 글자로 보입니다. 받는 아이템이 몇 가지뿐이기 때문입니다.

  | 위젯 | 프리팹 | 레이어 | 여는 곳 |
  | --- | --- | --- | --- |
  | 확인 팝업 | `UI/ConfirmPopup`(앱에 듦) | popup(부트는 overlay) | 부트가 새 앱의 설치 페이지를 열지 묻는 데도 써서 앱에 듭니다. `confirm(show, view, owner, message)`가 `popup`으로 열고 답(`Promise<boolean>`)으로 이행합니다. 취소, 뒤로 가기, 답하기 전에 owner가 닫히거나 열리지 않으면 false입니다. 지금은 설정 화면의 로그아웃, 환생, 처리되지 않은 오류의 재시작이 묻습니다. |
  | 알림 팝업 | `UI/NoticePopup`(앱에 듦) | overlay | `notice(show, view, owner, message)`가 확인 버튼 하나(가운데)로 열고, 확인하거나 닫히면 이행합니다. 부트가 패치를 받지 못했거나 서버가 요구한 새 버전이 없을 때 다시 시도를 기다리는 데 씁니다. 부트에는 전환 화면 아래에 화면이 없어 전환 화면과 같은 오버레이에 엽니다. |
  | 보상 팝업 | `UI/RewardPopup` | popup | 메인 상태가 `offlineReward` 이벤트를 듣고 메인 스코프에 엽니다. 모은 시간(`formatTimer`), 오른 레벨(`Lv.3 → Lv.7`, 안 올랐으면 빈칸), 받은 아이템(`이름 +formatBig`, ID 순서로 한 줄씩)을 보이고 받기 버튼과 뒤로 가기가 닫습니다. 메인에 들어오기 전에 난 보상은 상태가 아니라서 나중에 뜨지 않습니다. |
  | 토스트 | `UI/Toast` | overlay | 앱 내내 하나입니다(아래 오버레이). `refused` 이벤트를 `GameErrorCode`별 문구로 바꾸고(잠긴 스테이지는 "아직 열리지 않은 스테이지입니다.", 모르는 코드는 "요청이 거절되었습니다.". 튜토리얼 스텝의 거절은 플레이어가 한 일이 아니라 화면이 서버보다 앞서간 것이고 튜토리얼이 서버의 스텝으로 돌아오므로 알리지 않음), C# `Toast`가 0.2초 나타나 2초 머문 뒤 사라집니다. 새 토스트는 지금 것을 바꿉니다. 탭은 받지 않습니다. |
  | 로딩 표시 | `UI/Loading` | overlay | `network.waiting`이 켜지면 열고 꺼지면 닫습니다(`showWhileWaiting`). 문구는 "서버 응답을 기다리는 중…", 다시 연결하는 중이면 "다시 연결하는 중…"이고(메인 화면에 있던 연결 문구), 왼쪽에서 노란 고리 아이콘(`ui_spinner`)이 돕니다(`Spinner`). 메인 화면의 스테이지 막대 바로 아래에 떠서 스테이지 이름과 화살표를 가리지 않습니다. 그동안의 입력 차단은 전처럼 `blockWhileWaiting`이 합니다. |
  | 알림 뱃지 | 빨간 점(`UiPrefabs.AddBadge`가 버튼과 탭 틀에 넣는 `Badge`) | 담는 화면의 것 | 뷰모델은 `Badge`(`ReadonlySignal<boolean>`, `presentation/widgets/badge.ts`)이고 바인더는 `active`입니다. 상태에서 `computed`로 계산하므로 뱃지를 등록하거나 끄는 코드가 없고, 상위 메뉴의 뱃지는 하위 뱃지를 `anyOf`로 모은 마디라 트리를 이룹니다(켜짐이 바뀔 때만 알림). 탭은 `Tab.badge`를 주면 탭 막대가 탭마다의 `Badge`(C# `TabBar.GetBadge`)를 켜고 끕니다. 점 하나라 따로 프리팹을 두지 않고 빌더 도우미가 단일 정의입니다. 첫 사용처는 장비입니다(아래 장비). |
  | 재화 바 | `UI/CurrencyBar`, 칸 `UI/CurrencySlot` | 담는 화면의 것 | 다른 프리팹에 중첩하고 `nested(view, vm => …)` 바인더로 그 화면의 바인딩 표 안에서 바인딩합니다. 칸은 `Items.kind`가 재화인 아이템을 ID 순서로 하나씩이고, 경험치는 재화 종류지만 레벨이 쓰고 제목과 경험치 막대가 보이므로 뺍니다(`createCurrencyBarViewModel`). 재화 목록은 테이블에서 정해지므로, C# `ViewList`가 꺼 둔 칸 틀을 그 수만큼 복제하고 `viewList` 바인더가 칸마다 아이콘(`icon` 바인더, `Items.icon`)과 수량(`bigNumber`)을 바인딩합니다. 재화 바는 이름을 비우고 아이콘이 대신하며, 같은 칸을 쓰는 장비 화면의 능력치는 아이콘 없이 이름을 보입니다. 지금 데이터로는 메인 HUD의 골드 하나이고, 재화가 늘면 바가 왼쪽으로 넓어지므로 경험치 막대와 겹치지 않게 배치를 다시 봐야 합니다. |

  - **오버레이**: 전환 화면, 토스트, 로딩 표시(개발 빌드는 디버그 오버레이도)는 앱 흐름의 상태와 따로, `app.start()`가 앱 흐름을 시작한 뒤 `showOverlays`로 앱 수명의 스코프에 엽니다. 전환 화면을 먼저 열어 오버레이의 맨 아래에 둡니다. 튜토리얼 오버레이는 메인 상태가 지금 스텝이 있는 동안 엽니다(아래 튜토리얼). 상태가 바뀌어도 이어지고, 재시작은 스크립트 환경째 버리므로 따로 닫지 않습니다.
  - **큰 수 텍스트와 숫자 롤링**: `bigNumber(vm => 신호)` 바인더 하나입니다. 뷰모델은 `Big` 신호를 내고, 바인더가 처음 값은 `formatBig` 표기로 바로(`RollingText.Set`), 바뀐 값은 앞의 값에서 굴려(`Roll`) 보입니다. 둘 사이를 열 칸으로 나눈 값의 표기(`rollFrames`, 앞과 같은 표기는 뺌)를 줄바꿈으로 이어 한 번 보내고, C# `RollingText`가 0.4초 동안 `Update`에서 차례로 넘깁니다. C#에서 보간하면 표기 규칙(`formatBig`)을 C#에 한 벌 더 두어야 하고, TS가 프레임마다 글자를 밀면 움직임은 C#이 그린다는 규칙에 어긋나기 때문입니다. 표기가 그대로면(1.21K → 1.25K) C#을 부르지 않고, 골드는 처치마다 한 번 부릅니다. 굴리지 않는 큰 수 글자는 쓰는 곳이 없어 따로 두지 않았습니다.
  - **경험치 막대**: `fill(vm => 신호)` 바인더가 0~1의 비율을 Filled `Image`의 `fillAmount`에 넣습니다. 메인 뷰모델의 `exp`가 제목의 %와 같은 비율이고, 최대 레벨이면 가득 찹니다.

`ViewRefs`(`client/Assets/Scripts/Views/ViewRefs.cs`)는 프리팹에 붙이는 키-값 표입니다. 값의 종류는 오브젝트, 오브젝트 목록, 문자열, 숫자, 불이며, 문자열·숫자·불은 Unity에서 설정해 프리팹에 저장하는 값입니다. 뷰는 읽을 항목을 키와 종류로 한 번에 선언하고(UI 화면은 아래 바인딩 표가 선언을 만듭니다), 화면을 열 때 각 키를 한 번씩 읽습니다. 없는 키, 종류가 다른 키, 비어 있는 오브젝트는 모두 모아 그 자리에서 오류로 알립니다.

```ts
// UI 화면: 표의 이름이 ViewRefs 항목 이름이고, 바인더가 항목의 종류와 뷰모델 값과의 연결을 정합니다.
export const loginView = view<LoginViewModel>("UI/LoginScreen", {
  idInput: input(vm => vm.loginId),                                       // 양방향 Signal
  loginButton: button(vm => vm.login(), { enabled: vm => vm.canLogin }),  // ReadonlySignal
  statusText: text(vm => vm.status),
});

// 바인딩 표를 쓰지 않는 뷰(전투 월드)는 선언을 직접 읽습니다.
// 인스펙터의 "Copy TS"가 이 선언을 클립보드에 넣어 줍니다.
const refs = {
  idInput: ref.object("TMPro.TMP_InputField"),   // InputTarget
  loginButton: ref.object("UnityEngine.UI.Button"), // ButtonTarget
  slots: ref.list("UnityEngine.GameObject"),     // ActiveTarget[]
  title: ref.string(),
  maxCount: ref.number(),
};
const targets = readRefs(viewRefs(root), refs);
bindClick(scope, targets.loginButton, () => void vm.login());
```

바인더는 `text`(`ReadonlySignal<string>`, 목록의 칸이면 문자열), `label`(프리팹의 고정 글자를 키의 문장으로, 아래 문장과 언어), `button`(누르면 `click(vm)`을 부르고 `enabled`·`visible` 옵션을 받음), `input`(`Signal<string>`, 양방향), `toggle`(`ReadonlySignal<boolean>`과 바뀐 값을 받는 `set(vm, on)`, `Toggle`), `slider`(0–1의 `ReadonlySignal<number>`, 끄는 동안의 `change`와 놓을 때의 `release`, `ReleaseSlider`), `active`(`ReadonlySignal<boolean>`, 알림 뱃지도), `list`(원소 배열이나 그 신호와 칸 하나의 바인딩 표, `ViewList`와 `ScrollList`), `tabBar`(`Tabs<K>`), `bigNumber`(`ReadonlySignal<BigLike>`, `RollingText`), `fill`(`ReadonlySignal<number>`, `Image`), `toast`(알림의 흐름 `Listen<string>`, `Toast`), `nested`(중첩 프리팹의 `ViewRefs`를 위젯의 뷰로 바인딩)입니다(아래 목록과 탭, 위 공용 위젯). 토글과 슬라이더는 신호가 바뀌어 보일 때 `SetIsOnWithoutNotify`·`SetValueWithoutNotify`를 써서 그 이벤트가 되돌아오지 않습니다. 플레이어의 누름(버튼, 탭, 목록의 칸, 토글)은 모두 `bind.ts`의 `listenPress` 한 곳을 지나며, 거기서 뷰 컨텍스트(`ViewContext.pressed`)를 먼저 부릅니다. 뷰 컨텍스트는 UI 스택이 만들 때 받아(`createUiStack({ ui, resources, context })`) 여는 모든 뷰의 `bind`에 넘기는 UI 공통의 것이고, 조립 지점이 버튼 소리(`audio.play`)와 문장 함수(`t`, `label` 바인더가 씀)를 넣습니다(아래 소리, 문장과 언어). 뷰모델마다 소리를 넣지 않고, 전역도 두지 않습니다. 슬라이더는 끄는 동안 계속 나지 않게 소리를 내지 않습니다. `Command` 타입은 두지 않습니다. 로그인 중에는 `enabled`(`canLogin`)가, 느린 요청 중의 탭은 `blockWhileWaiting`이 막고, 그 사이의 커맨드는 줄을 서기 때문입니다. 프리팹에 항목이 없거나 종류가 다르면 열 때 한꺼번에 보고하며 실패합니다.

오브젝트의 TS 타입은 Unity 타입 이름으로 정합니다. `unity/binding/components.ts`의 `UnityTypes`가 이름을 바인딩 모양(`TextTarget`, `ButtonTarget` 등)에 잇고, 목록에 없는 이름은 `unknown`이 됩니다. 바인딩 모양은 Unity 컴포넌트의 멤버 이름 그대로라서 C# 객체를 감싸지 않고 넘기며, 테스트에서는 일반 객체로 화면 전체를 검증합니다(`test/mvvm.test.ts`).

인스펙터는 UI Toolkit으로 그리고 스타일은 `ViewRefsEditor.uss`에 있습니다. 항목을 추가·삭제·이동할 때만 다시 그리며, 입력 중에는 다시 그리지 않습니다.
- 한 줄이 한 항목입니다(≡ | 키 | 값 | ▾). 오른쪽 작은 ▾ 버튼으로 오브젝트를 같은 GameObject의 다른 컴포넌트로 바꾸거나(목록은 모든 원소에 있는 타입으로 모든 원소를 한 번에), **Convert to**로 값의 종류(`object`, `list`, `string`, `number`, `bool`)를 바꿉니다. 지금 타입은 버튼의 툴팁에 나오며, object와 list 사이에서는 들어 있던 오브젝트가 옮겨집니다. ≡를 끌어 순서를 바꾸고, 줄에 마우스를 올리면 나오는 ×로 지웁니다.
- 표 아래 막대의 **Add**로 타입을 골라 추가하거나, 오브젝트들을 표에 끌어다 놓아 한 번에 추가합니다. 끄는 동안 놓일 곳이 파란 선으로 보이고, 표 아래 문구가 무엇이 추가될지 알려 줍니다. Alt를 누른 채 놓으면 목록 하나로 들어갑니다. 키는 오브젝트 이름에서 만들고(`Btn_Login` → `btnLogin`), GameObject는 버튼·입력·텍스트·이미지처럼 뷰가 쓸 만한 컴포넌트를 골라 넣습니다.
- 목록의 원소 하나만 바꿀 때는 그 오브젝트 칸을 우클릭합니다.
- 목록은 원소를 줄마다 펼쳐 보여 줍니다. 번호를 끌어 순서를 바꾸고, **+ Slot**으로 빈 칸을 더하거나 목록 위에 오브젝트를 끌어다 놓아 선이 가리키는 자리에 넣습니다.
- **Copy TS**는 위 선언 코드를 클립보드에 넣고 잠시 `Copied`로 바뀝니다. 오브젝트는 실제 컴포넌트 타입으로, 목록은 원소들의 공통 타입으로 적습니다.
- 키가 비었거나 겹치거나 오브젝트가 비면 경고를 띄웁니다. 이 검사는 값이 바뀔 때만 돕니다.

C# 쪽(`client/Assets/Scripts/`)은 세 폴더이고, 폴더마다 어셈블리 정의(asmdef) 하나입니다. `Views/`(`PortfolioIdleRpg.Views`)에는 게임 로직이 없는 MonoBehaviour, 곧 프리팹 참조를 노출하는 `ViewRefs`, 전투 월드의 배우와 글자(`ActorView`, `FloatingText`), 목록(`ItemList`를 잇는 `ViewList`와 스크롤 목록 `ScrollList`)과 탭 막대(`TabBar`), 놓을 때를 알리는 슬라이더(`ReleaseSlider`), 공용 위젯의 움직임과 반복(`RollingText`, `Toast`, `Spinner`, `ViewList`), 전환 화면의 페이드(`Fade`), 튜토리얼이 대상을 비추는 막(`Spotlight`)을 두고, `Facades/`(`PortfolioIdleRpg.Facades`)에는 TS가 부르는 좁은 C# API, `Runtime/`(`PortfolioIdleRpg.Runtime`)에는 스크립트 환경의 수명과 재시작(`TypeScriptRuntime`)을 둡니다. 에디터 코드(`Assets/Editor/`)는 넷째 어셈블리 `PortfolioIdleRpg.Editor`(Editor 전용)이고 앞의 셋을 참조합니다. 의존은 Runtime → Facades → Views 한 방향이고, 거꾸로 참조하지 않습니다. Facades는 `InternalsVisibleTo("PortfolioIdleRpg.Runtime")`로 수명 관리용 `internal` 멤버를 Runtime에만 엽니다. 어셈블리를 나눠도 PuerTS는 모든 어셈블리에서 타입을 찾으므로 TS의 `CS.PortfolioIdleRpg.Facades.…` 호출은 그대로입니다. 파사드는 단순한 타입(int, string, bool, `ArrayBuffer`)만 주고받고, C#끼리만 부르는 멤버는 `internal`로 둡니다. 지금 파사드는 `FileFacade`(게임 번들 옆 파일 읽기), `WebSocketFacade`, `ResourceFacade`(키로 에셋 불러오기, 불러온 프리팹의 인스턴스 만들기, 놓은 에셋 내리기), `UiFacade`(캔버스와 레이어, 입력 차단, 뒤로 가기), `WorldFacade`(전투 월드), `AudioFacade`(BGM과 효과음), `StorageFacade`(기기에 남기는 작은 값, PlayerPrefs), `DisplayFacade`(초당 프레임, 기기 언어), `RuntimeFacade`(재시작과 게임 시작 요청), `BundleFacade`(패치의 받기·해시·설치)입니다. `UiFacade`는 TS가 부르는 얇은 API만 두고, 처음 쓰일 때 캔버스(세이프 에어리어에 맞춘 1080×1920 기준, 위 세이프 에어리어), 레이어, 차단막, EventSystem(Input System UI 모듈)을 만드는 `UiRoot`와 한글 글꼴 대체를 맡는 `KoreanFontFallback`(둘 다 `internal`)에 일을 나눕니다. 글자는 TextMesh Pro이고, 한글은 앱에 든 Noto Sans KR(`Assets/Resources/Fonts/NotoSansKR-Regular.otf`, noto-cjk의 한국어 서브셋 OTF 4.6 MB, SIL OFL 1.1, 라이선스는 같은 폴더의 `NotoSansKR-OFL.txt`로 함께 빌드에 들어감)을 `KoreanFontFallback`이 실행 중에 동적 글꼴 에셋으로 만들어 대체 글꼴로 붙여 보여 줍니다. 에셋이 실행 중에만 있어 쓰는 글자가 아틀라스에 그려져도 프로젝트 파일이 바뀌지 않고, 기기의 OS 글꼴에 기대지 않으므로 어느 기기에서나 같은 한글이 나옵니다. 이 글꼴은 줄 높이가 커서 한글 글자 상자가 세로로 몇 픽셀 넘치지만(아래 버튼 2픽셀) 넘침을 허용한 상자라 잘리지 않습니다. C#에 등록하는 JS 함수(버튼 이벤트)는 화면 단위로 등록하고 해제해서, 재시작 때 남는 참조가 없게 합니다.

Facades는 Runtime을 참조하지 않으므로 둘 사이는 멤버를 열어 이어 줍니다. 재시작과 게임 시작은 `RuntimeFacade`가 요청을 들고 있고 Runtime이 `Tick`마다 `TakeRequest()`로 가져갑니다. 게임 번들의 폴더는 Runtime이 게임을 시작할 때 `FileFacade`에 넣어 주며, 경로 검사(`SafePath`)는 Facades에 있습니다. 정리는 `FacadeLifecycle.Shutdown()` 하나가 UI → 전투 월드 → 소리 → 소켓 → 번들 받기 → 리소스 순서로 하고(한 단계가 실패해도 나머지를 정리한 뒤 처음 예외를 올리고, 그 뒤의 예외는 로그에 남김), Runtime은 스크립트 환경을 버리기 직전에 그것만 부릅니다. 어느 파사드가 무엇을 쥐고 있는지 Runtime이 알 필요가 없습니다.

스크롤 목록과 그리드는 [LoopScrollRect](https://github.com/qiankanglai/LoopScrollRect)(MIT, UPM git 패키지 `me.qiankanglai.loopscrollrect`)로 칸을 다시 씁니다. 2026-11-02에 유료 Asset Store 에셋 EnhancedScroller를 이것으로 바꿨습니다(공개 저장소에 에셋 소스를 둘 수 없음). `Packages/manifest.json`이 커밋 해시로 고정합니다. 마지막 태그 v1.1.5는 Unity 6000.6의 uGUI 2.6에서 컴파일되지 않아(`ILayoutElement.maxWidth`·`maxHeight` 없음) 그것을 고친 master 커밋 `a7a32fbe`(2026-10-20)를 씁니다. Views와 Editor 어셈블리가 `LoopScrollRect.Runtime`을 참조하고, 이 패키지의 API를 쓰는 코드는 `ScrollList`와 그 목록을 만드는 `UiPrefabs.AddScrollList` 안에만 있습니다. 스크롤러가 부르는 칸의 출처(`LoopScrollPrefabSource`, `LoopScrollDataSource`)는 `ScrollList`의 private 클래스라서, `Transform`·`GameObject`를 받는 그 콜백이 TS의 타이핑과 IL2CPP 연결 코드에 들지 않습니다.

**목록과 탭**: 목록은 두 가지이고 바인더는 `list(원소, 칸)` 하나입니다. `ViewList`는 꺼 둔 틀을 원소 수만큼 복제하고(재화 바, 장비의 능력치, 설정의 채널), `ScrollList`는 LoopScrollRect 위에서 보이는 칸만 만들어 스크롤할 때 다시 씁니다(가방 그리드, 장비·강화·스킬 목록). 칸 하나가 원소 하나이고, 그리드와 세로 목록은 같은 `ScrollList`에 콘텐츠의 레이아웃만 다릅니다. 세로 목록(명세의 `List`)은 `VerticalLayoutGroup`이라 칸이 너비를 채우고 높이는 칸의 `LayoutElement`가 정하며, 그리드(`Grid`)는 열 수를 고정한 `GridLayoutGroup`입니다. 화면 밖으로 나간 칸은 숨었다고(-1) 알린 뒤 꺼서 모아 두고, 새 칸이 필요하면 거기서 먼저 꺼냅니다. 플레이 모드에서 100칸 그리드(4열, 뷰 높이 약 1,100)는 칸 20개로 시작해 60번까지 스크롤해도 36개였고, 세로 목록(칸 높이 150, 뷰 910)은 6–8개였습니다. 둘 다 C# `ItemList`를 이어서 TS에 같은 모양으로 보입니다. 원소 수는 `SetCount`로 알리고, 칸(루트에 `ViewRefs`가 있는 오브젝트)에 보일 원소가 정해지면 C#이 인자 없는 `Shown`을 내며 그 칸과 원소 번호(숨었으면 -1), 칸 번호를 `ShownItem`, `ShownIndex`, `ShownSlot`에 둡니다(번호를 이벤트 인자로 싣지 않는 것은 아래 탭 막대와 같은 이유). `ViewList`는 복제하자마자, `ScrollList`는 칸을 꺼내거나 다시 쓸 때 알립니다. 바인더는 그 칸을 칸의 바인딩 표(`row({ nameText: text(slot => slot.name), … })`, 위젯이면 그 `view`)로 원소에 바인딩하고, 칸이 다른 원소를 보이면 앞의 바인딩을 해제합니다. 그래서 칸에도 화면과 같은 바인더(버튼, 뱃지, 게이지)를 쓰고, 칸의 동작은 원소가 가집니다(장비 칸의 `selectButton: button(entry => entry.toggle())`). 원소가 바뀌면 보이는 칸 중 원소가 바뀐 칸(필드 값이 얕게 다른 칸)만 다시 바인딩하므로, 가방이 열린 동안 골드가 오르면 골드 칸 하나의 글자만 다시 씁니다. 원소 수가 바뀌면 `ScrollList`는 그 프레임의 `LateUpdate`에서 칸을 다시 채우고, 맨 위에 보이던 원소와 그 어긋남을 지킵니다. 줄어든 목록의 끝을 지나 스크롤해 있었으면(장비를 40번까지 내린 뒤 무기 탭 14개) 끝에서부터 채웁니다. 칸의 항목은 칸을 보일 때 읽으므로, 칸과 어긋난 표는 그때 처리되지 않은 오류(`[TypeScript] Uncaught:`)가 됩니다.

탭 막대 `TabBar`는 꺼 둔 틀 버튼을 `SetCount`만큼 복제하고 `SetLabel`로 이름을 붙입니다. 탭의 수와 이름은 뷰모델의 `Tabs<K>`(`presentation/view-models/tabs.ts`: 탭 목록 `{ key, label, badge? }[]`. `label`은 지금 언어의 이름 신호라 언어가 바뀌면 탭 이름도 바뀜, 고른 탭 `selected: ReadonlySignal<K>`, 고르는 `select(key)`)가 정하므로 프리팹에 적지 않습니다. 고른 탭은 입력란처럼 양방향이라 탭을 누르면 바인더가 `select`를 부르고, `selected`가 어디서 바뀌어도 `Select`로 따라갑니다. 고른 값을 어디에 둘지는 뷰모델이 정합니다: 가방과 장비는 화면의 신호(`localTabs`), 설정의 초당 프레임과 언어는 설정 서비스입니다. 틀에는 꺼 둔 알림 뱃지가 있어서, 탭에 `badge`를 주면 그 탭의 `Badge`를 켜고 끕니다(틀에 뱃지가 없으면 화면이 열리지 않음). 고른 탭은 누를 수 없게 해서 버튼의 disabled 색으로 밝게 보입니다. 누르는 이벤트는 그 탭 버튼의 `onClick`(`GetClickEvent`)을 듣습니다. `UnityEvent<int>` 하나로 받지 않는 것은 값 형식 인자의 델리게이트를 PuerTS에 따로 등록해야 하기 때문입니다.

TS가 보는 C# 타입은 PuerTS가 생성한 `client/TypeScript/types/csharp.d.ts`입니다(`Assets/Editor/TypeScript/TypeScriptTypings.cs`).
- **범위**: Facades와 Views 어셈블리의 `Facades`와 `Views` 네임스페이스에 있는 공개 타입만 선언하므로, 파사드를 추가하면 저절로 들어갑니다. Unity 컴포넌트(버튼, 텍스트)는 `ViewRefs`로만 받아 바인딩 모양(`unity/binding/components.ts`)으로 쓰므로 선언하지 않습니다. 이 범위의 선언은 32KB이고, UI 컴포넌트 7개를 더하면 108KB가 됩니다. 손으로 쓴 선언과 비교해 `tsc` 시간 차이는 없었습니다(0.36초).
- **갱신**: 에디터가 스크립트를 다시 불러올 때마다 이 타입들의 공개 시그니처로 지문을 계산하고(0.08ms), 파일 머리의 지문과 다를 때만 다시 생성합니다(V8 환경을 띄우므로 약 1초). C#을 고치고 Unity로 돌아오면 선언이 따라옵니다. Unity를 열지 않고 C#을 고쳤다면 `Tools/TypeScript/Generate Typings`나 배치 모드(`-executeMethod PortfolioIdleRpg.Editor.TypeScriptTypings.Generate`)로 만듭니다.
- **null**: PuerTS는 C# 참조 타입을 null이 아닌 것으로 선언합니다. null을 돌려주는 API(`WebSocketFacade.Poll` 등)는 쓰는 쪽에서 null을 포함한 타입으로 받고, 실제 파사드가 그 타입에 맞는지는 컴파일러가 확인합니다(`unity/socket.ts`).
- **경계**: `CS`는 런타임과 선언 모두에서 전역이므로, `unity/` 밖에서 쓰지 않는지 import 경계 검사가 함께 확인합니다.

`WebSocketFacade`는 .NET `ClientWebSocket`으로 바이트만 주고받습니다. 재연결·재개·타임아웃은 모두 TS의 서버 연결 어댑터가 맡습니다. 소켓은 백그라운드 스레드에서 이벤트를 큐에 쌓고, TS가 매 프레임 `Poll`로 메인 스레드에서 가져갑니다. 그래서 C#이 JS 함수를 쥐고 있지 않아 재시작 때 남는 참조가 없습니다. `Poll` 한 번은 에디터에서 0.16µs로 측정되어, 열린 소켓 하나당 프레임마다 한 번 부르는 비용은 무시할 수준입니다. 스크립트 환경을 버리기 직전에 `FacadeLifecycle.Shutdown()`이 열린 소켓도 모두 닫습니다. 참고로 PuerTS의 타이머는 `setInterval(fn, 0)`을 한 Tick 안에서 끝없이 반복하므로 매 프레임 실행은 1ms 간격으로 합니다.

재시작은 스크립트 환경을 통째로 새로 만듭니다. TS가 `AppRuntime.restart()`(Unity에서는 C# `RuntimeFacade.Restart`)를 부르면 `RuntimeFacade`는 요청만 표시하고, 그 프레임의 `Tick`이 끝난 뒤 `TypeScriptRuntime`이 `TakeRequest()`로 요청을 가져가 환경을 정리하고 부트 프로그램부터 다시 시작합니다(패치 확인 포함). 부트가 패치를 마치고 부르는 `RuntimeFacade.StartGame`도 같은 길로 부트의 환경을 버리고 게임 프로그램을 시작합니다. 스크립트가 부른 호출 안에서 환경을 정리하면 그 스크립트가 실행 중인 스택이 사라지기 때문입니다. 이전 실행의 상태·타이머·소켓은 남지 않습니다. 로그아웃, 서버가 요구한 업데이트, 치명적 오류가 이 경로를 씁니다. 에디터에서 재시작 한 번(정리, 새 V8 환경, 번들·테이블 로드, 로그인 화면까지)은 19ms였습니다. TS가 연 뷰는 `UiFacade`의 캔버스 아래에 있고, `FacadeLifecycle.Shutdown()`이 캔버스를 먼저 끄고 지우므로 버튼이 정리 중인 스크립트를 부르는 일도 없습니다. 이어서 전투 월드와 소리를 지우고 소켓을 닫고 불러 둔 에셋을 놓은 뒤 스크립트 환경을 버립니다. 소켓은 종료 핸드셰이크(1001 "The client is restarting.")를 백그라운드에서 한 뒤 폐기하므로, 오류·업데이트 재시작과 플레이 종료도 서버에는 비정상 종료(1006)가 아니라 정상 종료로 보입니다(로그아웃은 그 전에 TS가 1000으로 닫음).

빌드는 게임 번들 옆 `data/`에 `shared/data-schema/data/*.bytes`를 복사하고, 릴리스 빌드는 패치의 매니페스트(`manifest.json`)도 만듭니다. 게임 코드는 C# `FileFacade.Read("data/<테이블>.bytes")`로 이를 읽으며, 이 경로는 게임의 진입 모듈이 있는 폴더 기준입니다. 부트 번들은 파일을 읽지 않고 패치 화면의 문장(`Strings.bytes`)을 번들 안에 담습니다(esbuild의 binary 로더). 서버 빌드도 `server/dist/data/`에 같은 파일을 복사합니다.

| 명령 | 동작 |
| --- | --- |
| `npm run setup` | PuerTS Core/V8을 공식 릴리스에서 받아 `client/Packages/`에 설치 (같은 버전이면 건너뜀) |
| `npm run dev` | 클라이언트 TS 감시, 타입 검사 통과 시 개발용 번들 갱신 |
| `npm run build:dev` | 타입 검사 후 개발용 번들/소스맵 생성 |
| `npm run build:release` | 타입 검사 후 압축된 부트 번들을 `client/Assets/Resources/TypeScript/boot.mjs`(앱에 듦, 커밋하지 않음)에 쓰고, 게임 번들(`main.mjs`, 데이터, 카탈로그, 매니페스트)과 에셋 번들을 로컬 버킷 `client/TypeScript/dist/patch/`(Live의 패치 폴더와 같은 레이아웃)에 더한 뒤 앱의 API 채널을 그 버전으로 옮김 |
| `npm run serve:bundle -w @idle/client` | 로컬 버킷 `dist/patch/`를 `http://localhost:8081/`에서 정적 파일로 내줌(패치 시연) |
| `idle/server/deploy/deploy.sh <커밋>` | `server/dist/`를 Live VPS의 `releases/<커밋>/`에 올리고 `current`를 바꿔 다시 시작한 뒤 `https://idle.dennou.cloud/ws`가 답하는지 봄(이미 있는 커밋이면 롤백). 접속은 `VPS_HOST`, `VPS_USER`, `VPS_SSH` |
| `npm run patch -w @idle/client -- upload` | 로컬 버킷의 에셋 번들과 버전 폴더를 `PATCH_TARGET`(rsync 주소, SSH 옵션은 `PATCH_SSH`)에 올림. 이미 있는 것은 건너뛰고 포인터는 올리지 않음. `release <버전>`은 올라간 이 API의 버전으로 채널 포인터를 옮기고, `status`는 포인터를 보임 |
| `npm run typecheck` | 모든 워크스페이스 타입 검사 |
| `npm run generate` | `data/`에서 테이블 로더·데이터·공식 코드 재생성 (`-- --check`는 검사만) |
| `npm test` | 생성 파일 최신 여부와 워크스페이스 경계 검사 후 모든 워크스페이스 테스트 |
| `npm run coverage` | idle의 vitest 워크스페이스마다 자기 `src/`의 커버리지 표 (아래 테스트) |
| `npm run build -w @idle/server` | 타입 검사 후 `server/dist/main.mjs` 번들과 데이터 생성 |
| `npm start -w @idle/server` | 번들된 서버 실행 (`HOST` 기본 모든 인터페이스, `PORT` 기본 8080, 저장 DB `DATABASE_PATH` 기본 `server/game.sqlite`, `SERVER_MODE` 기본 `release`, 치트는 `development`에서만) |
| `npm run balance -- --hours 24` | 새 계정으로 24시간 플레이한 성장 곡선을 표로 찍고 CSV로 저장 (아래 밸런스 시뮬레이션) |
| `npm run bench` | 전투 규칙의 비용(정산 60초·10분, 오프라인 보상 12시간, 접속 1시간)의 중앙값과 p95. 기준 수치는 [docs/performance.md](docs/performance.md) |
| `npm run load -- --clients 500 --seconds 60` | 서버를 빌드해 별도 프로세스로 띄우고 클라이언트 N개로 동접 부하를 걸어 처리량·지연·CPU·메모리·SQLite 비용을 찍음 (아래 성능) |
| `npm run tauri dev -w @idle/formula-tool` | 수식툴 데스크톱 앱 실행 (Rust 필요) |

외부 의존성은 `npm install <패키지> -w @idle/server`처럼 해당 워크스페이스에 추가하고, 워크스페이스 간 의존은 `package.json`의 `dependencies`에 `"@idle/game-core": "*"`를 넣은 뒤 `npm install`을 실행합니다.

`node_modules/`와 각 워크스페이스의 `dist/`는 Git과 Unity Assets 밖에 있습니다. 새 체크아웃에서는 위의 설치/빌드 명령을 실행해야 합니다.

## 서버

게임 통신은 WebSocket 연결 하나(`/ws?v=<프로토콜 버전>&d=<규칙 테이블 지문>`)로 합니다. 메시지는 MessagePack 바이너리이고, 요청은 `{ op, id, body }`(게임 커맨드는 `time`도), 응답은 같은 `id`에 결과 코드를 담아 돌아옵니다. 프로토콜 버전(`PROTOCOL_VERSION`, 지금 21)과 규칙 테이블의 지문(`GameData.version`: 문장·소리를 뺀 규칙 테이블 바이트의 FNV-1a 32비트, 16진수 8자리)은 연결할 때 한 번 확인하며, 어느 쪽이든 다르면 서버가 종료 코드 4000으로 닫아 클라이언트가 업데이트합니다. 그래서 데이터만 바꾼 배포에도 옛 테이블로 예측하는 클라이언트가 남지 않습니다.

- **커맨드의 시각**: 게임 커맨드의 `time`은 클라이언트가 그 커맨드를 예측한 서버 시각(epoch ms)이고, 서버는 자기 시각의 1초 전부터 0.5초 뒤까지로 잘라(`COMMAND_TIME`) 그 시각에 적용합니다. 보통의 지연이면 예측과 확정이 같은 틱에서 같아 화면이 다시 맞춰지지 않고, 범위를 넘으면(1초 넘는 지연, 재연결 뒤 다시 보냄) 가장 가까운 끝으로 잘려 서버의 확정으로 맞춰집니다. 체크포인트보다 이른 시각은 체크포인트로 보므로(`applyCommand`) 지나온 시간을 다시 돌리지 못하고, 1초 안으로 소급하는 것(쓰러지기 직전으로 HP 강화)이 클라이언트가 고를 수 있는 전부입니다. `applyCommand`는 그 시각의 틱까지 전투를 확정(`settle`)한 상태를 핸들러에 넘기므로, 모든 커맨드가 확정한 상태를 바꾸고 핸들러는 따로 확정하지 않습니다. 거절될 커맨드도 확정하지만 한 번은 상한(10분, 중반 계정 약 1.5 ms)까지이고 커맨드 수는 아래 빈도로 묶입니다. `time` 하나가 요청마다 14바이트(키 5 + uint64 9)를 더해 빈 본문의 정산 요청이 17 → 31바이트입니다.
- **커맨드의 확정**: 클라이언트는 커맨드를 같은 규칙, 같은 시각으로 이미 예측했으므로 서버는 보통 바뀐 상태 대신 결과의 지문(`StateSync.fingerprint`: 저장 데이터를 키 정렬한 JSON의 cyrb53, 53비트 정수)만 답합니다. 숫자를 글자로 바꾸는 규칙은 ECMAScript가 정하므로 클라이언트(PuerTS V8)와 서버(Node)가 같은 값에 같은 지문을 내고, 키를 정렬하므로 저장 데이터를 풀어 만든 객체와 규칙이 계산한 객체의 키 순서가 달라도 같습니다. 클라이언트는 자기 예측의 지문과 견주어 같으면 그대로 확정하고, 다르면(다른 연결이 그 사이 저장함, 규칙이나 데이터가 어긋남) 새 시스템 API `StateFetch`(4, 본문 없음, 답은 `PlayerSnapshot`)로 저장 데이터를 받아 옵니다. 한 연결의 요청은 차례로 처리하므로 그보다 먼저 보낸 커맨드는 모두 받아 온 저장 데이터에 들어 있습니다. 서버가 커맨드의 시각을 잘랐거나 시각이 없었으면 예측과 다를 것을 알므로 바뀐 최상위 슬라이스(`changes`)를 함께 보내 왕복을 아낍니다. 답은 76바이트 안팎(지문 9, revision)이고, 지문 계산은 중반 계정(JSON 1.2 KB)에서 15 µs입니다. 서버는 그대로 권위이고 클라이언트의 비교는 자기 화면을 맞출 뿐이라, 조작한 클라이언트가 지문을 무시해도 저장 데이터는 바뀌지 않습니다.
- **커맨드의 빈도**: 게임 커맨드는 연결마다 초당 10개, 한꺼번에 20개까지 받고(토큰 버킷), 넘치면 처리하지도 기록하지도 않고 `TooManyRequests`(4)로 답합니다(클라이언트는 그 커맨드를 되돌림). 이미 답한 커맨드를 다시 보낸 것은 거르지 않고 기록된 답을 줍니다. 사람이 강화를 연타해도(초당 10번 안팎) 걸리지 않고, 조작한 클라이언트 하나가 커맨드마다 드는 정산과 커밋으로 프로세스를 채우지 못하게 합니다(초당 커밋 2,000부터 꼬리 지연이 뜀, 아래 성능). 연결마다 세므로 재연결을 되풀이하면 처음부터 셉니다.

 계정도 연결마다 한 번만 정합니다.

- **로그인**: `AuthLogin`은 텍스트 ID로 계정을 찾거나 만들고 새 세션 토큰(24시간)을 줍니다. 찾기·만들기, 저장 데이터 읽기, 세션 시작은 한 트랜잭션이라, 같은 새 계정을 함께 만들려던 로그인은 먼저 만든 계정을 찾고, 돌려주는 저장 데이터는 새 세션이 시작한 그대로입니다(그 뒤 옛 세션의 커맨드는 거절됨). ID 규칙(소문자·숫자·밑줄 4–16자, `LOGIN_ID_LENGTH`, `isValidLoginId`)은 game-core에 있어 클라이언트 입력 검사와 서버가 같은 규칙을 씁니다.
- **재개**: 연결이 끊긴 뒤에는 `AuthResume`에 토큰을 보내 같은 세션을 새 연결에서 이어 갑니다. 만료되면 `SessionExpired`, 그 사이 다른 곳에서 로그인했으면 `SessionReplaced`로 거절되며, 이때는 다시 로그인해야 합니다. 만료는 재개할 때만 확인하므로, 열린 연결은 만료 시각이 지나도 끊기 전까지 쓸 수 있습니다. 토큰 확인과 저장 데이터 읽기는 한 트랜잭션에서 하고 곧바로 연결을 세션에 묶습니다. 그래서 재개 도중 같은 계정의 로그인이 끼어들면 재개가 거절되거나, 재개한 연결이 로그인에 밀려납니다. 끝난 세션으로 재개한 연결이 새로 로그인한 연결을 밀어내는 일은 없습니다.
- **계정당 연결 하나**: 다른 연결이 같은 계정으로 로그인하거나 재개하면 이전 연결은 종료 코드 4001(`SessionReplaced`)로 닫히고 이전 토큰도 더는 쓸 수 없습니다. 4001을 받은 클라이언트가 스스로 다시 로그인하면 상대 기기를 밀어내게 되므로, 플레이어가 직접 로그인할 때까지 기다립니다. opcode별 요청·응답 타입은 `shared/protocol/src/`에, 번호와 실패 코드는 `shared/codes/src/`에 있습니다.

API는 숫자 opcode(`Opcode`)로 구분하고, 결과 코드(`ResultCode`)와 게임 실패 코드(`GameErrorCode`)도 숫자로 보냅니다. 모든 값은 명시적으로 고정합니다. 게임 커맨드를 추가할 때는 `@idle/codes`의 `Opcode`와 game-core의 `Command`에 정의하고 game-core에 핸들러를 넣습니다. 핸들러를 빠뜨리면 타입 검사가 실패합니다.

- `src/transport.ts`: WebSocket 엔드포인트입니다(`ws` 패키지). 버전을 확인하고 연결마다 rpc에 메시지를 넘깁니다. 바이너리 메시지만 받으며 텍스트는 1003, 64 KiB를 넘는 메시지는 1009로 닫습니다. 30초마다 연결을 확인해 그동안 아무것도 보내지 않은 연결에만 ping을 보내고, 다음 확인 때까지 pong도 메시지도 없던 연결은 끊습니다. 네트워크가 끊기거나 앱이 강제 종료되어 닫기 신호 없이 사라진 연결을 정리하기 위해서입니다. 클라이언트는 한가할 때 25초마다 `Ping`을 보내므로 서버가 따로 ping을 보낼 일은 드물고, `Ping`은 요청 로그에 남기지 않습니다.
- `src/rpc.ts`: 요청을 opcode별 핸들러로 보냅니다. 처리는 비동기지만 한 연결의 요청은 받은 순서대로 하나씩 처리하므로 커맨드도 보낸 순서대로 적용되고 답도 그 순서로 갑니다. `AuthLogin`은 텍스트 ID로 저장 데이터를 찾거나 만들고, 게임 커맨드는 클라이언트와 같은 `applyCommand`로 검증해 저장한 뒤 결과의 지문을 `sync.fingerprint`로 돌려줍니다(시각을 잘랐으면 바뀐 최상위 슬라이스도 `sync.changes`로, 위 커맨드의 확정). 저장하기 전에 같은 계정의 다른 요청이 먼저 저장했으면 그 저장 데이터에서 커맨드를 다시 적용하고, 세 번 연속 밀리면 `ServerError`로 답합니다. 커맨드의 답은 저장과 같은 트랜잭션에서 요청 id로 기록하므로, 연결이 끊겨 답을 못 받은 클라이언트가 같은 id로 다시 보내면 커맨드를 다시 실행하지 않고 처음 답을 그대로 돌려줍니다(거절도 같음). 기록된 답은 저장하는 트랜잭션 안에서 찾습니다. 재연결 직후에는 옛 연결이 아직 처리 중인 요청을 새 연결이 다시 보낼 수 있는데, 이때 늦게 쓰는 쪽도 오류 없이 처음 답을 받게 하기 위해서입니다. 요청 id는 세션 안에서 고유하면 되고, 새로 로그인하면 기록을 비웁니다. 그래서 새 로그인 뒤에 옛 세션의 연결에서 끝난 커맨드는, 저장하는 트랜잭션에서 연결의 세션이 더는 현재 세션이 아님을 보고 저장도 기록도 하지 않은 채 `SessionReplaced`로 거절됩니다. 기록하면 새 세션이 같은 id로 보낸 커맨드가 실행되지 않고 그 답을 받기 때문입니다. 요청마다 로그 한 줄을 남깁니다: `[rpc] 127.0.0.1:53422 hero StageSelect#3 Rejected StageNotFound 0.2ms` (연결, 계정, opcode#요청 id, 결과, 처리 시간). 치트(900–999)는 개발 모드가 아니면 커맨드를 읽기 전에 `CheatDisabled`(900)로 거절합니다(아래 개발과 릴리즈).
- `src/auth.ts`: 세션 토큰(256비트 난수)을 만들고 저장용 SHA-256 해시를 냅니다. DB가 새어도 토큰으로 세션을 이을 수 없습니다.
- `src/log.ts`: 채널의 `Logger`와 그것을 만드는 `createLog(sink, level)`입니다. 줄은 `[채널] 메시지`이고 레벨보다 가벼운 줄은 버립니다. `main.ts`가 `SERVER_MODE`로 레벨을 정해 콘솔에 쓰고(채널 `server`, `rpc`, `ws`), 테스트는 줄을 모아 검사합니다. `@idle/server/testing`의 테스트 서버는 기본으로 warn부터 남겨 요청 로그를 숨깁니다.
- `src/store.ts`: 계정(`accounts`: 텍스트 ID → 숫자 ID), 저장 데이터(`players`), 세션(`sessions`: 계정당 한 줄, 토큰은 해시만), 커맨드 답(`command_results`: 계정마다 최근 `MAX_UNANSWERED_COMMANDS`개)을 SQLite(`node:sqlite`)에 둡니다. 인터페이스는 DB 서버처럼 모든 호출이 비동기(Promise)이고, 트랜잭션은 그 안에서 쓸 저장소(`tx`)를 넘겨받는 모양입니다. 그래서 Postgres 같은 DB로 옮길 때는 이 파일만 새로 쓰면 됩니다. SQLite는 연결 하나를 모든 요청이 함께 쓰므로, 트랜잭션이 기다리는 동안 다른 요청의 문장이 끼어들지 않게 바깥 호출을 차례로 실행합니다. 저장은 읽었던 `revision`에서만 다음 revision으로 넘어가므로(`UPDATE … WHERE revision = ?`), 그 사이 다른 요청이 저장했다면 실패를 돌려받고 덮어쓰지 않습니다. 테이블 구조는 `PRAGMA user_version`과 `schema` 목록으로 저장 형식과 같은 방식(끝에 덧붙이기만)으로 올립니다. 테스트와 `@idle/server/testing`은 `:memory:` DB를 씁니다.
- `src/save.ts`: 새 계정의 시작 상태와 저장 형식입니다. 저장 데이터는 MessagePack으로 `{ version, player }`를 담고, 읽을 때 그 버전 다음의 마이그레이션을 차례로 거쳐 지금 형식이 됩니다. `PlayerState`의 형태를 바꾸면 `migrations` 목록 끝에 하나를 덧붙입니다. 지금 버전(`SAVE_VERSION`)은 목록 길이로 정해지고, 모르는 버전(롤백한 서버가 읽은 새 형식 포함)은 추측하지 않고 오류로 거절합니다. 저장 형식은 지금 12입니다. 1 → 2 마이그레이션이 전투 체크포인트(`battle`)를 넣고(아래 전투), 2 → 3이 골드(`currencies.gold`)와 경험치(`profile.exp`)를 보유량 `items`의 1, 2로 옮기고(아래 보상과 보유량), 3 → 4가 빈 장비(`equipment`)를, 4 → 5가 마친 튜토리얼(`tutorial`)을 넣습니다(아래 장비, 튜토리얼). 5 → 8은 전투 체크포인트의 모양(아래 전투), 8 → 9는 0단계의 강화(`statUpgrades`, 아래 골드 강화), 9 → 10은 그 버전의 기본 스킬(`skills`, 아래 스킬), 10 → 11은 가진 장비마다 강화 단계 0(아래 강화와 합성), 11 → 12는 환생한 적 없음(`rebirth`, 아래 환생)입니다. 새 계정은 `createPlayer`가 지금 시각에서 시작하는 첫 스테이지(game-core의 `firstStageId`, 환생도 여기서 시작)의 새 사냥(`freshBattle`)과 튜토리얼의 첫 스텝(`startTutorial`)을 가집니다. 밸런스 시뮬레이션도 같은 새 계정에서 시작하도록 `@idle/server/save`로 이 파일을 가져갑니다.

## 성능

백로그 70의 서버 쪽입니다. 클라이언트(프레임당 GC, 드로우콜)는 그림이 들어온 뒤 플레이어 빌드에서 잽니다. 전투 규칙만의 비용과 항목별 전후는 [docs/performance.md](docs/performance.md)에 있습니다.

### 부하 테스트

`npm run load -- --clients 500 --seconds 60`(그 밖의 옵션은 `--rate`, `--ramp`, `-- --help`). 코드는 `server/tools/load/`이고, `server/tools/load.mjs`가 서버를 빌드한 뒤 `main.ts`를 esbuild로 묶어 실행합니다(밸런스의 `run.mjs`와 같은 까닭).

- **서버**: 배포 번들(`server/dist/main.mjs`)을 별도 프로세스로 띄우므로 부하를 거는 쪽의 CPU가 측정에 섞이지 않습니다. DB와 서버 로그는 임시 폴더에 두고 끝나면 지웁니다(`server/game.sqlite`는 건드리지 않음). 요청마다 남는 로그 한 줄(릴리즈의 info)은 파일로 받으므로 그 비용도 들어 있습니다.
- **계정**: 먼저 개발 모드 서버에서 치트로 계정 N개(`load_0`, `load_1`, …)를 `npm run bench`와 같은 중반 상태(레벨 30, 3005 사냥)로 만들고 골드와 슬롯마다 같은 장비 둘을 줍니다. 잴 때는 같은 DB를 릴리즈 모드 서버로 다시 열어 치트가 섞이지 않습니다.
- **부하**: 클라이언트마다 실제 WebSocket으로 붙어 자기 ID로 로그인하고(`--ramp`초에 걸쳐), `--rate`(기본 0.1, 10초에 하나)로 정산 → 골드 강화 → 장비 강화 → 착용 → 골드 강화 → 장비 강화를 돌려 보냅니다. 기본 속도면 클라이언트처럼 1분에 정산 하나를 보내고 그 사이 강화·착용을 다섯 번 누르는, 손을 계속 놀리는 플레이어입니다. 가만히 보는 플레이어는 1분에 정산 하나와 `Ping` 둘이라 이보다 가볍습니다. 답을 기다리지 않고 정해진 때에 보내므로(열린 루프) 서버가 밀린 만큼 지연이 늘어납니다. 봉투와 코덱은 `@idle/protocol`의 것입니다.
- **재는 것**: 모두 로그인하고 한 바퀴를 보낸 뒤 `--seconds` 동안입니다. 지연은 보낸 때부터 답을 받을 때까지, 처리량은 그 사이 받은 답의 수입니다. 서버 안의 값은 서버를 띄울 때 `--import`로 넣는 `server/tools/load/probe.mjs`가 IPC로 답합니다: CPU(`process.cpuUsage`, GC·JIT 스레드 포함), 이벤트 루프가 일한 몫(`eventLoopUtilization`, 동기 fsync를 기다린 시간 포함), GC 뒤의 RSS와 힙, SQLite 시간(`node:sqlite`의 `run`·`get`·`all`·`exec`를 감싸 잼. `exec`는 트랜잭션이라 커밋의 fsync가 여기 듦)과 가장 오래 걸린 호출 하나. 서버 코드는 바꾸지 않았습니다.

Apple M4 Max(14코어: 성능 10, 효율 4), 36 GiB, macOS(Darwin 27.0), Node 22.14.0에서 창 60초로 잰 값입니다(2026-10-22, 다른 세션이 함께 돌던 기계라 ±20%쯤 흔들림). 부하 도구는 같은 기계에서 한 코어의 17% 아래를 썼습니다. 모든 요청이 `Ok`였고 잃은 답은 없습니다.

| 클라이언트 | 개/초 | 처리량 (답/초) | p50 ms | p95 ms | p99 ms | CPU % | 이벤트 루프 % | SQLite % | RSS MiB | 힙 MiB |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 (빈 서버) | | | | | | | | | 59 | 7.0 |
| 1,000 | 0.1 | 100 | 1.06 | 2.44 | 3.49 | 10.9 | 9.0 | 3.3 | 116 | 11.7 |
| 5,000 | 0.1 | 500 | 0.65 | 2.60 | 6.93 | 28.4 | 25.2 | 10.6 | 151 | 27.9 |
| 10,000 | 0.1 | 1,000 | 0.48 | 3.56 | 10.57 | 38.5 | 30.9 | 13.8 | 191 | 47.1 |
| 15,000 | 0.1 | 1,500 | 0.54 | 6.83 | 12.76 | 49.0 | 40.5 | 19.2 | 247 | 66.6 |
| 2,000 | 1 | 2,000 | 0.47 | 2.25 | 7.62 | 40.2 | 38.2 | 21.2 | 125 | 15.7 |
| 3,000 | 1 | 3,000 | 0.60 | 7.44 | 137 | 47.2 | 52.5 | 31.4 | 187 | 19.6 |
| 4,000 | 1 | 4,000 | 0.93 | 9.93 | 166 | 64.2 | 70.2 | 42.1 | 209 | 23.6 |

CPU %와 이벤트 루프 %는 코어 하나에 대한 몫, RSS와 힙은 모두 접속한 채 GC를 돌린 뒤입니다. 응답은 평균 340–390바이트(1초 간격이면 정산할 전투가 짧아 250바이트), 요청은 28바이트입니다(MessagePack, 프레임 머리 제외).

- **요청 하나**: 부하가 클 때 CPU 160–330 µs이고, 그중 SQLite가 95–130 µs(문장 9개), SQLite의 약 75%가 트랜잭션(커밋의 fsync)입니다. 같은 요청의 전투 시뮬레이션(지난 커맨드 뒤 10초 정산)은 `npm run bench`의 정산 60초(0.17–0.23 ms)로 미루어 약 30–45 µs라, 비용의 대부분은 저장과 통신(WebSocket, MessagePack, 저장 데이터 인코딩, 로그)입니다. 부하가 작을수록 요청당 CPU가 커 보이는데(1,000명 1.1 ms → 15,000명 0.33 ms), 한가한 프로세스를 macOS가 효율 코어나 낮은 클럭에 두는 것으로 보입니다. 그래서 용량은 부하가 큰 측정에서 구합니다.
- **꼬리 지연**: 초당 커밋이 2,000을 넘으면 p99가 수 ms에서 수십–백수십 ms로 뜁니다(3,000에서 세 번 잰 p99가 19 ms, 76 ms, 137 ms). 이벤트 루프는 절반만 바쁜데, 창마다 가장 오래 걸린 SQLite 호출 하나가 104–148 ms이고, 그 문장을 찍어 보면 `RELEASE work`(커밋)입니다. WAL이 1,000쪽을 넘으면 커밋이 그 자리에서 체크포인트(DB 파일 쓰기와 fsync)를 돌려 메인 스레드를 멈추는 것으로 보입니다. CPU보다 먼저 이것이 한계입니다.
- **메모리**: 접속 하나가 RSS 약 8–12 KiB(10,000 → 15,000명의 기울기 11.5 KiB), 힙 약 4 KiB입니다. 빈 서버는 RSS 59 MiB이고, 처음 부하에서 JIT 코드와 힙이 약 45 MiB 늘어납니다.
- **DB**: 계정 하나에 저장 데이터와 커맨드 답(계정마다 최근 100개, 답마다 약 300바이트)이 쌓여, 답이 다 차면 약 30 KiB입니다.
- **71 뒤**: 전투 거리와 이동으로 정산이 약 1.6배 무거워진 뒤(2026-10-23) 15,000명 × 0.1개/초를 다시 재면 처리량 1,500, p50 0.50 ms, p99 12.5 ms, CPU 42.6%, 요청당 CPU 284 µs, RSS 265 MiB로 위 표와 오차 안입니다. 요청 하나의 전투 계산(10초 정산)이 약 30–45 µs에서 약 55 µs로 늘었을 뿐이고 나머지는 저장과 통신이라 아래 동접당 비용은 그대로입니다.
- **넘친 부하**: 6,000명(초당 1개)부터는 접속하는 도중에 서버가 포화되어 접속이 `ECONNRESET`으로 끊기고 도구가 그 자리에서 멈춥니다. 접속 대기열(macOS `kern.ipc.somaxconn` 128)이 넘치는 것으로 보입니다.

### 동접당 서버 비용

기본 속도(손을 계속 놀리는 플레이어)를 기준으로, 위 값에서 프로세스 하나(Node는 요청을 메인 스레드 하나에서 처리)가 견디는 동접을 구합니다.

| | 이 기계 (M4 Max 성능 코어) | 클라우드 vCPU (AWS Graviton3) |
| --- | ---: | ---: |
| 코어 하나 | 약 20,000명 | 약 5,000명 |
| 1 GiB | 약 78,000명 | 같음 |

- **코어**: 15,000명이 CPU 49%라서 70%까지 늘리면 약 21,000명이고, 그때 초당 커밋 약 2,100개가 위의 꼬리 지연이 시작되는 곳이라 20,000명으로 둡니다. 클라우드 vCPU는 단일 스레드 성능이 약 3분의 1이라(PassMark single thread: M4 Max 14코어 4,634, [cpubenchmark.net](https://www.cpubenchmark.net/compare/6345vs6347/Apple-M4-Pro-14-Core-vs-Apple-M4-Max-14-Core) 2026-08 / c7g.large 1,562, [RunsOn](https://runs-on.com/benchmarks/aws-ec2-instances/c7g.large/) 2026-09–10 측정) CPU로는 약 7,000명입니다. 게다가 macOS의 fsync는 드라이브 캐시까지 비우지 않지만 Linux는 비우고, EBS gp3는 지연이 한 자릿수 ms입니다([AWS 문서](https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html)). 커밋 하나가 1 ms면 메인 스레드가 초당 커밋 1,000개(70%면 동접 7,000명)에서 차고 2 ms면 그 절반이라, 5,000명으로 잡습니다. 실제 인스턴스에서 같은 명령으로 다시 재야 하는 값입니다.
- **메모리**: (1 GiB − 빈 서버와 JIT 약 100 MiB) ÷ 12 KiB입니다. 프로세스 하나가 5,000명이면 약 160 MiB라서 메모리는 한계가 아닙니다.
- **가격**: AWS c7g.large(Graviton3 2 vCPU, 4 GiB) us-east-1 리눅스 온디맨드 $0.0725/시간, 월 730시간에 $52.9입니다([DoiT](https://www.doit.com/compute/spot/us-east-1/c7g.large), [Vantage](https://instances.vantage.sh/aws/ec2/c7g.large)는 $0.073으로 반올림, 2026-10-22 조회). vCPU마다 프로세스 하나로 10,000명이면 **동접 하나에 월 $0.0053(1,000명에 $5.3)**입니다. 내보내는 트래픽은 응답 약 350바이트에 프레임·TCP/IP·TLS 머리를 더해 약 430바이트 × 초당 0.1개 = 동접 하나에 월 약 0.11 GB이고, 인터넷 송신 $0.09/GB(us-east-1 첫 10 TB, [FactualMinds](https://www.factualminds.com/tools/aws-data-transfer-pricing-calculator/) 2026-07 기준)로 월 $0.010입니다. 합치면 **동접 1,000명에 월 약 $15**이고, 계산보다 트래픽이 큽니다. 전투 이어 가기(72)로 응답이 웨이브 도중의 체크포인트만큼 커졌다가(평균 341 → 676바이트, 합계 약 $23) 지문 확정(73)으로 평균 75바이트가 되어, 트래픽이 동접 1,000명에 월 약 $4, **합계 약 $9**입니다. 요청은 커맨드의 시각만큼 28 → 42바이트이고 받는 트래픽은 값이 없습니다. CPU와 지연은 측정의 흔들림 안입니다(요청당 332 µs, p99 11.8 ms, [docs/performance.md](docs/performance.md)).
- **전제**: 지금 서버는 프로세스 하나가 SQLite 파일 하나와 계정당 연결 맵(`bound`)을 들고 있어 코어 하나만 씁니다. vCPU 둘을 쓰려면 계정을 ID로 나눠 프로세스마다 맡기는 구조가 필요합니다.

### 계산 비용 (`npm run bench`)

전투 거리와 이동(71) 뒤 같은 기계에서 세 번 돌린 중앙값입니다. 정산 60초 0.32 ms, 정산 10분(상한) 1.53 ms, 오프라인 보상 12시간 1.63 ms, 접속 1시간(60초마다 정산) 10.5 ms입니다(71 전 0.17, 0.97, 1.14, 6.4 ms). 동접 하나가 접속해 있는 1시간에 전투 계산이 약 10.5 ms라서 코어 하나가 전투만으로는 약 34만 명을 감당하고, 오프라인 보상은 돌아와서 보내는 첫 정산에서 한 번(1.6 ms)이라 초당 500명이 한꺼번에 돌아와도 코어의 82%입니다. 서버 비용은 전투보다 요청마다의 저장과 통신이 정합니다.

## 전투

영웅 하나(와 59의 소환수 자리)가 여러 마리가 함께 나오는 몬스터 웨이브를 자동으로 상대하는 방치 전투입니다. 규칙은 `shared/game-core/src/battle/`에 한 벌만 있고, 클라이언트는 같은 시뮬레이션을 돌려 화면에 보여 줄 뿐 전투 결과를 보내지 않습니다. 서버는 저장된 체크포인트와 자기 시각만으로 같은 시뮬레이션을 다시 돌려 결과를 확정합니다. 설계와 결정의 이유는 [docs/superpowers/specs/2026-10-13-m2-battle-design.md](docs/superpowers/specs/2026-10-13-m2-battle-design.md)에 있습니다.

| 상수 | 값 | 뜻 |
| --- | --- | --- |
| `TICK_MS` | 100 | 한 틱(ms). 틱 `k`는 체크포인트의 서버 시각 `at + k × TICK_MS`입니다. |
| `Constants.spawnDistance` | 5.5 | 몬스터가 나오는 자리: 영웅 앞(오른쪽)으로 이만큼. 화면 밖이어야 합니다 |
| `Constants.meleeRange` | 1 | 기본 공격 스킬이 없는 전투원의 기본 공격 사거리 |
| `Constants.reviveSeconds` | 3초(30틱) | 사냥 중 쓰러진 영웅이 일어나기까지의 시간. 틱으로 반올림(최소 1틱) |
| `MAX_SETTLE_TICKS` | 6000 | 한 번에 다시 돌리는 최대 길이(10분) |
| `SETTLE_INTERVAL_MS` | 60,000 | 클라이언트가 보스 결말이 없을 때 정산을 보내는 간격(`application/battle`) |
| `CATCH_UP_TICKS` | 20 | 한 프레임에 이만큼 넘게 밀리면 이벤트 없이 따라잡음(`application/battle`) |

- **전투원**: 전투원마다 id, 진영, 능력치, HP, 재사용 대기가 있습니다. 영웅의 id는 `HERO_ID`(0)이고, 몬스터와 소환수는 체크포인트의 `nextId`부터 나온 순서대로 받아 한 전투에서 겹치지 않습니다. 진영은 아군(영웅, 그 뒤에 영웅의 소환수)과 적(웨이브의 몬스터와 그 소환수)이고, 한 틱의 처리 순서는 아군 다음 적, 진영 안에서는 id 순서입니다.
- **웨이브**: 사냥 웨이브는 `Stages.waveSize`마리이고, i번째는 웨이브가 시작한 틱 + i × `spawnIntervalSeconds`(틱으로 반올림, 최소 1틱)에 나오며 종류는 그때 `monsterIds`에서 난수로 고릅니다. 보스 웨이브는 보스 하나입니다. 웨이브가 끝난 다음 틱에 다음 웨이브가 시작합니다. 몬스터는 영웅 앞 `spawnDistance`에 나와 나온 틱에는 대상이 되지 않고 행동하지 않으며, 다음 틱부터 영웅 쪽으로 걸어옵니다(아래 위치와 이동).
- **규칙**: 한 틱에서 웨이브가 없으면 다음 웨이브를 시작하고, 이번 틱에 나올 몬스터가 나온 뒤, 지속 시간이 다한 소환수의 만료와 걸린 효과의 틱, 떨어지는 발사체를 처리하고, 처리 순서대로 행동합니다. 전투원은 맞설 상대가 있을 때만 재사용 대기가 줄고, 행동은 재사용 대기가 끝났고 지금 쓸 수 있는(아래 위치와 이동, 사용 조건) 스킬 중 목록에서 앞선 것이며, 없으면 공격 간격이 찼을 때의 기본 공격(`cooldownSeconds`가 0인 첫 스킬. 재사용 대기가 0인 다른 스킬은 쓰지 않습니다)이고, 그것도 쓸 수 없으면 다가갑니다. 재사용 대기가 있는 스킬은 피해(적 대상이고 `powerMultiplier > 0`)나 효과(`effectIds`), 소환(`summonId`)이 있는 것만 씁니다. 기절한 전투원은 행동하지 않고 재사용 대기도 줄지 않습니다. 대상은 적 스킬이면 상대 진영, 아군 스킬(`ally`)이면 자기 진영에서 살아 있고 사거리(`Skills.range`) 안의 전투원 중 스킬의 `targetRule`(Enums의 `TargetRule`)로 고릅니다. `front`는 가장 가까운 것(같으면 id가 작은 것), `weakest`는 남은 HP가 적은 것(같으면 가까운 것), `random`은 시드 난수로 겹치지 않게(고를 때마다 난수 하나) 고릅니다. `Skills.radius`가 0이면 그렇게 `maxTargets`까지 고르고, 0보다 큰 범위 스킬(화염구 1, 서리 숨결 1, 대지 강타 1.5, 운석 2)은 첫 대상 하나와 그 둘레 반경 안의 같은 진영(사거리와 무관)을 첫 대상에 가까운 순서로 `maxTargets`까지 맞힙니다. 피해는 대상마다 `floor(damage 공식(공격자, 대상) × 스킬 배율 × 속성 배율 × 치명이면 critMultiplier)`이고, 치명은 공격마다 한 번 정하며 영웅만 냅니다. 쓰러지거나 만료한 전투원은 바로 빠져 그 틱에 행동하지 않고(목록에서는 틱이 끝날 때 뺍니다), 몬스터의 처치 보상은 쓰러질 때 지급합니다. 난수는 mulberry32이고 상태(uint32 `rng`)를 체크포인트에 저장합니다. 능력치는 `heroStats`(`Heroes`와 지금 레벨의 `HeroLevels` 행에 입은 장비의 수정치를 합산. 레벨은 경계에서 오릅니다, 아래 레벨과 장비), `monsterStats`, `summonStats`(아래 소환수)가 정하고 계산은 `Big`으로 합니다. 결과를 정하는 계산은 double의 사칙연산·비교, `Math.max/min/floor/round`, 난수 생성기의 `Math.imul`과 비트 연산, `Big` 연산, 배열 순서의 반복만 써서(`Map`/`Set`을 순회해 결과를 정하지 않음, `Math.random`·`Math.pow`·`Math.log*`·`Date` 없음) 클라이언트의 V8과 서버의 V8이 같은 비트를 냅니다.
- **위치와 이동**: 전투원마다 월드 x가 있고(화면과 같은 단위), 아군은 0에서, 몬스터는 나올 때 영웅의 자리 + `spawnDistance`(5.5)에서 시작합니다. 그래서 영웅이 걸어간 만큼 앞에서 나오고, 화면은 영웅을 기준으로 그립니다(아래 전투 월드). 거리는 x의 차이뿐이고(한 줄), 같은 자리에 겹쳐 설 수 있어 서로 막지 않습니다. 쓸 스킬이 없는 차례에 가장 가까운 상대가 기본 공격의 사거리 밖이면 이동 속도(`Heroes`·`Monsters`·`Summons`의 `moveSpeed`, 월드 단위/초. 지금 영웅 2, 몬스터 1–3.6, 늑대 2.5) × 0.1초만큼, 사거리에 닿는 자리까지 다가갑니다. 그래서 근접 몬스터는 영웅의 1 앞에, 궁수(기본 공격이 사거리 3의 활쏘기 1012)는 3 앞에 멈춰 쏘고, 영웅은 사거리 안에 아무도 없으면 가장 가까운 적에게 걸어갑니다. 소환수는 소환자의 자리에 나옵니다. 경계(웨이브 클리어, 보스 종료, 부활)마다 아군이 0으로 돌아갑니다. 자리는 체크포인트에 저장되지만, 걷기만 쌓이면 x가 커져 double의 간격이 거리 비교의 여유(1e-9)를 넘으므로 경계마다 되돌립니다(화면은 영웅을 기준으로 그려 보이지 않음). 둔화(4010)는 이동 속도를 50% 줄이고(`Stat.MoveSpeed`), 기절한 전투원은 걷지 않습니다. 거리 비교는 1e-9의 여유를 두어 사거리에 닿게 멈춘 자리가 반올림 오차로 밖에 서지 않게 합니다.
- **사용 조건**(`Skills.condition`, Enums의 `SkillCondition`): `always`는 사거리 안에 대상이 있으면, `hurt`는 HP가 `conditionValue` 비율 이하인 대상(자신 스킬은 자신)이 사거리 안에 있을 때 그 대상 중에서(치유의 빛: 70% 이하인 아군 중 HP가 가장 적은 것), `crowd`는 사거리 안의 적이 `conditionValue` 이상일 때(전투의 포효: 2 안에 하나, 늑대 소환: 4 안에 하나) 씁니다. 조건이 맞지 않는 스킬은 준비된 채로 두고 다음 스킬, 그다음 기본 공격을 봅니다.
- **속성 상성**: 스킬의 속성(`Skills.element`, 기본 공격이 없으면 물리)과 맞는 쪽의 속성(`Monsters.element`. 영웅과 소환수는 물리)으로 `elementAdvantage`가 1(강함), -1(약함), 0을 정하고 공식 `elementMultiplier`(강함 1.5, 약함 0.75)를 곱합니다. 불과 얼음은 서로에게 강하고, 신성은 독에 강하며, 물리가 아닌 같은 속성끼리는 약합니다(영웅의 화염구는 서리 늑대에 1.5배, 주술사·화염 드래곤에 0.75배). 지속 피해에는 곱하지 않습니다.
- **효과**(버프/디버프, `data/Effects.xlsx`): 스킬의 `effectIds`가 가리키는 효과를 겁니다. 적 스킬은 피해를 준 뒤 살아남은 대상에, 아군·자신 스킬(`powerMultiplier`는 빈 칸)은 고른 대상에 겁니다. 종류(`EffectKind`)는 능력치(`statBuff` 공식의 비율을 겹에 담아 `StatModifier`로 효과 전 능력치에 얹음. `attackInterval`은 둔화이고 다음 기본 공격부터 반올림한 틱), 지속 피해와 회복(`tickSeconds`마다 `dotDamage`·`heal` 공식의 양, 방어 무시), 기절, 보호막(`shield` 공식의 양만큼 공격과 지속 피해를 먼저 막고, 다 닳으면 `break`), 정화(`effectIds`의 효과를 풀고 지속 동안 다시 걸리지 않게 막음)입니다. 지금 식은 셋 모두 시전자 공격력 × `power` × 건 스킬의 레벨 배율(능력치는 `power` × 레벨 배율)입니다(위 데이터와 공식, 아래 스킬). 양과 비율은 걸 때의 시전자 능력치와 스킬 레벨로 정하고, 지속 시간이 0이면 걸리는 순간 한 번 듣고 남지 않습니다(즉시 회복, 정화만 하기).
  - **겹**: 겹 하나가 효과 목록의 항목 하나이고 저마다 남은 틱과 양을 가져 따로 끝납니다(2초짜리를 1초 간격으로 두 번 걸면 첫 겹은 1초 뒤, 둘째는 2초 뒤에 끝남). 같은 대상에 같은 효과가 `maxStacks`만큼 있으면 가장 먼저 끝날 겹(가장 먼저 건 것)을 떼고 새 겹을 둡니다. 그래서 `maxStacks` 1은 갱신, n은 최대 n겹 누적입니다. 능력치와 지속 피해·회복은 겹마다 따로 셉니다.
  - **틱**: 한 틱에서 새 몬스터가 나온 뒤, 차례보다 먼저 처리 순서대로 걸린 겹의 남은 틱을 하나 줄입니다. 지속 피해·회복은 남은 틱이 간격으로 나누어떨어지는 틱(끝나는 틱 포함, 3초에 0.5초면 6번)에 듣고, 0이 되면 끝납니다(`expire`). 지속 피해로 쓰러지면 공격으로 쓰러진 것과 같습니다(처치 보상, 웨이브 클리어, 영웅이면 물러남과 부활).
  - **해제와 면역**: 겹은 만료, 정화, 보호막이 다 닳음으로 끝나고 각각 `effectEnd`를 냅니다. 죽거나 물러난 전투원의 효과는 이벤트 없이 사라지고, 새 사냥(스테이지 선택, 낡은 체크포인트, 착용, 스킬 장착·해제·레벨업)은 효과 없이 시작합니다. 면역은 정화가 지속되는 동안 그 목록의 효과가 걸리지 않는 것입니다(`effectImmune`).
  - **마나**: 쓰지 않으며 `Skills.manaCost`를 지웠습니다. 자동 전투라 마나가 플레이어에게 고를 거리를 만들지 않고, 재사용 대기와 같은 일(스킬 빈도 조절)을 두 번 합니다. 쓰면 전투원마다 현재 마나와 틱마다의 회복이 계산과 체크포인트·와이어에 더해집니다.
- **발사체**(`data/Projectiles.xlsx`): `Skills.projectileId`가 있는 스킬(지금 영웅의 속사·화염구, 몬스터의 독 슬라임·속사·화염구, 용의 운석)은 쓰는 틱에 대상과 치명만 정하고 발사체를 쏩니다(`attack`의 `hits`는 비고 `launch`). 발사체는 고른 대상마다 하나로 쏜 순간 첫 대상까지의 거리 ÷ `speed`초(0.1초 틱으로 반올림, 최소 1틱. 거리 3이면 화살 0.2초, 화염구 0.3초, 독 덩어리 0.4초, 운석은 4.5에서 1.1초)를 날아, 떨어지는 틱에 그때 살아 있는 대상만 칩니다(`impact`). 피해와 효과의 양은 떨어질 때 쏜 전투원의 능력치로 정합니다. 발사체는 대상을 따라가고 충돌 판정은 없습니다. 떨어지기 전에 쏜 전투원이 쓰러지거나, 대상이 모두 쓰러지거나, 적이 물러나면 사라집니다(`vanish`). 한 틱에 떨어지는 것은 효과의 틱 다음, 차례 전에 쏜 순서대로 처리합니다. 발사체의 id는 전투원과 같은 `nextId`에서 받습니다.
  - **경계에서는 날지 않음**: 경계(웨이브 클리어, 보스 종료, 부활)에는 적이 모두 쓰러졌거나 물러났으므로 위의 규칙으로 날던 발사체도 모두 사라져 있고, 남으면 버그라서 시뮬레이션이 던집니다. 웨이브 도중의 체크포인트는 날아가는 발사체(쏜 전투원, 스킬과 그때의 레벨, 살아 있는 대상, 치명, 남은 틱)를 저장해 그대로 이어 갑니다. 아래는 체크포인트를 경계에만 두던 때(71까지)의 결정입니다. 날아가는 발사체를 저장하면(쏜 몬스터와 공격력, 스킬, 대상, 치명, 남은 틱) 빈 목록만으로 저장마다 13바이트, 하나에 약 73바이트가 늘고, 쓰러진 몬스터의 능력치를 저장에서 다시 세워야 합니다. 그런데 중반 계정(3005, 30레벨)의 1시간 경계 957개 중 113개(12%)에서 잘린 발사체는 모두 대상이 이미 쓰러진 영웅의 것이었고, 초반 계정(3003, 8레벨)에서도 영웅을 향하던 적의 것은 1시간에 2개였습니다. 발사체가 모두 떨어질 때까지 경계를 미루는 방법은 잘린 경계마다 평균 0.3초(최대 0.4초)를 늦추고 "웨이브는 끝났지만 아직 경계가 아닌" 상태를 더합니다. 지금은 정산하는 순간에 날던 발사체도 체크포인트에 실려 다음 정산에서 한 번만 맞습니다.
- **소환수**(`data/Summons.xlsx`): `Skills.summonId`가 있는 자신 대상 스킬(지금 영웅의 늑대 소환, 재사용 대기 10초)은 쓴 뒤(`attack`, hits가 빔) 소환수를 소환자 진영의 끝에 부릅니다(`summon`). 소환수도 전투원이라 id를 `nextId`에서 받고, 효과·발사체·대상 규칙을 다른 전투원과 똑같이 따르며, 나온 다음 틱부터 대상이 되고 행동합니다(기본 공격은 바로, 스킬은 처음부터 기다림). 능력치는 `summonStats`가 소환자의 효과 전 능력치, 행, 소환 스킬의 레벨로 공식을 계산해 내립니다: 최대 HP `summonMaxHp`(= 소환자 최대 HP × `maxHpRate` × 레벨 배율, 1 이상), 공격력 `summonAttack`(× `attackRate`), 방어력 `summonDefense`(× `defenseRate`)이고 공식의 `target`이 `Summons` 행입니다. 지금 공식 언어로 쓸 수 있는 곱만 두었고, 정수 거듭제곱과 조건식은 60에서 공식을 고치면 됩니다. 치명은 없고, 공격 간격과 스킬은 행의 `attackIntervalSeconds`, `skillIds`입니다(소환 스킬은 빼므로 소환수는 소환하지 않습니다). 지금 데이터는 정령 늑대 하나(6001: HP 0.5배, 공격력 0.3배, 방어력 0.5배, 1초 기본 공격, 25초, 최대 2)입니다.
  - **끝**: `durationSeconds`가 다한 틱의 처음(효과의 틱 전)에, 같은 소환자의 같은 소환수가 `maxCount`만큼 있는데 또 부르면 가장 먼저 부른 것이, 소환자가 쓰러지면 그 소환수가 모두 만료합니다(`expire`). 맞아 쓰러지면 다른 전투원처럼 `death`이고 보상은 없습니다. 만료한 소환수가 쏜 발사체와 그것만 노리던 발사체는 사라집니다. 적의 소환수는 적이라 웨이브 클리어와 보스 승리는 그것까지 없어야 하는데, 몬스터가 쓰러지면 그 소환수가 만료하므로 실제로는 몬스터만 보면 됩니다. 물러날 때(`retreat`)는 적의 소환수도 이벤트 없이 함께 사라집니다.
  - **경계를 넘어 남음**: 영웅의 소환수는 체크포인트(`summons`: id, `summonId`, HP, 재사용 대기, 효과, 남은 틱)에 저장해 다음 웨이브로 이어 갑니다. 능력치는 저장하지 않고 이어 받을 때 영웅의 지금 능력치에서 다시 계산하므로, 경계에서 레벨이 오르면 끊기지 않은 전투도 소환수의 능력치를 다시 계산합니다(HP는 그대로). 적의 소환수는 경계에 없습니다(몬스터와 함께 쓰러지거나 물러남). 발사체(58)와 달리 소환수는 웨이브보다 오래 살도록 만든 것이라, 경계에서 사라지게 하면 중반 계정에서 경계가 평균 3.3초마다 와서 25초짜리가 거의 한 웨이브만 싸우고(그 계정의 1시간 경계 1,102개 중 1,100개에 소환수가 살아 있음), 만료까지 경계를 미루면 재사용 대기(10초)가 지속(25초)보다 짧아 경계가 오지 않아 정산할 수 없습니다. 저장하면 빈 목록이 10바이트, 소환수 하나가 약 70바이트라 중반 계정의 저장 데이터가 평균 324 → 436바이트(최대 368 → 473)이고 저장 형식 8입니다. 이어 받을 때 공식 세 번을 더 계산하는 것 말고 정산 비용은 같습니다. 새 사냥(스테이지 선택, 낡은 체크포인트, 착용)은 소환수 없이 시작합니다.
- **체크포인트**: 체크포인트(`BattleState`)는 아무 틱의 상태입니다: `mode`, `at`, `rng`, `hero`(`hp`, `cooldowns`, `effects`, `x`), `summons`(양쪽, 부른 전투원 `by`), `waves`, `autoBoss`, `nextId`, 진행 중인 웨이브의 몬스터(`enemies`), 날아가는 발사체(`projectiles`), 웨이브의 진행(`wave`: 지난 틱과 나온 수), 보스 제한 시간(`bossTicksLeft`), 부활 대기(`reviveTicksLeft`). 정산은 요청한 시각의 틱까지 돌려 그 틱의 체크포인트(`Battle.checkpoint()`)를 `player.battle`에 저장하고, 그때의 `stage`, `hero`(레벨), `items`, `equipment`도 함께 확정합니다. 그래서 웨이브 중의 처치 보상도 그 정산에서 확정되고 보이는 보유량이 곧 쓸 수 있는 보유량입니다. 이어 받은 전투원은 0틱에 나온 셈이라 1틱부터 대상이 되고 행동하며, 모든 틱의 체크포인트에서 이어 간 전투가 끊기지 않은 전투와 같은 상태이고 끝까지 같은 이벤트를 냅니다(`expectEveryTickResumes`: 사냥, 보스전, 부활 대기, 효과, 발사체, 양쪽 소환수, 레벨업). 경계는 사냥 웨이브 클리어(나올 몬스터가 다 나와 모두 쓰러짐), 보스 종료, 영웅이 다시 일어남, 스테이지 클리어이고, 레벨업과 다음 웨이브는 경계에서 정합니다. 경계에는 적, 발사체, 진행 중인 웨이브가 비어 있습니다. 보스 차례는 모든 경계와 새 사냥을 시작할 때 정합니다. 스테이지에 보스가 있고 `autoBoss`가 켜져 있고 `waves`가 `Stages.waveCount` 이상이면(`bossDue`) `mode`를 `Boss`로 두고, 다음 웨이브는 `mode`만 보고 고릅니다. 그래서 경계 뒤에 `autoBoss`를 켜도 이미 보여 준 과거는 바뀌지 않습니다. `waves`는 사냥 웨이브를 깰 때마다 `min(waves + 1, waveCount)`가 되어 목표에서 멈추므로, 보스에게 져서 사냥이 이어져도 목표를 넘지 않습니다. 보스가 없는 스테이지는 `autoBoss`가 켜져 있을 때 `waves`가 `waveCount`에 닿는 경계에서 클리어합니다(마지막 스테이지를 클리어하면 `autoBoss`가 꺼지므로 그 스테이지는 더 클리어하지 않고 사냥을 이어 갑니다).
- **보스와 클리어**: 보스는 영웅이 최대 HP일 때 시작하고, `Stages.timeLimitSeconds`(0이면 제한 없음)가 지나면 실패합니다. 이기면 스테이지 클리어입니다. `stage.clearedIds`에 더하고, `unlockStageId`가 지금 스테이지인 것 중 해금된(아래 해금) ID가 가장 작은 스테이지로 옮겨 새 사냥(`waves = 0`, `autoBoss` 켬)을 이어 갑니다. 그런 스테이지가 없으면(마지막 스테이지, 레벨 부족) 그 스테이지에서 사냥을 이어 가고 `autoBoss`를 끕니다. 영웅이 쓰러지거나 시간이 다 되면 보스가 물러나고(`retreat`) 사냥으로 돌아가며 `autoBoss`가 꺼지고, 스테이지 막대의 보스 해골을 눌러 다시 도전합니다. 사냥 중 쓰러진 영웅은 부활 시간 뒤 최대 HP로 일어나고, 웨이브의 남은 몬스터는 물러나며(`retreat`, 남은 등장도 없음) 그 웨이브는 세지 않습니다.
- **이벤트**(`BattleEvent`): `waveStart`(사냥 웨이브의 차례 `wave`. 1부터 목표에서 멈춤, 목표 `wavesNeeded`), `spawn`(id, monsterId, boss), `attack`(공격자 id, skillId, crit, `hits`: 고른 순서의 대상 id·피해·보호막이 막은 양·남은 HP. 피해가 없는 스킬과 발사체 스킬은 비어 있음), `launch`(발사체 id, 쏜 전투원 `by`, projectileId, 대상 id 목록, 나는 틱 수 `flightTicks`. 착탄 틱은 tick + flightTicks), `impact`(발사체 id, `by`, skillId, crit, `hits`), `vanish`(발사체 id), `summon`(소환수 id, 소환자 `by`, summonId, 만료까지 남은 틱), `expire`(소환수 id), `death`(id), `retreat`, `revive`, `bossStart`, `bossEnd`(win), `stageClear`(stageId, 다음 스테이지 `nextId`), `levelUp`(level), `effectApply`(대상 id, effectId, 건 전투원 `by`, 그 효과의 지금 겹 수, 남은 틱. 0이면 즉시 한 번 듣고 남지 않음), `effectTick`(대상 id, effectId, 막기 전 양, 막은 양, 남은 HP), `effectEnd`(대상 id, effectId, `expire`·`cleanse`·`break`), `effectImmune`(대상 id, effectId)입니다. 쏜 발사체는 모두 `impact`나 `vanish` 하나로 끝납니다. 스냅숏(`BattleSnapshot`)은 `waves`/`wavesNeeded`, 영웅(레벨, HP, 지금 공격력 `attack`과 치명 확률 `critChance`(걸린 능력치 효과 포함), 장착한 스킬 `skills`(슬롯 순서, 기본 공격 제외. 각각 `skillId`, 재사용 대기 `cooldownTicks`, 준비까지 남은 틱 `readyInTicks`, 0이면 준비)), 살아 있는 적 몬스터의 목록(`enemies`: id, monsterId, boss, HP, 최대 HP. 나온 순서), 살아 있는 소환수(`summons`: id, summonId, 소환자 `by`, 영웅 편인지 `ally`, HP, 최대 HP, 만료까지 남은 틱), 날아가는 발사체(`projectiles`: id, `by`, projectileId, 대상 id 목록, 떨어지기까지 남은 틱)를 보이고, 전투원마다 자리(`x`, 이번 틱에 걸었는지 `moving`)와 걸린 효과(`effects`: effectId, 겹 수, 가장 늦게 끝나는 겹까지 남은 틱. 걸린 순서)를 붙입니다. 화면 연출은 아래 전투 연출(64)입니다.
- **결정성 골든 벡터**: `shared/game-core/test/battle-golden.test.ts`가 정한 시드의 새 계정(3001, 레벨업 있음, 소환과 만료가 나옴)을 돌려 첫 1분의 이벤트(`golden/battle-3001-first-minute.jsonl`)와 10분의 이벤트 해시, 마지막 경계, 상태(`golden/battle-3001-ten-minutes.json`)를, 12레벨 영웅의 3004 보스전(족장의 강화·보호막·정화와 기절, 영웅의 발사체와 늑대)을 10분 돌린 해시, 효과 수, 상태(`golden/battle-3004-boss.json`)를 파일과 비교합니다. 규칙이나 데이터를 일부러 바꿨으면 `npx vitest run -u`로 다시 쓰고 diff를 확인합니다.

세 커맨드는 모두 `applyCommand`의 핸들러라서 클라이언트가 `progress.send`로 바로 예측하고 서버가 같은 핸들러로 확정합니다.

| 커맨드 | Opcode | 하는 일 |
| --- | --- | --- |
| `BattleSettle` | 101 | 체크포인트부터 `now`가 든 틱까지 돌려 그 틱의 상태로 확정합니다(`battle`, 처치마다 받은 보상과 레벨업에 쓴 경험치를 반영한 `items`, 클리어가 있었으면 `stage`, 레벨이 올랐으면 `hero`도). 지난 틱이 없으면 상태를 바꾸지 않습니다. 체크포인트가 없거나(`at`이 0, 마이그레이션) `now - at`이 `MAX_SETTLE_TICKS × TICK_MS`를 넘으면(`isStaleCheckpoint`) 돌리지 않고 그 공백의 오프라인 보상(아래)을 지급하고 그 경험치로 바로 레벨을 올린 뒤 `now`에서 새 사냥을 시작합니다(`waves`, `autoBoss`, `nextId`는 유지). |
| `BossChallenge` | 102 | `BattleSettle`처럼 그 틱까지 확정한 뒤 `autoBoss`를 켭니다. 싸우던 웨이브는 그대로 이어지고 다음 경계에서 보스가 나옵니다. 보스가 없는 스테이지에서는 확정만 합니다. |
| `StageSelect` | 100 | 그 틱까지 확정한 뒤 `now`에서 그 스테이지의 새 사냥을 시작합니다(`waves = 0`, `autoBoss` 켬, 난수 상태와 `nextId`는 이어 받음). 싸우던 웨이브를 버리는 화면 전환이라 `now`에서 끊습니다. 같은 스테이지면 확정만 하고, 다른 스테이지가 잠겼으면 `StageLocked`로 거절합니다(아래 해금). |

`PlayerState`에 `battle`이 생겨 `PROTOCOL_VERSION`이 2, 저장 형식이 2가 되었고, 보유량 `items`가 `currencies`와 `profile.exp`를 대신해 둘 다 3이 되었습니다(아래 보상과 보유량). 레벨업, 오프라인 보상, 해금은 모양을 바꾸지 않지만 규칙이 바뀌어 `PROTOCOL_VERSION`만 5였고(아래 레벨, 해금, 오프라인 보상), 장비(`equipment`)가 생겨 `PROTOCOL_VERSION`이 6, 저장 형식이 4였고(아래 장비), 치트로 7, 튜토리얼(`tutorial`)이 생겨 `PROTOCOL_VERSION`이 8, 저장 형식이 5였고(아래 튜토리얼), 웨이브 전투로 `BattleState`의 모양이 바뀌어 `PROTOCOL_VERSION`이 9, 저장 형식이 6이었고, 효과로 `hero.effects`가 생겨 `PROTOCOL_VERSION`이 10, 저장 형식이 7이었고, 발사체는 모양을 바꾸지 않지만 예측 규칙이 바뀌어 `PROTOCOL_VERSION`만 11이었고, 소환수로 `summons`가 생겨 `PROTOCOL_VERSION`이 12, 저장 형식이 8이었고, 골드 강화로 `statUpgrades`가 생겨 `PROTOCOL_VERSION`이 13, 저장 형식이 9였고, 스킬로 `skills`가 생겨 `PROTOCOL_VERSION`이 14, 저장 형식이 10이었고, 장비 강화로 인스턴스에 `enhance`가 생겨 `PROTOCOL_VERSION`이 15, 저장 형식이 11이었고, 환생으로 `rebirth`가 생겨 `PROTOCOL_VERSION`이 16, 저장 형식이 12입니다(아래 골드 강화, 스킬, 강화와 합성, 환생). 옛 클라이언트는 4000으로 닫혀 업데이트해야 합니다. 7 → 8 마이그레이션은 빈 `summons`를 넣습니다(그전 체크포인트에는 소환수가 없음). 6 → 7 마이그레이션은 영웅에 빈 `effects`를 넣습니다(그전 체크포인트에는 효과가 없음). 효과 없는 체크포인트는 9바이트, 겹 하나는 38–46바이트가 늘어 중반 계정의 체크포인트가 93 → 102바이트, 저장 데이터 전체가 315 → 324바이트입니다(지금 데이터에서는 경계에 영웅의 효과가 남는 일이 드뭅니다). 5 → 6 마이그레이션은 몬스터 사망 경계의 체크포인트가 웨이브 사이와 같으므로 `heroHp`와 `cooldowns`를 `hero`로 옮기고 `nextId`를 1로 둡니다. 처치 수(`kills`)는 게임 데이터 없이 웨이브 수로 바꿀 수 없어 `waves: 0`부터 다시 셉니다(잃는 것은 목표의 웨이브 수 이하, 1분 남짓의 사냥). `mode`, `at`, `rng`, `autoBoss`는 그대로라 오프라인 보상과 보스 차례가 이어집니다. 체크포인트는 MessagePack으로 81바이트에서 93바이트, 저장 데이터 전체는 303바이트에서 315바이트가 되었습니다(중반 계정). 1 → 2 마이그레이션은 `at: 0`인 체크포인트를 넣고, 첫 정산이 이를 상한을 넘은 공백으로 보고 오프라인 보상 없이 지금부터 새 사냥을 시작하므로 마이그레이션에 게임 데이터가 필요 없습니다. 서버의 요청 처리는 전투를 따로 알지 않습니다. 새 커맨드도 `runCommand`를 지나므로 한 번만 처리하기, revision 충돌 재시도, 바뀐 슬라이스만 보내기가 그대로입니다.

**클라이언트**

- **전투 서비스**(`application/battle/battle.ts`, `app.battle`): `player.battle`의 체크포인트에서 `startBattle`로 시작한 전투를 쥡니다. 화면이 프레임마다 부르는 `advance()`가 `Clock.now()`(서버 시간 추정)까지 틱을 진행해 이벤트를 돌려줍니다. 애플리케이션 층은 타이머를 쓰지 않으므로 프레임이 시간을 밉니다. 보이는 전투는 프레임마다 바뀌어 앱 상태에 넣지 않고, 앱 상태에는 저장된 체크포인트만 있습니다. 대신 `advance()`가 끝날 때마다 지금 모습을 `snapshot` 신호(`ReadonlySignal<BattleSnapshot | undefined>`)에 쓰고, 로그인 전이거나 세션이 끝나 저장 데이터가 치워지면 `undefined`입니다. 첫 프레임에는 화면이 배우를 세우도록 `reset` 이벤트 하나로 시작합니다.
- **저장 데이터가 바뀔 때**: 전투는 체크포인트, 스테이지, 레벨, 보유량, 장비, 스킬을 모두 읽으므로 저장 데이터(`player`)가 바뀌면(정산 확정·거절, 재개, 스테이지 선택, 착용, 스킬 배우기·장착·해제·레벨업) 새 체크포인트에서 시작한 전투를 보이는 전투와 같은 서버 시각까지 조용히 진행해 `pathSignature()`를 비교합니다. 같으면 조용히 바꾸고, 다르면 바꾸고 `reset`을 냅니다(`[battle] reset` 로그). `pathSignature()`는 전투 내부 상태 전체의 문자열(`signature()`)에서 `autoBoss`만 뺀 것입니다. `signature()`에 레벨과 입은 장비는 있고 보유량과 가지기만 한 장비는 없습니다. 길을 바꾸는 것은 레벨과 착용뿐이라, 저장된 보유량만 다르면 조용히 바꿉니다. `autoBoss`는 다음 경계에서만 쓰이므로, 보스 도전이 보이는 전투를 끊지 않습니다. 한 프레임에 2초(`CATCH_UP_TICKS`, 20틱)를 넘게 밀리면(앱이 멈췄다 돌아옴) 이벤트 없이 따라잡고 `reset` 하나만 냅니다. 저장 데이터가 바뀔 때 보이는 전투가 그만큼 넘게 밀려 있으면(로그아웃 동안 프레임이 멈춤) 그 전투는 돌리지 않고 바로 바꾸고 `reset`을 냅니다.
- **곧 올 공격**(`upcoming(ms)`, 61): 공격 클립에는 타격 프레임 전의 선딜레이(공격 1/6초, 시전 0.2초, 보스 전용 0.375초)가 있는데 타격 틱은 시뮬레이션이 정하므로, 연출은 공격을 그만큼 먼저 알아야 합니다. 서비스는 보이는 전투와 같은 체크포인트에서 시작한 예측 전투를 하나 더 쥐고 `now + ms`까지 앞질러 진행해, 그 사이의 공격을 공격자, 스킬, 타격까지 남은 시간(`inMs`)으로 돌려줍니다. 시뮬레이션이 결정적이라 입력이 없으면 보이는 전투와 같은 길이고, 보이는 전투가 바뀌면(저장 데이터, reset) 그 체크포인트에서 다시 만들어 보이는 전투의 틱까지 조용히 진행합니다. 이미 알린 서버 시각까지와 지나간 시각의 공격은 빼므로 공격마다 한 번입니다(정산으로 보이는 전투가 바뀌는 70초 동안 모든 공격을 한 번씩 알리는 테스트). 길이 바뀌면(스테이지 선택처럼 reset이 나는 경우) 알린 공격이 오지 않을 수 있고, 그때는 reset이 배우를 다시 세웁니다. 비용은 같은 전투를 한 번 더 돌리는 것이라 프레임마다 틱 한두 개이고, 다시 만들 때 체크포인트부터 지금까지 한 번 돕니다(중반 계정 60초에 0.10 ms, 아래 비용. 저장 데이터가 바뀔 때 비교용 전투를 돌리는 것과 같은 크기).
- **지연과 reset**: 클라이언트는 커맨드를 예측한 시각을 함께 보내고 서버는 그 시각(1초 전부터 0.5초 뒤까지, 위 프로토콜)에 확정하므로, 보통의 지연이면 확정이 예측과 같아 화면을 다시 맞추지 않습니다. 범위를 넘거나 서버가 거절하면 확정한 체크포인트로 `reset` 한 번에 맞춰지고, 마이그레이션한 저장 데이터의 rng 0은 두 쪽에서 다르게 시드되어 같은 길로 맞춰집니다.
- **정산 시점**: 보스가 끝나거나(`bossEnd`) 스테이지를 클리어한(`stageClear`) 프레임에 바로 `BattleSettle`을 보냅니다. 이벤트 없이 따라잡은 구간에서 일어난 것도 포함합니다. 그 밖에는 마지막 정산을 보낸 뒤 60초가 지난 프레임에 보냅니다. 이미 정산할 때로 본 결말은 다시 세지 않으므로, 실패한 정산이 되돌린 체크포인트에서 같은 결말을 다시 지나도 60초 주기를 기다립니다. 체크포인트가 낡았으면(`isStaleCheckpoint`) 전투를 돌리지 않고 첫 프레임에 바로 정산합니다. 이 정산이 오프라인 보상을 줍니다(아래). 정산이 오가는 동안에는 겹쳐 보내지 않습니다.
- **오브젝트 풀**(`presentation/pool.ts`): `createPool(scope, hooks)`가 돌려주는 `Pool<T>`는 `acquire()`로 쉬는 것을 꺼내고(없으면 `hooks.create()`로 만들고) `release()`로 비활성으로 돌려놓습니다. 스코프가 닫히면 만든 모든 것을(쓰는 중인 것 포함) 한 번씩 없애고, 만드는 사이 닫혔으면 `acquire`는 `undefined`입니다.
- **전투 연출자**(`presentation/world/battle-director.ts`): `BattleDirector.frame()`이 `battle.advance()`의 이벤트를 화면 지시(`Direction`: reset, monsterAppear, move, attack, hit, death, retreat, revive, banner, background, cover, levelUp)로 바꿔 돌려줍니다. 스테이지를 깨고 다음 스테이지로 넘어가면(`stageClear`의 `nextId`) 그 스테이지의 배경으로 바꾸는 `background`를 냅니다. 배경은 reset 때만 바뀌었어서, 저절로 넘어간 스테이지에서 앞 스테이지의 배경이 남았습니다. `move`는 프레임 끝 스냅숏에서 자리나 걷기가 바뀐 배우만 담습니다(보스 시작·종료, 클리어, 레벨업은 영웅을 최대 HP로 되돌리므로 글자 뒤에 revive를 더함). 배우는 전투원 id로 가리키고, 범위 공격은 맞은 대상마다 hit 하나이며 그 대상의 최대 HP(프레임 끝 스냅숏)로 비율을 냅니다. 효과음은 공격마다 하나이고, 맞은 대상이 없는 스킬(버프·회복)에는 내지 않습니다. 공격하는 배우의 attack 지시(클립, 타격까지 초)는 같은 프레임에 `upcoming(ATTACK_LEAD_MS)`(0.5초, 가장 긴 선딜레이보다 김)이 알린 공격에서 미리 내고, 실제 공격 이벤트는 맞은 대상의 hit만 냅니다. 그래서 공격자의 타격 프레임과 맞은 쪽의 깜빡임·피해 숫자가 같은 틱에 옵니다. 클립은 기본 공격(재사용 대기 0인 스킬, 그런 스킬이 없으면 skillId 0)이 `attack`, 스킬이 `cast`, 보스의 스킬이 `special`입니다(shortcut: 스킬마다 다른 클립이 필요하면 Skills 테이블에 열을 둠). 배우의 모습(`ActorLook`)은 클립 묶음(영웅은 `Heroes.clips`, 몬스터는 `Monsters.clips`, 비면 임시 `monster`·`boss`), 몸에 입히는 색, 크기입니다. 발사체 스킬은 쏠 때(`attack`, hits가 빔) 공격 클립만 재생하고(타격 프레임이 쏘는 틱에 옴) 피해 글자와 소리는 떨어질 때(`impact`) 냅니다. 발사체, 소환수, 효과, 지속 피해, 웨이브의 지시는 아래 전투 연출(64)입니다. 소환수의 사망은 처치가 아니라 처치음을 내지 않습니다(reset 앞에 나온 소환수는 스냅숏에서 읽음). 그림이 없는 일반 몬스터의 색은 ID로 정하고 보스는 붉은색입니다. 몸 크기는 `Monsters.size`로 정하며 비어 있으면 일반 1, 보스 1.6을 씁니다. 피해 문구는 `formatBig`이고 치명타는 `!`가 붙으며 크고 노랗게 보입니다.
- **전투 HUD**: 메인 뷰모델(`presentation/view-models/main.ts`)이 전투 서비스의 `snapshot` 신호로 `hud`의 `waves`(사냥 중에는 깬 웨이브 수/목표, 보스 중에는 "보스"), `bossTime`, `canChallenge`(각각 `ReadonlySignal`)를 `computed`로 계산하고, 보스 도전(`challenge()`)도 여기 있습니다. 스냅숏이 없으면(로그아웃, 재로그인) HUD는 비고 보스 버튼은 숨습니다. 보스 해골은 사냥 중이고 `autoBoss`가 꺼졌고 웨이브 수가 찼고 보스가 있을 때 눌리고 빛살이 돕니다.
- **전투 월드**(`unity/views/battle.ts`, `unity/world.ts`): 월드 뷰가 프레임마다(`EVERY_FRAME`) `BattleDirector`의 `frame()`을 부르고(정산도 여기서 나갑니다) 지시를 `ActorView`, `EffectIcons`, `ProjectileView`, `FloatingText` 호출로 옮깁니다. 배우(`Battle/Actor`, ViewRefs 항목 `actor`와 `effects`), 발사체(`Battle/Projectile`), 데미지 텍스트(`Battle/DamageText`)는 풀에서 꺼내고, 한 프레임에 배너가 여럿 오면(보스 처치, 클리어, 다음 웨이브) 0.6초 간격으로 차례로 띄우고(`BANNER_GAP_MS`), 데미지 텍스트는 0.8초 뒤, 쓰러지거나 물러난 몬스터와 소환수는 0.3초 뒤, 떨어지기 전에 사라진 발사체는 0.15초 뒤(떨어진 것은 바로)에 풀로 돌려놓습니다. 화면은 영웅을 기준으로 그립니다. 영웅은 늘 화면 x -2에 서서 제자리에서 걷고, 다른 배우의 화면 x는 시뮬레이션의 x에서 영웅의 x를 뺀 거리만큼 떨어진 자리이며, 영웅이 앞으로 걸은 만큼 배경이 흐릅니다(`StageView.Scroll`). 그래서 영웅이 걸으면 서 있는 적도 화면에서 그만큼 다가오고, 경계에서 영웅이 0으로 돌아가는 것은 화면에 보이지 않습니다. y는 화면이 정하는 줄입니다. 시뮬레이션에서는 같은 자리에 겹쳐 서므로 적은 나온 차례대로 비어 있는 첫 줄(y 0, 0.9, -0.9, 0.45, -0.45)에, 영웅 편 소환수는 (0.9, -0.9, 0.45)에 서고, 다 차면 겹칩니다. 새 몬스터는 영웅 앞 5.5(화면 x 3.5, 오른쪽 밖)에 나타나고, `move` 지시마다 한 틱(0.1초) 동안 새 x로 옮겨 가며(`ActorView.MoveTo`) 걷는 동안은 걷기 클립입니다. 프레임이 여러 틱을 건너뛰어 0.5보다 멀리 옮겨지면 초당 6유닛으로 걸어갑니다. 영웅 편은 오른쪽, 적은 왼쪽을 보고 그쪽으로 찌릅니다. 꺼내기가 비동기라 지시는 차례대로 적용합니다. 뷰는 결과를 바꾸지 않습니다.
- **C#**: `WorldFacade`(`Create`, `SetActive`, `Destroy`)가 처음 쓸 때 `DontDestroyOnLoad` 월드 루트(`BattleWorld`)와 그 아래 직교 카메라(세로 반높이 5유닛, 단색 배경. 기준 9:16보다 길쭉한 화면은 가로를 그대로 두고 위아래를 더 보이고, 더 넓은 화면은 오른쪽 끝을 그대로 두고 왼쪽(영웅 뒤)을 더 보여 영웅 앞에서 나오는 몬스터가 어느 비율에서나 화면 밖에서 나옴)를 만들고 불러온 프리팹의 인스턴스를 올립니다. UI 캔버스(Screen Space Overlay)는 그 위에 그려집니다. `ActorView`(`Setup(clips, r, g, b, size, facing)`, `Place`, `MoveTo(x, y, seconds, walking)`, `Attack(clip, impactSeconds)`, `Hit(hpRatio)`, `SetHp(hpRatio)`, `Die`, `Leave`, `Revive(hpRatio)`)는 발밑 그림자, 클립을 재생하는 몸과 HP 바, 그 위의 효과 칸(`EffectIcons`)이고, `ProjectileView`(`Fly`, `Fizzle`)는 날아가는 발사체이고, `FloatingText`(`Show`)는 월드 글자(TextMeshPro)가 0.8초 동안 위로 뜨며 사라집니다. 띄울 때 글자 폭을 월드 카메라의 가로 범위와 견주어, 화면보다 넓으면 줄이고 가장자리를 넘으면 안쪽으로 옮깁니다(화면 왼쪽 x −2에 서는 영웅 위의 레벨업 글자, 긴 영어 배너). 몸의 프레임은 `SpriteAnimator`가, 움직임(자리 옮기기, 바라보는 쪽으로 찌르기, 깜빡임, 사라짐)은 `Update`의 짧은 보간이 그리고 TS는 상태를 바꾸는 호출만 합니다. HP 바의 흰 사각형과 그림자의 가장자리가 흐린 원 스프라이트는 실행 중에 한 번 만들고(`ShapeSprites`. 그림자는 몸 크기를 따라 접지선에 놓이고 모든 몸 아래에 그려짐), 프리팹 `Remote/Battle/Actor`, `Projectile`, `DamageText`는 에디터의 `Tools/Battle/Build Prefabs`(`BattlePrefabs`)가 코드로 만듭니다.
- **전투 연출**(64): 57–59의 이벤트를 화면에 보입니다. 연출자의 지시와 뷰가 하는 일은 아래와 같습니다.
  - **발사체**: `launch`가 대상마다 발사체 하나를 쏘는 지시(`launch`: 모습, 나는 시간)가 되고, 뷰가 쏜 배우의 몸 가운데 0.2유닛 위에서 대상 자리로 곧게 날립니다(`ProjectileView.Fly`, 날아가는 쪽을 향해 돎). 운석은 대상 위에서 떨어집니다. `impact`는 발사체를 바로 거두고(같은 프레임의 hit가 피해를 보임) `vanish`는 0.15초 동안 작아지며 사라지게 합니다(`Fizzle`). 모습(`ProjectileLook`)은 `Projectiles`의 `clip`(`projectiles` 묶음의 arrow·orb·blob·rock), `color`(그림에 입히는 r, g, b), `size`, `fromAbove`(대상 위에서 떨어지는지)이고, 표에 없는 발사체는 회색 구입니다. 날아가는 사이 대상이 자리를 옮겨도 처음 자리로 날아갑니다.
  - **소환수**: `summon`이 `summonAppear`가 되어 소환자의 자리에 나타나 그 진영의 비어 있는 첫 줄에 서고, 그 뒤로는 시뮬레이션의 자리를 따라 걷습니다(`summon` 묶음은 몬스터의 몸으로 오른쪽을 봄). 소환수를 가리키는 공격·피격·사망 지시는 다른 배우와 같이 보이고, `expire`는 0.3초 동안 흐려지며 물러납니다(`summonLeave`, `ActorView.Leave`).
  - **효과 칸**: 프레임마다 스냅숏의 효과를 전투원마다 지난 프레임과 견주어, 종류·차례·겹 수가 바뀌었거나 남은 시간이 늘었으면(다시 걸림) 그 배우의 칸 전체를 다시 보입니다(`effects` 지시). 칸은 HP 바 위의 한 줄(최대 넷, 넘치면 잘림)이고, 색은 이로운 능력치 초록, 해로운 능력치(공격 간격이 늘면 해로움) 빨강, 지속 피해 보라, 회복 연두, 기절 노랑, 보호막 하늘, 정화 회색입니다. 칸 아래 막대가 처음 지속 시간에 대한 남은 시간의 비율로 줄어들고, 남은 시간은 C#이 셉니다. reset이면 모든 배우의 칸을 다시 보이고, 쓰러지거나 물러나면 칸을 지웁니다. 겹 수는 보이지 않습니다(shortcut).
  - **지속 피해·회복**: `effectTick`이 `dot` 지시가 되어 HP 막대를 깜빡임 없이 바꾸고(`SetHp`) 작은 숫자를 몸의 오른쪽 옆에 띄웁니다(피해는 보호막이 막은 양을 뺀 양으로 보라, 회복은 `+`를 붙여 연두). 이것으로 57의 "지속 피해의 HP는 다음 타격까지 막대에 보이지 않음"이 없어졌습니다.
  - **웨이브**: `waveStart`가 가운데 배너 "웨이브 n/m"(`battle.wave`)이 됩니다. 보스 웨이브는 지금처럼 "보스 등장!"입니다.
  - **장면 전환**: 장면이 바뀌는 때는 무대를 막으로 덮었다가 걷어 팍 바뀌지 않게 합니다. 배경이 바뀌면(스테이지 클리어의 `background`, 스테이지를 옮긴 reset) `StageView.Show`가 무대를 0.3초 동안 검게 다 덮고, 다 덮인 순간에 그림을 바꾸고, 0.15초 머문 뒤 0.45초 동안 걷습니다. 처음 보이는 배경과 같은 배경은 덮지 않습니다. 보스전이 시작하면(`bossStart`) 연출자가 `cover`(검붉은색)를, 보스에게 지면(`bossEnd`의 패배) `cover`(검은색)를 내고 뷰가 `StageView.Cover`로 같은 시간만큼 무대를 다 덮었다가 걷습니다. 그래서 보스가 나오는 순간이나 물러나는 순간은 보이지 않습니다. 보스를 이기면 처치의 히트스톱·흔들림과 이어지는 배경 전환이 있으므로 덮지 않습니다. 마지막 스테이지(지금은 용의 둥지 3006)는 다음 스테이지가 없어서, 보스를 이기면 클리어 보상을 받고 같은 스테이지에서 사냥을 이어 갑니다(배경도 그대로). 막은 배우·발사체·파티클 위, 글자 아래(정렬 순서 8)라서 "보스 등장!", "클리어" 같은 배너는 막 위에 보이고, 월드 시간으로 흘러 히트스톱 동안 함께 멈춥니다. 걷혀 있으면 렌더러를 꺼서 화면 전체를 덮는 투명한 사각형을 그리지 않습니다. reset에서 사라진 배우는 바로 풀로 돌리지 않고 0.3초 동안 흐려지며 물러난 뒤(`ActorView.Leave`) 돌려서, 스테이지를 옮길 때 적이 막이 덮이는 동안 사라집니다.
  - **reset**: 스냅숏의 소환수를 세우고, 날던 발사체를 남은 시간만큼 다시 날립니다(쏜 배우 자리에서 다시 출발). 처음이 아닌 reset(강화·착용 뒤처럼 장면이 이어짐)에서 월드 뷰는 남아 있는 배우와 발사체를 그대로 두고 HP(`SetHp`)와 자리만 맞추며, 사라진 것은 거두고 새로 생긴 것만 세웁니다. 세운 영웅은 다시 세우지 않고 쓰러졌을 때만 `Die`, 일어났을 때만 `Revive`입니다.
  - **임시 그림**: 발사체 넷(`projectiles` 묶음, 24×24 픽셀이 1유닛)과 미지원 소환수의 대체 몸(`summon` 묶음)은 61의 `ActorClips`가 함께 그립니다. 효과 칸은 단색 사각형입니다.
  - **확인**: Unity 플레이 모드에서 새 계정(1레벨, 3001)으로 화살·화염구(대상 셋)가 날고, 화상의 보라 칸과 지속 피해 숫자, 늑대, "웨이브 1/3" 배너가 보이는 것을 봤습니다. 강한 계정은 몬스터가 한 번에 쓰러져 효과가 걸리지 않습니다.
- **스프라이트 애니메이션**(61): 클립(`SpriteClip`: 상태 이름, 프레임, 초당 프레임, 반복, 타격 프레임)을 배우 종류마다 하나인 묶음(`SpriteClipSet` 에셋, 이름이 `Setup`의 키)에 두고, 몸의 `SpriteAnimator`가 프레임이 바뀔 때만 `SpriteRenderer.sprite`를 씁니다. 상태는 대기(`idle`, 반복), 걷기(`walk`, 걷는 동안 반복), 등장(`enter`, 걷기를 그리기 전의 몬스터 그림이 걷기 대신 씀), 공격(`attack`), 시전(`cast`), 피격(`hit`), 사망(`die`, 마지막 프레임에 멈춤), 보스 전용(`special`)이고, 묶음에 없는 시전·보스 전용은 공격으로, 걷기는 등장으로, 그 밖에는 대기로 대신합니다. 무엇을 언제 재생할지는 `ActorView`가 정합니다. 한 번 재생하는 클립이 끝나면 바탕 클립(대기·걷기)으로 돌아가고, 피격 클립은 공격 클립을 끊지 않으며, 사망은 예약한 공격을 버립니다.
  - **타격 맞추기**: `Attack(clip, impactSeconds)`는 타격 프레임이 그만큼 뒤에 오게 클립을 시작합니다. 남은 시간이 선딜레이보다 길면 기다리고, 짧으면(늦게 알았다) 앞 프레임을 건너뛰어 시작하며, 찌르기도 타격 때 가장 멀리 나가게 맞춥니다. 같은 배우의 공격이 붙어 오면(보스 전용 0.1초 뒤의 기본 공격) 앞 공격의 타격 프레임을 0.05초는 보인 뒤 다음 클립을 늦은 만큼 건너뛰어 시작합니다. 플레이 모드(에디터 약 30 fps)에서 타격 프레임이 보인 때부터 맞은 쪽이 깜빡일 때까지 100번 재면 중앙값 33 ms(16–50 ms), 곧 한 프레임쯤입니다.
  - **배우 방향**: 그림이 있는 배우와 임시 몬스터·보스·소환수의 원본은 모두 오른쪽을 봅니다. `ActorView.Setup`의 `facing`이 음수면 몸의 `SpriteRenderer.flipX`만 켜고, 0 이상이면 끕니다. TS 전투 뷰가 아군은 1, 적은 -1을 넘기며, 같은 배우를 풀에서 다시 꺼내도 방향을 다시 설정합니다. HP 바·효과 아이콘·루트 좌표는 반전하지 않고, 찌르기 이동도 같은 방향 값을 사용합니다. 발사체는 원래 오른쪽 원본을 비행 방향으로 회전합니다.
  - **영웅 그림**: 왼손 검 기준 그림을 7색의 평평한 색면으로 적용했습니다. 검은 왼손에 유지하며 오른손으로 시전합니다. 공격 2·3프레임에 장갑을 보이고, 타격 때 빈 오른손이 짧은 팔과 이어집니다. 시전은 오른팔을 짧게 굽혀 몸 앞쪽에 합니다. 사망은 비틀거림·한쪽 무릎 짚기·옆으로 쓰러짐의 세 자세이며, 검은 끝까지 왼손에 유지합니다. `Assets/Battle/Actors/hero/`의 클립별 한 장(256×256 프레임을 가로로 이음, 출처는 [docs/art.md](docs/art.md))을 `ActorArt`(`Assets/Editor/Battle/ActorArt.cs`)가 임포트 설정과 프레임 자르기(이름이 같은 프레임은 같은 스프라이트 ID)까지 맞추고, `ActorClips`가 그 프레임으로 `hero` 묶음을 만듭니다. 대기의 몸이 150픽셀이라 150픽셀이 1유닛이고 발이 프레임 아래 4분의 1에 있어, 임시 그림과 같은 자리에 같은 크기로 섭니다. 클립은 대기, 걷기(4프레임, 초당 8), 공격, 시전, 피격, 사망의 여섯이고, 초당 프레임과 타격 프레임은 임시 클립의 명세를 그대로 씁니다. 영웅의 묶음과 크기는 `Heroes.clips`(`hero`)·`Heroes.size`(1)가 정하고, 연출자가 reset 지시의 `hero.look`에 실어 월드 뷰가 그대로 세웁니다. 그림이 있는 배우는 색을 입히지 않으므로 피격 깜빡임은 흰색이 아니라 붉은색입니다.
  - **몬스터·보스·소환수 그림**: 일반 몬스터 8종, 보스 2종, 정령 늑대에 단색 그림을 적용했습니다. `Monsters.clips`가 묶음과 `Assets/Battle/Actors/<이름>/` 폴더의 이름이고, `Monsters.size`가 표시 배율입니다. 초록 슬라임 0.45, 숲 멧돼지 0.65, 고블린 3종 0.75, 독 슬라임 0.5, 바위 골렘 1.05, 서리 늑대 0.8, 오우거 대장 1.65, 화염 드래곤 1.9입니다. 소환수는 `Summons.clips`·`Summons.size`(정령 늑대 `spirit_wolf`·0.9배)를 쓰고, 영웅 편과 적 편이 같은 모습입니다. 그림에는 색을 덧입히지 않습니다. `ActorClips`는 그림 폴더마다 대기·등장·걷기·공격·피격·사망을 만들고, `special.png`가 있으면 특수 공격도 더해 `Actor.prefab`에 연결합니다. 일반·소환수는 17프레임, 보스는 22프레임이고 보스 특수 공격 타격은 4번째입니다. `ActorArt`는 시트 높이로 256 또는 384px 정사각 프레임을 정하며, 대기 몸 높이 150px·PPU 150·중심보다 64px 아래의 접지선·NPOT 유지·압축을 적용합니다. `Actor.prefab`이 모든 묶음을 참조해 전투 화면이 떠 있는 동안 시트 74장이 한꺼번에 올라가므로, 무압축(RGBA32)이면 약 87 MiB인 것을 압축해 약 10 MiB(Android·iOS ASTC 6×6)로 둡니다. 에디터(Android 대상)에서 잰 값은 CPU 사본까지 세어 175 → 19.6 MiB이고, 디코드한 시트와 원본 PNG의 PSNR은 평균 43.3 dB, 가장 낮은 시트(오우거 대장 특수 공격) 39.5 dB입니다. 걷기가 있으면 등장은 재생하지 않습니다. [그림·크기·동작 미리보기](art/concepts/remaining-actors-2026-10-28/preview.html).
  - **임시 그림**: 그림 키가 없거나 아직 지원하지 않는 배우를 위한 대체 묶음으로 `Assets/Battle/Clips`의 `monster`, `boss`, `summon` 묶음을 `ActorClips`(`Assets/Editor/Battle/ActorClips.cs`)가 코드로 그립니다. 프레임은 24×24 픽셀이고 14픽셀이 1유닛이며, 흰 몸에 어두운 눈과 표시(휘두름, 반짝임, 가시, 포효)를 그려 `Setup`의 색이 몸에만 입혀집니다. 원본은 모두 오른쪽을 보며, 전투에서는 방향 값으로 몸을 반전합니다. 텍스처와 스프라이트는 묶음 에셋의 하위 에셋이고 `Tools/Battle/Build Prefabs`가 프리팹보다 먼저 다시 그립니다. 배우 프리팹이 묶음을 모두 쥡니다(shortcut, 시트가 늘면 키로 불러옴).
  - **Animator Controller와 비교**: `Tools/Battle/Measure Sprite Animation`(플레이 모드)이 배우 N개를 렌더러만, `SpriteAnimator`, Animator(같은 클립을 스프라이트 키프레임으로 반복하는 상태 하나)로 세워 300프레임씩 메인 스레드 시간을 잽니다. 재는 것은 스크립트 Update(`BehaviourUpdate`, 게임의 TS 틱도 들어 있어 렌더러만인 기준을 뺌)와 Animator의 메인 스레드 구간(`DirectorUpdateAnimationBegin`·`End`)입니다. 아래는 두 번 잰 범위이고 배우 하나당 µs(괄호는 프레임당 합)입니다(Apple M4 Max, 에디터 코드 최적화 Release, 영웅의 공격 클립 12 fps 반복).

    | 배우 수 | SpriteAnimator | Animator(메인 스레드만) |
    | --- | --- | --- |
    | 10 | 3.0–11.6 µs (0.03–0.12 ms) | 5.7–13.1 µs (0.06–0.13 ms) |
    | 100 | 1.7–2.9 µs (0.17–0.29 ms) | 3.0–3.6 µs (0.30–0.36 ms) |
    | 1,000 | 1.05–1.11 µs (1.05–1.11 ms) | 1.75–1.82 µs (1.75–1.82 ms) |

    10개는 TS 틱의 흔들림(0.09–0.17 ms)이 차이보다 커서 둘 다 0.1 ms 안팎이라는 것만 뜻이 있습니다. Animator는 워커 스레드 비용이 더 있고, 배우 1,000개에서 메인 스레드만 봐도 약 1.6배입니다. 이 전투의 배우는 영웅, 적 웨이브, 소환수(59)를 더해 열 개 안팎이라 비용으로는 둘 다 괜찮고, 구조로 `SpriteAnimator`를 골랐습니다. TS의 상태 호출이 그대로 클립 이름이고, 타격에 맞춰 중간부터 시작하는 것이 `Play(clip, time)` 하나이며, 새 배우 종류는 묶음 에셋 하나입니다. Animator라면 배우 종류마다 컨트롤러(또는 Override Controller)와 상태 전이를 에셋으로 두고, 중간부터 시작은 정규화 시간으로 바꿔 넘겨야 합니다. 빌드(IL2CPP)의 C# Update는 에디터보다 빠를 것이지만 재지 않았습니다(70).

- **타격감**(65): 연출자가 이벤트에서 지시를 더하고 뷰가 월드와 무대(`Battle/Stage`)로 옮깁니다.
  - **히트스톱과 흔들림**: 맞은 대상이 있는 치명타는 `hitStop` 0.05초와 `shake`(0.06유닛, 0.12초), 보스 처치는 0.15초와 (0.25유닛, 0.4초), 보스에게 맞은 영웅과 쓰러진 영웅은 흔들림(0.12유닛, 0.2초)만입니다. 보스는 연출자가 `spawn`의 `boss`와 reset 스냅숏으로 알아 둡니다. C#의 `HitFeel`(월드 카메라, `WorldFacade.Shake`·`HitStop`)은 히트스톱을 `Time.timeScale` 0으로 하므로 deltaTime으로 움직이는 배우·발사체·글자·파티클이 함께 멈추고, 흔들림과 멈춤은 unscaled 시간으로 잽니다. 멈춘 동안과 끝난 뒤 0.25초 안의 히트스톱은 받지 않고(치명타가 이어져도 전투가 끊겨 보이지 않게), 한 번에 0.3초를 넘지 않으며, 흔들리는 중에는 더 센 흔들림만 받습니다. UI의 굴러가는 수와 토스트도 그동안 멈추지만 0.3초 안이라 보이지 않습니다.
  - **파티클**: `hit`에 스킬 속성의 불꽃 색(`sparks`: 물리 흰 노랑, 불 주황, 얼음 하늘, 독 초록, 신성 금색)이 실리고, 뷰가 맞은 자리에 6개(치명타 12개), 쓰러진 자리에 회색 조각 16개를 튀깁니다(`StageView.Burst`). 파티클 시스템 하나가 `Emit`으로 자리마다 내뿜으므로 터질 때마다 오브젝트를 만들거나 풀에서 꺼내지 않고, 배우와 같은 스프라이트 재질의 흰 사각형이라 따로 텍스처가 없습니다. 사각형은 0.25–0.5초 동안 사방으로 튀어 떨어지며 줄어듭니다. 영웅이 걸어 배경이 흐르는 동안 `StageView`가 살아 있는 파티클과 땅을 따르는 글자(영웅이 아닌 배우 위의 피해·지속 피해 숫자, `FloatingText.Show`의 `grounded`)를 같은 거리만큼 옮기고, 배너와 레벨업 글자는 화면에 머뭅니다.
  - **배경**: reset 지시가 스테이지의 `Stages.background`를 싣고 뷰가 `StageView.Show`로 그 이름의 배경을 배우 뒤에 보입니다. 바뀔 때는 위의 장면 전환으로 바뀝니다. 배경은 원경(`Assets/Battle/Backgrounds/Far`, 하늘과 먼 풍경, 불투명, 정렬 순서 −11)과 근경(`Near`, 땅과 가까운 소품, 위쪽 투명, −10)의 두 겹이고, 스테이지마다 두 폴더에 같은 이름의 PNG가 한 장씩 있습니다(`meadow`, `forest`, `camp`, `fortress`, `snow`, `lava`, 768×1344 픽셀, 96픽셀이 1유닛이라 8×14유닛, 지평선은 위에서 37–39%). 그림은 Codex로 생성한 `idle/art/backgrounds/<이름>_far.png`, `_near.png`를 옮겨 온 것이고([art.md](docs/art.md)), `Backgrounds`(`Assets/Editor/Battle/Backgrounds.cs`, `Tools/Battle/Build Prefabs`가 부름)가 임포트 설정(쌍선형 필터, 압축, 밉맵 없음, 사각형 메시)을 맞춥니다. 프리팹이 모든 배경을 참조해 한꺼번에 올라가므로 압축하며, Android의 ASTC 6×6이면 한 장 448 KiB, 12장 5.3 MiB입니다(무압축이면 47 MiB). 겹마다 렌더러가 그림 세 장을 가로로 이어 그리고(`SpriteDrawMode.Tiled`, 24유닛, 그래서 메시는 사각형 Full Rect), `StageView.Scroll(distance, seconds)`가 영웅이 걸은 거리만큼 한 틱 동안 근경을 왼쪽으로 밀고 원경은 그 절반(`FarSlowdown` 2)만큼 밉니다. 겹마다 한 장 너비로 접고, 흐른 거리는 원경이 한 장 흐르는 거리(두 장 너비)로 접어 두 겹이 접힐 때 튀지 않습니다. 그래서 그림은 왼쪽과 오른쪽 끝이 이어지고, 성 한 채처럼 하나뿐인 것 없이 되풀이되어도 자연스러운 것만 그립니다. 플레이 모드에서 용의 둥지·얼어붙은 고개·오우거의 요새·고블린 야영지의 두 겹이 스테이지를 옮길 때 함께 바뀌고, 원경이 근경의 정확히 절반을 흐르는 것을 확인했습니다.
  - **확인**: Unity 플레이 모드에서 용의 둥지(3006)의 용암 배경, 늑대와 몬스터 사이의 조각, `bgm.peak`(`Peak`)가 보이고 들렸고, 25초 동안 히트스톱 두 번(`timeScale` 0이 0.05–0.07초)과 흔들림 두 번(0.12초), 파티클 최대 56개를 기록했습니다. 전투 중 드로우콜은 기준 30.2(SetPass 24.6)에서 28.6(21.9)으로 늘지 않았습니다(에디터의 `UnityStats`, 같은 계정·스테이지, 30초). 에디터의 GC 할당은 잴 때마다 몇 배씩 달라 70에서 개발 빌드로 잽니다.

**비용**: 소환수(59) 뒤로 `npm run bench`의 중반 계정(레벨 30, 3005)에서 정산 한 번이 60초에 0.16 ms, 상한인 10분에 0.87 ms, 12시간 오프라인 보상이 1.01 ms, 접속 1시간이 5.5 ms입니다(중앙값. 같은 기계에서 번갈아 잰 59 전은 0.13, 0.60, 0.70, 4.0 ms, 58 전은 0.10, 0.56, 0.65, 3.8 ms, 57 전은 0.08, 0.46, 0.55, 3.3 ms, 56 전은 0.06, 0.20, 0.26, 1.8 ms, [docs/performance.md](docs/performance.md)). 56에서는 적이 셋까지 함께 서서 틱마다 차례가 넷이고 대상을 고르므로 10분 정산이 약 2.2배가 되었고, 57에서는 틱마다 걸린 겹을 세고 지속 피해·버프 스킬이 늘어 약 1.2배가 되었고, 58에서는 발사체마다 이벤트 둘과 틱마다 떨어질 것을 찾는 일이 늘어 약 1.1배가 되었고, 59에서는 늑대 둘이 1초마다 쳐서 공격이 시간당 3,804 → 5,844번(1.54배)이 되어 약 1.45배가 되었습니다(공격 하나당 비용은 그대로). 아래는 56 전에 잰 값입니다. 시뮬레이션은 틱당 약 29–34 ns이고(Apple M4 Max, Node 22.14, 1레벨 영웅의 스테이지 3002 사냥), `settle` 한 번은 600틱(60초)에 약 0.019 ms, 상한인 6,000틱(10분)에 약 0.17 ms입니다. 커맨드 트랜잭션(63 µs, 파일 DB·WAL, 연결 하나에 초당 약 15,800건)에 약 30%가 더해지는 크기라서, 동접 1만 명이 60초마다 정산하면 초당 약 170건이고, 한 건이 약 82 µs(트랜잭션과 시뮬레이션)라서 CPU 약 14 ms, 코어 하나의 약 1.4%입니다(추정). 처치마다(약 3초) 보내면 약 3,300건으로, 트랜잭션만 셈해도 연결 하나 처리량의 약 21%라서 정산을 보스 결말과 60초 주기로 묶었습니다. 정산 사이의 진행은 서버가 체크포인트부터 다시 계산하므로 사라지지 않습니다. 지금 데이터의 보스 없는 스테이지(3001–3003, 3005)는 클리어마다 정산이 하나 나가고, 이 정산은 60초 주기도 다시 시작합니다. 1레벨 영웅은 3001을 13초 안팎에, 3002와 3003을 앞 클리어 뒤 각각 36–55초, 68–82초에 클리어하므로 간격이 주기와 같은 크기이고 첫 스테이지만 짧습니다(3005는 재지 않았습니다. 56 뒤에는 한 시드에서 13.9초, 38.7초, 65.6초에, 57 뒤에는 화염구의 화상으로 65.4초에 클리어합니다). 58 뒤에는 같은 시드가 14.9초, 49.4초, 88.8초이고, 시드 여덟 개의 3003 클리어가 평균 76초에서 85초로 늦어졌습니다. 속사와 화염구가 0.2–0.4초 늦게 맞는 동안 기본 공격이 같은 대상을 쳐서 겹친 피해가 늘기 때문입니다. 59 뒤에는 늑대가 함께 쳐서 같은 시드가 14.0초, 37.8초, 62.8초입니다. 측정 조건과 전체 값은 스펙 2절에 있습니다.

## 보상과 보유량

골드, 경험치, 재료는 모두 `Items` 테이블의 행이고(지금 1 골드, 2 경험치), 플레이어가 가진 양은 저장 데이터의 `items` 슬라이스 하나에 아이템 ID별 `Big`으로 있습니다(`ItemAmounts`, `shared/game-core/src/items.ts`). 키가 없으면 0입니다. 보상도 같은 `ItemAmounts`이고, 받는 길은 `grant(held, reward, data)` 하나입니다(`held`는 `items`와 `equipment`를 묶은 `Holdings`). 골드를 따로 두는 필드(`currencies.gold`)나 경험치 필드(`profile.exp`)는 없습니다. 레벨업은 경험치를 쓰고(아래 레벨), 장비는 수량이 아니라 하나씩 다른 인스턴스라 `equipment` 슬라이스에 받습니다(아래 장비).

| 테이블 | 열 | 뜻 |
| --- | --- | --- |
| `Items` | `cap` (`big?`) | 보유 상한. 빈 칸이면 상한이 없습니다. |
| `Items` | `kind` (`int`, Enum `ItemKind`) | 종류: 1 재화, 2 재료, 3 장비. 가방의 탭이 이것으로 나누고, 장비는 수량이 아니라 인스턴스로 받습니다(아래 장비). 골드와 경험치는 재화입니다. |
| `Monsters` | `rewardItemIds` (`int[]`), `rewardAmounts` (`big[]`) | 처치 보상. 같은 순서이고 길이가 같아야 합니다. |
| `Stages` | `clearItemIds` (`int[]`), `clearAmounts` (`big[]`) | 클리어 보상. 처치 보상과 따로, 클리어할 때마다 줍니다. |

- **지급과 상한**: `grant`는 아이템마다 `floor(보유 + 수량)`을 구하고, 상한이 있으면 `min(그 값, max(보유, cap))`으로 넘친 만큼을 버립니다. 거절하지 않는 것은 전투와 오프라인 보상이 이미 일어난 일이라, 거절하려면 정산을 거절해 진행까지 잃기 때문입니다. 상한이 낮아져 이미 넘게 가진 것은 줄이지 않고, 바뀐 것이 없으면 같은 객체를 돌려주어 슬라이스를 다시 보내지 않습니다. `Items`에 없는 ID는 데이터 오류라서 던지고, 서버는 그 커맨드를 `ServerError`로 답합니다. 수량은 정수이므로 더할 때마다 `Big.floor`로 맞춰 반올림 오차가 쌓이지 않게 합니다. 장비인 행은 수량에 더하지 않고 인스턴스로 받습니다(아래 장비).
- **전투 보상**: 시뮬레이션은 저장된 보유량에서 시작해 처치와 클리어마다 그 행의 보상을 지급합니다(`addReward`, 상한도 그때 적용). 사냥 처치는 그 몬스터의 보상, 보스 승리는 보스의 보상과 클리어 보상, 보스 없는 스테이지의 클리어는 마지막 처치 보상과 클리어 보상입니다. 진 보스는 주지 않습니다. 정산하는 틱의 보유량(`Battle.checkpoint().player.items`)이 그때까지의 전부이고, `settle`이 `battle`, `stage`, `profile`과 함께 그대로 확정합니다. 정산, 보스 도전, 스테이지 선택이 모두 이 길을 지납니다. 상한을 처치마다 적용하는 것은 레벨업이 경계에서 경험치를 쓰기 때문입니다. 번 것을 쌓아 두었다가 정산 때 한 번에 상한을 적용하면, 상한에 걸려 버려질 경험치로 레벨이 오를 수 있습니다. 낡은 체크포인트(10분 넘게 멈춤)는 다시 돌리지 않고 오프라인 보상(아래)을 `grant`로 지급합니다.
- **클라이언트**: 전투 서비스가 `items` 신호(보이는 보유량)를 냅니다. 보이는 전투의 보유량(`BattleSnapshot.items`)이라서 골드가 처치마다 오르고, 정산이 확정해도 값이 튀지 않습니다(확정한 틱의 보유량에서 이어 가므로 같습니다). 스냅숏의 보유량은 다음 처치까지 같은 객체이므로 프레임마다 바뀌는 스냅숏에도 `items`는 처치와 정산 때만 바뀝니다. 보이는 전투가 없으면 저장된 보유량입니다. 메인 화면의 재화 바와 경험치(`Items` 2, 아래 레벨), 가방이 이 신호를 봅니다. 골드 강화, 스킬, 장비 강화는 누른 틱까지 정산한 보유량으로 값을 치르므로 이 `items`가 곧 쓸 수 있는 보유량이고, 화면도 이것으로 살 수 있는지 정합니다.
- **가방**(`UI/InventoryScreen`): 메인 화면의 가방 탭이 아래 판으로 엽니다(메인과 함께 닫히고, 가방 탭을 한 번 더 누르거나 뒤로 가기가 판을 닫습니다). 위쪽의 종류 탭(전체, 재화, 재료: `Items.kind`)으로 거르고, 처음에는 전체입니다. 뷰모델(`presentation/view-models/inventory.ts`)은 고른 종류에서 수량이 0보다 큰 아이템을 ID 순서로 칸(`ItemSlot`: 이름, `formatBig` 수량, 등급 색 번호)으로 내고, 이를 한 줄 5칸의 `ScrollList` 그리드(등급 색 칸 안의 아이콘과 수량, 칸 아래 이름)(위 목록과 탭)가 보입니다. C#은 칸의 글자만 쥐고 무엇을 보일지는 TS가 정합니다. 프리팹(`InventoryScreen`, `InventoryCell`)은 `Tools/UI/Build Inventory Prefabs`(`Assets/Editor/UI/InventoryPrefabs.cs`)가 코드로 만듭니다. 아이템이 골드와 경험치뿐이라 지금은 이 둘이 전체와 재화 탭에 보이고 재료 탭은 비어 있습니다. 탭을 바꿔도 맨 위에 보이던 원소 번호가 남습니다(목록이 그보다 짧으면 끝). 재화는 메인의 재화 바(위 공용 위젯)에도 보이지만, 가방에 재화 탭이 있으므로 가방에서 빼지 않습니다. 가방은 수량(`items`)만 보이고, 장비는 장비 화면(아래 장비)에 있습니다.

**와이어와 저장**: `PlayerState`의 모양이 바뀌어 `PROTOCOL_VERSION`이 3, 저장 형식이 3입니다. 2 → 3 마이그레이션은 `currencies.gold`를 `items[1]`로, `profile.exp`를 `items[2]`로 옮기고(0은 담지 않음) 두 필드를 지웁니다. 이 버전의 `Items` ID를 적어 둔 것이라 게임 데이터가 필요 없습니다. `items`는 정수 키 맵이라 MessagePack에서 키가 문자열(항목당 2바이트)이고, 항목 하나가 17바이트입니다. 골드와 경험치를 담은 `items`는 41바이트로, 옛 `currencies`와 `exp`를 합한 51바이트보다 작습니다(`{ id, amount }` 배열이면 항목당 27바이트). `shared/protocol/test/wire.test.ts`에 `items`를 싣는 응답을 하나 더했고 기존 스냅숏은 그대로입니다.

**비용**: 같은 조건(Apple M4 Max, Node 22.14, 1레벨 영웅의 스테이지 3002 사냥, 60초에 처치 14번)에서 `settle` 한 번이 600틱에 0.018 → 0.021 ms, 6,000틱에 0.175 → 0.199 ms로 약 14% 늘었습니다(처치당 약 0.18 µs). 처음에는 처치마다 보상 행을 맵으로 바꾸고(0.47 µs) 맵끼리 더해(0.53 µs) 1.85배였는데, 행의 두 배열을 쌓인 보상에 바로 더하는 `addReward` 하나로 바꿔 줄였습니다(`Big` 연산 자체는 17 ns). 정산 한 건(트랜잭션 63 µs 포함)은 약 81 → 84 µs이고, 동접 1만 명이 60초마다 정산하면 CPU가 코어 하나의 약 1.38% → 1.42%입니다(추정). 정산마다 `items` 슬라이스(지금 약 41바이트)가 응답에 더해져 1만 명 기준 약 7 KB/s입니다.

## 레벨

영웅 레벨은 영웅 슬라이스의 `hero.level`이고(계정 슬라이스 `profile`에는 로그인 ID만 있음. 계정 레벨 같은 계정의 진행이 생기면 `profile`에 둠), 경험치는 따로 두지 않고 보유량의 `Constants.expItemId` 아이템(지금 `Items` 2)입니다. 레벨업은 커맨드가 아니라 전투의 규칙입니다(`shared/game-core/src/level.ts`의 `levelUp`).

| 테이블 | 열 | 뜻 |
| --- | --- | --- |
| `HeroLevels` | `expToNext` (`big?`) | 이 레벨에서 다음 레벨로 오르는 데 쓰는 경험치. 빈 칸이면 최대 레벨입니다(지금 50). 값은 샘플 곡선 `floor(100 × 1.2^(L−1))`입니다. |

- **언제**: 시뮬레이션이 모든 경계에서 `levelUp`을 부릅니다. 경험치가 지금 레벨의 `expToNext` 이상이면 그만큼 쓰고 레벨을 올리며, 닿는 만큼 여러 번 오릅니다(`levelUp` 이벤트는 마지막 레벨로 한 번). 오르면 능력치를 새 레벨로 다시 계산하고(`heroStats`. 스킬과 공격 간격은 `Heroes` 행이라 재사용 대기가 이어짐) 새 최대 HP로 회복합니다. 레벨은 싸우는 몬스터가 없는 경계에서만 바뀌므로 이미 보여 준 공격은 옛 능력치 그대로이고, 클라이언트와 서버가 같은 경계에서 올리므로 `reset`이 나지 않습니다. 최대 레벨에서는 경험치가 상한까지 쌓이기만 합니다. 1레벨 영웅은 3001의 첫 클리어(약 13초, 처치 다섯과 클리어 보상으로 경험치 100)에 2레벨이 됩니다.
- **경험치 빼기**: `Big`의 가수는 이진수로 정확하지 않아 가까운 두 정수를 `Big.sub`로 빼면 내림 허용치보다 크게 어긋납니다(230 − 100 − 120이 9.99…, 내림하면 9). 그래서 `levelUp`은 2^53 아래에서는 double로 뺍니다. 골드를 쓰는 커맨드가 생기면 같은 문제가 있습니다.
- **커맨드로 하지 않은 이유**: 레벨업을 커맨드로 두면 레벨업마다 요청과 커밋이 하나씩 더 들고, 그때마다 보이는 전투를 새 능력치로 맞춰야 합니다. 자동이면 없습니다. 오프라인 보상의 경험치는 그 정산이 곧 경계라서 지급할 때 같은 `levelUp`으로 오릅니다(아래 오프라인 보상).
- **클라이언트**: 메인 화면 HUD의 레벨 별이 전투 서비스의 `heroLevel`(보이는 전투의 레벨, 없으면 저장된 레벨)을, 경험치 막대 안의 글자가 다음 레벨까지 모은 경험치 비율(`42%`, 최대 레벨이면 `MAX`)을 보입니다. 연출자는 `levelUp` 이벤트를 영웅 머리 위의 초록 글자(`레벨 업! Lv.N`, 같은 프레임의 클리어 배너와 겹치지 않게 배너보다 높게)와 `revive`로 바꿉니다. 경험치 막대(공용 부품 게이지)가 같은 비율로 찹니다.

**와이어와 저장**: 영웅 레벨을 계정(`profile.level`)에서 영웅 슬라이스(`hero.level`)로 옮겨 `PROTOCOL_VERSION`이 22, 저장 형식이 14입니다(13 → 14가 값을 그대로 옮김). 그 전의 이력: `PlayerState` 모양은 그대로라(`profile.level`, `items[2]`가 이미 있음) 저장 형식은 3이고 마이그레이션이 없습니다. 규칙이 바뀌어 옛 클라이언트는 레벨업 없이 예측하므로 `PROTOCOL_VERSION`을 4로 올렸습니다. 새 Opcode는 없습니다.

**비용**: 같은 조건(Apple M4 Max, Node 22.14, 1레벨 영웅의 스테이지 3002 사냥, esbuild 번들을 Node로 실행)에서 `settle` 한 번은 바꾸기 전 600틱에 0.023 ms, 6,000틱에 0.19–0.20 ms였습니다. 바꾼 뒤에는 레벨업이 없는 데이터(`expToNext`를 모두 비움)로 0.019 ms, 0.17 ms이고, 지금 데이터(그사이 레벨이 올라 처치가 빨라짐)로 0.020 ms, 0.19 ms입니다. 경계마다의 레벨 확인(테이블 조회와 비교 하나)과 처치마다의 상한 조회가 들어가도 늘지 않았습니다. 레벨업은 요청을 만들지 않으므로 서버 비용이 더 들지 않습니다.

## 해금

해금 조건은 해금되는 것의 테이블 행에 열로 적고, 해금 여부는 저장하지 않고 저장 데이터에서 계산합니다(`shared/game-core/src/unlock.ts`의 `isUnlocked`). 지금 쓰는 곳은 스테이지입니다.

| 테이블 | 열 | 뜻 |
| --- | --- | --- |
| `Stages` | `unlockStageId` (`int?`) | 먼저 클리어해야 하는 스테이지(`stage.clearedIds`에 있어야 함). 빈 칸이면 조건이 없습니다. 클리어 뒤 옮겨 갈 다음 스테이지도 이 열로 찾습니다. |
| `Stages` | `unlockLevel` (`uint?`) | 필요한 영웅 레벨(`hero.level` 이상). 빈 칸이면 조건이 없습니다. 지금은 최종 보스 스테이지 3006만 15입니다. |

- **평가**: 적힌 조건을 모두 채우면 해금입니다. `isUnlocked(condition, player)`는 두 열을 가진 행이면 어느 테이블이든 받으므로, 메뉴 같은 다른 콘텐츠도 자기 테이블에 같은 두 열을 붙이면 됩니다. 조건만 모은 테이블은 `Stages.unlockStageId`와 같은 것을 두 번 적고 매핑으로 잇게 되어 두지 않았습니다. 해금 목록을 저장하지 않는 것도 같은 이유입니다. 클리어와 레벨이 이미 저장되어 있어, 따로 저장하면 테이블을 고칠 때 어긋나고 저장 형식과 와이어도 바뀝니다. 계산은 스테이지 6개 전체에 0.10 µs, 200개에 5.3 µs입니다(Apple M4 Max, Node 22.14).
- **스테이지 선택**: `StageSelect`는 누른 틱까지 확정한 뒤, 다른 스테이지로 옮길 때만 해금을 보고 잠겼으면 `StageLocked`(101)로 거절합니다. 확정이 올린 클리어와 레벨로 보므로 보이는 전투에서 막 연 스테이지도 고를 수 있습니다. 이미 있는 스테이지는 데이터가 바뀌어 잠겨도 머뭅니다.
- **클리어 뒤 이동**: 클리어하면 `unlockStageId`가 그 스테이지인 것 중 해금된 것의 가장 작은 ID로 옮깁니다. 레벨은 그 경계에서 클리어 보상까지 받아 오를 레벨로 봅니다. 레벨이 모자라면 마지막 스테이지처럼 그 자리에서 `autoBoss`를 끄고 사냥을 이어 가며(`stageClear`의 `nextId`는 null), 레벨이 차면 플레이어가 다음 스테이지 버튼으로 옮깁니다.
- **클라이언트**: 메인 뷰모델이 해금된 스테이지를 `computed`로 계산합니다. 클리어는 저장 데이터, 레벨은 전투 서비스의 `heroLevel`(보이는 전투의 레벨, 없으면 저장된 레벨)에서 가져옵니다. 커맨드가 확정한 뒤 보는 클리어와 레벨은 이보다 작지 않으므로 여기서 열린 스테이지는 서버도 받아들입니다. 스테이지 막대의 화살표는 해금된 스테이지를 ID 순서로 앞뒤로 돌고(양 끝은 이어짐), 옮길 곳이 없으면 숨습니다(`canChangeStage`). 프리팹은 바꾸지 않았습니다.

**와이어와 저장**: 모양은 그대로라 저장 형식은 3이고 마이그레이션이 없습니다. 예측 규칙(스테이지 선택 거절, 클리어 뒤 이동)이 바뀌어 `PROTOCOL_VERSION`을 5로 올렸습니다. 새 Opcode는 없고 게임 실패 코드 `StageLocked`(101)가 생겼습니다.

## 장비

장비는 `Items`의 종류(`kind`)가 3인 행이고, 수량이 아니라 하나씩 다른 인스턴스로 가집니다(`shared/game-core/src/equipment.ts`). 정의는 `Items` 행 하나라서 이름, ID, 상한(`cap`)을 다른 아이템과 같이 쓰고, 슬롯과 스탯도 그 행에서 읽으므로 인스턴스에는 아이템 ID와 강화 단계(아래 강화와 합성)만 둡니다. 한 아이템은 종류에 따라 `items`(수량)와 `equipment`(인스턴스) 중 한 곳에만 있습니다.

| 테이블 | 열 | 뜻 |
| --- | --- | --- |
| `Items` | `slot` (`uint`, Enum `EquipSlot`, `when` `kind=Equipment`) | 장비 슬롯: 1 무기, 2 방어구, 3 장신구. 장비에만 적고 장비에는 꼭 적어야 해서 변환이 검사합니다(TS 타입은 `EquipSlot \| null`). |
| `Items` | `grade` (`uint`, Enum `Grade`, `when` `kind=Equipment`) | 등급(희귀도): 1 일반, 2 고급, 3 희귀, 4 영웅, 5 전설. 장비에만 적고 장비에는 꼭 적습니다. 화면의 칸 색만 정하고 규칙은 쓰지 않습니다. 합성의 다음 장비(`mergeItemId`)와는 따로라서, 보스 장비(104–106)는 첫 단계지만 희귀입니다. 지금 101–103 일반, 107–109 고급, 104–106 희귀, 110–112 영웅. |
| `Items` | `attack`, `defense`, `maxHp` (`big?`, `when` `kind=Equipment`) | 입으면 더하는 고정 가산치. 장비에만 적고 빈 칸이면 0입니다. 열 이름이 `StatModifier.stat`, `HeroLevels`의 열과 같아 매핑이 없습니다. |

```ts
interface EquipmentState {
  nextId: number;                        // 다음에 받는 장비의 ID. 1부터 오르고 다시 쓰지 않음
  owned: { [equipmentId]: { itemId, enhance } };  // 가진 장비와 강화 단계
  equipped: { [slot]: equipmentId };     // 슬롯마다 입은 장비 하나
}
```

- **받기**: 보상 열(`Monsters.rewardItemIds`, `Stages.clearItemIds`)에 장비 ID를 수량과 함께 적습니다. `addReward`와 `grant`가 장비인 행만 `floor(수량)`개의 인스턴스로 만들고(ID는 `nextId`부터 차례로) 나머지는 수량에 더하므로, 받는 길은 그대로 하나입니다. 지급은 확정적이라 난수를 쓰지 않고, 클라이언트 예측과 서버 재현이 같은 ID를 냅니다. 지금 데이터는 3001·3002·3003·3005의 클리어 보상(낡은 검, 가죽 갑옷, 구리 반지, 서리 갑옷)과 보스 2008·2010의 처치 보상(오우거 대검, 화염 반지)입니다. 오프라인 보상은 사냥만 재므로 장비는 클리어와 보스 보상에만 둡니다.
- **상한**: 그 아이템의 인스턴스 수가 `Items.cap`을, 가방 전체(입은 것 포함)가 `Constants.equipmentCap`(100)을 넘지 않습니다. 넘친 것은 다른 보상처럼 버립니다. 지금 데이터의 장비는 `cap`이 비어 가방만 막고, 다시 클리어해 모은 같은 장비는 합성(아래)이 줄입니다.
- **능력치**: `heroStats`가 입은 슬롯을 번호 순서로 돌며 행의 스탯 열을 강화 단계로 키운 값(`equipmentStat`, 아래)을 수정치(`{ stat, add }`)로 모아 `applyModifiers`에 넘깁니다(백로그 13). 전투 안에서 장비는 받기만 하고 입은 것이 바뀌지 않으므로, 능력치는 레벨업 때만 다시 계산합니다.
- **입기와 벗기**: 아래 두 커맨드는 누른 틱까지 확정한 뒤 장비를 바꾸고 그 틱에서 새 능력치로 전투를 이어 갑니다(`refitHero`: 싸우던 웨이브, 적, 소환수, 발사체, 재사용 대기, 자리는 그대로이고, 최대 HP가 오른 만큼 지금 HP를 올리며 줄면 새 최대 HP로 자름. 쓰러진 영웅은 그대로). 보스전도 같은 보스, 같은 남은 시간으로 이어집니다. 확정이 막 지급한 장비도 입을 수 있습니다. 네트워크에서 온 ID가 정수이고 가진 장비의 키인지 보고(`constructor` 같은 프로토타입의 키 포함), 아니면 `EquipmentNotFound`(200)로 거절합니다.

| 커맨드 | Opcode | 하는 일 |
| --- | --- | --- |
| `ItemEquip` | 200 | `{ equipmentId }`를 그 슬롯에 입습니다(있던 것은 벗음). 이미 입었으면 확정만 합니다. |
| `ItemUnequip` | 201 | `{ equipmentId }`를 벗습니다. 입지 않은 장비면 확정만 합니다. |

- **전투 예측**: 착용은 능력치가 바뀌어 길이 달라지므로 보이는 전투가 그 자리에서 `reset`을 한 번 냅니다. 같은 장면이 이어지므로 월드 뷰는 배우를 다시 세우지 않고 HP와 자리만 맞춥니다(아래 전투 월드). 서버는 예측한 시각에 확정하므로 답이 와도 다시 맞추지 않습니다. `pathSignature()`에는 입은 장비가 들어가고, 가지기만 한 장비는 길을 바꾸지 않습니다.
- **클라이언트**: 메인 화면의 장비 탭이 아래 판 `UI/EquipmentScreen`을 엽니다(가방처럼 메인과 함께 닫힘). 뷰모델은 `presentation/view-models/equipment.ts`입니다.
  - 능력치 줄: 공격, 방어, HP를 `heroStats`(보이는 전투의 레벨과 저장된 장비)로 계산해 공용 위젯의 재화 칸(`CurrencySlot`, `list`와 `bigNumber`)에 보이므로, 입고 벗거나 레벨이 오르면 굴러갑니다.
  - 슬롯 탭(전체, 무기, 방어구, 장신구: `Tabs<EquipSlot | null>`)과 한 줄 6칸의 `ScrollList` 그리드입니다. 칸은 등급 색(`Items.grade`, `TintView`) 칸 안의 아이콘, 왼쪽 위의 강화 단계(`+3`), 아래의 합성 재료 막대와 수(같은 장비 수/`mergeCount`, 다음 장비가 없으면 비움), 착용 표시(E)와 더 좋은 장비의 빨간 점(둘 다 칸 안의 오른쪽 위 모서리라 스크롤 목록의 마스크에 잘리지 않음), 고른 칸의 주황 테두리입니다. 장비는 슬롯, 아이템 ID, 장비 ID 순서입니다.
  - 머리의 일괄 장착(`equipBest`)은 슬롯마다 입은 것보다 좋은 장비 중 다른 어느 후보보다 나쁘지 않은 것을 입고(`ItemEquip`을 슬롯마다), 일괄 합성(`mergeAll`)은 재료가 모인 장비를 남김없이 합성합니다(`ItemMerge`를 예측이 바꾼 상태에서 다시 찾으며 최대 50번, 거절되어 같은 장비가 다시 나오면 멈춤). 둘 다 할 것이 없으면 누를 수 없습니다.
  - 알림 뱃지(위 공용 위젯): 입지 않은 장비가 그 슬롯에 입은 것(없으면 모두 0)보다 강화 단계를 반영한 모든 스탯(`attack`, `defense`, `maxHp`)이 같거나 크고 하나는 크면 "더 좋음"입니다. 스탯 사이의 가중치(전투력)는 게임에 정의가 없으므로(밸런스 툴의 `powerOf`는 툴의 것), 하나는 오르고 하나는 내리는 장비는 고르지 않습니다. 트리는 더 좋은 장비(목록의 칸) → 슬롯(슬롯 탭의 뱃지) → 어느 슬롯이든(전체 탭과 메인의 장비 버튼)이고, 메인 화면이 `createEquipmentBadges`로 한 번 만들어 장비 버튼과 장비 화면이 같은 마디를 봅니다. 저장 데이터의 `equipment`가 바뀔 때만 다시 계산하고, 한 번에 지금 데이터(장비 6개)로 1.1 µs, 가방 상한(100개)으로 7.5 µs입니다(M4 Max, Node 22.14). 입으면 꺼지므로 저장할 것이 없습니다. "처음 본 장비" 같은 뱃지를 더한다면 본 것은 기기 저장소에 둡니다: 진행이 아니라 알림이라 다른 기기에서 한 번 다시 떠도 잃는 것이 없고, 서버에 두면 보는 것마다 쓰기와 커맨드, 프로토콜·저장 형식이 늘기 때문입니다. 장비 ID는 `nextId`로 오르기만 하므로 계정마다 본 마지막 ID 하나면 됩니다.
  - 칸을 누르면(칸의 `selectButton`이 그 원소의 `tap()`을 부름, 위 목록과 탭) 그 장비를 아래 강화·합성 패널에 고르고, 입지 않은 것이면 그 슬롯에 입습니다(`progress.cmd.ItemEquip`. 튜토리얼의 "무기를 눌러 입으세요"도 이것). 벗기는 패널의 착용 버튼(`equipToggleButton`, 입었으면 "해제", 아니면 "장착")이 합니다(`ItemUnequip`). 거절은 토스트("가지고 있지 않은 장비입니다.")가, 서버를 기다리는 동안은 로딩 표시가 알립니다. 되돌릴 수 있는 일이라 확인 팝업은 쓰지 않습니다.
  - 장비는 처치가 아니라 클리어와 보스의 보상이고 그 정산은 그 프레임에 나가 바로 예측되므로, 보이는 전투가 아니라 저장 데이터의 `equipment`를 봅니다.
  - 프리팹(`EquipmentScreen`, `EquipmentCell`)은 `Tools/UI/Build Equipment Prefabs`(`Assets/Editor/UI/EquipmentPrefabs.cs`)가 코드로 만듭니다. `CurrencySlot`을 쓰므로 `Build Widget Prefabs` 다음에 실행합니다. 가방과 같이 쓰는 머리(제목 글자와 구분선), 탭 막대, 스크롤 그리드는 판 명세(`UiSpec`의 `Sheet`, `Header`, `Tabs`, `Grid`)입니다. 처음에는 입은 장비(없으면 처음 가진 장비)를 골라 두어 강화·합성 패널이 비지 않습니다.

**와이어와 저장**: `PlayerState`에 `equipment`가 생겨 `PROTOCOL_VERSION`이 6, 저장 형식이 4입니다. 3 → 4 마이그레이션은 빈 장비(`{ nextId: 1, owned: {}, equipped: {} }`)를 넣으므로 게임 데이터가 필요 없습니다. 장비 ID와 슬롯은 정수 키 맵이라 MessagePack에서 키가 문자열입니다. 슬라이스는 비었을 때 37바이트, 지금 데이터의 장비 여섯을 가지고 셋을 입으면 112바이트, `equipmentCap`(100)만큼 가지면 1,240바이트입니다. 인스턴스를 숫자 하나로 두면 각각 37, 64, 440바이트지만, 강화 같은 인스턴스별 값을 필드로 더하려고 객체로 둡니다. 이 슬라이스는 장비를 받은 정산과 착용의 응답에만 실리고(상한에 걸려 버린 보상은 슬라이스를 바꾸지 않음), `ItemEquip` 요청은 30바이트입니다. `shared/protocol/test/wire.test.ts`에 두 요청과 장비를 싣는 응답을 더했고 기존 스냅숏은 그대로입니다. 서버의 요청 처리는 바뀌지 않았습니다.

**비용**: Apple M4 Max, Node 22.14(esbuild 번들), 1레벨 영웅의 3002 사냥에서 `settle` 한 번이 600틱에 0.021 → 0.021 ms, 6,000틱에 0.173–0.175 → 0.173–0.178 ms로 측정 오차 안입니다(처치마다 이미 찾은 행의 `kind` 비교 하나가 늘었습니다). 세 슬롯을 다 입으면 6,000틱이 0.179–0.183 ms인데, 영웅이 세져 같은 시간에 더 많이 잡기 때문입니다. `ItemEquip` 한 번(60초 정산 포함)은 0.021–0.022 ms로 `StageSelect`(0.021 ms)와 같고, 플레이어가 누를 때만 나가므로 서버 비용은 무시할 만합니다.

### 강화와 합성

가진 장비 하나하나를 골드로 강화하고(`ItemEnhance`), 같은 장비 여럿을 합쳐 다음 등급 장비 하나로 만듭니다(`ItemMerge`). 규칙은 `shared/game-core/src/equipment.ts`(`equipmentStat`, `enhanceCost`, `mergeMaterials`)와 `commands/equipment.ts`에 있습니다.

| 테이블 | 열·키 | 뜻 |
| --- | --- | --- |
| `Items` | `enhanceMax` (`uint`, 기본 10, `when` `kind=Equipment`) | 강화 최대 단계. 0이면 강화할 수 없습니다. 지금 데이터는 1등급 10, 2등급 20입니다. |
| `Items` | `mergeItemId` (`int?`, `ref` `Items`, `when` `kind=Equipment`) | 합성하면 되는 다음 등급 장비. 같은 슬롯의 장비여야 하고(합성이 던지고 배포 데이터 테스트가 확인), 비면 합성할 수 없습니다. |
| `Items` | `mergeCount` (`uint`, 기본 3, 2 이상, `when` `kind=Equipment`) | 합성에 쓰는 같은 장비 수(고른 것 포함). |
| `Constants` | `goldItemId` (1) | 강화 비용을 내는 아이템(골드 강화와 같은 행). |
| `formulas.json` | `enhanceCost` = `floor(enhanceBaseCost * pow(enhanceCostGrowth, step))` | 단계 `step`에서 한 단계 올리는 골드. 500, 750, 1,125, …, +9 → +10이 19,221, +19 → +20이 1,108,418입니다(상수 500, 1.5). |
| `formulas.json` | `enhanceStat` = `floor(base * (1 + enhanceStatPerStep * step))` | 강화한 스탯 하나. `base`(새 공식 입력)는 행의 `attack`·`defense`·`maxHp`이고 빈 칸은 강화해도 비어 있습니다. 상수 0.2라 낡은 검(공격 5)이 +10에 15입니다. |

지금 데이터는 장비 여섯마다 다음 등급이 하나씩 있습니다: 낡은 검 → 날 선 검(107), 가죽 갑옷 → 징 박은 갑옷(108), 구리 반지 → 은 반지(109), 오우거 대검 → 오우거 전쟁검(110), 서리 갑옷 → 빙하 갑옷(111), 화염 반지 → 업화 반지(112). 2등급은 합성으로만 얻고 다음 등급이 없습니다. 공식은 골드 강화의 `upgradeCost`와 따로 두어 곡선을 따로 맞추고, 스킬 레벨의 입력(`skillLevel`)은 읽지 않습니다.

- **강화**(`ItemEnhance` 202, `{ equipmentId }`): 누른 틱까지 확정한 뒤, 그 골드에서 `enhanceCost(지금 단계)`를 내고 단계를 하나 올립니다. 입은 장비면 착용처럼 그 틱에서 새 능력치로 이어 가고, 입지 않았으면 확정한 체크포인트를 그대로 둡니다. 최대 단계면 `EquipmentMaxEnhance`(201), 골드가 모자라면 골드 강화와 같은 `NotEnoughGold`(302)입니다. 골드는 `items.ts`의 `spend`(모자라면 undefined, 빼기는 레벨업·골드 강화와 같은 `minus`)로 내고, 스킬의 비용도 같은 `spend`를 씁니다.
- **합성**(`ItemMerge` 203, `{ equipmentId }`): 고른 장비와, 같은 아이템의 나머지 중 입지 않은 것 → 강화 단계가 낮은 것 → ID가 작은 것 순서로 `mergeCount − 1`개를 재료로 지우고, 다음 등급 장비 하나를 `nextId`(새 ID, +0)에 만듭니다. 재료의 강화 단계는 사라집니다. 결과를 새 ID로 두는 것은 장비 ID가 언제나 같은 아이템을 가리키게 하기 위해서입니다(ID로 "본 장비"를 셀 때 합성 결과도 새것으로 보임). **입은 장비**는 고르거나 재료가 모자랄 때만 재료가 되고(같은 아이템은 슬롯이 같아 많아야 하나가 입혀 있음), 재료에 입은 것이 있으면 결과를 그 슬롯에 입히고 사냥을 다시 시작합니다. 벗고 합성하는 두 번의 누름이 필요 없고, 결과가 같은 슬롯의 다음 등급이라 입던 자리가 비지 않습니다. 합성은 장비 수를 줄이기만 하므로 가방 상한을 보지 않고, 보상이 아니라서 결과 아이템의 `cap`도 보지 않습니다. 다음 등급이 없으면 `EquipmentNotMergeable`(202), 같은 장비가 모자라면 `MergeMaterialsShort`(203)입니다.
- **실패 확률은 두지 않습니다.** 커맨드는 클라이언트가 바로 적용하고 서버가 같은 규칙으로 확정하므로, 확률을 두면 결과를 정할 난수의 상태를 저장 데이터에 두고 클라이언트도 알아야 합니다(전투의 `battle.rng`와 같은 방식). 그러면 결과는 미리 계산됩니다. mulberry32의 다음 값은 한 번에 수 ns라 고친 클라이언트는 다음 수천 번의 성패를 바로 보고, 계정 하나의 수열이면 실패할 차례를 +0 장비의 강화(500골드)로 넘겨 +19 → +20(110만 골드) 같은 비싼 강화만 성공시킬 수 있습니다. 장비마다 수열을 두면(인스턴스마다 상태 약 5바이트, 가방 100개면 약 500바이트) 넘기기는 막히지만 성공할 장비만 골라 강화하는 것은 남아, 정직한 플레이어에게만 확률이 확률입니다. 서버만 아는 난수로 정하면 공정하지만 결과를 예측할 수 없어 강화마다 왕복을 기다려야 하므로, 즉시 반영 뒤 서버 확정이라는 지금 커맨드 구조와 맞지 않습니다. 그래서 강화는 언제나 성공하고 진행의 속도는 지수로 오르는 비용이 정합니다. 확률을 둔다면 서버가 정하고 답을 기다리는 표시를 띄우는 커맨드로 따로 설계합니다.
- **동시성과 멱등**: 서버 코드는 바뀌지 않았습니다. 같은 요청 id는 처음 답을 받고 골드를 한 번만 내며, 재연결 전후 두 연결이 같은 장비를 동시에 강화하면 늦게 쓰는 쪽이 먼저 쓴 저장 데이터(한 단계 오르고 골드가 준 것) 위에서 다시 확인해 다음 단계의 비용을 내지 못하면 `NotEnoughGold`로 거절됩니다(`server/test/rpc.test.ts`의 equipment enhancement).
- **클라이언트**: 장비 화면의 뷰모델(`presentation/view-models/equipment.ts`)에 고르기와 강화·합성 패널이 있습니다. 칸의 `select()`가 장비를 고르고(그 칸의 `selected`), `forge`(`ForgeViewModel`)가 고른 장비의 `visible`, `name`(`낡은 검 +3`), `detail`, `step`(`강화 3/10`), `enhanceCost`(`Big`, 최대면 0), `canEnhance`(최대가 아니고 보이는 골드 `battle.items`가 비용 이상. 커맨드가 누른 틱까지 정산해 그 골드로 냄. 골드 강화·스킬 화면과 같은 보유량), `mergeable`(다음 등급이 있음), `mergeCount`(`같은 장비 2/3`), `mergeInto`(`합성하면 날 선 검`), `canMerge`(`mergeMaterials`가 재료를 찾음), `worn`, `toggle()`·`enhance()`·`merge()`를 냅니다. 커맨드는 `progress.cmd.ItemEnhance`·`ItemMerge`(Opcode 이름에서 생김)로 바로 적용되고, 합성은 보내기 전의 `nextId`(결과의 ID)를 고릅니다. 고른 장비가 없어지면(재료로 쓰임, 거절된 합성의 결과) 패널이 숨습니다. 거절은 토스트가 알립니다("이미 최대로 강화한 장비입니다.", "골드가 부족합니다.", "더 높은 등급으로 합성할 수 없는 장비입니다.", "합성할 같은 장비가 부족합니다."). 화면(프리팹 빌더, C#, `unity/views/equipment.ts`의 패널 바인딩)은 아직 없고, 칸 클릭은 지금처럼 `toggle()`입니다.
- **화면**: 장비 화면(`UI/EquipmentScreen`)의 칸(`EquipmentCell`) 오른쪽 끝에 강화 버튼(`forgeButton`, `equipment.enhance`)이 있어 누르면 그 장비를 고릅니다(`select()`). 칸 전체를 누르면 지금처럼 입고 벗습니다(`toggle()`). 튜토리얼의 무기 착용 스텝이 목록(`equipment.items`)을 비추고 착용을 기다리므로 칸 누르기를 고르기로 바꾸지 않았습니다. 목록 아래의 강화·합성 패널(`forgePanel`, 고른 것이 없으면 숨음, 팝업 명세의 새 `UiSpec.Dock`이 아래쪽에 고정한 판)에는 이름과 단계(`forgeNameText`, `forgeStepText`), 스탯(`forgeDetailText`), 다음 강화의 골드(`enhanceCostText`, 굴러가는 수)와 강화 버튼(`enhanceButton`, `canEnhance`일 때만), 합성 줄(`mergeRow`, 다음 등급이 있을 때만: `mergeCountText`, `mergeIntoText`, `mergeButton`은 `canMerge`일 때만)이 있습니다. Unity에서 화염 반지를 골라 한 번 강화하자 패널이 `화염 반지 +1`, `강화 1/10`, `장신구 · 공격 +18 · HP +120`으로 바뀌고 서버가 `ItemEnhance`를 받아들였습니다. 합성은 같은 장비가 모이지 않아 눌러 보지 못했습니다.
- **와이어와 저장**: 인스턴스가 `{ itemId, enhance }`가 되어 `PROTOCOL_VERSION`이 15, 저장 형식이 11입니다(스킬의 10 다음. 10 → 11이 가진 장비마다 `enhance: 0`을 넣음). 인스턴스마다 9바이트가 늘어 장비 슬라이스는 비었을 때 37바이트 그대로, 장비 여섯에 셋을 입으면 112 → 166바이트, 가방 상한(100개)이면 1,240 → 2,140바이트입니다. 단계 0도 적는 것은 모든 인스턴스가 같은 모양이라 읽는 쪽에 기본값 처리가 없게 하기 위해서입니다. 두 요청은 31바이트이고, 응답은 바뀐 슬라이스(`items`와 `equipment`, 입은 장비면 `battle`)를 싣습니다.
- **비용**: Apple M4 Max, Node 22.14(esbuild 번들), 다른 작업이 함께 도는 기계에서 기준 커밋(스킬까지)과 번갈아 세 번 잰 중앙값입니다. `heroStats`는 세 슬롯을 입으면 0.47 → 0.90 µs(공식 다섯 번)이고 전투 시작과 레벨업 때만 부르므로, `npm run bench`(장비 없는 중반 계정)는 정산 60초 0.166 → 0.166 ms, 10분 0.916 → 0.915 ms, 오프라인 12시간 1.064 → 1.079 ms, 접속 1시간 5.75 → 5.86 ms로 측정 오차 안입니다. 커맨드 한 번은 입지 않은 강화 2.2 µs, 입은 강화 3.4 µs(사냥을 다시 시작), 가방 100개에서 합성 4.8 µs(재료 고르기 2.5 µs)이고 누를 때만 나가므로 서버 비용은 무시할 만합니다.
- **곡선**(`npm run balance -- --hours 24`, 시드 1): 밸런스 정책의 성장 사기(`purchases`)에 입은 장비의 다음 강화 단계를 후보로 더했습니다(따로 도는 루프 없음, 합성은 하지 않음. 아래 밸런스 시뮬레이션). 스킬까지의 기준과 비교하면 전투력이 1시간 2,146 → 2,203, 6시간 6,012 → 6,141, 24시간 11,447 → 11,596(+1.3%)이고, 셋 모두 1시간에 +5, 6시간에 +10(최대)이 됩니다. 장비 강화에 골드가 가는 만큼 골드 강화가 조금 늦어(24시간 52·51·50 → 51·51·50 단계, 스킬은 12시간에 10레벨로 한 시간 늦음) 24시간에 남은 골드가 116,440 → 67,216입니다. 레벨과 스테이지의 시각은 그대로입니다. 영웅 레벨의 능력치가 커서 1등급 장비의 강화는 곡선을 조금만 바꾸므로, 2등급(합성)과 함께 비용·스탯 상수를 맞출 여지가 있습니다. 시뮬레이션은 24시간에 168 → 173 ms입니다(산 것이 늘고 입은 장비의 강화가 사냥을 다시 시작함).

## 성장(골드 강화)

골드로 영웅의 능력치를 단계별로 올립니다. 화면과 문장에서는 "성장"이라 불러(아래 탭 `menu.upgrade`, 환생의 "성장 5단계 → 0") 장비의 강화와 헷갈리지 않게 하고, 코드와 데이터의 이름은 `StatUpgrade`, 이 문서는 골드 강화라 씁니다(규칙은 `shared/game-core/src/stat-upgrade.ts`, 커맨드는 `commands/stat-upgrade.ts`). 강화 하나가 `data/StatUpgrades.xlsx`의 행 하나입니다.

| 열 | 뜻 |
| --- | --- |
| `id` (`uint`) | 강화 ID. 저장 데이터의 단계가 이 ID를 키로 쓰고, 화면은 이 순서입니다. 지금 7001 공격, 7002 HP, 7003 치명입니다. |
| `nameKey` (`ref Strings`) | 화면의 이름. 지금은 능력치 이름(`stat.attack`, `stat.maxHp`, `stat.critChance`)을 그대로 씁니다. |
| `stat` (Enum `Stat`) | 올리는 능력치. 치명 확률을 위해 `Stat.CritChance`를 더했습니다. 공격 간격은 비율만 쓰므로 고르지 않습니다. |
| `amount` (`big`, `0..`) | 단계마다 더하는 고정 가산. 지금 공격 5, HP 50, 치명 0.005(+0.5%p)입니다. |
| `maxStep` (`uint`, `1..`) | 최대 단계. 지금 100, 100, 50입니다. |

- **저장**: `PlayerState.statUpgrades`는 강화 ID → 단계이고, 키가 없으면 0단계입니다.
- **능력치**: `heroStats`가 입은 장비 다음에 강화를 ID 순서로 돌며 `amount × 단계`를 고정 가산 수정치(`{ stat, add }`)로 더합니다. 치명 확률은 `applyModifiers`가 `(기본 + Σadd) × max(0, 1 + Σpercent)`로 계산하고, 난수와 비교하므로 내림하지 않습니다(효과의 `Stat.CritChance` 비율도 같은 길입니다). 단계는 전투 안에서 바뀌지 않으므로 레벨업 경계에서도 같은 단계를 다시 더하고, 데이터에서 지운 강화의 단계는 버립니다. `pathSignature()`에 단계가 들어갑니다.
- **비용**: 다음 단계의 골드는 공식 `upgradeCost`(입력 `step` = 지금 단계, 지금 식은 `floor(100 × 1.15^step)`)이고 `statUpgradeCost(step)`가 부릅니다. 거듭제곱이 `Big.pow`라서 클라이언트와 서버가 같은 비트를 냅니다(game-core 테스트가 0–120단계를 `Big.pow`와, 마지막 단계의 비트를 상수와 비교). 강화마다 곡선이 같고, 골드는 `Constants.goldItemId`(1)의 보유량입니다. 공격이나 HP를 100단계까지 올리는 데 약 7.8억, 치명 50단계는 약 72만 골드입니다.
- **올리기**: 아래 커맨드는 없는 강화를 `StatUpgradeNotFound`(300), 1–100 밖이거나 정수가 아닌 `steps`를 `InvalidCommand`(1), 최대 단계를 `StatUpgradeMaxed`(301)로 정산 없이 거절합니다. 그다음 누른 틱까지 확정한 골드로 `steps`단계까지 한 번에 올리되 최대 단계나 골드가 모자란 데서 멈추고(`statUpgradeBatch`: 단계마다 `statUpgradeCost`를 더하며 셈, 클라이언트도 같은 함수로 비용을 보임), 한 단계도 못 올리면 `NotEnoughGold`(302)입니다. 받아들이면 골드를 빼고(레벨업이 경험치를 빼는 것과 같은 `minus`라 가까운 정수의 `Big.sub` 오차가 없음) 단계를 올린 뒤, 착용처럼 그 틱에서 새 능력치로 이어 갑니다(`refitHero`, 위 장비). 진행 중인 웨이브의 처치 보상도 그 확정에 들어 있어 비용으로 쓸 수 있고, 최대 HP 강화는 오른 만큼 지금 HP도 올립니다.

| 커맨드 | Opcode | 하는 일 |
| --- | --- | --- |
| `StatUpgrade` | 300 | `{ upgradeId, steps }`를 골드로 `steps`(1–100)단계까지 올립니다(최대 단계나 골드가 모자란 데서 멈춤). |

- **동시성과 멱등**: 서버 코드는 바뀌지 않았습니다. 커맨드는 `runCommand`를 지나므로 요청 id로 한 번만 적용되고, 확인(단계, 골드)과 쓰기는 같은 `applyCommand` 결과를 `UPDATE … WHERE revision = ?` 한 번으로 저장합니다. 재연결 전후 두 연결이 같은 골드로 함께 강화하면 늦게 쓰는 쪽이 밀려 새 저장 데이터에서 다시 확인하므로 골드를 두 번 쓰지 않습니다(`server/test/rpc.test.ts`의 stat upgrades).
- **클라이언트**: 커맨드는 `progress.cmd.StatUpgrade({ upgradeId, steps })`(Opcode에서 생김)이고 예측으로 바로 보입니다. 거절 토스트는 "없는 성장 항목입니다.", "이미 최대 단계까지 성장했습니다.", "골드가 부족합니다."입니다. 화면의 뷰모델은 `presentation/view-models/upgrade.ts`(`createUpgradeViewModel`)이고, 배수 탭(`multipliers`: ×1, ×10, ×100)과 `entries`의 칸마다 아이콘(`stat_` + 능력치 키), 이름, 단계(`Lv.12`), 더한 양(`+60`, 치명은 `+6%`), 고른 배수만큼 올린 뒤의 양(`→ +110`), 고른 배수로 살 수 있는 만큼의 비용(하나도 못 사면 한 단계의 비용, 최대면 `최대`), 누를 수 있는지(`canUpgrade`: 한 단계 이상 살 수 있음), 누르면 그 배수를 `steps`로 보내는 커맨드(`upgrade()`, 서버에 닿지 못하면 경고 로그만)입니다. 누를 수 있는지는 처치마다 오르는 보이는 골드(전투 서비스의 `items`)로 정합니다. 커맨드가 누른 틱까지 정산한 골드로 값을 치르므로 그 골드가 곧 보이는 골드이고, 누를 수 있는 칸을 규칙이 골드 부족으로 거절하지 않습니다. 장비 화면의 능력치 줄과 메인의 영웅 띠도 강화를 더한 값입니다.
- **화면**(`UI/UpgradeScreen`, 작은 판): 메인 화면의 성장 탭(`upgradeButton`, `menu.upgrade` "성장")이 엽니다. 머리(제목, 배수 탭 `multipliers`)와 길게 누르기 안내(`holdHintLabel`) 아래 강화 목록(`items`, `ScrollList`)이 있고, 칸(`UpgradeCell`)마다 왼쪽에 아이콘 칸(`icon`), 이름(`nameText`)과 단계(`levelText`), 그 아래 지금 양(`bonusText`)과 올린 뒤의 양(`nextText`, 초록), 오른쪽에 동전과 강화 버튼(`upgradeButton`)이 있으며 버튼 글자(`costText`)가 비용입니다. 버튼은 `canUpgrade`일 때만 누를 수 있고, 길게 누르면 C# `RepeatButton`이 0.4초 뒤부터 간격을 0.15초에서 0.05초까지 줄이며 onClick을 되풀이해 냅니다(TS는 onClick만 들으므로 짧게 누른 것과 같은 길). 프리팹은 `Tools/UI/Build Upgrade Prefabs`(`Assets/Editor/UI/UpgradePrefabs.cs`, `Build All Prefabs`의 장비 다음)가 만듭니다. Unity에서 공격을 한 번 올리면 칸이 `Lv.1`, `+5`, 다음 비용 115로 바뀌고 서버가 `StatUpgrade`를 받아들였습니다.

**와이어와 저장**: `PlayerState`에 `statUpgrades`가 생겨 `PROTOCOL_VERSION`이 13, 저장 형식이 9입니다. 8 → 9 마이그레이션은 빈 맵을 넣으므로 게임 데이터가 필요 없습니다. 강화 ID는 정수 키 맵이라 MessagePack에서 키가 문자열이고, 슬라이스는 키를 포함해 비었을 때 14바이트, 세 강화가 53·53·50단계면 32바이트입니다. `StatUpgrade` 요청은 39바이트(`steps`가 1–127이면 늘 같음)이고, 응답에는 바뀐 `items`, `statUpgrades`, 다시 시작한 `battle`이 실립니다. `shared/protocol/test/wire.test.ts`에 요청, 단계를 싣는 응답, `NotEnoughGold` 거절을 더했고 기존 스냅숏은 그대로입니다. 그 뒤 `steps`가 생겨 `Command`가 바뀌어 `PROTOCOL_VERSION`이 21입니다(저장 형식은 그대로).

**곡선**(`npm run balance -- --hours 24`, 시드 1): 밸런스 정책이 정산마다(60초) 골드를 남기지 않고 가장 싼 다음 단계부터 올리면(같으면 ID 순서, 지금은 비용이 같아 세 강화가 고르게 오름) 전투력이 1시간에 1,686 → 2,156(+28%, 28·28·27단계), 6시간에 5,607 → 6,027(+7.5%, 42·42·42단계), 24시간에 10,932 → 11,462(+4.8%, 53·53·50단계, 치명은 17시간에 최대)입니다. 1시간 레벨은 33 → 34이고, 마지막 스테이지(3006, 1시간)와 최대 레벨(50, 15시간)에 닿는 시각은 그대로입니다. 24시간에 번 골드는 약 295만으로 같고 남는 골드가 295만 → 3.9만입니다. 비용이 단계마다 1.15배라 수입보다 가팔라서, 10시간 뒤로는 시간당 한두 단계만 오릅니다.

**비용**: 같은 기계(Apple M4 Max, Node 22.14)에서 기준 커밋과 번갈아 세 번 잰 `npm run bench`의 중앙값이 정산 60초 0.204 → 0.195 ms, 10분 1.118 → 1.098 ms, 오프라인 12시간 1.271 → 1.307 ms, 접속 1시간 7.01 → 6.88 ms로 측정 오차 안입니다(전투가 영웅 능력치를 계산할 때 빈 맵을 한 번 더 돌 뿐이고, 측정 상태에는 강화가 없음). 밸런스 24시간은 정책이 강화를 더 보내도 195 → 188 ms로 같습니다. 강화 한 번은 착용처럼 정산 한 번과 새 사냥이고, 플레이어가 누를 때만 나갑니다.

## 스킬

영웅이 쓰는 스킬은 `Heroes.skillIds`의 기본 공격(재사용 대기 0인 첫 스킬)과, 나머지 중 재화로 배운 뒤 슬롯(`Heroes.skillSlots`, 지금 3)에 장착한 것입니다(`shared/game-core/src/skills.ts`). 획득(배우기)과 장착은 따로이고, 배운 스킬은 장착하지 않아도 남습니다. 레벨은 배운 스킬마다 있고, 피해 배율·효과의 양·소환수 능력치와 레벨업 비용은 공식(위 데이터와 공식의 `skillLevelRate`, `skillMultiplier`, `skillLevelCost`)이 레벨로 정합니다.

| 테이블 | 열 | 뜻 |
| --- | --- | --- |
| `Skills` | `learnCost` (`big?`, `0..`) | 배우는 비용. 영웅이 장착할 수 있는 스킬은 채웁니다. 지금 속사 1,000, 화염구 2,000, 늑대 소환 3,000, 전투의 포효 5,000, 치유의 빛 4,000골드이고, 앞의 셋은 새 계정이 배운 채 시작합니다. |
| `Skills` | `icon` (`string?`) | 스킬 칸의 아이콘 이름(`Items.icon`처럼 `Assets/UI/Sprites/Icons/`의 파일 이름, `icons.test.ts`가 확인). 영웅 스킬만 채웁니다: 1001 `skill_slash`, 1004 `skill_volley`, 1005 `skill_fireball`, 1006 `skill_heal`, 1010 `skill_roar`, 1011 `skill_wolf`. |
| `Skills` | `costItemId` (`uint?`, `ref Items`) | 배우기와 레벨업 비용을 내는 아이템(골드나 재료). 지금 다섯 모두 골드(1)입니다. |
| `Skills` | `maxLevel` (`uint`, 기본 1, `1..`) | 레벨 상한. 1이면 올리지 않습니다(몬스터와 소환수만 쓰는 스킬). 지금 영웅의 다섯 스킬이 10입니다. |
| `Heroes` | `skillIds` | 쓸 수 있는 스킬. 기본 공격 1001과 속사 1004, 화염구 1005, 늑대 소환 1011, 전투의 포효 1010, 치유의 빛 1006이고, 뒤의 둘을 더해 배우고 고를 거리가 생겼습니다. 새 계정은 기본 공격 밖의 것을 앞에서부터 슬롯 수만큼(1004, 1005, 1011) 1레벨로 배워 장착합니다. |
| `Heroes` | `skillSlots` (`uint`, `1..`) | 스킬 슬롯 수(기본 공격은 슬롯 밖). 3입니다. |

```ts
interface SkillsState {
  equipped: { [slot]: skillId };  // 슬롯(0부터 skillSlots − 1)마다 배운 스킬 하나. 슬롯 순서가 준비된 스킬을 쓰는 순서
  levels: { [skillId]: level };   // 배운 스킬의 레벨(1부터). 없으면 배우지 않은 것
}
```

- **열로 둔 이유**: 레벨이 바꾸는 수치와 비용은 공식이므로, 스킬 × 레벨마다 행이 있는 표(`SkillLevels`)는 공식과 같은 곡선을 한 번 더 적거나 공식을 건너뛰어 같은 개념이 두 곳에 생깁니다. 남는 것은 스킬마다 값이 하나인 상한, 배우는 비용, 비용 아이템이라 `Skills`의 열입니다. 스킬마다 곡선을 다르게 하려면 `Skills`에 계수 열을 더하고 공식이 읽게 합니다. 슬롯 수는 영웅의 것이라 `Heroes`의 열입니다.
- **배운 목록을 따로 두지 않은 이유**: 배운 스킬은 반드시 레벨이 있고 배우지 않은 스킬의 레벨은 뜻이 없으므로, `levels`의 키가 곧 배운 목록입니다(`skillLevel`은 배우지 않았으면 0). 목록을 따로 두면 두 곳이 어긋날 수 있고(레벨만 있거나 목록에만 있음) 그것을 막는 검사가 늡니다.
- **전투**: `heroStats`가 기본 공격 다음에 장착한 스킬을 슬롯 순서로 `CombatStats.skills`에 두고 레벨을 `skillLevels`(저장 데이터의 `levels` 그대로)에 둡니다. 데이터가 바뀌어 장착할 수 없게 된 스킬과 슬롯 수를 넘는 슬롯은 뺍니다. 공격의 피해는 `damage × skillMultiplier`(발사체는 착탄 때)이고, 그 공격이 거는 효과의 양과 부른 소환수의 능력치는 공식에 입력 `skillLevel`을 넘겨 정합니다. 몬스터와 소환수의 스킬은 1레벨입니다. 1레벨의 배율은 정확히 1이라 결과가 레벨이 생기기 전과 비트까지 같습니다(골든 벡터의 이벤트 다이제스트, 24시간 곡선 CSV). 피해 배율은 스킬 행과 레벨로만 정해지므로 행마다 기억합니다(아래 비용).
- **능력치 효과의 비율**: 효과마다 건 스킬의 레벨이 다르므로 비율도 걸 때 `statBuff`로 정해 겹의 `amount`에 담습니다. 전에는 얹을 때마다 `power`에서 계산해 `amount`가 0이었고, 효과가 시전자를 기억하지 않아 `statBuff`가 시전자를 읽을 수 없었습니다. 겹에 레벨을 담는 방법도 있었지만 겹마다 약 7바이트가 늘고 쓰지 않던 `amount`가 남아서 고르지 않았습니다.
- **소환수**: 체크포인트의 소환수(`summons`)는 레벨을 담지 않고, 이어 받을 때 소환자가 그 소환수를 부르는 스킬의 지금 레벨로 능력치를 다시 계산합니다(전투 중에 그 스킬의 레벨을 올리면 이미 나온 소환수도 새 레벨이고, 소환자의 능력치가 줄면 HP를 새 최대로 자름). 경계의 레벨업에서 다시 계산할 때도 부른 레벨을 씁니다.
- **커맨드**: 모두 누른 틱까지 확정한 뒤 바꿉니다. 전투의 길이 바뀌는 장착, 해제, 장착한 스킬의 레벨업은 그 틱에서 새 스킬로 이어 갑니다(착용과 같은 `refitHero`: 재사용 대기는 스킬 id로 옮기고, 새로 쓰는 스킬은 처음부터 기다림). 배우기와 장착하지 않은 스킬의 레벨업은 길을 바꾸지 않아 확정한 전투를 그대로 둡니다. 비용은 확정한 보유량에서 경험치처럼 정확히 뺍니다(`minus`). 그래서 보이는 전투가 지금 웨이브에서 번 골드도 바로 쓸 수 있습니다.

| 커맨드 | Opcode | 하는 일 |
| --- | --- | --- |
| `SkillLearn` | 400 | `{ skillId }`: `learnCost`를 내고 1레벨로 배웁니다. 장착은 하지 않습니다. 이미 배웠으면 확정만 합니다. |
| `SkillEquip` | 401 | `{ slot, skillId }`: 배운 스킬을 그 슬롯에 장착합니다. 다른 슬롯에 있던 스킬이면 두 슬롯이 바뀝니다(그 슬롯에는 이 슬롯에 있던 스킬이 가고, 비었으면 그 슬롯도 빔). 이미 그 슬롯이면 확정만 합니다. |
| `SkillUnequip` | 402 | `{ skillId }`: 장착한 스킬을 빼고 그 슬롯을 비웁니다. 배운 것과 레벨은 남습니다. 장착하지 않았으면 확정만 합니다. 슬롯이 아니라 스킬로 가리켜, 다른 연결의 장착이 슬롯을 바꾼 뒤에도 뺄 스킬이 같습니다. |
| `SkillLevelUp` | 403 | `{ skillId }`: 배운 스킬의 레벨을 하나 올리고 `skillLevelCost(지금 레벨)`만큼 `costItemId`를 냅니다. |

| 오류 | 번호 | 언제 |
| --- | --- | --- |
| `SkillNotFound` | 400 | 영웅이 장착할 수 있는 스킬이 아님(기본 공격, 몬스터의 스킬, 없는 ID, 수가 아닌 값) |
| `SkillNotLearned` | 401 | 배우지 않은 스킬을 장착하거나 레벨을 올림 |
| `SkillSlotInvalid` | 402 | 슬롯이 0 이상 `skillSlots` 미만의 정수가 아님 |
| `SkillMaxLevel` | 403 | 이미 `maxLevel` |
| `SkillCostShort` | 404 | 확정한 보유량이 배우거나 올리는 비용보다 적음 |

- **동시성**: 다른 커맨드처럼 서버가 요청 id로 한 번만 적용하고 답을 저장과 같은 트랜잭션에 기록하며, 저장은 `revision` 조건부입니다. 재연결 전후 두 연결이 같은 골드로 동시에 레벨업하면 늦게 쓰는 쪽이 밀려 새 저장 데이터에서 다시 계산하므로 골드를 두 번 쓰지 않습니다(`SkillCostShort`로 거절). 같은 요청 id로 다시 보낸 배우기와 레벨업은 한 번만 냅니다.
- **전투 예측**: `pathSignature()`에 쓰는 스킬과 그 레벨이 들어가고, 쓰지 않는 스킬의 레벨과 배운 목록은 들어가지 않습니다. 장착, 해제, 쓰는 스킬의 레벨업은 착용처럼 그 자리에서 `reset`을 한 번 내고(배우를 다시 세우지 않음), 배우기는 `reset`이 없습니다.
- **클라이언트**: 커맨드는 `app.progress.cmd.SkillLearn`·`SkillEquip`·`SkillUnequip`·`SkillLevelUp`(Opcode에서 생김)이고, 거절은 토스트("아직 배우지 않은 스킬입니다.", "재화가 부족합니다." 등 `toast.skill*`)가 알립니다. 스킬 화면의 뷰모델은 `presentation/view-models/skills.ts`의 `createSkillsViewModel({ state, data, t, battle, progress, logger, close })`입니다(`battle`은 `items`만 씀).
  - `slots`: 슬롯마다 `label`("슬롯 1"), `name`(비었으면 "비어 있음"), `level`("Lv.3/10"), `empty`, `selected`, `select()`, `unequip()`. 처음에는 첫 슬롯을 고릅니다.
  - `entries`: 장착할 수 있는 스킬마다 `name`, `learned`, `level`(배우지 않았으면 빈 칸), 다음에 낼 비용 `cost`(배우기 전에는 배우는 비용, 뒤에는 다음 레벨의 비용 "골드 2.5K", 최대면 "최대 레벨"), `state`("장착 중", "배우지 않음"), `equipped`, `affordable`(보이는 보유량 `items`가 그 비용 이상인지. 골드 강화처럼 누른 틱까지 정산한 보유량으로 값을 치르므로 켜져 있으면 받아들여진다. 처치마다 바뀌므로 칸과 따로 신호라 목록은 스킬 상태가 바뀔 때만 다시 그림), `learn()`, `equip()`(고른 슬롯에), `unequip()`, `levelUp()`. 할 수 없는 것(배운 것을 다시 배우기, 배우지 않은 것의 장착·레벨업, 이미 그 슬롯, 모자란 비용)은 보내지 않습니다.
  - 화면(`UI/SkillScreen`, 큰 판): 메인 화면의 스킬 탭(`skillsButton`, `menu.skills`)이 엽니다. 머리 아래 슬롯 줄(`slots`, 가로 `ViewList`)의 칸(`SkillSlot`)마다 슬롯 이름, 장착한 스킬의 아이콘·레벨이 든 속성 색 칸(`Skills.icon`, 색 번호는 `SkillElement` 선언 순서 + 1, 빈 슬롯은 0), 스킬 이름이 있고 칸 전체가 고르는 버튼이며 고른 슬롯에 주황 테두리(`selectedMark`)가 켜집니다. 그 아래 스킬 목록(`skills`, `ScrollList`)의 칸(`SkillCell`)마다 속성 색 아이콘 칸(배우지 않았으면 잠긴 색), 이름, 레벨, 상태("장착 중", "배우지 않음"), 다음 비용과 오른쪽 버튼 둘이 있습니다. 동작 자리에는 배우기(배우지 않음, 낼 수 있을 때만 누름), 해제(장착 중), 장착(배웠고 장착하지 않음, 고른 슬롯에 넣음) 중 하나만 보이고, 레벨업은 배운 스킬에만 보이며 낼 수 있을 때만 누릅니다. 프리팹은 `Tools/UI/Build Skill Prefabs`(`Assets/Editor/UI/SkillPrefabs.cs`, `Build All Prefabs`의 강화 다음)가 만듭니다. Unity에서 전투의 포효를 배우고 슬롯 3에 장착한 뒤 늑대 소환으로 되돌렸고, 서버가 `SkillLearn`과 `SkillEquip`을 받아들였습니다.

**와이어와 저장**: `PlayerState`에 `skills`가 생기고 예측 규칙(쓰는 스킬, 레벨, 효과의 비율)이 바뀌어 `PROTOCOL_VERSION`이 14, 저장 형식이 10입니다(골드 강화의 9 다음). 9 → 10 마이그레이션은 이 버전의 기본 장착(1004, 1005, 1011을 1레벨로 배움)을 적어 넣어 게임 데이터 없이 전투가 같은 스킬로 이어집니다(체크포인트의 재사용 대기도 같은 순서). 나머지 스킬은 새 계정처럼 배웁니다. 체크포인트에 남은 능력치 효과(이 버전에서는 몬스터의 둔화뿐, 길어야 4초)는 `amount`가 0이라 남은 동안 듣지 않습니다. 슬라이스는 새 계정이 52바이트(키 포함 60), 다섯 스킬을 다 배우면 64바이트이고 배운 스킬 하나에 약 6바이트입니다. 요청 본문은 `SkillEquip`이 18바이트, 나머지 셋이 12바이트입니다. `shared/protocol/test/wire.test.ts`에 네 요청, 스킬을 싣는 응답, `SkillCostShort` 거절을 더했고 기존 스냅숏은 그대로입니다.

**곡선**(`npm run balance -- --hours 24`, 시드 1): 골드는 골드 강화와 같은 정책 하나로, 강화의 다음 단계와 장착한 스킬의 다음 레벨 중 가장 싼 것부터 삽니다(아래 밸런스 시뮬레이션). 강화(단계마다 1.15배)와 스킬 레벨업(레벨마다 1.6배)의 다음 비용 중 싼 쪽이 번갈아 오르므로 1시간에 강화가 27·27·26단계(골드 강화만일 때 28·28·27), 스킬이 4레벨이고, 세 스킬은 11시간에 10레벨이 됩니다(338,589골드). 레벨과 스테이지의 시각은 골드 강화만일 때와 같고(1시간 Lv34, 최대 레벨 15시간), 같은 레벨 안의 경험치는 6시간에 222,284 → 237,549(+7%), 24시간에 2,454,051 → 2,464,496으로 조금 앞섭니다. 전투력(능력치만 셈)은 골드가 스킬로 가는 만큼 6시간 6,027 → 6,012, 24시간 11,462 → 11,447로 조금 낮습니다.

**비용**: 기준(`feat/p0-foundation` 7b13da9, 골드 강화 포함)과 번갈아 세 번 잰 `npm run bench`의 중앙값입니다(Apple M4 Max, Node 22.14). 정산 60초 0.166 → 0.164 ms, 10분 0.853 → 0.870 ms(+2%), 오프라인 12시간 0.999 → 1.026 ms(+3%), 접속 1시간 5.32 → 5.60 ms(+5%)입니다. 효과를 걸 때와 소환수를 부를 때 공식이 `skillLevelRate`를 한 번 더 계산하고, 전투를 시작할 때 쓰는 스킬과 그 레벨을 모으는 몫입니다. 피해 배율은 스킬 행과 레벨로만 정해지므로 행마다 기억합니다(기억하기 전에는 몬스터가 나오고 능력치 효과가 바뀔 때마다 공식을 돌려 접속 1시간이 13% 느렸음). 밸런스 24시간은 156 → 162 ms입니다.

## 환생

확정한 레벨로 환생 포인트를 받고 레벨·스테이지·골드 강화·골드·경험치를 처음으로 돌립니다. 쌓은 포인트의 영구 배율은 영웅의 공격·방어·최대 HP와 처치·클리어 보상의 골드에 곱해집니다. 규칙은 `shared/game-core/src/rebirth.ts`(`rebirthPoints`, `rebirthRate`, `NO_REBIRTH`)와 `commands/rebirth.ts`에 있습니다.

| 원본 | 공식 | 뜻 |
| --- | --- | --- |
| `formulas.json` | `rebirthPoints` = `level >= rebirthMinLevel ? pow(level - rebirthMinLevel + 1, 2) : 0` | 확정한 영웅 레벨(새 입력 `level`)에서 환생하면 받는 포인트. 0이면 환생할 수 없습니다. 상수 30이라 30레벨 1, 40레벨 121, 47레벨 324, 50레벨 441입니다. |
| `formulas.json` | `rebirthRate` = `1 + rebirthRatePerPoint * points` | 쌓은 포인트(새 입력 `points`)의 영구 배율. 0포인트가 정확히 1이라 환생하지 않은 영웅의 전투는 비트까지 전과 같습니다(골든 벡터의 다이제스트, 24시간·168시간 CSV). 상수 0.001이라 50레벨 환생 한 번이 ×1.441입니다. |

```ts
interface RebirthState {
  count: number;   // 환생한 횟수. 화면과 밸런스 표가 보고, 배율은 읽지 않는다
  points: number;  // 받은 포인트의 합. 배율은 이것으로만 정한다
}
```

- **조건**: 따로 두지 않고 "받을 포인트가 1 이상"입니다. 최소 레벨을 `Constants`에도 적으면 공식과 같은 값이 두 곳에 생겨 어긋날 수 있으므로, 공식의 상수 하나(`rebirthMinLevel`)가 조건과 포인트를 함께 정합니다. 화면이 보이는 최소 레벨은 레벨표에서 포인트를 주는 첫 레벨로 찾습니다. 스테이지는 조건에 넣지 않았습니다: 마지막 스테이지(3006)에는 1시간에 닿아 진행의 깊이를 재지 못하고, 레벨은 15시간에 걸쳐 50까지 오릅니다.
- **포인트를 제곱으로 둔 이유**: 168시간(시드 1, 그 레벨에 닿으면 바로 환생)에 받는 포인트가 선형 `level − 29`이면 33–35레벨 환생에서 가장 많아(1,028–1,062포인트, 한 시간에 한 번 환생) 깊이 갈 까닭이 없습니다. 레벨업 요구량이 레벨마다 1.2배라서 한 판의 길이가 레벨에 지수로 늘기 때문입니다. 제곱이면 포인트는 40레벨 환생이 가장 많고, 평균 전투력은 최대 레벨까지 키우는 쪽이 높습니다(아래 곡선). 레벨의 능력치가 레벨마다 약 12% 오르므로 높은 레벨에 머무는 시간이 포인트의 차이보다 크게 듣기 때문이고, 그래서 "자주 환생해 포인트를 모으기"와 "끝까지 키우기" 사이에 고를 것이 생깁니다.
- **돌아가는 것**: `hero.level` 1, `stage`는 시작 스테이지(`firstStageId`, 새 계정과 같은 함수)에 클리어 없음, `statUpgrades`는 빈 맵, 보유량에서 골드(`goldItemId`)와 경험치(`expItemId`)의 키를 지우고(없는 키가 0), `battle`은 시작 스테이지의 새 사냥(웨이브 0, `autoBoss` 켬, 전투원 id 처음부터. 난수 상태는 스테이지 선택처럼 이어 받아 클라이언트와 서버의 `now`가 달라도 같은 수열)입니다. 해금은 저장하지 않고 클리어와 레벨에서 계산하므로(위 해금) 따로 돌릴 것이 없습니다.
- **남는 것**: 스킬(배운 것, 레벨, 장착), 장비(가진 것, 강화 단계, 착용), 다른 아이템(재료), 튜토리얼. 환생이 돌리는 것은 한 판의 진행(레벨, 스테이지)과 그것을 사는 재화·강화이고, 스킬과 장비는 상한이 있는 수집(스킬 10레벨, 장비 +10·+20)이라 남깁니다. 다시 깨는 스테이지의 클리어 보상이 같은 장비를 다시 주므로 합성(위 강화와 합성)의 재료도 모입니다. 골드를 남기면 환생하자마자 남은 골드로 골드 강화를 다시 사서 돌린 뜻이 줄고, 경험치는 레벨의 진행이라 레벨과 함께 돌립니다.
- **배율이 곱해지는 곳**: 능력치는 `heroStats`가 장비와 골드 강화의 가산 뒤에 공격·방어·최대 HP의 비율 수정치(`percent` = 배율 − 1)로 넣어 `floor((기본 + Σadd) × 배율)`이고, 효과(버프)의 비율은 그 위에 따로 얹힙니다. 치명 확률과 공격 간격은 곱하지 않습니다. 골드는 처치와 클리어 보상의 골드 수량에 곱하고(`addReward`의 `goldRate`), 수량은 처치마다 내림하므로 작은 보상은 배율보다 조금 덜 오릅니다(초록 슬라임 5골드 × 1.441 = 7.205 → 7). 오프라인 보상은 같은 사냥을 표본으로 돌리므로 따로 곱하지 않아도 배율이 들어갑니다.
- **경험치에는 곱하지 않습니다**: 처음에는 골드와 경험치를 함께 곱했는데, 경험치가 빨라지면 환생할 레벨에 빨리 닿고 포인트가 빨리 쌓여 배율이 다시 경험치를 빠르게 하는 되먹임이 생겼습니다. 선형 포인트에 30레벨 환생 정책으로 168시간에 9,128번 환생해 배율이 ×9,018이 되었고, 끝에는 정산(60초)마다 환생했습니다. 경험치를 빼면 한 판의 길이가 사냥의 경험치 속도로 정해져 배율이 시간에 선형으로 늡니다(50레벨 환생이 약 14.4시간마다).
- **클라이언트와 서버가 같게**: 배율은 저장 데이터의 `rebirth.points`와 공식(`Big`)으로만 정해지고 전투 안에서 바뀌지 않으며, 둘이 같은 `heroStats`와 전투를 돕니다. 능력치 비율은 `Big`을 double로 한 번 바꿔 다른 비율처럼 IEEE 연산으로 곱합니다(1 이상의 double에서 1을 빼고 더하면 그대로라 배율이 바뀌지 않음). `pathSignature()`에 포인트가 들어가 포인트가 다른 전투는 다른 길로 보고, 횟수는 넣지 않습니다.

| 커맨드 | Opcode | 하는 일 |
| --- | --- | --- |
| `Rebirth` | 600 | 본문 없음. 누른 틱까지 확정한 레벨(보이는 전투가 막 올린 레벨도 셈)로 포인트를 받고 위의 것을 돌립니다. 받을 포인트가 없으면 `RebirthNotReady`(600)입니다. |

- **지급과 초기화를 한 저장에서**: 커맨드가 돌려주는 새 상태 하나에 포인트와 초기화가 함께 있어, 서버는 다른 커맨드처럼 `UPDATE … WHERE revision = ?` 한 번과 답의 기록을 같은 트랜잭션에서 합니다(서버 코드는 바뀌지 않음). 같은 요청 id는 기록된 답을 받고, 재연결 전후 두 연결이 함께 환생하면 늦게 쓰는 쪽이 밀려 먼저 쓴 저장 데이터(1레벨)에서 다시 확인해 `RebirthNotReady`로 거절되므로 포인트는 한 번만 쌓입니다(`server/test/rpc.test.ts`의 rebirth). 다른 id로 다시 보낸 환생도 1레벨에서는 포인트가 없어 거절되므로, 본문에 기대하는 횟수를 담아 막을 것이 없습니다.
- **클라이언트**: 커맨드는 `progress.cmd.Rebirth({})`(Opcode에서 생김)이고 예측으로 바로 보이며, 거절 토스트는 "아직 환생할 수 있는 레벨이 아닙니다."입니다. 화면의 뷰모델은 `presentation/view-models/rebirth.ts`의 `createRebirthViewModel({ state, data, t, battle, progress, logger, confirm, close })`입니다(`battle`은 `heroLevel`과 `items`만 씀). `count`("환생 2회"), `rate`(지금 배율 "배율 ×1.44", 소수 둘째 자리까지 버림), `ready`(보이는 전투의 레벨에서 받을 포인트가 있음. 레벨은 경계에서 오르고 커맨드도 누른 틱까지 확정한 레벨을 보므로 메인 화면의 레벨과 같은 것), `gain`("Lv.47에서 환생하면 +324포인트, 배율 ×1.44 → ×1.76", 아니면 "Lv.30부터 환생할 수 있습니다."), `resets`(돌아가는 것을 줄마다: 레벨, 스테이지, 골드 강화 단계의 합, 보이는 골드), `rebirth()`(받을 포인트가 있으면 확인 팝업 "환생할까요? …"을 띄워 확인일 때만 보냄, 서버에 닿지 못하면 경고 로그만), `close()`를 냅니다. 남는 것은 화면의 고정 문구(`rebirth.keeps`)입니다. 화면(프리팹, `unity/views/`, 메인의 버튼, `screens.ts`의 팝업)은 아직 없습니다.
- **화면**(`UI/RebirthScreen`, 큰 판): 메인 화면 아래 탭 끝의 환생 탭(`rebirthButton`, `menu.rebirth`)이 엽니다. 위에서부터 환생 횟수(`countText`), 지금 배율(`rateText`, 골드 색), 받을 것(`gainText`, 환생할 수 없으면 몇 레벨부터인지), 처음으로 돌아가는 것의 여러 줄 목록(`resetsText`), 남는 것의 고정 문구(`keepsLabel`)와 아래쪽 환생 버튼(`rebirthButton`, `rebirth.button`, `ready`일 때만)이 있습니다. 버튼은 확인 팝업으로 물은 뒤 `Rebirth`를 보냅니다. 프리팹은 `Tools/UI/Build Rebirth Prefabs`(`Assets/Editor/UI/RebirthPrefabs.cs`, `Build All Prefabs`의 스킬 다음)가 만듭니다. Unity에서 40레벨로 맞춘 시험 계정이 환생하자 서버가 `Rebirth`를 받아들였고, 화면이 `환생 1회`, `배율 ×1.12`, 레벨 1·시작 스테이지, "Lv.30부터 환생할 수 있습니다."로 바뀌었습니다.

**와이어와 저장**: `PlayerState`에 `rebirth`가 생기고 예측 규칙(능력치와 골드의 배율)이 바뀌어 `PROTOCOL_VERSION`이 16, 저장 형식이 12입니다(11 → 12가 `{ count: 0, points: 0 }`을 넣음). 슬라이스는 16바이트(키 포함 26바이트, 23번 환생해 10,143포인트면 18바이트)입니다. 요청은 19바이트이고, 응답은 바뀐 슬라이스(`profile`, `items`, `statUpgrades`, `stage`, `battle`, `rebirth`)를 실어 약 290바이트입니다. 골든 벡터는 이벤트 다이제스트가 그대로이고 경계의 `rebirth`와 서명의 포인트(0)만 더해졌습니다. `shared/protocol/test/wire.test.ts`에 요청, 환생을 싣는 응답, `RebirthNotReady` 거절을 더했고 기존 스냅숏은 그대로입니다.

**곡선**(`npm run balance`, 시드 1): 정책은 정산 바로 뒤 `--rebirth` 레벨(기본 최대 레벨 50)에 닿았으면 환생합니다(아래 밸런스 시뮬레이션). 골드는 정산마다 다 쓰므로 환생이 버리는 골드는 한 정산 몫입니다.

| 시각 | 환생 없음: 레벨 / 전투력 | 기본 정책: 레벨 / 환생·포인트 / 전투력 |
| --- | --- | --- |
| 12시간 | 48 / 9,340 | 같음 |
| 15시간 | 50 / 11,551 | 28 / 1회·441 / 1,993 |
| 24시간 | 50 / 11,596 | 47 / 1회·441 / 12,187 |
| 72시간 | 50 / 11,706 | 49 / 4회·1,764 / 29,025 |
| 168시간 | 50 / 11,771 | 47 / 11회·4,851 / 50,190 |

첫 환생은 50레벨에 닿는 14–15시간이고, 다시 올라 24시간에 47레벨(전투력 12,187)로 이미 환생하지 않은 쪽(11,596)을 넘습니다. 그 뒤로 약 14.4시간마다 환생해 168시간에 배율이 ×5.85입니다. 정각마다의 전투력 평균은 첫날 8,858 → 7,332(다시 오르는 동안 낮음), 첫 주 11,308 → 23,150, 둘째 주 11,799 → 60,233입니다. 환생 레벨을 바꿔 잰 값은 다음과 같습니다(336시간).

| `--rebirth` | 168시간의 환생·포인트 | 첫 주 평균 전투력 | 둘째 주 평균 전투력 |
| --- | --- | ---: | ---: |
| 0 (환생 없음) | 0회·0 | 11,308 | 11,799 |
| 40 | 71회·8,591 | 14,015 | 38,603 |
| 44 | 34회·7,650 | 18,610 | 49,883 |
| 47 | 20회·6,480 | 21,076 | 56,659 |
| 50 | 11회·4,851 | 23,150 | 60,233 |

포인트는 40레벨 환생이 가장 많지만(42레벨 8,281, 35레벨 6,300) 평균 전투력은 50레벨이 가장 높아 기본 정책을 최대 레벨로 두었습니다. 골드 강화는 판마다 다시 사므로 168시간에 60·60·50단계(환생 없이 69·68·50)입니다.

**비용**: 기준(`feat/p0-foundation` c0f4f51)과 번갈아 세 번 잰 `npm run bench`의 중앙값이 정산 60초 0.169 → 0.165 ms, 10분 0.914 → 0.909 ms, 오프라인 12시간 1.057 → 1.049 ms, 접속 1시간 5.70 → 5.77 ms로 측정 오차 안입니다(Apple M4 Max, Node 22.14). 벤치의 계정은 환생하지 않아 처치마다 골드에 `Big.mul` 한 번이 더해질 뿐이고, 환생한 영웅의 `heroStats`는 0.48 → 0.52 µs입니다. `Rebirth` 한 번은 2.9 µs이고 플레이어가 누를 때만 나갑니다. 밸런스는 24시간 168–169 → 180–181 ms(환생 없이 168–172 ms), 168시간 884–902 → 1,560–1,576 ms입니다. 다시 오르는 동안 골드 강화를 다시 사며(강화마다 사냥을 다시 시작) 앞 스테이지를 다시 도는 몫으로 보이고, 툴의 비용입니다([docs/performance.md](docs/performance.md)).

## 오프라인 보상

접속하지 않은 동안의 보상은 따로 받는 흐름 없이 전투 정산이 줍니다. 정산은 체크포인트(`battle.at`, 마지막으로 확정한 경계)부터 `now`까지를 확정하는데, 그 공백이 `MAX_SETTLE_TICKS`(10분)를 넘으면(`isStaleCheckpoint`) 다시 돌리는 대신 오프라인 보상을 지급하고 `now`에서 새 사냥을 시작합니다. 규칙은 `shared/game-core/src/battle/offline.ts`에 있습니다.

| 상수 | 값 | 뜻 |
| --- | --- | --- |
| `Constants.offlineCapHours` | 12시간 | 오프라인 보상이 인정하는 가장 긴 공백 |

- **계산**(`offlineReward(state, data, now)`): 체크포인트의 난수 상태에서 지금 스테이지의 사냥만(`mode`는 사냥, `autoBoss` 끔. 보스 도전과 클리어 없음) 떠날 때 레벨로(`startBattle`의 `levelUps: false`) `MAX_SETTLE_TICKS` 돌리고, 번 것에 인정 시간 `elapsed(battle.at, now, offlineCapHours × HOUR)`을 그 길이(10분)로 나눈 배율을 곱해 아이템마다 내림합니다. 레벨업이 없으면 보유량이 전투에 영향을 주지 않으므로, 표본은 빈 보유량에서 시작하고 끝난 보유량이 번 것 전부입니다(빼기가 없어 `Big.sub`의 오차도 없습니다). 결과(`OfflineReward`: `duration`, `items`)의 `items`를 `grant`로 지급합니다. 보상이 처치 보상(`Monsters.rewardAmounts`)과 떠날 때의 능력치에서 바로 나오므로 따로 정한 시간당 보상 열은 없고, 입은 장비도 능력치로 반영됩니다(장비 자체는 클리어와 보스의 보상이라 사냥만 재는 오프라인 보상으로는 나오지 않습니다). 오프라인 동안 처치 수, 스테이지, 보스는 바뀌지 않습니다. 체크포인트가 없던 저장 데이터(`at` 0, 마이그레이션)는 받지 않습니다.
- **레벨업**: 낡은 체크포인트의 정산은 `now`에서 새 사냥을 시작하는 경계이므로, 지급한 경험치로 같은 정산에서 바로 `levelUp`을 부르고 새 사냥을 오른 레벨의 최대 HP로 시작합니다. 그래서 저장 데이터에 요구량을 넘긴 경험치가 남지 않습니다. 전투가 낸 일이 아니라서 `levelUp` 이벤트(레벨 업 글자)는 없고, 오른 레벨은 보상 팝업(38)이 보여 줍니다.
- **확정**: 로그인이나 재개 뒤 클라이언트의 첫 프레임이 낡은 체크포인트를 보고 바로 보내는 `BattleSettle`이 확정합니다(위 정산 시점). 연결이 살아 있는 채 프레임이 멈췄다 돌아온 경우도 같은 길입니다. 서버의 로그인과 재개는 저장 데이터를 읽기만 하고 전투를 알지 않습니다.
- **한 번만 지급**: 지급 기록은 체크포인트의 시각입니다. 오프라인 정산은 `items`, `hero`, `battle.at = now`를 같은 저장(`UPDATE … WHERE revision = ?`) 한 번으로 바꾸므로, 다음 정산은 옮겨진 체크포인트부터 셉니다. 같은 요청 id로 다시 보낸 정산은 기록된 답을 받고, 재연결 전후 두 연결이 같은 공백을 함께 정산하면 늦게 쓰는 쪽이 밀려 옮겨진 체크포인트(공백 0)에서 다시 적용하므로 보상이 없습니다(`server/test/rpc.test.ts`의 offline rewards).
- **클라이언트**: 전투 서비스가 서버가 받아들인 오프라인 보상을 `offlineReward` 이벤트(위 이벤트 버스)로 알리고, 메인 화면이 보상 팝업으로 보입니다. 이벤트에는 떠날 때의 레벨과 정산 뒤의 레벨도 실려서, 레벨 업 글자가 없는 오프라인 레벨업을 팝업이 보여 줍니다. 보유량(`items`)과 레벨은 정산을 보내는 프레임에 예측으로 바로 오르고, 이벤트는 서버가 그 정산을 받아들인 뒤에 납니다. 실패한 정산은 다음 프레임에 다시 보내므로 받아들여진 것만 알립니다. 값은 클라이언트의 `now`로 계산한 예측이라, 서버가 자기 `now`로 확정한 양과 RTT × 보상률만큼(12시간에 RTT 100 ms면 약 2×10⁻⁶배) 다를 수 있습니다. 상태가 아니므로 화면을 다시 열어도 다시 뜨지 않습니다.

**비용**: 소환수(59) 뒤로 12시간 오프라인 보상은 중반 계정에서 1.01 ms입니다(`npm run bench`, 59 전 0.70 ms, 58 전 0.65 ms, 57 전 0.55 ms, 56 전 0.26 ms). 아래는 56 전의 값입니다. Apple M4 Max, Node 22.14(esbuild 번들)에서 `autoBoss`를 끈 사냥을 쟀습니다(1레벨 영웅의 3002, 5레벨의 3003, 10레벨의 3004, 레벨업 이후). 6,000틱 표본이 0.20–0.21 ms라서 오프라인 보상은 공백 길이와 무관하게 정산 한 번의 상한과 같습니다. 공백을 다시 돌리면 12시간에 14.1–14.5 ms(1시간에 약 1.2 ms)가 들고 그동안 Node 이벤트 루프가 막힙니다. 동접 1만 명, 평균 세션 30분(접속 초당 약 5.6건)이면 표본 방식은 건당 약 0.26 ms(트랜잭션 63 µs 포함)로 코어 하나의 약 0.15%, 서버를 다시 켠 뒤 1만 명이 10초 안에 몰려도(초당 1,000건) 약 26%입니다. 다시 돌리면 평균 약 3.9%, 모두 상한이면 약 7.7%이고 몰릴 때는 코어 약 14개 분량이라 따라가지 못합니다(추정). 정확도는 같은 시드 다섯 개씩으로 12시간을 다시 돌린 보상과 비교했습니다. 레벨을 고정하고 다시 돌린 것과는 15번 중 14번이 ±5% 안이고 1번(10레벨, 3004)이 +15.6%입니다. 레벨업하며 다시 돌린 것(지금 곡선이면 1레벨 영웅이 12시간에 39레벨)의 16–33%라서, 오래 떠날수록 접속해 있던 것보다 적게 받습니다. 표본 안에서도 레벨업을 반영하면 29–65%이지만 레벨 문턱의 위치에 따라 흔들립니다. 떠날 때 레벨의 기대치로 정했고, 차이는 경험치 곡선으로 조절합니다.

## 밸런스 시뮬레이션

`npm run balance -- --hours 24`는 서버가 만드는 새 계정(`createPlayer`, `@idle/server/save`)으로 N시간을 플레이하고, 정각마다의 레벨, 환생(횟수/포인트), 장비가 아닌 아이템의 보유량(골드, 레벨업에 쓰고 남은 경험치), 스테이지, 영웅 능력치(`heroStats`), 전투력, 강화 단계(`upgrades`, StatUpgrades ID 순서), 장착한 스킬의 레벨(`skills`, 슬롯 순서), 입은 장비(강화 단계)를 표로 찍고 CSV(기본 `balance/out/balance.csv`, `--csv`로 바꿈)로 씁니다. 코드는 `balance/`(`@idle/balance`)에 있고, 옵션은 `npm run balance -- --help`가 보여 줍니다.

- **플레이**: 규칙을 따로 두지 않습니다. 접속해 있는 동안 `--step`초(기본 60, 클라이언트의 정산 간격)마다 `BattleSettle`을 `applyCommand`로 적용하고, 정책이 고른 커맨드도 같은 길로 적용합니다. 정책은 다섯입니다. 정산 바로 뒤 `--rebirth` 레벨(기본은 `HeroLevels`의 최대 레벨, 0이면 하지 않음)에 닿았고 받을 포인트가 있으면 환생합니다(`Rebirth`, 위 환생의 곡선). 같은 슬롯에 입은 것보다 전투력이 높은 장비는 입습니다(`ItemEquip`). 클리어한 스테이지에 머물러 있으면(다음 스테이지가 레벨 해금을 기다림) 해금된, 아직 클리어하지 않은 스테이지 중 가장 작은 ID로 옮깁니다(`StageSelect`). 클리어하지 않은 보스 스테이지에서 자동 도전이 꺼져 있으면(보스에게 짐) 그 스테이지에서 마지막으로 도전했을 때보다 전투력이 오른 뒤 다시 도전합니다(`BossChallenge`). 성장은 하나로 삽니다: 강화의 다음 단계(`StatUpgrade`), 장착한 스킬의 다음 레벨(`SkillLevelUp`), 입은 장비의 다음 강화 단계(`ItemEnhance`) 중 낼 수 있는 가장 싼 것부터, 낼 수 있는 것이 없을 때까지 삽니다(같으면 강화를 ID 순서로, 그다음 스킬을 슬롯 순서로, 그다음 장비를 슬롯 순서로. 아래 스킬과 강화와 합성의 곡선). 스킬 배우기와 장착 바꾸기, 장비 합성은 하지 않습니다(같은 장비는 지난 스테이지를 다시 돌아야 모이고 정책은 앞으로만 감). 새 계정은 슬롯이 다 찬 채 시작해 배운 스킬을 쓰려면 바꿔 끼워야 하는데, 이 툴에는 스킬의 값어치를 재는 기준이 없습니다(전투력은 능력치만 봄). 클리어 뒤 다음 스테이지로 옮기는 것은 전투가 합니다. 정책이 보낸 커맨드가 거절되면 정책이나 규칙의 버그이므로 던집니다.
- **오프라인**: `--online <시간> --offline <시간>`을 주면 접속과 공백을 번갈아 둡니다. 공백 동안은 커맨드를 보내지 않으므로 저장 데이터가 떠날 때 그대로이고(`online` 열이 `off`), 돌아와서 보내는 첫 정산이 오프라인 보상을 줍니다(공백이 10분을 넘을 때, 위 오프라인 보상).
- **결정성**: 시작 시각이 고정이고 전투 난수의 시작 상태가 `--seed`(uint32, 기본 1)라서 같은 옵션이면 같은 곡선이 나옵니다(`balance/test/simulate.test.ts`).
- **전투력**: 장비를 고르고 곡선을 한 수로 보려고 이 툴이 정한 `floor(attack + defense + maxHp / 10)`입니다. 게임 규칙이 아니며, 게임이 전투력을 보여 주게 되면 그 정의를 씁니다.
- **공식 툴 연계**: 능력치 열 이름(`attack`, `defense`)이 Formula Lab의 스탯 key와 같아서, 어느 시각의 영웅 값을 시뮬레이션 패널의 시전자 입력으로 옮길 수 있습니다. `--formulas <프로젝트.json>`을 주면 그 Formula Lab 프로젝트를 formula-tool의 내보내기(`tools/formula-tool/scripts/export-typescript.mjs`, `npm run generate`와 같은 검증과 코드 생성)로 바꾼 코드를 `shared/game-core/src/formulas.ts` 대신 묶어 돌립니다. 생성 파일과 `data/formulas.json`은 건드리지 않으므로, 공식이나 상수를 고친 사본으로 돌린 CSV를 원래 곡선과 비교하고 마음에 들면 `data/formulas.json`에 옮긴 뒤 `npm run generate`합니다.
- **전투 미리보기**(`balance/src/preview.ts`): Formula Lab의 "전투 미리보기"가 `node balance/run.mjs --preview`를 부르고(`data/formulas.json`의 `previewSettings`), 표준 입력의 JSON `{ project, stageId, level, seconds, seed }`에서 프로젝트를 위 `--formulas`와 같은 방법으로 바꿔 묶습니다. 새 계정을 그 스테이지로 옮기고 레벨을 정한 뒤(장비 없음, 해금 레벨보다 낮아도 됨) 사냥을 `seconds`초(1–86400) 돌려, 영웅이 준 피해·지속 피해·DPS·처치·사망·받은 피해·막은 양·회복, 진행(레벨, 스테이지, 웨이브, 클리어, 보스 승패, 레벨업), 영웅 스킬별(쓴 수, 치명, 맞힌 수, 피해)과 효과별(건 수, 틱, 양) 합계를 JSON 한 줄로 표준 출력에 씁니다. 잘못된 요청이나 공식은 문장을 표준 오류에 쓰고 1로 끝납니다. 툴은 결과의 모양을 모르고 그대로 표로 보입니다. 응답 시간은 60초 전투 95 ms, 1시간 116 ms, 24시간 189 ms이고, 요청마다 프로세스를 띄우는 이유와 다른 방법의 수치는 [tools/formula-tool/README.md](../tools/formula-tool/README.md)에 있습니다.
- **실행**: Node 22.14는 TS의 enum과 `.js`로 적은 `.ts` import를 그대로 돌리지 못하므로 `balance/run.mjs`가 `src/cli.ts`(미리보기는 `src/preview.ts`)를 esbuild로 메모리에 묶어(약 14 ms) 실행합니다. 경로 인자는 저장소 루트 기준입니다.

**비용**: Apple M4 Max, Node 22.14(esbuild 번들), 정산 간격 60초에서 잰 시뮬레이션 시간입니다. 소환수(59) 뒤로 내내 접속하면 24시간이 149–152 ms(플레이 1시간에 6.3 ms, 번갈아 잰 59 전은 123–125 ms이고 효과의 양을 공식으로 옮긴 60은 59 없이 잰 값이 123.4–124.7 ms로 같고 CSV가 바이트까지 같음, 58 전은 116–117 ms, 57 전은 93–95 ms, 56 전은 53–54 ms)입니다. 곡선은 늑대만큼 조금 빨라졌습니다(1시간 레벨 32 → 33, 최대 레벨 16시간 → 15시간, 24시간 골드 287만 → 295만. 58은 271만 → 287만). 아래는 56 전의 값입니다(명령 전체는 24시간에 0.18–0.19초). 내내 접속하면 24시간이 52–55 ms로 플레이 1시간에 2.2–2.3 ms, 168시간이 261–281 ms로 1.6–1.7 ms입니다(시드 셋, 둘). 짧을수록 JIT가 덜 데워진 앞부분의 몫이 큽니다. 1시간 접속·7시간 공백을 번갈아 두면 24시간이 21–23 ms(0.9 ms)이고, 공백은 오프라인 보상의 표본 한 번(약 0.2 ms)이라 거의 접속한 시간만큼 듭니다. 정산 간격을 10초로 줄이면 24시간이 92 ms(3.9 ms)라서 정산과 정책 한 번이 약 5 µs이고, 60초 간격에서 1시간의 대부분(약 1.3 ms)은 정산 사이의 전투 36,000틱입니다.

## 소리

소리는 테이블 키로 냅니다. `data/Sounds.xlsx`의 행 하나가 키(`id`, 예: `sfx.hit`), 채널(`channel`: `bgm`이나 `sfx`), 클립(`clip`: 에셋 키, `Assets/Remote` 기준 경로), 그 소리의 크기(`volume`, 0–1)입니다. 반복은 채널이 정합니다: BGM은 하나만 반복해서 돌고, 효과음은 한 번씩 겹쳐 납니다. 채널은 Enums 테이블의 `SoundChannel`이고 설정의 채널 키(`application/settings/settings.ts`)도 이것이라 매핑이 없습니다.

- **재생**(`presentation/audio/audio.ts`): `playBgm(key, scope)`는 스코프가 닫힐 때까지 BGM을 틀고, `play(key)`는 효과음을 한 번 냅니다. 클립은 처음 쓸 때 불러와 앱이 끝날 때까지 쥡니다(지금 모두 합쳐 1.1MB). 크기는 테이블의 `volume` × 설정의 채널 볼륨이고 뮤트면 0이며, BGM은 설정이 바뀌면 따라갑니다. 없는 키, 다른 채널의 키는 경고만 남기고, 못 불러온 클립은 한 번만 오류로 남긴 뒤 소리 없이 지나갑니다.
- **어디서**: 메인 화면이 열려 있는 동안 보이는 전투의 스테이지 BGM(`Stages.bgm`)이 돌고, 스테이지를 옮겨 곡이 바뀔 때만 새 곡을 먼저 틀고 앞 곡을 닫습니다(`screens.ts`의 `playStageBgm`). 지금은 훈련 초원·숲 입구가 `bgm.battle`, 고블린 야영지·오우거 요새가 `bgm.fortress`, 얼어붙은 고개·용의 둥지가 `bgm.peak`입니다. 전투의 효과음은 연출자(`BattleDirector`)가 이벤트에서 냅니다. 공격은 맞으면(발사체는 떨어지면) 스킬의 속성 소리(`Skills.sfx`: 불 `sfx.fire`, 얼음 `sfx.ice`, 독 `sfx.poison`, 신성 `sfx.holy`, 비면 `Constants.hitSfx`)이고, 치명타는 늘 `critSfx`입니다. 맞는 대상도 발사체도 없는 스킬(치유의 빛)은 쓸 때 속성 소리를 냅니다. 그 밖의 효과음은 `Constants`의 소리 상수입니다(치명타 `critSfx`, 몬스터 처치 `killSfx`, 보스 등장 `bossSfx`, 스테이지 클리어 `clearSfx`, 레벨업 `levelUpSfx`). 따라잡은 프레임(`reset`)은 소리를 내지 않습니다. 무언가를 누를 때(버튼, 탭, 목록의 칸, 토글)는 `clickSfx`(`sfx.click`)가 나고, 바인딩의 `listenPress` 한 곳이 뷰 컨텍스트로 냅니다(위 화면: MVVM). Constants의 키가 Sounds에 있는지는 변환이 검사하고(`ref`), 코드가 쓰는 키는 생성된 키 타입(`SoundsId`)이라 타입 검사가 잡으며, 모든 행의 클립 파일이 있는지는 테스트가 확인합니다.
- **C#**: `AudioFacade`가 `PlayBgm(assetId, volume)`(같은 클립이면 볼륨만), `SetBgmVolume`, `StopBgm`, `PlaySfx(assetId, volume)`(`PlayOneShot`)만 열고, 클립은 `ResourceFacade`가 불러온 로드 id로 받습니다. 볼륨 계산은 TS가 합니다. 소리 나는 오브젝트(`Audio`, `DontDestroyOnLoad`)는 `AudioRoot`가 처음 쓸 때 만들고, 씬에 AudioListener가 없으면(01_Init의 카메라에는 없음) 거기에 붙입니다.
- **파일**: `client/Assets/Remote/Audio/`의 WAV(16비트 모노 22.05kHz, LFS)는 `npm run sounds -w @idle/client`(`client/TypeScript/tools/make-sounds.mjs`)가 사각파·삼각파·잡음으로 합성한 것이라 라이선스가 없습니다. 시드한 잡음이라 다시 돌려도 같은 파일이 나옵니다. BGM은 4마디 반복 세 곡(120BPM 8초 345KB 둘, 150BPM 6.4초 276KB)이고, 효과음은 2–41KB(버튼 0.05초 2.2KB)입니다. 소리를 고치면 스크립트를 고쳐 다시 돌리고 WAV와 함께 커밋합니다. 가져오기 설정은 Unity 기본값(Decompress On Load)입니다.

## 튜토리얼

새 계정은 `data/TutorialSteps.xlsx`의 스텝을 ID 순서로 하나씩 마칩니다. 행 하나가 스텝이고 대사의 키(`textKey`, 문장은 Strings), 비출 UI(`target`), 대상의 화면이 닫혀 있을 때 대신 비출 UI(`opener`), 넘어가는 조건(`unlockStageId`, `unlockLevel`, `equipSlot`)입니다. 지금 아홉 개(누름 → 3001 클리어 → 장비 탭 → 무기 착용 → 장비 탭 다시 누름(닫기) → 레벨 5 → 가방 탭 → 가방 탭 다시 누름(닫기) → 누름)입니다. 아래 판에는 닫기 버튼이 없어, 닫기 스텝은 같은 탭(`main.equipmentButton`, `main.inventoryButton`)을 한 번 더 누르게 비춥니다.

- **조건**: 해금 조건과 같은 구조입니다. 조건은 그 행의 열이고 빈 칸은 없는 것이며, 적은 것을 모두 채우면 넘어갑니다. `unlockStageId`·`unlockLevel`은 `Stages`와 같은 이름이라 `isUnlocked`를 그대로 쓰고, 새 조건 종류인 장비 착용(`equipSlot`, 그 슬롯에 입은 것이 있음)은 같은 방식으로 `isStepDone`(game-core `tutorial.ts`)에 더했습니다. 셋 다 비면 누름 스텝입니다(`waitsForTap`). 대상이 있으면 대상을, 없으면 화면 어디든 누르면 넘어가고, 서버는 누름을 확인할 수 없어 받아들이되 건너뛰기는 막습니다. 검사 열은 `unlockStageId` → `Stages`, `unlockLevel` → `HeroLevels`, `equipSlot`의 `EquipSlot`, `id`의 `1..`입니다.
- **저장과 커맨드**: 진행은 `PlayerState.tutorial = { stepId }`(지금 스텝, 마치면 null) 하나입니다. `TutorialAdvance { stepId }`(500)가 지금 스텝을 마치고 다음 ID로 옮깁니다. 핸들러(`commands/tutorial.ts`)는 보낸 스텝이 지금 스텝이 아니면 `TutorialStepNotCurrent`(500)로 거절해 건너뛰기와 되돌리기(마친 스텝을 다른 요청 id로 다시 보냄)를 막고, 스테이지 선택처럼 누른 틱까지 정산한 뒤 조건이 모자라면 `TutorialStepUnmet`(501)로 거절합니다. 같은 요청 id는 다른 커맨드처럼 기록된 답을 받고, 저장은 revision 조건부 갱신입니다. 새 계정은 가장 작은 ID부터 시작하고(`startTutorial`), 테이블이 지금 스텝을 지우면 그 ID 이상인 첫 스텝이 지금 스텝이며, 마친 계정은 뒤에 더한 스텝을 보지 않습니다.
- **화면**(`presentation/view-models/tutorial.ts`, 뷰 `unity/views/tutorial.ts`, 프리팹 `UI/TutorialOverlay`는 `Tools/UI/Build Tutorial Prefabs`의 `Assets/Editor/UI/TutorialPrefabs.cs`): 메인 상태가 지금 스텝이 있는 동안 오버레이 레이어에 열고, 마치면 닫습니다.
  - **대상**: `화면 이름.ViewRefs 항목 이름`(예: `main.equipmentButton`, `equipment.items`)입니다. 화면 이름은 `Views`의 키이고 항목 이름은 그 프리팹의 ViewRefs(뷰의 바인딩 표가 읽는 이름)라서 인스펙터의 ViewRefs에서 고릅니다. 뷰모델이 UI 스택의 `shown`에서 그 화면 프리팹의 맨 위 인스턴스를 찾고, 뷰(`spotlight` 바인더)가 그 ViewRefs에서 항목을 읽어 C# `Spotlight`에 넘깁니다. 대상이 버튼이면 그 클릭이 누름이고, 버튼 자신의 동작(장비 화면 열기 등)도 그대로 돕니다. 배포 데이터의 대상과 `opener`가 그 뷰의 바인딩 표에 있는지와 누름 스텝의 대상이 버튼인지는 클라이언트 테스트(`test/tutorial.test.ts`)가 봅니다.
  - **막기**: 대상이 있으면 `Spotlight`가 대상 둘레를 어두운 막 넷으로 덮어 그 밖의 탭을 막고, 대상 자리는 비워 아래 레이어의 대상이 눌리게 합니다. 자리는 C# `LateUpdate`가 따라가고 바뀔 때만 씁니다. 대상이 없는 누름 스텝은 화면 전체를 덮는 누름 버튼("화면을 누르면 계속합니다", `tutorial.tapToContinue`)이고, 조건을 기다리는 스텝은 대사만 보이고 막지 않습니다. 대상의 화면이 열려 있지 않으면(팝업을 아직 열지 않았거나, 뒤로 가기로 닫았거나, 재시작해서 팝업이 닫힌 채 그 스텝으로 돌아옴) 스텝의 `opener`(그 화면을 여는 버튼, 착용 스텝은 `main.equipmentButton`)를 대신 비춰 길을 알려 주고, 대상의 화면이 열리면 대상으로 옮깁니다. 조건 스텝에서 `opener`를 눌러도 넘어가지 않고 버튼 자신의 동작(팝업 열기)만 돕니다. `opener`도 없으면 조건 스텝은 막지 않고, 누름 스텝은 화면 어디든 누르면 넘어가게 해 막혀 버리지 않습니다. 대사 창은 대상의 반대쪽(화면 위나 아래)에 놓입니다. 스크롤 목록이 대상이면 칸이 있는 곳(내용과 보이는 영역이 겹치는 곳)만 비춥니다. 빈 영역까지 비추면 구멍이 화면 대부분을 차지해 대사 창이 장비 화면의 능력치 줄을 가렸습니다. 막 넷과 누름 버튼은 세이프 에어리어 밖까지 덮고(빌더의 `UiPrefabs.Bleed`), 대사 창은 세이프 에어리어 안에 있습니다. 대상 자리는 대상의 월드 꼭짓점을 막의 좌표로 옮겨 구하므로, 대상이 다른 레이어에 있어도, 세이프 에어리어나 캔버스 배율이 바뀌어도 맞습니다. 대상을 눌러 넘어가는 리스너는 소리를 내지 않아서, 누름 소리는 대상 버튼의 바인딩이 한 번 냅니다(누름 버튼도 한 번).
  - **순서**: 오버레이라서 팝업 위에 그려지므로, 전환 화면이 다 걷히기 전(`transition.clear`)과 대상의 화면이 아닌 팝업이 맨 위에 있는 동안(오프라인 보상, 로그아웃 확인, 처리되지 않은 오류의 재시작 팝업)에는 숨고 막지 않습니다. 그 팝업을 닫으면 다시 나옵니다. 상태를 떠나려고 가리기 시작하면 곧바로 숨어 페이드 위에 남지 않고, 로딩 표시는 기다릴 때 열려 튜토리얼 위에 있습니다. 앱 시작에 여는 토스트와 개발 빌드의 디버그 오버레이는 먼저 열려 그 아래에 있으므로, 막이 있는 스텝에서는 토스트가 어둡게 보이고 DEV 버튼이 눌리지 않습니다.
  - **진행**: 조건 스텝은 저장 데이터와 보이는 전투의 레벨(메인 화면의 해금과 같은 판단)로 채운 것을 보면 `TutorialAdvance`를 한 번 보냅니다. 예측이 곧바로 다음 스텝으로 옮기고, 거절되면 그 스텝으로 돌아와 저장 데이터가 다음에 바뀔 때 다시 봅니다. 다른 커맨드의 예측이 조건을 채운 그 자리에서도 불리므로, 그 커맨드가 먼저 나가도록 다음 마이크로태스크에 보냅니다(커맨드는 보낸 순서대로 처리됨).
- **마이그레이션**: 4 → 5가 `tutorial: { stepId: null }`(마침)을 넣습니다. 튜토리얼이 생기기 전부터 하던 계정에 처음 안내를 다시 보이지 않기 위해서입니다. 다시 보려면 새 ID로 로그인합니다. 텍스트 ID라 계정을 새로 만드는 데 드는 것이 없어 초기화 치트는 두지 않았습니다.
- **대상을 찾는 방법을 고른 이유**: 열린 뷰는 UI 스택이 이미 쥐고 있고 ViewRefs 항목 이름은 바인딩 표가 쓰는 이름이라, 새로 등록하는 곳 없이 이름 두 개로 찾습니다. 뷰마다 바인딩한 객체를 등록부에 넣으면 모든 뷰가 열 때마다 항목 수만큼 등록하고 전역 등록부나 `View.bind`의 인자가 늘며, C#이 게임 오브젝트 이름이나 경로로 찾으면 프리팹 빌더가 바꾸는 계층 이름에 데이터가 묶이고 찾는 코드가 C#에 생깁니다.
- **비용**(Apple M4 Max, Node 22.14): 지금 스텝 찾기와 조건 판정이 34–41 ns(스텝 아홉 개를 훑음), 경계가 없는 `TutorialAdvance` 적용(정산 포함)이 0.51–0.55 µs입니다. 계정마다 스텝 수만큼(지금 아홉 번) 커맨드가 나가고, 요청 본문은 27바이트(요청 id "12"), 바뀐 슬라이스 `tutorial`은 18바이트이며 저장 데이터도 그만큼 늘어납니다. 클라이언트는 뷰가 열리고 닫힐 때 열린 뷰(여섯 개 남짓)를 훑을 뿐 프레임마다 도는 TS 코드가 없습니다.
- **와이어와 저장**: `PlayerState`에 `tutorial`이 생겨 `PROTOCOL_VERSION`이 8, 저장 형식이 5입니다.

## 문장과 언어

화면에 보이는 문장은 모두 `data/Strings.xlsx`에 있습니다. 행 하나가 키(`id`, 예: `menu.settings`, `item.oldSword`)와 언어마다의 문장(`ko`, `en` 열)이고, 언어 열이 곧 고를 수 있는 언어(ISO 639-1)입니다. 지금 한국어(기본)와 영어, 123줄입니다.

- **테이블의 표시 문장은 키**: `Items`·`Stages`·`Monsters`·`Skills`·`Heroes`의 이름은 `nameKey`, `TutorialSteps`의 대사는 `textKey` 열이고 값은 Strings의 키입니다(검사 열 `ref Strings`). 테이블마다 언어별 열(`name_ko`, `name_en`)을 두지 않은 이유: 언어를 더할 때 고칠 곳이 Strings의 열 하나이고(언어별 열이면 이름이 있는 테이블 여섯 개와 화면 글자의 표에 같은 열을 더하고, 테이블마다 언어가 빠지지 않았는지 따로 맞춰야 함), 번역은 한 시트에서 하며, 화면 글자(버튼, 토스트)와 테이블 이름이 같은 조회 하나(`t(key)`)로 나옵니다. 키는 `item.oldSword`처럼 읽히는 이름이라 Items.xlsx만 보고도 무엇인지 압니다. 대가는 새 아이템의 이름을 Strings에도 한 줄 적는 것이고, 키를 잘못 적으면 변환이 그 셀을 짚어 실패합니다. 열 이름을 `name`이 아니라 `nameKey`로 바꾼 것은 값이 문장이 아니라는 표시이자, 이름을 바로 보이던 코드를 타입 검사가 모두 찾게 하려는 것입니다. 기획 메모(`note`)는 화면에 보이지 않으므로 한국어 그대로입니다.
- **검사**: 언어 열은 필수 문자열이라 번역이 빠진 칸은 변환이 그 셀을 짚어 실패하고(`idle/data/Strings.xlsx: Data!C12: 'en' is required`), 키 열에 Strings에 없는 키를 적으면 실패합니다(`idle/data/Items.xlsx: Data!B4 (nameKey): "item.axe" is not an id in Strings`). 둘 다 `npm run generate`와 `npm test`(`--check`)가 잡습니다. 코드가 쓰는 키는 생성된 타입이 잡습니다: data-tool이 문자열 id 테이블마다 id의 리터럴 유니온(`StringsId`)을 내보내고 그 테이블을 가리키는 키 열의 타입도 그것이라, 없는 키나 Strings에서 지운 키를 쓰는 코드는 `npm run typecheck`가 실패합니다. 같은 키의 언어들이 같은 `{이름}` 인자를 쓰는지는 클라이언트 테스트가 배포 데이터로 봅니다(`test/text.test.ts`).
- **조회**(`presentation/text.ts`): `t(key, args?)` 하나입니다. `{이름}` 자리를 이름 붙인 인자로 채우고(`t("battle.levelUp", { level: 5 })` → `레벨 업! Lv.5`), 넘기지 않은 인자는 `{이름}` 그대로 남깁니다. 큰 수와 시간은 표기(`formatBig`, `formatTimer`)로 바꿔 넘깁니다. `formatBig`의 단위(K, M, B, T, aa…)는 방치형의 표기라 언어마다 같고, 타이머의 날 수만 언어마다 Strings(`format.days`: `1일 23:59:59`, `1d 23:59:59`)를 씁니다. 로그와 오류 메시지는 영어이고 키로 바꾸지 않습니다.
- **언어 고르기**: 언어는 설정(위 클라이언트 구조의 `settings.ts`, `settings` JSON의 `language`)에 있습니다. 저장된 것이 없으면 기기 언어(`Display.language()`, C# `DisplayFacade.Language`가 `Application.systemLanguage`를 ISO 639-1로)가 Strings에 있으면 그것, 없으면 한국어입니다. 저장된 언어가 Strings에서 빠졌으면 그 필드만 이 기본값입니다. 설정 화면의 언어 탭은 언어마다 그 언어로 쓴 이름(Strings의 `language.name` 줄: 한국어, English)을 보입니다.
- **다시 그리기**: `t`는 설정의 언어 신호를 읽으므로, 뷰모델의 `computed` 안에서 부른 문장은 언어가 바뀌면 다시 계산되고 바인딩이 바뀐 글자만 C#에 보냅니다. 그래서 언어를 고르면 열려 있는 화면(설정 팝업 아래의 메인 포함)이 그 자리에서 바뀌고, 화면을 다시 열거나 재시작하지 않습니다. 탭 이름도 신호입니다(`Tab.label`). 토스트, 확인 팝업의 물음, 치트 결과, 전투 배너처럼 한 번 띄우는 문장은 띄울 때의 언어입니다.
- **프리팹의 고정 글자**: 버튼 이름, 제목, 입력란의 안내처럼 바뀌지 않는 글자도 TS가 채웁니다. 프리팹 빌더는 글자를 비워 두고 그 `TMP_Text`를 ViewRefs 항목(`…Label`, `idPlaceholder`, `cheatPlaceholder`)으로 내놓고, 뷰의 바인딩 표가 `label("menu.settings")` 바인더로 키를 적습니다. 바인더는 뷰 컨텍스트의 `t`로 채우고 언어가 바뀌면 다시 채웁니다. 키가 TS에 있어 타입 검사가 잡고, 항목이 없는 프리팹은 열 때 실패합니다. C#이 키로 채우는 길(프리팹에 키를 적는 컴포넌트)은 쓰지 않습니다: C#도 문장 테이블을 읽고 언어가 바뀐 것을 알아야 해서 조회와 언어 상태가 두 곳이 되고(C#에 MessagePack 디코더도 필요), 프리팹에 적은 키는 타입 검사가 닿지 않기 때문입니다. 게임 제목도 키(`login.title`)입니다.
- **서버**: 서버는 문장을 보내지 않습니다. 거절은 `GameErrorCode`, 실패는 `ResultCode`, 연결 끊김은 `CloseCode`이고, 함께 가는 `message`·close reason은 로그와 디버깅용 영어라 클라이언트가 보이지 않습니다(토스트와 로그인 화면은 코드로 문장을 고름). 테이블은 한곳에서 읽으므로 서버도 Strings를 읽습니다(아래 비용).
- **밸런스 시뮬레이션**: 표의 아이템 이름은 Strings의 한국어(`ko`)로 찍어 전과 같습니다.
- **글꼴**: 한글은 지금처럼 기기 글꼴을 대체 글꼴로 붙이고(`KoreanFontFallback`), 영어는 TMP 기본 글꼴입니다. 한글은 어절 단위로 줄을 바꿉니다(`TMP Settings.asset`의 Modern Hangul Line Breaking Rules). 끄면 글자 단위로 끊어 "버/튼"처럼 단어 가운데에서 줄이 바뀝니다.
- **더하기**: 문장은 Strings에 줄을 더하고 코드나 키 열에서 그 키를 씁니다. 언어는 Strings에 열(ISO 639-1 이름, 모든 줄을 채움)을 더하고 `npm run generate`하면 됩니다. 언어 목록, 언어 탭, 기기 언어 판단이 모두 그 열에서 나오고, C# `DisplayFacade.Language`는 Unity가 아는 언어를 모두 바꾸므로 고치지 않습니다. 탭 막대는 언어 수만큼 칸을 나누므로 네다섯 개를 넘으면 설정 화면의 배치를 다시 봅니다.
- **비용**(Apple M4 Max, Node 22.14): `Strings.bytes` 7,710바이트, 읽기 29 µs(클라이언트와 서버 모두 시작할 때 한 번). `t` 한 번이 인자 없이 43 ns, 인자 셋이 323 ns입니다. 문장 신호 60개가 바인딩된 채로 언어를 바꾸는 데 TS 쪽이 13 µs이고, C#은 바뀐 글자 수만큼 `text`를 씁니다. 프레임마다 도는 코드는 없습니다.

## 씬 전환

씬은 빌드의 첫 씬 `01_Init` 하나입니다. 앱 흐름의 상태마다 씬을 나누지 않고, 그 상태가 연 것(UI 화면, 전투 월드의 인스턴스, BGM)만 상태의 스코프와 함께 바꿉니다.

- **한 씬인 이유**: 화면·전투 월드·소리는 모두 TS가 파사드로 실행 중에 만들고, 그 루트(`UI`, `BattleWorld`, `Audio`)와 `TypeScriptHost`는 `DontDestroyOnLoad`입니다. 상태마다 씬을 두면 비어 있는 씬과 "상태 → 씬 이름" 표만 생겨 같은 개념을 두 곳에 정의하게 됩니다. 또 씬은 플레이어 바이너리에 들어가 패치로 바꿀 수 없지만, 상태가 무엇을 보이는지는 TS에 있어서 번들로 바뀝니다. 씬 로드가 대신해 주던 일 가운데 남는 것은 놓은 에셋을 메모리에서 내리는 `UnloadUnusedAssets`(Single 모드 로드가 부름)뿐이라서, 상태가 바뀔 때 `ResourceFacade.UnloadUnused()`로 직접 부릅니다.
- **비용**: 씬으로 나누면 상태가 바뀔 때마다 `LoadSceneAsync`가 씬 파일을 읽고 활성화하느라 적어도 한 프레임(60fps에서 16.7ms)이 더 들고, `UnloadUnusedAssets`는 두 방식 모두 한 번씩 돕니다. 서버 비용은 둘 다 없습니다. `UnloadUnusedAssets`가 메인 스레드를 멈추는 시간은 불러 둔 에셋 수에 비례하므로, 화면이 다 가려진 동안 부릅니다.
- **전환 화면**(`presentation/transition.ts`, 뷰 `unity/views/transition.ts`, 프리팹 `UI/TransitionScreen`): 화면 전체를 가리는 로딩 화면입니다. 앱은 가린 채로 시작하고(프리팹도 불투명), Boot와 Update 동안 가린 채로 업데이트의 진행(확인하는 중, 받는 중 `12 KB / 83 KB`와 진행 막대, 적용하는 중, 새 버전이 필요함)을 보입니다. 상태를 떠날 때는 앱 흐름이 `cover`로 화면을 다 가린 뒤에 떠나고(0.25초), 들어간 상태의 화면이 열리면 `reveal`이 앞 상태가 놓은 에셋을 내린 뒤(`unloadUnused`) 걷습니다(0.25초). 로그인은 저장된 ID로 저절로 로그인하는 동안 걷지 않아서, 곧 메인으로 갈 로그인 화면이 잠깐 보였다 사라지지 않습니다. 가린 동안은 UI 스택의 `block()`으로 탭과 뒤로 가기를 막습니다.
- **페이드**: C# `Fade`(Views)가 `Update`에서 `CanvasGroup.alpha`를 옮기고 목표에 다 가면 `Finished`를 냅니다(이미 그 투명도면 다음 프레임에). 바인더 `fade(vm => vm.covered, vm => vm.faded())`가 이를 뷰모델에 이으므로, 앱 흐름은 실제로 다 가려진 다음에 상태를 바꿉니다. 전환 화면을 열지 못하면(프리팹 없음) 페이드 없이 바로 바꿉니다.
- **흐름과의 관계**: 가리기를 기다리는 동안 그 상태의 구독은 살아 있고, 그사이 같은 상태가 다시 부른 이동은 흐름이 버립니다(상태마다 첫 이동만 셉니다). 로그인은 다 가린 뒤에 들어가므로 메인 화면이 사라지는 동안 저장 데이터가 지워지지 않습니다.
- **로딩 표시(38)와 나눈 일**: 로딩 표시(`UI/Loading`, `network.waiting`)는 한 상태 안에서 서버의 답을 기다리는 동안 화면 위쪽에 작게 뜨고 입력 차단은 `blockWhileWaiting`이 합니다. 전환 화면은 상태 사이와 부트의 패치 동안에만 화면 전체를 가립니다. 둘 다 오버레이이고 전환 화면을 먼저 열어 아래에 두므로, 상태가 바뀌는 중에 서버를 기다리면 로딩 표시가 그 위에 보입니다.

## 패치

앱에는 패치(다운로드)를 마칠 때까지 필요한 것만 들고, 그 뒤의 것은 패치로 받은 뒤에만 씁니다(백로그 74). 앱이 시작하거나 재시작하면 부트 프로그램이 돌고, 패치를 마치면 게임 프로그램(로그인부터)으로 넘어갑니다. 두 프로그램은 각자의 스크립트 환경에서 하나씩 돌고 코드를 나누지 않습니다. C# 핫픽스는 범위 밖이라 C#·씬은 바뀌지 않습니다. 패치로 받는 것은 TS 게임 번들(`main.mjs`), 게임 데이터(`data/*.bytes`), 에셋(로그인·메인·팝업 UI와 아이콘, 전투 프리팹·배우 그림·배경, 소리)입니다. 앱에는 C#, 런타임 설정, 부트 번들, 패치 화면의 두 프리팹(`Resources/UI/TransitionScreen`, `NoticePopup`)과 한글 글꼴만 듭니다.

- **부트 번들**(앱에 듦): 시작, 매니페스트 확인, 받기, 검증, 설치, 패치 화면(전환 화면, 다시 시도를 기다리는 알림 팝업 `NoticePopup`, 새 앱의 설치 페이지를 열지 묻는 확인 팝업 `ConfirmPopup`)과 그 문장(Strings 표를 번들에 담음). 릴리스 빌드가 `client/Assets/Resources/TypeScript/boot.mjs`에 쓰고(빌드 출력이라 커밋하지 않음), C# 로더가 Resources에서 읽으므로 StreamingAssets를 파일 API로 읽지 못하는 Android에서도 같습니다. 게임 코드를 담지 않도록 공용 패키지와 클라이언트가 `package.json`에 `sideEffects`를 적어(부작용이 있는 것은 `src/host/`뿐) esbuild가 쓰지 않는 모듈을 버립니다. 49,977B(gzip 20,559B)이고, 그중 Strings 표가 약 15KB, MessagePack 해석기가 약 14KB입니다(`sideEffects` 없이는 게임 규칙이 따라 들어와 91,975B).
- **게임 번들**(패치로 받음): `main.mjs`와 `data/*.bytes`, 에셋 카탈로그(`aa/Android/catalog_remote.bin`), 매니페스트. 에셋 번들(`*.bundle`)은 매니페스트에 없고 Addressables가 받습니다.
- **버킷 레이아웃**(로컬 `client/TypeScript/dist/patch/`, Live는 VPS의 `/srv/idle/patch/`를 `https://idle.dennou.cloud/patch/`로 내줌. 설계는 [docs/superpowers/specs/2026-10-30-patch-design.md](docs/superpowers/specs/2026-10-30-patch-design.md)): 게임 번들은 버전마다 `v/<버전>/`에, 에셋 번들은 모든 버전이 함께 쓰는 `aa/Android/<이름>_<해시>.bundle`에 있고, 앱의 C# API 지문마다 채널 포인터 `channels/Android/<API 지문>.json`(`{ "version": … }`)이 하나 있습니다. 마지막으로 낸 APK의 기록 `channels/app/Android.json`(`{ "api", "url" }`, 아래 "새 앱 안내")도 `channels/` 아래에 두어 캐시하지 않습니다. 다시 쓰는 파일은 포인터와 앱 기록뿐이라, 올리는 도중에 읽어도 섞인 버전을 보지 않습니다. 릴리스 빌드는 에셋 번들 → 버전 폴더 → 포인터 순서로 더하고, 이미 있는 번들과 버전 폴더는 내용이 같으므로 덮지 않습니다(옛 버전도 남음. 지우려면 폴더를 지움). Android만 냅니다. 플랫폼, 포인터와 버전 폴더의 경로, 버전의 모양은 런타임의 `update.ts`(`PLATFORM`, `channelPath`, `versionPath`, `isVersion`)에만 있고, 빌드와 `patch.mjs`는 `tools/update.mjs`로 그것을 가져다 씁니다. CI는 버킷을 뒤지지 않고 빌드의 `--report=$GITHUB_OUTPUT`이 남긴 `api`, `version`, `folder`를 씁니다.
- **에셋**(Addressables 4.1.2, 원격 그룹): 패치 뒤의 에셋은 `client/Assets/Remote/`에 Resources와 같은 하위 경로로 있고, 주소가 그 경로(`UI/MainScreen`, `Battle/Actor`, `Audio/Sfx/Hit`)라서 Resources에 두던 때의 키가 그대로입니다. 바로 아래 폴더 하나가 그룹(`Remote UI`, `Remote Battle`, `Remote Audio`) 하나이고 번들 하나(LZ4, 해시를 붙인 이름)입니다. 그룹과 항목은 `Tools/Addressables/Sync Remote Groups`(`Assets/Editor/Patch/RemoteContent.cs`)가 폴더에서 맞추고, `Assets/Remote`의 에셋이 들어오거나 옮겨지거나 지워지면 저절로 다시 맞춥니다(빌더가 새 프리팹을 만들어도 빠지지 않음). 모든 항목에 라벨 `remote`를 답니다. `Tools/Addressables/Build Remote Content`(배치는 `-executeMethod PortfolioIdleRpg.Editor.RemoteContent.Build`)가 `client/ServerData/<플랫폼>/`(`.gitignore`)을 비운 뒤 원격 카탈로그와 번들을 만들고(Addressables는 옛 번들을 지우지 않음), 릴리스 빌드가 카탈로그는 게임 번들의 `aa/Android/`에, 번들은 버킷의 `aa/Android/`에 넣습니다. 같은 내용의 번들은 다시 빌드해도 이름이 같아서 한 번만 올리고 한 번만 받습니다. 스크립트 참조 묶음(monoscripts)도 기본 그룹을 원격으로 두어 함께 올리므로 원격 카탈로그는 앱 안의 파일을 가리키지 않습니다. 번들 주소는 `{PatchSource}aa/<플랫폼>`이고, 부트가 시작할 때 `BundleFacade.UseSource`로 앱 설정의 `patch`(버킷 주소)를 넣으므로 주소는 한 곳에만 있습니다.
- **카탈로그가 게임 번들 안에 있는 이유**: 카탈로그를 Addressables의 원격 카탈로그 갱신으로 따로 받으면 "설치된 버전"이 우리 매니페스트와 Addressables 캐시 두 곳에 생기고, 한쪽만 바뀐 채 멈추면 코드와 에셋이 어긋납니다. 카탈로그를 매니페스트에 넣으면 코드, 데이터, 카탈로그가 한 슬롯에 함께 설치되고, 번들은 해시 이름이라 이전 버전과 같은 곳에 있어도 섞이지 않습니다. 게임이 시작하면 C#이 설치된 슬롯의 카탈로그만 남겨 불러오고(`ResourceFacade.UseCatalog`: 다른 카탈로그를 모두 빼고 `LoadContentCatalogAsync`), 카탈로그가 없으면(Development) 에디터의 에셋 데이터베이스에서 불러옵니다. 에디터의 Addressables 플레이 모드는 TS 환경을 고를 때 함께 바뀝니다(Development: Use Asset Database, Release: Use Existing Build).
- **매니페스트**: 릴리스 빌드가 버전 폴더에 `manifest.json`(`{ version, api, build, parts, server, files: [{ path, size, sha256 }] }`)을 만듭니다(`client/TypeScript/tools/manifest.mjs`). `version`은 API 지문과 파일 목록의 해시라서 같은 소스를 다시 빌드하면 같은 버전이 나오고(esbuild 출력이 결정적입니다) 클라이언트는 받지 않습니다. API가 다르면 파일이 같아도 다른 버전입니다. `build`(만든 CI 실행의 id `BUILD_NUMBER`, 로컬은 0), `parts`(단위마다 온 커밋), `server`(함께 돌 서버의 커밋)는 기록용이라 버전에 넣지 않습니다. 클라이언트는 받은 매니페스트를 모두 검사해서(`parseManifest`), 경로가 번들 밖을 가리키거나 해시·크기가 틀린 매니페스트는 받지 않습니다. 릴리스 도구가 VPS에서 받아 조합에 쓰는 버전도 같은 `parseManifest`로 읽은 뒤 파일 해시를 확인합니다(`verifyManifest`, `manifest.mjs`가 esbuild로 `update.ts`를 불러 씀).
- **앱과 맞는 번들**: 번들이 부르는 C# API가 설치된 앱에 없으면 그 번들은 돌지 않습니다. 패치의 프리팹과 에셋도 앱의 C#에 기댑니다: 컴포넌트의 직렬화 필드를 이름으로 맞춰 읽고 없는 이름은 오류 없이 비워 두므로, 필드가 바뀐 프리팹을 옛 앱이 받으면 조용히 깨집니다(2026-11-04 build 3이 build 4의 무대를 받아 `StageView`의 배경이 비고 `Scroll`이 던져 전투가 멈춰 보임). 그래서 Unity(`TypeScriptTypings`)가 Facades·Views의 public 시그니처, 플레이어에 드는 스크립트(프로젝트와 패키지)의 직렬화 필드, Unity 버전으로 만든 API 지문(`client/TypeScript/types/csharp.d.ts`의 둘째 줄)을 릴리스 빌드가 두 번들의 `RUNTIME_API`와 매니페스트의 `api`로 넣습니다. 부트 번들은 앱에 들므로 부트의 `RUNTIME_API`가 곧 앱의 API이고, 부트는 그 API의 채널만 따르며 매니페스트의 `api`가 다르면 받지 않습니다. 플레이어 빌드 전처리는 Resources의 `boot.mjs`에 지금 지문이 없으면(C#을 고친 뒤 `build:release`를 다시 하지 않음) 빌드를 멈춥니다. 메서드나 직렬화 필드를 더하기만 해도 지문이 바뀌므로, 파사드나 뷰 컴포넌트의 필드를 바꾼 패치는 그 API의 새 앱과 함께 냅니다.
- **흐름**(`application/update/update.ts`의 `check()`, 부트의 `runBoot`): 앱의 채널 포인터를 받고(`parsePointer`) → 설치된 번들과 버전이 같으면 끝(`current`) → 다르면 `v/<버전>/manifest.json`을 받아 버전이 포인터와 같고 `api`가 앱과 같은지 보고 → 경로와 해시가 같은 파일은 설치된 번들에서 복사하고 나머지만 `v/<버전>/`에서 받습니다(설치된 것이 없거나 이전 형식이라 읽지 못하면 모두 받음. 버전 폴더는 바뀌지 않으므로 주소에 해시를 붙이지 않음) → 복사한 것까지 모든 파일을 크기와 SHA-256으로 검증하고 → 받는 곳의 카탈로그에 있는 에셋 번들 가운데 캐시에 없는 것을 받은 뒤(`BundleStore.assets`, C# `DownloadAssets`: 그 카탈로그만 남겨 불러와 라벨 `remote`의 `GetDownloadSizeAsync`, `DownloadDependenciesAsync`) → 설치된 번들로 바꾸고(`commit`, `updated`) → 게임을 시작합니다(`RuntimeFacade.StartGame`). 버전이 같아도 설치된 카탈로그로 캐시에서 빠진 에셋 번들을 다시 받습니다. 진행은 부트의 `update` 신호에 있고 전환 화면에 "업데이트를 확인하는 중…", "업데이트를 받는 중… 받은 KB / 전체 KB"와 진행 막대(파일 뒤에 에셋 번들의 바이트를 이어 셈), "업데이트를 적용하는 중…"이 보입니다. 포인터나 매니페스트를 받지 못하거나, 모양이 틀리거나, 앱과 맞지 않거나, 받기나 검증이 실패하면 받는 곳을 지우고(`failed`), 설치된 번들이 앱의 API로 빌드된 것이면 그것으로 시작하고, 아니면(첫 실행, 새 API의 앱을 설치한 직후) "업데이트를 받지 못했습니다" 알림 팝업에서 확인을 누를 때까지 기다렸다가 다시 확인합니다. 그래서 첫 실행에는 네트워크가 꼭 있어야 합니다. 버킷 주소는 앱 설정(아래 환경 전환의 앱 설정)의 `patch`라서, 바꾸려면 앱을 다시 빌드합니다. 개발 빌드의 부트는 패치하지 않고 바로 게임을 시작합니다.
- **서버가 요구한 업데이트**: 게임이 서버에게 새 클라이언트를 요구받으면(`network.ended === "update"`) 표시(`DeviceStorage`의 `updateRequired`)를 남기고 처음(부트)부터 다시 시작합니다(`requestUpdate`). 부트는 표시를 읽고 지운 뒤 확인해서, 새 번들을 받았으면 게임을 시작하고, 올린 번들이 설치된 것과 같으면(`required`) 게임을 저절로 시작하지 않고 "새 버전이 필요합니다" 알림 팝업에서 기다립니다. 표시는 한 번만 막으므로, 확인을 누르면 게임을 시작해 서버가 다시 판단합니다(서버가 다시 거절하면 같은 길로 돌아옴). 그래서 재시작이 저절로 되풀이되지 않습니다.
- **새 앱 안내**: APK를 내면 CI가 그 API와 Release 페이지를 앱 기록(`channels/app/Android.json`)에 씁니다(`patch.mjs app`). 부트는 확인을 마친 뒤 그것을 받아(`Updater.newApp`) 이 앱과 API가 다르면, 서버가 이 앱을 막았을 때는 "새 버전이 필요합니다" 대신 "이 앱으로는 더 플레이할 수 없습니다"로, 아니면 게임을 시작하기 전에 "앞으로의 업데이트는 새 앱으로만"으로 설치 페이지를 열지 묻습니다(확인 팝업, 확인이면 `RuntimeFacade.OpenUrl`). 앞의 것은 취소해도 다시 확인하고, 뒤의 것은 넘기면 이 앱으로 시작합니다. 기록이 없거나(로컬 버킷) 받지 못하면 묻지 않습니다. 앱이 켜져 있는 동안에는 확인하지 않고(패치도 시작할 때만 받음), 서버가 막아 재시작할 때 묻습니다.
- **받는 곳과 설치**(C# `BundleStore`, `BundleFacade`): 받은 번들은 `persistentDataPath/TypeScript/` 아래 슬롯 `a/`, `b/`에 있고 설치된 슬롯의 이름은 `current.txt`에 있습니다. 새 번들은 `staging/`에 받아(UnityWebRequest가 파일에 바로 쓰고, 받기마다 30초 제한) 검증한 뒤, 설치되지 않은 슬롯을 지우고 `staging/`을 그 이름으로 바꾸며(rename), `current.txt`는 임시 파일에 써서 `File.Replace`로 바꿔 넣습니다. 어디서 꺼져도 `current.txt`는 앞 슬롯이나 새 슬롯 하나를 가리키므로 반쯤 받은 번들로 시작하는 일이 없고, 앞 번들은 다음 업데이트까지 다른 슬롯에 남습니다. 패치하는 동안 도는 것은 부트뿐이라 어느 슬롯도 쓰이고 있지 않습니다. 번들의 바이트는 스크립트로 넘어오지 않고 해시도 C#이 계산합니다. 무엇을 받고 어떻게 검증할지는 TS가, 파일을 어디에 두고 어떻게 바꿀지는 C#이 정합니다. 스크립트 환경이 사라지면 `FacadeLifecycle`이 받던 것을 멈춥니다.
- **C# 로더가 고르는 것**(`TypeScriptRuntimeSettings`, `TypeScriptRuntime`): Development는 부트와 게임 모두 `TypeScript/dist/development`의 `boot.js`, `main.js`입니다. Release의 부트는 Resources의 `TypeScript/boot.mjs`(`TypeScriptFileLoader.InResources`, PuerTS가 `.mjs`를 TextAsset으로 가져옴)이고, 게임은 `current.txt`가 가리키는 슬롯의 `main.mjs`입니다. 앱에 든 게임 번들은 없습니다. 플레이어 빌드 전처리(`TypeScriptBuildValidation`)는 Release가 골라져 있는지, 부트 번들이 Resources에 있고 지금 API 지문으로 빌드됐는지 보고, 앱 설정을 Resources에 넣습니다.
- **크기**(지금 데이터의 `npm run build:release`, Android 에셋): 매니페스트로 받는 것은 파일 16개 170,731B이고, `main.mjs`가 142,288B(gzip 48,384B), 테이블 14개가 합쳐 18,391B, 에셋 카탈로그가 10,052B입니다. 에셋 번들은 4개 3,510,949B로 UI 774,920B, 전투 2,534,546B, 소리 198,137B, 스크립트 참조 3,346B입니다(LZ4라 gzip해도 약 10%만 줄어듦). 매니페스트는 2,491B입니다. 앱에서 빠진 Resources는 UI 프리팹 21개, 전투 프리팹 4개, 소리 14개와 그것이 끌어오던 그림입니다.
- **앱에 드는 것**(2026-10-30 Android 플레이어 빌드의 보고서, IL2CPP·ARM64): 데이터는 11,775,315B입니다. 처음 잰 41,731,895B 가운데 72%인 29,956,520B가 게임이 쓰지 않는 `com.unity.ai.inference`(매니페스트의 직접 의존이었고, 패키지의 Resources로 들어옴)여서 매니페스트에서 뺐습니다(그것만 쓰던 `com.unity.dt.app-ui`와 빌드 설정의 그 항목도 함께). 지금 가장 큰 것은 한글 글꼴 4,649,482B이고, 그다음이 로컬에만 있던 EnhancedScroller 데모 1,950,384B(저장소에는 없음, 2026-11-02에 에셋째 지움), Unity 스플래시 로고 1,250,840B, TextMesh Pro의 Resources와 글꼴 1,440,970B, URP 약 1.5MB입니다. 부트의 몫은 부트 아틀라스 60,848B, 부트 번들 50,488B, 패치 화면 프리팹 둘 6,675B뿐이고, UI 아틀라스와 패치 뒤의 프리팹·그림·소리(에셋 번들 3,510,949B)는 들지 않습니다. APK는 45,470,699B(설치하면 136.5MB)이고, 압축된 크기로 네이티브 라이브러리가 32.0MB(70%: `libil2cpp.so` 14.3MB, `libunity.so` 10.4MB, PuerTS V8 `libPapiV8.so` 6.2MB), 데이터가 10.5MB(한글 글꼴 3.7MB, IL2CPP 메타데이터 3.6MB), `classes.dex`가 2.4MB입니다. 첫 실행 다운로드 약 3.68MB는 계산으로 10Mbps에서 약 3초, 2Mbps에서 약 15초입니다(기기에서 재지 않음).
- **패치 한 번의 전송량**: 바뀐 것이 없으면 채널 포인터(31B)뿐이고(에셋 번들은 캐시에 있음), 첫 실행은 약 3.68MB(포인터 + 매니페스트 + 파일 170,731B + 에셋 번들 3,510,949B), 코드가 바뀌면 포인터 + 매니페스트 + `main.mjs`로 약 145KB(gzip 약 49KB), 테이블 하나만 바뀌면 포인터 + 매니페스트 + 그 테이블(예: `Stages` 547B), UI 프리팹 하나가 바뀌면 포인터 + 매니페스트 + 카탈로그 + UI 번들로 약 787KB입니다. 버킷은 정적 파일만 내주므로 하는 일이 전송뿐입니다. 하루 1만 명이 세 번씩 시작하면 포인터가 하루 약 0.9MB(헤더 제외), 하루 1천 명이 새로 설치하면 하루 약 3.7GB(월 약 110GB), 코드 업데이트 한 번을 1만 명이 받으면 약 1.45GB입니다. Live는 이미 쓰는 Hostinger VPS(KVM 4, 월 대역폭 16TB)라 추가 비용이 없고, 16TB는 첫 설치 약 430만 번입니다.

**시연**(로컬 정적 서버, 에디터):

1. Unity에서 `Tools/Addressables/Build Remote Content`로 에셋을 빌드하고(`ServerData/Android`), `npm run build:release -w @idle/client`로 부트 번들(Resources)을 만들고 게임 번들과 에셋 번들을 로컬 버킷(`dist/patch`)에 더한 뒤, Unity 툴바에서 `TS: Release`를 고릅니다. 빌드한 부트 번들을 Unity가 다시 가져오도록 에디터에 한 번 포커스를 줍니다. 서버(`npm run start -w @idle/server`)도 띄웁니다.
2. `npm run serve:bundle -w @idle/client`가 `http://localhost:8081/`에서 `dist/patch`를 내주고 요청마다 한 줄씩 찍습니다. 주소는 에디터가 읽는 앱 설정 `client/config/local.json`의 것입니다.
3. Play하면 Console에 `[TypeScript] Release Boot: Resources/TypeScript/boot.mjs`, `[update] assets: 3510949 bytes downloaded`, `[update] none -> <버전>: 16 files, 170731 bytes downloaded`, `[TypeScript] Starting the game.`, `[TypeScript] Release Game: …/TypeScript/a/main.mjs`가 찍히고 로그인으로 갑니다. 다시 Play하면 채널 포인터만 받습니다. 에디터는 Android용 번들의 셰이더를 돌리지 못해 전투 월드와 기본 글꼴(LiberationSans)의 글자가 분홍으로 보이므로(한글은 앱의 글꼴이라 보임), 에디터의 Release는 받고 불러오는 길을 보는 데 쓰고 화면은 Development나 기기에서 봅니다.
4. 코드를 조금 바꾼 뒤(예: `src/presentation/transition.ts`의 "불러오는 중…" 문구) `build:release`를 다시 하면 새 버전 폴더가 생기고 포인터가 그것으로 옮겨 가며, 다음 Play가 포인터, 매니페스트, `main.mjs`만 받아 다른 슬롯에 설치합니다. 되돌리려면 포인터 파일의 `version`을 앞 버전으로 고칩니다(클라이언트는 그것을 새 버전처럼 받음).
5. 정적 서버를 끄고 Play하면 확인이 실패해 설치된 번들과 캐시의 에셋 번들로 이어 갑니다(`[update] Keeping the installed bundle`). 받은 번들을 지우고(`persistentDataPath/TypeScript/`, macOS 에디터에서는 `~/Library/Application Support/DefaultCompany/idle/TypeScript/`, 에셋 번들 캐시는 `Caching.ClearCache()`) 서버 없이 Play하면 알림 팝업에서 기다리고, 서버를 켜고 확인을 누르면 받아서 시작합니다.

**Live(VPS)**: 패치 파일과 게임 서버를 모두 Hostinger VPS 하나에 둡니다. 기존 Caddy에 `idle.dennou.cloud` 사이트를 더해 `/patch/`는 패치 폴더를, `/ws`는 `127.0.0.1`에만 연 게임 서버(systemd)를 내줍니다. VPS를 한 번 준비하는 스크립트(`server/deploy/setup.sh`, root로 실행: Caddy 사이트, 폴더, 배포 사용자 `deploy`, 서비스 `idle-server`, 재시작 권한 한 줄)와 SSH(`rsync`)로 올리는 도구(`npm run patch`)가 있습니다. 서버는 `server/deploy/deploy.sh <커밋>`이 `releases/<커밋>/`에 올리고 `current` 링크를 바꿔 다시 시작한 뒤 Caddy를 거쳐 답하는지 봅니다(이미 올린 커밋이면 링크만 바꾸므로 롤백도 같음). 2026-10-31에 이 Mac에서 패치(`e23dd7312d1f78b3`)와 서버를 한 번 내보내 `wss://idle.dennou.cloud`까지 확인했습니다. 내보내기는 단위마다 GitHub Actions의 액션이 따로 있습니다(`idle data`, `idle game (TS)`, `idle assets (Addressables)`, `idle server`, `idle APK`, `idle publish / rollback`, `idle all`). 고른 단위만 이번 커밋에서 만들고 나머지는 지금 Live 버전에서 가져오며(`npm run patch -- pull`, 매니페스트로 검증), 규칙 테이블 지문이나 `idle/shared/`가 함께 돌 서버와 다르거나 패치를 받을 APK가 없으면 내보내기 전에 멈춥니다(`tools/release-check.mjs`). 올리기는 더하기만 하고, 공개가 서버를 맞춘 뒤 포인터를 옮기며, 롤백은 앞 버전의 공개입니다. Unity Personal은 계정으로 좌석을 받아 Addressables 빌드까지 CI에서 확인했고, 전체 액션이 APK까지 끝까지 돌았습니다(2026-10-31, 47분 52초). 단위 액션은 아직 돌려 보지 않았습니다. 액션별 사용법은 [docs/release.md](docs/release.md)에 있습니다. 비밀값 없이 기기에서 보려면 에디터 메뉴 `Tools/Build/Android APK (Live)`가 `client/Builds/Android/idle-live.apk`를 디버그 키로 만듭니다. 로컬 시연의 `http://`는 Player Settings의 Allow downloads over HTTP를 Development Only로 두어 에디터와 개발 빌드에서만 됩니다.

**알려진 한계**:
- 새 게임 번들이 시작하지 못하면(예: 테이블을 읽지 못함) 앞 슬롯으로 돌아가는 부팅 확인이 아직 없습니다. 그런 번들을 올리면 다음 패치까지 게임을 시작하지 못하므로, 올리기 전에 같은 빌드가 `npm test`의 빌드 테스트(번들을 PuerTS처럼 실행해 로그인까지 감)를 통과해야 합니다.
- API 지문이 세는 public 시그니처는 Facades·Views뿐입니다. TS가 그 밖의 C#을 부르게 되면 지문이 그 변경을 놓칩니다(지금은 Unity 컴포넌트를 `ViewRefs`로만 씀). 직렬화 필드는 플레이어의 모든 스크립트를 셉니다.
- 패치의 에셋을 앱의 Resources로 옮기거나 그 반대로 옮기는 것은 지문이 모릅니다. 옮긴 패치는 같은 API의 옛 앱에서 그 키를 찾지 못하므로 새 앱과 함께 냅니다.
- 패치 화면의 그림(버튼, 패널, 게이지)은 따로 묶은 부트 아틀라스(`Assets/UI/Boot.spriteatlasv2`, 512×256 ASTC 6×6, 약 59KB)에 있어 앱에는 이것만 들고, 나머지 UI 그림의 아틀라스(512×1024, 약 235KB)는 UI 번들에만 있습니다. 패치 뒤의 화면도 버튼과 패널을 쓰므로 부트 아틀라스는 UI 번들에 한 벌 더 들어갑니다(Addressables의 암묵 의존). 기본 글꼴(LiberationSans SDF)도 TextMesh Pro의 Resources에 있어 앱과 UI 번들에 한 벌씩 있습니다.
- 이전 버전의 에셋 번들이 캐시에 남습니다. 지금은 몇 MB라 두고, 커지면 설치한 뒤 `Addressables.CleanBundleCache`로 지금 카탈로그가 쓰지 않는 것을 지웁니다.
- IL2CPP 플레이어는 PuerTS의 C++ 연결 코드(`Assets/Gen/`, 커밋함)가 있어야 빌드됩니다. `Tools/TypeScript/Generate IL2CPP Bridge`(`PuertsIl2cpp.cs`)가 PuerTS의 리플렉션 모드 생성과 네이티브 플러그인 파일 생성을 부르고, PuerTS 3.0.3(과 2026-10의 master)이 부르는 `il2cpp::vm::Object::Unbox`(Unity 6000.6에서 없어짐)를 같은 일을 하는 `Object::GetRawData`(IL2CPP의 `il2cpp_object_unbox`가 부르는 것) 네 곳으로 바꿉니다. C# API를 바꾸면 다시 만들어 커밋하고, 빌드 전 검사(`PuertsIl2cppValidation`)가 빠졌거나 고치지 않은 연결 코드를 막습니다. PuerTS가 고쳐지면 바꾸기를 지웁니다. APK는 빌드되지만 기기에서 돌려 보지는 않았습니다.
- Android만 냅니다. 채널 경로(`channelPath`)와 릴리스 빌드의 플랫폼이 Android로 정해져 있어, iOS를 내려면 플랫폼을 앱에서 받아 채널과 버전 폴더를 플랫폼마다 나눕니다. iOS의 V8은 JIT 없이(jitless) 돌아서 클라이언트 상태의 신호(`@preact/signals-core`)가 예전 스토어보다 느립니다. 바인딩 300개 화면을 열 때 약 0.44 ms, 전투 HUD는 프레임당 약 1.4 µs로 프레임 예산 안이지만, M4 Max에서 Node `--jitless`로 잰 근삿값이라 iOS를 낼 때 기기에서 다시 잽니다([측정](docs/superpowers/specs/2026-10-14-client-signals-design.md)).

## 환경 전환

Unity 상단 **Play 버튼 왼쪽의 `TS: Development` 드롭다운**에서 Development / Release를 선택합니다. Unity 6.3 이후의 `UnityEditor.Toolbars` API(`MainToolbarElement`, `MainToolbarDropdown`)를 사용합니다. 선택값은 `client/Assets/Resources/TypeScriptRuntimeSettings.json`에 저장되고 드롭다운에 즉시 표시됩니다. Play 중에는 드롭다운이 비활성화되며 종료하면 다시 활성화됩니다. 환경 선택은 다음 Play/빌드부터 적용되며 번들 생성 명령과는 독립적입니다.

새 Editor 레이아웃에서 드롭다운이 숨겨져 있으면 툴바를 우클릭해 **TypeScript > Environment**를 켜세요. 기본 배치는 Play 컨트롤 바로 왼쪽입니다. 기존 **Tools > TypeScript > Environment** 메뉴도 같은 설정을 사용하며, **Tools > TypeScript > Select Settings**로 설정 파일을 선택할 수 있습니다.

| 환경 | 실행 코드 경로 | 현재 상태 |
| --- | --- | --- |
| Development | Unity 프로젝트(`client/`) 기준 `TypeScript/dist/development/`의 `boot.js`(부트)와 `main.js`(게임) | 기본값, Unity Editor에서 로컬 개발. 패치하지 않음 |
| Release | 부트는 Resources의 `TypeScript/boot.mjs`, 게임은 받은 번들(`Application.persistentDataPath/TypeScript/<슬롯>/main.mjs`, 데이터는 같은 폴더의 `data/`) | 패치(위) |

개발 모드에서는 PuerTS 내부 모듈만 Resources에서 읽고 부트와 게임 코드는 로컬 출력 폴더에서 읽습니다. 출력 폴더는 Unity 프로젝트 안에 있어야 하므로 클라이언트 TS는 `client/TypeScript/`에 둡니다. C# 부트스트랩이 `ScriptEnv`를 유지하며 매 프레임 `Tick()`, 씬 종료 시 `Dispose()`를 호출합니다. 진입 파일이 없으면 필요한 명령/경로를 명시한 오류를 출력하며 다른 환경으로 우회하지 않습니다.

**앱 설정**: TS 환경(Development, Release)과 따로, 앱이 붙을 곳을 `client/config/local.json`(로컬 서버 `ws://localhost:8080`, 로컬 버킷 `http://localhost:8081/`)과 `live.json`(`wss://idle.dennou.cloud`, `https://idle.dennou.cloud/patch/`)이 정합니다. 플레이어 빌드 전처리가 배치 모드 인자 `-idleEnvironment live`로 고른 것(없으면 `local`)을 Resources의 `AppConfig.json`(빌드 출력이라 커밋하지 않음)으로 넣고, 자리표시(`<…>`)가 남아 있으면 빌드를 멈춥니다. C# `RuntimeFacade.Config()`가 그 글을 돌려주고 부트와 게임이 각자 `parseAppConfig`로 검사해, 부트는 `patch`로 패치하고 게임은 `server`로 접속합니다. 에디터는 마지막 플레이어 빌드가 남긴 설정과 상관없이 메뉴 `Tools/TypeScript/App Config`(Local, Live)에서 고른 파일을 읽습니다. 기본은 Local이고, 고른 것은 이 기기의 EditorPrefs에만 남아 커밋되지 않으며 빌드와도 상관없습니다. 다음 플레이부터 적용되고, 어느 쪽인지는 콘솔의 `[config]` 줄에 나옵니다. Live를 고르면 에디터가 Live 서버에 붙어 Live DB의 계정을 쓰므로, 에디터의 `idle/shared`와 규칙 테이블이 Live 서버와 같아야 정산이 맞습니다(TS 환경이 Release면 Live 패치도 받음). 주소는 비밀이 아니라 커밋합니다.

Development는 현재 Editor 전용입니다. 로컬 파일이 없는 Player를 만들지 않도록 Development 설정의 Player 빌드는 오류로 중단하고, Release의 Player 빌드는 부트 번들(`Assets/Resources/TypeScript/boot.mjs`)이 없거나 지금 C# API로 빌드되지 않았거나, 앱 설정이 없거나, IL2CPP 연결 코드(`Assets/Gen/`, 아래 패치의 알려진 한계)가 없으면 중단합니다. 이 V8 구성은 WebGL 대상이 아닙니다.

## 개발과 릴리즈

개발과 릴리즈를 가르는 곳은 클라이언트와 서버에 하나씩이고, 아래 네 가지(로그, 오류 처리는 둘 다 쓰고 치트와 디버그 오버레이는 개발에서만)가 그것을 함께 씁니다. 두 쪽은 따로 정합니다. 개발 빌드가 릴리즈 서버에 붙으면 오버레이는 열리지만 치트는 거절됩니다.

| 쪽 | 정하는 곳 | 개발 | 릴리즈 |
| --- | --- | --- | --- |
| 클라이언트 | 번들의 빌드 모드. `client/TypeScript/tools/build.mjs`가 esbuild `define`으로 `BUILD_MODE`를 넣고 `unity/boot.ts`만 읽어 `ClientConfig.mode`로 넘깁니다. | `npm run build:dev`, `npm run dev`. Unity의 Development 환경이 읽는 번들입니다. | `npm run build:release`. Release 환경이 읽는 번들입니다. |
| 서버 | 환경 변수 `SERVER_MODE`(`server/src/main.ts`). 다른 값이면 시작하지 않습니다. | `SERVER_MODE=development npm start -w @idle/server`(Windows PowerShell은 `$env:SERVER_MODE="development"` 뒤에 실행) | 정하지 않거나 `release`. 배포한 서버가 치트를 열지 않게 기본값입니다. |

클라이언트는 Unity의 환경 선택(위 환경 전환)이 아니라 번들 자체에 모드를 둡니다. 환경 선택은 어느 번들을 읽을지만 정하고, 도는 것은 번들이라 둘이 어긋날 수 없습니다. 값은 번들에 상수로 박혀 실행 중 비용이 없고 C# API도 늘지 않습니다. 서버 변수를 `MODE`로 두지 않은 것은 vitest가 `MODE=test`를 넣기 때문입니다.

### 로그

`Logger`(`application/ports.ts`, 서버는 `src/log.ts`)는 `debug`, `info`, `warn`, `error`이고 채널 하나의 것입니다. 서비스는 자기 채널의 로거를 받고, 어느 채널을 줄지는 조립 지점(`composition.ts`, 서버는 `main.ts`)이 정하며, 줄 앞에 `[채널]`이 붙습니다. 개발은 debug부터, 릴리즈는 info부터 남기고 두 쪽이 같은 기준입니다. 버리는 레벨의 메서드는 아무것도 하지 않습니다.

| 채널 | 쪽 | 남기는 것 |
| --- | --- | --- |
| `flow`, `data` | 클라이언트(`unity/boot.ts`, `app.log`) | 앱 흐름의 상태(info), 테이블 수(debug) |
| `login`, `settings`, `battle`, `events`, `audio`, `ui` | 클라이언트 | 로그인 실패, 깨진 설정, 거절된 전투 커맨드와 보이는 전투의 reset(debug), 이벤트 구독자의 오류, 소리, 열리지 않은 화면 |
| `crash` | 클라이언트 | 처리되지 않은 오류(아래) |
| `update` | 클라이언트 | 받은 번들(앞 버전 → 새 버전, 받은 파일 수와 바이트, info), 받지 못해 지금 번들로 이어 감(warn) |
| `server`, `rpc`, `ws` | 서버 | 시작, 요청마다 한 줄, 연결 |

PuerTS의 `console.log`는 Unity `Debug.Log`라 줄마다 스택을 잡으므로, 프레임마다 날 수 있는 줄(보이는 전투의 reset)은 debug입니다. 채널마다 레벨을 따로 정하는 설정은 아직 없습니다.

### 처리되지 않은 오류

PuerTS V8에는 `window.onerror`나 Node의 `uncaughtException`이 없고, C#에서 JS로 들어오는 길마다 오류가 닿는 곳이 다릅니다(PuerTS 3.0.3의 `puerts/timer.mjs`, `promises.mjs`).

| 길 | 잡지 않으면 | 잡는 곳 |
| --- | --- | --- |
| Promise 거부를 아무도 처리하지 않음 | `promises.mjs`가 모든 마이크로태스크 뒤에 `puer`의 `unhandledRejection`을 내고, 듣는 쪽이 없으면 경고만 남김 | `puer.on("unhandledRejection")` |
| 타이머 콜백(`setTimeout`, `setInterval`, 프레임 루프)이 던짐 | Tick 핸들러를 빠져나가 C# `ScriptEnv.Tick`이 던지고 Unity Console에만 남음. 그 Tick에 기한이 된 나머지 타이머는 다음 Tick으로 밀림 | 부팅할 때 `globalThis`의 두 함수를 콜백을 감싸는 것으로 바꿈 |
| UnityEvent 리스너(버튼, 입력, 목록 칸, 탭)가 던짐 | `UnityEvent.Invoke`를 빠져나가 EventSystem이 남김 | 바인딩의 `listen()`이 리스너를 감쌈 |

C#이 JS를 부르는 곳은 PuerTS의 Tick과 화면이 등록한 UnityEvent 리스너뿐이라(위 C# 쪽) 길은 이 셋이고, 셋 다 JS에서 잡히므로 C# 콜백은 더하지 않았습니다. 잡은 오류는 `unity/uncaught.ts`가 `app.crash`로 넘기고, `presentation/widgets/crash.ts`가 `crash` 채널에 남긴 뒤 확인 팝업(38)으로 "문제가 생겼습니다. 다시 시작할까요?"를 묻습니다. 확인하면 `AppRuntime.restart()`(C# `RuntimeFacade.Restart`, 백로그 2)로 스크립트 환경을 새로 만들고, 취소하면 그대로 이어 갑니다. 팝업이 떠 있는 동안 난 오류는 로그에만 남습니다. 전환 화면(아래 씬 전환)이 가리고 있으면(Boot·Update, 상태 사이) 팝업이 그 아래에 묻히고 입력도 막히므로, `app.crash`는 묻기 전에 전환 화면을 걷습니다(`lift`, 가리기를 기다리던 이동은 페이드 없이 바로 보냄). 번들 갱신(35)의 재시작과 겹쳐도 `RuntimeFacade.Restart`는 요청 표시 하나라 한 번만 재시작하고, 받는 중에 재시작하면 `FacadeLifecycle`이 받기를 멈추며 다음 시작의 Update가 받는 곳을 비우고 다시 확인합니다. 번들 갱신의 실패는 업데이트가 잡아 `failed`로 끝내므로 팝업을 띄우지 않습니다. 앱이 서기 전의 오류는 Console에만 남고, 부팅 실패는 화면이 없으므로 `main.ts`가 로그만 남깁니다. `catchUncaught` 전에 예약한 타이머(`main.ts`의 `Runtime tick ready`)는 감싸지 않습니다.

### 치트

개발 모드의 서버만 받는 커맨드입니다(opcode 900–999). 규칙은 다른 커맨드처럼 game-core(`commands/cheat.ts`)에 한 벌이라 클라이언트가 예측하고 서버가 확정하며, 요청 id로 한 번만 적용되고 revision 조건부 저장을 거칩니다. 모두 누른 틱까지 확정한 뒤 바꿉니다. 개발 모드가 아닌 서버는 커맨드를 읽기 전에 `CheatDisabled`(900)로 거절하고 저장하지 않으며, 모드는 프로세스 내내 같으므로 같은 id에는 같은 답입니다. 토스트는 "개발 서버에서만 쓸 수 있습니다."입니다. `Command`가 늘어 `PROTOCOL_VERSION`이 7이고, `PlayerState`는 그대로라 저장 형식은 4입니다.

| 커맨드 | Opcode | 필드 | 하는 일 |
| --- | --- | --- | --- |
| `CheatItemGrant` | 900 | `itemId`, `amount` | 아이템을 지급합니다(`grant`. 장비는 인스턴스, 상한을 넘친 것은 버림). 경험치는 오프라인 보상처럼 그 자리에서 레벨을 올리고, 오르면 `now`에서 사냥을 다시 시작합니다(다음 경계까지 미루면 경험치 비율이 100%를 넘어 보임). |
| `CheatLevelSet` | 901 | `level` | 영웅 레벨을 정하고 `now`에서 사냥을 다시 시작합니다(개발용이라 착용처럼 이어 가지 않음). |
| `CheatStageUnlock` | 902 | `stageId` | 선행 스테이지를 거슬러 올라가며 모두 클리어한 것으로 두고, 레벨이 그 길의 조건보다 낮으면 올립니다. 옮기지는 않습니다. |
| `CheatTimeShift` | 903 | `duration`(ms, `Constants.offlineCapHours` 이하) | 체크포인트를 그만큼 과거로 옮겨 그만큼 더 떠나 있던 것으로 둡니다. 다음 프레임의 정산이 공백을 다시 돌리거나(10분 이하) 오프라인 보상으로 지급하고 보상 팝업이 뜹니다. |

틀린 필드는 `InvalidCommand`(1), 없는 스테이지는 `StageNotFound`(100)입니다. 시간 이동을 서버 시계를 옮기는 방식으로 두지 않은 것은, 그 시계가 모든 계정과 클라이언트의 서버 시계 동기화(30)를 함께 흔들기 때문입니다. 체크포인트를 옮기면 한 계정의 저장 데이터만 바뀌고 오프라인 보상의 실제 경로(낡은 체크포인트의 첫 정산)를 그대로 지납니다.

### 디버그 오버레이

개발 빌드에서만 `app.start()`가 디버그 레이어에 엽니다(`UI/DebugOverlay`, 뷰모델 `presentation/view-models/debug.ts`, 뷰 `unity/views/debug.ts`). 프리팹은 `Tools/UI/Build Debug Prefabs`(`Assets/Editor/UI/DebugPrefabs.cs`)가 코드로 만듭니다. 왼쪽 위(메인 화면의 스테이지 막대 아래, 전투 위)의 DEV 버튼이 패널을 펼치고 접으며, 이 자리라서 아래 판이나 HUD를 가리지 않습니다. 루트는 탭을 받지 않아 접혀 있으면 아래 화면을 막지 않습니다.

- **FPS**: 뷰가 프레임마다 도는 타이머로 스크립트 Tick(곧 Unity의 프레임)을 세어 0.5초마다 넘깁니다. C# 컴포넌트를 더하지 않았고, 패널이 펼쳐진 동안만 세므로 접혀 있으면 비용이 없습니다.
- **서버 시간**: `app.clock`(30의 `ServerClock`)을 UTC로 보입니다.
- **상태 덤프**: 앱 상태의 네 슬라이스(`flow`, `network`, `login`, `player`)를 JSON으로 보이고 큰 수는 `formatBig` 표기입니다. 패널 안에서 스크롤됩니다.
- **치트**: 한 줄을 입력하고 실행합니다. `grant <아이템> [수량]`, `level <레벨>`, `unlock <스테이지>`, `time <분>`이고 `progress.cmd`의 치트를 부릅니다. 결과 줄에 적용, 거절 코드, 서버에 닿지 않음이 보입니다.

## 테스트

테스트는 워크스페이스마다 `test/`에 vitest로 두고(data-tool은 `node --test`), `npm test`가 생성 파일과 import 경계를 검사한 뒤 모두 돌립니다. 한쪽만 보는 테스트는 그 워크스페이스에, 클라이언트와 서버를 붙이는 테스트는 `integration/`에 둡니다. 화면 연출, 프리팹, C#은 Unity에서만 확인합니다. 테스트의 계정은 `@idle/game-core/testing`의 `testPlayer(data, at, changes)`(튜토리얼을 마치고 첫 스테이지에서 사냥하는 1레벨 영웅에 바꿀 슬라이스만 덮고, 전투는 그 슬라이스로 `at`에 새로 시작)로 만들고, 받아들여져야 할 커맨드 결과는 `accepted(applyCommand(…))`로 꺼냅니다. 그래서 `PlayerState`에 슬라이스를 더하면 테스트 계정은 `game-core/src/testing.ts` 한 곳만 고칩니다. 저장 마이그레이션의 기대값과 와이어 스냅숏처럼 모양 자체를 보는 테스트는 그대로 적습니다.

| 어디서 | 무엇을 |
| --- | --- |
| `shared/big-number` | 수와 글자에서 만들기, 연산, 비교, 가수가 10으로 올라가는 반올림, 직렬화 |
| `shared/game-core` | 전투 시뮬레이션(결정성과 골든 벡터, 모든 틱에서 다시 시작, 웨이브의 등장 간격과 함께 싸우기, 대상 규칙과 범위 공격, 웨이브 수가 목표에서 멈춤, 보스·시간 제한·부활·클리어, 효과의 틱·겹마다의 타이머·갱신과 누적·능력치와 둔화·기절·보호막·정화와 면역·즉시 효과·지속 피해의 처치, 효과가 걸린 경계에서 다시 시작, 발사체의 비행 틱과 착탄·사라짐, 경계를 넘지 않음, 아무 때나 정산해도 한 번만 맞음, 소환수의 공식 능력치·다음 틱부터 싸움·지속 시간 만료·최대 수·쓰러짐·소환자와 함께 만료(영웅과 몬스터)·경계와 레벨업을 넘어 남음·체크포인트에서 이어 받음, 나눠 정산한 것과 한 번에 정산한 것이 같음, 모든 틱의 체크포인트에서 이어 받은 전투가 같은 상태, 적의 소환수까지), 생성된 공식(강화 비용의 거듭제곱이 `Big.pow`와 비트까지 같음, 상성의 조건식, 효과의 양, 빠진 입력), 능력치, 정산(그 틱까지, 싸우던 웨이브 포함)·보스 도전·스테이지 선택·착용·골드 강화(커맨드 뒤에도 싸우던 웨이브와 보스전이 이어짐, 최대 HP가 오른 만큼 HP, 체크포인트보다 이른 시각,비용의 비트, 최대 단계, 골드 부족, 확정한 골드로 냄, 능력치와 레벨업 경계)·튜토리얼·치트 커맨드, 장비 강화(비용 곡선, 단계별 스탯, 입은 것만 새 능력치로 이어 감, 거절)와 합성(재료 순서, 새 ID의 다음 등급, 입은 재료의 슬롯, 거절, 배포 데이터의 같은 슬롯), 환생(포인트와 배율 공식, 돌아가는 것과 남는 것, 확정한 레벨, 능력치와 골드의 배율, 서명), 보상과 상한, 레벨업, 오프라인 보상, 해금, 시간, 로그인 ID 규칙, 커맨드 type 검사, 배포 데이터의 `HeroLevels` |
| `shared/protocol` | 대표 요청과 응답의 MessagePack 바이트 스냅숏, 코덱 |
| `server` | 저장소(revision 조건부 저장, 계정과 첫 저장의 원자성, 트랜잭션 롤백, 세션, 커맨드 답), 저장 형식과 마이그레이션, rpc(아래 표), WebSocket 전송(경로, 버전, 바이너리, 크기, 하트비트), 빌드한 번들의 로그인, 부하 테스트의 계산(분위수, 사용률, 동접 용량) |
| `client/TypeScript` | 서버 어댑터(재연결, 재개, 재전송, 핑, 끝남), 서버 시계, 앱 흐름, 서비스, 뷰모델과 바인딩, UI 스택, 위젯, 오디오, 설정, 문장, 번들 업데이트, PuerTS처럼 실행하는 빌드, 배포 데이터(튜토리얼 대상, 문장 인자, 소리 키의 채널) |
| `integration` | 로그인부터 커맨드, 클라이언트 예측과 서버 확정이 같은 정산·오프라인 보상·착용·골드 강화·스킬 배우기와 장착·장비 강화와 합성·환생, 레벨업(보이는 전투의 reset), 끊김과 잃은 답, 다른 곳 로그인, 튜토리얼 진행과 건너뛰기 거절, 개발 모드 밖의 치트 거절, 언어를 바꾼 뒤의 로그인·메인 화면, 실제 WebSocket 서버(`createWebSocketBridge`)의 버전 검사로 닫힌 옛 클라이언트의 번들 교체와 검증 실패 시 유지 |
| `balance` | 같은 옵션이면 같은 곡선, 골드를 강화와 스킬 레벨업 중 가장 싼 다음 단계부터 씀, 그 레벨에 닿으면 환생하고 포인트가 쌓임, 전투 미리보기(같은 요청 같은 결과, 합계, 잘못된 요청, `run.mjs --preview`가 요청의 공식으로 돌리고 거절된 공식·요청은 표준 오류) |
| `tools/data-tool` | 변환, 검사 열, 생성 코드 |
| `client/Assets/Tests/EditMode` | C#의 순수 계산(UI 배율과 레이어 앵커 `SafeAreaFit`: 크기 0·NaN·무한대 거절, 화면 밖 자르기)과 빌더의 fileID 유지(`Builders/`의 `PrefabIds`: 이름이 겹치는 오브젝트까지 다시 저장해도 파일이 같음, 더한 오브젝트만 새 fileID, 다른 에셋 참조는 건드리지 않음). Unity Test Framework의 EditMode 테스트라 `npm test`와 CI에는 없고, Unity의 Test Runner나 Unity CLI(`unity command run_tests --mode editor`)로 돌립니다 |

저장소의 동시성과 데이터 무결성 규칙(저장소 루트 AGENTS.md)은 서버 테스트가 지킵니다. 경합은 저장소 래퍼(`racing`, `holding`)로 재현합니다.

| 규칙 | 테스트 |
| --- | --- |
| 재연결 전후 두 연결이 동시에 보낸 커맨드는 둘 다 적용되고, 늦게 쓰는 쪽은 먼저 쓴 저장 데이터 위에서 다시 한다 | `server/test/rpc.test.ts` commands |
| 같은 골드로 동시에 보낸 강화는 골드를 한 번만 쓰고, 다시 보낸 강화는 한 번만 낸다 | rpc stat upgrades |
| 같은 골드로 동시에 보낸 스킬 레벨업은 골드를 한 번만 쓰고, 다시 보낸 배우기·레벨업은 한 번만 낸다 | rpc skill learning and level-ups |
| 같은 계정이 동시에 보낸 환생은 포인트를 한 번만 쌓고(늦은 쪽은 1레벨에서 다시 확인해 `RebirthNotReady`), 다시 보낸 환생은 같은 답을 받는다 | rpc rebirth |
| 같은 장비를 동시에 강화하면 골드를 한 번만 쓰고(늦은 쪽은 `NotEnoughGold`), 다시 보낸 강화는 한 번만 낸다 | rpc equipment enhancement |
| 같은 요청 id는 한 번만 적용되고 같은 답을 받는다(옛 연결에서 아직 도는 중이어도) | rpc repeated command requests, `integration/test/reconnect.test.ts` |
| 새 로그인 뒤에 옛 세션에서 끝난 커맨드는 저장·기록되지 않고, 새 세션이 같은 id로 보낸 커맨드는 실행된다 | rpc repeated command requests |
| 오프라인 보상과 정산은 한 번만 지급된다(같은 id, 두 연결의 동시 정산) | rpc offline rewards, `integration/test/battle.test.ts` |
| 실패한 트랜잭션은 아무것도 남기지 않는다(저장과 답, 계정과 첫 저장) | `server/test/store.test.ts`, rpc의 계속 밀리는 커맨드 |
| 같은 새 계정을 만드는 두 로그인은 계정 하나를 함께 쓴다 | rpc sessions |
| 로그인이 돌려준 저장 데이터는 새 세션이 시작한 저장 데이터다(그 사이 옛 세션의 커맨드가 와도) | rpc sessions |
| 저장 형식 1 → 최신: 단계마다, 그리고 DB의 버전 1 저장 데이터가 로그인·정산 뒤 최신 형식으로 다시 쓰인다 | `server/test/save.test.ts`, rpc |

`npm run coverage`는 `@vitest/coverage-v8`(vitest와 같은 4.1.11, 17개 패키지 6.6 MiB)로 각 워크스페이스가 자기 `src/`를 얼마나 도는지 봅니다. idle의 vitest 워크스페이스 일곱이 약 5.3초로, 커버리지 없이 돌릴 때보다 워크스페이스마다 0.03–0.41초 더 걸립니다(Apple M4 Max, Node 22.14). 이번 테스트를 더하기 전과 뒤의 문장(줄) 커버리지는 다음과 같습니다.

| 워크스페이스 | 전 | 뒤 |
| --- | --- | --- |
| big-number | 95.5% (98.1%) | 97.0% (100%) |
| codes | 100% | 100% |
| game-core | 96.9% (98.7%) | 98.0% (99.5%) |
| protocol | 87.5% (85.7%) | 100% (100%) |
| client | 91.7% (92.3%) | 92.2% (92.7%) |
| server | 88.0% (91.2%) | 89.7% (92.0%) |
| balance | 60.7% (61.2%) | 60.7% (61.2%) |

남은 0%는 진입점(`client/src/main.ts`, `unity/boot.ts`, `unity/bridge.ts`, `server/src/main.ts`)과 `composition.ts`(클라이언트 워크스페이스에서는 0%, `integration/`이 돌림), 밸런스의 명령줄(`balance/src/cli.ts`, `npm run balance`로 확인)입니다. `npm test`는 이번 테스트 21개를 더해도 8.3–8.5초로 전과 같습니다.

## 디버깅

Development는 기본적으로 V8 Inspector 포트 `9229`를 엽니다. VS Code로 리포지토리 루트를 열고, Unity에서 Play 후 **Attach to PuerTS (Development)** 실행 구성을 선택하면 됩니다. 소스맵에 `shared/*` 소스도 포함되므로 공유 패키지 코드에도 중단점을 걸 수 있습니다. 실행 초기에 이미 지나간 코드는 다음 실행 또는 이후 호출 시 확인하세요. `TypeScriptRuntimeSettings.json`의 `DevelopmentDebugPort`를 `-1`로 설정하면 Inspector를 끕니다. Release에서는 디버거를 열지 않습니다.

## 릴리스 번들

`npm run build:release`가 로컬 버킷에 더하는 버전 폴더(`client/TypeScript/dist/patch/v/<버전>/`)는 TS를 JavaScript ESM으로 변환하고 하나로 묶은 `main.mjs`, 테이블 데이터 `data/*.bytes`, 에셋 카탈로그, 매니페스트 `manifest.json`입니다. 데이터와 로더 코드는 같은 버전이어야 하므로 함께 배포합니다. 타입 선언과 소스맵은 릴리즈 산출물에 포함하지 않습니다. `csharp`/`puerts`는 번들에서 external로 처리하고 로더가 PuerTS 전역 객체에 연결합니다. 타입 선언을 연결한 후 `import CS from "csharp"`, `import puer from "puerts"` 형태의 default import를 사용하세요. 이 브리지는 named import를 지원하지 않습니다.

빌드 도구 참고: [esbuild API](https://esbuild.github.io/api/), [TypeScript 설정](https://www.typescriptlang.org/tsconfig/), [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces).
