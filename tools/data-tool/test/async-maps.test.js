import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
import { convertWorkbook, readWorkbook } from '../src/index.js';
import { fixture, loadPuerts, tscPath } from './helpers.js';

const exec = promisify(execFile);
await mkdir('.test-output', { recursive: true });
const root = await mkdtemp(path.resolve('.test-output/async-maps-'));
after(() => rm(root, { recursive: true, force: true }));

test('all TS loaders return async Maps keyed by the typed id, including nonzero indices and empty tables', async () => {
  const checks = [];
  for (const [table, type, keys, keyType] of [
    ['Numeric', 'int', [0, -3, 42], 'number'],
    ['Unsigned', 'uint', [0, 4294967295], 'number'],
    ['Text', 'string', ['01', '1', '__proto__', '한글'], 'string'],
    ['Large', 'long', ['0', '9007199254740993', '-9223372036854775808'], 'bigint'],
    ['Empty', 'int', [], 'number'],
  ]) {
    const input = path.join(root, `${table}.xlsx`);
    const output = path.join(root, table);
    await fixture(input, [[4, 'id', type], [0, 'name', 'string']], keys.map((id, i) => [`row ${i}`, id]), ['name', 'id']);
    await convertWorkbook(input, { out: output });
    const expected = new Map((await readWorkbook(input)).rows.map((row) => [row.id, row]));
    const source = path.join(output, 'typescript/node', `${table}.ts`);
    const outfile = path.join(output, 'node.mjs');
    await build({ entryPoints: [source], outfile, bundle: true, platform: 'node', format: 'esm', target: 'es2020' });
    const node = await import(pathToFileURL(outfile).href);
    const bytes = await readFile(path.join(output, 'data', `${table}.bytes`));
    const json = await readFile(path.join(output, 'data', `${table}.json`), 'utf8');
    const loaders = [node, ...await loadPuerts(output)];
    const pending = [
      ...loaders.map((loader) => loader[`deserialize${table}MessagePack`](bytes)),
      node[`deserialize${table}Json`](json),
      node[`load${table}MessagePack`](path.join(output, 'data', `${table}.bytes`)),
      node[`load${table}Json`](path.join(output, 'data', `${table}.json`)),
    ];
    for (const promise of pending) {
      assert.equal(typeof promise.then, 'function');
      const result = structuredClone(await promise);
      assert.ok(result instanceof Map);
      assert.deepEqual(result, expected);
      assert.deepEqual([...result.keys()], [...expected.keys()]);
      assert.equal(result.get('missing key'), undefined);
      for (const [id, row] of expected) {
        assert.deepEqual(result.get(id), row);
        assert.equal(result.get(typeof id === 'string' ? Number(id) : String(id)), undefined);
      }
    }
    const consumer = path.join(output, 'consumer.ts');
    await writeFile(consumer, `import { deserialize${table}Json, deserialize${table}MessagePack, type ${table}Row } from './typescript/node/${table}.js';
import { deserialize${table}MessagePack as puerts } from './typescript/puerts/${table}.js';
export async function read(bytes: Uint8Array, json: string) {
  const values: Map<${keyType}, ${table}Row>[] = await Promise.all([deserialize${table}Json(json), deserialize${table}MessagePack(bytes), puerts(bytes)]);
  // @ts-expect-error Map keys have a concrete scalar type, never boolean.
  values[0].get(true);
  return values;
}
`);
    checks.push(consumer);
  }
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', ...checks]);
});

for (const [name, schema, rows, message] of [
  ['missing', [[0, 'name', 'string']], [['a'], ['b']], /a table needs an 'id' field/],
  ['nullable', [[0, 'id', 'int?']], [[1]]],
  ['array', [[0, 'id', 'int[]']], [['[1]']]],
  ['boolean', [[0, 'id', 'bool']], [[true]]],
  ['float', [[0, 'id', 'float']], [[1.5]]],
]) {
  test(`rejects ${name} id before generating a Map loader`, async () => {
    const input = path.join(root, `invalid-${name}.xlsx`);
    const out = path.join(root, `invalid-${name}`);
    await fixture(input, schema, rows);
    await assert.rejects(convertWorkbook(input, { out, table: 'Invalid' }), message ?? /Map key 'id' must be/);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
}

for (const [type, values] of [
  ['int', [1, '01']], ['uint', [0, '-0']],
  ['long', ['9007199254740993', '+9007199254740993']], ['string', ['same', 'same']],
]) {
  test(`rejects duplicate ${type} ids after normalization`, async () => {
    const input = path.join(root, `duplicate-${type}.xlsx`);
    const out = path.join(root, `duplicate-${type}`);
    await fixture(input, [[0, 'id', type]], values.map((id) => [id]));
    await assert.rejects(convertWorkbook(input, { out, table: 'Invalid' }), /Duplicate id .* in First rows 2 and 3/);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
}

test('duplicate ids report Excel row numbers across blank rows', async () => {
  const input = path.join(root, 'blank-rows.xlsx');
  await fixture(input, [[0, 'id', 'int']], [[1], [], [2], [], [1]]);
  await assert.rejects(convertWorkbook(input, { out: path.join(root, 'blank-rows'), table: 'Invalid' }), /Duplicate id '1' in First rows 2 and 6/);
});

test('duplicate default ids preserve previously published data and loaders', async () => {
  const input = path.join(root, 'Stable.xlsx');
  const out = path.join(root, 'stable');
  const schema = [[0, 'id', 'int', 7], [1, 'name', 'string']];
  await fixture(input, schema, [[1, 'first'], [2, 'second']]);
  const result = await convertWorkbook(input, { out });
  const original = await Promise.all(result.files.map((file) => readFile(file)));
  await fixture(input, schema, [[null, 'first'], [null, 'second']]);
  await assert.rejects(convertWorkbook(input, { out }), /Duplicate id '7'/);
  for (const [i, file] of result.files.entries()) assert.deepEqual(await readFile(file), original[i]);
});
