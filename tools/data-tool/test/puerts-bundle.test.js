import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { convertWorkbook, readWorkbook } from '../src/index.js';
import { fixture, allTypesSchema, allTypesRows, bundlePuerts, loadPuerts, tscPath } from './helpers.js';

const exec = promisify(execFile);
await mkdir('.test-output', { recursive: true });
const root = await mkdtemp(path.resolve('.test-output/puerts-typescript-'));
after(() => rm(root, { recursive: true, force: true }));

async function assertLoaders(output, expected) {
  for (const loaders of await loadPuerts(output)) {
    assert.deepEqual(Object.keys(loaders).sort(), Object.keys(expected).map((name) => `deserialize${name}MessagePack`).sort());
    for (const [name, rows] of Object.entries(expected)) {
      const bytes = await readFile(path.join(output, 'data', `${name}.bytes`));
      assert.deepEqual(structuredClone(await loaders[`deserialize${name}MessagePack`](bytes)), new Map(rows.map((row) => [row.id, row])));
    }
  }
}

test('generated TypeScript retains every table and shares one runtime in the game bundle', async () => {
  const items = path.join(root, 'incremental/Items.xlsx');
  const monsters = path.join(root, 'incremental/Monsters.xlsx');
  const output = path.join(root, 'incremental/out');
  await fixture(items, allTypesSchema, allTypesRows);
  await fixture(monsters, [[0, 'id', 'int'], [1, 'name', 'string']], [[1, '초록 슬라임 🟢']]);
  const result = await convertWorkbook(items, { out: output });
  assert.equal(result.files.length, 15);
  await convertWorkbook(monsters, { out: output });
  const monsterRows = (await readWorkbook(monsters)).rows;
  await assertLoaders(output, { Items: (await readWorkbook(items)).rows, Monsters: monsterRows });
  assert.deepEqual((await readdir(output)).sort(), ['data', 'typescript']);
  assert.deepEqual((await readdir(path.join(output, 'typescript/puerts'))).sort(), ['Items.ts', 'Monsters.ts', '_index.ts', 'runtime']);
  for (const bundle of Object.values(await bundlePuerts(output))) {
    assert.equal((bundle.match(/function readMessagePack\(/g) ?? []).length, 1, 'shared runtime should be included once');
  }

  const monsterData = await readFile(path.join(output, 'data/Monsters.bytes'));
  const monsterSource = await readFile(path.join(output, 'typescript/puerts/Monsters.ts'));
  await fixture(items, [...allTypesSchema, [27, 'flavor', 'string?']], allTypesRows);
  await convertWorkbook(items, { out: output });
  await assertLoaders(output, { Items: (await readWorkbook(items)).rows, Monsters: monsterRows });
  assert.deepEqual(await readFile(path.join(output, 'data/Monsters.bytes')), monsterData);
  assert.deepEqual(await readFile(path.join(output, 'typescript/puerts/Monsters.ts')), monsterSource);
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', path.join(output, 'typescript/puerts/_index.ts')]);
});

test('entry generation ignores custom sources and preserves their files', async () => {
  const first = path.join(root, 'custom/First.xlsx');
  const second = path.join(root, 'custom/Second.xlsx');
  const output = path.join(root, 'custom/out');
  await fixture(first, [[0, 'id', 'int']], [[1]]);
  await fixture(second, [[0, 'id', 'int']], [[2]]);
  await convertWorkbook(first, { out: output });
  await writeFile(path.join(output, 'typescript/puerts/Custom.ts'), 'custom source');
  await convertWorkbook(second, { out: output });
  await assertLoaders(output, { First: [{ id: 1 }], Second: [{ id: 2 }] });
  assert.equal(await readFile(path.join(output, 'typescript/puerts/Custom.ts'), 'utf8'), 'custom source');
});

test('aggregate entry does not collide with GameData or Index tables', async () => {
  const output = path.join(root, 'names/out');
  for (const [name, id] of [['GameData', 1], ['Index', 2]]) {
    const file = path.join(root, 'names', `${name}.xlsx`);
    await fixture(file, [[0, 'id', 'int']], [[id]]);
    await convertWorkbook(file, { out: output });
  }
  await assertLoaders(output, { GameData: [{ id: 1 }], Index: [{ id: 2 }] });
});

test('each target includes its runtime without rewriting unchanged shared files', async () => {
  const input = path.join(root, 'runtime/Items.xlsx');
  const output = path.join(root, 'runtime/generated');
  await fixture(input, [[0, 'id', 'int']], [[1]]);
  await convertWorkbook(input, { out: output });
  const originals = new Map();
  for (const target of ['node', 'portable', 'puerts']) {
    const directory = path.join(output, 'typescript', target, 'runtime');
    const names = (await readdir(directory)).sort();
    assert.deepEqual(names, target !== 'puerts'
      ? ['THIRD_PARTY_NOTICES.txt', 'messagepack.ts']
      : ['THIRD_PARTY_NOTICES.txt', 'environment.ts', 'messagepack.ts', 'puerts.ts']);
    for (const name of names) {
      const file = path.join(directory, name);
      await utimes(file, new Date('2000-01-01'), new Date('2000-01-01'));
      originals.set(file, { bytes: await readFile(file), modified: (await stat(file)).mtimeMs });
    }
  }
  await fixture(input, [[0, 'id', 'int']], [[2]]);
  await exec(process.execPath, ['src/cli.js', input, '--out', output]);
  for (const [file, original] of originals) {
    assert.deepEqual(await readFile(file), original.bytes);
    assert.equal((await stat(file)).mtimeMs, original.modified);
  }
  await assertLoaders(output, { Items: [{ id: 2 }] });
  // 오래된 지원 파일은 내용이 다르면 새로 쓴다.
  const decoder = path.join(output, 'typescript/puerts/runtime/messagepack.ts');
  await writeFile(decoder, '// obsolete shared decoder');
  await convertWorkbook(input, { out: output });
  assert.deepEqual(await readFile(decoder), originals.get(decoder).bytes);
});

test('shared PuerTS initialization preserves native UTF-8 implementations', async () => {
  const input = path.join(root, 'native/Items.xlsx');
  const output = path.join(root, 'native/out');
  await fixture(input, [[0, 'id', 'int'], [1, 'name', 'string']], [[1, '한글 😀 ' + '가'.repeat(256)]]);
  await convertWorkbook(input, { out: output });
  const { commonjs } = await bundlePuerts(output);
  const context = vm.createContext({ module: { exports: {} }, Uint8Array, ArrayBuffer, TextEncoder, TextDecoder });
  vm.runInContext(commonjs, context);
  assert.equal(context.TextEncoder, TextEncoder);
  assert.equal(context.TextDecoder, TextDecoder);
  const expected = new Map((await readWorkbook(input)).rows.map((row) => [row.id, row]));
  assert.deepEqual(structuredClone(await context.module.exports.deserializeItemsMessagePack(await readFile(path.join(output, 'data/Items.bytes')))), expected);
});

test('incremental conversion rejects differently capitalized existing table names before writing', async () => {
  const input = path.join(root, 'case/Items.xlsx');
  const output = path.join(root, 'case/out');
  await fixture(input, [[0, 'id', 'int']], [[1]]);
  await convertWorkbook(input, { out: output });
  const index = path.join(output, 'typescript/puerts/_index.ts');
  const original = await readFile(index);
  await assert.rejects(convertWorkbook(input, { out: output, table: 'ITEMS' }), /conflicts with existing generated table/);
  assert.deepEqual(await readFile(index), original);
});
