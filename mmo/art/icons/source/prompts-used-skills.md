# 실제로 쓴 명세: 스킬 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

스킬 **11장**을 `mmo/art/icons/source/`에 저장했습니다. 모두 직접 열어 확인했으며 불투명 PNG입니다. 요청 크기는 1024×1024, 실제 반환된 원본은 1254×1254입니다.

문서 규칙에 따라 테스트·검사, 커밋, 브랜치 변경은 하지 않았습니다.

실제로 사용한 명세는 아래 블록에 파일별 값을 넣은 것입니다. 재생성은 없었고, 모든 호출에 시험 그림 5장과 `transparent_background: false`를 전달했습니다.

```text
Style/medium: skill icon for a classic Korean-style dark fantasy MMORPG; dramatic hand-painted digital painting with glowing magical light; bold readable shape at 64 pixels
Color palette: <COLOR>; dark, smoky background
Lighting/mood: strong glow from the subject, high contrast, epic
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border

Use case: stylized-concept
Asset type: game skill icon, square, full bleed
Primary request: <SUBJECT>
Composition/framing: one bold subject centered, filling the square edge to edge; the background fills the whole canvas
Constraints: opaque square image, no transparency
Canvas size: 1024x1024
Reference images: use the five attached trial images only as style references, not as objects to copy. Match their painterly brushwork, rich material rendering, dramatic contrast and dark fantasy atmosphere; the slash image is the reference for the full-bleed skill presentation.
```

`<COLOR>`는 기사(102–106)에 `steel silver, crimson and antique gold`, 마법사(201–206)에 `arcane blue, violet and ember orange`를 사용했습니다.

| 파일 | 실제 `<SUBJECT>` |
|---|---|
| [skill_102.png](skill_102.png) | Bash: a heavy sword pommel strike with a bright impact burst and small stars |
| [skill_103.png](skill_103.png) | Guard: a glowing golden kite shield |
| [skill_104.png](skill_104.png) | Whirl: a sword spinning in a circular whirlwind of silver light |
| [skill_105.png](skill_105.png) | Hobble: a sword cutting low across an armored boot with a red slash |
| [skill_106.png](skill_106.png) | Fury: a clenched steel gauntlet wreathed in roaring red flames |
| [skill_201.png](skill_201.png) | Bolt: a glowing arcane missile of blue-violet energy streaking forward |
| [skill_202.png](skill_202.png) | Meteor: a flaming meteor falling from a dark sky |
| [skill_203.png](skill_203.png) | Heal: an open hand surrounded by soft green and gold healing light |
| [skill_204.png](skill_204.png) | Frost: a burst of sharp blue ice crystals |
| [skill_205.png](skill_205.png) | Pyro: a blazing fireball |
| [skill_206.png](skill_206.png) | Summon Spirit: a ghostly pale blue spirit rising from a glowing circle |