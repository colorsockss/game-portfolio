# 그림 목록

MMORPG(`mmo/`)에 들어간 그림과 그 출처입니다. 원본 파일은 저장소에 두지 않고, 받는 곳과 가져오는 스크립트만 적습니다. 가져온 에셋(`client-unreal/Content/`)은 LFS로 커밋합니다. 엔진의 마네킹 등 Epic 콘텐츠는 공개 저장소에 올릴 수 없어 쓰지 않습니다.

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
| 효과음 `S_Hit`, `S_Skill`, `S_Revive`, `S_Footstep`, `S_UiClick`, `S_UiWindow` | 커맨드렛이 합성한 짧은 소리(잡음, 사인파의 미끄럼, 세 음) | 직접 만든 것(코드로 합성. 원본 파일 없음) |
| 배경음 `M_Town`, `M_Hunting`, `M_Gathering`, `M_Boss` | 커맨드렛이 합성한 8초 되풀이의 화음(구역의 종류마다) | 직접 만든 것 |
