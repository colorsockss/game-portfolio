import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// 고정 지원 코드는 각 대상의 생성된 테이블과 함께 내보낸다.
const messagepack = `// 생성된 로더가 함께 쓴다. 워크북 내용과 무관하다.
import { decode } from '@msgpack/msgpack';

export function readMessagePack(bytes: Uint8Array | ArrayBuffer): unknown[][] {
  return decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), { useBigInt64: true }) as unknown[][];
}
`;

const puerts = `// 공용 MessagePack 디코더를 불러오기 전에 UTF-8 지원을 초기화한다.
import './environment.js';
import 'fast-text-encoding';
export { readMessagePack } from './messagepack.js';
`;

const environment = `// PuerTS 엔진에는 \`window\`도 Node의 \`global\` 별칭도 없을 수 있다.
// UTF-8 폴리필은 \`global\`을 통해 없는 TextEncoder/TextDecoder를 설치한다.
const root = globalThis as typeof globalThis & { global?: typeof globalThis };
if (typeof root.global === 'undefined') root.global = globalThis;
export {};
`;

export async function runtimeFiles() {
  const [messagepackLicense, encodingLicense] = await Promise.all([
    readFile(path.join(path.dirname(require.resolve('@msgpack/msgpack/package.json')), 'LICENSE'), 'utf8'),
    readFile(path.join(path.dirname(require.resolve('fast-text-encoding/package.json')), 'LICENSE'), 'utf8'),
  ]);
  const messagepackNotice = `@msgpack/msgpack\n${messagepackLicense}`;
  return new Map([
    ['typescript/node/runtime/messagepack.ts', messagepack],
    ['typescript/node/runtime/THIRD_PARTY_NOTICES.txt', messagepackNotice],
    ['typescript/portable/runtime/messagepack.ts', messagepack],
    ['typescript/portable/runtime/THIRD_PARTY_NOTICES.txt', messagepackNotice],
    ['typescript/puerts/runtime/messagepack.ts', messagepack],
    ['typescript/puerts/runtime/puerts.ts', puerts],
    ['typescript/puerts/runtime/environment.ts', environment],
    ['typescript/puerts/runtime/THIRD_PARTY_NOTICES.txt', `${messagepackNotice}\n\nfast-text-encoding\n${encodingLicense}`],
  ]);
}
