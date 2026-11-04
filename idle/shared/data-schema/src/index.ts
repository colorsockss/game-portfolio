// data/*.xlsx에서 생성한 테이블 타입과 MessagePack 로더(tables/ 참고)로, 클라이언트와 서버가 함께
// 쓴다. 로더는 호스트 API를 쓰지 않는다: 바이트는 각 호스트가 읽고, TextEncoder/TextDecoder가 없는
// 호스트(PuerTS V8)는 이 패키지를 로드하기 전에 직접 설치한다.
import * as tables from "./tables/_index.js";

export * from "./tables/_index.js";

/** 테이블의 MessagePack 바이트(data/<table>.bytes)를 돌려준다. 파일 접근은 호스트마다 따로 마련한다. */
export type TableReader = (table: string) => Uint8Array | ArrayBuffer | Promise<Uint8Array | ArrayBuffer>;

// 규칙이 쓰는 테이블. 문장(Strings)과 소리(Sounds)는 클라이언트만 쓰고 규칙을 바꾸지 않는다. 패치를 단위로 나눠 낼 때도
// 이 목록이 규칙 테이블과 문장·소리를 가른다(client/TypeScript/tools/data-schema.mjs).
export const RULE_TABLES = [
  "Constants", "Effects", "Heroes", "HeroLevels", "Items", "Monsters", "Projectiles", "Skills", "Stages", "StatUpgrades", "Summons",
  "TutorialSteps",
] as const;

/**
 * 규칙 테이블의 지문: 바이트를 RULE_TABLES 순서로 이은 FNV-1a 32비트(16진수 8자리). 클라이언트와 서버가 같은 테이블로 예측하는지
 * 연결할 때 견준다(protocol의 socketPath).
 */
export function fingerprint(tables: readonly Uint8Array[]): string {
  let hash = 0x811c9dc5;
  for (const bytes of tables) for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// 읽는 테이블. 각각 생성된 `deserialize<이름>MessagePack`으로 풀어 GameData의 `<이름의 첫 글자를 소문자로>`에 둔다. 문장(Strings)과
// 소리(Sounds)는 클라이언트만 쓰지만 테이블은 한곳에서 읽는다. 서버는 그만큼(수 KB)을 더 읽을 뿐이다.
const TABLES = [
  "Constants", "Effects", "Heroes", "HeroLevels", "Items", "Monsters", "Projectiles", "Skills", "Sounds", "Stages", "StatUpgrades", "Strings",
  "Summons", "TutorialSteps",
] as const;

type TableName = (typeof TABLES)[number];
// 규칙 상수(Constants)는 행이 하나인 테이블이라 Map이 아니라 그 행이다.
type Tables = { readonly [N in TableName as Uncapitalize<N>]: Awaited<ReturnType<(typeof tables)[`deserialize${N}MessagePack`]>> };

export async function loadGameData(read: TableReader) {
  const bytes = new Map<string, Uint8Array>();
  const entries = await Promise.all(TABLES.map(async name => {
    const raw = await read(name);
    const view = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    bytes.set(name, view);
    const deserialize = tables[`deserialize${name}MessagePack`] as (bytes: Uint8Array) => Promise<unknown>;
    return [name[0].toLowerCase() + name.slice(1), await deserialize(view)] as const;
  }));
  const version = fingerprint(RULE_TABLES.map(name => bytes.get(name)!));
  return { ...(Object.fromEntries(entries) as Tables), version };
}

export type GameData = Awaited<ReturnType<typeof loadGameData>>;
