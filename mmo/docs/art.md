# 그림 목록

MMORPG(`mmo/`)에 들어간 그림과 그 출처입니다. 원본 파일은 저장소에 두지 않고, 받는 곳과 가져오는 스크립트만 적습니다. 가져온 에셋(`client-unreal/Content/`)은 LFS로 커밋합니다. 엔진의 마네킹 등 Epic 콘텐츠는 공개 저장소에 올릴 수 없어 쓰지 않습니다.

## 캐릭터

| 직업 | 원본 | 받는 곳 | 라이선스 | 가져오기 |
|---|---|---|---|---|
| 기사 | Quaternius "RPG Characters - Nov 2020"의 `Warrior`(메시, 애니메이션, `Warrior_Texture`, `Warrior_Sword_Texture`) | [OpenGameArt: LowPoly RPG Characters](https://opengameart.org/content/lowpoly-rpg-characters) (`rpg_characters_-_nov_2020.zip`, 12.9 MB) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | `client-unreal/Scripts/import_characters.py` |
| 마법사 | 같은 팩의 `Wizard`(메시, 애니메이션, `Wizard_Texture`, `Wizard_Staff_Texture`) | 같음 | CC0 1.0 | 같음 |

- 팩의 FBX 하나에 스켈레탈 메시, 스켈레톤, 애니메이션(대기·달리기·공격·죽음 등)이 함께 들어 있습니다. 지금은 `Idle_Weapon`과 `Run_Weapon`만 씁니다(대기·달리기 블렌드 스페이스).
- 기사·마법사 말고 같은 팩의 성직자(Cleric), 수도사(Monk), 궁수(Ranger), 도적(Rogue)은 세 번째 직업부터 쓸 수 있습니다.
