# 실제로 쓴 명세: 소모품과 재료 (2026-11-17)

`prompts.md`의 규칙대로 Codex(codex-cli 0.159.3, `codex exec`)가 기본 `image_gen`으로 뽑고 보고한 것을 그대로 옮겼습니다.

“소모품과 재료” **25장**을 [source 폴더](./)에 저장했습니다. 모두 직접 확인한 투명 배경 PNG입니다. 1024×1024로 요청했으나 도구가 반환한 원본은 모두 **1254×1254**입니다.

문서 지시에 따라 다른 저장소 파일 수정, 커밋, 브랜치 변경, 테스트·저장소 검사는 하지 않았습니다.

실제로 사용한 최종 명세는 아래 공통 블록의 `<그림>`을 표의 값으로 치환하고, 해당 추가 문구를 끝에 붙인 내용입니다. 모든 호출에 첨부된 시험 그림 5장을 참고 이미지로 전달하고 `transparent_background: true`를 사용했습니다.

```text
Style/medium: inventory item icon for a classic Korean-style dark fantasy MMORPG; semi-realistic hand-painted digital painting with crisp edges; rich material detail (worn leather, forged steel, aged bronze, glass, gold) that stays readable at 64 pixels
Color palette: natural material colors, slightly desaturated, with warm highlights; no neon
Lighting/mood: soft key light from the top left and a subtle warm rim light so the silhouette reads on a near-black slot
Constraints: no text, no letters, no numbers, no runes or symbols that look like writing, no logos or trademarks, no watermark, no signature, no frame, no border, no ground, no cast shadow

Use case: stylized-concept
Asset type: game inventory item icon
Primary request: <그림>
Composition/framing: a single object in a dynamic three-quarter view, centered, filling about 80% of the square canvas; the whole object is visible
Constraints: transparent background

Output: one 1024×1024 PNG with a real alpha channel; all empty space must be fully transparent.
Reference direction: use the five supplied images only as references for painting style, material rendering and lighting. Depict only the requested item, not the objects in the reference images.
```

| 파일 | `<그림>`에 사용한 명세 | 추가 |
|---|---|---|
| `item_potion_hp_greater.png` | Greater HP Potion: a larger ornate glass bottle with a gold neck filled with brightly glowing crimson liquid | — |
| `item_potion_mp.png` | MP Potion: a small round glass flask filled with glowing blue liquid, cork stopper tied with twine | — |
| `item_potion_mp_greater.png` | Greater MP Potion: a larger ornate glass bottle with a gold neck filled with brightly glowing blue liquid | — |
| `item_scroll_recall.png` | Recall Scroll: a rolled parchment scroll tied with a blue ribbon and a softly glowing blue wax seal | — |
| `item_scroll_enchant.png` | Enchant Scroll: a rolled parchment scroll with a golden wax seal surrounded by small golden sparkles | — |
| `item_skillbook_knight.png` | Knight Skill Book: a thick leather-bound tome with steel corner plates and a crossed-swords emblem on the cover | — |
| `item_skillbook_mage.png` | Mage Skill Book: a thick violet tome with gold corners and a glowing blue crystal set in the cover | — |
| `item_pet_cat_bell.png` | Cat Bell: a small brass bell on a red ribbon | — |
| `item_pet_owl_feather.png` | Owl Feather: a single soft brown owl feather | — |
| `item_gold.png` | Gold: a small pile of gold coins | — |
| `item_jelly.png` | Sticky Jelly: a glossy blob of translucent green jelly | — |
| `item_mushroom_cap.png` | Mushroom Cap: a single red-brown mushroom cap with pale spots | — |
| `item_boar_tusk.png` | Boar Tusk: a curved ivory boar tusk | B |
| `item_goblin_earring.png` | Goblin Earring: a crude brass hoop earring with a small tooth charm | A |
| `item_wolf_pelt.png` | Wolf Pelt: a folded grey wolf pelt | A, C |
| `item_broken_arrow.png` | Broken Arrow: a wooden arrow snapped in two, with grey feather fletching | A |
| `item_orc_tooth.png` | Orc Tooth: a large yellowed fang | A |
| `item_old_bone.png` | Old Bone: an old cracked bone | A |
| `item_troll_blood.png` | Troll Blood: a small glass vial of dark green blood with a cork | A, D |
| `item_pine_log.png` | Pine Log: a short pine log with rough bark | A |
| `item_copper_ore.png` | Copper Ore: a chunk of rock with veins of orange copper ore | A |
| `item_mugwort.png` | Mugwort Leaf: a sprig of silvery green mugwort leaves | A |
| `item_oak_log.png` | Oak Log: a short oak log with thick dark bark | A |
| `item_iron_ore.png` | Iron Ore: a chunk of dark grey rock with metallic iron flecks | A |
| `item_ginseng.png` | Ginseng Root: a pale forked ginseng root with a few leaves | A, E |

추가 문구 A는 참고 그림의 불필요한 장식이 따라오는 것을 막기 위한 명세입니다.

```text
Subject fidelity: the reference style must not introduce additional decorative components into the requested object.
```

B는 멧돼지 엄니를 다시 생성할 때 사용했습니다.

```text
Correction: show a plain natural ivory boar tusk only; remove all metal fittings, cord and tassels.
```

C는 늑대 가죽의 여백을 수정할 때 사용했습니다.

```text
Framing correction: reduce the entire folded pelt uniformly so all fur tips fit within the central 80% of the square, with at least 10% fully transparent margin on every side.
```

D는 트롤 피의 병 형태를 수정할 때 사용했습니다.

```text
Subject correction: depict a plain, narrow cylindrical glass sample vial with a simple cork stopper, filled with dark green blood. The vial has no metal mounts or cord; keep its slim cylindrical silhouette distinct from the round potion bottle in the style reference.
```

E는 인삼 주변 배경을 제거하도록 다시 요청할 때 사용했습니다.

```text
Background correction: remove all haze, glow, aura, gradient and painted backdrop outside the root and leaf surfaces. All empty space must have alpha 0, including every gap between the root tendrils and between the leaves.
```