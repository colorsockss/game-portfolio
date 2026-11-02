# @idle/formula-tool

공식을 편집·시뮬레이션하고 TS로 내보내는 앱입니다(Tauri 2 + SvelteKit + Svelte 5). 주석과 UI는 한국어입니다. 실행은 `npm run tauri dev -w @idle/formula-tool`, Rust 테스트는 `src-tauri`에서 `cargo test`입니다.

- `src/lib/engine`, `export`, `project`는 Svelte·Tauri를 import하지 않습니다. `npm run generate`가 이것만 Node에서 돌립니다.
- 생성기를 바꾸면 루트에서 `npm run generate`를 실행하고 `formulas.ts`를 함께 커밋합니다.
- Big 모드(`numeric: "big"`)에서 `pow`는 `Big.pow`(정수 지수)이고, 쓸 수 없는 함수(`sqrt`, `round`, `ceil`, `rand`, `randInt`)는 `engine/builtins.ts`의 `BIG_UNSUPPORTED` 한 곳에서 정해 진단(`analyze`)과 생성기가 함께 씁니다. number 모드의 `rand`·`pow`는 `Math.random`·`Math.pow`입니다.
- 전투 미리보기는 프로젝트의 `previewSettings` 스크립트를 node로 실행해 JSON을 주고받습니다. 툴에 게임 코드나 결과의 모양을 적지 않습니다(결과는 모양을 모르는 채로 표로 보임).
- Rust에서 파일을 쓸 때는 `files.rs`의 `write_atomic`을 씁니다(`std::fs::write` 금지).
- Rust 명령을 추가하면 `lib.rs`의 `invoke_handler`와 `capabilities/default.json`도 봅니다.
