# Sheet Baker 데이터툴

Node.js로 작성한 Excel 데이터 컴파일러입니다. **첫 번째 시트를 데이터, 두 번째 시트를 스키마**로 읽어 JSON, 인덱스 기반 MessagePack, Node 서버·Unity PuerTS·호스트 중립 TypeScript 역직렬화 코드를 생성합니다. 스키마 시트의 검사 열로 테이블 간 참조, 값 범위, 배열 길이, Enum, 조건부 열을 검사하고(아래 검사 열), `Enums` 워크북에서 TypeScript enum을 만들며, 문자열 id 테이블의 id를 리터럴 유니온 타입으로 내보냅니다(아래 문자열 키).

| 대상 | 역직렬화 형식 | 반환값 |
| --- | --- | --- |
| Node 서버 TypeScript | JSON, MessagePack | `Promise<Map<Id, TableRow>>` |
| PuerTS TypeScript | MessagePack | `Promise<Map<Id, TableRow>>` |
| 호스트 중립(portable) TypeScript | MessagePack | `Promise<Map<Id, TableRow>>` |

시트가 하나인 워크북은 행 하나가 필드 하나인 키-값 테이블이고, 로더가 Map 대신 그 레코드(`Promise<TableRow>`)를 돌려줍니다(설정·상수 테이블, 아래 키-값 시트).

엑셀 원본은 `sheets/`에, 컴파일러 구현은 `src/`에 둡니다. 공용 TypeScript 코드는 `src/runtime-files.js`에서 정의하며, 변환할 때 각 환경의 출력 폴더에 함께 생성합니다. 생성된 환경 폴더를 프로젝트에 복사하고, 최종 JavaScript 번들링은 게임 프로젝트에서 수행합니다.

## 실행

Node.js 22 이상이 필요합니다. 이 도구는 game-portfolio 모노레포의 `@tools/data-tool` 워크스페이스이므로 의존성은 리포지토리 루트에서 `npm ci`로 설치합니다. 이후 명령은 이 폴더(`tools/data-tool`)에서 실행합니다.

```sh
npm run example
```

`sheets/Items.xlsx`를 만들고 `sheets/` 폴더의 엑셀 4개를 변환해 `generated/`에 데이터와 코드를 생성합니다. 포함된 예제 엑셀을 직접 수정해도 됩니다. `npm run example`은 `Items.xlsx`를 초기화하므로 수정 후에는 아래 변환 명령을 사용하세요.

```sh
npm run convert -- sheets/Items.xlsx --out generated
npm run convert -- sheets --out generated
npm run convert -- ./게임아이템.xlsx --table Items --out ./build
node src/cli.js --help
```

파일당 하나의 테이블을 생성합니다. 여러 엑셀을 같은 출력 폴더로 변환할 수 있습니다. 테이블명은 파일명에서 가져오거나 `--table`로 지정하는 PascalCase ASCII 이름입니다. 이름이 같은 테이블을 다시 변환하면 해당 산출물을 덮어씁니다.

폴더를 입력하면 하위 폴더까지 포함한 모든 `.xlsx` 파일을 파일 경로순으로 하나씩 변환합니다. 확장자의 대소문자는 구분하지 않으며, Excel 임시 파일(`~$`로 시작), `.`으로 시작하는 숨김 파일·폴더(`.git`, macOS의 `._` 메타데이터 파일 등), `node_modules` 폴더, 폴더 안의 심볼릭 링크와 하위 폴더로 지정된 출력 경로는 건너뜁니다. 숨김 폴더도 입력 경로로 직접 지정하면 변환합니다.

폴더 변환에서는 파일명이 테이블명이므로 `--table`을 사용할 수 없습니다. 잘못된 테이블명이나 대소문자만 다른 이름을 포함한 중복 테이블명이 있으면 파일을 쓰기 전에 오류로 종료합니다. 대상 엑셀이 없는 경우도 오류입니다. 모든 워크북을 읽고 검사한 뒤에 쓰므로, 데이터 오류가 하나라도 있으면 해당 파일 경로를 표시하고 아무 파일도 쓰지 않습니다(이전 산출물이 그대로 남습니다). 테이블 간 참조(`ref`)와 Enum(`enum`)은 함께 변환하는 워크북 안에서 찾으므로, 그런 열이 있는 테이블은 폴더로 변환합니다.

## 추가 게임 데이터 샘플

`sheets/`에는 아이템 외에 다음 샘플이 있습니다. 각 파일은 첫 번째 `Data` 시트와 두 번째 `Schema` 시트로 구성되며, 필드 설명과 단위는 `Schema.description`에 적혀 있습니다. 수치는 작성·변환 연습을 위한 가상의 RPG 데이터입니다.

| 파일 | 데이터 수 | 주요 내용 |
| --- | --- | --- |
| [Monsters.xlsx](sheets/Monsters.xlsx) | 10종 | 체력, 공격력, 방어력, 이동 속도, 사용 스킬, 처치 보상, 보스 여부 |
| [Skills.xlsx](sheets/Skills.xlsx) | 10종 | 속성, 대상, 피해·회복 배율, 재사용 시간, 마나 소모, 효과 태그 |
| [Stages.xlsx](sheets/Stages.xlsx) | 6개 | 출현 몬스터, 보스, 권장 레벨, 입장 비용, 클리어 보상, 선행 스테이지 |

`Monsters.skillIds`는 `Skills.id`를, `Stages.monsterIds`와 `bossId`는 `Monsters.id`를, `Stages.unlockStageId`는 선행 `Stages.id`를 가리킵니다. 이 필드들은 일반 `int`·`int[]`·`int?`로 저장됩니다. 예제 스키마에는 검사 열이 없어 참조를 검사하지 않으며, 스키마 시트에 `ref` 열(예: `monsterIds`의 `Monsters`)을 더하면 변환이 검사합니다(아래 검사 열). `monsterIds`는 일반 몬스터의 종류 목록이고 보스는 `bossId`에 별도로 지정합니다. 클리어 보상은 몬스터 처치 보상에 추가됩니다.

배열은 JSON 문자열로, 선택값은 빈 셀로 입력합니다. 일부 셀은 `Schema.default` 적용 예시로 비워 두었습니다. 예를 들어 `숲의 입구`의 빈 `energyCost`는 5, `repeatable`은 `true`가 됩니다.

```sh
npm run convert -- sheets/Monsters.xlsx --out generated
npm run convert -- sheets/Skills.xlsx --out generated
npm run convert -- sheets/Stages.xlsx --out generated
# Items를 포함한 예제 4개를 한 번에 변환
npm run convert -- sheets --out generated
```

`npm run example`은 `Items.xlsx`를 재생성한 뒤 `sheets/` 폴더 전체를 변환합니다. 엑셀을 수정한 상태로 변환하려면 위 명령을 사용하세요.

## 엑셀 작성 규칙

시트 **이름이 아닌 순서**를 사용합니다. 각 시트의 1행은 헤더, 2행부터는 내용입니다. 세 번째 이후 시트는 읽지 않습니다. 시트가 하나뿐인 워크북은 아래 키-값 시트입니다.

첫 번째 시트 예제:

| id | name | price | tags | note |
| --- | --- | --- | --- | --- |
| 1 | 체력 물약 | 100 | `["consumable","회복"]` | |
| 2 | 강철 검 | 1250 | `["weapon"]` | 초급 장비 |

두 번째 시트 예제:

| index | name | type | default | description | range |
| --- | --- | --- | --- | --- | --- |
| 0 | id | int | | 아이템 ID | |
| 1 | name | string | | 표시 이름 | |
| 2 | price | uint | 0 | 구매 가격 | `0..100000` |
| 3 | tags | string[] | `[]` | 검색 태그 | |
| 4 | note | string? | | 선택 설명 | |

- `index`, `name`, `type`은 필수 헤더입니다. `default`, `description`과 검사 열(`ref`, `enum`, `range`, `length`, `when`)은 생략할 수 있습니다.
- `index`는 0~4095의 고유 정수입니다. 데이터 열 순서와 스키마 행 순서는 자유이며, 바이너리 순서는 `index`로 결정됩니다.
- `name`은 ASCII 식별자입니다. `id`, `item_name` 등이 가능하며 중복은 금지합니다.
- 테이블은 Map 키로 사용할 `id` 필드를 가집니다. 타입은 nullable·배열이 아닌 `int`, `uint`, `long`, `string` 중 하나이며, `id`의 wire index는 0이 아니어도 됩니다. 변환 시 기본값 적용과 타입 정규화를 마친 뒤 ID 중복을 검사하고, 중복이면 파일을 쓰기 전에 실패합니다. 데이터와 스키마 시트가 있는 테이블은 `id`가 필수이고, 행이 하나인 테이블은 키-값 시트로 씁니다.
- 빈 셀 또는 생략한 데이터 열은 `default` → nullable의 `null` 순서로 처리합니다. 둘 다 없으면 오류입니다. 필수 열은 데이터가 없어도 헤더가 필요합니다.
- 완전히 빈 행은 건너뜁니다. 병합 셀, 중복 헤더, 스키마에 없는 데이터 열, 헤더 없는 값은 오류입니다.
- 문자열은 Excel **텍스트 셀**로 입력합니다. 빈 문자열은 셀에 `""`를 입력합니다. 문자열 배열은 일반 JSON 규칙을 사용합니다.
- 수식은 Excel에 저장된 계산 결과만 사용합니다. 계산 결과가 없으면 실패하므로 Excel에서 재계산하고 저장하세요. 날짜 셀, Excel 오류 값은 지원하지 않으며 날짜는 텍스트로 작성합니다.
- `.xlsx` 형식을 지원합니다. `.xls` 파일은 Excel에서 `.xlsx`로 저장해야 합니다.

## 타입

| 스키마 | TypeScript | 규칙 |
| --- | --- | --- |
| `int` / `int32` | `number` | 부호 있는 32비트 정수 |
| `uint` / `uint32` | `number` | 부호 없는 32비트 정수 |
| `long` / `int64` | `bigint` | 부호 있는 64비트 정수 |
| `float` / `float32` | `number` | 변환 시 float32 정밀도로 반올림 |
| `double` / `float64` | `number` | 유한한 배정밀도 실수 |
| `bool` / `boolean` | `boolean` | `true`, `false`, `1`, `0` |
| `string` | `string` | 텍스트 |
| `big` | `Big` | 십진수(`1500`, `1.5e40`, `-3e+400`). double을 넘는 지수도 담는다 |

`[]`는 1차원 배열, `?`는 nullable입니다. `int[]`, `string?`, `long[]?`처럼 사용합니다. 배열 원소의 null, 중첩 배열, 객체는 지원하지 않습니다. Enum과 테이블 참조는 타입이 아니라 검사 열(`enum`, `ref`)로 적습니다.

변환 시 모든 셀과 기본값을 검증합니다. 정수 범위·유한한 실수·배열 원소 타입을 확인하고, 필수값이 빠지면 실패합니다. 기본값과 nullable의 `null`도 이때 채워 데이터에 저장합니다. `float`는 float32 정밀도로, `-0`은 `0`으로 정규화합니다. 데이터 오류가 있으면 해당 파일의 산출물을 쓰지 않습니다.

배열은 셀에 JSON으로 입력합니다. 예: `[1,2,3]`, `["검","방패"]`, `[true,false]`. 빈 배열은 `[]`입니다.

**64비트 정수:** Excel 자체의 숫자 정밀도를 피하려면 `long` 열을 텍스트 형식으로 지정하고 입력하세요. 특히 16자리 이상의 숫자는 반드시 텍스트로 작성하세요. 이미 Excel에서 반올림된 숫자는 복원할 수 없습니다. 배열의 큰 정수도 `["9007199254740993"]`처럼 따옴표로 감쌉니다.

**큰 수:** `big` 열은 숫자 셀이나 `1.5e40` 같은 텍스트 셀을 받고, `["10","2.5e3"]`처럼 배열도 됩니다. JSON과 MessagePack에는 십진 문자열로 저장하고(숫자 셀은 `String(n)`), 지수는 안전 정수여야 합니다. 생성된 TS 로더는 `Big.parse`로 `Big`을 만들므로, `big` 열이 있는 테이블은 `Big`을 내보내는 모듈을 `--big-module <specifier>`(API에서는 `bigModule`, 예: `@idle/big-number`)로 알려 줘야 하고 없으면 변환이 실패합니다. 로더는 그 모듈을 `import { Big } from '<specifier>';`로 가져오며, `big` 열이 없는 테이블에는 이 줄이 생기지 않습니다. 16자리를 넘는 가수는 `Number`로 읽어 double 정밀도로 줄어듭니다.

JSON의 `long`은 10진 문자열이고, MessagePack에서는 64비트 정수입니다. Node TypeScript는 두 형식을 `bigint`로 복원합니다. PuerTS TypeScript도 MessagePack의 64비트 정수를 `bigint`로 복원합니다. TypeScript 결과를 다시 `JSON.stringify`할 때는 bigint를 문자열로 바꾸는 replacer가 필요합니다.

## 검사 열

스키마 시트에 아래 열을 더하면 변환이 타입 검사 다음에 값을 검사합니다. 규칙은 열의 성질이라 그 필드의 스키마 행에 적고, 툴은 게임마다 다른 코드 없이 같은 규칙을 읽습니다.

| 열 | 값 예시 | 뜻 |
| --- | --- | --- |
| `ref` | `Monsters` | 값(배열이면 원소마다)이 그 테이블의 `id`입니다. null은 건너뜁니다. 대상 테이블은 함께 변환하는 워크북이어야 하고 `id`가 있어야 합니다. 대상의 `id`가 `string`이면 생성 TS 타입이 그 테이블의 키 타입이 됩니다(`nameKey: StringsId`, 아래 문자열 키). |
| `enum` | `ItemKind` | 값이 `Enums` 워크북의 그 Enum 멤버입니다. 정수 Enum은 `int`·`uint` 열, 문자열 Enum은 `string` 열에 씁니다. 생성 TS 타입도 그 Enum이 됩니다(`kind: ItemKind`). |
| `range` | `0..`, `0..1`, `..100` | 숫자 값(배열이면 원소마다)이 양 끝을 포함한 범위 안입니다. 숫자 타입과 `big`에만 씁니다. |
| `length` | `1..` 또는 `clearItemIds` | 배열 원소 수의 범위이거나, 길이가 같아야 하는 다른 배열 필드(같은 순서의 ID 목록과 수량 목록)입니다. |
| `when` | `kind=Equipment` | 조건이 맞는 행에만 있는 열입니다. 다른 행은 비워야 하고 null로 저장되며(TS 타입에 `\| null`이 붙음), 조건이 맞는 행에서는 열의 타입대로입니다(`?`가 없으면 필수, `default`는 이 행들에만). 조건 필드는 `when`이 없는 스칼라 필드이고, 값은 그 필드의 값이나 Enum 멤버 이름입니다. `kind=Damage\|Heal`처럼 `\|`로 여럿을 적으면 그중 하나인 행에 있습니다. |

`range`·`length`·`when`·`enum`·`ref`의 위반은 던지지 않고 모든 워크북에서 모은 뒤 한 번에 알리고, 하나라도 있으면 아무 파일도 쓰지 않습니다. 각 줄이 파일, 시트, 셀, 필드(배열이면 원소 위치)를 짚습니다.

```text
sheet-baker: 2 table check(s) failed:
  data/Stages.xlsx: Data!D2 (monsterIds[1]): 2999 is not an id in Monsters
  data/Items.xlsx: Data!F2 (slot): only rows with kind=Equipment may fill this column
```

검사 열의 문법 오류(없는 Enum, 숫자가 아닌 열의 `range`, 배열이 아닌 열의 `length` 등)는 스키마 행을 짚고 바로 실패합니다.

## 키-값 시트

시트가 하나인 워크북은 행 하나짜리 테이블(설정·상수)입니다. 스키마 시트에 `value` 열을 더한 모양이라 행 하나가 필드 하나이고, 값을 더하면 행 하나가 늡니다.

| index | name | type | value | description | ref | range |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | heroId | uint | 1 | 플레이어가 쓰는 영웅 | Heroes | |
| 1 | offlineCapHours | double | 12 | 오프라인 보상의 상한 (시간) | | `0..` |
| 2 | mainBgm | string | `bgm.battle` | 메인 화면의 BGM | Sounds | |

- `index`, `name`, `type`, `value`는 필수 헤더이고, `description`과 검사 열 `ref`, `enum`, `range`, `length`를 쓸 수 있습니다. 값이 행에 있으므로 `default`가 없고, 행이 하나라 다른 행을 보는 `when`도 없습니다. `id`는 Map 키라서 필드 이름으로 쓸 수 없습니다.
- `value`는 그 행의 `type`으로 읽습니다. 타입이 틀린 값과 빈 값(`?` 타입이 아니면)은 그 셀을 짚어 바로 실패하고(`Constants!D3 (offlineCapHours): invalid number (expected double)`), 검사 열의 위반은 다른 테이블처럼 모아서 알립니다(`Constants!D4 (mainBgm): "bgm.none" is not an id in Sounds`).
- 생성 파일은 다른 테이블과 같은 형식입니다. 필드마다 타입이 있는 `<테이블>Row` 하나, JSON `[{…}]`, `index` 순서의 MessagePack 배열 `[[…]]`이고 로더는 `Promise<TableRow>`입니다. 코드는 `row.heroId`처럼 읽고 시트에 없는 이름은 타입 검사가 잡습니다. 이름을 바이너리에 저장하지 않아서, 예를 들어 상수 13개가 84바이트입니다(이름-값 쌍으로 저장하면 231바이트, 로드는 Node 22에서 0.4 µs 대 1.3 µs).

## 문자열 키

`id`가 `string`인 테이블은 id의 리터럴 유니온 `<테이블>Id`를 함께 내보내고, `id`와 Map의 키 타입이 그것입니다. 그 테이블을 `ref`로 가리키는 열의 타입도 그것이라(그 테이블의 파일에서 `import type`), 테이블에 없는 키를 쓰는 코드는 타입 검사가 실패합니다. 정수 id는 그대로 `number`입니다. 키 하나가 한 줄이라 키를 더하거나 지우면 그 줄만 바뀝니다.

```ts
export type StringsId =
  | "common.close"
  | "item.oldSword";

export interface ItemsRow {
  "nameKey": StringsId;   // 스키마의 ref가 Strings
}
```

문장 테이블(로컬라이징)은 이것과 기존 규칙만으로 만듭니다. 언어마다 필수 `string` 열(`ko`, `en`)을 두면 번역이 빠진 칸은 그 셀을 짚어 실패하고(`Data!C12: 'en' is required`), 표시 문장 대신 키를 적는 열에 `ref`를 걸면 문장 테이블에 없는 키가 위반으로 모입니다(`Data!B4 (nameKey): "item.axe" is not an id in Strings`). 코드가 쓰는 키는 위 키 타입이 잡습니다. 언어 열 이름이나 인자 문법(`{이름}`)은 게임이 정하는 것이라 툴은 모릅니다.

## Enum 워크북

이름이 `Enums`인 워크북은 데이터 대신 Enum을 정의합니다. 로더와 데이터 파일 대신 각 대상 폴더에 `Enums.ts`를 만들고, `_index.ts`가 함께 내보냅니다.

| id | value | text | description |
| --- | --- | --- | --- |
| `ItemKind.Currency` | 1 | | 재화 |
| `ItemKind.Equipment` | 3 | | 장비 |
| `SoundChannel.Bgm` | | `bgm` | 배경 음악 |

- 스키마는 `id`(`string`), `value`(`int?`), `text`(`string?`), `description`(`string?`)입니다.
- `id`는 `Enum이름.멤버이름`입니다. Enum 이름은 PascalCase ASCII, 멤버 이름은 ASCII 식별자입니다.
- 행마다 `value`(정수 Enum)나 `text`(문자열 Enum, 데이터 셀에 적는 글자) 중 하나만 적습니다. 한 Enum은 한 종류이고 값이 겹치지 않습니다.
- 생성 코드는 시트 순서대로 `export enum ItemKind { Currency = 1, … }`이고 `description`이 멤버 주석이 됩니다.

## MessagePack 형식

최상위는 행 배열이며, 각 행도 인덱스로 접근하는 배열입니다. 필드명이나 정수 키를 반복 저장하는 map은 사용하지 않습니다.

이것은 저장 형식입니다. TypeScript 로더는 디코딩한 각 행을 `id` 기준의 JavaScript `Map`에 넣어 반환합니다.

```text
JSON:        [{"id":1,"name":"체력 물약","price":100,"tags":[],"note":null}]
MessagePack: [[1,    "체력 물약",       100,        [],      nil]]
              ↑0     ↑1                ↑2         ↑3       ↑4
```

`.bytes`는 위 배열을 인코딩한 원시 MessagePack 파일입니다. 별도 압축이나 커스텀 헤더가 없으며 다른 MessagePack 구현에서도 읽을 수 있습니다. float 필드는 float32 정밀도로 정규화하지만 MessagePack 인코더는 비정수 숫자를 float64로 저장합니다.

스키마를 변경하면 데이터와 로더를 함께 다시 생성하고 배포하세요. 역직렬화는 생성된 데이터를 그대로 읽으며, 이전 데이터에 없는 필드의 기본값을 보충하지 않습니다. 삭제된 인덱스는 빈 슬롯(`nil`)으로 저장하고, 로더가 모르는 뒤쪽 필드는 무시합니다. 큰 인덱스 간격은 빈 슬롯 때문에 파일 크기를 늘립니다. 바이너리에 스키마 해시가 없으므로 데이터와 로더의 버전 일치를 자동 검사하지 않습니다.

## 생성 파일

```text
generated/
  data/Items.json
  data/Items.bytes
  typescript/node/Items.ts
  typescript/node/runtime/
    messagepack.ts                  # Node용 디코더
    THIRD_PARTY_NOTICES.txt
  typescript/portable/Items.ts
  typescript/portable/Enums.ts       # Enums 워크북이 있을 때 TS enum (node, puerts에도)
  typescript/portable/_index.ts      # 모든 테이블의 타입·로더 export
  typescript/portable/runtime/
    messagepack.ts                  # 호스트 중립 디코더
    THIRD_PARTY_NOTICES.txt
  typescript/puerts/Items.ts
  typescript/puerts/_index.ts        # 모든 테이블의 타입·로더 export
  typescript/puerts/runtime/
    messagepack.ts                  # PuerTS용 디코더
    puerts.ts                       # 폴리필 초기화 + 디코더 export
    environment.ts                  # 폴리필용 전역 객체 호환 처리
    THIRD_PARTY_NOTICES.txt
```

테이블별 TypeScript와 데이터는 엑셀에 따라 생성합니다. 각 환경 폴더의 `runtime/`은 엑셀 내용과 무관한 공용 코드입니다. 처음 변환할 때 함께 생성하고, 이후에는 내용이 달라졌을 때만 갱신하므로 같은 공용 파일을 반복해서 쓰지 않습니다. 출력 폴더를 삭제해도 다음 변환에서 공용 코드까지 다시 생성합니다. `_index.ts`는 테이블 목록을 내보내는 진입점입니다.

Node·portable 로더는 `./runtime/messagepack.js`, PuerTS 로더는 `./runtime/puerts.js`를 참조합니다. 생성 코드에는 이 도구의 저장소나 외부 런타임 경로에 대한 import가 없습니다. 사용할 환경 폴더 전체를 복사하면 내부 상대 경로가 유지됩니다. `--runtime` 경로 지정은 필요하지 않으며 제거했습니다.

엑셀의 두 번째 스키마 시트는 컴파일 시에만 사용합니다. 생성된 역직렬화 코드는 필드 위치를 직접 매핑합니다. 타입·범위 검증과 기본값 처리는 변환 단계에서 끝내므로 실행 중에는 반복하지 않습니다. `ItemsSchema` 같은 상수와 별도 `.schema.json` 파일도 생성하지 않습니다.

TypeScript 로더는 공용 런타임을 import하고 `row[0] as number`처럼 인덱스로 값을 꺼냅니다. `as`는 컴파일 시 타입 표시이며 런타임 검사는 아닙니다. Node JSON 로더도 필드를 직접 매핑하고, JSON에서 문자열로 저장한 `long`은 `BigInt`로 복원합니다. `big`은 JSON과 MessagePack 모두 `Big.parse`로 복원합니다.

모든 TypeScript `deserialize*`·`load*` 함수는 `async`이며 `Promise<Map<Id, TableRow>>`를 반환합니다(`id`가 없는 테이블은 `Promise<TableRow>`). `Id`는 스키마에 따라 `number`, `bigint`, `string`으로 생성됩니다. 호출 시 `await`하고 `.get(id)`로 조회하거나 `.values()`로 순회합니다. 빈 테이블은 빈 Map이며, 없는 ID의 조회 결과는 `undefined`입니다. 디코딩 오류는 Promise rejection으로 전달됩니다. 디코딩과 Map 구성 자체는 호출 스레드에서 수행합니다.

엑셀 하나를 다시 변환해도 다른 테이블의 생성 소스와 데이터는 유지하고, `_index.ts`에도 기존 테이블을 포함합니다. 원본 엑셀 삭제만으로 기존 생성 파일이 지워지지는 않으므로, 전체 테이블 구성을 새로 만들 때는 비어 있는 출력 폴더를 사용하세요.

이전 버전의 `generated/puerts/` JS 번들과 테이블 옆의 `_runtime.ts`, `_environment.ts`는 더 이상 사용하지 않습니다. 외부 `runtime/`을 참조하는 구버전 로더도 전체 엑셀을 다시 변환해 갱신하세요. 자동 마이그레이션은 제공하지 않으며, 역직렬화 함수 이름과 데이터 형식은 유지됩니다.

로더는 이 도구에서 검증한 데이터와 함께 사용합니다. JSON/MessagePack 문법 오류는 디코더가 처리하지만, 외부에서 만든 데이터에 대한 필드별 검증이나 누락값 보정은 제공하지 않습니다.

데이터 검증과 코드 생성을 마친 뒤 파일을 교체하므로 데이터 오류가 있으면 이전 산출물을 보존합니다. 파일별 교체이며 디렉터리 전체를 트랜잭션으로 교체하지는 않습니다. 서로 다른 변환 작업이 같은 출력 폴더에 동시에 쓰지 않도록 실행 순서를 정하세요.

## Node 서버에서 사용

`generated/typescript/node/` 전체를 서버 프로젝트에 복사합니다. 이 폴더에 디코더가 포함되어 있고 PuerTS용 폴리필은 포함되지 않습니다. 서버 프로젝트에 `@msgpack/msgpack` 3.x 및 개발용 `@types/node`를 설치하세요. TypeScript target은 ES2020 이상을 사용합니다. 아래는 프로젝트에 `generated/typescript/node/`를 둔 경우입니다.

```ts
import { loadItemsJson, loadItemsMessagePack } from './generated/typescript/node/Items.js';

const items = await loadItemsMessagePack('./data/Items.bytes');
const sameItems = await loadItemsJson('./data/Items.json');
const item = items.get(1);
if (item) console.log(item.name, item.reward); // string, bigint
```

파일 I/O가 필요 없으면 `await deserializeItemsJson(text)`, `await deserializeItemsMessagePack(bytes)`를 사용합니다. 바이너리는 `Uint8Array` 또는 `ArrayBuffer`로 전달합니다. 기존 배열 API를 사용하던 코드는 `await`와 `.get(id)`/`.values()` 사용으로 변경해야 합니다.

## 호스트 중립 로더

`generated/typescript/portable/`은 파일 I/O도 UTF-8 폴리필도 없이 MessagePack 역직렬화만 합니다. 같은 로더를 여러 호스트(예: PuerTS 클라이언트와 Node 서버)가 함께 쓸 때 사용합니다. `@msgpack/msgpack`은 불러오는 즉시 `TextEncoder`/`TextDecoder`를 쓰므로, 이 전역이 없는 호스트(PuerTS V8)는 로더보다 먼저 폴리필을 설치해야 합니다. 바이트는 각 호스트가 읽어 `deserialize*MessagePack`에 넘깁니다.

## PuerTS에서 사용

PuerTS용 최종 산출물은 `generated/typescript/puerts/`의 TypeScript입니다. 게임 코드는 여기서 타입과 로더를 import하고, 게임 프로젝트의 빌드 과정에서 함께 JavaScript로 번들링합니다. Excel 변환기는 JS 번들을 만들지 않습니다.

1. `generated/typescript/puerts/` 전체를 게임의 TypeScript 소스 폴더에 복사합니다. 아래 예시는 이를 `src/GameData/`로 배치합니다. 안의 `runtime/`도 함께 복사합니다.
2. 게임의 TypeScript 프로젝트에 `@msgpack/msgpack`, `fast-text-encoding`을 설치합니다.
3. 생성된 타입·로더를 게임 코드에서 사용하고, 공용 런타임과 두 라이브러리를 게임 번들에 포함합니다. 라이브러리를 external로 제외하지 않습니다.
4. `generated/data/`의 `.bytes` 파일을 CDN에 배포합니다. 게임의 HTTP 클라이언트로 다운로드한 응답 본문을 `ArrayBuffer` 또는 `Uint8Array`로 역직렬화 함수에 전달합니다. 다운로드와 캐싱은 게임 프로젝트에서 처리합니다.

예를 들어 게임의 TypeScript 프로젝트가 `../GameScripts`에 있다면:

```sh
npm run convert -- sheets --out generated
mkdir -p ../GameScripts/src/GameData
cp -R generated/typescript/puerts/. ../GameScripts/src/GameData/
# 게임 프로젝트에서 최초 한 번 의존성 설치
npm --prefix ../GameScripts install @msgpack/msgpack fast-text-encoding
```

게임의 `src/main.ts` 코드:

```ts
import {
  type ItemsRow,
  deserializeItemsMessagePack,
  deserializeMonstersMessagePack,
} from './GameData/_index.js';

// 게임의 HTTP 클라이언트로 CDN에서 다운로드한 바이너리를 전달합니다.
async function loadGameData(
  itemsBytes: Uint8Array | ArrayBuffer,
  monstersBytes: Uint8Array | ArrayBuffer,
) {
  const items: Map<number, ItemsRow> = await deserializeItemsMessagePack(itemsBytes);
  const monsters = await deserializeMonstersMessagePack(monstersBytes);
  const slime = monsters.get(2001);
  if (slime) console.log(slime.name, slime.maxHp);
  return { items, monsters };
}
```

복사한 `GameData/runtime/puerts.ts`가 `TextEncoder`/`TextDecoder` 폴리필을 초기화한 뒤 공용 디코더를 제공합니다. 네이티브 구현이 있으면 그대로 사용합니다. 테이블마다 같은 모듈을 참조하므로 게임 번들에 공용 코드가 한 번만 포함됩니다. ES2020, `BigInt`, typed array를 지원하는 PuerTS 엔진이 필요합니다.

게임의 기존 빌드 파이프라인에 생성된 TS를 포함하고, 출력 형식은 프로젝트의 PuerTS loader에 맞춰 선택합니다. 위 코드에서는 CDN 다운로드를 마친 뒤 `await loadGameData(itemsBytes, monstersBytes)`로 호출합니다. 데이터와 생성 코드는 동일한 버전으로 배포하세요.

## 코드에서 변환

```js
import { convertWorkbook, convertWorkbooks } from './src/index.js';

await convertWorkbook('sheets/Items.xlsx', {
  out: 'generated', table: 'Items', bigModule: '@idle/big-number', // bigModule은 big 열이 있을 때만 필요
});
// ref·enum 열이 있으면 대상 워크북과 함께 변환한다. table은 생략하면 파일명이다.
await convertWorkbooks([{ input: 'data/Enums.xlsx' }, { input: 'data/Items.xlsx' }, { input: 'data/Stages.xlsx' }], { out: 'generated' });
```

## 검증

```sh
npm test             # 변환·오류 검증, 생성 TS strict 타입 검사, Node/portable/PuerTS 번들 실행
npm run check       # npm test와 동일
```

한글·이모지, 정수 경계값, nullable, 배열, 저장된 기본값, 인덱스 간격, async Map 반환, 중복 ID와 잘린 바이너리를 검사합니다. 검사 열(`test/checks.test.js`)은 위반을 모아 셀 위치로 알리는지, 위반이 있으면 아무것도 쓰지 않는지, Enum·조건부 열·키-값 시트와 문자열 키 타입의 생성 TS가 strict로 컴파일되고 읽히는지(없는 키는 컴파일 오류), 문장 테이블의 빠진 번역과 없는 키, 키-값 시트의 틀린 값과 빈 값, `id` 없는 두 시트 테이블을 잡는지 봅니다. 잘못된 셀·배열 원소·기본값은 변환 단계의 테스트에서 검사합니다. Node, portable, PuerTS 출력은 저장소 밖 독립 프로젝트로 복사해 해당 프로젝트의 의존성만으로 타입 검사·번들링·실행을 검증합니다. PuerTS 번들은 Node API 및 TextEncoder/TextDecoder가 없는 JavaScript VM에서도 검사합니다. 실제 Unity Editor, IL2CPP 빌드 및 PuerTS 엔진 실행은 프로젝트에서 별도 확인해야 합니다.

사용한 라이브러리 문서: [ExcelJS](https://github.com/exceljs), [MessagePack JavaScript](https://github.com/msgpack/msgpack-javascript), [PuerTS](https://github.com/Tencent/puerts), [UTF-8 polyfill](https://github.com/samthor/fast-text-encoding). 게임 번들 배포 시 복사한 `GameData/runtime/THIRD_PARTY_NOTICES.txt`의 라이선스 고지를 포함하세요.
