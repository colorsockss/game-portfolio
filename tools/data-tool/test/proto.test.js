import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { convertWorkbooks } from '../src/index.js';
import { fixture, keyValueFixture } from './helpers.js';

await mkdir('.test-output', { recursive: true });
const dir = await mkdtemp(path.resolve('.test-output/proto-'));
after(() => rm(dir, { recursive: true, force: true }));

const names = { format: 'proto', protoPackage: 'test.data', csharpNamespace: 'Test.Data' };
const ENUM_SCHEMA = [[0, 'id', 'string'], [1, 'value', 'int?'], [2, 'text', 'string?'], [3, 'description', 'string?']];
const SCHEMA_HEADER = ['index', 'name', 'type', 'default', 'description', 'ref', 'enum'];
const ZONE_SCHEMA = [
  [0, 'id', 'uint', null, '번호'], [1, 'nameKey', 'string', null, '이름'], [2, 'minX', 'int', null, '작은 x'],
  [3, 'speed', 'double'], [4, 'levels', 'int[]', '[]'], [5, 'note', 'string?'], [6, 'kind', 'int', null, null, null, 'ZoneKind'],
  [7, 'big', 'long'], [8, 'safe', 'bool'],
];

// 시험용 워크북 셋(Enums, Zones, Constants)을 폴더 하나에 만든다. zoneRows로 Zones의 행을 바꾼다.
async function workbooks(folder, zoneRows = [[1, 'zone.town', -2, 1.5, '[1,300]', null, 1, '-1', true], [2, 'zone.hunt', 0, 0, '[]', null, 0, '0', false]]) {
  await fixture(path.join(folder, 'Enums.xlsx'), ENUM_SCHEMA, [['ZoneKind.Town', 1, null, '마을'], ['ZoneKind.None', 0, null, '없음'], ['ZoneKind.HuntingGround', 2]]);
  await fixture(path.join(folder, 'Zones.xlsx'), ZONE_SCHEMA, zoneRows, undefined, SCHEMA_HEADER);
  await keyValueFixture(path.join(folder, 'Constants.xlsx'), [[0, 'fieldSize', 'uint', 600, '필드 한 변(m)'], [1, 'ratio', 'float', 0.25]]);
  return ['Enums', 'Zones', 'Constants'].map((table) => ({ input: path.join(folder, `${table}.xlsx`) }));
}

test('proto output: schema text and wire bytes match protoc for rows, key-value sheets and enums', async () => {
  const folder = path.join(dir, 'golden');
  const out = path.join(folder, 'out');
  const results = await convertWorkbooks(await workbooks(folder), { out, ...names });
  assert.deepEqual(results.map(({ table, rowCount }) => [table, rowCount]), [['Enums', 3], ['Zones', 2], ['Constants', 1]]);
  assert.deepEqual((await readdir(path.join(out, 'proto'))).sort(), ['Constants.proto', 'Enums.proto', 'Zones.proto']);
  assert.deepEqual((await readdir(path.join(out, 'data'))).sort(), ['Constants.bytes', 'Zones.bytes', 'data.hash']);

  const header = '// 자동 생성된 파일 — 직접 수정하지 마세요. data-tool이 워크북에서 만듭니다.\nsyntax = "proto3";\n\npackage test.data;\n\noption csharp_namespace = "Test.Data";\n\n';
  assert.equal(await readFile(path.join(out, 'proto/Enums.proto'), 'utf8'),
    `${header}enum ZoneKind {\n  // 없음\n  ZONE_KIND_NONE = 0;\n  // 마을\n  ZONE_KIND_TOWN = 1;\n  ZONE_KIND_HUNTING_GROUND = 2;\n}\n`);
  assert.equal(await readFile(path.join(out, 'proto/Zones.proto'), 'utf8'), `${header}import "Enums.proto";\n\nmessage ZonesRow {\n`
    + '  // 번호\n  uint32 id = 1;\n  // 이름\n  string name_key = 2;\n  // 작은 x\n  sint32 min_x = 3;\n  double speed = 4;\n'
    + '  repeated sint32 levels = 5;\n  optional string note = 6;\n  ZoneKind kind = 7;\n  sint64 big = 8;\n  bool safe = 9;\n}\n\n'
    + 'message Zones {\n  repeated ZonesRow rows = 1;\n}\n');
  assert.equal(await readFile(path.join(out, 'proto/Constants.proto'), 'utf8'),
    `${header}message Constants {\n  // 필드 한 변(m)\n  uint32 field_size = 1;\n  float ratio = 2;\n}\n`);

  // protoc --encode가 같은 값(protoc --decode로 읽은 글)에서 내는 바이트와 같다. 둘째 행은 기본값만 있어 id와 이름만 실린다.
  // 행마다 rows(0a, 길이) 뒤에 필드: id 0801, 이름 12 09 …, min_x(zigzag -2 → 3) 1803, speed 21 + double, levels(packed) 2a03 02d804,
  // 선택 note는 null이라 빠짐, kind 3801, big(zigzag -1 → 1) 4001, safe 4801.
  const text = (value) => Buffer.from(value).toString('hex');
  assert.equal((await readFile(path.join(out, 'data/Zones.bytes'))).toString('hex'),
    `0a23 0801 1209${text('zone.town')} 1803 21000000000000f83f 2a0302d804 3801 4001 4801 0a0d 0802 1209${text('zone.hunt')}`.replaceAll(' ', ''));
  assert.equal((await readFile(path.join(out, 'data/Constants.bytes'))).toString('hex'), '08d804150000803e');

  // 해시는 data/의 바이너리를 이름 순으로 이은 SHA-256의 앞 8바이트다.
  const joined = Buffer.concat([await readFile(path.join(out, 'data/Constants.bytes')), await readFile(path.join(out, 'data/Zones.bytes'))]);
  assert.equal(await readFile(path.join(out, 'data/data.hash'), 'utf8'), `${createHash('sha256').update(joined).digest('hex').slice(0, 16)}\n`);
});

test('proto output: the hash is the same for the same source and changes with one value', async () => {
  const first = path.join(dir, 'hash-a');
  const second = path.join(dir, 'hash-b');
  const inputs = await workbooks(first);
  await convertWorkbooks(inputs, { out: path.join(first, 'out1'), ...names });
  await convertWorkbooks(inputs, { out: path.join(first, 'out2'), ...names });
  await convertWorkbooks(await workbooks(second, [[1, 'zone.town', -3, 1.5, '[1,300]', null, 1, '-1', true]]), { out: path.join(second, 'out'), ...names });
  const hash = (out) => readFile(path.join(out, 'data/data.hash'), 'utf8');
  assert.equal(await hash(path.join(first, 'out1')), await hash(path.join(first, 'out2')));
  assert.notEqual(await hash(path.join(first, 'out1')), await hash(path.join(second, 'out')));
});

test('proto output: no workbooks still writes the hash of nothing', async () => {
  const out = path.join(dir, 'empty');
  assert.deepEqual(await convertWorkbooks([], { out, ...names }), []);
  assert.deepEqual(await readdir(out), ['data']);
  assert.equal(await readFile(path.join(out, 'data/data.hash'), 'utf8'), `${createHash('sha256').digest('hex').slice(0, 16)}\n`);
});

test('proto output: a broken reference writes nothing', async () => {
  const folder = path.join(dir, 'broken');
  const out = path.join(folder, 'out');
  await fixture(path.join(folder, 'Items.xlsx'), [[0, 'id', 'uint'], [1, 'zoneId', 'uint', null, null, 'Zones']], [[1, 9]], undefined, ['index', 'name', 'type', 'default', 'description', 'ref']);
  await fixture(path.join(folder, 'Zones.xlsx'), [[0, 'id', 'uint']], [[1]]);
  await assert.rejects(convertWorkbooks([{ input: path.join(folder, 'Items.xlsx') }, { input: path.join(folder, 'Zones.xlsx') }], { out, ...names }), /9 is not an id in Zones/);
  await assert.rejects(readdir(out), { code: 'ENOENT' });
});

for (const [name, setup, message] of [
  ['big columns', (folder) => fixture(path.join(folder, 'Big.xlsx'), [[0, 'id', 'uint'], [1, 'gold', 'big']], [[1, '10']]), /big columns have no proto type/],
  ['nullable arrays', (folder) => fixture(path.join(folder, 'Lists.xlsx'), [[0, 'id', 'uint'], [1, 'ids', 'int[]?']], [[1, '[1]']]), /nullable arrays have no proto type/],
  ['enums without a zero member', (folder) => fixture(path.join(folder, 'Enums.xlsx'), ENUM_SCHEMA, [['Kind.One', 1]]), /needs a member with value 0/],
]) {
  test(`proto output rejects ${name}`, async () => {
    const folder = path.join(dir, name.replaceAll(' ', '-'));
    await setup(folder);
    const inputs = (await readdir(folder)).map((file) => ({ input: path.join(folder, file) }));
    await assert.rejects(convertWorkbooks(inputs, { out: path.join(folder, 'out'), ...names }), message);
  });
}
