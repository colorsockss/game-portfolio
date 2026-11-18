# 그림 목록

MMORPG(`mmo/`)에 들어간 그림과 그 출처입니다. 받은 팩의 원본은 저장소에 두지 않고 받는 곳과 가져오는 스크립트만 적으며, 두 엔진이 함께 읽을 원본(맵의 것과 움직이지 않는 개체의 FBX, 캐릭터의 FBX와 텍스처, 아이콘, 이펙트 그림, 소리, UI 그림)은 `mmo/art/`에 둡니다(LFS). 가져온 에셋(`client-unreal/Content/`)은 LFS로 커밋합니다. 엔진의 마네킹 등 Epic 콘텐츠는 공개 저장소에 올릴 수 없어 쓰지 않습니다.

## 필요한 것

게임에 들어갈 그림과 소리의 목록입니다(2026-11-14, backlog 73). 직접 만든 것, CC0, 생성 도구로 만든 것(99부터. 도구와 약관은 아래 "UI 그림")만 넣습니다. 그림이 없는 것은 자리 표시로 두고 기능 항목은 자리 표시로 끝낼 수 있으며, 실제 것으로 바꾸는 것은 backlog 91입니다. "정하지 않음"은 91이 고르고 그때 받는 곳, 라이선스, 가져오는 스크립트를 이 문서의 표에 적습니다.

| 무엇 | 수 | 지금 | 넣을 것 |
|---|---|---|---|
| 캐릭터 메시 | 2(기사, 마법사) | 있음(아래 "캐릭터". 기사는 Tripo로 만든 것, 107) | 마법사도 Tripo로(107의 흐름) |
| 몬스터 메시 | 9종과 필드 보스 1 | 있음(아래 "몬스터·소환수·NPC". 2026-11-17) | - |
| NPC 메시 | 5종(상점, 창고, 제작, 퀘스트, 경비병) | 있음(아래 "몬스터·소환수·NPC") | - |
| 채집물 메시 | 6종(나무·광석·약초 × 2단계) | 있음(아래 "맵의 것과 움직이지 않는 개체") | - |
| 무기 메시 | 2(검, 지팡이) | System G6의 검과 지팡이를 캐릭터의 오른손 뼈에 구움(98. 무기를 들면 보이고 들지 않으면 감춤. 원본 텍스처가 없어 단색. 107의 기사도 G6의 검을 새 무기 뼈에 구움) | 종마다 다른 메시는 넣지 않음: Medieval Weapons Pack(받아 둠)에 검은 있지만 지팡이가 없음 |
| 바닥 아이템 메시 | 1 | 있음(가방) | - |
| 환경 메시 | 9종과 마을 소품 12종(102) | 있음(아래 "맵의 것과 움직이지 않는 개체". 102에서 같은 종류의 변형과 흩는 풀·덤불을 더함) | - |
| 땅 텍스처 | 5(풀, 숲 바닥, 흙, 돌길, 그을린 땅)와 노멀 2, 노이즈 1 | 있음(아래 "땅 텍스처". Codex image_gen, 103) | - |
| 캐릭터 애니메이션 | 대기, 달리기, 공격, 피격, 죽음, 시전 | 기사는 Universal Animation Library 1·2(107. 피격 있음), 마법사는 System G6(피격 동작은 팩에 없음) | - |
| 채집·제작·귀환 동작 | 3 | 채집과 제작은 기사가 UAL의 `Farm_Harvest`(107), 마법사가 System G6의 `gathering`(98). 귀환은 없음 | - |
| 몬스터 애니메이션 | 종마다 대기, 걷기, 공격, 피격, 죽음 | 있음(슬라임과 해골은 피격 동작이 없음) | - |
| 소환수 메시와 애니메이션(95) | 1(정령): 대기, 걷기, 공격, 피격, 죽음과 나타나고 사라지는 이펙트 | 메시와 동작은 있음(Ghost). 나타나고 사라지는 이펙트는 아래 "이펙트와 소리" | 이펙트는 정하지 않음 |
| 펫 메시와 애니메이션(96) | 2(고양이, 부엉이): 걷기, 줍기 | 있음(아래 "몬스터·소환수·NPC"). 줍기 동작은 없음 | - |
| 아이템 아이콘 | 장비 21종, 소모품 18(물약 4, 귀환·강화 주문서 2, 스킬북 10, 펫 2), 재료 15(채집 6, 몬스터 부산물 9) | 있음(아래 "아이콘". Codex image_gen, 100. 스킬북은 직업마다 한 그림) | - |
| 스킬 아이콘 | 12(소환 95 포함) | 있음(아래 "아이콘". 100) | - |
| 효과 아이콘 | 4와 전투 상태, 선공 표시 | 효과 4는 있음(HUD의 아이콘 칸. 100). 전투 상태와 선공 표시는 HUD의 글 한 줄 | - |
| UI 그림(바의 광택 채움, 조이스틱) | 3 | 있음(아래 "UI 그림". Codex image_gen, 99). 창 판·버튼·바의 바탕·칸은 101에서 그림 대신 선으로 그림 | - |
| 메뉴와 버튼 아이콘 | 메뉴 5(가방, 캐릭터, 스킬, 퀘스트, 설정)와 터치 버튼 | 메뉴 5는 있음(100). 터치 버튼은 글을 쓴 버튼 | 터치 버튼은 정하지 않음 |
| 글꼴 | 한글과 영문이 함께 나오는 것 1 | 엔진 기본 글꼴(한글도 그려짐) | 정하지 않음. CC0 글꼴이 없으면 엔진 기본 글꼴로 둠 |
| 이펙트와 소리 | 아래 "이펙트와 소리"와 보스 등장(소리는 있음, 이펙트는 자리 표시) | 아래 표의 자리 표시(레벨 업은 31, 줍기는 33, 강화의 소리는 35가 더함). 보스 등장은 43이 연출 표에 줄을 더함 | 정하지 않음 |

- 개체의 자리 표시: 표현 표(`/Game/Characters/DA_EntityVisuals`)에 줄이 없는 템플릿은 개체 종류마다의 도형과 색(`Placeholders`)으로 그립니다. 플레이어 파란 원기둥, 몬스터 빨간 원기둥, NPC 초록 원기둥, 채집물 갈색 원뿔, 바닥 아이템 노란 상자, 소환수 보라색 구(95)이고, 재질은 `M_Placeholder`(색은 커스텀 프리미티브 데이터)입니다. 그림이 생기면 표에 줄을 더할 뿐 자리 표시는 그대로 둡니다.
- 아이콘 표: `/Game/UI/DA_Icons`(아이템, 스킬, 효과의 번호 → 그림의 소프트 참조. 아래 "아이콘")입니다. 줄이 없는 것은 이름의 첫 글자를 크게 쓴 글자 아이콘이라, 한 직업의 스킬은 두 언어 모두 첫 글자가 다르게 짓습니다(엔진 없는 테스트가 봄).

## 만든 에셋

`client-unreal/Content/`에서 바깥의 원본 없이 코드로 만든 것입니다. 모두 직접 만든 것이고 손으로 고치지 않으며, 만드는 것을 고쳐 다시 만듭니다.

| 에셋 | 만드는 것 |
|---|---|
| `Maps/Field`, `Materials/M_Ground`, `M_Foliage`, `M_Sky`, `M_Placeholder`, `Environment/Ground/`(`mmo/art/ground/`에서) | `Scripts/create_content.py`(땅, 해, 하늘, 안개, 포스트 프로세스, 머티리얼, 땅 텍스처) |
| `Environment/T_GroundMask`, `Environment/MI_Ground`, `Field`의 맵 액터와 `Foliage` | 에디터 모듈의 `MmoBuildMap`(맵에 놓인 것, 변형, 땅의 마스크, 흩은 풀. 102) |
| `Characters/M_Character`, `Characters/M_EntityColor`, `Materials/M_EntityProp` | `Scripts/create_entity_materials.py`(가져온 텍스처나 원본의 색을 받는 머티리얼) |
| `Environment/`, `Props/` 전부 | `Scripts/import_props.py`(`mmo/art/`의 원본에서) |
| `Characters/<직업>/MI_*` | `Scripts/import_characters.py` |
| `Creatures/<이름>/` 전부(메시, 스켈레톤, 애니메이션, 머티리얼 인스턴스) | `Scripts/import_creatures.py`(아래 "몬스터·소환수·NPC"의 원본에서) |
| `Characters/<직업>/ABP_*`, `BS_*_Locomotion`, `Creatures/<이름>/ABP_*`, `BS_*_Locomotion`, `Characters/DA_EntityVisuals` | 에디터 모듈의 `MmoCreateCharacterAssets` |
| `UI/WBP_*`, `UI/DA_Icons`, `UI/Art/`(`mmo/art/ui/`에서) | 에디터 모듈의 `MmoCreateWidgets` |
| `Effects/` 전부 | 에디터 모듈의 `MmoCreateEffectAssets`(아래 "이펙트와 소리") |

## 캐릭터

### 기사(107)

2026-11-18(backlog 107). 화풍을 맞추려고 기사를 Tripo로 다시 만들었습니다. Codex image_gen으로 어라운드 시트(앞, 왼쪽, 뒤, 오른쪽)를 그려 네 장으로 자르고, Tripo의 Image to 3D(multi-view, Smart Mesh, PBR 텍스처)와 자동 리깅(Skeleton Preset `UE5 Mannequin`, 뼈 80개)으로 만들었습니다. 프롬프트와 차례는 `mmo/art/models/prompts.md`, 시트와 네 장은 `mmo/art/models/source/`, Tripo에서 받은 FBX와 텍스처(색·노멀 1024, ORM 4096)는 `mmo/art/models/knight/`입니다. 동작은 Quaternius의 Universal Animation Library 1·2 무료판에서 옮기고, `client-unreal/Scripts/export_tripo_characters.py`(Blender)가 `mmo/art/characters/knight.fbx`와 텍스처(`knight_basecolor`, `knight_normal`, `knight_orm`)로 냅니다.

| 무엇 | 원본 | 받는 곳 | 라이선스 |
|---|---|---|---|
| 메시, 뼈대, 텍스처 | Tripo(삼각형 5,451) | 사용자가 Tripo에서 만듦 | 유료 플랜으로 만든 출력은 사용자의 것입니다([Tripo 도움말](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially), 약관 5.2.2. 무료 플랜의 출력은 Tripo의 것이라 넣지 않음) |
| 어라운드 시트 | Codex image_gen | 아래 "UI 그림"과 같음 | 아래 "UI 그림"과 같음 |
| 동작 `Sword_Idle`(대기), `Jog_Fwd_Loop`(달리기), `Hit_Chest`(피격), `Death01`(죽음) | Universal Animation Library(Standard, `UAL1_Standard.fbx`의 제자리 판) | [itch.io: Universal Animation Library](https://quaternius.itch.io/universal-animation-library) (`Universal Animation Library[Standard].zip`, 15.9 MB) | CC0 1.0(팩의 License.txt) |
| 동작 `Sword_Regular_A`·`_A_Rec`(공격), `Sword_Regular_C`(스킬), `Farm_Harvest`(채집) | Universal Animation Library 2(Standard, `UAL2_Standard.fbx`의 제자리 판) | [itch.io: Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) (`Universal Animation Library 2[Standard].zip`, 18.7 MB) | CC0 1.0(팩의 License.txt) |
| 검 | System G6의 `main_hand_sword_old`(아래 표) | 아래 표 | CC0 1.0 |

- UAL의 zip은 `MMO_ART_SOURCE`의 `ual1/`, `ual2/`에 받은 대로 풉니다. 두 팩에 함께 받았지만 쓰지 않은 동작이 많습니다(마법사, NPC, 고블린·오크, 해골에 쓸 것은 `prompts.md`의 "동작").
- 무기는 아직 Tripo로 만들지 않아 G6의 검을 씁니다(단색 회색).

### 마법사(98)

2026-11-17(backlog 98). 사람 체형(약 7.4등신, 2천~3천 삼각형)의 System G6 팩입니다. Quaternius의 Modular Character Outfits는 판금 기사와 마법사 의상이 유료판에만 있어 쓰지 않았습니다(사용자가 Quaternius 밖에서 찾기로 정함). 원본은 Blender 2.79의 .blend라 Blender 5.3.0(`blender-5.3.0-macos-arm64.dmg`, 360 MB, download.blender.org, GPL. 배포처의 SHA-256을 확인하고 `~/.cache/blender/`에 둠)으로 열어 `client-unreal/Scripts/export_characters.py`가 `mmo/art/characters/`의 FBX와 텍스처로 냅니다(저장소에 둠). 원본 압축 파일은 `MMO_ART_SOURCE`의 `system-g6/`에 풉니다.

| 직업 | 원본(System G6의 `human_male.blend`) | 받는 곳 | 라이선스 | 가져오기 |
|---|---|---|---|---|
| 마법사 | 조각 `head_default`, `hair_2`, `light_armor`, `light_boots`, `light_gloves`, `light_helmet`(챙 넓은 모자)과 무기 `staff_old`. 동작 `idle_combat_two_handed_staff`(대기), `run`, `cast_two_handed_staff`(공격), `cast_unarmed_magic`(스킬), `channel_two_handed_staff`(시전), `gathering`, `death` | [OpenGameArt: Modular RPG Characters](https://opengameart.org/content/modular-rpg-characters) (`modular_rpg_characters.7z`, 16.6 MB. 무기는 `modular_rpg_characters_ik_rig_for_animating.7z`, 1.2 MB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `client-unreal/Scripts/export_characters.py` → `import_characters.py` |
| 기사의 검(107) | IK 리그 파일의 `main_hand_sword_old` | 같음 | CC0 1.0 | `export_tripo_characters.py` |

- 갑옷 조각은 뼈의 버텍스 그룹만 있고 아마추어에 붙어 있지 않아 내보낼 때 붙입니다. 무기는 IK 리그 파일에서 손의 뼈(`wep_pos_R`)에 붙은 자리 그대로 가져와 그 뼈에 다 묶습니다(구운 무기). 무기의 텍스처는 작가의 다른 폴더를 가리켜 팩에 없어 단색(검 회색, 지팡이 갈색)입니다.
- 동작은 24 fps의 10–20프레임이고 피격 동작이 없습니다. 같은 팩의 여자 캐릭터(`human_female.blend`), 레인저(`medium_*`), 상인·대장장이·여관 주인 옷(`light_armor_2–4`), 활·석궁·방패·완드 동작은 아직 쓰지 않습니다.
- 앞의 캐릭터(2등신, Quaternius "RPG Characters - Nov 2020"의 `Warrior`와 `Wizard`)는 98에서 지웠습니다. 98의 기사(조각 `heavy_*`와 그 텍스처 넷)는 107에서 지웠습니다.

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

2026-11-17(backlog 91의 셋째 단계). 원본 FBX는 두 엔진이 함께 읽도록 저장소의 `mmo/art/`에 메시의 키 이름으로 둡니다(LFS). `Scripts/import_props.py`가 종류마다 키나 너비를 맞추고 원점을 바닥의 가운데로 옮겨, 맵의 것은 `/Game/Environment/<메시의 키>`(원본의 불투명한 머티리얼. 카메라를 막는 건물과 테두리의 산은 내 캐릭터를 가리면 반투명해지도록 `M_EntityProp`의 인스턴스. 97), 채집물과 바닥 아이템은 `/Game/Props/<이름>`(`M_EntityProp`의 인스턴스. 서서히 나타나고 사라짐)으로 가져옵니다. 그 뒤 `MmoBuildMap`이 맵 액터에 진짜 메시를 입히고 `MmoCreateCharacterAssets`가 표현 표에 채집물과 바닥 아이템의 줄을 둡니다.

| 원본(`mmo/art/`) | 무엇 | 원본 모델(팩) | 크기 |
|---|---|---|---|
| `environment/house_small.fbx` | 작은 집 | `House_1`(Medieval Village Pack) | 너비 6 m |
| `environment/house_large.fbx` | 큰 집 | `Inn`(Medieval Village Pack) | 너비 10 m(90° 돌림) |
| `environment/fence.fbx` | 울타리 | `Fence`(Medieval Village Pack) | 너비 4 m(90° 돌림) |
| `environment/tree.fbx` | 나무 | `CommonTree_1`(Ultimate Nature Pack) | 키 6 m |
| `environment/mountain.fbx` | 테두리의 산 | `Rock_Moss_7`(Ultimate Nature Pack) | 너비 10 m. 산 모델이 없어 큰 바위 |
| `environment/grass.fbx`, `flower.fbx` | 풀, 꽃 | `Grass`, `Flowers`(Ultimate Nature Pack) | 키 0.6 m |
| `environment/rock.fbx`, `rock_large.fbx` | 바위, 큰 바위 | `Rock_1`, `Rock_Moss_3`(Ultimate Nature Pack) | 키 1.4 m, 너비 4 m |
| `environment/tree_2.fbx`–`tree_5.fbx`, `tree_pine_1`–`3`, `tree_birch_1`–`2`, `tree_dead_1`–`3` | 나무의 변형(102. 죽은 나무는 보스 자리) | `CommonTree_2`–`5`, `PineTree_1`–`3`, `BirchTree_1`–`2`, `CommonTree_Dead_1`–`2`, `Willow_Dead_1`(Ultimate Nature Pack) | 키 5–7.5 m |
| `environment/rock_2`–`5`, `rock_large_2`–`4`, `mountain_2`–`3`, `grass_2`–`3`, `flower_2` | 바위·큰 바위·산·풀·꽃의 변형(102) | `Rock_2`, `Rock_3`, `Rock_5`, `Rock_6`, `Rock_Moss_2`, `Rock_7`, `Rock_4`, `Rock_Moss_4`, `Rock_Moss_6`, `Grass_2`, `Grass_Short`, `Plant_5`(Ultimate Nature Pack) | 종류와 같음 |
| `environment/well`, `market_stand`, `market_stall`, `barrel`, `crate`, `cart`, `bench`, `hay`, `bags`, `cauldron`, `bonfire`, `bell_tower` | 마을 소품(102. 막는 맵의 것, 종탑은 카메라도 막음) | `Well`, `MarketStand_1`, `MarketStand_2`, `Barrel`, `Crate`, `Cart`, `Bench_1`, `Hay`, `Bags`, `Cauldron`, `Bonfire_Lit`, `Bell_Tower`(Medieval Village Pack) | 발자국에 맞춤(종탑 너비 3 m) |
| `environment/foliage/bush_1`, `bush_2`, `berries`, `plant_1`, `plant_3`, `plant_4`, `stump`, `log`, `pebble`, `twig`, `wheat` | 흩는 풀과 덤불(102. 충돌 없는 인스턴스 메시. 풀과 꽃은 맵의 것의 메시를 같이 씀) | `Bush_1`, `Bush_2`, `BushBerries_1`, `Plant_1`, `Plant_3`, `Plant_4`, `TreeStump_Moss`, `WoodLog_Moss`, `Rock_Moss_2`, `Plant_2`, `Wheat`(Ultimate Nature Pack) | 키 0.5–1.2 m, 통나무 2.4 m |
| `entities/gather_pine.fbx`, `gather_oak.fbx` | 채집물 소나무, 참나무 | `PineTree_1`, `CommonTree_3`(Ultimate Nature Pack) | 키 6, 5.5 m |
| `entities/gather_copper.fbx`, `gather_iron.fbx` | 채집물 구리, 철 광석 | `Rock_2`, `Rock_5`(Ultimate Nature Pack) | 너비 1.6 m. 광석 모델이 없어 바위에 구리색·회색 색조 |
| `entities/gather_mugwort.fbx`, `gather_ginseng.fbx` | 채집물 쑥, 인삼 | `Plant_2`, `BushBerries_1`(Ultimate Nature Pack) | 키 0.8 m, 너비 0.9 m. 약초 모델이 없어 풀과 열매 덤불 |
| `entities/ground_item.fbx` | 바닥 아이템(모두 같음) | `Bag`(Medieval Village Pack) | 너비 0.6 m |

| 팩 | 받는 곳 | 라이선스 |
|---|---|---|
| Ultimate Nature Pack | [OpenGameArt: Low Poly Nature Pack](https://opengameart.org/content/low-poly-nature-pack-1) (`ultimate_nature_pack_by_quaternius_1.zip`, 21.9 MB) | CC0 1.0(팩의 License.txt) |
| Medieval Village Pack | [OpenGameArt: LowPoly Medieval Village Pack](https://opengameart.org/content/lowpoly-medieval-village-pack) (`medieval_village_pack_-_dec_2020.zip`, 8.0 MB) | CC0 1.0(팩의 License.txt) |

- 진짜 메시가 없는 종류는 `MmoBuildMap`이 맵 액터마다 엔진 기본 도형(`/Engine/BasicShapes/`)을 차지하는 칸에 맞춰 키우고 종류의 색을 입힙니다(2026-11-13, backlog 87). 지금은 스물한 종류 모두 진짜 메시입니다.
- 102(2026-11-18)의 모델은 91에 받아 둔 두 팩(`~/.cache/mmo-art-sources/nature`, `village`)에서 골랐고 새로 받은 것은 없습니다. 고를 때 Blender로 후보 60개의 썸네일을 그려 봤고, 팩의 `Bell_Tower`만 `Buildings/`에 있습니다.

땅의 높낮이(106)의 메시(`/Game/Environment/Terrain/SM_Terrain_*`)는 `MmoBuildMap`이 맵 데이터에서 코드로 만들고 `MI_Ground`를 입혀 새 그림이 없습니다.

## 땅 텍스처

2026-11-18(backlog 103). 땅 머티리얼이 섞는 타일 텍스처 다섯을 아이콘(100)과 같은 방법으로 생성했습니다. 프롬프트는 `mmo/art/ground/source/prompts.md`, 뽑은 원본(1254 px)은 `source/`, 최종본은 `mmo/art/ground/`입니다.

| 파일 | 무엇 | 크기 | 만든 이 | 도구 |
|---|---|---|---|---|
| `grass.png`, `forest.png`, `dirt.png`, `cobble.png`, `scorched.png` | 풀밭, 숲 바닥, 흙길, 돌길, 그을린 땅(보스 자리) | 512×512 | colorsocks | Codex image_gen(codex-cli 0.159.3, 기본 `image_gen`) |
| `cobble_n.png`, `scorched_n.png` | 돌길과 그을린 땅의 노멀 맵(밝기를 높이로 봄) | 512×512 | colorsocks | `source/process.py`(Pillow) |
| `noise.png` | 큰 얼룩, 구름 그림자, 마스크 가장자리의 노이즈(R·G·B가 다른 씨앗) | 256×256 | colorsocks | `source/process.py`(Pillow) |

- 생성기가 이음매 없는 타일을 지키지 못해 `process.py`가 반 칸 민 그림을 가장자리 쪽에 섞어 네 변을 잇고 512로 줄입니다. 흙의 바퀴 자국은 줄무늬로 되풀이가 보여 머티리얼이 돌린 두 크기를 섞고, 돌길은 돌이 작아 12 m에 한 번 되풀이합니다.
- 약관과 소유는 위 "UI 그림"과 같습니다.

## 아이콘

2026-11-17(backlog 100). 아이템 47(장비 종 21, 소모품 11, 재료 15), 스킬 12, 효과 4, 메뉴 5의 68장을 UI 그림(99)과 같은 어두운 판타지 MMO풍으로 생성했습니다(사용자가 Codex image_gen으로 정함). 91의 Quaternius 아이콘(28장)과 글자 아이콘을 바꿨습니다. 프롬프트(`mmo/art/icons/source/prompts.md`)의 "시험" 묶음 5장(기사의 검, 체력 물약, 베기, 기절, 가방)을 먼저 뽑아 화풍을 정하고, 나머지 네 묶음(장비, 소모품과 재료, 스킬, 효과와 메뉴)은 그 5장을 화풍의 기준으로 붙여(`codex exec -i`) 함께 뽑았습니다. 실제로 쓴 명세는 `source/prompts-used-<묶음>.md`입니다. 원본(1254 px)은 `mmo/art/icons/source/`, 최종본은 `mmo/art/icons/<파일>`(256×256. `source/process.py`가 투명한 것은 여백을 잘라 가운데에 두고, 스킬은 정사각형으로 줄임)이고, 위젯 생성기가 `/Game/UI/Icons/`로 가져와(압축 없음, 밉맵 없음) 아이콘 표에 줄을 둡니다(MANUAL의 명령 표).

| 종류 | 파일 | 쓰는 곳 | 만든 사람 | 도구 |
|---|---|---|---|---|
| 장비 | `family_1`–`family_21`(종. 등급 1–4는 같은 그림이고 칸의 등급 색이 가름) | 가방·창고·상점·장비 칸 | colorsocks | Codex image_gen |
| 소모품 | `item_potion_*`(4), `item_scroll_recall`, `item_scroll_enchant`, `item_skillbook_knight`·`_mage`(2102–2106, 2202–2206), `item_pet_cat_bell`, `item_pet_owl_feather`, `item_gold` | 같음, 물약은 퀵슬롯 | colorsocks | Codex image_gen |
| 재료 | 몬스터 부산물 9(`item_jelly` 등, 3101–3109), 채집물 6(`item_pine_log` 등, 3201–3206) | 가방·창고 | colorsocks | Codex image_gen |
| 스킬 | `skill_101`–`skill_106`(기사), `skill_201`–`skill_206`(마법사) | 퀵슬롯, 스킬 창 | colorsocks | Codex image_gen |
| 효과 | `effect_1`–`effect_4`(기절, 감속, 방어력 올림, 공격력 올림) | HUD의 효과 아이콘 칸 | colorsocks | Codex image_gen |
| 메뉴 | `menu_bag`, `menu_character`, `menu_skills`, `menu_quest`, `menu_settings` | HUD 오른쪽 위의 메뉴 버튼(라벨 대신) | colorsocks | Codex image_gen |
| 행동(101) | `action_attack`, `action_auto`, `action_target`, `action_interact`, `action_force` | HUD 오른쪽 아래의 원형 버튼 | colorsocks | Codex image_gen |

- 약관은 위 "UI 그림"의 표(Codex image_gen, OpenAI Terms of Use)와 같습니다.
- 아이템은 투명 배경에 물건 하나, 스킬은 꽉 찬 정사각형(기사는 강철·진홍·금, 마법사는 비전의 파랑·보라·불꽃 주황), 효과와 메뉴는 앤틱 금속의 문장입니다.
- 앞의 Quaternius Ultimate RPG Items Pack(CC0) 아이콘은 100에서 지웠습니다.

- 함께 받았지만 아직 쓰지 않은 것(모두 OpenGameArt, CC0 1.0): Kenney Game Icons(`Kenney_gameIcons.zip`, 1.0 MB. 톱니바퀴·나가기 같은 UI 기호뿐이라 스킬 아이콘으로 맞지 않음), Medieval Weapons Pack(`Medieval Weapons Pack - Sept 2018.zip`, 3.6 MB. 무기 메시), Kenney Particle Pack(`kenney_particlePack.zip`, 9.3 MB. 이펙트).

## UI 그림

2026-11-17(backlog 99). 창 판, 버튼, 바의 바탕과 채움, 아이템 칸, 조이스틱의 바탕과 손잡이 7장을 판타지 MMO풍 한 화풍(어두운 가죽, 앤틱 금·청동 테두리)으로 생성했습니다(사용자가 Codex image_gen으로 정함). Codex(codex-cli 0.159.3)를 `codex exec`로 저장소 루트에서 돌려 `mmo/art/ui/source/prompts.md`의 규칙·공통 스타일·표대로 `imagegen` 스킬의 기본 `image_gen`(투명 배경)으로 한 장씩 뽑았고, 9-slice의 가운데가 평평하지 않거나 비율이 다른 것은 뽑은 그림을 편집해 한 가지씩 고쳤습니다(실제로 쓴 명세는 `source/prompts-used.md`). 원본(1024–2172 px)은 `mmo/art/ui/source/`, 최종본은 `mmo/art/ui/`(`source/process.py`가 저장소 밖 가상환경의 Pillow로 투명 여백을 잘라 줄이고 9-slice 가운데의 밝기 흩어짐을 잼. 0.5–0.8/255)입니다. 위젯 생성기가 `/Game/UI/Art/`로 가져와(UI 압축, 밉맵 없음) 브러시로 씁니다(MANUAL의 위젯 블루프린트).

| 파일 | 쓰는 곳 | 최종 크기 | 만든 사람 | 도구 |
|---|---|---|---|---|
| `bar_fill.png` | 체력·마나·경험치·시전·보스 바의 채움(밝기만이라 색을 곱함) | 512×64 | colorsocks | Codex image_gen |
| `joystick_base.png`, `joystick_thumb.png` | 터치의 가상 조이스틱(엔진의 모바일 HUD 텍스처를 바꿈) | 512×512, 256×256 | colorsocks | Codex image_gen |

| 도구 | 약관 | 출력의 권리 |
|---|---|---|
| Codex image_gen(OpenAI) | [OpenAI Terms of Use](https://openai.com/policies/terms-of-use) | 약관상 출력은 사용자의 것입니다 |

- 2026-11-18(101): 사용자가 UI가 깔끔하지 않다고 해 리니지 라이크 UI로 바꾸면서, 창 판(`panel.png`), 버튼(`button.png`), 바의 바탕(`bar_frame.png`), 칸(`slot.png`)의 장식 그림은 지우고 둥근 상자 브러시의 1.5 px 금빛 선으로 바꿨습니다(장식이 많아 어지러웠음). 남은 그림은 위 표의 세 장입니다.
- 채팅·알림·말풍선의 반투명 바탕과 이름표의 낮은 바는 그림 없이 둡니다(작거나 반투명해 테두리가 보이지 않음). 아이콘(메뉴, 스킬, 효과, 아이템)은 100입니다.

## 이펙트와 소리

연출 표(`/Game/Effects/DA_Cues`)의 줄이 가리키는 것입니다. 에디터 모듈의 `MmoCreateEffectAssets`가 표와 소리를 만들고, 그림과 소리 파일은 backlog 91이 바꿉니다(2026-11-14, backlog 27).

| 무엇 | 지금 | 출처 |
|---|---|---|
| 스킬마다의 연출(104) | 모양 겹의 가산 머티리얼 `M_Fx`와 인스턴스 `Fx/MI_Fx_<그림>`(판이나 구에 입힘), 색을 입힌 파티클 `M_ParticleTint`와 `NS_Steel`·`NS_Gold`·`NS_Shield`·`NS_Blood`·`NS_Embers`·`NS_Arcane`·`NS_ArcaneTrail`·`NS_Fire`·`NS_Heal`·`NS_Frost`·`NS_Spirit`·`NS_Dust`(템플릿 `RadialBurst`, `DirectionalBurst`, `FountainLightweight`의 복사본). 스킬마다의 모양과 색은 `MmoCreateEffectAssets`의 `AddSkillCues` | 그림은 Kenney Particle Pack(CC0, 91에 받은 `kenney_particlePack.zip`)의 `slash_02`, `slash_03`, `circle_02`, `circle_03`, `circle_05`, `light_01`, `magic_02`, `flame_01`, `smoke_01`, `star_06`, `twirl_02`를 256 px 회색으로 줄여 `mmo/art/effects/`에 더함(새로 받은 것은 없음) |
| 연출의 질(105) | `M_Fx`의 노이즈는 땅의 `noise.png`(아래 "땅 텍스처")를 `/Game/Effects/Textures/noise`로 다시 가져와 같이 씀. 휘두름의 궤적 `SM_FxArc`(반원의 띠, 삼각형 48개)는 `MmoCreateEffectAssets`가 코드로 만듦 | 새 그림 없음 |
| 타격(`NS_Hit`), 스킬과 부활(`NS_Skill`), 발사체(`NS_Projectile`) | Niagara 플러그인의 템플릿 시스템(`RadialBurst`, `DirectionalBurst`, `FountainLightweight`)을 `MmoCreateEffectAssets`가 복사해 스프라이트 렌더러의 머티리얼을 `M_Particle_<그림>`(가산, 흰 그림 × 파티클 색)으로 바꾼 것(2026-11-17, 91) | 그림은 Kenney Particle Pack(CC0, [OpenGameArt: Particle Pack (80+ sprites)](https://opengameart.org/content/particle-pack-80-sprites), `kenney_particlePack.zip` 9.3 MB)의 `spark_01`, `star_01`, `magic_01`을 128 px로 줄여 `mmo/art/effects/`에 둠. 움직임은 엔진 템플릿 그대로(쿠킹에 들어감) |
| 효과음 `S_Hit`, `S_Skill`, `S_Revive`, `S_Footstep`, `S_UiClick`, `S_UiWindow`, `S_UiLevelUp`, `S_UiPickUp`, `S_UiEnchantSuccess`, `S_UiEnchantFailure`, `S_UiBossAppeared` | `mmo/art/sounds/<이름>.ogg`(2026-11-17, 91): 타격 `blade_01`, 스킬 `spell_01`, 부활 `spell_02`, 보스 등장 `creature_roar_01`(rubberduck의 80 CC0 RPG SFX), 발소리 `footstep00`, 줍기 `handleCoins`(Kenney RPG Audio), 클릭 `click_001`, 창 `open_001`, 강화 실패 `error_001`(Kenney Interface Sounds), 레벨 업 `jingles_NES00`, 강화 성공 `jingles_STEEL00`(Kenney 85 Short music jingles) | [80 CC0 RPG SFX](https://opengameart.org/content/80-cc0-rpg-sfx), [50 RPG sound effects](https://opengameart.org/content/50-rpg-sound-effects), [Interface Sounds](https://opengameart.org/content/interface-sounds), [85 Short music jingles](https://opengameart.org/content/85-short-music-jingles). 모두 CC0 1.0(페이지). 원본이 없는 이름은 커맨드렛이 합성한다 |
| 배경음 `M_Town`, `M_Hunting`, `M_Gathering`, `M_Boss` | `mmo/art/sounds/<이름>.flac`(2026-11-17, 91): cynicmusic의 Town Theme RPG, Happy Lullaby(song17), Another August, Battle Theme A를 `afconvert`로 모노 22.05 kHz 16비트 FLAC으로 바꿈(합 11.5 MB) | [Town Theme RPG](https://opengameart.org/content/town-theme-rpg), [Happy Lullaby](https://opengameart.org/content/happy-lullaby-song17), [Another August](https://opengameart.org/content/another-august), [Battle Theme A](https://opengameart.org/content/battle-theme-a). 모두 CC0 1.0(페이지) |
