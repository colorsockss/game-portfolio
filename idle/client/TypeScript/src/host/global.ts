// fast-text-encoding은 `global`(또는 `window`)에 설치되는데, PuerTS V8에는 둘 다 없고 globalThis만 있다.
const root = globalThis as typeof globalThis & { global?: typeof globalThis };
if (typeof root.global === "undefined") root.global = globalThis;
export {};
