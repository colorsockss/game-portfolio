# 실제로 쓴 명세: 행동 (2026-11-18)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

“행동” 5장을 [source 폴더](./)에 저장했습니다. 모두 직접 열어 확인했고 알파 채널을 보존했습니다. **1024×1024를 요청했지만 반환된 원본은 모두 1254×1254**입니다.

문서 지시대로 후처리·테스트·검사·커밋·브랜치 변경은 하지 않았습니다.

실제 최종 명세는 아래 공통 블록에 파일별 값을 넣고, 해당 추가 문장을 붙인 것입니다. 모든 호출에 시험 그림 5장과 `transparent_background: true`를 전달했습니다.

| 파일 | `<color>` | `<subject>` |
|---|---|---|
| `action_attack.png` | crimson red | Attack: two crossed swords |
| `action_auto.png` | emerald green | Auto Hunt: a circular arrow loop around a small sword |
| `action_target.png` | crimson red | Target: a crosshair reticle with four inward-pointing notches |
| `action_interact.png` | warm amber | Interact: an open gauntleted hand reaching forward |
| `action_force.png` | fiery red | Force Attack: a single sword with a red glowing blade and a small flame |

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

`action_attack.png`는 검 형태를 바꿔 한 번 재생성했으며, 최종 명세에 다음을 추가했습니다.

```text
Design correction: change only the sword designs to two original broad, straight bronze blades with simple straight gold crossguards and plain rounded pommels. Do not duplicate the distinctive winged crossguard, blade profile or decorated pommel of the reference longsword. Keep all other requirements unchanged.
```

`action_auto.png`의 추가 문장:

```text
Sword design: use an original compact sword with a plain straight crossguard and simple rounded pommel, distinct from the reference longsword.
```

`action_force.png`의 추가 문장:

```text
Sword design: use an original broad straight sword with a plain straight crossguard and simple rounded pommel, distinct from the reference longsword.
```

`action_target.png`와 `action_interact.png`에는 추가 문장이 없습니다.