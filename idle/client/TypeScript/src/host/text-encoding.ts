// PuerTS V8에는 TextEncoder/TextDecoder가 없는데, MessagePack(protocol과 data-schema 안)은
// 로드되자마자 둘을 만든다. main.ts가 이 모듈을 가장 먼저 import해서 어떤 패키지보다 먼저 생기게 한다.
// import는 순서대로 실행되므로 폴리필이 `global`을 찾기 전에 `global`이 놓인다.
import "./global.js";
import "fast-text-encoding";
