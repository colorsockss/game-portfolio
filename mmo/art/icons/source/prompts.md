# 아이콘 프롬프트 (backlog 100)

Unreal 클라이언트의 아이템, 스킬, 효과, 메뉴 아이콘을 Codex의 `imagegen` 스킬(기본 `image_gen` 도구)로 뽑는 프롬프트입니다. 화풍은 UI 그림(`mmo/art/ui/`. 99)과 같은 어두운 판타지 MMO풍입니다. 저장소 루트에서 Codex에 묶음을 정해 이렇게 말합니다.

> mmo/art/icons/source/prompts.md를 읽고 "시험" 묶음을 만들어라.
>
> mmo/art/icons/source/prompts.md를 읽고 "장비" 묶음을 만들어라. 첨부한 그림은 화풍의 기준이다.

- Codex에 하는 지시는 한국어이고, `image_gen`에 넘기는 명세(코드 블록)는 영어입니다.
- 시험 묶음 5장을 먼저 뽑아 화풍을 정하고, 나머지 묶음은 그 5장을 참고 그림(`codex exec -i`)으로 붙여 같은 화풍으로 뽑습니다.
- 생성기는 정확한 픽셀 크기를 지키지 못해 크게 뽑고, `process.py`가 최종본(`mmo/art/icons/<파일>`, 256×256)으로 줄입니다.

## 규칙

```text
mmo/art/icons/source/prompts.md의 그 묶음의 표의 그림을 imagegen 스킬의 기본 image_gen 도구로 만든다. 이번 세션 내내 다음을 지킨다.

- 그림 명세마다 그 종류의 "공통 스타일" 블록을 앞에 붙이고, 이어서 그 종류의 "틀"의 <...>를 표의 값으로 채운다.
- 첨부한 그림이 있으면 화풍의 기준(reference image)으로만 쓴다. 그 그림의 물건을 따라 그리지 않는다.
- 그림 하나에 image_gen 호출 하나다. n으로 다른 그림을 대신하지 않는다. 뽑는 크기는 1024×1024다.
- 아이템·효과·메뉴는 진짜 투명 배경을 요청하고 alpha를 지킨다. 스킬은 투명하지 않은 정사각형 그림이다.
- 고른 결과를 mmo/art/icons/source/<파일 이름>으로 복사한다(표의 파일 이름 그대로, PNG). 다른 곳에는 두지 않는다.
- 결과를 직접 열어 보고, 명세와 다르면 한 가지만 고쳐 다시 뽑는다. 글자·숫자·로고·워터마크·글자처럼 보이는 문양이 든 그림은 버린다.
- 커밋하지 않고 git 브랜치도 바꾸지 않는다. 저장소의 다른 파일은 고치지 않고, 테스트나 검사도 돌리지 않는다.
- 끝나면 파일마다 실제로 쓴 명세(다시 뽑았으면 마지막 것)를 보고한다.
```

## 아이템 (장비, 소모품, 재료)

공통 스타일:

```text
Style/medium: inventory item icon for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted digital painting with crisp edges; rich material detail (worn leather, forged steel, aged bronze, glass, gold) that stays readable at 64 pixels
Color palette: natural material colors, slightly desaturated, with warm highlights; no neon
Lighting/mood: soft key light from the top left and a subtle warm rim light so the silhouette reads on a near-black slot
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border, no ground, no cast shadow
```

틀:

```text
Use case: stylized-concept
Asset type: game inventory item icon
Primary request: <그림>
Composition/framing: a single object in a dynamic three-quarter view, centered, filling about 80% of the square canvas; the whole object is visible
Constraints: transparent background
```

## 스킬

공통 스타일:

```text
Style/medium: skill icon for a classic Korean-style dark fantasy MMORPG; dramatic hand-painted digital painting with glowing magical light; bold readable shape at 64 pixels
Color palette: <색>; dark, smoky background
Lighting/mood: strong glow from the subject, high contrast, epic
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border
```

`<색>`: 기사(1xx)는 `steel silver, crimson and antique gold`, 마법사(2xx)는 `arcane blue, violet and ember orange`입니다.

틀:

```text
Use case: stylized-concept
Asset type: game skill icon, square, full bleed
Primary request: <그림>
Composition/framing: one bold subject centered, filling the square edge to edge; the background fills the whole canvas
Constraints: opaque square image, no transparency
```

## 효과와 메뉴

공통 스타일:

```text
Style/medium: small status or menu emblem for a classic Korean-style dark fantasy MMORPG UI; hand-painted antique metal emblem with a glowing accent; very simple bold shape that stays readable at 32 pixels
Color palette: antique gold and aged bronze metal with <색> accent
Lighting/mood: soft light from the top left, subtle bevel highlights
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no square frame
```

틀:

```text
Use case: stylized-concept
Asset type: game UI emblem icon
Primary request: <그림>
Composition/framing: front view, centered, filling about 85% of the square canvas
Constraints: transparent background
```

## 표

파일 이름의 앞이 종류입니다: `family_<종>`(장비. 등급은 같은 그림이고 칸의 등급 색이 가름), `item_<이름>`(소모품·재료), `skill_<id>`, `effect_<id>`, `menu_<이름>`. 아이템 id와 종은 `mmo/data/Items.xlsx`, 스킬은 `Skills.xlsx`, 효과는 `Effects.xlsx`입니다.

### 시험

| 파일 | 종류 | 그림 |
|---|---|---|
| `family_3.png` | 아이템 | Knight Sword: a knightly longsword with a polished steel blade, an antique gold crossguard and a dark leather grip |
| `item_potion_hp.png` | 아이템 | HP Potion: a small round glass flask filled with glowing crimson liquid, cork stopper tied with twine |
| `skill_101.png` | 스킬(기사) | Slash: a single diagonal sword slash leaving a bright silver crescent arc of light |
| `effect_1.png` | 효과(색: electric yellow) | Stun: a ring of small golden stars circling, like dizziness |
| `menu_bag.png` | 메뉴(색: warm amber) | Bag: a leather pouch with a drawstring and a bronze clasp |

### 장비

| 파일 | 그림 |
|---|---|
| `family_1.png` | Worn Sword: an old short sword with a chipped, slightly rusty iron blade and a plain iron crossguard |
| `family_2.png` | Steel Sword: a clean steel arming sword with a simple steel crossguard and a brown leather grip |
| `family_4.png` | Oak Staff: a gnarled oak wizard staff with a twisted top |
| `family_5.png` | Crystal Staff: a slender wooden staff topped with a glowing pale blue crystal held by silver prongs |
| `family_6.png` | Archmage Staff: an ornate dark staff with gold filigree crowned by a glowing violet orb |
| `family_7.png` | Leather Cap: a simple brown leather cap with stitched seams |
| `family_8.png` | Iron Helm: an open-faced iron helmet with a nose guard |
| `family_9.png` | Knight Helm: a closed knight great helm with a visor slit and antique gold trim |
| `family_10.png` | Leather Armor: a brown leather jerkin with straps and buckles |
| `family_11.png` | Chain Mail: a chain mail hauberk of interlocking steel rings |
| `family_12.png` | Plate Armor: a polished steel breastplate with pauldrons and antique gold trim |
| `family_13.png` | Leather Gloves: a pair of brown leather gloves |
| `family_14.png` | Iron Gauntlets: a pair of riveted iron gauntlets |
| `family_15.png` | Knight Gauntlets: a pair of articulated steel gauntlets with antique gold trim |
| `family_16.png` | Leather Boots: a pair of brown leather boots with laces |
| `family_17.png` | Iron Boots: a pair of iron-plated boots |
| `family_18.png` | Knight Boots: a pair of steel plate sabatons with antique gold trim |
| `family_19.png` | Copper Ring: a plain copper ring |
| `family_20.png` | Silver Ring: a silver ring set with a small blue sapphire |
| `family_21.png` | Gold Ring: an ornate gold ring set with a red ruby |

### 소모품과 재료

| 파일 | 아이템 id | 그림 |
|---|---|---|
| `item_potion_hp_greater.png` | 2002 | Greater HP Potion: a larger ornate glass bottle with a gold neck filled with brightly glowing crimson liquid |
| `item_potion_mp.png` | 2003 | MP Potion: a small round glass flask filled with glowing blue liquid, cork stopper tied with twine |
| `item_potion_mp_greater.png` | 2004 | Greater MP Potion: a larger ornate glass bottle with a gold neck filled with brightly glowing blue liquid |
| `item_scroll_recall.png` | 2005 | Recall Scroll: a rolled parchment scroll tied with a blue ribbon and a softly glowing blue wax seal |
| `item_scroll_enchant.png` | 2006 | Enchant Scroll: a rolled parchment scroll with a golden wax seal surrounded by small golden sparkles |
| `item_skillbook_knight.png` | 2102–2106 | Knight Skill Book: a thick leather-bound tome with steel corner plates and a crossed-swords emblem on the cover |
| `item_skillbook_mage.png` | 2202–2206 | Mage Skill Book: a thick violet tome with gold corners and a glowing blue crystal set in the cover |
| `item_pet_cat_bell.png` | 2301 | Cat Bell: a small brass bell on a red ribbon |
| `item_pet_owl_feather.png` | 2302 | Owl Feather: a single soft brown owl feather |
| `item_gold.png` | 4001 | Gold: a small pile of gold coins |
| `item_jelly.png` | 3101 | Sticky Jelly: a glossy blob of translucent green jelly |
| `item_mushroom_cap.png` | 3102 | Mushroom Cap: a single red-brown mushroom cap with pale spots |
| `item_boar_tusk.png` | 3103 | Boar Tusk: a curved ivory boar tusk |
| `item_goblin_earring.png` | 3104 | Goblin Earring: a crude brass hoop earring with a small tooth charm |
| `item_wolf_pelt.png` | 3105 | Wolf Pelt: a folded grey wolf pelt |
| `item_broken_arrow.png` | 3106 | Broken Arrow: a wooden arrow snapped in two, with grey feather fletching |
| `item_orc_tooth.png` | 3107 | Orc Tooth: a large yellowed fang |
| `item_old_bone.png` | 3108 | Old Bone: an old cracked bone |
| `item_troll_blood.png` | 3109 | Troll Blood: a small glass vial of dark green blood with a cork |
| `item_pine_log.png` | 3201 | Pine Log: a short pine log with rough bark |
| `item_copper_ore.png` | 3202 | Copper Ore: a chunk of rock with veins of orange copper ore |
| `item_mugwort.png` | 3203 | Mugwort Leaf: a sprig of silvery green mugwort leaves |
| `item_oak_log.png` | 3204 | Oak Log: a short oak log with thick dark bark |
| `item_iron_ore.png` | 3205 | Iron Ore: a chunk of dark grey rock with metallic iron flecks |
| `item_ginseng.png` | 3206 | Ginseng Root: a pale forked ginseng root with a few leaves |

### 스킬

| 파일 | 직업 | 그림 |
|---|---|---|
| `skill_102.png` | 기사 | Bash: a heavy sword pommel strike with a bright impact burst and small stars |
| `skill_103.png` | 기사 | Guard: a glowing golden kite shield |
| `skill_104.png` | 기사 | Whirl: a sword spinning in a circular whirlwind of silver light |
| `skill_105.png` | 기사 | Hobble: a sword cutting low across an armored boot with a red slash |
| `skill_106.png` | 기사 | Fury: a clenched steel gauntlet wreathed in roaring red flames |
| `skill_201.png` | 마법사 | Bolt: a glowing arcane missile of blue-violet energy streaking forward |
| `skill_202.png` | 마법사 | Meteor: a flaming meteor falling from a dark sky |
| `skill_203.png` | 마법사 | Heal: an open hand surrounded by soft green and gold healing light |
| `skill_204.png` | 마법사 | Frost: a burst of sharp blue ice crystals |
| `skill_205.png` | 마법사 | Pyro: a blazing fireball |
| `skill_206.png` | 마법사 | Summon Spirit: a ghostly pale blue spirit rising from a glowing circle |

### 효과와 메뉴

| 파일 | 색 | 그림 |
|---|---|---|
| `effect_2.png` | icy blue | Slow: a boot bound by blue ice chains |
| `effect_3.png` | emerald green | Defense Up: a shield with a bold upward chevron |
| `effect_4.png` | fiery red | Attack Up: a sword with a bold upward chevron |
| `menu_character.png` | warm amber | Character: a knight helmet seen from the front |
| `menu_skills.png` | arcane blue | Skills: an open spellbook with a small glowing spark |
| `menu_quest.png` | warm amber | Quests: a rolled scroll with a quill |
| `menu_settings.png` | warm amber | Settings: a cogwheel |

### 행동 (HUD의 터치 버튼. 리니지 라이크 HUD 개편)

"효과와 메뉴"의 공통 스타일과 틀을 씁니다.

| 파일 | 색 | 그림 |
|---|---|---|
| `action_attack.png` | crimson red | Attack: two crossed swords |
| `action_auto.png` | emerald green | Auto Hunt: a circular arrow loop around a small sword |
| `action_target.png` | crimson red | Target: a crosshair reticle with four inward-pointing notches |
| `action_interact.png` | warm amber | Interact: an open gauntleted hand reaching forward |
| `action_force.png` | fiery red | Force Attack: a single sword with a red glowing blade and a small flame |
