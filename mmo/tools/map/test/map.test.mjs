// 맵 생성기의 테스트. 시험용 워크북과 놓인 것의 파일로 격자, 검증, 해시를 본다. npm run test:mmo가 돌린다.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { buildMap, encodeGrid, generateMap } from '../map.mjs';

const root = await mkdtemp(path.join(tmpdir(), 'mmo-map-'));
after(() => rm(root, { recursive: true, force: true }));

async function workbook(file, sheets) {
  const book = new ExcelJS.Workbook();
  for (const [name, rows] of sheets) book.addWorksheet(name).addRows(rows);
  await book.xlsx.writeFile(file);
}

// 시험용 원본 폴더. 종류 1은 3×2로 막고, 2는 1×1로 막고, 3은 막지 않는 1×1이다. 마을의 부활 지점과 무법자의 부활 지점,
// 스폰의 무리의 자리(몬스터 1. 세 번째 값이 'gather'면 채집물 1, 'both'면 둘 다, 'none'이면 둘 다 비움)와 NPC의 자리를 정할 수 있다. 마을(안전 지대)은 -20..20 m다.
let folders = 0;
async function source(objects, { fieldSize = 100, respawn = [0, 0], outlaw = [10, 10], spawns = [], npcs = [] } = {}) {
  const folder = path.join(root, `source-${folders++}`);
  await mkdir(folder);
  await workbook(path.join(folder, 'Enums.xlsx'), [
    ['Data', [['id', 'value'], ['ZoneKind.None', 0], ['ZoneKind.Town', 1]]],
    ['Schema', [['index', 'name', 'type'], [0, 'id', 'string'], [1, 'value', 'int?'], [2, 'text', 'string?']]],
  ]);
  await workbook(path.join(folder, 'Constants.xlsx'), [['Constants', [['index', 'name', 'type', 'value'], [0, 'fieldSize', 'uint', fieldSize]]]]);
  await workbook(path.join(folder, 'Zones.xlsx'), [
    ['Data', [['id', 'nameKey', 'kind', 'minX', 'minZ', 'maxX', 'maxZ', 'safe', 'respawnX', 'respawnZ', 'outlawRespawnX', 'outlawRespawnZ'],
      [1, 'zone.town', 1, -20, -20, 20, 20, true, ...respawn, ...outlaw]]],
    ['Schema', [['index', 'name', 'type', 'default', 'description', 'ref', 'enum'],
      [0, 'id', 'uint'], [1, 'nameKey', 'string'], [2, 'kind', 'int', null, null, null, 'ZoneKind'],
      [3, 'minX', 'int'], [4, 'minZ', 'int'], [5, 'maxX', 'int'], [6, 'maxZ', 'int'], [7, 'safe', 'bool'],
      [8, 'respawnX', 'int?'], [9, 'respawnZ', 'int?'], [10, 'outlawRespawnX', 'int?'], [11, 'outlawRespawnZ', 'int?']]],
  ]);
  await workbook(path.join(folder, 'MapObjectKinds.xlsx'), [
    ['Data', [['id', 'width', 'depth', 'blocks', 'blocksCamera', 'meshKey'], [1, 3, 2, true, true, 'house'], [2, 1, 1, true, false, 'rock'], [3, 1, 1, false, false, 'grass']]],
    ['Schema', [['index', 'name', 'type'], [0, 'id', 'uint'], [1, 'width', 'uint'], [2, 'depth', 'uint'], [3, 'blocks', 'bool'], [4, 'blocksCamera', 'bool'], [5, 'meshKey', 'string']]],
  ]);
  await workbook(path.join(folder, 'Monsters.xlsx'), [
    ['Data', [['id', 'detectRange'], [1, 8]]],
    ['Schema', [['index', 'name', 'type'], [0, 'id', 'uint'], [1, 'detectRange', 'double']]],
  ]);
  await workbook(path.join(folder, 'Spawns.xlsx'), [
    ['Data', [['id', 'x', 'z', 'monsterId', 'gatherNodeId'], ...spawns.map(([x, z, what], i) => [i + 1, x, z,
      ['gather', 'none'].includes(what) ? null : 1, ['gather', 'both'].includes(what) ? 1 : null])]],
    ['Schema', [['index', 'name', 'type', 'default', 'description', 'ref'], [0, 'id', 'uint'], [1, 'x', 'int'], [2, 'z', 'int'],
      [3, 'monsterId', 'uint?', null, null, 'Monsters'], [4, 'gatherNodeId', 'uint?', null, null, 'GatherNodes']]],
  ]);
  await workbook(path.join(folder, 'GatherNodes.xlsx'), [
    ['Data', [['id'], [1]]],
    ['Schema', [['index', 'name', 'type'], [0, 'id', 'uint']]],
  ]);
  await workbook(path.join(folder, 'Npcs.xlsx'), [
    ['Data', [['id', 'x', 'z', 'monsterId'], ...npcs.map(([x, z, monsterId], i) => [i + 1, x, z, monsterId])]],
    ['Schema', [['index', 'name', 'type', 'default', 'description', 'ref'], [0, 'id', 'uint'], [1, 'x', 'int'], [2, 'z', 'int'], [3, 'monsterId', 'uint?', null, null, 'Monsters']]],
  ]);
  await writeFile(path.join(folder, 'MapObjects.tsv'), `# 시험용\n${objects.map((row) => row.join('\t')).join('\n')}\n`);
  return folder;
}

const blocked = (map) => {
  const cells = [];
  map.cells.forEach((value, index) => {
    if (value) cells.push([(index % map.size) + map.min, Math.floor(index / map.size) + map.min]);
  });
  return cells;
};

test('a 3×2 kind covers its cells in all four rotations, from the small corner', async () => {
  for (const [rotation, expected] of [
    [0, [[30, 30], [31, 30], [32, 30], [30, 31], [31, 31], [32, 31]]],
    [90, [[30, 30], [31, 30], [30, 31], [31, 31], [30, 32], [31, 32]]],
    [180, [[30, 30], [31, 30], [32, 30], [30, 31], [31, 31], [32, 31]]],
    [270, [[30, 30], [31, 30], [30, 31], [31, 31], [30, 32], [31, 32]]],
  ]) {
    assert.deepEqual(blocked(await buildMap(await source([[1, 30, 30, rotation]]))), expected, `rotation ${rotation}`);
  }
});

test('a kind that does not block leaves its cell open', async () => {
  assert.deepEqual(blocked(await buildMap(await source([[3, 5, 5, 0], [2, -3, -4, 0]]))), [[-3, -4]]);
});

test('the grid follows the field size of Constants', async () => {
  const small = await buildMap(await source([], { fieldSize: 40 }));
  assert.deepEqual([small.size, small.min, small.cells.length], [40, -20, 1600]);
  // 가로 40, 세로 40, 원점 -20(zigzag 39), 칸 1600바이트.
  assert.equal(encodeGrid(small).subarray(0, 11).toString('hex'), '0828102818272027' + '2ac00c');
});

for (const [name, objects, options, message] of [
  ['an unknown kind', [[9, 0, 0, 0]], {}, /MapObjects\.tsv:2: kind 9 is not in MapObjectKinds/],
  ['a rotation that is not a right angle', [[2, 0, 0, 45]], {}, /rotation 45 is not 0, 90, 180 or 270/],
  ['an object leaving the field', [[1, 48, 0, 0]], {}, /leaves the field \(-50\.\.50 m\)/],
  ['an object leaving the field after rotation', [[1, 0, 48, 90]], {}, /leaves the field/],
  ['a respawn point on a blocked cell', [[2, 0, 0, 0]], {}, /the respawn point \(0, 0\) is on a blocked cell/],
  ['an outlaw respawn point on a blocked cell', [[2, 10, 10, 0]], {}, /the outlaw respawn point \(10, 10\) is on a blocked cell/],
  ['an outlaw respawn point walled in', [[2, 9, 10, 0], [2, 11, 10, 0], [2, 10, 9, 0], [2, 10, 11, 0]], {}, /cannot be walked to from the town respawn point/],
  ['a malformed line', [['1', 'a', '0', '0']], {}, /four tab-separated integers/],
  ['a spawn on a blocked cell', [[2, 30, 30, 0]], { spawns: [[30, 30]] }, /Spawns 1: the group point \(30, 30\) is on a blocked cell/],
  ['a spawn walled in', [[2, 29, 30, 0], [2, 31, 30, 0], [2, 30, 29, 0], [2, 30, 31, 0]], { spawns: [[30, 30]] }, /Spawns 1: the group point \(30, 30\) cannot be walked to/],
  ['a gather node on a blocked cell', [[2, 30, 30, 0]], { spawns: [[30, 30, 'gather']] }, /Spawns 1: the group point \(30, 30\) is on a blocked cell/],
  ['a gather node walled in', [[2, 29, 30, 0], [2, 31, 30, 0], [2, 30, 29, 0], [2, 30, 31, 0]], { spawns: [[30, 30, 'gather']] }, /Spawns 1: the group point \(30, 30\) cannot be walked to/],
  ['a spawn with both a monster and a gather node', [], { spawns: [[30, 30, 'both']] }, /Spawns 1: set exactly one of monsterId and gatherNodeId/],
  ['a spawn with neither a monster nor a gather node', [], { spawns: [[30, 30, 'none']] }, /Spawns 1: set exactly one of monsterId and gatherNodeId/],
  ['a monster group in a safe zone', [], { spawns: [[30, 30], [5, -5]] }, /Spawns 2: the monster group point \(5, -5\) is in a safe zone/],
  ['an NPC on a blocked cell', [[2, 5, 5, 0]], { npcs: [[5, 5]] }, /Npcs 1: the NPC point \(5, 5\) is on a blocked cell/],
  ['an NPC walled in', [[2, 4, 5, 0], [2, 6, 5, 0], [2, 5, 4, 0], [2, 5, 6, 0]], { npcs: [[5, 5]] }, /Npcs 1: the NPC point \(5, 5\) cannot be walked to/],
  // 무법자의 부활 지점 (10, 10)에서 5 m인 경비병(인식 범위 8 m). 곁의 경비병이 아닌 NPC는 상관없다.
  ['a guard that sees the outlaw respawn point', [], { npcs: [[15, 10], [-15, -15, 1], [12, 10, 1]] }, /Npcs 3: the outlaw respawn point \(10, 10\) is within the guard's detect range \(8 m\)/],
]) {
  test(`the map stops on ${name}`, async () => {
    await assert.rejects(buildMap(await source(objects, options)), message);
  });
}

test('spawns outside the town on open reachable cells pass and are drawn in the preview', async () => {
  const out = path.join(root, 'out-spawns');
  await mkdir(path.join(out, 'data'), { recursive: true });
  const map = await generateMap(await source([], { spawns: [[30, 30], [-30, 25]] }), out);
  assert.deepEqual(map.spawns.map((spawn) => [spawn.x, spawn.z]), [[30, 30], [-30, 25]]);
  assert.match(await readFile(path.join(out, 'preview/Map.svg'), 'utf8'), />2·1</);
});

test('a gather node in the town on an open reachable cell passes and is drawn in the preview', async () => {
  const out = path.join(root, 'out-gather');
  await mkdir(path.join(out, 'data'), { recursive: true });
  const map = await generateMap(await source([], { spawns: [[5, -5, 'gather']] }), out);
  assert.deepEqual(map.spawns.map((spawn) => [spawn.x, spawn.z, spawn.gatherNodeId]), [[5, -5, 1]]);
  assert.match(await readFile(path.join(out, 'preview/Map.svg'), 'utf8'), />1·G1</);
});

test('an NPC in the town on an open reachable cell passes and is drawn in the preview', async () => {
  const out = path.join(root, 'out-npcs');
  await mkdir(path.join(out, 'data'), { recursive: true });
  const map = await generateMap(await source([], { npcs: [[5, -5]] }), out);
  assert.deepEqual(map.npcs.map((npc) => [npc.x, npc.z]), [[5, -5]]);
  assert.match(await readFile(path.join(out, 'preview/Map.svg'), 'utf8'), />N1</);
});

test('a guard farther than its detect range from the outlaw respawn point passes', async () => {
  await buildMap(await source([], { npcs: [[-15, -15, 1], [10, 19, 1]] }));
});

test('an outlaw respawn point walled in on three sides is still reachable', async () => {
  // 네 방향 이웃 가운데 하나만 열려 있어도 닿는다. 넷이 다 막히면 대각선이 열려 있어도 닿지 않는다(위의 walled in).
  await buildMap(await source([[2, 9, 10, 0], [2, 11, 10, 0], [2, 10, 9, 0]]));
});

test('moving one object changes the data hash and the same source gives the same files', async () => {
  const hash = async (objects) => {
    const out = path.join(root, `out-${folders}`);
    await mkdir(path.join(out, 'data'), { recursive: true });
    await generateMap(await source(objects), out);
    return {
      hash: await readFile(path.join(out, 'data/data.hash'), 'utf8'),
      list: await readFile(path.join(out, 'data/Map.tsv'), 'utf8'),
    };
  };
  const first = await hash([[1, 30, 30, 0]]);
  assert.deepEqual(await hash([[1, 30, 30, 0]]), first);
  assert.notEqual((await hash([[1, 31, 30, 0]])).hash, first.hash);
  assert.match(first.list, /^kind\t1\t3\t2\t1\t1\thouse$/m);
  assert.match(first.list, /^object\t1\t30\t30\t0$/m);
});

// 커밋된 격자(npm run generate의 출력)를 읽는다. MapGrid는 varint 필드 넷과 칸 바이트 하나다.
function decodeGrid(bytes) {
  const fields = {};
  let offset = 0;
  const varint = () => {
    let value = 0n;
    for (let shift = 0n; ; shift += 7n) {
      const byte = bytes[offset++];
      value |= BigInt(byte & 0x7f) << shift;
      if (byte < 0x80) return value;
    }
  };
  while (offset < bytes.length) {
    const key = Number(varint());
    const number = key >> 3;
    if ((key & 7) === 2) {
      const length = Number(varint());
      fields[number] = bytes.subarray(offset, offset + length);
      offset += length;
    } else {
      fields[number] = Number(varint());
    }
  }
  return { width: fields[1], depth: fields[2], cells: fields[5] };
}

test('the committed grid blocks every outermost cell with the border mountains', async () => {
  const { width, depth, cells } = decodeGrid(await readFile(new URL('../../../shared/data/files/MapGrid.bytes', import.meta.url)));
  assert.equal(cells.length, width * depth);
  const open = [];
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || z === 0 || x === width - 1 || z === depth - 1;
      if (edge && cells[z * width + x] !== 1) open.push([x, z]);
    }
  }
  assert.deepEqual(open, []);
});
