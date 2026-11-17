# 그림 목록

MMORPG(`mmo/`)에 들어간 그림과 그 출처입니다. 원본 파일은 저장소에 두지 않고, 받는 곳과 가져오는 스크립트만 적습니다. 가져온 에셋(`client-unreal/Content/`)은 LFS로 커밋합니다. 엔진의 마네킹 등 Epic 콘텐츠는 공개 저장소에 올릴 수 없어 쓰지 않습니다.

## 필요한 것

게임에 들어갈 그림과 소리의 목록입니다(2026-11-14, backlog 73). 직접 만든 것이나 CC0만 넣습니다. 그림이 없는 것은 자리 표시로 두고 기능 항목은 자리 표시로 끝낼 수 있으며, 실제 것으로 바꾸는 것은 backlog 91입니다. "정하지 않음"은 91이 고르고 그때 받는 곳, 라이선스, 가져오는 스크립트를 이 문서의 표에 적습니다.

| 무엇 | 수 | 지금 | 넣을 것 |
|---|---|---|---|
| 캐릭터 메시 | 2(기사, 마법사) | 있음(아래 "캐릭터") | - |
| 몬스터 메시 | 9종과 필드 보스 1 | 있음(아래 "몬스터·소환수·NPC". 2026-11-17) | - |
| NPC 메시 | 5종(상점, 창고, 제작, 퀘스트, 경비병) | 있음(아래 "몬스터·소환수·NPC") | - |
| 채집물 메시 | 6종(나무·광석·약초 × 2단계) | 있음(아래 "맵의 것과 움직이지 않는 개체") | - |
| 무기 메시 | 2(검, 지팡이) | 캐릭터 메시에 붙어 있음 | 입은 무기를 바꿔 보이는 것은 34가 정함 |
| 바닥 아이템 메시 | 1 | 있음(가방) | - |
| 환경 메시 | 9종 | 있음(아래 "맵의 것과 움직이지 않는 개체") | - |
| 캐릭터 애니메이션 | 대기, 달리기, 공격, 피격, 죽음, 시전 | 있음(캐릭터 팩) | - |
| 채집·제작·귀환 동작 | 3 | 아직 없음(47, 48, 32) | 캐릭터 팩의 `PickUp`(채집)이 후보 |
| 몬스터 애니메이션 | 종마다 대기, 걷기, 공격, 피격, 죽음 | 있음(슬라임과 해골은 피격 동작이 없음) | - |
| 소환수 메시와 애니메이션(95) | 1(정령): 대기, 걷기, 공격, 피격, 죽음과 나타나고 사라지는 이펙트 | 메시와 동작은 있음(Ghost). 나타나고 사라지는 이펙트는 아래 "이펙트와 소리" | 이펙트는 정하지 않음 |
| 펫 메시와 애니메이션(96) | 2(고양이, 부엉이): 걷기, 줍기 | 있음(아래 "몬스터·소환수·NPC"). 줍기 동작은 없음 | - |
| 아이템 아이콘 | 장비 21종, 소모품 18(물약 4, 귀환·강화 주문서 2, 스킬북 10, 펫 2), 재료 15(채집 6, 몬스터 부산물 9) | 글자 아이콘(인벤토리의 칸, 퀵슬롯의 물약. 32) | 정하지 않음 |
| 스킬 아이콘 | 12(소환 95 포함) | 글자 아이콘(퀵슬롯) | 정하지 않음 |
| 효과 아이콘 | 4와 전투 상태, 선공 표시 | HUD의 글 한 줄 | 정하지 않음. 아이콘으로 보이는 것은 그 화면을 고치는 항목 |
| 메뉴와 버튼 아이콘 | 메뉴 5(가방, 캐릭터, 스킬, 퀘스트, 설정)와 터치 버튼 | 글을 쓴 버튼 | 정하지 않음 |
| 글꼴 | 한글과 영문이 함께 나오는 것 1 | 엔진 기본 글꼴(한글도 그려짐) | 정하지 않음. CC0 글꼴이 없으면 엔진 기본 글꼴로 둠 |
| 이펙트와 소리 | 아래 "이펙트와 소리"와 보스 등장 | 아래 표의 자리 표시(레벨 업은 31, 줍기는 33, 강화의 소리는 35가 더함). 보스 등장은 43이 연출 표에 줄을 더함 | 정하지 않음 |

- 개체의 자리 표시: 표현 표(`/Game/Characters/DA_EntityVisuals`)에 줄이 없는 템플릿은 개체 종류마다의 도형과 색(`Placeholders`)으로 그립니다. 플레이어 파란 원기둥, 몬스터 빨간 원기둥, NPC 초록 원기둥, 채집물 갈색 원뿔, 바닥 아이템 노란 상자, 소환수 보라색 구(95)이고, 재질은 `M_Placeholder`(색은 커스텀 프리미티브 데이터)입니다. 그림이 생기면 표에 줄을 더할 뿐 자리 표시는 그대로 둡니다.
- 아이콘 표: `/Game/UI/DA_Icons`(아이템, 스킬, 효과의 번호 → 그림의 소프트 참조)이고 지금은 줄이 없습니다. 줄이 없는 것은 이름의 첫 글자를 크게 쓴 글자 아이콘이라, 한 직업의 스킬은 두 언어 모두 첫 글자가 다르게 짓습니다(엔진 없는 테스트가 봄).

## 만든 에셋

`client-unreal/Content/`에서 바깥의 원본 없이 코드로 만든 것입니다. 모두 직접 만든 것이고 손으로 고치지 않으며, 만드는 것을 고쳐 다시 만듭니다.

| 에셋 | 만드는 것 |
|---|---|
| `Maps/Field`, `Materials/M_Ground`, `M_Sky`, `M_Placeholder` | `Scripts/create_content.py`(땅, 해, 하늘, 안개, 머티리얼)와 에디터 모듈의 `MmoBuildMap`(맵에 놓인 것의 자리 표시) |
| `Characters/M_Character`, `Characters/M_EntityColor`, `Materials/M_EntityProp` | `Scripts/create_entity_materials.py`(가져온 텍스처나 원본의 색을 받는 머티리얼) |
| `Environment/`, `Props/` 전부 | `Scripts/import_props.py`(`mmo/art/`의 원본에서) |
| `Characters/<직업>/MI_*` | `Scripts/import_characters.py` |
| `Creatures/<이름>/` 전부(메시, 스켈레톤, 애니메이션, 머티리얼 인스턴스) | `Scripts/import_creatures.py`(아래 "몬스터·소환수·NPC"의 원본에서) |
| `Characters/<직업>/ABP_*`, `BS_*_Locomotion`, `Creatures/<이름>/ABP_*`, `BS_*_Locomotion`, `Characters/DA_EntityVisuals` | 에디터 모듈의 `MmoCreateCharacterAssets` |
| `UI/WBP_*`, `UI/DA_Icons` | 에디터 모듈의 `MmoCreateWidgets` |
| `Effects/` 전부 | 에디터 모듈의 `MmoCreateEffectAssets`(아래 "이펙트와 소리") |

## 캐릭터

| 직업 | 원본 | 받는 곳 | 라이선스 | 가져오기 |
|---|---|---|---|---|
| 기사 | Quaternius "RPG Characters - Nov 2020"의 `Warrior`(메시, 애니메이션, `Warrior_Texture`, `Warrior_Sword_Texture`) | [OpenGameArt: LowPoly RPG Characters](https://opengameart.org/content/lowpoly-rpg-characters) (`rpg_characters_-_nov_2020.zip`, 12.9 MB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `client-unreal/Scripts/import_characters.py` |
| 마법사 | 같은 팩의 `Wizard`(메시, 애니메이션, `Wizard_Texture`, `Wizard_Staff_Texture`) | 같음 | CC0 1.0 | 같음 |

- 팩의 FBX 하나에 스켈레탈 메시, 스켈레톤, 애니메이션(대기·달리기·공격·죽음 등)이 함께 들어 있습니다. 지금은 `Idle_Weapon`과 `Run_Weapon`만 씁니다(대기·달리기 블렌드 스페이스).
- 기사·마법사 말고 같은 팩의 성직자(Cleric), 수도사(Monk), 궁수(Ranger), 도적(Rogue)은 세 번째 직업부터 쓸 수 있습니다.

## 몬스터·소환수·NPC

2026-11-17(backlog 91의 첫 단계). 모두 Quaternius의 CC0 팩이고, 원본은 저장소 밖 `MMO_ART_SOURCE`(기본 `~/.cache/mmo-art-sources`)의 폴더에 두고 `Scripts/import_creatures.py`가 가져옵니다. 캐릭터와 같은 화풍의 몬스터가 모자라 CC0로 없는 것은 비슷한 모델로 대신했습니다(사용자가 정함). 크기는 표현 표의 줄마다 원하는 키로 맞춥니다.

| 무엇(데이터 id) | 원본 모델(팩) | 대체와 고침 |
|---|---|---|
| 슬라임(몬스터 1) | `Slime`(Animated Monster Pack) | 애니메이션에서 루트 트랙을 지움(바인드 포즈와 크기가 달라 보이지 않았음). 피격 동작 없음 |
| 버섯(2) | `Mushnub`(Ultimate Monsters) | Cute Monsters의 `Mushroom`은 대기 동작뿐이라 바꿈 |
| 멧돼지(3) | `Bull`(Ultimate Animated Animals) | 멧돼지가 CC0로 없어 소에 갈색 색조 |
| 고블린(4), 고블린 궁수(6) | `Goblin_Male`, `Goblin_Female`(Ultimate Animated Character Pack) | 궁수의 공격은 `Shoot_OneHanded` |
| 늑대(5) | `Wolf`(Ultimate Animated Animals) | Animal Pack Vol.2의 늑대는 공격·죽음이 없어 바꿈 |
| 오크(7) | `Orc`(Ultimate Monsters의 Big) | - |
| 해골(8) | `Skeleton`(Animated Monster Pack) | 피격 동작 없음 |
| 트롤(9) | `Cyclops`(Cute Animated Monsters) | 트롤이 없어 외눈 거인 |
| 돌거인(10, 필드 보스) | `Yeti`(Cute Animated Monsters) | 골렘이 없어 예티에 회색 색조, 키 4.5 m |
| 정령(12, 소환수) | `Ghost`(Cute Animated Monsters) | - |
| 고양이, 부엉이(펫 1, 2) | `Cat`, `Birb`(Ultimate Monsters의 Blob) | 부엉이가 CC0로 없어 둥근 새 |
| 상인, 창고지기, 제작, 퀘스트, 경비병(NPC 1, 2, 7, 8, 3–6) | `OldClassy_Male`, `Worker_Male`, `Viking_Male`, `Wizard`, `Knight_Male`(Ultimate Animated Character Pack) | 캐릭터와 화풍이 같은 CC0 마을 사람이 없어 이 팩(평면 색)으로 정함 |

| 팩(`MMO_ART_SOURCE` 안의 폴더) | 받는 곳 | 라이선스 |
|---|---|---|
| Animated Monster Pack(`monster-pack/`) | [OpenGameArt: LowPoly Animated Monsters](https://opengameart.org/content/lowpoly-animated-monsters) (`Animated Monster Pack by @Quaternius.zip`, 1.3 MB) | CC0 1.0(팩의 License.txt) |
| Cute Animated Monsters(`cute-monsters/`) | [OpenGameArt: Textured Cute Monster Pack](https://opengameart.org/content/textured-cute-monster-pack) (`cute_animated_monsters_-_aug_2020.zip`, 9.7 MB) | CC0 1.0(페이지) |
| Ultimate Animated Character Pack(`character-pack/`) | [OpenGameArt: Animated Characters Pack](https://opengameart.org/content/animated-characters-pack) (`ultimate_animated_character_pack_by_quaternius.zip`, 46.2 MB) | CC0 1.0(페이지) |
| Ultimate Monsters(`ultimate-monsters/`) | [quaternius.com: Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html)의 Google Drive에서 낱개로: `Mushnub.fbx`, `Orc.fbx`(Big), `Cat.fbx`, `Birb.fbx`, `Atlas_Monsters.png`, `License.txt` | CC0 1.0(License.txt) |
| Ultimate Animated Animals(`ultimate-animals/`) | [quaternius.com: Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html)의 Google Drive에서 낱개로: `Wolf.fbx`, `Bull.fbx`, `License.txt` | CC0 1.0(License.txt) |

- OpenGameArt의 zip은 받은 대로 각 폴더에 풀고(그 안의 `FBX/`, `Textures/`를 씀), Drive의 낱개 파일은 폴더 바로 아래에 둡니다.
- 함께 받았지만 쓰지 않은 것: Animal Pack Vol.2(OpenGameArt `Animal Pack Vol.2 by @Quaternius.zip`, 2.0 MB, CC0. 고양이·독수리·늑대가 대기와 걷기뿐).
- 버린 후보: Quaternius의 Bestiary·Fantasy Races는 CC0가 아니라 자체 라이선스(QAL)이고, OpenGameArt의 "496 pixel art icons"는 CC0로 적혀 있지만 CC-BY 3.0인 그림이 섞여 있습니다(91의 조사, 2026-11-17).

## 맵의 것과 움직이지 않는 개체

2026-11-17(backlog 91의 셋째 단계). 원본 FBX는 두 엔진이 함께 읽도록 저장소의 `mmo/art/`에 메시의 키 이름으로 둡니다(LFS). `Scripts/import_props.py`가 종류마다 키나 너비를 맞추고 원점을 바닥의 가운데로 옮겨, 맵의 것은 `/Game/Environment/<메시의 키>`(원본의 불투명한 머티리얼), 채집물과 바닥 아이템은 `/Game/Props/<이름>`(`M_EntityProp`의 인스턴스. 서서히 나타나고 사라짐)으로 가져옵니다. 그 뒤 `MmoBuildMap`이 맵 액터에 진짜 메시를 입히고 `MmoCreateCharacterAssets`가 표현 표에 채집물과 바닥 아이템의 줄을 둡니다.

| 원본(`mmo/art/`) | 무엇 | 원본 모델(팩) | 크기 |
|---|---|---|---|
| `environment/house_small.fbx` | 작은 집 | `House_1`(Medieval Village Pack) | 너비 6 m |
| `environment/house_large.fbx` | 큰 집 | `Inn`(Medieval Village Pack) | 너비 10 m(90° 돌림) |
| `environment/fence.fbx` | 울타리 | `Fence`(Medieval Village Pack) | 너비 4 m(90° 돌림) |
| `environment/tree.fbx` | 나무 | `CommonTree_1`(Ultimate Nature Pack) | 키 6 m |
| `environment/mountain.fbx` | 테두리의 산 | `Rock_Moss_7`(Ultimate Nature Pack) | 너비 10 m. 산 모델이 없어 큰 바위 |
| `environment/grass.fbx`, `flower.fbx` | 풀, 꽃 | `Grass`, `Flowers`(Ultimate Nature Pack) | 키 0.6 m |
| `environment/rock.fbx`, `rock_large.fbx` | 바위, 큰 바위 | `Rock_1`, `Rock_Moss_3`(Ultimate Nature Pack) | 키 1.4 m, 너비 4 m |
| `entities/gather_pine.fbx`, `gather_oak.fbx` | 채집물 소나무, 참나무 | `PineTree_1`, `CommonTree_3`(Ultimate Nature Pack) | 키 6, 5.5 m |
| `entities/gather_copper.fbx`, `gather_iron.fbx` | 채집물 구리, 철 광석 | `Rock_2`, `Rock_5`(Ultimate Nature Pack) | 너비 1.6 m. 광석 모델이 없어 바위에 구리색·회색 색조 |
| `entities/gather_mugwort.fbx`, `gather_ginseng.fbx` | 채집물 쑥, 인삼 | `Plant_2`, `BushBerries_1`(Ultimate Nature Pack) | 키 0.8 m, 너비 0.9 m. 약초 모델이 없어 풀과 열매 덤불 |
| `entities/ground_item.fbx` | 바닥 아이템(모두 같음) | `Bag`(Medieval Village Pack) | 너비 0.6 m |

| 팩 | 받는 곳 | 라이선스 |
|---|---|---|
| Ultimate Nature Pack | [OpenGameArt: Low Poly Nature Pack](https://opengameart.org/content/low-poly-nature-pack-1) (`ultimate_nature_pack_by_quaternius_1.zip`, 21.9 MB) | CC0 1.0(팩의 License.txt) |
| Medieval Village Pack | [OpenGameArt: LowPoly Medieval Village Pack](https://opengameart.org/content/lowpoly-medieval-village-pack) (`medieval_village_pack_-_dec_2020.zip`, 8.0 MB) | CC0 1.0(팩의 License.txt) |

- 진짜 메시가 없는 종류는 `MmoBuildMap`이 맵 액터마다 엔진 기본 도형(`/Engine/BasicShapes/`)을 차지하는 칸에 맞춰 키우고 종류의 색을 입힙니다(2026-11-13, backlog 87). 지금은 아홉 종류 모두 진짜 메시입니다.

## 이펙트와 소리

연출 표(`/Game/Effects/DA_Cues`)의 줄이 가리키는 것입니다. 에디터 모듈의 `MmoCreateEffectAssets`가 표와 소리를 만들고, 그림과 소리 파일은 backlog 91이 바꿉니다(2026-11-14, backlog 27).

| 무엇 | 지금 | 출처 |
|---|---|---|
| 타격, 스킬이 맞음(`RadialBurst`), 스킬 동작과 부활(`DirectionalBurst`), 따라가는 발사체(`FountainLightweight`) | Niagara 플러그인의 템플릿 시스템(`/Niagara/DefaultAssets/Templates/Systems/`)을 소프트 참조로 가리킨 자리 표시 | 엔진에 든 것. 저장소에 복사하지 않고 패키지에만 쿠킹됩니다(엔진 기본 도형과 같음) |
| 효과음 `S_Hit`, `S_Skill`, `S_Revive`, `S_Footstep`, `S_UiClick`, `S_UiWindow`, `S_UiLevelUp`(31), `S_UiPickUp`(33), `S_UiEnchantSuccess`·`S_UiEnchantFailure`(35) | 커맨드렛이 합성한 짧은 소리(잡음, 사인파의 미끄럼, 세 음) | 직접 만든 것(코드로 합성. 원본 파일 없음) |
| 배경음 `M_Town`, `M_Hunting`, `M_Gathering`, `M_Boss` | 커맨드렛이 합성한 8초 되풀이의 화음(구역의 종류마다) | 직접 만든 것 |
