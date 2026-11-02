import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
import { convertWorkbook, convertWorkbooks } from '../src/index.js';
import { fixture, keyValueFixture, tscPath } from './helpers.js';

const exec = promisify(execFile);
await mkdir('.test-output', { recursive: true });
const root = await mkdtemp(path.resolve('.test-output/checks-'));
after(() => rm(root, { recursive: true, force: true }));

const RULES = ['index', 'name', 'type', 'default', 'description', 'ref', 'enum', 'range', 'length', 'when'];
const field = (index, name, type, rules = {}) =>
  [index, name, type, rules.default ?? null, rules.description ?? null, rules.ref ?? null, rules.enum ?? null, rules.range ?? null, rules.length ?? null, rules.when ?? null];
const table = (filename, schema, rows) => fixture(filename, schema, rows, schema.map((f) => f[1]), RULES);

// 게임 데이터와 같은 모양: Enum, 참조, 짝 배열, 장비만 쓰는 열, 키-값 시트인 상수 테이블.
async function game(folder, { items = [[1, 1, null, null], [101, 3, 1, '5']], stages = [[3001, '[2001]', '[1,101]', '["30","1"]', null], [3002, '[2001]', '[]', '[]', 3001]], sounds = [['bgm.main', 'bgm']], constants = [1, 'bgm.main', 12] } = {}) {
  await fixture(path.join(folder, 'Enums.xlsx'), [[0, 'id', 'string'], [1, 'value', 'int?'], [2, 'text', 'string?'], [3, 'description', 'string?']], [
    ['ItemKind.Currency', 1, null, '재화'], ['ItemKind.Material', 2], ['ItemKind.Equipment', 3, null, '장비'],
    ['EquipSlot.Weapon', 1], ['EquipSlot.Armor', 2],
    ['SoundChannel.Bgm', null, 'bgm'], ['SoundChannel.Sfx', null, 'sfx'],
  ]);
  await table(path.join(folder, 'Items.xlsx'), [
    field(0, 'id', 'int'), field(1, 'kind', 'int', { enum: 'ItemKind' }),
    field(2, 'slot', 'uint', { enum: 'EquipSlot', when: 'kind=Equipment' }),
    field(3, 'attack', 'big?', { range: '0..', when: 'kind=Equipment' }),
  ], items);
  await table(path.join(folder, 'Monsters.xlsx'), [field(0, 'id', 'int')], [[2001]]);
  await table(path.join(folder, 'Stages.xlsx'), [
    field(0, 'id', 'int'), field(1, 'monsterIds', 'int[]', { ref: 'Monsters', length: '1..' }), field(2, 'clearItemIds', 'int[]', { ref: 'Items' }),
    field(3, 'clearAmounts', 'big[]', { range: '0..', length: 'clearItemIds' }), field(4, 'unlockStageId', 'int?', { ref: 'Stages' }),
  ], stages);
  await table(path.join(folder, 'Sounds.xlsx'), [field(0, 'id', 'string'), field(1, 'channel', 'string', { enum: 'SoundChannel' })], sounds);
  const [expItemId, mainBgm, offlineCapHours] = constants;
  await keyValueFixture(path.join(folder, 'Constants.xlsx'), [
    [0, 'expItemId', 'uint', expItemId, null, 'Items'], [1, 'mainBgm', 'string', mainBgm, null, 'Sounds'],
    [2, 'offlineCapHours', 'double', offlineCapHours, null, null, null, '0..'],
  ]);
  return ['Enums', 'Items', 'Monsters', 'Stages', 'Sounds', 'Constants'].map((name) => ({ input: path.join(folder, `${name}.xlsx`) }));
}

test('valid tables generate TS enums, enum-typed columns, conditional columns and a key-value single-row loader', async () => {
  const inputs = await game(path.join(root, 'valid'));
  const out = path.join(root, 'valid-out');
  const results = await convertWorkbooks(inputs, { out, bigModule: '@idle/big-number' });
  assert.deepEqual(results.map((r) => r.table), ['Enums', 'Items', 'Monsters', 'Stages', 'Sounds', 'Constants']);
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'data/Items.json'), 'utf8')), [
    { id: 1, kind: 1, slot: null, attack: null }, { id: 101, kind: 3, slot: 1, attack: '5' },
  ]);
  await assert.rejects(stat(path.join(out, 'data/Enums.json')), { code: 'ENOENT' });

  const enums = await readFile(path.join(out, 'typescript/portable/Enums.ts'), 'utf8');
  assert.match(enums, /export enum ItemKind \{\n {2}\/\/ 재화\n {2}Currency = 1,\n {2}Material = 2,\n {2}\/\/ 장비\n {2}Equipment = 3,\n\}/);
  assert.match(enums, /export enum SoundChannel \{\n {2}Bgm = "bgm",\n {2}Sfx = "sfx",\n\}/);
  const items = await readFile(path.join(out, 'typescript/portable/Items.ts'), 'utf8');
  assert.match(items, /import type \{ EquipSlot, ItemKind \} from '\.\/Enums\.js';/);
  assert.match(items, /"kind": ItemKind;/);
  assert.match(items, /"slot": EquipSlot \| null;/);
  assert.match(await readFile(path.join(out, 'typescript/portable/_index.ts'), 'utf8'), /export \* from '\.\/Enums\.js';/);
  const constantsCode = await readFile(path.join(out, 'typescript/portable/Constants.ts'), 'utf8');
  assert.match(constantsCode, /Promise<ConstantsRow>/);
  // 문자열 id는 리터럴 유니온이 되고, 그 테이블을 가리키는 ref 열도 그 타입이다.
  const soundsCode = await readFile(path.join(out, 'typescript/portable/Sounds.ts'), 'utf8');
  assert.match(soundsCode, /export type SoundsId =\n {2}\| "bgm\.main";/);
  assert.match(soundsCode, /"id": SoundsId;/);
  assert.match(soundsCode, /Promise<Map<SoundsId, SoundsRow>>/);
  assert.match(constantsCode, /import type \{ SoundsId \} from '\.\/Sounds\.js';/);
  assert.match(constantsCode, /"mainBgm": SoundsId;/);
  assert.match(items, /"id": number;/);

  // 생성 코드가 strict로 컴파일되고, 행이 하나인 테이블은 Map이 아니라 그 행을 돌려준다.
  const consumer = path.join(out, 'consumer.ts');
  await writeFile(consumer, `import { ItemKind, EquipSlot, type ItemsRow, type ConstantsRow, type SoundsId } from './typescript/node/_entry.js';
const row: ItemsRow = { id: 7, kind: ItemKind.Equipment, slot: EquipSlot.Armor, attack: null };
const constants: ConstantsRow = { expItemId: 1, mainBgm: 'bgm.main', offlineCapHours: 12 };
// @ts-expect-error 테이블에 없는 키
const missing: SoundsId = 'bgm.none';
export const checked = [row, constants, missing];
`);
  await writeFile(path.join(out, 'typescript/node/_entry.ts'), `export * from './Enums.js';\nexport * from './Items.js';\nexport * from './Sounds.js';\nexport * from './Constants.js';\n`);
  // 생성 코드가 import하는 Big 모듈의 최소 대역.
  await mkdir(path.join(out, 'node_modules/@idle/big-number'), { recursive: true });
  await Promise.all([
    writeFile(path.join(out, 'node_modules/@idle/big-number/package.json'), '{"name":"@idle/big-number","type":"module","types":"index.d.ts","main":"index.js"}'),
    writeFile(path.join(out, 'node_modules/@idle/big-number/index.d.ts'), 'export type Big = { readonly text: string };\nexport declare const Big: { parse(text: string): Big };\n'),
    writeFile(path.join(out, 'node_modules/@idle/big-number/index.js'), 'export const Big = { parse: (text) => ({ text }) };\n'),
  ]);
  await exec(process.execPath, [tscPath, '--noEmit', '--strict', '--target', 'ES2020', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck', consumer]);
  const compiled = path.join(out, 'constants.mjs');
  await build({ entryPoints: [path.join(out, 'typescript/node/Constants.ts')], outfile: compiled, bundle: true, platform: 'node', format: 'esm', nodePaths: [path.join(out, 'node_modules')] });
  const loader = await import(pathToFileURL(compiled).href);
  const expected = { expItemId: 1, mainBgm: 'bgm.main', offlineCapHours: 12 };
  assert.deepEqual(await loader.loadConstantsMessagePack(path.join(out, 'data/Constants.bytes')), expected);
  assert.deepEqual(await loader.loadConstantsJson(path.join(out, 'data/Constants.json')), expected);
});

// 문장 테이블: 언어마다 필수 문자열 열이고, 다른 테이블의 키 열은 ref로 그 id를 가리킨다.
test('a string table catches a missing translation and a key column that names no key', async () => {
  const folder = path.join(root, 'strings');
  const strings = (en) => table(path.join(folder, 'Strings.xlsx'), [field(0, 'id', 'string'), field(1, 'ko', 'string'), field(2, 'en', 'string')],
    [['item.sword', '검', 'Sword'], ['item.shield', '방패', en]]);
  await strings(null);
  await table(path.join(folder, 'Items.xlsx'), [field(0, 'id', 'int'), field(1, 'nameKey', 'string', { ref: 'Strings' })], [[1, 'item.sword'], [2, 'item.axe']]);
  const inputs = ['Strings', 'Items'].map((name) => ({ input: path.join(folder, `${name}.xlsx`) }));
  const out = path.join(root, 'strings-out');
  await assert.rejects(convertWorkbooks(inputs, { out }), /Strings\.xlsx: First!C3: 'en' is required/);
  await strings('Shield');
  await assert.rejects(convertWorkbooks(inputs, { out }), /Items\.xlsx: First!B3 \(nameKey\): "item\.axe" is not an id in Strings/);
  await assert.rejects(stat(out), { code: 'ENOENT' });
});

test('violations are collected across workbooks with sheet, cell and field, and nothing is written', async () => {
  const inputs = await game(path.join(root, 'invalid'), {
    items: [[1, 1, 2, null], [101, 3, 1, '-5'], [102, 4, 1, null], [103, 3, 9, null]],
    stages: [[3001, '[2001,2999]', '[1,101]', '["30"]', null], [3002, '[]', '[]', '[]', 3999]],
    sounds: [['bgm.main', 'music']],
    constants: [404, 'bgm.missing', -1],
  });
  const out = path.join(root, 'invalid-out');
  await assert.rejects(convertWorkbooks(inputs, { out, bigModule: '@idle/big-number' }), (error) => {
    const lines = error.message.split('\n').slice(1).map((line) => line.trim().replace(`${path.join(root, 'invalid')}${path.sep}`, ''));
    assert.match(error.message, /^13 table check\(s\) failed:/);
    assert.deepEqual(lines.sort(), [
      'Constants.xlsx: First!D2 (expItemId): 404 is not an id in Items',
      'Constants.xlsx: First!D3 (mainBgm): "bgm.missing" is not an id in Sounds',
      'Constants.xlsx: First!D4 (offlineCapHours): -1 is outside the range 0..',
      'Items.xlsx: First!B4 (kind): 4 is not in ItemKind (1, 2, 3)',
      'Items.xlsx: First!C2 (slot): only rows with kind=Equipment may fill this column',
      'Items.xlsx: First!C4 (slot): only rows with kind=Equipment may fill this column',
      'Items.xlsx: First!C5 (slot): 9 is not in EquipSlot (1, 2)',
      'Items.xlsx: First!D3 (attack): -5 is outside the range 0..',
      'Sounds.xlsx: First!B2 (channel): "music" is not in SoundChannel ("bgm", "sfx")',
      'Stages.xlsx: First!B2 (monsterIds[1]): 2999 is not an id in Monsters',
      'Stages.xlsx: First!B3 (monsterIds): has 0 items, outside the length 1..',
      'Stages.xlsx: First!D2 (clearAmounts): has 1 items but clearItemIds has 2',
      'Stages.xlsx: First!E3 (unlockStageId): 3999 is not an id in Stages',
    ]);
    return true;
  });
  await assert.rejects(stat(out), { code: 'ENOENT' });
});

test('a conditional column is required where its condition holds unless it is nullable', async () => {
  const inputs = await game(path.join(root, 'required'), { items: [[101, 3, null, null]] });
  await assert.rejects(convertWorkbooks(inputs, { out: path.join(root, 'required-out'), bigModule: '@idle/big-number' }),
    /Items\.xlsx: First!C2: 'slot' is required when kind=Equipment/);
});

test('a conditional column can name several values', async () => {
  const schema = [field(0, 'id', 'int'), field(1, 'kind', 'int'), field(2, 'tick', 'double', { when: 'kind=1|2' })];
  const input = path.join(root, 'several.xlsx');
  await table(input, schema, [[1, 1, 0.5], [2, 2, 1], [3, 3, null]]);
  const out = path.join(root, 'several-out');
  await convertWorkbook(input, { out, table: 'Effects' });
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'data/Effects.json'), 'utf8')), [
    { id: 1, kind: 1, tick: 0.5 }, { id: 2, kind: 2, tick: 1 }, { id: 3, kind: 3, tick: null },
  ]);
  await table(input, schema, [[1, 3, 0.5]]);
  await assert.rejects(convertWorkbook(input, { out: path.join(root, 'several-bad'), table: 'Effects' }),
    /First!C2 \(tick\): only rows with kind=1\|2 may fill this column/);
});

const schemaErrors = [
  ['unknown enum', [field(0, 'id', 'int'), field(1, 'kind', 'int', { enum: 'Missing' })], /Second!row 3: unknown enum 'Missing'; convert it together with the Enums workbook/],
  ['range on text', [field(0, 'id', 'int'), field(1, 'name', 'string', { range: '0..' })], /range needs a numeric type/],
  ['malformed range', [field(0, 'id', 'int'), field(1, 'hp', 'int', { range: '0-10' })], /range must look like/],
  ['length on a scalar', [field(0, 'id', 'int'), field(1, 'hp', 'int', { length: 'id' })], /length needs an array type/],
  ['length to a scalar', [field(0, 'id', 'int'), field(1, 'hp', 'int[]', { length: 'id' })], /length must be a range like 1\.\. or name another array field/],
  ['malformed length range', [field(0, 'id', 'int'), field(1, 'hp', 'int[]', { length: '1..x' })], /length: range must look like/],
  ['when on itself', [field(0, 'id', 'int'), field(1, 'hp', 'int?', { when: 'hp=1' })], /when must name another scalar field/],
  ['malformed when', [field(0, 'id', 'int'), field(1, 'hp', 'int?', { when: 'id' })], /when must look like field=value/],
  ['ref outside the conversion', [field(0, 'id', 'int'), field(1, 'monsterId', 'int', { ref: 'Monsters' })], /refers to table 'Monsters', which is not among the converted workbooks/],
];
for (const [name, schema, message] of schemaErrors) {
  test(`rejects a schema with ${name}`, async () => {
    const input = path.join(root, `schema-${name.replaceAll(' ', '-')}.xlsx`);
    await table(input, schema, [[1, 1]]);
    const out = path.join(root, `schema-${name.replaceAll(' ', '-')}-out`);
    await assert.rejects(convertWorkbook(input, { out, table: 'Invalid' }), message);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
}

// 키-값 시트의 값은 그 행의 type으로 읽어, 틀린 값과 빈 값은 그 셀을 짚어 바로 실패한다.
const keyValueErrors = [
  ['a value of the wrong type', [[0, 'offlineCapHours', 'double', 'twelve']], /First!D2 \(offlineCapHours\): invalid number \(expected double\)/],
  ['a number for a string', [[0, 'mainBgm', 'string', 12]], /First!D2 \(mainBgm\): use an Excel text cell for strings/],
  ['a missing value', [[0, 'heroId', 'uint', 1], [1, 'mainBgm', 'string', null]], /First!D3: 'mainBgm' is required/],
  ['a field named id', [[0, 'id', 'uint', 1]], /First!row 2: a key-value sheet cannot name a field 'id'/],
  ['a default column', [[0, 'heroId', 'uint', 1, 1]], /First: unknown schema header 'default'/, ['index', 'name', 'type', 'value', 'default']],
  ['no value column', [[0, 'heroId', 'uint']], /First: missing schema header 'value'/, ['index', 'name', 'type']],
];
for (const [name, rows, message, header] of keyValueErrors) {
  test(`rejects a key-value sheet with ${name}`, async () => {
    const input = path.join(root, `key-value-${name.replaceAll(' ', '-')}.xlsx`);
    await keyValueFixture(input, rows, header);
    const out = path.join(root, `key-value-${name.replaceAll(' ', '-')}-out`);
    await assert.rejects(convertWorkbook(input, { out, table: 'Invalid' }), message);
    await assert.rejects(stat(out), { code: 'ENOENT' });
  });
}

test('a nullable key-value field may be blank and a two-sheet table without an id points to the key-value sheet', async () => {
  const input = path.join(root, 'key-value-nullable.xlsx');
  await keyValueFixture(input, [[1, 'note', 'string?', null], [0, 'heroId', 'uint', 1]]);
  const out = path.join(root, 'key-value-nullable-out');
  await convertWorkbook(input, { out, table: 'Settings' });
  // 레코드와 바이너리는 index 순서다.
  assert.deepEqual(JSON.parse(await readFile(path.join(out, 'data/Settings.json'), 'utf8')), [{ heroId: 1, note: null }]);
  const horizontal = path.join(root, 'horizontal.xlsx');
  await table(horizontal, [field(0, 'heroId', 'uint')], [[1]]);
  await assert.rejects(convertWorkbook(horizontal, { out, table: 'Horizontal' }), /Second: a table needs an 'id' field; write a single-row table as one key-value sheet/);
});

test('enum columns must fit the enum kind and refs need a table with ids', async () => {
  const folder = path.join(root, 'kinds');
  const inputs = await game(folder);
  await table(path.join(folder, 'Sounds.xlsx'), [field(0, 'id', 'string'), field(1, 'channel', 'int', { enum: 'SoundChannel' })], [['bgm.main', 1]]);
  await assert.rejects(convertWorkbooks(inputs, { out: path.join(root, 'kinds-out'), bigModule: '@idle/big-number' }), /string enum 'SoundChannel' does not fit type int/);
  await table(path.join(folder, 'Sounds.xlsx'), [field(0, 'id', 'string'), field(1, 'channel', 'string', { ref: 'Constants' })], [['bgm.main', 'x']]);
  await assert.rejects(convertWorkbooks(inputs, { out: path.join(root, 'kinds-out'), bigModule: '@idle/big-number' }), /refers to 'Constants', which has no id field/);
});

test('the Enums table rejects malformed ids, ambiguous or mixed members and repeated values', async () => {
  const input = path.join(root, 'enums/Enums.xlsx');
  await fixture(input, [[0, 'id', 'string'], [1, 'value', 'int?'], [2, 'text', 'string?']], [
    ['lower.Case', 1], ['Kind.A', 1], ['Kind.B', 1], ['Kind.C', null, 'c'], ['Both.X', 1, 'x'], ['Neither.Y'],
  ]);
  await assert.rejects(convertWorkbook(input, { out: path.join(root, 'enums-out') }), (error) => {
    assert.match(error.message, /^5 table check\(s\) failed:/);
    assert.match(error.message, /First!A2 \(id\): 'lower\.Case' must look like EnumName\.Member/);
    assert.match(error.message, /First!B4 \(Kind\.B\): Kind already has the value 1/);
    assert.match(error.message, /First!A5 \(Kind\.C\): Kind mixes int and string members/);
    assert.match(error.message, /First!A6 \(Both\.X\): fill exactly one of value \(int enum\) or text \(string enum\)/);
    assert.match(error.message, /First!A7 \(Neither\.Y\): fill exactly one/);
    return true;
  });
});
