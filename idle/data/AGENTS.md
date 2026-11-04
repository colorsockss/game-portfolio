# idle/data/

기획 원본입니다. xlsx는 Excel로, `formulas.json`은 Formula Lab으로 고친 뒤 루트에서 `npm run generate`를 실행하고 생성 파일과 함께 커밋합니다(`data:`).

- xlsx 변경은 생성된 `idle/shared/data-schema/data/*.json`의 diff로 설명합니다.
- 테이블을 추가하면 `loadGameData`에 더합니다. 공식 key는 `npm run generate`가 `E_AbilityType`을 다시 만들어 따로 더하지 않습니다. Enum 멤버는 `Enums.xlsx`(생성 코드의 TS enum), 코드가 읽는 규칙 값과 코드가 고르는 행(경험치 아이템, 소리 키 등)은 `Constants.xlsx`(시트 하나에 상수 하나가 행 하나인 키-값 시트. 상수를 더하면 행 하나에 `type`, `value`, 검사 열을 적습니다)에 둡니다. 공식 식만 읽는 값은 `formulas.json`의 상수이고, 같은 값을 두 곳에 두지 않습니다.
- 화면에 보이는 문장은 `Strings.xlsx`(키 `id`와 언어 열 `ko`, `en`)에만 둡니다. 다른 테이블은 문장 대신 키 열(`nameKey`, `textKey`, 검사 열 `ref`는 `Strings`)을 두고, 기획 메모(`note`)만 한국어 그대로 적습니다. 언어 열은 모든 줄을 채우고, 같은 키의 언어들은 같은 `{이름}` 인자를 씁니다(클라이언트 테스트가 확인). 언어를 더하면 Strings에 ISO 639-1 이름의 열을 더합니다.
- `big` 열(HP, 공격력처럼 double을 넘을 수 있는 값)은 숫자 셀이나 `1.5e40` 같은 십진 텍스트 셀로 쓰고, double을 넘는 값은 텍스트로 씁니다. 생성은 `--big-module`이 필요한데 `npm run generate`가 넘깁니다.
- 참조, 값 범위, 짝 배열의 길이, Enum, 장비만 쓰는 열은 스키마 시트의 검사 열(`ref`, `range`, `length`, `enum`, `when`)로 적으면 `npm run generate`가 검사합니다. 열을 더하면 그 행에 규칙도 적습니다. 검사하지 않는 것은 직접 확인합니다: `HeroLevels`가 1부터 `expToNext`가 빈 칸인 최대 레벨까지 이어져야 하고(빠지면 시뮬레이션이 던짐), 소리 키는 맞는 채널이어야 합니다(`Stages.bgm`은 `bgm`, `Constants`의 효과음과 `Skills.sfx`는 `sfx`. 클라이언트의 `audio.test.ts`가 확인), `Items.icon`과 `Skills.icon`은 클라이언트의 `Assets/UI/Sprites/Icons/`에 같은 이름의 그림이 있어야 합니다(클라이언트의 `icons.test.ts`가 확인). `Heroes`·`Monsters`·`Summons`의 `clips`는 클라이언트의 `Assets/Battle/Clips/`에 같은 이름의 에셋이, `Projectiles.clip`은 그 `projectiles` 묶음에 같은 이름의 클립이 있어야 합니다(`clips.test.ts`가 확인). 장비는 오프라인 보상이 재지 않으므로 클리어와 보스의 보상에만 둡니다.
- `~$*.xlsx` 잠금 파일은 커밋하지 않습니다.
