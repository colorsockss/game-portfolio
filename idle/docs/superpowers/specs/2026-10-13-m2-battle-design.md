# M2 1단계: 전투 설계

- 날짜: 2026-10-13
- 범위: 백로그 11(방치 전투 시뮬레이션), 13(스탯 계산), 34(오브젝트 풀), 42(전투 뷰), 43(이펙트·데미지 텍스트)과, 전투에 필요한 최소한의 스테이지 진행
- 상태: 검토 대기

## 1. 목적

M2(코어 루프)를 세로로 넷으로 나눈 첫 단계입니다. 단계가 끝나면 로그인한 뒤 메인 화면에서 영웅이 몬스터를 자동으로 잡고, 처치 수가 차면 보스에 도전하고, 이기면 다음 스테이지로 넘어갑니다. 결과는 서버가 같은 시뮬레이션을 다시 돌려 확정합니다.

나머지 단계: 2. 보상과 성장(14, 15, 29, 38), 3. 오프라인(12, 24, 30), 4. 목록과 설정(39, 31, 44). 각각 스펙 → 계획 → 구현을 따로 합니다.

성공 기준:

- 같은 체크포인트와 데이터에서 클라이언트와 서버가 같은 이벤트와 같은 결과를 냅니다.
- 클라이언트가 예측한 정산을 서버가 그대로 확정하면, 화면이 끊기거나 되돌아가지 않습니다.
- 클라이언트는 전투 결과를 보내지 않습니다. 서버는 저장된 체크포인트와 자기 시각만으로 결과를 정합니다.
- 전투 규칙은 `game-core`에 한 벌만 있고, 클라이언트 application·presentation은 Node 테스트에서 돕니다.
- 화면: 영웅과 몬스터, HP 바, 공격과 피격, 데미지 숫자(치명타 구분), 보스 등장과 결과, 처치 수, 보스 도전 버튼.

## 2. 정해진 것

| 주제 | 결정 | 이유 |
| --- | --- | --- |
| 전투 모양 | 영웅 하나가 앞에 나오는 몬스터를 한 마리씩 상대합니다. | 지금 테이블(스테이지의 일반 몬스터 목록과 보스)과 맞고, 시뮬레이션과 뷰가 단순합니다. |
| 결과의 권한 | 서버가 같은 시뮬레이션으로 재현해 확정합니다. 클라이언트는 같은 함수를 돌려 보여 줄 뿐입니다. | 화면과 보상이 정확히 같고 조작할 수 없습니다. 측정한 비용이 작습니다(아래). |
| 스테이지 흐름 | 사냥 + 보스 도전. 일반 몬스터를 끝없이 잡다가 처치 수가 차면 보스에 자동 도전하고, 이기면 다음 스테이지, 지면 사냥으로 돌아가 버튼으로 다시 도전합니다. | 끝없는 사냥이 오프라인 보상의 바탕이 되고, 보스가 진행의 관문이 됩니다. |
| 스킬 | 재사용 대기마다 쓰는 스킬까지. 피해 배율만 씁니다. | 마나, 속성, 효과 태그(독, 빙결, 회복, 버프)는 다음 항목으로 둡니다. |
| 전투 화면 | 직교 카메라의 2D 월드, 단색 도형 | 에셋 없이 시작하고 나중에 스프라이트로 바꾸기 쉽습니다. |
| 전투 저장 | 경계 체크포인트: 작은 전투 상태를 저장하고, 정산은 마지막 경계까지만 확정합니다. | 클라이언트가 이미 지나온 상태에서 이어 가므로 화면이 튀지 않고, 서버는 마지막 정산 이후만 다시 돌립니다. |
| 전투 수치의 수 | `Big`(HP, 공격력, 방어력, 피해) | 방치형 성장은 double을 넘습니다. 측정: 틱당 `number` 2–3 ns, `Big` 13–17 ns로 약 7배이지만, 정산 한 번(600틱)이 0.01 ms 수준입니다. |
| 정산 주기 | 보스 종료 때 바로, 아니면 60초마다 | 측정: 커맨드 트랜잭션 63 µs(파일 DB, WAL), 연결 하나에 초당 약 15,800건. 동시 접속 1만 명이면 60초 주기로 초당 약 170건(약 1%), 처치마다(약 3초) 보내면 약 3,300건(약 21%)입니다. 정산 사이의 진행은 서버가 체크포인트부터 다시 계산하므로 사라지지 않습니다. |
| VContainer, UniTask | 이번에도 쓰지 않습니다. | 애니메이션은 C# `Update` 안의 짧은 보간이고, 조립은 TS에서 합니다. |

측정 환경: Apple M4 Max, Node 22.14. 위 표의 시뮬레이션 측정은 영웅과 몬스터 하나씩, 기본 공격과 치명타만 있는 루프였으므로 하한입니다. 구현한 시뮬레이션의 측정은 아래에 있습니다.

### 구현한 시뮬레이션의 측정

측정 환경: Apple M4 Max, Node v22.14.0. 1레벨 영웅(스킬 1001, 1004, 1005)이 스테이지 3002에서 사냥만 합니다. 3002는 보스가 없어서 `autoBoss`가 켜져 있으면 처치 10마리째에 클리어하고 다음 스테이지로 넘어가므로 `autoBoss`를 껐습니다. 이벤트 콜백 없이 `startBattle(...).advance(n)`과 `settle(...)`을 각각 2,000번 돌린 평균이고(워밍업 300번 제외), 같은 측정을 세 번 되풀이한 값의 범위를 적습니다. 6,000틱 동안 몬스터 134마리가 나오고 영웅은 118마리를 잡고 15번 쓰러집니다(공격 957번). 쓰러져 일어나기를 기다리는 틱은 거의 일을 하지 않으므로 틱당 값은 이 사냥의 평균입니다.

| 항목 | 값 |
| --- | --- |
| 틱당, 6,000틱 진행 | 28.9–29.5 ns |
| 틱당, 600틱 진행(`startBattle` 0.3–0.4 µs 포함) | 34.1–34.4 ns |
| `settle` 한 번, 600틱(60초) | 0.0186–0.0189 ms |
| `settle` 한 번, 6,000틱(상한, 10분) | 0.170–0.175 ms |

- `advance`에 이벤트를 세는 콜백을 주어도 틱당 28.7–29.3 ns(6,000틱), 35.1–36.1 ns(600틱)로 거의 같습니다.
- `settle`은 `heroStats`, `playerBattle`, `advance`, `lastBoundary`를 모두 합친 값이고 DB는 포함하지 않습니다. `autoBoss`를 켜고 3001이나 3002에서 시작해 클리어와 다음 스테이지를 지나도 같은 크기입니다(0.018–0.019 ms, 0.16–0.17 ms).
- 위 표의 `Big` 측정(13–17 ns)의 약 2배입니다. 구현이 재사용 대기와 스킬 고르기, 공식 호출, 경계마다 체크포인트 복사를 더 하기 때문으로 보이지만 항목별로 재지는 않았습니다.
- 정산 주기 계산(위 표)은 그대로입니다. 600틱의 시뮬레이션 0.019 ms가 커맨드 트랜잭션 63 µs에 약 30% 더해져 한 건이 약 82 µs이고, 동접 1만 명이 60초마다 보내는 초당 약 170건이면 CPU 약 14 ms, 코어 하나의 약 1.4%입니다(추정). 체크포인트가 아무리 오래되어도 한 번에 6,000틱까지만 다시 돌리므로 한 요청의 시뮬레이션은 이 측정에서 0.17 ms 수준이 최대입니다.
- 지금 데이터의 보스 없는 스테이지(3001–3003, 3005)는 클리어에서 바로 정산하므로 클리어마다 정산이 하나 나갑니다. 이 정산은 60초 주기도 다시 시작합니다. 같은 1레벨 영웅을 난수 시드 다섯 개로 돌리면 3001은 시작 후 12–13초에, 3002는 앞 클리어 뒤 36–55초에, 3003은 68–82초에 클리어합니다. 간격이 60초 주기와 같은 크기이고 첫 스테이지만 짧습니다. 새 계정 1만 명이 동시에 첫 스테이지를 13초 만에 깨는 순간은 초당 약 770건이고, 한 건 약 82 µs면 CPU 약 63 ms, 코어 하나의 약 6%입니다(추정). 3005는 재지 않았습니다.

## 3. 데이터

### 3.1 `big` 열 형식

data-tool에 `big` 형식을 더합니다. 셀은 숫자이거나 `1.5e40`, `-12`, `3.25e+400` 같은 십진 텍스트입니다. double을 넘는 값도 담을 수 있도록 MessagePack에는 십진 문자열로 저장하고, 생성된 역직렬화 코드가 `Big.parse`로 읽습니다. 정규화는 big-number 한 곳에서만 합니다.

- `@idle/big-number`에 `Big.parse(text: string): Big`을 더합니다. 가수부와 지수부를 나눠 `Number(가수부)`(올바른 반올림이 명세로 정해짐)와 정수 지수로 정규화합니다. 형식에 맞지 않으면 `RangeError`입니다.
- data-tool은 `big` 셀을 `^-?\d+(\.\d+)?([eE][+-]?\d+)?$`로 검사하고, 숫자 셀은 그 십진 표기로 바꿔 저장합니다.
- 생성된 테이블 파일이 `@idle/big-number`를 import하므로 의존 방향에 `data-schema → big-number`를 더합니다(`scripts/check-boundaries.mjs`, README, AGENTS.md). big-number는 의존이 없으므로 순환이 생기지 않습니다.

### 3.2 테이블

xlsx는 exceljs 스크립트(`tools/data-tool/scripts/`)로 고치고 `npm run generate`로 생성 파일을 만듭니다. 커밋은 `data:`입니다.

| 테이블 | 변경 | 열 |
| --- | --- | --- |
| `Heroes` (새, 1행) | 영웅의 전투 성질 | `id`, `name`, `attackIntervalSeconds: float`, `critChance: float`, `critMultiplier: float`, `skillIds: int[]` (Skills.id) |
| `HeroLevels` (새) | 레벨별 기본 스탯. 1–50행 | `id`(레벨), `maxHp: big`, `attack: big`, `defense: big` |
| `Monsters` | `maxHp`, `attack`, `defense`를 `big`으로, 열 추가 | `attackIntervalSeconds: float` |
| `Stages` | 열 추가 | `bossKillCount: int` (보스 도전까지의 사냥 처치 수) |

초기 값은 밸런스가 아니라 동작 확인용입니다. 영웅 1레벨이 첫 스테이지 몬스터를 몇 대에 잡고, 보스는 수십 초가 걸리게 둡니다. 경험치 요구량은 2단계에서 `HeroLevels`에 더합니다. `Heroes`와 `HeroLevels`는 `loadGameData`에 더합니다.

## 4. 규칙 (`shared/game-core`)

### 4.1 스탯 (13)

```ts
interface CombatStats {
  readonly maxHp: Big;
  readonly attack: Big;
  readonly defense: Big;
  readonly attackInterval: number;  // 틱
  readonly critChance: number;      // 0–1, 몬스터는 0
  readonly critMultiplier: number;
  readonly skills: readonly SkillsRow[];  // 4.4의 규칙으로 고른 것
}

interface StatModifier {
  readonly stat: "maxHp" | "attack" | "defense";
  readonly add?: Big;
  readonly percent?: number;  // 0.1 = +10%
}

function heroStats(player: PlayerState, data: GameData): CombatStats;
function monsterStats(monster: MonstersRow, data: GameData): CombatStats;
function applyModifiers(base: CombatStats, modifiers: readonly StatModifier[]): CombatStats;
```

`heroStats`는 `HeroLevels[레벨]`과 `Heroes` 행을 기본으로, 저장 데이터에서 모은 수정치를 `applyModifiers`로 합산합니다. 합산은 스탯마다 `(기본 + Σadd) × (1 + Σpercent)`이고 결과를 내림합니다. 수정치를 저장 데이터에서 모으므로 전투도 같은 함수 하나로 영웅 스탯을 얻습니다. 이번 단계에서 모이는 수정치는 없고, 2단계에서 장비가 출처로 더해집니다. 버프 출처는 M2에 없습니다(스킬 효과를 다음 항목으로 두었으므로).

### 4.2 공식

`data/formulas.json`의 `exportSettings`에 `"numeric": "big"`과 `"bigImport": "@idle/big-number"`를 더하면, 공식 툴이 `Big` 코드를 생성합니다.

- `IAbilityOwner.get(type)`이 `Big`을 돌려주고, 상수는 `Big.from(값)`입니다.
- 연산: `+ − × ÷`, 단항 `−`, `min`, `max`, `floor`, `clamp`, `abs`. 각각 `Big`의 연산으로 생성합니다.
- `pow`, `sqrt`, `round`, `ceil`, `rand`, `randInt`는 `Big` 모드에서 내보내기 오류입니다. 앞의 넷은 `Big`에 같은 비트를 보장하는 구현이 없고, 뒤의 둘은 시드가 없어 클라이언트와 서버가 다른 값을 냅니다.
- Formula Lab의 미리보기와 평가는 지금처럼 `number`입니다. `numeric`이 없으면 지금과 같은 `number` 코드를 생성합니다.
- 전투는 `Formula.get(E_AbilityType.damage, caster, target)`을 씁니다. 지금의 `damage = max(minDamage, caster.attack - target.defense)`는 그대로입니다.

### 4.3 전투 상태

`PlayerState`에 `battle` 슬라이스를 더합니다. 현재 스테이지는 `stage.currentId`를 그대로 씁니다.

```ts
enum BattleMode { Hunt = 0, Boss = 1 }

interface BattleState {
  readonly mode: BattleMode;
  readonly at: number;                   // 체크포인트의 서버 시각(ms). 0틱이 이 시각
  readonly rng: number;                  // 난수 상태(uint32)
  readonly heroHp: Big;
  readonly cooldowns: readonly number[]; // 남은 틱. 0번이 기본 공격, 그 뒤가 쓰는 스킬(목록 순서)
  readonly kills: number;                // 이 스테이지에서 사냥한 수
  readonly autoBoss: boolean;            // 처치 수가 차면 보스에 자동 도전
}
```

### 4.4 시뮬레이션 (11)

```ts
interface Battle {
  /** `tick`까지 진행하며 이벤트를 `emit`에 넘긴다. 이미 지난 틱이면 아무것도 하지 않는다. */
  advance(tick: number, emit: (event: BattleEvent) => void): void;
  /** 진행한 범위에서 마지막 경계 직후의 체크포인트와 그때의 스테이지 변화. 경계가 없으면 undefined. */
  lastBoundary(): Boundary | undefined;
  /** 화면용: 지금 영웅과 몬스터의 HP와 최대 HP, 몬스터 ID, 보스 남은 틱. */
  snapshot(): BattleSnapshot;
}

interface BattleInput { battle: BattleState; stage: StageState; hero: CombatStats; data: GameData }
function startBattle(input: BattleInput): Battle;
function playerBattle(state: PlayerState, data: GameData): Battle;  // 저장 데이터에서 입력을 만든다
```

`Battle`은 같은 상태인지 비교하는 `signature()`(내부 상태 전체의 문자열)도 내놓습니다(6.1).


| 상수 | 값 |
| --- | --- |
| `TICK_MS` | 100 |
| `APPROACH_TICKS` (몬스터가 다가오는 동안, 싸우지 않음) | 5 |
| `REVIVE_TICKS` (사냥 중 쓰러진 영웅이 일어나기까지) | 30 |
| `MAX_SETTLE_TICKS` (한 번에 다시 돌리는 최대 길이, 10분) | 6000 |

규칙:

- 틱 `k`는 서버 시각 `at + k × TICK_MS`입니다. 한 틱에서 영웅이 먼저, 그다음 살아 있는 몬스터가 행동합니다.
- 몬스터는 `Stages.monsterIds`에서 난수로 고르고, 등장하면 `APPROACH_TICKS` 동안 싸우지 않습니다.
- 행동: 재사용 대기가 끝난 스킬 중 목록에서 앞선 것을 쓰고, 없으면 공격 간격이 찼을 때 기본 공격합니다. 쓴 것의 재사용 대기가 다시 시작합니다.
  - 기본 공격은 목록에서 `cooldownSeconds`가 0인 첫 스킬의 배율을 씁니다(지금의 1001). 없으면 배율 1입니다.
  - 그 밖의 스킬은 재사용 대기가 있고 `target`이 `enemy`이고 `powerMultiplier > 0`인 것만 씁니다. 마나, 속성, `maxTargets`, `effectTags`는 쓰지 않습니다.
  - 몬스터의 재사용 대기는 등장할 때 처음부터 시작합니다. 영웅의 것은 이어집니다(`cooldowns`).
- 피해: `floor(damage 공식 × 스킬 배율 × (치명이면 critMultiplier))`. 치명은 영웅만 `rng() < critChance`로 냅니다.
- 난수는 mulberry32이고 상태 하나(uint32)를 `rng`에 저장합니다.
- 영웅 HP는 몬스터가 바뀌어도 이어집니다. 사냥 중 쓰러지면 `REVIVE_TICKS` 뒤 최대 HP로 일어나고, 싸우던 몬스터는 물러나 새로 나옵니다.
- 보스: 보스 차례는 경계에서 정합니다. 모든 경계(처치, 다시 일어남, 보스 종료, 스테이지 클리어)와 새 사냥을 시작할 때 스테이지에 보스가 있고 `autoBoss`가 켜져 있고 처치 수가 `Stages.bossKillCount` 이상이면 체크포인트의 `mode`를 `Boss`로 둡니다. 체크포인트의 `mode = Boss`는 "다음에 나올 것이 보스"라는 뜻이고, 다음 몬스터는 `mode`만 보고 고릅니다. 그래서 경계 뒤에 `autoBoss`를 켜도 그 경계 다음의 몬스터는 바뀌지 않습니다. 영웅은 최대 HP로 시작합니다. 제한 시간은 등장부터 `timeLimitSeconds`(0이면 없음)입니다.
  - 이기면 스테이지 클리어입니다.
  - 영웅이 쓰러지거나 시간이 다 되면 실패입니다. 사냥으로 돌아가고 `autoBoss`가 꺼지며 영웅은 최대 HP가 됩니다.
- 보스가 없는 스테이지는 `autoBoss`가 켜져 있을 때 처치 수가 `bossKillCount`에 닿는 경계에서 클리어입니다. 마지막 스테이지를 클리어하면 `autoBoss`가 꺼지므로 그 스테이지는 더 클리어하지 않고 사냥을 이어 갑니다.
- 클리어: `stage.clearedIds`에 더하고, 다음 스테이지(`unlockStageId`가 지금 스테이지인 것 중 ID가 가장 작은 것)로 옮겨 새 사냥을 그 틱에서 이어 갑니다(`kills = 0`, `autoBoss = true`). 다음 스테이지가 없으면 그 스테이지에서 사냥을 이어 가고 `autoBoss`를 끕니다.
- 경계: 몬스터 사망, 보스 종료, 영웅이 다시 일어남, 스테이지 클리어. 경계 직후의 상태만 체크포인트가 됩니다. 이때 싸우는 몬스터는 없으므로 저장할 것이 `BattleState`뿐입니다.
- 이벤트(모두 `tick`이 붙음): `spawn{monsterId, boss}`, `attack{by: hero|monster, skillId, crit, damage}`, `death{who}`, `revive`, `bossStart`, `bossEnd{win}`, `stageClear{stageId, nextId}`.

### 4.5 커맨드

모두 `applyCommand`의 핸들러입니다. 클라이언트는 `progress.send`로 바로 예측하고, 서버는 같은 핸들러로 확정합니다.

- `BattleSettle {}` (`Opcode 101`): 체크포인트부터 `now`까지 돌려 마지막 경계까지 확정합니다(`battle`과, 클리어가 있었으면 `stage`). 경계가 없으면 상태를 바꾸지 않습니다. 체크포인트가 없거나(`at`이 0) `now - at`이 `MAX_SETTLE_TICKS × TICK_MS`를 넘으면 돌리지 않고 그 시간을 버리고 `now`에서 새 사냥을 시작합니다(`heroHp`는 최대, 재사용 대기는 처음부터, `kills`와 `autoBoss`는 유지). 3단계에서 이 부분을 오프라인 보상으로 바꿉니다.
- `BossChallenge {}` (`Opcode 102`): `BattleSettle`과 같이 마지막 경계까지 확정하고(항상), `autoBoss = true`로 합니다. 싸우던 몬스터는 그대로 이어지고 다음 경계에서 보스가 나옵니다. `autoBoss`는 경계에서만 쓰이므로 이미 보여 준 과거는 바뀌지 않습니다. `autoBoss`가 이미 켜져 있거나 보스 중이거나 스테이지에 보스가 없으면 확정만 합니다.
- `StageSelect {stageId}` (있음): 마지막 경계까지 확정한 뒤, `now`에서 그 스테이지의 새 사냥을 시작합니다(`kills = 0`, `autoBoss = true`, 난수 상태는 이어 받음). 싸우던 몬스터를 버리는 화면 전환이므로 `now`에서 끊습니다. 해금 검사는 2단계(15)에서 더합니다.

새 오류 코드는 없습니다.

### 4.6 결정성

클라이언트(PuerTS의 V8)와 서버(Node의 V8)가 같은 비트를 내도록 지키는 것:

- 산술은 double의 `+ − × ÷`, 비교, `Math.max/min/floor/round`, 난수 생성기의 `Math.imul`과 비트 연산(명세가 정확한 결과를 정함), big-number 연산만 씁니다. `Math.pow`, `Math.log*`, 삼각 함수, `Math.random`, `Date`를 쓰지 않습니다.
- 반복 순서는 배열 순서만 씁니다. `Map`/`Set`을 순회해서 결과를 정하지 않습니다.
- 테이블의 float 값은 두 쪽이 같은 바이트를 읽으므로 같습니다.
- game-core는 지금처럼 호스트 API를 쓰지 않습니다.

## 5. 프로토콜·서버

- `@idle/codes`의 `Opcode`에 `BattleSettle = 101`, `BossChallenge = 102`를 더하고, `Command` 유니온에 두 커맨드를 더합니다.
- `PlayerState`의 모양이 바뀌므로 `PROTOCOL_VERSION`을 2로 올립니다. 와이어 스냅숏(`wire.test.ts`)은 메시지를 직접 만들어 인코딩하므로 지금 항목의 바이트는 그대로이고(갱신하지 않음), 새 커맨드 요청 둘과 `battle` 슬라이스를 실은 동기화 응답 항목을 더합니다.
- 저장 형식 2: 마이그레이션이 `battle = { mode: Hunt, at: 0, rng: 0, heroHp: Big.ZERO, cooldowns: [], kills: 0, autoBoss: true }`를 넣습니다. 첫 정산이 이를 상한을 넘은 공백으로 보고 지금부터 새로 시작하므로 마이그레이션에 게임 데이터가 필요 없습니다. `createPlayer`는 같은 규칙으로 지금 시각의 새 사냥을 만듭니다(game-core의 `freshBattle(player, data, now)`).
- 서버 코드는 바뀌지 않습니다. 새 커맨드도 `runCommand`를 지나므로 한 번만 처리하기, revision 충돌 재시도, 바뀐 슬라이스만 보내기가 그대로입니다.

## 6. 클라이언트 TypeScript

### 6.1 application: `application/battle/battle.ts`

```ts
interface BattleService {
  /** 서버 시각 추정치까지 보이는 전투를 진행하고 그동안의 이벤트를 돌려준다. 화면이 프레임마다 부른다. */
  advance(): readonly BattleEvent[];
  snapshot(): BattleSnapshot;
  bossChallenge(): void;
  selectStage(stageId: number): void;
}
```

- 보이는 전투 하나를 쥡니다. `player.battle`의 체크포인트에서 `startBattle`로 시작해, `Clock.now()`까지의 틱으로 진행합니다. 애플리케이션 층은 타이머를 쓰지 않으므로 프레임이 시간을 밉니다.
- 정산: 보스가 끝나거나 스테이지를 클리어한 프레임에 바로(이벤트 없이 따라잡은 구간에서 일어난 것도 포함), 아니면 마지막 정산을 보낸 뒤 60초가 지난 프레임에 `progress.send({ type: Opcode.BattleSettle })`. 이미 정산을 보낸 결말(보스 종료·클리어)은 다시 세지 않으므로, 실패한 정산이 되돌린 체크포인트에서 같은 결말을 다시 지나도 60초 주기를 기다립니다. 체크포인트가 상한보다 오래되었으면 첫 프레임에 바로 보냅니다.
- `player.battle`이나 `player.stage`가 바뀌면 새 체크포인트에서 시작한 전투를 지금까지 조용히 진행해, 보이는 전투와 같은 서버 시각에서 `signature()`를 비교합니다. `autoBoss`는 다음 경계에서만 쓰이므로 비교에서 뺍니다(`pathSignature()`: `signature()`에서 `autoBoss`만 뺀 것). 같으면(그 체크포인트가 보이는 전투가 지나온 경계이거나, 보스 도전처럼 `autoBoss`만 바뀐 것) 조용히 바꾸고, 다르면(서버의 시각 차이로 갈라짐, 거절, 재개) 바꾸고 `reset` 이벤트 하나를 냅니다.
- 한 프레임에 2초(20틱)보다 많이 밀리면(앱이 멈췄다 돌아옴) 이벤트 없이 따라잡고 `reset` 하나만 냅니다. 체크포인트가 바뀔 때 보이는 전투가 그만큼보다 많이 밀려 있으면(로그아웃 동안 프레임이 멈춤) 그 전투는 돌리지 않고 바로 바꾸고 `reset`을 냅니다.
- 지연이 낳는 reset: 클라이언트는 커맨드를 자기 `now`로 예측하고 서버는 RTT만큼 늦은 `now`로 확정합니다. 보스 도전은 두 쪽에서 서로 다른 마지막 경계 뒤에 적용될 수 있어, 그 사이에 처치가 있으면 보였던 보스가 `reset`으로 거둬집니다(약 RTT / 처치 간격, 1–5%). 스테이지 선택과 낡은 체크포인트의 새 사냥은 늘 두 시각이 달라 RTT쯤 뒤에 `reset`이 한 번 더 나고, 마이그레이션한 저장 데이터의 rng 0도 다르게 시드됩니다. 모두 `reset` 한 번에 맞춰지는 설계된 복구 경로입니다. 클라이언트가 경계를 보내거나 두 쪽이 같은 시작 격자를 쓰는 구조적 해결은 보상이 붙어 차이가 중요해지는 2단계로 미룹니다.
- 보이는 전투는 스토어에 넣지 않습니다. 프레임마다 바뀌어 스토어 알림이 매 프레임 돌기 때문입니다. 스토어(`player` 슬라이스, progress가 씀)에는 저장된 체크포인트만 있습니다.
- `App`에 `battle`을 더하고 `composition.ts`에서 조립합니다.

### 6.2 presentation

- `presentation/pool.ts` (34): 엔진과 무관한 `Pool<T>`.
  ```ts
  interface PoolHooks<T> { create(): Promise<T>; activate(item: T, active: boolean): void; destroy(item: T): void; }
  function createPool<T>(scope: Scope, hooks: PoolHooks<T>): Pool<T>;
  interface Pool<T> { acquire(): Promise<T | undefined>; release(item: T): void; }
  ```
  돌려받은 것은 비활성으로 두고 다시 꺼낼 때 씁니다. scope가 닫히면 모두 없애고, 만드는 사이 닫혔으면 `acquire`는 `undefined`입니다.
- `presentation/world/ports.ts`: 전투 월드의 포트 `WorldBridge`(프리팹 인스턴스 만들기·없애기, 활성화). UI의 `UiBridge`와 같은 자리입니다.
- `presentation/view-models/battle.ts`: 프레임마다 `battle.advance()`의 이벤트를 화면 지시로 바꿉니다.
  - 지시: 등장(색과 크기: 일반 몬스터는 ID로 정한 색, 보스는 1.6배 크기와 붉은색), 공격, 피격(HP 비율, 피해 문구는 `formatBig`, 치명이면 크고 노랗게), 사망, 다시 일어남, 보스 시작·종료, 스테이지 클리어(이 셋은 영웅이 최대 HP로 돌아가므로 다시 일어남을 더함), 다시 맞춤.
  - Observable: 처치 수(`"7/10"`), 보스 남은 시간(`"0:42"`, 보스 중에만), 보스 도전 버튼 표시 여부(`autoBoss`가 꺼졌고 처치 수가 찼을 때).
- `presentation/view-models/main.ts`: 지금의 "다음 스테이지" 버튼은 `battle.selectStage`를 부르고, 보스 도전 버튼을 더합니다.

### 6.3 unity

- `unity/world.ts`: `WorldBridge`의 구현(`WorldFacade`).
- `unity/views/battle.ts`: 메인 화면이 열려 있는 동안 프레임마다(`EVERY_FRAME`) 뷰모델의 지시를 `ActorView`, `FloatingText` 호출로 옮깁니다. 배우와 데미지 텍스트는 풀에서 꺼내고, 데미지 텍스트는 보여 준 뒤 0.8초(실제 시간)가 지난 프레임에 돌려놓습니다.
- `unity/views/main.ts`: 처치 수, 보스 남은 시간, 보스 도전 버튼을 묶습니다.

## 7. C#과 에셋

- `Facades/WorldFacade.cs` (+ internal `WorldRoot`): 전투 월드 루트(DontDestroyOnLoad)와 그 아래 직교 카메라를 만들고, 불러온 프리팹의 인스턴스를 만들고 없앱니다. 도형용 흰 사각형 스프라이트는 실행 중에 한 번 만듭니다. UI 캔버스(Screen Space Overlay)는 그 위에 그려집니다. 정리는 `FacadeLifecycle.Shutdown`의 UI 다음에 더합니다.
- `Views/ActorView.cs`: `Setup(r, g, b, size)`, `Place(x, y)`, `EnterFrom(x, seconds)`, `Lunge()`, `Hit(hpRatio)`, `Die()`, `Revive(hpRatio)`. 움직임은 `Update`의 짧은 보간입니다. 단색 사각형과 그 위의 HP 바로 이루어집니다.
- `Views/FloatingText.cs`: `Show(text, r, g, b, size, x, y)`. 0.8초 동안 위로 뜨며 사라집니다(TextMeshPro 월드 텍스트).
- 프리팹: `Resources/Battle/Actor.prefab`, `Resources/Battle/DamageText.prefab`.
- `Resources/UI/MainScreen.prefab`: 위쪽을 비워 전투가 보이게 하고, 처치 수, 보스 남은 시간, 보스 도전 버튼을 더합니다.
- 프리팹과 씬은 열려 있는 Unity 에디터에서 고칩니다. public API가 바뀌므로 Unity가 `csharp.d.ts`를 다시 생성하고 함께 커밋합니다.

## 8. 진행 순서

1. 데이터 기반: `Big.parse`, data-tool `big` 열, `data-schema → big-number`, 테이블 변경과 생성.
2. 공식 툴 `Big` 코드 생성과 `formulas.ts` 다시 생성.
3. game-core: 스탯, 전투 상태, 시뮬레이션, 커맨드, `freshBattle`.
4. 프로토콜·서버: opcode, `PROTOCOL_VERSION`, 저장 형식 2.
5. 클라이언트 application·presentation: 전투 서비스, 풀, 전투 뷰모델, 메인 뷰모델.
6. C#과 프리팹, unity 뷰.
7. 문서: README, 백로그(11, 13, 34, 42, 43), AGENTS.md(의존 방향).

## 9. 테스트와 확인

- big-number: `Big.parse`(가수·지수 조합, double을 넘는 값, 잘못된 형식).
- data-tool: `big` 열(숫자 셀, 텍스트 셀, 잘못된 값, 생성된 코드).
- formula-tool: `Big` 코드 생성(출력 스냅숏, 작은 값에서 `number` 결과와 같음, 금지된 함수 거절).
- game-core:
  - 스탯 합산.
  - 결정성: 같은 체크포인트에서 같은 이벤트. 나눠서 진행해도 한 번에 진행한 것과 같음.
  - 이어 가기: 정산한 체크포인트에서 다시 시작한 전투가 끊기지 않은 전투와 같은 이벤트를 냄.
  - 보스 승리·실패(쓰러짐, 시간 초과), 보스 없는 스테이지 클리어, 마지막 스테이지, 다시 일어남, 스킬 재사용 대기와 기본 공격 배율.
  - `BattleSettle`의 상한과 새 사냥, `BossChallenge`가 이미 진행한 이벤트를 바꾸지 않음, `StageSelect`가 `now`에서 끊음.
- 서버: 저장 형식 1→2 마이그레이션, 새 계정의 `battle`.
- integration: 루프백 위에서 클라이언트가 진행하고 정산한 결과를 서버가 그대로 확정함(다시 맞춤 없음).
- 클라이언트: 전투 서비스(이벤트, 60초와 보스 종료 정산, 오래된 체크포인트, 다른 체크포인트에서 다시 맞춤), 풀(재사용, scope 정리), 전투 뷰모델(지시, 문구, 버튼 표시).
- Unity: 컴파일, 플레이 모드에서 전투·데미지 숫자·보스 도전·스테이지 이동을 직접 확인.
- 성능: 구현한 시뮬레이션의 틱당 비용과 정산 한 번(600틱, 6,000틱)의 시간을 Node에서 재서 이 문서의 2절 표 아래에 적습니다.

## 10. 범위 밖 (다음 단계)

- 처치·클리어 보상(골드, 경험치, 아이템)과 레벨업, 장비 스탯: 2단계(14). 이번 단계는 처치 수만 셉니다.
- `StageSelect`의 해금 검사: 2단계(15).
- 오프라인 시간: 3단계(12, 24). 그 전까지는 상한을 넘은 공백을 버립니다.
- 서버 시간 지연 보정: 3단계(30). 지금의 `ServerClock`(마지막 응답 기준)을 씁니다.
- 사운드: 4단계(44).
- 스킬의 마나, 속성, 대상 수, 효과 태그와 회복·버프 스킬.

## 11. 위험

- 결정성: 엔진 사이 차이는 4.6의 규칙으로 막고, 서버가 확정한 체크포인트가 클라이언트의 것과 다르면 다시 맞춤으로 회복합니다. 다시 맞춤이 잦으면 integration 테스트와 로그(`[battle] reset`)로 드러납니다.
- 프리팹 변경은 Unity에서 열어 보기 전까지 확인되지 않은 변경입니다. 에디터에서 고치고 플레이 모드로 확인합니다.
- 와이어: `PROTOCOL_VERSION`이 바뀌므로 옛 클라이언트는 4000으로 닫히고 업데이트해야 합니다. 와이어 스냅숏의 기존 항목은 바뀌지 않아야 하고, 새 항목만 더해집니다.
