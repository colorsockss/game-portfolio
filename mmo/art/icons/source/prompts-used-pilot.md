# 실제로 쓴 명세: 시험 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

시험 묶음 5장을 기본 `image_gen`으로 생성해 저장했습니다. 모두 직접 열어 확인했습니다. 스킬은 불투명, 나머지는 투명 PNG입니다.

1024×1024로 요청했지만 반환된 원본은 모두 **1254×1254**입니다. 문서 지시대로 원본을 보존했고, 테스트·검사는 실행하지 않았습니다. 파일별 최종 사용 명세는 아래와 같습니다.

[family_3.png](family_3.png)

```text
Style/medium: inventory item icon for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted digital painting with crisp edges; rich material detail (worn leather, forged steel, aged bronze, glass, gold) that stays readable at 64 pixels
Color palette: natural material colors, slightly desaturated, with warm highlights; no neon
Lighting/mood: soft key light from the top left and a subtle warm rim light so the silhouette reads on a near-black slot
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border, no ground, no cast shadow

Use case: stylized-concept
Asset type: game inventory item icon
Primary request: Knight Sword: a knightly longsword with a polished steel blade, an antique gold crossguard and a dark leather grip
Composition/framing: a single object in a dynamic three-quarter view, centered, filling about 80% of the square canvas; the whole object is visible
Constraints: transparent background
Output size: 1024×1024 pixels
```

[item_potion_hp.png](item_potion_hp.png)

```text
Style/medium: inventory item icon for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted digital painting with crisp edges; rich material detail (worn leather, forged steel, aged bronze, glass, gold) that stays readable at 64 pixels
Color palette: natural material colors, slightly desaturated, with warm highlights; no neon
Lighting/mood: soft key light from the top left and a subtle warm rim light so the silhouette reads on a near-black slot
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border, no ground, no cast shadow

Use case: stylized-concept
Asset type: game inventory item icon
Primary request: HP Potion: a small round glass flask filled with glowing crimson liquid, cork stopper tied with twine
Composition/framing: a single object in a dynamic three-quarter view, centered, filling about 80% of the square canvas; the whole object is visible
Constraints: transparent background
Output size: 1024×1024 pixels
```

[skill_101.png](skill_101.png) — 첫 결과에 인물이 들어가 한 번 다시 생성했습니다.

```text
Style/medium: skill icon for a classic Korean-style dark fantasy MMORPG; dramatic hand-painted digital painting with glowing magical light; bold readable shape at 64 pixels
Color palette: steel silver, crimson and antique gold; dark, smoky background
Lighting/mood: strong glow from the subject, high contrast, epic
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border

Use case: stylized-concept
Asset type: game skill icon, square, full bleed
Primary request: Slash: a single diagonal sword slash leaving a bright silver crescent arc of light
Composition/framing: one bold subject centered, filling the square edge to edge; the background fills the whole canvas
Constraints: opaque square image, no transparency
Output size: 1024×1024 pixels
Subject clarification: show only the sword slash and its bright silver crescent arc against the dark smoky background; no person, warrior, face, body, hand or other character.
```

[effect_1.png](effect_1.png)

```text
Style/medium: small status or menu emblem for a classic Korean-style dark fantasy MMORPG UI; hand-painted antique metal emblem with a glowing accent; very simple bold shape that stays readable at 32 pixels
Color palette: antique gold and aged bronze metal with electric yellow accent
Lighting/mood: soft light from the top left, subtle bevel highlights
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no square frame

Use case: stylized-concept
Asset type: game UI emblem icon
Primary request: Stun: a ring of small golden stars circling, like dizziness
Composition/framing: front view, centered, filling about 85% of the square canvas
Constraints: transparent background
Output size: 1024×1024 pixels
```

[menu_bag.png](menu_bag.png)

```text
Style/medium: small status or menu emblem for a classic Korean-style dark fantasy MMORPG UI; hand-painted antique metal emblem with a glowing accent; very simple bold shape that stays readable at 32 pixels
Color palette: antique gold and aged bronze metal with warm amber accent
Lighting/mood: soft light from the top left, subtle bevel highlights
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no square frame

Use case: stylized-concept
Asset type: game UI emblem icon
Primary request: Bag: a leather pouch with a drawstring and a bronze clasp
Composition/framing: front view, centered, filling about 85% of the square canvas
Constraints: transparent background
Output size: 1024×1024 pixels
```