# 땅 텍스처 프롬프트 (backlog 103)

Field 레벨의 땅 머티리얼(`M_Ground`)이 구역과 길의 마스크로 섞는 타일 텍스처를 Codex의 `imagegen` 스킬(기본 `image_gen` 도구)로 뽑는 프롬프트입니다. 화풍은 아이콘(100)과 같은 손으로 칠한 판타지 MMO풍이고, 위에서 내려다보는 카메라(13–36 m)에서 맵의 로우폴리 모델(Quaternius)과 어울리게 무늬를 크고 단순하게 둡니다. 저장소 루트에서 Codex에 이렇게 말합니다.

> mmo/art/ground/source/prompts.md를 읽고 표의 그림을 모두 만들어라.

- Codex에 하는 지시는 한국어이고, `image_gen`에 넘기는 명세(코드 블록)는 영어입니다.
- 생성기는 이음매 없는 타일을 정확히 지키지 못해 `process.py`가 이음매를 섞어 지우고 512×512로 줄이며, 밝기에서 노멀 맵(`<이름>_n.png`)을 만듭니다.

## 규칙

```text
mmo/art/ground/source/prompts.md의 표의 그림을 imagegen 스킬의 기본 image_gen 도구로 만든다. 이번 세션 내내 다음을 지킨다.

- 그림 명세마다 "공통 스타일" 블록을 앞에 붙이고, 이어서 "틀"의 <...>를 표의 값으로 채운다.
- 그림 하나에 image_gen 호출 하나다. 뽑는 크기는 1024×1024이고 투명하지 않은 정사각형이다.
- 고른 결과를 mmo/art/ground/source/<파일 이름>으로 복사한다(표의 파일 이름 그대로, PNG). 다른 곳에는 두지 않는다.
- 결과를 직접 열어 보고, 명세와 다르면 한 가지만 고쳐 다시 뽑는다. 원근(지평선, 비스듬한 시점), 한쪽에서 드는 강한 그림자, 한 곳에 몰린 큰 물건, 글자·로고·워터마크가 든 그림은 버린다.
- 커밋하지 않고 git 브랜치도 바꾸지 않는다. 저장소의 다른 파일은 고치지 않고, 테스트나 검사도 돌리지 않는다.
- 끝나면 파일마다 실제로 쓴 명세(다시 뽑았으면 마지막 것)를 보고한다.
```

## 공통 스타일

```text
Style/medium: seamless tileable ground texture for a stylized fantasy MMORPG seen from a high top-down camera; hand-painted digital painting, soft painterly strokes with clear readable shapes, not photographic
Composition/framing: perfectly orthographic top-down view straight at the ground, flat texture filling the whole square, even density everywhere, no focal point, no horizon, no perspective, the pattern must tile seamlessly on all four edges
Lighting/mood: flat even diffuse daylight, no directional shadows, no vignette, no bright spots
Constraints: no text, no letters, no logos, no watermark, no signature, no frame, no border, no objects larger than a twentieth of the image, no characters, no footprints
```

## 틀

```text
Use case: stylized-concept
Asset type: tileable ground texture (albedo)
Primary request: <그림>
Color palette: <색>
```

## 그림

| 파일 이름 | 그림 | 색 |
|---|---|---|
| `grass.png` | short dense meadow grass seen from above, small tufts and blades in varied directions with a few tiny clover leaves, no flowers | fresh medium green with yellow-green highlights and darker blue-green gaps |
| `forest.png` | mossy forest floor seen from above: patches of moss and short grass mixed with a few scattered small dry leaves and twigs | deep green and olive with a little warm brown |
| `dirt.png` | packed dirt road surface seen from above with small scattered pebbles and faint wheel-worn grooves, no grass | warm light brown and ochre with grey pebbles |
| `cobble.png` | old town cobblestone pavement seen from above: irregular rounded stones of similar size, dark mortar gaps with a little moss | warm grey and beige stones with brown-green gaps |
| `scorched.png` | scorched barren ground seen from above: dark cracked earth with ash and small dark rocks, a few faint dim red cracks | charcoal, dark brown and grey with sparse dull red |
