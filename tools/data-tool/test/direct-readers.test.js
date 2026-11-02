import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
import { decode } from '@msgpack/msgpack';
import { convertWorkbook, readWorkbook } from '../src/index.js';
import { fixture, loadPuerts, tscPath } from './helpers.js';

const exec = promisify(execFile);
await mkdir('.test-output', { recursive: true });
const root = await mkdtemp(path.resolve('.test-output/direct-readers-'));
after(() => rm(root, { recursive: true, force: true }));

test('serialization resolves defaults, nulls and numeric types before direct decoding', async () => {
  const file = path.join(root, 'Defaults.xlsx');
  const output = path.join(root, 'out');
  const text = '인용 "값" \\경로\n줄\u2028구분\u2029';
  await fixture(file, [
    [0, 'id', 'int'],
    [2, 'optional', 'string?', 'fallback'],
    [4, 'rewards', 'long[]', '["-9223372036854775808","9223372036854775807"]'],
    [5, 'flags', 'bool[]', '[true,false]'],
    [6, 'text', 'string', text],
    [7, 'amount', 'float', '-0'],
    [8, 'enabled', 'bool', false],
    [9, 'maybeArray', 'int[]?', '[1,2]'],
    [10, 'toString', 'string?'],
    [11, 'valueOf', 'int', 7],
    [12, 'largeFloat', 'float', 4294967296],
    [13, 'largeDouble', 'double', Number.MAX_SAFE_INTEGER],
    [14, 'smallLong', 'long', 1],
    [15, 'maybeLongs', 'long[]?'],
    [4095, 'future', 'uint', 0],
  ], [[1], [2, '["0","1","-1","9007199254740993"]']], ['id', 'maybeLongs']);
  const expected = await readWorkbook(file);
  const result = await convertWorkbook(file, { out: output });
  assert.ok(!result.files.some((name) => name.endsWith('.schema.json') || name.endsWith('_json.ts')));
  const source = path.join(output, 'typescript/node/Defaults.ts');
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', source, path.join(output, 'typescript/puerts/_index.ts')]);
  const outfile = path.join(output, 'node.mjs');
  await build({ entryPoints: [source], outfile, bundle: true, platform: 'node', format: 'esm', target: 'es2020' });
  const node = await import(pathToFileURL(outfile).href);
  const [puerts, esm] = await loadPuerts(output);
  const bytes = await readFile(path.join(output, 'data/Defaults.bytes'));
  const json = await readFile(path.join(output, 'data/Defaults.json'), 'utf8');
  // 빈 칸과 int64 인코딩을 포함해 생성 쪽이 실제로 내보낸 와이어 값을 검증한다.
  assert.deepEqual(decode(bytes, { useBigInt64: true }), expected.indexedRows);
  const decoded = await Promise.all([node.deserializeDefaultsJson(json), ...[node, puerts, esm].map(async (loader) => structuredClone(await loader.deserializeDefaultsMessagePack(bytes)))]);
  for (const rows of decoded) {
    assert.deepEqual(rows, new Map(expected.rows.map((row) => [row.id, row])));
    assert.equal(rows.get(1).amount, 0);
    assert.equal(rows.get(1).toString, null);
    assert.equal(rows.get(1).smallLong, 1n);
    assert.equal(rows.get(1).maybeLongs, null);
    assert.deepEqual(rows.get(2).maybeLongs, [0n, 1n, -1n, 9007199254740993n]);
    rows.get(1).rewards.push(0n);
    rows.get(1).maybeArray.push(9);
    assert.deepEqual(rows.get(2).rewards, [-9223372036854775808n, 9223372036854775807n]);
    assert.deepEqual(rows.get(2).maybeArray, [1, 2]);
  }
});
