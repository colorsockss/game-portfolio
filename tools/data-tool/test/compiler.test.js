import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { encode, decode } from '@msgpack/msgpack';
import { build } from 'esbuild';
import { convertWorkbook, readWorkbook } from '../src/index.js';
import { parseType, parseValue } from '../src/types.js';
import { fixture, allTypesSchema, allTypesRows, loadPuerts, tscPath } from './helpers.js';
import { mkdir } from 'node:fs/promises';

const exec = promisify(execFile);
await mkdir('.test-output', { recursive: true });
const dir = await mkdtemp(path.resolve('.test-output/compiler-'));
after(() => rm(dir, { recursive: true, force: true }));

test('end-to-end: indexed wire format, strict TS, Node and PuerTS decoders', async () => {
  const file = path.join(dir, 'Types.xlsx');
  await fixture(file, allTypesSchema, allTypesRows);
  const output = path.join(dir, 'out');
  const result = await convertWorkbook(file, { out: output });
  assert.equal(result.rowCount, 2);
  const source = await readWorkbook(file);
  const expected = new Map(source.rows.map((row) => [row.id, row]));
  const json = await readFile(path.join(output, 'data/Types.json'), 'utf8');
  const bytes = await readFile(path.join(output, 'data/Types.bytes'));
  const indexed = decode(bytes, { useBigInt64: true });
  assert.deepEqual(indexed, source.indexedRows);
  assert.equal(indexed[0][14], null);
  assert.equal(indexed[0][2], -9223372036854775808n);
  assert.equal(JSON.parse(json)[1].large, '9223372036854775807');
  assert.ok(bytes.byteLength < Buffer.byteLength(json));

  const tsFiles = ['typescript/node/Types.ts', 'typescript/puerts/_index.ts'].map((f) => path.join(output, f));
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', ...tsFiles]);
  const compiled = path.join(output, 'node.mjs');
  await build({ entryPoints: [tsFiles[0]], outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'es2020' });
  const node = await import(pathToFileURL(compiled).href);
  assert.deepEqual(await node.deserializeTypesJson(json), expected);
  assert.deepEqual(await node.deserializeTypesMessagePack(bytes), expected);
  assert.deepEqual(await node.loadTypesMessagePack(path.join(output, 'data/Types.bytes')), expected);
  assert.deepEqual(await node.loadTypesJson(path.join(output, 'data/Types.json')), expected);

  const [puerts, puertsEsm] = await loadPuerts(output);
  assert.equal('deserializeTypesJson' in puerts, false);
  assert.deepEqual(structuredClone(await puerts.deserializeTypesMessagePack(new Uint8Array(bytes))), expected);
  const backing = Uint8Array.from(bytes).buffer;
  assert.deepEqual(structuredClone(await puerts.deserializeTypesMessagePack(backing)), expected);
  assert.equal('deserializeTypesJson' in puertsEsm, false);
  assert.deepEqual(await puertsEsm.deserializeTypesMessagePack(bytes), expected);
  assert.equal((await readdir(path.join(output, 'typescript/puerts'))).includes('_json.ts'), false);
  assert.equal((await readdir(path.join(output, 'typescript/node'))).includes('_json.ts'), false);
  assert.equal((await readdir(output)).includes('schema'), false);
  assert.equal((await readdir(output)).includes('puerts'), false);
  assert.ok(result.files.every((filename) => !/\.(m?js)$/.test(filename)));
  assert.equal('TypesSchema' in node, false);
  assert.equal('TypesSchema' in puerts, false);
  assert.deepEqual((await readdir(output)).sort(), ['data', 'node.mjs', 'typescript']);

  // 기본값과 null은 이미 직렬화된 데이터에 들어 있다.
  assert.equal(indexed[0][23], 42);
  assert.equal(indexed[0][24], 9223372036854775807n);
  assert.equal(indexed[0][15], null);
  const future = indexed.map((row) => [...row, { ignored: [1, 2, 3] }]);
  assert.deepEqual(await node.deserializeTypesMessagePack(encode(future, { useBigInt64: true })), expected);
  for (const loader of [node, puerts, puertsEsm]) {
    await assert.rejects(() => loader.deserializeTypesMessagePack(Buffer.concat([bytes, Buffer.from([0])])));
    await assert.rejects(() => loader.deserializeTypesMessagePack(bytes.subarray(0, bytes.length - 1)));
  }
  await assert.rejects(() => node.deserializeTypesJson('[{'));
});

test('column order is independent of schema row order and wire index', async () => {
  const filename = path.join(dir, 'Order.xlsx');
  await fixture(filename, [[2, 'name', 'string'], [0, 'id', 'int'], [3, 'enabled', 'bool', false]], [['Sword', 7]], ['name', 'id']);
  const { rows, indexedRows } = await readWorkbook(filename);
  assert.deepEqual(rows, [{ id: 7, name: 'Sword', enabled: false }]);
  assert.deepEqual(indexedRows, [[7, null, 'Sword', false]]);
});

const invalidCases = [
  ['duplicate indices', [[0, 'id', 'int'], [0, 'name', 'string']], [[1, 'a']], /duplicate index/],
  ['duplicate field names', [[0, 'id', 'int'], [1, 'id', 'int']], [[1, 2]], /duplicate field/],
  ['negative index', [[-1, 'id', 'int']], [[1]], /index must/],
  ['enormous index', [[5000, 'id', 'int']], [[1]], /index must/],
  ['invalid type', [[0, 'id', 'object']], [[1]], /unsupported type/],
  ['nested array', [[0, 'id', 'int[][]']], [['[[1]]']], /unsupported type/],
  ['prototype name', [[0, '__proto__', 'string']], [['x']], /Invalid field/],
  ['injected name', [[0, 'a;bad', 'string']], [['x']], /Invalid field/],
  ['int overflow', [[0, 'id', 'int']], [[2147483648]], /signed 32-bit/],
  ['uint overflow', [[0, 'id', 'uint']], [[-1]], /unsigned 32-bit/],
  ['uint upper overflow', [[0, 'id', 'uint']], [[4294967296]], /unsigned 32-bit/],
  ['fractional int', [[0, 'id', 'int']], [[1.1]], /must be an integer/],
  ['fractional uint', [[0, 'id', 'uint']], [[1.5]], /must be an integer/],
  ['fractional long', [[0, 'id', 'long']], [[1.5]], /must be an integer/],
  ['fractional long array', [[0, 'id', 'long[]']], [['[1.5]']], /\[0\].*must be an integer/],
  ['unsafe long number', [[0, 'id', 'long']], [[9007199254740992]], /unsafe integer/],
  ['long overflow', [[0, 'id', 'long']], [['9223372036854775808']], /signed 64-bit/],
  ['long underflow', [[0, 'id', 'long']], [['-9223372036854775809']], /signed 64-bit/],
  ['boolean as long', [[0, 'id', 'long']], [[true]], /invalid integer/],
  ['float overflow', [[0, 'id', 'float']], [['1e39']], /float32/],
  ['infinite double', [[0, 'id', 'double']], [['1e309']], /finite/],
  ['invalid boolean', [[0, 'id', 'bool']], [['yes']], /boolean/],
  ['invalid array JSON', [[0, 'id', 'int[]']], [['[1,]']], /valid JSON/],
  ['null array element', [[0, 'id', 'string[]']], [['[null]']], /null is not/],
  ['int array overflow', [[0, 'id', 'int[]']], [['[1,2147483648]']], /First!A2.*\[1\].*signed 32-bit/],
  ['uint array underflow', [[0, 'id', 'uint[]']], [['[0,-1]']], /unsigned 32-bit/],
  ['unsafe long array', [[0, 'id', 'long[]']], [['[9007199254740992]']], /unsafe integer/],
  ['long array overflow', [[0, 'id', 'long[]']], [['["9223372036854775808"]']], /signed 64-bit/],
  ['float array overflow', [[0, 'id', 'float[]']], [['[1e39]']], /float32/],
  ['infinite double array', [[0, 'id', 'double[]']], [['[1e309]']], /finite/],
  ['invalid boolean array', [[0, 'id', 'bool[]']], [['["yes"]']], /boolean/],
  ['numeric string array', [[0, 'id', 'string[]']], [['[1]']], /text cell/],
  ['invalid nullable value', [[0, 'id', 'int?']], [['oops']], /invalid number/],
  ['non-array JSON', [[0, 'id', 'int[]']], [['{}']], /JSON array/],
  ['number as string', [[0, 'id', 'string']], [[123]], /text cell/],
  ['missing required value', [[0, 'id', 'int'], [1, 'name', 'string']], [[1]], /required/],
  ['bad default', [[0, 'id', 'int', 'oops']], [[1]], /invalid number/],
  ['overflowing default', [[0, 'id', 'uint', 4294967296]], [], /default.*unsigned 32-bit/],
  ['invalid default array', [[0, 'id', 'long[]', '[null]']], [], /default\[0\].*null is not/],
];
for (const [name, schema, rows, message] of invalidCases) {
  test(`rejects ${name}`, async () => {
    const filename = path.join(dir, `invalid-${name.replaceAll(' ', '-')}.xlsx`);
    await fixture(filename, schema, rows);
    const out = path.join(dir, `rejected-${name.replaceAll(' ', '-')}`);
    await assert.rejects(convertWorkbook(filename, { out, table: 'Invalid' }), message);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
}

test('rejects bad data headers, merged cells, and uncached formulas with locations', async () => {
  const filename = path.join(dir, 'Headers.xlsx');
  const book = await fixture(filename, [[0, 'id', 'int']], [[1]], ['typo']);
  await assert.rejects(readWorkbook(filename), /not in the schema/);
  book.worksheets[0].getCell('A1').value = 'id';
  book.worksheets[0].getCell('A2').value = { formula: '1+2' };
  await book.xlsx.writeFile(filename);
  await assert.rejects(readWorkbook(filename), /First!A2: formula has no cached result/);
  book.worksheets[0].getCell('A2').value = { formula: '1+2', result: 3 };
  await book.xlsx.writeFile(filename);
  assert.equal((await readWorkbook(filename)).rows[0].id, 3);
  book.worksheets[0].mergeCells('A2:B2');
  await book.xlsx.writeFile(filename);
  await assert.rejects(readWorkbook(filename), /merged/);
});

test('reads plain and rich-text hyperlink cells as their display text', async () => {
  const filename = path.join(dir, 'Links.xlsx');
  await fixture(filename, [[0, 'id', 'int'], [1, 'plain', 'string'], [2, 'rich', 'string']], [[
    1,
    { text: '문서', hyperlink: 'https://example.com/a' },
    { text: { richText: [{ text: '굵은 ' }, { font: { bold: true }, text: '링크' }] }, hyperlink: 'https://example.com/b' },
  ]]);
  assert.deepEqual((await readWorkbook(filename)).rows, [{ id: 1, plain: '문서', rich: '굵은 링크' }]);
});

test('empty table, default arrays and aliases', async () => {
  const filename = path.join(dir, 'Empty.xlsx');
  await fixture(filename, [[0, 'id', 'int32']], []);
  const output = path.join(dir, 'empty');
  await convertWorkbook(filename, { out: output });
  assert.deepEqual(decode(await readFile(path.join(output, 'data/Empty.bytes'))), []);
});

test('helper file names cannot collide with table names', async () => {
  const filename = path.join(dir, 'Runtime.xlsx');
  await fixture(filename, [[0, 'id', 'int']], [[1]]);
  const output = path.join(dir, 'runtime-name');
  await convertWorkbook(filename, { out: output });
  assert.match(await readFile(path.join(output, 'typescript/node/Runtime.ts'), 'utf8'), /interface RuntimeRow/);
  assert.match(await readFile(path.join(output, 'typescript/node/Runtime.ts'), 'utf8'), /runtime\/messagepack\.js/);
});

test('JSON string arrays preserve empty strings and literal quote pairs', async () => {
  const filename = path.join(dir, 'Strings.xlsx');
  await fixture(filename, [[0, 'id', 'int'], [1, 'strings', 'string[]']], [[1, JSON.stringify(['', '""', '한글'])]]);
  assert.deepEqual((await readWorkbook(filename)).rows[0].strings, ['', '""', '한글']);
});

test('failed validation preserves previous generated files', async () => {
  const filename = path.join(dir, 'Stable.xlsx');
  const out = path.join(dir, 'stable');
  await fixture(filename, [[0, 'id', 'int']], [[1]]);
  await convertWorkbook(filename, { out });
  const old = await readFile(path.join(out, 'data/Stable.bytes'));
  await fixture(filename, [[0, 'id', 'int']], [['invalid']]);
  await assert.rejects(convertWorkbook(filename, { out }), /invalid number/);
  assert.deepEqual(await readFile(path.join(out, 'data/Stable.bytes')), old);
  assert.ok(!(await readdir(out)).some((f) => f.startsWith('.sheet-baker-')));
});

test('CLI help, custom names, output and nonzero error status', async () => {
  const { stdout } = await exec(process.execPath, ['src/cli.js', '--help']);
  assert.match(stdout, /Usage/);
  assert.doesNotMatch(stdout, /C#|csharp|--namespace/);
  const filename = path.join(dir, '한글.xlsx');
  await fixture(filename, [[0, 'id', 'int']], [[1]]);
  await exec(process.execPath, ['src/cli.js', filename, '--table', 'Custom', '--out', path.join(dir, 'cli')]);
  await assert.rejects(exec(process.execPath, ['src/cli.js', filename]), (error) => error.code === 1 && /Invalid table/.test(error.stderr));
  await assert.rejects(exec(process.execPath, ['src/cli.js', filename, '--table', 'Custom', '--namespace', 'Game.Data']), /Unknown option '--namespace'/);
});

test('big is a column type: arrays and nullable accepted, numbers and decimal text normalized', () => {
  assert.deepEqual(parseType('big', 'x'), { base: 'big', array: false, nullable: false, type: 'big' });
  assert.equal(parseType('big[]?', 'x').type, 'big[]?');
  const big = parseType('big', 'x');
  assert.equal(parseValue(1500, big, 'x'), '1500');
  assert.equal(parseValue(1e21, big, 'x'), '1e+21');
  assert.equal(parseValue(' 1.5e40 ', big, 'x'), '1.5e40');
  assert.equal(parseValue('.5', big, 'x'), '.5');
  for (const bad of ['abc', '1e', '1.5e40x', '', 'NaN', Infinity, true, '1e99999999999999999999']) {
    assert.throws(() => parseValue(bad, big, 'x'), /\(expected big\)/, String(bad));
  }
  assert.throws(() => parseValue(null, big, 'x'), /null is not allowed.*\(expected big\)/);
  assert.equal(parseValue(null, parseType('big?', 'x'), 'x'), null);
  assert.deepEqual(parseValue('[10, "2.5e3", "-1e400"]', parseType('big[]', 'x'), 'x'), ['10', '2.5e3', '-1e400']);
});

const bigSchema = [[0, 'id', 'int'], [1, 'hp', 'big'], [2, 'bonus', 'big?'], [3, 'costs', 'big[]'], [4, 'rewards', 'big[]?']];
const bigRows = [[1, '1.5e40', null, '[10, "2.5e3"]'], [2, 1500, '-3e400', '[]', '["7"]']];

test('big columns load through Big.parse in every target and round-trip as decimal text', async () => {
  const filename = path.join(dir, 'Stats.xlsx');
  await fixture(filename, bigSchema, bigRows);
  const output = path.join(dir, 'big');
  await convertWorkbook(filename, { out: output, bigModule: '@idle/big-number' });
  const decimal = [
    { id: 1, hp: '1.5e40', bonus: null, costs: ['10', '2.5e3'], rewards: null },
    { id: 2, hp: '1500', bonus: '-3e400', costs: [], rewards: ['7'] },
  ];
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'data/Stats.json'), 'utf8')), decimal);
  assert.deepEqual(decode(await readFile(path.join(output, 'data/Stats.bytes'))), [[1, '1.5e40', null, ['10', '2.5e3'], null], [2, '1500', '-3e400', [], ['7']]]);

  for (const target of ['node', 'portable', 'puerts']) {
    const source = await readFile(path.join(output, `typescript/${target}/Stats.ts`), 'utf8');
    assert.ok(source.includes("import { Big } from '@idle/big-number';\n"), target);
    assert.ok(source.includes('"hp": Big;') && source.includes('"bonus": Big | null;') && source.includes('"costs": Big[];'), target);
    assert.ok(source.includes('Big.parse(row[1] as string)'), target);
    assert.ok(source.includes('row[2] === null ? null : Big.parse(row[2] as string)'), target);
    assert.ok(source.includes('(row[3] as string[]).map((text) => Big.parse(text))'), target);
    assert.ok(source.includes('row[4] === null ? null : (row[4] as string[]).map((text) => Big.parse(text))'), target);
  }
  const node = await readFile(path.join(output, 'typescript/node/Stats.ts'), 'utf8');
  assert.ok(node.includes('Big.parse(row["hp"] as string)'));
  assert.ok(node.includes('row["bonus"] === null ? null : Big.parse(row["bonus"] as string)'));

  // 생성된 코드는 strict로 컴파일되고, 실제 @idle/big-number로 같은 값을 만든다.
  const tsFiles = ['typescript/node/Stats.ts', 'typescript/puerts/_index.ts'].map((f) => path.join(output, f));
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', ...tsFiles]);
  const compiled = path.join(output, 'big.mjs');
  await build({ entryPoints: [tsFiles[0]], outfile: compiled, bundle: true, platform: 'node', format: 'esm', target: 'es2020' });
  const loaders = await import(pathToFileURL(compiled).href);
  const expected = new Map([
    [1, { id: 1, hp: { m: 1.5, e: 40 }, bonus: null, costs: [{ m: 1, e: 1 }, { m: 2.5, e: 3 }], rewards: null }],
    [2, { id: 2, hp: { m: 1.5, e: 3 }, bonus: { m: -3, e: 400 }, costs: [], rewards: [{ m: 7, e: 0 }] }],
  ]);
  assert.deepEqual(await loaders.loadStatsJson(path.join(output, 'data/Stats.json')), expected);
  assert.deepEqual(await loaders.loadStatsMessagePack(path.join(output, 'data/Stats.bytes')), expected);
});

test('big columns need a big module, and tables without them import nothing extra', async () => {
  const filename = path.join(dir, 'NoModule.xlsx');
  await fixture(filename, bigSchema, bigRows);
  const out = path.join(dir, 'no-module');
  await assert.rejects(convertWorkbook(filename, { out }), /big columns need --big-module/);
  await assert.rejects(stat(out), { code: 'ENOENT' });

  const plain = path.join(dir, 'Plain.xlsx');
  await fixture(plain, [[0, 'id', 'int'], [1, 'name', 'string']], [[1, 'a']]);
  const withoutModule = path.join(dir, 'plain-a');
  const withModule = path.join(dir, 'plain-b');
  await convertWorkbook(plain, { out: withoutModule });
  await convertWorkbook(plain, { out: withModule, bigModule: '@idle/big-number' });
  for (const target of ['node', 'portable', 'puerts']) {
    const source = await readFile(path.join(withModule, `typescript/${target}/Plain.ts`), 'utf8');
    assert.doesNotMatch(source, /Big/);
    assert.equal(source, await readFile(path.join(withoutModule, `typescript/${target}/Plain.ts`), 'utf8'));
  }
});
