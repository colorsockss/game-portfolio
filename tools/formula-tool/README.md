# formula-lab

공식을 편집·시뮬레이션하고 TypeScript로 내보내는 데스크톱 앱(Tauri + SvelteKit)입니다.

## 실행

이 앱은 game-portfolio 모노레포의 `@idle/formula-tool` 워크스페이스이므로 의존성은 리포지토리 루트에서 `npm ci`로 설치합니다. 실행은 `npm run tauri dev -w @idle/formula-tool`이고 [Tauri 사전 요구사항](https://v2.tauri.app/start/prerequisites/)(Rust 툴체인)이 필요합니다.

## TypeScript 내보내기 설정

프로젝트 파일의 `exportSettings`가 생성 코드를 정합니다.

| 키 | 뜻 |
| --- | --- |
| `abilityTypeImport` | `E_AbilityType`을 가져올 경로 (필수) |
| `numeric` | `"number"`(기본) 또는 `"big"`. `"big"`이면 `@idle/big-number`의 `Big`으로 계산하고 `IAbilityOwner.get`, `Formula.get`이 `Big`을 돌려줍니다. |
| `bigImport` | `numeric`이 `"big"`일 때 `Big`을 가져올 경로 (기본 `@idle/big-number`) |

Big 모드의 규칙:

- `+ - * /`는 `Big.add/sub/mul/div`, 단항 `-`는 `Big.neg`, 비교는 `Big.lt/lte/gt/gte/eq`, 숫자 리터럴과 상수는 `Big.from`입니다. `min`/`max`(인자 셋 이상은 왼쪽부터 접음)와 `floor`는 `Big.min/max/floor`이고, `abs`와 `clamp`는 생성 파일 안의 도우미 함수입니다.
- `pow(x, n)`은 `Big.pow(x, n)`입니다. 제곱을 거듭하는 곱셈이라 어느 엔진에서든 같은 비트를 내고 double(1.8e308)을 넘는 값도 냅니다. 지수는 정수만 받습니다: 리터럴이 정수가 아니면(`pow(2, 0.5)`) 검증이 거절하고, 식이면(`pow(growth, step)`) 실행할 때 `Big.pow`가 `RangeError`를 던집니다. 툴의 시뮬레이션도 정수가 아닌 지수를 오류로 보입니다(값은 double로 계산해 마지막 비트는 다를 수 있음).
- 조건식은 비교(`< <= > >= == !=`), `&& || !`, `조건 ? 값 : 값`입니다. 조건의 결과는 불리언이고 분기의 값은 수여야 합니다.
- 클라이언트와 서버가 같은 비트를 내야 하므로 `sqrt`, `round`, `ceil`, `rand`, `randInt`, `%`는 쓸 수 없습니다. 편집기의 진단(`analyze`)이 `Unsupported` 오류로 그 자리에 밑줄을 긋고, 내보내기와 `npm run generate`도 실패합니다.
- 수와 불리언을 섞으면(산술에 불리언, 조건에 수) 형식 오류로 내보내기가 실패합니다. 공식의 결과는 수여야 합니다.
- `Formula.debug` 로그는 값을 `Big.toNumber`로 바꿔 찍습니다.

`numeric`이 없으면 `number` 코드를 만듭니다(`pow`는 `Math.pow`, `rand`는 `Math.random`).

## 입력

공식은 시전자·대상의 스탯(`caster.attack`), 상수, 다른 공식 말고도 **입력**을 읽습니다. 입력은 공식을 부르는 쪽이 넘기는 값(효과의 계수, 강화 단계 등)이고 프로젝트의 `inputs`에 상수와 같은 모양(`key`, `value`, `description`)으로 둡니다. `value`는 툴의 시뮬레이션이 쓰는 기본값이며, 시뮬레이션 패널에서 바꿔 볼 수 있습니다. 공식에서는 이름 그대로(`floor(caster.attack * power)`) 씁니다.

생성 코드는 입력을 `FormulaInput`(입력마다 선택 속성 하나, 설명은 주석)으로 받습니다: `Formula.get(type, caster, target, { power: 0.15 })`. Big 모드에서는 수(`BigLike`)를 받아 `Big.from`으로 바꿉니다. 공식이 읽는 입력을 넘기지 않으면 던지고, 다른 공식을 부를 때는 받은 입력을 그대로 넘깁니다. 입력을 읽지 않는 공식은 마지막 인자를 생략해도 됩니다.

## 전투 미리보기

시뮬레이션 패널의 "전투 미리보기"는 지금 프로젝트(저장하지 않은 편집 포함)의 공식으로 게임의 전투를 N초 돌린 결과를 보입니다. 툴은 게임 코드를 import하지 않으므로 계산은 프로젝트가 가리키는 스크립트가 합니다.

```json
"previewSettings": {
  "script": "../balance/run.mjs",
  "args": ["--preview"],
  "fields": [{ "key": "seconds", "value": 60, "description": "돌릴 시간 (초)" }]
}
```

- `script`는 프로젝트 파일 기준 경로이고, 툴(Rust의 `run_preview`)이 프로젝트 폴더에서 `node <script> <args…>`를 실행합니다. PATH에 `node`가 있어야 합니다.
- 요청은 표준 입력의 JSON `{ "project": <프로젝트>, …fields }`입니다. `fields`는 툴이 뜻을 모르는 수이고 패널이 입력란으로 보입니다(바꾼 값은 저장하지 않음).
- 성공하면 스크립트가 표준 출력에 쓴 JSON을 툴이 모양을 모르는 채로 보입니다: 수는 한 줄, 객체는 키-값 목록, 객체 배열은 표입니다. 실패하면(종료 코드가 0이 아님) 표준 오류의 문장을 보입니다. 패널은 왕복 시간도 보입니다.
- 스크립트를 실행하므로 믿는 프로젝트 파일에만 씁니다.

**잇는 방법**: 요청마다 프로세스를 새로 띄웁니다. 상태가 없어 시작·종료·다시 시작을 관리할 것이 없고, 게임 코드를 고친 뒤에도 툴을 다시 켤 필요가 없으며, 스크립트가 죽어도 툴은 그 요청만 실패합니다. 키우기(`idle/data/formulas.json`)의 스크립트는 `idle/balance/run.mjs --preview`이고, 응답 시간(Apple M4 Max, Node 22.14, 15번의 중앙값)은 60초 전투 95 ms, 10분 106 ms, 1시간 116 ms, 24시간 189 ms입니다. 그중 node 시작이 두 번(약 17 ms씩, run.mjs와 내보내기 스크립트), 내보내기(검증·코드 생성) 39 ms이고 나머지가 게임 코드 묶기와 전투입니다. 같은 프로세스를 띄워 두고 요청마다 다시 묶어 돌리면 14 ms(60초)–30 ms(1시간)이지만, 묶은 코드를 `data:` URL로 import할 때마다 모듈이 남아 30번에 메모리가 107 → 151 MB로 늘어 주기적으로 다시 띄워야 하고, 게임 코드가 바뀐 것도 알아채야 합니다. HTTP 서버도 상주 프로세스와 같은 비용에 포트와 따로 켜는 단계가 더해집니다. 미리보기는 버튼을 누를 때 한 번이라 0.1–0.2초를 받아들이고 단순한 쪽을 골랐습니다.
