# 그림 목록

MMORPG(`mmo/`)에 들어간 그림과 그 출처입니다. 원본 파일은 저장소에 두지 않고, 받는 곳과 가져오는 스크립트만 적습니다. 가져온 에셋(`client-unreal/Content/`)은 LFS로 커밋합니다. 엔진의 마네킹 등 Epic 콘텐츠는 공개 저장소에 올릴 수 없어 쓰지 않습니다.

## 필요한 것

게임에 들어갈 그림과 소리의 목록입니다(2026-11-14, backlog 73). 직접 만든 것이나 CC0만 넣습니다. 그림이 없는 것은 자리 표시로 두고 기능 항목은 자리 표시로 끝낼 수 있으며, 실제 것으로 바꾸는 것은 backlog 91입니다. "정하지 않음"은 91이 고르고 그때 받는 곳, 라이선스, 가져오는 스크립트를 이 문서의 표에 적습니다.

| 무엇 | 수 | 지금 | 넣을 것 |
|---|---|---|---|
| 캐릭터 메시 | 2(기사, 마법사) | 있음(아래 "캐릭터") | - |
| 몬스터 메시 | 9종과 필드 보스 1 | 자리 표시: 빨간 원기둥 | 정하지 않음. 캐릭터와 화풍이 같은 Quaternius의 CC0 팩이 후보 |
| NPC 메시 | 5종(상점, 창고, 제작, 퀘스트, 경비병) | 아직 없음(37, 44가 넣음). 넣으면 초록 원기둥 | 캐릭터 팩의 남은 넷(성직자, 수도사, 궁수, 도적)이 후보 |
| 채집물 메시 | 6종(나무·광석·약초 × 2단계) | 아직 없음(47). 넣으면 갈색 원뿔 | 정하지 않음 |
| 무기 메시 | 2(검, 지팡이) | 캐릭터 메시에 붙어 있음 | 입은 무기를 바꿔 보이는 것은 34가 정함 |
| 바닥 아이템 메시 | 1 | 자리 표시: 노란 작은 상자(33) | 정하지 않음 |
| 환경 메시 | 아래 "맵의 것"의 9종 | 엔진 기본 도형의 자리 표시 | 아래 "맵의 것" |
| 캐릭터 애니메이션 | 대기, 달리기, 공격, 피격, 죽음, 시전 | 있음(캐릭터 팩) | - |
| 채집·제작·귀환 동작 | 3 | 아직 없음(47, 48, 32) | 캐릭터 팩의 `PickUp`(채집)이 후보 |
| 몬스터 애니메이션 | 종마다 대기, 걷기, 공격, 피격, 죽음 | 자리 표시(원기둥은 동작이 없고 죽으면 눕힘) | 몬스터 메시와 함께 |
| 아이템 아이콘 | 장비 21종, 소모품 18(물약 4, 귀환·강화 주문서 2, 스킬북 10, 펫 2), 재료 15(채집 6, 몬스터 부산물 9) | 글자 아이콘(인벤토리의 칸, 퀵슬롯의 물약. 32) | 정하지 않음 |
| 스킬 아이콘 | 11(소환은 95가 더함) | 글자 아이콘(퀵슬롯) | 정하지 않음 |
| 효과 아이콘 | 4와 전투 상태, 선공 표시 | HUD의 글 한 줄 | 정하지 않음. 아이콘으로 보이는 것은 그 화면을 고치는 항목 |
| 메뉴와 버튼 아이콘 | 메뉴 5(가방, 캐릭터, 스킬, 퀘스트, 설정)와 터치 버튼 | 글을 쓴 버튼 | 정하지 않음 |
| 글꼴 | 한글과 영문이 함께 나오는 것 1 | 엔진 기본 글꼴(한글도 그려짐) | 정하지 않음. CC0 글꼴이 없으면 엔진 기본 글꼴로 둠 |
| 이펙트와 소리 | 아래 "이펙트와 소리"와 강화, 보스 등장 | 아래 표의 자리 표시(레벨 업은 31, 줍기는 33이 더함). 강화, 보스 등장은 그 기능 항목(35, 43)이 연출 표에 줄을 더함 | 정하지 않음 |

- 개체의 자리 표시: 표현 표(`/Game/Characters/DA_EntityVisuals`)에 줄이 없는 템플릿은 개체 종류마다의 도형과 색(`Placeholders`)으로 그립니다. 플레이어 파란 원기둥, 몬스터 빨간 원기둥, NPC 초록 원기둥, 채집물 갈색 원뿔, 바닥 아이템 노란 상자이고, 재질은 `M_Placeholder`(색은 커스텀 프리미티브 데이터)입니다. 그림이 생기면 표에 줄을 더할 뿐 자리 표시는 그대로 둡니다.
- 아이콘 표: `/Game/UI/DA_Icons`(아이템, 스킬, 효과의 번호 → 그림의 소프트 참조)이고 지금은 줄이 없습니다. 줄이 없는 것은 이름의 첫 글자를 크게 쓴 글자 아이콘이라, 한 직업의 스킬은 두 언어 모두 첫 글자가 다르게 짓습니다(엔진 없는 테스트가 봄).

## 만든 에셋

`client-unreal/Content/`에서 바깥의 원본 없이 코드로 만든 것입니다. 모두 직접 만든 것이고 손으로 고치지 않으며, 만드는 것을 고쳐 다시 만듭니다.

| 에셋 | 만드는 것 |
|---|---|
| `Maps/Field`, `Materials/M_Ground`, `M_Sky`, `M_Placeholder` | `Scripts/create_content.py`(땅, 해, 하늘, 안개, 머티리얼)와 에디터 모듈의 `MmoBuildMap`(맵에 놓인 것의 자리 표시) |
| `Characters/M_Character`, `Characters/<직업>/MI_*` | `Scripts/import_characters.py`(가져온 텍스처를 받는 머티리얼) |
| `Characters/<직업>/ABP_*`, `BS_*_Locomotion`, `Characters/DA_EntityVisuals` | 에디터 모듈의 `MmoCreateCharacterAssets` |
| `UI/WBP_*`, `UI/DA_Icons` | 에디터 모듈의 `MmoCreateWidgets` |
| `Effects/` 전부 | 에디터 모듈의 `MmoCreateEffectAssets`(아래 "이펙트와 소리") |

## 캐릭터

| 직업 | 원본 | 받는 곳 | 라이선스 | 가져오기 |
|---|---|---|---|---|
| 기사 | Quaternius "RPG Characters - Nov 2020"의 `Warrior`(메시, 애니메이션, `Warrior_Texture`, `Warrior_Sword_Texture`) | [OpenGameArt: LowPoly RPG Characters](https://opengameart.org/content/lowpoly-rpg-characters) (`rpg_characters_-_nov_2020.zip`, 12.9 MB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `client-unreal/Scripts/import_characters.py` |
| 마법사 | 같은 팩의 `Wizard`(메시, 애니메이션, `Wizard_Texture`, `Wizard_Staff_Texture`) | 같음 | CC0 1.0 | 같음 |

- 팩의 FBX 하나에 스켈레탈 메시, 스켈레톤, 애니메이션(대기·달리기·공격·죽음 등)이 함께 들어 있습니다. 지금은 `Idle_Weapon`과 `Run_Weapon`만 씁니다(대기·달리기 블렌드 스페이스).
- 기사·마법사 말고 같은 팩의 성직자(Cleric), 수도사(Monk), 궁수(Ranger), 도적(Rogue)은 세 번째 직업부터 쓸 수 있습니다.

## 맵의 것

| 종류(메시의 키) | 지금 | 진짜 메시 |
|---|---|---|
| 작은 집(`house_small`), 큰 집(`house_large`), 울타리(`fence`) | 엔진 기본 상자에 색을 입힌 자리 표시 | 없음 |
| 나무(`tree`), 테두리의 산(`mountain`), 풀(`grass`) | 엔진 기본 원뿔 | 없음 |
| 바위(`rock`), 큰 바위(`rock_large`), 꽃(`flower`) | 엔진 기본 구 | 없음 |

- 자리 표시는 에디터 모듈의 `MmoBuildMap`이 맵 액터마다 엔진 기본 도형(`/Engine/BasicShapes/`)을 차지하는 칸에 맞춰 키우고 종류의 색을 입힌 것입니다(2026-11-13, backlog 87에서 자리 표시로 먼저 하기로 정함).
- 진짜 메시는 `/Game/Environment/<메시의 키>`라는 이름의 스태틱 메시로 들이면 다음 `MmoBuildMap`부터 그것을 씁니다. 원본(FBX나 glTF)은 두 엔진이 함께 읽는 `mmo/art/`에 두고 캐릭터처럼 가져오는 스크립트를 둡니다. 후보는 캐릭터와 화풍이 같은 Quaternius의 CC0 팩(Ultimate Nature Pack: 나무·바위·풀·꽃, itch.io에서 받음, 약 21 MB. 집·울타리가 든 마을 팩)이고, 넣을 때 받는 곳과 라이선스를 이 표에 적습니다.

## 이펙트와 소리

연출 표(`/Game/Effects/DA_Cues`)의 줄이 가리키는 것입니다. 에디터 모듈의 `MmoCreateEffectAssets`가 표와 소리를 만들고, 그림과 소리 파일은 backlog 91이 바꿉니다(2026-11-14, backlog 27).

| 무엇 | 지금 | 출처 |
|---|---|---|
| 타격, 스킬이 맞음(`RadialBurst`), 스킬 동작과 부활(`DirectionalBurst`), 따라가는 발사체(`FountainLightweight`) | Niagara 플러그인의 템플릿 시스템(`/Niagara/DefaultAssets/Templates/Systems/`)을 소프트 참조로 가리킨 자리 표시 | 엔진에 든 것. 저장소에 복사하지 않고 패키지에만 쿠킹됩니다(엔진 기본 도형과 같음) |
| 효과음 `S_Hit`, `S_Skill`, `S_Revive`, `S_Footstep`, `S_UiClick`, `S_UiWindow`, `S_UiLevelUp`(31), `S_UiPickUp`(33) | 커맨드렛이 합성한 짧은 소리(잡음, 사인파의 미끄럼, 세 음) | 직접 만든 것(코드로 합성. 원본 파일 없음) |
| 배경음 `M_Town`, `M_Hunting`, `M_Gathering`, `M_Boss` | 커맨드렛이 합성한 8초 되풀이의 화음(구역의 종류마다) | 직접 만든 것 |
