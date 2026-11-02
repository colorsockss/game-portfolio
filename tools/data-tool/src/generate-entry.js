import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { GENERATED_HEADER } from './generate-typescript.js';

// tables: 이번에 변환하는 테이블. 출력 폴더에 이미 생성된 다른 테이블도 함께 내보낸다.
export async function generateEntry(directory, converted) {
  const tables = new Set(converted);
  const lower = new Map(converted.map((name) => [name.toLowerCase(), name]));
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/^[A-Z][A-Za-z0-9_]*\.ts$/.test(entry.name) || tables.has(entry.name.slice(0, -3))) continue;
    const contents = await readFile(path.join(directory, entry.name), 'utf8');
    if (!contents.startsWith(GENERATED_HEADER)) continue;
    const name = entry.name.slice(0, -3);
    if (lower.has(name.toLowerCase())) {
      throw new Error(`Table '${lower.get(name.toLowerCase())}' conflicts with existing generated table '${name}'. Use the same capitalization.`);
    }
    tables.add(name);
  }
  return `${GENERATED_HEADER}\n${[...tables].sort().map((name) => `export * from './${name}.js';`).join('\n')}\n`;
}
