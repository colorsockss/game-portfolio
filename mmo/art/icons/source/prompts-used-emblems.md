# 실제로 쓴 명세: 효과와 메뉴 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

“효과와 메뉴” **7장**을 [source 폴더](./)에 저장했습니다. 모두 직접 열어 확인했으며 알파 채널을 유지했습니다. 1024×1024를 요청했지만 도구가 반환한 원본은 모두 **1254×1254**입니다.

실제 사용한 명세는 아래 공통 블록에 파일별 `<color>`, `<subject>` 값을 넣은 것입니다. 모든 호출에 시험 그림 5장과 `transparent_background: true`를 전달했습니다.

| 파일 | `<color>` | `<subject>` |
|---|---|---|
| `effect_2.png` | icy blue | Slow: a boot bound by blue ice chains |
| `effect_3.png` | emerald green | Defense Up: a shield with a bold upward chevron |
| `effect_4.png` | fiery red | Attack Up: a sword with a bold upward chevron |
| `menu_character.png` | warm amber | Character: a knight helmet seen from the front |
| `menu_skills.png` | arcane blue | Skills: an open spellbook with a small glowing spark |
| `menu_quest.png` | warm amber | Quests: a rolled scroll with a quill |
| `menu_settings.png` | warm amber | Settings: a cogwheel |

```text
Style/medium: small status or menu emblem for a classic Korean-style dark fantasy MMORPG UI; hand-painted antique metal emblem with a glowing accent; very simple bold shape that stays readable at 32 pixels
Color palette: antique gold and aged bronze metal with <color> accent
Lighting/mood: soft light from the top left, subtle bevel highlights
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no square frame

Use case: stylized-concept
Asset type: game UI emblem icon
Primary request: <subject>
Composition/framing: front view, centered, filling about 85% of the square canvas
Constraints: transparent background

Output: one 1024×1024 PNG image with a genuine transparent alpha background. Keep the whole emblem visible with a clean silhouette.
Reference use: the five supplied images are style references only. Match their rich hand-painted material rendering, antique metal, warm highlights and crisp edges; do not copy their objects or composition. Keep this new emblem simple and bold at 32 pixels. Do not reproduce the opaque background of the skill reference.
```

`effect_2.png`는 정면 구도로 한 번 재생성했고, 최종 명세 끝에 다음 문장을 추가했습니다.

```text
Orientation correction: show the boot in a straight-on frontal view, its toe pointing directly toward the viewer and the shaft centered vertically; no three-quarter or side view. Keep all other requirements unchanged.
```

문서 지시대로 저장소 테스트·검사 명령, 후처리, 커밋, 브랜치 변경은 하지 않았습니다.