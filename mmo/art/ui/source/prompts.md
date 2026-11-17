# UI 그림 프롬프트 (backlog 99)

Unreal 클라이언트의 창, 버튼, 바, 아이템 칸, 조이스틱 그림을 Codex의 `imagegen` 스킬(기본 `image_gen` 도구)로 뽑는 프롬프트입니다. 저장소 루트에서 Codex에 이렇게 말하면 됩니다.

> mmo/art/ui/source/prompts.md를 읽고 표의 그림을 모두 만들어라.

- Codex에 하는 지시는 한국어이고, `image_gen`에 넘기는 명세(코드 블록)는 영어입니다.
- 생성기는 정확한 픽셀 크기를 지키지 못해 크게 뽑고, `process.py`가 투명 여백을 잘라 최종 크기로 줄입니다(최종본은 `mmo/art/ui/`).
- 게임이 버튼과 바 채움에 색을 곱하므로(누름·고름·체력·마나), 그 둘은 밝기만 있는 그림입니다.

## 규칙

```text
mmo/art/ui/source/prompts.md의 표의 그림을 imagegen 스킬의 기본 image_gen 도구로 만든다. 이번 세션 내내 다음을 지킨다.

- 그림 명세마다 아래 "공통 스타일" 블록을 앞에 붙이고, 이어서 "틀"의 <...>를 표의 값으로 채운다.
- 그림 하나에 image_gen 호출 하나다. n으로 다른 그림을 대신하지 않는다.
- 진짜 투명 배경을 요청하고 alpha를 지킨다.
- 고른 결과를 mmo/art/ui/source/<파일 이름>으로 복사한다(표의 파일 이름 그대로, PNG). 다른 곳에는 두지 않는다.
- 결과를 직접 열어 보고, 명세와 다르면 한 가지만 고쳐 다시 뽑는다. 글자·숫자·로고·워터마크·글자처럼 보이는 문양이 든 그림은 버린다.
  9-slice 그림은 장식이 조건의 바깥 테두리 안에만 있고 가운데가 평평한 단색이어야 한다(늘려도 무늬가 늘어나 보이지 않게).
- 커밋하지 않고 git 브랜치도 바꾸지 않는다. 저장소의 다른 파일은 고치지 않는다.
- 끝나면 파일마다 실제로 쓴 명세(다시 뽑았으면 마지막 것)를 보고한다.
```

## 공통 스타일

```text
Style/medium: game UI sprite for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted antique metal and dark leather; crisp clean edges that stay readable when scaled down
Color palette: dark charcoal brown and near-black, antique gold and aged bronze trim; muted, no neon, no bright saturated colors
Lighting/mood: soft light from the top left; subtle bevel highlights on metal edges; serious, premium
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature; transparent background outside the sprite
```

## 틀

```text
Use case: stylized-concept
Asset type: game UI sprite (<용도>)
Primary request: <그림>
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: <조건>; transparent background
```

## 표

| 파일 | 용도 | 그림 | 조건 | 뽑는 크기 | 최종 크기 |
|---|---|---|---|---|---|
| `panel.png` | window and popup frame, 9-slice | a square window panel: dark charcoal-brown leather center framed by an ornate antique gold filigree border with small decorative corner pieces | 9-slice: all trim and ornaments within the outer 18% border on every side; the center is one flat, even, dark color with no pattern, no gradient and no texture | 1024×1024 | 512×512 |
| `button.png` | button, 9-slice; the game multiplies a color over it | a wide rectangular button plate with softly beveled edges and a thin raised rim | 9-slice: rim and bevel within the outer 20% border; the center is one flat, even tone with no pattern; grayscale only, light gray to white, no hue (the game tints it) | 1536×1024 | 512×144(뽑은 것의 비율 약 3.5:1) |
| `bar_frame.png` | horizontal gauge background, 9-slice | a long horizontal gauge trough: a dark recessed groove with an aged bronze metal rim and small rounded end caps | 9-slice: the end caps within the outer 15% of the width and the rim within the outer 25% of the height; the inside of the groove is one flat, even near-black | 1536×1024, the gauge about 8 times wider than tall | 512×64 |
| `bar_fill.png` | horizontal gauge fill; the game multiplies a color over it | a long horizontal glossy liquid gauge fill with a soft highlight along the top and slightly darker bottom | the same from left to right (no end caps, no breaks), grayscale only, white and light gray, no hue; fills the whole width | 1536×1024, the strip about 8 times wider than tall | 512×64 |
| `slot.png` | inventory and quickslot cell, 9-slice | a square inventory slot: a dark recessed inset with a thin aged bronze rim and a subtle inner shadow | 9-slice: the rim within the outer 15% border; the center is one flat, even near-black | 1024×1024 | 256×256 |
| `joystick_base.png` | virtual joystick base on a touch screen | a round joystick base: a thin aged bronze ring with abstract ornamental engraving and four small notches at the top, bottom, left and right; the inside of the ring is a semi-transparent dark disc | a perfect circle centered in the canvas; no arrows, no letters | 1024×1024 | 512×512 |
| `joystick_thumb.png` | virtual joystick knob | a round polished bronze dome knob with an antique gold rim | a perfect circle centered in the canvas, seen straight from the front | 1024×1024 | 256×256 |
