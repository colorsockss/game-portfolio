# 실제로 쓴 명세: 장비 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

장비 **20장**을 [source 폴더](./)에 저장했습니다. 모두 투명 PNG이며 그림을 직접 확인했습니다. 1024×1024로 요청했지만 생성기가 반환한 원본은 모두 **1254×1254**입니다. 문서 지시에 따라 프로젝트 테스트·검사는 실행하지 않았습니다.

실제로 사용한 명세는 아래 공통 부분에 파일별 `Primary request`를 넣은 것입니다. 모든 호출에 첨부한 다섯 그림과 `transparent_background: true`를 전달했습니다.

```text
Style/medium: inventory item icon for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted digital painting with crisp edges; rich material detail (worn leather, forged steel, aged bronze, glass, gold) that stays readable at 64 pixels
Color palette: natural material colors, slightly desaturated, with warm highlights; no neon
Lighting/mood: soft key light from the top left and a subtle warm rim light so the silhouette reads on a near-black slot
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border, no ground, no cast shadow
Use case: stylized-concept
Asset type: game inventory item icon
Primary request: <PRIMARY_REQUEST>
Composition/framing: a single object in a dynamic three-quarter view, centered, filling about 80% of the square canvas; the whole object is visible
Constraints: transparent background
Output: one 1024x1024 PNG with true transparent alpha; preserve clean antialiased edges.
Reference guidance: use the five attached reference images only for their painting style, material rendering, warm highlights, and level of detail. Do not copy their objects or backgrounds. Depict only the requested equipment.
```

| 파일 | 실제 `Primary request` |
|---|---|
| [family_1.png](family_1.png) | Worn Sword: an old short sword with a chipped, slightly rusty iron blade and a plain iron crossguard |
| [family_2.png](family_2.png) | Steel Sword: a clean steel arming sword with a simple steel crossguard and a brown leather grip |
| [family_4.png](family_4.png) | Oak Staff: a gnarled oak wizard staff with a twisted top |
| [family_5.png](family_5.png) | Crystal Staff: a slender wooden staff topped with a glowing pale blue crystal held by silver prongs |
| [family_6.png](family_6.png) | Archmage Staff: an ornate dark staff with gold filigree crowned by a glowing violet orb |
| [family_7.png](family_7.png) | Leather Cap: a simple brown leather cap with stitched seams |
| [family_8.png](family_8.png) | Iron Helm: an open-faced iron helmet with a nose guard |
| [family_9.png](family_9.png) | Knight Helm: a closed knight great helm with a visor slit and antique gold trim |
| [family_10.png](family_10.png) | Leather Armor: a brown leather jerkin with straps and buckles |
| [family_11.png](family_11.png) | Chain Mail: a chain mail hauberk of interlocking steel rings |
| [family_12.png](family_12.png) | Plate Armor: a polished steel breastplate with pauldrons and antique gold trim |
| [family_13.png](family_13.png) | Leather Gloves: a pair of brown leather gloves |
| [family_14.png](family_14.png) | Iron Gauntlets: a pair of riveted iron gauntlets |
| [family_15.png](family_15.png) | Knight Gauntlets: a pair of articulated steel gauntlets with antique gold trim |
| [family_16.png](family_16.png) | Leather Boots: a pair of brown leather boots with laces |
| [family_17.png](family_17.png) | Iron Boots: a pair of iron-plated boots |
| [family_18.png](family_18.png) | Knight Boots: a pair of steel plate sabatons with antique gold trim |
| [family_19.png](family_19.png) | Copper Ring: a plain copper ring |
| [family_20.png](family_20.png) | Silver Ring: a silver ring set with a small blue sapphire |
| [family_21.png](family_21.png) | Gold Ring: an ornate gold ring set with a red ruby |

`family_4.png`는 불필요한 장식을 없애려고 한 번 다시 생성했으며, 최종 명세 끝에 다음 문장을 추가했습니다.

```text
Correction: make the staff entirely unadorned oak wood, without any gemstones, orbs, or metal fittings.
```