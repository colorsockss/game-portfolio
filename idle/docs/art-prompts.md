# Codex 그림 프롬프트

[art.md](art.md)의 그림을 Codex의 `imagegen` 스킬(기본 `image_gen` 도구)로 뽑는 프롬프트입니다. Codex를 저장소 루트에서 열고 묶음이나 배우를 정해 이렇게 말하면 됩니다.

> idle/docs/art-prompts.md를 읽고 1. UI 테마를 만들어줘.
>
> idle/docs/art-prompts.md를 읽고 3·4의 hero를 만들어줘.
>
> idle/docs/art-prompts.md를 읽고 3·4의 hero에 walk만 더해줘.

Codex는 이 문서에서 0의 규칙, 그 묶음의 지시, 틀, 표를 읽고 그림마다 명세를 만듭니다. 묶음을 정하지 않으면 5까지 150장쯤을 한 대화에서 뽑습니다. 그러면 그림체를 중간에 확인할 수 없으니 묶음을 나눠 시킵니다.

- Codex에 하는 지시는 한국어이고, `image_gen`에 넘기는 그림 명세(코드 블록 안의 `Use case:` …)는 영어입니다. 명세는 `imagegen` 스킬의 형식을 따릅니다.
- 기본 그림체는 **공통 스타일** 블록이 정합니다. 3·4의 용사와 일반몹에는 최신 피드백을 반영한 **일반몹 단색 스타일**을 대신 씁니다.
- 생성기는 정확한 픽셀 크기를 지키지 못합니다. 그래서 크게 뽑은 뒤 후처리로 최종 크기에 맞춥니다.

## 0. 규칙

```text
idle/docs/art.md의 그림을 imagegen 스킬의 기본 image_gen 도구로 만든다. 프롬프트는 idle/docs/art-prompts.md에 있다. 이번 세션 내내 다음을 지킨다.

- 그림 명세마다 art-prompts.md의 "공통 스타일" 블록을 앞에 붙인다. 3·4의 용사와 일반몹은 "일반몹 단색 스타일"로 대체하며, soft light 같은 서로 어긋나는 조명 지시를 함께 넣지 않는다.
- 그림 하나에 image_gen 호출 하나다. n으로 다른 그림을 대신하지 않는다.
- 배경 그림(backgrounds)을 빼고는 진짜 투명 배경을 요청하고 alpha를 지킨다.
- 생성된 원본은 idle/art/source/<묶음>/에, 후처리한 최종본은 idle/art/<묶음>/에 둔다. idle/client/Assets에는 넣지 않는다.
- 후처리(자르기, 크기 맞추기, 프레임 나누기)는 저장소 밖 가상환경(python3 -m venv ~/.venvs/art, 그 안에 pip install pillow)의 스크립트로 한다. 저장소에 스크립트나 의존성을 더하지 않는다.
- 결과를 직접 열어 보고, 명세와 다르면 한 가지만 고쳐 다시 뽑는다. 글자·숫자·로고·워터마크가 들어간 그림은 버린다.
- 끝낸 그림마다 idle/docs/art.md의 그 줄에서 "지금"을 "완료"로 바꾸고, 만든 사람에 `git config user.name`의 값을, 도구에 "Codex image_gen"을 적는다.
- 커밋하지 않고 git 브랜치도 바꾸지 않는다. 끝나면 만든 파일 경로와 실제로 쓴 프롬프트를 보고한다.
```

## 공통 스타일

```text
Style/medium: 2D mobile idle RPG game art; clean cartoon style with bold dark outlines, flat cel shading with one shadow tone and one highlight tone; slightly chunky proportions (head about one third of body height for humanoids); silhouette readable at small size
Color palette: saturated but not neon; 3-5 main colors per subject
Lighting/mood: soft light from the top left; cheerful fantasy
Constraints: no text, no letters, no numbers, no logos or trademarks, no watermark, no signature
```

도트 그림으로 하려면 `Style/medium`을 `pixel art, 32-bit era, crisp 1-pixel dark outline, limited palette, no anti-aliasing`으로 바꾸고, 후처리에서 줄일 때 최근접 보간(NEAREST)을 씁니다.

## 1. UI 테마 (55)

```text
idle/docs/art-prompts.md의 "1. UI 테마" 표의 그림을 차례로 만들어라. 명세는 아래 틀의 <...>를 표의 값으로 채운다. 후처리: 투명 여백을 잘라 내고 표의 최종 크기로 줄인다. 9-slice 그림은 장식이 바깥 25% 안에만 있고 가운데가 평평해야 한다. 아니면 다시 뽑는다.
```

```text
Use case: stylized-concept
Asset type: game UI sprite for a dark-themed mobile RPG; the game tints it with theme colors at runtime
Primary request: <그림>
Composition/framing: front view, centered, fills the canvas with a small even margin
Color palette: white and light gray only, no hue (the game multiplies a color over it)
Constraints: <조건>; transparent background
```

| 파일(`idle/art/ui/`) | 그림 | 조건 | 최종 크기 |
|---|---|---|---|
| `button.png` | rounded rectangle button with a soft bevel, light top highlight, slightly darker bottom edge | 9-slice: all decoration within the outer 25% border, center flat and even | 128×128 |
| `panel.png` | rounded rectangle panel with a thin inner frame line | 9-slice: all decoration within the outer 25% border, center flat and even | 128×128 |
| `gauge.png` | horizontal progress bar fill with a glossy top highlight | wide horizontal bar, about 8:1, flat ends | 256×32 |
| `dot.png` | small round dot with subtle shading | perfect circle | 64×64 |
| `check.png` | bold check mark | single check mark only | 64×64 |
| `input.png` | inset rounded rectangle text field with a faint inner shadow at the top | 9-slice: all decoration within the outer 25% border, center flat and even | 128×128 |

원하면 더 뽑을 4장입니다. 뽑으면 테마에 칸을 더합니다.

| 파일(`idle/art/ui/`) | 그림 | 조건 | 최종 크기 |
|---|---|---|---|
| `button_pressed.png` | the same rounded button pressed in: bevel inverted, darker top edge | match `button.png` shape exactly; 9-slice as above | 128×128 |
| `button_disabled.png` | the same rounded button flat and low contrast | match `button.png` shape exactly; 9-slice as above | 128×128 |
| `tab.png` | tab with rounded top corners and a square bottom edge | 9-slice as above | 128×128 |
| `popup_frame.png` | ornate fantasy popup frame with decorated corners | 9-slice: corners and edges within the outer 25% border, center flat and even | 256×256 |

## 2. 아이콘 (55)

```text
idle/docs/art-prompts.md의 "2. 아이콘" 표의 아이콘을 차례로 만들어라. 명세는 아래 틀의 <...>를 표의 값으로 채운다. 후처리: 투명 여백을 잘라 내고, 정사각형 가운데에 두고 256×256으로 줄인다.
```

```text
Use case: stylized-concept
Asset type: game UI icon for a dark-themed mobile idle RPG, shown at about 90 px
Primary request: <그림>
Composition/framing: single centered object, slight 3/4 view, object fills about 80% of the canvas, clear silhouette
Color palette: <색>
Constraints: transparent background; no background scene elements
```

| 파일(`idle/art/icons/`) | 그림 | 색 |
|---|---|---|
| `currency_gold.png` | a small stack of shiny gold coins | gold and warm yellow |
| `currency_exp.png` | a glowing experience crystal orb | bright green |
| `slot_weapon.png` | a simple sword silhouette (empty weapon slot marker) | light gray monochrome |
| `slot_armor.png` | a simple chest armor silhouette (empty armor slot marker) | light gray monochrome |
| `slot_accessory.png` | a simple ring silhouette (empty accessory slot marker) | light gray monochrome |
| `main_upgrade.png` | a bold upward arrow with small sparkles | green and white |
| `main_skills.png` | an open spellbook with a glowing rune above it | blue and gold |
| `main_equipment.png` | a sword and a round shield crossed | steel gray and brown |
| `main_rebirth.png` | a circular arrow wrapped in a phoenix flame | orange and red |
| `main_inventory.png` | a leather adventurer backpack | brown and tan |
| `main_settings.png` | a gear cog | light gray |
| `main_logout.png` | an open wooden door with an arrow pointing out | brown and white |

## 3·4. 영웅·몬스터·보스·소환수 (62, 63)

새 배우를 만들 때는 [배우의 몸 비율과 그림체](art.md#배우의-몸-비율과-그림체)를 먼저 읽습니다. 인간형은 압축된 몸통과 짧은 팔다리로 그리고, 일반몹과 보스는 디테일과 표시 크기를 구분합니다. 아래 150픽셀은 애니메이션 원본 정렬 기준이며, 비교 그림에서는 별도 표시 배율을 반영합니다.

일반 초록 슬라임은 **둥근 몸과 점눈**, 숲 멧돼지는 **네 다리 구조**로 만듭니다. 멧돼지는 어깨 아래 앞다리 두 개, 엉덩이 아래 뒷다리 두 개를 붙이고 가까운 다리와 먼 다리를 일부 겹쳐 네 발을 구별합니다. 네 발을 같은 간격으로 일렬 배치하지 않습니다. 광택·그라데이션·질감을 없애고 면마다 일정한 단색을 사용합니다. 슬라임은 2색입니다. 멧돼지는 짧고 둥근 다리에 짙은 초콜릿색 갈기를 더해 6색입니다. 팔레트는 각 배우의 `art/source/actors/<key>/flat-2026-10-28/palette.json`에 있습니다. 이번 두 그림은 재생성에서도 그라데이션이 남아, 사용자 승인 후 Pillow의 고정 팔레트와 디더링 없음으로 평탄화했습니다. 원본과 평탄화본의 알파는 같습니다. 2026-10-28에 사용자가 **왼손 검 기준 그림을 같은 단색 그림체로 적용**하도록 선택했습니다. 용사는 이 그림의 갈색 머리·파란 튜닉·붉은 망토·짧은 팔다리를 유지한 7색 그림입니다. 검은 먼 쪽 왼손에 고정하고, 공격 때 빈 오른팔은 뒤로 빠져 몸에 가립니다. 시전은 빈 오른손으로 하며 왼손은 검을 놓지 않습니다. 기준과 팔레트는 `art/source/actors/hero/`에 있습니다.

일반몹 단색 스타일:

고블린 정찰병은 갈색 가죽 후드·짧은 튜닉, 큰 초록 귀, 작은 단검과 짧은 팔다리로 만듭니다. 기준 그림과 팔레트는 `art/source/actors/goblin_scout/`에 있습니다. 6색의 균일한 색면을 유지하고 장식·질감·광택을 더하지 않습니다. 모든 클립에서 단검은 같은 오른손에 고정합니다. 공격 준비는 단검을 쥔 손을 배 앞쪽으로 조금 당기고, 타격 때는 짧은 팔을 앞으로 내밀며 반대 팔을 몸 뒤로 보냅니다. 몸 높이는 용사의 0.75배(`Monsters.size`)입니다.

고블린 궁수는 정찰병과 같은 종족 비율에 초록 후드·짧은 활·갈색 화살통을 사용합니다. 6색 팔레트와 기준은 `art/source/actors/goblin_archer/`에 있습니다. 왼손으로 활 중앙을 잡고 오른손으로 시위를 당기며, 공격 2번째에서 당긴 시위와 화살을 보이고 3번째에서 시위를 놓습니다. 날아가는 화살은 별도 발사체이므로 캐릭터 시트에 그리지 않습니다. 표시 크기는 정찰병과 같은 0.75입니다.

```text
Style/medium: strictly flat 2D vector-style raster game sprite; solid opaque spot-color fills; clean dark contour; every color region has one uniform RGB color; antialiasing only at shape boundaries
Lighting/mood: unlit graphic, no simulated lighting; cheerful fantasy
Constraints: no gradients, no grain, no dithering, no gloss, no reflected light, no soft shadows, no text, no logos, no watermark; transparent background
```

그림체 비교는 큰 확대본만 보여주지 않고 **화면 너비 360·540·1080픽셀의 표시 크기**로도 만듭니다. 현재 카메라는 1080×1920에서 세로 10유닛을 보여주므로 용사 몸 1유닛은 192픽셀입니다. 기준 비율 1 : 0.45 : 0.65를 적용하면 1080픽셀 화면에서 192·86·125픽셀, 360픽셀 화면에서 64·29·42픽셀입니다(반올림, 경계 보간 오차 1픽셀 이내). 종별 크기는 `Monsters.size`에 슬라임 0.45, 멧돼지 0.65로 적용했습니다. 용사는 선택된 왼손 검 기준 그림을 단색으로 적용했으며, 두 고블린은 0.75배로 360픽셀 화면에서 몸 높이가 약 48픽셀입니다. 미리보기에서 작은 그림을 컨테이너 폭에 맞춰 확대하지 않습니다.

**원본 방향 규칙(2026-10-28)**: 영웅·일반몹·보스·소환수·발사체는 모두 오른쪽을 보는 원본으로 만듭니다. 게임에서 영웅 편은 `ActorView.Setup(..., facing: 1)`, 적은 `facing: -1`을 넘겨 몸의 `SpriteRenderer.flipX`로 반전합니다. 이미지 시트 전체를 뒤집으면 프레임 순서도 바뀌므로, 기존 그림 변환은 각 정사각 프레임 안에서만 합니다. 생성 원본과 이전 시안은 이력으로 보존하며, 적용 기준은 `art/actors/<key>/`입니다.

남은 7종도 같은 단색 규칙을 적용했습니다. 주술사는 보라 깃·뼈 가면·초록 수정, 독 슬라임은 보라 몸·초록 아래 띠·점눈, 골렘은 이끼가 붙은 큰 돌 덩어리, 서리 늑대는 흰 몸·하늘색 가슴으로 구분합니다. 일반몹에는 작은 장식·갈라짐·털 결을 넣지 않습니다. 오우거는 뿔 투구와 큰 칼, 드래곤은 큰 머리와 넓은 날개로 보스 실루엣을 만듭니다. 정령 늑대의 영적인 느낌은 청록 배색과 흐르는 꼬리로 표현하고 반투명 그라데이션·광원 효과를 넣지 않습니다. 모든 네발 동물은 어깨·엉덩이에 연결된 네 다리를 유지합니다. 오우거의 칼과 주술사의 지팡이는 모든 프레임에서 같은 앞쪽 왼손에 유지하며, 오우거 준비 자세의 칼을 머리 뒤로 넘기지 않습니다. 표시 배율은 주술사 0.75·독 슬라임 0.5·골렘 1.05·서리 늑대 0.8·오우거 1.65·드래곤 1.9·정령 늑대 0.9입니다. 실제 생성 프롬프트는 `art/source/actors/<key>/prompts.json`에 있습니다.

용사의 팔 길이는 대기 자세의 어깨–팔꿈치–손목 길이를 유지합니다. 공격 준비에서 손을 머리 위로 들지 않고 왼손을 몸통 가까이 당깁니다. 공격 2번째에는 빈 오른손 주먹을 보이고, 3번째에는 검 손잡이를 쥔 갈색 왼손 장갑을 분명히 그립니다. 타격 때 왼팔은 먼 쪽 몸통 뒤에서 나오고, 가까운 오른팔은 뒤쪽 허리로 짧게 굽힙니다. 오른쪽 어깨 보호대–회색 팔–갈색 주먹이 연결되어야 하며, 허리 뒤에 손만 초승달처럼 붙이지 않습니다. 시전은 오른팔을 짧게 굽혀 **몸 앞쪽(화면 오른쪽)**으로 손을 내밀며, 왼손은 아래로 든 검을 계속 쥡니다. 사망은 비틀거림 → 한쪽 무릎을 짚기 → 옆으로 쓰러짐의 세 자세입니다. 2번째는 가까운 다리의 발을 앞에 딛고 먼 다리의 무릎을 땅에 붙여 발을 뒤로 접습니다. 두 부츠만 갈색으로 그리고, 무릎은 바지색으로 구분합니다. 쓰러진 자세의 빈 오른손은 목도리 옆에 접어 두고, 왼손은 바닥을 향한 검 손잡이에 유지합니다. 어떤 자세에서도 팔을 늘여 바닥을 짚지 않습니다.

배우 하나를 세 단계로 만듭니다. 기준 그림을 먼저 뽑고, 그 그림을 참고 이미지로 넘겨 클립마다 한 장씩 뽑은 뒤 프레임으로 나눕니다. 그래야 클립끼리 같은 캐릭터로 보입니다. 배우는 하나씩(예: `hero`) 시키고, 아래 지시의 `<key>`가 그 배우의 key(맨 아래 표)입니다.

```text
idle/docs/art-prompts.md의 "3·4" 표에서 <key> 배우를 만들어라.
1) 기준 그림: 아래 "기준 그림" 틀로 뽑아 idle/art/source/actors/<key>/reference.png에 둔다.
2) 클립: 그 배우의 클립(일반은 idle, enter, walk, attack, hit, die / 영웅은 idle, walk, attack, cast, hit, die / 보스는 일반에 special을 더한다)마다 "클립" 틀로 한 장씩 뽑는다. reference.png를 view_image로 열어 Image 1로 넘기고, 원본을 idle/art/source/actors/<key>/<clip>.png에 둔다. 이미 만든 배우에 클립 하나만 더하라고 하면 있는 reference.png로 그 클립만 뽑고, 프레임 배율은 그 배우의 idle에 맞춘다.
3) 후처리: 장마다 프레임 수만큼 나눠(투명한 세로 줄로 나누고, 안 되면 같은 너비로 나눈다) 투명 여백을 자른다. 클립별 생성 줌 차이를 중립 자세로 먼저 보정한 뒤, 한 클립 안에서는 모든 프레임에 같은 배율을 써서 idle 첫 프레임의 몸 높이가 150픽셀이 되게 한다. 기본 프레임은 256×256이며 가로로 늘어나는 동작이 잘리면 배우의 모든 클립을 384×384로 넓힌다. 발은 프레임 중심보다 64픽셀 아래(256이면 y=192, 384이면 y=256), 몸 가운데는 칸 가운데에 놓는다. 클립마다 프레임을 왼쪽부터 가로로 이어 idle/art/actors/<key>/<clip>.png로 저장한다. 여백을 늘려도 몸 높이와 PPU 150은 유지한다.
4) 프레임 수, 바라보는 방향, 발 높이가 표와 맞는지 확인하고, 틀린 클립만 다시 뽑는다.
```

기준 그림 틀:

```text
Use case: stylized-concept
Asset type: 2D side-view game character sprite reference for a mobile idle RPG battle
Primary request: <외형>, standing in a relaxed idle pose
Composition/framing: full body, strict side view facing <방향>, centered, feet on one flat baseline, nothing cropped
Constraints: transparent background; no ground shadow, no props on the ground, no effects
```

클립 틀:

```text
Use case: stylized-concept
Asset type: 2D side-view sprite animation strip for a mobile idle RPG battle
Input images: Image 1: character reference; keep the exact same design, colors, proportions and outline
Primary request: <클립 설명> for the character in Image 1
Composition/framing: exactly <프레임 수> frames in one horizontal row, equal-width cells, generous empty space between frames so they never touch or overlap; same scale in every frame; feet on the same horizontal baseline in every frame except when falling; strict side view facing <방향>
Constraints: transparent background; no frame borders, no grid lines; no ground shadow
```

| 클립 | 프레임 | 클립 설명 |
|---|---|---|
| `idle` | 2 | breathing idle loop: frame 1 neutral, frame 2 slightly lower and wider |
| `enter` | 2 | fast running or hopping loop toward the facing direction, faster and more eager than `walk` |
| `walk` | 4 | calm walking loop in place (the game moves the actor): frame 1 front foot forward touching the ground, frame 2 passing pose with the body slightly higher, frame 3 the other foot forward touching the ground, frame 4 passing pose; creatures without legs use a squash-and-stretch crawl or small hop with the same four beats |
| `attack` | 4 | <공격>: frame 1 wind-up, frame 2 deeper wind-up, frame 3 the strike at full extension, frame 4 recovery |
| `cast` | 4 | casting a spell: frame 1 raising the free hand with gathering light, frame 2 light grows with eyes closed, frame 3 burst of light released, frame 4 back to stance |
| `hit` | 2 | getting hit: frame 1 recoiling backward with a wince, frame 2 recovering |
| `die` | 3 | defeated: frame 1 staggering with dizzy eyes, frame 2 collapsing, frame 3 lying flat on the ground |
| `special` | 5 | <보스 전용>: frames 1-3 charging up with a growing aura, frame 4 unleashing at full power, frame 5 recovery |

공격의 3번째 프레임과 보스 전용의 4번째 프레임에서 맞으므로, 그 프레임에 휘두름이 닿아야 합니다. 원거리 공격은 손에서 놓는 순간까지만 그립니다. 날아가는 발사체는 5의 발사체로 따로 그립니다.

| key | 이름 | 방향 | 외형 | 공격 | 보스 전용 |
|---|---|---|---|---|---|
| `hero` | 용사(영웅) | right | a young brave knight with short brown hair, a blue tunic over light steel armor, a red scarf and a short sword in the left hand | a sword slash | |
| `green_slime` | 초록 슬라임(2001) | right | a small round dome-shaped green slime with a flat bottom, tiny round dark dot eyes, a gentle expression and one uniform opaque green fill | a lunging body slam | |
| `forest_boar` | 숲 멧돼지(2002) | right | a compact brown wild boar with a short torso, a lowered blunt head, small ears, four very short plump legs with rounded feet in overlapping front and rear pairs, small white tusks and a small dark chocolate mane distinct from the brown body | a tusk charge | |
| `goblin_scout` | 고블린 정찰병(2003) | right | a small green goblin in a leather hood holding a dagger | a quick dagger stab | |
| `goblin_archer` | 고블린 궁수(2004) | right | a green goblin in a green hood with a short bow and a quiver | drawing and releasing the bow string (no arrow in flight) | |
| `goblin_shaman` | 고블린 주술사(2005) | right | a goblin shaman with a bone mask, a feather headdress and a wooden staff topped with a green crystal | raising the staff and casting from the crystal | |
| `poison_slime` | 독 슬라임(2006) | right | a purple-green toxic slime dripping poison | spitting a glob (no glob in flight) | |
| `rock_golem` | 바위 골렘(2007) | right | a hulking golem of mossy gray boulders with glowing blue eyes | a heavy two-fist ground slam | |
| `frost_wolf` | 서리 늑대(2009) | right | a white and pale blue wolf with frosty fur and icy breath | a claw swipe | |
| `ogre_chief` | 오우거 대장(2008, 보스) | right | a huge gray-green ogre chieftain with a horned helmet, fur shoulder pads and a giant cleaver | a cleaver swing | a war roar with a red aura and a ground slam |
| `fire_dragon` | 화염 드래곤(2010, 보스) | right | a chunky red dragon with two short hind legs, two short forearms, two broad wings, cream horns and a flat orange belly | a claw swipe | an upward-right roar with wings open, no separate meteors or glow |
| `spirit_wolf` | 정령 늑대(6001, 소환수) | right | a compact spirit wolf with flat pale cyan and mint colors and a broad flowing tail, no glow | a leaping bite | |

## 5. 원하면 더 뽑을 것

### 발사체

```text
idle/docs/art-prompts.md의 "발사체" 표의 발사체를 만들어라. 명세는 아래 틀의 <...>를 표의 값으로 채운다. 후처리: 2프레임으로 나눠 같은 배율로 줄이고, 128×128 투명 칸 가운데에 놓아 가로로 이은 idle/art/projectiles/<key>.png(256×128)로 저장한다.
```

```text
Use case: stylized-concept
Asset type: 2D game projectile sprite animation strip
Primary request: <그림>, a 2-frame looping flicker
Composition/framing: exactly 2 frames in one horizontal row with empty space between them; <방향>
Constraints: transparent background; no frame borders
```

| key | 이름 | 그림 | 방향 |
|---|---|---|---|
| `arrow` | 화살(5001) | a wooden arrow with feather fletching | flying to the right, horizontal |
| `fireball` | 화염구(5002) | a fireball with a flame tail | flying to the right |
| `poison_glob` | 독 덩어리(5003) | a dripping purple-green poison glob | flying to the right |
| `meteor` | 운석(5004) | a burning rock meteor with flames trailing upward | falling straight down |

### 스테이지 배경

```text
idle/docs/art-prompts.md의 "스테이지 배경" 표의 배경을 만들어라. 명세는 아래 틀의 <...>를 표의 값으로 채우고, 세로 그림(1024×1536)으로 뽑는다. 후처리: 가로:세로 4:7로 가운데를 잘라 768×1344로 줄여 idle/art/backgrounds/<key>.png로 저장한다. 배경은 투명하지 않다.
```

```text
Use case: stylized-concept
Asset type: vertical background for a 2D side-view mobile idle RPG battle screen
Primary request: <장면>
Composition/framing: flat side view; horizon at about 36% from the top; the lower part is open, even ground where characters stand, with no large objects in it; details and landmarks in the upper part and at the left and right edges
Lighting/mood: <분위기>; slightly muted so characters stand out
Constraints: no characters, no creatures; opaque background
```

| key | 스테이지 | 장면 | 분위기 |
|---|---|---|---|
| `meadow` | 훈련의 초원 | rolling green hills with wildflowers under a clear blue sky | bright morning |
| `forest` | 숲의 입구 | the edge of a dense pine forest on a dirt path | dappled afternoon light |
| `camp` | 고블린 야영지 | a goblin camp with patched tents, a wooden palisade and campfire smoke | warm dusk |
| `fortress` | 오우거의 요새 | the stone walls of an ogre fortress with plain cloth banners and torches | overcast and stern |
| `snow` | 얼어붙은 고개 | a frozen mountain pass with snowy peaks and falling snow | cold blue daylight |
| `lava` | 화염 드래곤의 둥지 | a volcanic cavern with lava rivers and glowing cracks | red and smoky |

### 효과·장비·스킬·전투 버튼 아이콘

2의 아이콘 프롬프트와 틀을 그대로 쓰고, 표 이름과 저장 폴더만 바꿉니다. 효과 아이콘은 작게 보이므로 최종 크기를 128×128로 합니다.

| 파일(`idle/art/effects/`, 128×128) | 그림 | 색 |
|---|---|---|
| `poison.png` | a dripping poison droplet | green and purple |
| `burn.png` | a small flame | orange and red |
| `stun.png` | three spinning stars | yellow |
| `slow.png` | a snail shell with a downward arrow | blue |
| `attack_up.png` | a sword with an upward arrow | red |
| `regen.png` | a green plus sign with a small leaf | green |
| `shield.png` | a translucent bubble shield | light blue |
| `cleanse.png` | a white sparkling water drop | white and pale blue |

| 파일(`idle/art/items/`) | 이름 | 그림 | 색 |
|---|---|---|---|
| `101.png` | 낡은 검 | a rusty chipped old sword | dull steel and rust |
| `107.png` | 날 선 검 | a polished sharp sword | bright steel |
| `104.png` | 오우거 대검 | a huge crude greatsword with a bone handle | dark iron and bone |
| `110.png` | 오우거 전쟁검 | a massive spiked war greatsword with glowing red runes | dark iron and red |
| `102.png` | 가죽 갑옷 | a simple leather chest armor | brown |
| `108.png` | 징 박은 갑옷 | a leather chest armor covered in metal studs | brown and steel |
| `105.png` | 서리 갑옷 | a frosted steel plate chest armor | icy blue |
| `111.png` | 빙하 갑옷 | a glacier plate chest armor with glowing ice crystals | deep blue and cyan |
| `103.png` | 구리 반지 | a plain copper ring | copper |
| `109.png` | 은 반지 | a silver ring with a small clear gem | silver |
| `106.png` | 화염 반지 | a gold ring with a ruby and a small flame | gold and red |
| `112.png` | 업화 반지 | a dark ring wreathed in roaring hellfire | black and orange |

| 파일(`idle/art/skills/`) | 이름 | 그림 | 색 |
|---|---|---|---|
| `1001.png` | 기본 공격 | a sword slash arc | white and steel |
| `1004.png` | 연속 사격 | three arrows flying side by side | brown and white |
| `1005.png` | 화염구 | a blazing fireball | orange and red |
| `1006.png` | 치유의 빛 | a beam of golden healing light with a plus sign | gold and green |
| `1010.png` | 전투의 포효 | a roaring warrior face with sound waves | red and orange |
| `1011.png` | 늑대 소환 | a glowing spirit wolf head | pale cyan |

| 파일(`idle/art/icons/`) | 버튼 | 그림 | 색 |
|---|---|---|---|
| `battle_boss.png` | 보스 도전 | a horned helmet over two crossed swords | red and steel |
| `battle_next.png` | 다음 스테이지 | a double chevron arrow pointing right | blue and white |

## 6. UI 개편 그림체 (78)

메인 화면을 슬레이어 키우기식으로 바꾸면서 UI 틀은 첨부 레퍼런스의 그림체(짙은 외곽선, 크림색 판, 아래 턱이 있는 버튼, 등급 색 칸)로 스크립트가 그렸고, 아이콘은 같은 그림체의 임시 SVG입니다([art.md](art.md)의 1·2). 이 절은 그 임시 아이콘과 지금 도트 배경을 Codex로 다시 그리는 프롬프트입니다. 이 절의 그림에는 공통 스타일 대신 아래 **UI 개편 스타일**을 붙입니다.

```text
UI 개편 스타일:
Style/medium: 2D casual mobile RPG game art in the style of cute modern idle games; flat color fills with exactly one darker shadow tone and one small highlight; thick uniform dark navy-purple outline (#2B2236) around every shape, about 6% of the icon width; rounded chunky shapes; no gradients, no texture, no painterly rendering
Color palette: saturated candy colors; the outline color is always #2B2236
Lighting/mood: highlight on the top-left of each shape; cheerful
Constraints: no text, no letters, no numbers, no logos or trademarks, no watermark, no signature
```

### 아이콘 28장

```text
idle/docs/art-prompts.md의 "6. UI 개편 그림체"의 아이콘 표를 차례로 만들어라. 명세는 "UI 개편 스타일" 블록 뒤에 아래 틀의 <...>를 표의 값으로 채운다. 지금 임시 그림(idle/art/icons/<파일>)을 함께 보고 같은 물체와 색을 지킨다. 후처리: 투명 여백을 잘라 내고, 정사각형 가운데 224×224 안에 비율을 지켜 넣은 256×256 PNG로 idle/art/icons/<파일>에 덮어쓴다. 생성 원본은 idle/art/source/icons/ui-redesign/에 둔다.
```

```text
Use case: stylized-concept
Asset type: game UI icon for a cute mobile idle RPG, shown at 60-110 px on cream and navy panels
Primary request: <그림>
Composition/framing: single centered object, front or slight 3/4 view, object fills about 85% of the canvas, bold readable silhouette
Color palette: <색> with the #2B2236 outline
Constraints: transparent background; no background elements; no drop shadow outside the outline
```

| 파일(`idle/art/icons/`) | 그림 | 색 |
|---|---|---|
| `currency_gold.png` | a single fat gold coin with an inner ring | gold yellow and orange |
| `currency_exp.png` | a round glowing experience orb | bright green |
| `slot_weapon.png` | a short sword pointing up-right with a gold cross guard | white steel, gold, brown grip |
| `slot_armor.png` | a chest armor plate with shoulder guards | light steel blue |
| `slot_accessory.png` | a gold ring with a cyan gem | gold and cyan |
| `main_upgrade.png` | a bold upward arrow | lime green |
| `main_skills.png` | an open spellbook with a small cyan sparkle above | white pages, blue cover, cyan |
| `main_equipment.png` | a short sword pointing up-right with a gold cross guard | white steel, gold, brown grip |
| `main_inventory.png` | a rounded leather backpack with a gold buckle | brown and gold |
| `main_rebirth.png` | a circular arrow with a small flame in the middle | orange and yellow |
| `main_settings.png` | a six-tooth gear cog | light gray |
| `main_logout.png` | a wooden door with a white arrow pointing out | brown and white |
| `stat_attack.png` | a short sword pointing up-right with a red cross guard | white steel, red |
| `stat_maxHp.png` | a plump heart | pink red |
| `stat_critChance.png` | a lightning bolt | yellow |
| `skill_slash.png` | a curved white slash arc with a sword hilt | white, cyan, gold |
| `skill_volley.png` | two arrows flying diagonally side by side | wood brown and steel |
| `skill_fireball.png` | a fireball with a yellow core | orange and yellow |
| `skill_heal.png` | a plus sign with a soft glow | light green |
| `skill_roar.png` | two stacked upward chevrons (power-up) | red |
| `skill_wolf.png` | a wolf paw print | ice blue |
| `ui_level.png` | a five-pointed star badge | yellow |
| `ui_boss.png` | a cute skull | white |
| `ui_prev.png` | a triangle arrow pointing left | white |
| `ui_next.png` | a triangle arrow pointing right | white |
| `ui_lock.png` | a padlock | gold |
| `ui_close.png` | a round close button with a bold black X in the middle | red |
| `ui_spinner.png` | a loading ring: a thick open circle arc with a small white dot at its leading end | yellow |

### 스테이지 배경 6장

5의 "스테이지 배경" 표와 틀을 그대로 쓰되, 공통 스타일 대신 UI 개편 스타일을 붙이고 다음을 더합니다. 메인 화면은 배경의 위에서 30%–62% 사이만 보이고, 배우는 그 안의 46%–60%에 섭니다. 그래서 지평선은 위에서 35–40%, 그 아래는 고르고 넓은 땅이고, 랜드마크는 지평선 근처와 양 끝에 둡니다. 후처리는 5와 같습니다(768×1344, `idle/art/backgrounds/<key>.png`). 그림이 들어오면 `client/Assets/Battle/Backgrounds/`의 코드로 그린 그림을 바꿉니다(`Backgrounds.cs`, 백로그 65).

```text
Additional constraints for the background: outlines on large shapes only (hills, trees, rocks, walls), thinner than the icon outline; ground with a few simple flat patches, no busy detail where the characters stand; slightly lower saturation than the characters
```

### 패럴랙스 배경(원경·근경)

위 "스테이지 배경 6장"을 두 겹으로 나눕니다. 원경(`far`)은 하늘과 먼 풍경이고 불투명하며, 근경(`near`)은 땅과 그 위의 가까운 소품이고 위쪽이 투명합니다. 근경은 배우와 같은 빠르기로, 원경은 그보다 느리게 흐릅니다. 두 겹이 같은 장면에서 나오도록 전체 장면을 먼저 뽑고 그것을 두 번 편집합니다.

겹마다 그림 한 장이 아니라 가로로 끝없이 되풀이되는 띠입니다. 그래서 장면은 그 장소를 밖에서 바라본 그림이 아니라 영웅이 그 안을 지나가는 그림이고, 두 겹 모두 되풀이되어도 자연스러운 것(이어지는 벽, 나무 줄, 덩굴, 능선, 기둥의 줄)으로만 채웁니다. 성 한 채, 해, 봉우리 하나처럼 하나뿐이어야 하는 것은 넣지 않습니다. 장면은 아래 표의 원경·근경 값이 정합니다.

```text
idle/docs/art-prompts.md의 "6. UI 개편 그림체"의 "패럴랙스 배경(원경·근경)"으로 <key> 배경을 만들어라. 스테이지마다 image_gen을 세 번 부른다.
1. 장면: "스테이지 배경 6장"의 명세(UI 개편 스타일, 5의 틀, 추가 조건)에 아래 "장면 추가 조건"을 더해 세로 그림(1024×1536)으로 뽑는다. 틀의 <장면>은 이 절의 표의 원경과 근경을 이은 것이고 <분위기>는 5의 표 값이다. 이 절의 조건이 "랜드마크는 양 끝에" 같은 앞 절의 지시와 어긋나면 이 절을 따른다.
2. 원경: 1을 편집 대상으로 아래 원경 명세로 편집한다.
3. 근경: 1을 편집 대상으로 아래 근경 명세로 편집한다. 투명 배경을 요청하고 alpha를 지킨다.
원본 세 장은 idle/art/source/backgrounds/<key>_scene.png, <key>_far.png, <key>_near.png에 둔다.
후처리: 원경과 근경을 각각 4:7로 가운데를 잘라 768×1344로 줄인다. 게임은 그림을 가로로 이어 그리며 흘리므로 왼쪽 끝과 오른쪽 끝이 이어져야 한다. 내용이 양 끝까지 이어지므로 후처리로 이음매를 맞추되(예: 거울상 잇기, 양 끝 띠 섞기) 벽·나무·능선이 끊기거나 겹치지 않게 하고, 근경은 alpha를 지킨다. 근경 땅에 투명 구멍이 생기면 장면 원본으로 메운다. 세 장을 가로로 이은 미리보기를 직접 열어 이음매나 겹친 외곽선이 보이거나, 하나뿐이어야 할 것이 되풀이되거나, 원경이 섬처럼 떨어져 그 사이에 빈 하늘이 보이면 고치거나 다시 뽑는다. 근경을 원경 위에 겹친 미리보기도 열어 땅이 지평선 아래를 다 덮는지 본다. 최종본은 idle/art/backgrounds/<key>_far.png, <key>_near.png다.
```

```text
Additional scene constraints for parallax: the viewer travels through the place, not looking at it from outside; both layers repeat endlessly to the left and right, so fill them only with elements that naturally continue (walls, rows of trees, vines, ridges, rows of pillars) and include no unique landmark (no single castle, sun, moon or lone peak); the distant scenery spans the full width with no gaps of empty sky between groups; clear depth separation between the distant scenery behind the horizon and a few small generic near props standing on the ground just below the horizon (38-46% from the top), none where the characters stand (46-60% from the top); a level ground boundary across the full width with all distant scenery entirely above it; near props only within the central 70% of the width and the 38-46% band, none at the bottom; the image must tile horizontally: the horizon and the ground at the same height and colors on both sides
```

```text
Use case: precise-object-edit
Asset type: far parallax layer of a vertical 2D side-view battle background; it scrolls slower behind the near layer
Input images: Image 1: edit target (the full stage background)
Primary request: keep only the sky and the distant scenery behind the horizon; remove every near prop on the ground and continue the sky and distant scenery behind where they stood; below the horizon, fill with a single uniform ground color matching Image 1, without patches or outlines
Constraints: change only the removed props and the ground below the horizon; keep the canvas size, alignment, style, palette, outlines, framing and horizon height of Image 1; opaque background; no characters, no creatures
```

```text
Use case: background-extraction
Asset type: near parallax layer of a vertical 2D side-view battle background; it scrolls at the characters' speed over the far layer
Input images: Image 1: edit target (the full stage background)
Primary request: keep only the ground from the horizon to the bottom edge across the full width and the near props standing on it; make the sky and all distant scenery fully transparent
Constraints: keep the canvas size, alignment, style, palette, outlines, framing and horizon height of Image 1; do not trim, reframe or move anything, the props stay where they are; the ground is opaque, spans the full width and has no transparent holes; transparent background above the ground and around the props, as real alpha, not a painted checkerboard or solid backdrop; clean edges, no halo; no characters, no creatures
```

| key | 원경 | 근경 |
|---|---|---|
| `meadow` | rolling green hills and bushes continuing along the horizon under a sky with small clouds | a grassy field with small rocks and wildflower clumps |
| `forest` | inside a dense forest: thick trunks and lush foliage continuing without gaps, sky only through small gaps in the leaves, hanging vines | a dirt path with vines, ferns and roots along its edge |
| `camp` | inside a goblin camp: an endless wooden palisade with patched tent roofs behind it, both part of the distant layer; warm dusk sky; no sun, gate or watchtower | a packed dirt path with small crates and barrels |
| `fortress` | inside an ogre fortress: a frontal view of an inner stone corridor wall with pillars and arches repeating at a regular interval, the arches closed with stone wall, plain cloth banners and torches between them | a flagstone path |
| `snow` | an endless snowy mountain ridge of similar heights with falling snow; no isolated summit, no open valley | a snowy path with icy rocks |
| `lava` | inside a volcanic cavern: a continuous cave wall with stalactites, lava streams flowing down between them; no central lavafall, no sky | a basalt floor with glowing cracks only near the top of the path |
