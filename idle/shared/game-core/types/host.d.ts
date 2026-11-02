// console은 game-core가 도는 모든 호스트(PuerTS, Node, 브라우저)에 있으며, 생성된 공식이 디버그
// 모드에서 이것으로 로그를 남긴다. 다른 호스트 API는 선언하지 않아서 공용 규칙이 쓸 수 없다.
declare const console: {
  log(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
};
