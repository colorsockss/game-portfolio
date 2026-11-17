# 실제로 쓴 명세 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다. 가운데가 평평하지 않거나 비율이 다른 것은 뽑은 그림을 편집 대상으로 다시 넣어 한 가지씩 고쳤습니다("Input image: edit target" 줄).

PNG 7개를 [mmo/art/ui/source/](./)에 저장했습니다. 기본 `image_gen`으로 생성하고 alpha를 보존했습니다. 이번 작업에서는 PNG만 추가했으며, 커밋하거나 브랜치를 바꾸지 않았습니다.

직접 열어 확인했습니다. 9-slice 중앙에는 밝기 표준편차 **0.55~0.92/255**의 미세한 픽셀 차이가 남습니다. `npm run check`는 C# 테스트의 소켓 권한 오류로 완료하지 못했습니다. 생성 파일 검사·지도 테스트 28개·Unreal 테스트는 통과했습니다.

파일별 최종 명세는 아래 **공통 블록 + 해당 파일 블록**입니다. 모든 호출에 `transparent_background: true`를 사용했습니다.

```text
Style/medium: game UI sprite for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted antique metal and dark leather; crisp clean edges that stay readable when scaled down
Color palette: dark charcoal brown and near-black, antique gold and aged bronze trim; muted, no neon, no bright saturated colors
Lighting/mood: soft light from the top left; subtle bevel highlights on metal edges; serious, premium
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature; transparent background outside the sprite
```

**[panel.png](panel.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (window and popup frame, 9-slice)
Primary request: a square window panel: dark charcoal-brown leather center framed by an ornate antique gold filigree border with small decorative corner pieces
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: 9-slice: all trim and ornaments within the outer 18% border on every side; the center is one flat, even, dark color with no pattern, no gradient and no texture; transparent background
Canvas size: 1024×1024
Input image: edit target.
Single correction: replace the entire center inside the inner trim with one perfectly flat, opaque dark charcoal-brown color, RGB (28, 21, 18). Every center pixel must have the same color: no grain, mottling, lighting, vignette, gradient, or texture. Preserve the existing border, corner ornaments, square silhouette and transparent exterior.
```

**[button.png](button.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (button, 9-slice; the game multiplies a color over it)
Primary request: a wide rectangular button plate with softly beveled edges and a thin raised rim
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: 9-slice: rim and bevel within the outer 20% border; the center is one flat, even tone with no pattern; grayscale only, light gray to white, no hue (the game tints it); transparent background
Canvas size: 1536×1024
Input image: edit target.
Single correction: make the central face a solid, completely opaque, perfectly uniform matte light-gray surface, RGB (192, 192, 192), alpha 255 throughout. The light-gray area is the button itself and must never be removed as background or made translucent. It must have absolutely no gradient, cloudy shading or transparency. Preserve the surrounding grayscale rim, bevel and silhouette; only the exterior is transparent.
```

**[bar_frame.png](bar_frame.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (horizontal gauge background, 9-slice)
Primary request: a long horizontal gauge trough: a dark recessed groove with an aged bronze metal rim and small rounded end caps
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: 9-slice: the end caps within the outer 15% of the width and the rim within the outer 25% of the height; the inside of the groove is one flat, even near-black; transparent background
Canvas size: 1536×1024, the gauge about 8 times wider than tall
Input image: edit target.
Single correction: increase only the height of the entire gauge sprite by 35%, leaving its width unchanged, so that the visible bronze frame is eight times wider than it is tall. A 1472-pixel-wide visible gauge must be 184 pixels tall, excluding all transparent padding. Keep the same bronze design, flat near-black center and transparent exterior.
```

**[bar_fill.png](bar_fill.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (horizontal gauge fill; the game multiplies a color over it)
Primary request: a long horizontal glossy liquid gauge fill with a soft highlight along the top and slightly darker bottom
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: the same from left to right (no end caps, no breaks), grayscale only, white and light gray, no hue; fills the whole width; transparent background
Canvas size: 1536×1024, the strip about 8 times wider than tall
Input image: edit target.
Single correction: increase only the thickness of the horizontal fill strip so its visible width is eight times its visible height. On the 1536x1024 canvas, the strip runs edge to edge from x=0 to x=1535 and occupies y=416 through y=607, a height of 192 pixels. Keep its clean straight edges and uniform left-to-right white-to-light-gray vertical highlight profile; everything above and below the strip is fully transparent.
```

**[slot.png](slot.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (inventory and quickslot cell, 9-slice)
Primary request: a square inventory slot: a dark recessed inset with a thin aged bronze rim and a subtle inner shadow
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: 9-slice: the rim within the outer 15% border; the center is one flat, even near-black; transparent background
Canvas size: 1024×1024
Input image: edit target.
Single correction: replace the entire center with a perfectly flat, opaque near-black color, RGB (14, 11, 10), identical at every pixel, with no noise, grain, mottling or gradient. Keep the thin bronze rim and its subtle inner shadow strictly within the outer 15% border, with the existing square silhouette and transparent exterior unchanged.
```

**[joystick_base.png](joystick_base.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (virtual joystick base on a touch screen)
Primary request: a round joystick base: a thin aged bronze ring with abstract ornamental engraving and four small notches at the top, bottom, left and right; the inside of the ring is a semi-transparent dark disc
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: a perfect circle centered in the canvas; no arrows, no letters; transparent background
Canvas size: 1024×1024
```

**[joystick_thumb.png](joystick_thumb.png)**

```text
Use case: stylized-concept
Asset type: game UI sprite (virtual joystick knob)
Primary request: a round polished bronze dome knob with an antique gold rim
Composition/framing: front view, flat and orthographic, centered, fills the canvas with a small even transparent margin
Constraints: a perfect circle centered in the canvas, seen straight from the front; transparent background
Canvas size: 1024×1024
```