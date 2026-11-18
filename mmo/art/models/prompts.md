# 3D 모델 프롬프트 (Tripo)

Tripo로 MMORPG(`mmo/`)의 모델을 한 화풍으로 다시 만드는 프롬프트입니다. 지금 화면은 사람 비율의 기사(System G6), 2등신 몬스터(Quaternius), 평면 색의 마을 사람이 섞여 화풍이 갈립니다(`docs/art.md`). 기준 캐릭터(기사)를 먼저 만들어 화풍을 정하고, 나머지는 그 그림을 참고 그림으로 붙여 같은 화풍으로 만듭니다.

- 화풍은 아이콘·UI 그림(99, 100)과 같은 어두운 판타지의 반실사 손그림 질감이고, 비율은 사람 7등신입니다.
- 텍스트로 바로 만든 기사(2026-11-18의 첫 시험)는 강철이 흰색에 가깝고 투구가 닫혀 프롬프트를 따르지 않았습니다. 그래서 그림을 먼저 만들고(어라운드 시트) 그 네 방향 그림을 Tripo에 넣습니다. 지금은 기사 하나로 이 흐름을 맞추는 중이고, 흐름이 정해지면 2절부터의 텍스트 프롬프트도 시트 명세로 바꿉니다.
- 프롬프트는 Tripo의 안내대로 영어이고 차례는 대상 → 세부(재질, 색, 비율) → 화풍 → 배경과 구도입니다. 마지막의 화풍과 구도는 모든 프롬프트가 같습니다(아래 "공통 화풍").

## 시작 전에: 유료 플랜

무료 플랜으로 만든 모델은 Tripo가 모든 권리를 가집니다(약관 5.2.1). 유료 플랜으로 만든 것만 사용자가 권리를 가지고 게임에 쓰고 배포할 수 있습니다(약관 5.2.2. 학습에도 쓰지 않음). 공개 저장소에 올리므로 **유료 플랜으로 만든 것만** 넣습니다(2026-11-18 [Tripo 도움말](https://www.tripo3d.ai/help/privacy-policy/how-to-use-tripo-models-commercially)에서 확인). 넣을 때 `docs/art.md`에 도구와 약관을 적습니다.

## 한 모델을 만드는 차례

| 단계 | 어디서 | 메모 |
|---|---|---|
| 1. 어라운드 시트 | Codex image_gen(아래 "기사 어라운드 시트"의 규칙과 명세) | 한 그림에 앞, 왼쪽, 뒤, 오른쪽의 네 모습. 한 그림이라 네 방향의 옷과 비율이 같음 |
| 2. 네 장으로 자르기 | `source/process.py` | 네 모습을 같은 배율로 잘라 1024×1024 흰 바탕의 네 장(`<키>_front`, `_left`, `_back`, `_right`)으로 |
| 3. 3D | Tripo의 Image to 3D에서 multi-view 입력에 네 장을 넣고 Smart Mesh(게임용, 기본 약 5,000면) | HD Model(최대 200만 면)은 쓰지 않음. PBR 텍스처(금속, 거칠기, 노멀)를 받는 설정이 있으면 켬. 면 수를 고를 수 있으면 사람·몬스터 5,000, 보스·건물 8,000–10,000, 소품 1,500–2,000. 면은 대부분 사각형이라 삼각형은 거의 두 배(기사 6,271면 = 삼각형 10,847) |
| 4. 리깅 | Auto Rig. 사람형은 Skeleton Preset을 `UE5 Mannequin`으로 | 사람형이 모두 같은 뼈대라 동작을 같이 씀. 네발짐승은 자동 감지. 움직이지 않는 것은 건너뜀 |
| 5. 동작 | 아래 "동작"의 목록을 모션 라이브러리나 text-to-motion으로 | |
| 6. 받기 | FBX(리깅한 것은 동작 포함) | 1단계의 그림도 PNG로 받아 둠 |

- Tripo의 multi-view 칸(앞, 왼쪽, 뒤, 오른쪽)의 왼쪽·오른쪽이 캐릭터의 왼쪽·오른쪽인지는 확인하지 못했습니다. `_left`는 캐릭터의 왼쪽 옆모습(그림의 오른쪽을 봄)이고, 칸의 미리보기에서 앞 그림과 맞는지 봅니다.
- 결과가 다르면 명세를 다 고치지 말고 한 가지만 바꿔 다시 뽑습니다(Tripo 안내).
- 받은 FBX와 그림은 키 이름(각 제목의 괄호)으로 저장합니다. 엔진으로 가져오는 스크립트는 받은 뒤에 고칩니다.

## 공통 화풍

모든 프롬프트의 대상 설명 뒤에 붙어 있습니다. 기사를 다듬다가 이것을 바꾸면 나머지 프롬프트도 같이 바꿉니다.

```text
stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera
```

## 기준 캐릭터 체크리스트

기사가 아래를 모두 통과하면 그 정면 그림을 기준으로 정합니다.

- 게임 카메라(높은 쿼터뷰)만큼 줄여 봐도 갑옷, 천, 얼굴이 갈려 보임
- 7등신 안팎이고 머리가 너무 크지 않음
- 팔과 몸통, 두 다리 사이가 떨어져 있음(A-pose). 손이 비어 있고 손가락이 갈라짐
- 텍스처에 그림자나 반사가 구워지지 않음(어두운 쪽이 칠로 남지 않음)
- 리깅한 뒤 달리기와 공격 동작에서 어깨, 팔꿈치, 무릎이 찢어지지 않음
- 아이콘(기사의 검, 체력 물약)과 나란히 놓았을 때 같은 게임으로 보임

## 1. 기준 캐릭터: 기사 어라운드 시트

이것부터 만들고, 위의 체크리스트를 통과할 때까지 이 명세만 다듬습니다. 통과한 시트가 나머지 모두의 참고 그림입니다. 저장소 루트에서 Codex에 이렇게 말합니다.

> mmo/art/models/prompts.md를 읽고 기사 어라운드 시트를 만들어라.

- 색은 스킬 아이콘의 기사 색(강철, 진홍, 앤틱 금)과 같습니다. 망토는 넣지 않았습니다(자동 리깅에서 다리와 엉켜 찢어짐).
- 첫 시험(텍스트로 바로 3D)에서 어긋난 것을 고쳤습니다: 강철을 어두운 건메탈로(흰 마네킹처럼 보였음), 얼굴이 보이는 투구로(닫혔음), 손가락이 갈라진 장갑으로(벙어리장갑이었음).
- 2026-11-18: Codex(codex-cli 0.159.3, `codex exec`)가 아래 명세 그대로 한 번에 `source/knight_sheet.png`를 뽑았고(다시 뽑지 않음), `process.py knight`가 `source/views/`의 네 장으로 잘랐습니다. 모습의 키는 시트의 97%쯤이지만 자를 때 85%로 맞춥니다.
- 2026-11-18: 그 네 장을 Tripo의 multi-view에 넣은 결과가 시트와 거의 같았습니다(건메탈 강철, 열린 투구의 얼굴, 갈라진 손가락, 금 테두리, 사슬, A-pose). 6,271면(삼각형 10,847), 텍스처는 1024의 색·금속·거칠기·노멀 넷, UV는 1,512조각으로 잘게 나뉨, 리깅 전입니다(Blender 5.3으로 확인). 텍스트로 바로 만든 첫 시험(4,615 삼각형, 색 한 장, 흰 강철)보다 훨씬 맞습니다.
- 2026-11-18: 같은 모델에 Auto Rig(`UE5 Mannequin`)를 건 FBX는 UE5 마네킹과 같은 이름의 뼈 80개(비틀림 뼈, 손가락 포함)이고, 꼭짓점마다 뼈 넷까지 묶였습니다. 동작은 들어 있지 않았습니다. Blender에서 팔 내리기·앞으로 굽히기·머리 위로 들기, 달리기 보폭, 쪼그려 앉기, 허리 비틀기를 잡아 보니 어깨, 팔꿈치, 무릎이 찢어지지 않았습니다. 쪼그려 앉기(엉덩이 90°)에서만 덧옷과 사슬 치마가 허벅지에 붙어 판자처럼 들립니다(게임의 동작은 그만큼 굽히지 않음).
- 2026-11-18: 면 수를 줄여 다시 만든 것(`tripo_convert_10b1efcc`)은 삼각형 5,451, 한 덩어리, UV 87조각(앞의 1,512보다 훨씬 깔끔), 텍스처는 1024의 색·금속·거칠기·노멀(4096의 ORM `_rm`은 쓰지 않음)이고 뼈대는 같습니다. 다만 자동 리깅이 치마 꼭짓점 72개에 팔 뼈의 가중치(0.1–0.2)를 섞어, 팔을 들면 치마가 찢어지듯 딸려 올라갑니다. 골반 머리보다 낮고 주인 뼈가 팔 사슬이 아닌 꼭짓점에서 팔 사슬(쇄골, 위팔, 아래팔, 손, 손가락)의 가중치를 지우고 남은 것을 1로 맞추면 고쳐집니다(Blender로 확인. 손의 꼭짓점은 건드리지 않음). 가져오는 스크립트가 이것을 합니다.
- 2026-11-18: 이 모델을 `mmo/art/models/knight/`에 두고 `client-unreal/Scripts/export_tripo_characters.py`가 게임의 기사로 냅니다(backlog 107).
- 동작은 Tripo의 모션 라이브러리 대신 Quaternius의 Universal Animation Library 1·2 무료판(CC0)을 씁니다(`MMO_ART_SOURCE`의 `ual1/`, `ual2/`). 뼈 이름은 UE 마네킹 방식이라 52개가 Tripo와 같고, 척추(3개와 5개), 목, 비틀림 뼈, 손바닥뼈가 달라 리타깃합니다.

규칙:

```text
mmo/art/models/prompts.md의 "기사 어라운드 시트" 명세를 imagegen 스킬의 기본 image_gen 도구로 그린다. 이번 세션 내내 다음을 지킨다.

- 명세 그대로 image_gen을 한 번 부른다. 뽑는 크기는 1536×1024이고 투명하지 않다.
- 고른 결과를 mmo/art/models/source/knight_sheet.png로 복사한다. 다른 곳에는 두지 않는다.
- 결과를 직접 열어 보고, 다음 중 하나라도 있으면 그것 한 가지만 고쳐 다시 뽑는다(모두 세 번까지): 모습이 넷이 아님, 모습끼리 겹치거나 닿음, 방향의 차례가 다름, 모습마다 자세·크기·옷이 다름, 얼굴이 가려짐, 글자·화살표·눈금.
- 커밋하지 않고 git 브랜치도 바꾸지 않는다. 저장소의 다른 파일은 고치지 않고, 테스트나 검사도 돌리지 않는다.
- 끝나면 실제로 쓴 명세(다시 뽑았으면 마지막 것)와 다시 뽑은 까닭을 보고한다.
```

### 기사 어라운드 시트 (`knight`, 1.8 m)

```text
Use case: stylized-concept
Asset type: character turnaround sheet used as multi-view input for image-to-3D modeling
Primary request: a young human knight, athletic build about 7 heads tall, short dark-brown hair and a determined face that stays fully visible, open-face steel helmet with a nose guard and short cheek plates that leave the eyes, nose and mouth visible, dark gunmetal steel breastplate and layered pauldrons over a dark crimson padded gambeson, short crimson tabard to mid-thigh, chainmail at the elbows and hips, articulated dark steel gauntlets with five separate fingers, dark steel greaves over brown leather boots, brown leather belt with an antique-bronze buckle, thin antique-gold trim on the pauldron rims, light scratches and worn edges on the steel
Composition/framing: the same character shown four times side by side in one row, evenly spaced with clear white gaps between the figures; left to right: front view, left side view (the character faces the right edge of the image), back view, right side view (the character faces the left edge of the image); identical A-pose in all four views with the arms held about 30 degrees away from the body and empty open hands, identical scale, feet on the same baseline, top of the head at the same height, each figure about 85% of the image height; orthographic, no perspective
Style/medium: stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera
Lighting/mood: flat even diffused lighting from the front, no cast shadows, no strong reflections, no rim light
Constraints: plain pure white background, no ground shadow, no text, no labels, no arrows, no grid, no logos, no watermark, no signature, no weapon, no cape, no props
```

## 2. 직업과 무기

기사 그림을 참고 그림으로 올리고 뽑습니다. 무기는 캐릭터와 따로 만들어 손의 소켓에 붙입니다(무기를 들고 벗는 것이 보이게. 지금은 손의 뼈에 구워 감춤).

### 마법사 (`mage`, 1.8 m)

```text
A young human mage, slender build about 7 heads tall, short black hair and a calm face, deep arcane-blue hooded robe with the hood down, robe split at the front from the waist so both legs in dark trousers stay visible, violet sash at the waist, ember-orange embroidered trim on the hem and cuffs, brown leather belt with small pouches and a bronze clasp, fitted leather bracers and knee-high leather boots, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 색은 마법사 스킬 아이콘(비전의 파랑, 보라, 불꽃 주황)과 같습니다. 로브의 앞을 갈라 두 다리를 보이게 했습니다(통 로브는 리깅에서 다리가 한 덩어리가 됨).

### 검 (`sword`, 길이 1.1 m)

```text
A knight's longsword, straight forged-steel blade with a central fuller, antique-bronze crossguard with slightly curved ends, grip wrapped in dark crimson leather, round bronze pommel, light nicks along the edge, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, full side view pointing up, whole object in frame with a small margin
```

### 지팡이 (`staff`, 길이 1.7 m)

```text
A mage's staff as tall as a person, slightly gnarled dark ash-wood shaft, antique-bronze cap and two bronze bands, an opaque arcane-blue crystal cradled by twisted wooden roots at the top, a short ember-orange cloth ribbon tied below the crystal, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, full side view pointing up, whole object in frame with a small margin
```

- 수정은 불투명으로 적었습니다(Tripo는 투명한 것을 잘 못 만듦). 빛나는 것은 엔진의 머티리얼로 더합니다.

## 3. 몬스터

사냥터 순서입니다. 기사 그림을 참고 그림으로 올립니다. 크기는 게임 안의 키(표현 표)입니다.

### 슬라임 (사냥터 1) (`slime`, 0.7 m)

```text
A slime monster about 0.7 m tall, round dome-shaped body of thick opaque green jelly with a darker green core, a few small bubbles painted on the surface, two small dark eyes and a wide grumpy mouth, slightly flattened base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, neutral standing pose, front view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

- 사람·짐승의 뼈대가 아니라 자동 리깅이 안 될 수 있습니다. 안 되면 리깅 없이 받아 두면 됩니다.

### 버섯 (사냥터 1) (`mushroom`, 1.0 m)

```text
A walking mushroom monster about 1 m tall, thick pale stalk body with two short stubby legs and small arms held slightly away from the body, wide reddish-brown cap with cream spots and a frilled underside, grumpy face on the stalk under the cap, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, neutral standing pose, front view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

### 멧돼지 (사냥터 1) (`boar`, 어깨 1.1 m)

```text
A wild boar about 1.1 m tall at the shoulder, heavy muscular body, coarse dark-brown bristly fur with a stiff black ridge along the spine, two curved ivory tusks, small angry eyes, muddy hooves, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, standing in a neutral pose on four straight legs, three-quarter side view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

### 고블린 (사냥터 2) (`goblin`, 1.3 m)

```text
A goblin warrior about 1.3 m tall, wiry body with slightly long arms, grey-green skin, long pointed ears, sharp yellow eyes, ragged brown leather vest and torn loincloth, crude bone necklace, leather wraps on the shins, a crude wooden club held in the right hand pointing down and away from the leg, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 몬스터의 무기는 손에 쥔 채로 한 메시로 만듭니다(바꿔 들 일이 없음).

### 늑대 (사냥터 2) (`wolf`, 어깨 1.1 m)

```text
A grey dire wolf about 1.1 m tall at the shoulder, larger and more muscular than a normal wolf, thick grey fur darker along the back, pale underbelly, long legs with big paws, bared fangs, yellow eyes, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, standing in a neutral pose on four straight legs, three-quarter side view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

### 고블린 궁수 (사냥터 2) (`goblin_archer`, 1.3 m)

```text
A goblin archer about 1.3 m tall, the same goblin species as the reference, grey-green skin, long pointed ears, hooded brown leather cowl and padded leather vest, quiver of arrows strapped on the back, a short curved wooden bow held in the left hand pointing down and away from the leg, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 고블린 그림도 함께 참고 그림으로 올려 같은 종으로 보이게 합니다.

### 오크 (사냥터 3) (`orc`, 2.0 m)

```text
An orc brute about 2 m tall, hulking build with broad shoulders and thick arms, olive-green skin, protruding lower tusks, black topknot hair, a crude iron pauldron on the left shoulder, studded leather harness across the chest, fur loincloth and iron bracers, a heavy iron cleaver held in the right hand pointing down and away from the leg, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

### 해골 (사냥터 3) (`skeleton`, 1.8 m)

```text
An undead skeleton warrior about 1.8 m tall, thick chunky yellowed bones, small pale-blue lights in the eye sockets, rusted iron open helmet, torn dark cloth hanging from the hips, a rusty notched sword held in the right hand pointing down and away from the leg, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 뼈를 굵게 적었습니다(가는 갈비뼈는 메시가 뭉개짐).

### 트롤 (사냥터 3) (`troll`, 2.6 m)

```text
A forest troll about 2.6 m tall, huge hunched body with long arms hanging to the knees, warty grey-green skin, large nose and small lower tusks, moss and tiny mushrooms growing on the shoulders and back, rough hide loincloth and bone bracelets, a big gnarled log club held in the right hand pointing down and away from the leg, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

### 돌거인 (필드 보스) (`stone_giant`, 4.5 m)

```text
A stone giant field boss about 4.5 m tall, massive hunched humanoid built from stacked dark granite boulders, moss and small plants in the cracks, glowing ember-orange molten light seeping from the cracks in the chest and from the deep eye sockets, enormous rock fists, short thick legs, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose with the arms slightly away from the body, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 빛나는 틈은 텍스처로 받고, 엔진에서 발광을 더합니다.

## 4. 소환수와 펫

기사 그림을 참고 그림으로 올립니다.

### 정령 (마법사의 소환수) (`spirit`, 1.4 m)

```text
A friendly spirit summon about 1.4 m tall, floating humanoid upper body with arms held slightly away from the body, the lower body tapers into one curling wisp instead of legs, smooth opaque pale-blue body with softly glowing light-cyan patterns, calm glowing eyes, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, neutral standing pose, front view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

- 떠다니는 조각은 넣지 않았습니다(따로 떨어진 부분은 메시가 깨짐).

### 고양이 (펫) (`cat`, 0.5 m)

```text
A small pet house cat, slightly chubby, orange tabby fur with a cream chest, big friendly green eyes, a small bronze bell on a red leather collar, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, standing in a neutral pose on four straight legs, three-quarter side view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

### 부엉이 (펫) (`owl`, 0.45 m)

```text
A small round pet owl, fluffy brown and cream feathers with darker speckles, big amber eyes, short ear tufts, wings folded against the body, standing on two small feet, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, neutral standing pose, front view, plain white background, even diffused lighting, whole body filling the frame with a small margin
```

## 5. NPC

기사 그림을 참고 그림으로 올립니다. 모두 1.8 m이고 손은 비웁니다.

### 상인 (`merchant`, 1.8 m)

```text
A middle-aged human merchant, stout build about 7 heads tall, trimmed brown beard, soft green wool cap, green wool tunic with rolled-up sleeves under a brown leather apron, fat coin pouch hanging from the belt, brown trousers and leather shoes, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

### 창고지기 (`keeper`, 1.8 m)

```text
An elderly human warehouse keeper, lean build about 7 heads tall, short grey hair and beard, long brown wool coat over a cream linen shirt, large ring of iron keys hanging from the belt, sturdy leather boots, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

### 제작 장인 (`crafter`, 1.8 m)

```text
A burly human blacksmith and potion crafter, about 7 heads tall, bald head with a thick red-brown beard, sleeveless dark shirt, heavy scorched leather apron, thick leather gloves, a forging hammer and a few small potion vials hanging from the belt, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 제작 NPC가 물약과 장비를 둘 다 만들어 망치와 물약병을 함께 달았습니다.

### 퀘스트 NPC (`quest_giver`, 1.8 m)

```text
An old human sage, slightly hunched, about 7 heads tall, long white beard, deep green robe split at the front over dark trousers, short shoulder mantle with antique-gold trim, brown leather belt with two scroll cases, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

### 경비병 (`guard`, 1.8 m)

```text
A human town guard, sturdy build about 7 heads tall, steel kettle helmet, chainmail shirt under a dark-blue tabard with silver trim, brown leather belt with a sheathed sword at the left hip, round wooden shield with an iron rim strapped on the back, leather gloves and boots, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, A-pose, empty open hands, full body front view, plain white background, even diffused lighting, full body filling the frame with a small margin
```

- 기사(진홍)와 갈리게 파랑으로 했습니다. 칼은 칼집에, 방패는 등에 두어 손을 비웠습니다.

## 6. 마을 건물과 소품

움직이지 않아 리깅하지 않습니다. 기사 그림을 참고 그림으로 올리면 재질의 칠이 맞춰집니다.

### 작은 집 (`house_small`, 너비 6 m)

```text
A small medieval village cottage about 6 m wide, half-timbered walls with white plaster and dark oak beams, grey fieldstone foundation, steep dark-slate roof with a stone chimney, a wooden door and two small shuttered windows, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 큰 집(여관) (`house_large`, 너비 10 m)

```text
A two-storey medieval village inn about 10 m wide, grey stone ground floor with a half-timbered upper floor that overhangs slightly, steep dark-slate roof with two chimneys, wide wooden double door, shuttered windows, an empty wooden sign bracket over the door, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

- 간판은 빈 걸이로 적었습니다(글자가 들어가지 않게).

### 종탑 (`bell_tower`, 너비 3 m)

```text
A square stone bell tower about 3 m wide and 12 m tall, grey fieldstone walls, open arched belfry at the top with a bronze bell, steep dark-slate pyramid roof, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 울타리 (`fence`, 길이 4 m)

```text
A straight section of weathered wooden village fence about 4 m long, three sturdy posts and two horizontal split-log rails tied with rope, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 우물 (`well`)

```text
A round village well, grey fieldstone wall, wooden roof frame with dark-slate shingles, a rope and a wooden bucket on a crank, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 노점 1 (`market_stand`)

```text
A small wooden market stand, sturdy plank counter with a crimson and cream striped cloth awning, a few baskets of apples and bread on the counter, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 노점 2 (`market_stall`)

```text
A wooden market stall with a slanted plank roof and a dark-blue cloth canopy, shelves with clay jars and folded cloth, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 통 (`barrel`)

```text
A wooden barrel, dark oak staves with iron hoops, worn edges, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 상자 (`crate`)

```text
A wooden supply crate, rough planks with iron corner brackets, slightly worn, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 수레 (`cart`)

```text
A two-wheeled wooden hand cart, plank bed with low side boards, iron-rimmed wooden wheels, two long handles resting on the ground, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 벤치 (`bench`)

```text
A simple wooden village bench, thick plank seat on two stout log legs, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 건초 (`hay`)

```text
A rectangular bale of golden hay bound with two ropes, loose straw on the sides, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 자루 (`bags`)

```text
A pile of three burlap grain sacks tied at the top, one leaning on the others, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 가마솥 (`cauldron`)

```text
A black iron cauldron on three short legs over a ring of stones, thick rim, soot stains, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 모닥불 (`bonfire`)

```text
A village campfire, unlit stacked split logs in a ring of grey stones, charred wood with glowing embers in the center, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

- 불꽃은 메시로 만들지 않고 엔진의 이펙트로 더합니다.

## 7. 채집물과 바닥 아이템

채집 소나무는 장식 소나무와 같은 메시를 씁니다(지금과 같음).

### 소나무 (채집, 장식 3종) (`gather_pine`, 키 6 m)

```text
A tall pine tree about 6 m tall, straight dark trunk with rough bark, dense layered clumps of dark-green needles in chunky hand-painted shapes, a few exposed roots at the base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

- 장식용 `tree_pine_1`–`3`은 같은 프롬프트로 세 번 뽑습니다.

### 참나무 (채집) (`gather_oak`, 키 5.5 m)

```text
A broad oak tree about 5.5 m tall, thick twisted trunk, wide rounded canopy made of large chunky clumps of green leaves, exposed roots at the base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 구리 광석 (`gather_copper`, 너비 1.6 m)

```text
A copper ore deposit about 1.6 m wide, a low mound of grey rock with thick veins and protruding nuggets of raw orange-brown copper, a few green oxidized patches, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 철 광석 (`gather_iron`, 너비 1.6 m)

```text
An iron ore deposit about 1.6 m wide, a low mound of dark grey rock with rust-red streaks and protruding chunks of dark metallic iron ore, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 쑥 (`gather_mugwort`, 키 0.8 m)

```text
A clump of wild mugwort herb about 0.8 m tall, many upright stems with deeply serrated silvery-green leaves growing from one base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 인삼 (`gather_ginseng`, 너비 0.9 m)

```text
A wild ginseng plant about 0.9 m wide on a small soil mound, a few stems with five-leaf palm-shaped leaves, a cluster of bright red berries on a central stalk, the pale forked root partly visible above the soil, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 바닥 아이템 (`ground_item`, 너비 0.6 m)

```text
A small brown leather loot pouch about 0.6 m wide, bulging and tied with a cord, a few gold coins peeking out of the opening, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

## 8. 자연

변형은 같은 프롬프트로 여러 번 뽑습니다(괄호 안의 수). 마지막에 합니다.

### 활엽수 (5) (`tree`, 키 5–7.5 m)

```text
A broadleaf tree about 6 m tall, sturdy curved trunk with rough bark, rounded canopy of large chunky clumps of green leaves, a few exposed roots at the base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 자작나무 (2) (`tree_birch`, 키 7 m)

```text
A slender birch tree about 7 m tall, white bark with black streaks, light yellow-green airy canopy of small chunky leaf clumps, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 죽은 나무 (3, 보스 자리) (`tree_dead`, 키 5 m)

```text
A dead tree about 5 m tall, twisted leafless dark-grey trunk and bare crooked branches, cracked bark, scorched black at the base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 바위 (5) (`rock`, 키 1.4 m)

```text
A weathered grey boulder about 1.4 m tall, angular faceted shape, a few cracks, patches of green moss on top, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 큰 바위 (4) (`rock_large`, 너비 4 m)

```text
A large mossy rock formation about 4 m wide, two or three stacked grey boulders, deep cracks, moss and small grass tufts on the top, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 테두리의 산 (3) (`mountain`, 너비 10 m)

```text
A tall rocky cliff outcrop about 10 m wide and 8 m tall, layered grey granite with steep faces, moss and small shrubs on the ledges, flat wide base, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

- 지금은 큰 바위로 대신한 필드 테두리의 막는 산입니다.

### 덤불 (2) (`bush`, 키 1 m)

```text
A rounded green shrub about 1 m tall, dense chunky clumps of small leaves on a few woody stems, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 열매 덤불 (`berries`, 키 0.8 m)

```text
A low rounded berry bush about 0.8 m tall, dark-green chunky leaf clumps dotted with small red berries, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 그루터기 (`stump`)

```text
A mossy tree stump with a few thick roots, cut top showing growth rings, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 통나무 (`log`, 길이 2.4 m)

```text
A fallen mossy log about 2.4 m long, rough bark peeling in places, broken ends, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

### 자갈 (`pebble`)

```text
A small cluster of three mossy grey stones half sunk in the ground, stylized realism for a mobile dark fantasy MMORPG, semi-realistic proportions, hand-painted PBR textures, clearly separated materials (steel, leather, cloth, wood, stone), slightly desaturated natural colors with warm highlights, bold silhouette readable from a high camera, isolated on a plain white background, even studio lighting, three-quarter front view, whole object in frame with a small margin
```

## 동작

게임이 쓰는 동작입니다(지금의 표현 표와 같음). Tripo의 모션 라이브러리(97개)는 RPG에 맞는 것이 적어 기사부터 Universal Animation Library 1·2(CC0)에서 옮깁니다(107. 마법사는 `Spell_Simple_*`, `OverhandThrow`, NPC는 `Idle_Talking_Loop`, `Idle_FoldArms_Loop`, `Idle_Lantern_Loop`, 경비병은 `Idle_Shield_Loop`, 해골은 `Zombie_*`, 고블린·오크는 `Punch_*`, `Melee_Hook`). 아래는 역할마다 필요한 것입니다. 사람형은 같은 뼈대(`UE5 Mannequin`)로 리깅하면 같은 옮기는 스크립트를 씁니다.

| 무엇 | 동작 |
|---|---|
| 기사 | 대기(전투 자세), 달리기, 공격(한 손 검), 스킬, 채집, 귀환(주문서 읽기), 피격, 죽음 |
| 마법사 | 대기(지팡이), 달리기, 공격(지팡이), 스킬, 시전(제자리에서 모음), 채집, 귀환(주문서 읽기), 피격, 죽음 |
| 사람형 몬스터, 정령 | 대기, 걷기, 공격(고블린 궁수는 활 쏘기), 피격, 죽음 |
| 네발짐승 | 대기, 걷기, 공격(멧돼지는 들이받기, 늑대는 물기), 피격, 죽음 |
| 슬라임, 버섯 | 대기, 걷기(통통 뜀), 공격, 피격, 죽음. 리깅이 안 되면 받지 않음 |
| 펫 | 대기, 걷기, 줍기 |
| NPC | 대기, 걷기 |

- 지금 팩에 없던 피격 동작(기사는 107에서 채움, 마법사, 슬라임, 해골)이 채워집니다. 귀환(주문서 읽기)은 UAL에도 없습니다.
- 사람이 아닌 것(네발짐승, 슬라임, 버섯, 펫)은 UAL에 동작이 없어 Tripo의 사족 보행 프리셋이나 다른 CC0 팩을 따로 찾아야 합니다.

## 만들지 않는 것

- 풀, 꽃, 밀, 작은 풀(`grass`, `flower`, `wheat`, `plant_*`, `twig`): 얇은 잎은 Tripo의 메시로 잘 나오지 않습니다. 지금 것을 두거나 엔진의 카드로 만듭니다.
- 땅: 메시가 아니라 땅 텍스처(103)와 높낮이(106)입니다.
- 방어구의 단계별 겉모습: 장비 칸 다섯의 3단계는 지금처럼 겉모습이 바뀌지 않습니다.
