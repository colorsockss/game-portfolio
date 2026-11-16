// MMO의 맵 생성기. mmo/data/의 맵 원본(MapObjectKinds.xlsx와 놓인 것의 텍스트 MapObjects.tsv)을 1 m 칸의 격자로 펴고,
// data-tool의 proto 출력 폴더에 셋을 더한다. 게임의 테이블과 규칙을 아는 코드라 data-tool이 아니라 여기에 둔다(data-tool은
// 워크북을 읽고 검사하는 readTables와 해시를 구하는 dataHash만 내준다).
//   proto/MapGrid.proto   격자 메시지(가로, 세로, 원점, 칸마다 막힘 1바이트). protoc가 C#과 C++을 만든다
//   data/MapGrid.bytes    격자 바이너리. 서버와 두 클라이언트가 읽는다(backlog 65)
//   data/Map.tsv          놓인 것의 목록(종류의 줄과 놓인 줄). 두 엔진의 에디터 도구가 읽는다(backlog 87, 7)
//   preview/Map.svg       미리 보기 그림(구역, 막힌 칸, 부활 지점, 스폰). 해시에 들지 않는다
// 격자와 목록이 data/에 들어가므로 data/data.hash를 다시 구한다. 하나라도 어긋나면 아무것도 쓰지 않는다.
//
//   node mmo/tools/map/map.mjs <mmo/data 폴더> <data-tool의 --out 폴더>
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_HASH_FILE, dataHash, readTables } from '../../../tools/data-tool/src/index.js';

/** 놓인 것의 원본 파일 이름(mmo/data/). */
export const SOURCE = 'MapObjects.tsv';
const ROTATIONS = [0, 90, 180, 270];
const PROTO = `// 자동 생성된 파일 — 직접 수정하지 마세요. mmo/tools/map/map.mjs가 맵 원본에서 만듭니다.
syntax = "proto3";

package portfolio.mmo.data;

option csharp_namespace = "PortfolioMmo.Data";

// 필드의 1 m 칸 격자. 칸 (x, z)는 cells[(z - origin_z) * width + (x - origin_x)]이고, 값이 1이면 막힌 칸이다.
message MapGrid {
  uint32 width = 1;
  uint32 depth = 2;
  sint32 origin_x = 3;
  sint32 origin_z = 4;
  bytes cells = 5;
}
`;

/** 맵을 만들어 out(data-tool의 proto 출력 폴더)에 더한다. 어긋나면 모든 위반을 담아 던지고 아무것도 쓰지 않는다. */
export async function generateMap(source, out) {
  const map = await buildMap(source);
  const files = new Map([
    ['proto/MapGrid.proto', PROTO],
    ['data/MapGrid.bytes', encodeGrid(map)],
    ['data/Map.tsv', listText(map)],
    ['preview/Map.svg', previewSvg(map)],
  ]);
  for (const [name, contents] of files) {
    await mkdir(path.dirname(path.join(out, name)), { recursive: true });
    await writeFile(path.join(out, name), contents);
  }
  const data = new Map();
  for (const name of await readdir(path.join(out, 'data'))) data.set(name, await readFile(path.join(out, 'data', name)));
  await writeFile(path.join(out, 'data', DATA_HASH_FILE), dataHash(data));
  return map;
}

/** 원본을 읽고 검사해 격자를 편다. 쓰지 않는다(테스트가 바로 본다). */
export async function buildMap(source) {
  const inputs = (await readdir(source)).filter((name) => name.endsWith('.xlsx')).sort().map((name) => ({ input: path.join(source, name) }));
  const { tables, enums } = await readTables(inputs);
  const table = (name) => {
    const found = tables.find((entry) => entry.table === name);
    if (!found) throw new Error(`${source}: the map needs the ${name} workbook`);
    return found.workbook.rows;
  };
  const size = table('Constants')[0].fieldSize;
  if (size % 2 !== 0) throw new Error(`Constants: fieldSize must be even, got ${size}`);
  const min = -size / 2;
  const kinds = new Map(table('MapObjectKinds').map((row) => [row.id, row]));
  const zones = table('Zones');
  const spawns = table('Spawns');
  const npcs = table('Npcs');
  const monsters = new Map(table('Monsters').map((row) => [row.id, row]));
  const town = enums.get('ZoneKind').members.get('Town');

  const errors = [];
  const objects = [];
  const lines = (await readFile(path.join(source, SOURCE), 'utf8')).split(/\r?\n/);
  lines.forEach((line, index) => {
    const at = `${SOURCE}:${index + 1}`;
    if (line.trim() === '' || line.startsWith('#')) return;
    const fields = line.split('\t');
    if (fields.length !== 4 || fields.some((field) => !/^-?\d+$/.test(field.trim()))) {
      errors.push(`${at}: write kind, x, z and rotation as four tab-separated integers`);
      return;
    }
    const [kind, x, z, rotation] = fields.map(Number);
    const type = kinds.get(kind);
    if (!type) return errors.push(`${at}: kind ${kind} is not in MapObjectKinds`);
    if (!ROTATIONS.includes(rotation)) return errors.push(`${at}: rotation ${rotation} is not 0, 90, 180 or 270`);
    // 90도와 270도는 가로와 세로가 바뀐다. 위치는 돌린 뒤의 작은 모서리라 돌려도 정수 미터에 놓인다.
    const [width, depth] = rotation % 180 === 0 ? [type.width, type.depth] : [type.depth, type.width];
    if (x < min || z < min || x + width > min + size || z + depth > min + size) {
      return errors.push(`${at}: kind ${kind} at (${x}, ${z}) rotated ${rotation} leaves the field (${min}..${min + size} m)`);
    }
    objects.push({ kind, x, z, rotation, width, depth, blocks: type.blocks });
  });

  const cells = new Uint8Array(size * size);
  const index = (x, z) => (z - min) * size + (x - min);
  for (const object of objects.filter((entry) => entry.blocks)) {
    for (let z = object.z; z < object.z + object.depth; z++) {
      for (let x = object.x; x < object.x + object.width; x++) cells[index(x, z)] = 1;
    }
  }
  const inside = (x, z) => x >= min && z >= min && x < min + size && z < min + size;
  const open = (x, z) => inside(x, z) && cells[index(x, z)] === 0;
  // 칸이 든 구역의 안전 지대 여부. 겹치면 뒤 줄이 이긴다(서버의 FieldMap과 같음).
  const safe = (x, z) => {
    let result = false;
    for (const zone of zones) {
      if (x >= zone.minX && x < zone.maxX && z >= zone.minZ && z < zone.maxZ) result = zone.safe;
    }
    return result;
  };

  // 부활 지점(m)은 막힌 칸 위에 있지 않아야 하고, 무법자의 부활 지점은 마을의 부활 지점에서 걸어서 닿아야 한다.
  const respawns = zones.filter((zone) => zone.kind === town);
  if (respawns.length === 0) errors.push('Zones: the map needs a town row with its respawn points');
  for (const zone of respawns) {
    for (const [name, x, z] of [['respawn', zone.respawnX, zone.respawnZ], ['outlaw respawn', zone.outlawRespawnX, zone.outlawRespawnZ]]) {
      if (!open(x, z)) errors.push(`Zones ${zone.id}: the ${name} point (${x}, ${z}) is on a blocked cell or outside the field`);
    }
  }
  // 스폰의 줄은 몬스터와 채집물(47) 중 하나만 놓는다. 무리의 자리(m)는 막힌 칸 위가 아니어야 하고(채집물도 같음),
  // 몬스터 무리는 안전 지대 밖이어야 한다(몬스터는 안전 지대를 걷지 않음).
  for (const spawn of spawns) {
    if ((spawn.monsterId == null) === (spawn.gatherNodeId == null)) errors.push(`Spawns ${spawn.id}: set exactly one of monsterId and gatherNodeId`);
    else if (!open(spawn.x, spawn.z)) errors.push(`Spawns ${spawn.id}: the group point (${spawn.x}, ${spawn.z}) is on a blocked cell or outside the field`);
    else if (spawn.monsterId != null && safe(spawn.x, spawn.z)) errors.push(`Spawns ${spawn.id}: the monster group point (${spawn.x}, ${spawn.z}) is in a safe zone`);
  }
  // NPC의 자리(m)는 막힌 칸 위가 아니어야 한다(37). 뒤의 항목이 더하는 NPC(경비병 44, 제작 48, 퀘스트 50, 창고 75)도 같다.
  for (const npc of npcs) {
    if (!open(npc.x, npc.z)) errors.push(`Npcs ${npc.id}: the NPC point (${npc.x}, ${npc.z}) is on a blocked cell or outside the field`);
  }
  // 무법자의 부활 지점은 모든 경비병(44. 수치의 몬스터 줄을 가리키는 NPC)의 인식 범위 밖이어야 한다(부활하자마자 다시 죽지 않게).
  for (const npc of npcs.filter((entry) => entry.monsterId != null)) {
    const range = monsters.get(npc.monsterId)?.detectRange ?? 0;
    for (const zone of respawns) {
      if (Math.hypot(zone.outlawRespawnX - npc.x, zone.outlawRespawnZ - npc.z) <= range) {
        errors.push(`Npcs ${npc.id}: the outlaw respawn point (${zone.outlawRespawnX}, ${zone.outlawRespawnZ}) is within the guard's detect range (${range} m)`);
      }
    }
  }
  if (errors.length === 0) {
    // 무법자의 부활 지점, 무리의 자리, NPC의 자리는 마을의 부활 지점에서 걸어서 닿아야 한다.
    const reached = reachable(respawns[0].respawnX, respawns[0].respawnZ, size, min, open);
    for (const zone of respawns) {
      if (!reached[index(zone.outlawRespawnX, zone.outlawRespawnZ)]) {
        errors.push(`Zones ${zone.id}: the outlaw respawn point (${zone.outlawRespawnX}, ${zone.outlawRespawnZ}) cannot be walked to from the town respawn point`);
      }
    }
    for (const spawn of spawns.filter((entry) => !reached[index(entry.x, entry.z)])) {
      errors.push(`Spawns ${spawn.id}: the group point (${spawn.x}, ${spawn.z}) cannot be walked to from the town respawn point`);
    }
    for (const npc of npcs.filter((entry) => !reached[index(entry.x, entry.z)])) {
      errors.push(`Npcs ${npc.id}: the NPC point (${npc.x}, ${npc.z}) cannot be walked to from the town respawn point`);
    }
  }
  if (errors.length > 0) throw new Error(`${errors.length} map check(s) failed:\n  ${errors.join('\n  ')}`);
  return { size, min, cells, objects, kinds, zones, town, spawns, npcs };
}

// 시작 칸에서 걸을 수 있는 칸을 네 방향으로 채운다. 길찾기는 대각선으로 양옆 두 칸이 열려 있을 때만 가므로 닿는 칸이 같다.
function reachable(startX, startZ, size, min, open) {
  const reached = new Uint8Array(size * size);
  const index = (x, z) => (z - min) * size + (x - min);
  const queue = [[startX, startZ]];
  reached[index(startX, startZ)] = 1;
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    for (const [nextX, nextZ] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (open(nextX, nextZ) && !reached[index(nextX, nextZ)]) {
        reached[index(nextX, nextZ)] = 1;
        queue.push([nextX, nextZ]);
      }
    }
  }
  return reached;
}

// MapGrid 메시지의 Protobuf 바이너리(필드 번호 순서, 기본값은 쓰지 않음. protoc가 같은 값에서 내는 바이트와 같다).
export function encodeGrid({ size, min, cells }) {
  const bytes = [];
  const varint = (value) => {
    let n = BigInt.asUintN(64, BigInt(value));
    while (n >= 0x80n) {
      bytes.push(Number(n & 0x7fn) | 0x80);
      n >>= 7n;
    }
    bytes.push(Number(n));
  };
  const zigzag = (value) => ((value << 1) ^ (value >> 31)) >>> 0;
  for (const [number, value] of [[1, size], [2, size], [3, zigzag(min)], [4, zigzag(min)]]) {
    if (value === 0) continue;
    varint(number << 3);
    varint(value);
  }
  varint((5 << 3) | 2);
  varint(cells.length);
  return Buffer.concat([Buffer.from(bytes), Buffer.from(cells)]);
}

// 놓인 것의 목록: 쓰이는 종류의 줄과 놓인 줄. 에디터 도구가 읽고, 레벨 에셋이 낡았는지 견줄 때도 쓴다(87).
function listText({ objects, kinds }) {
  const used = [...new Set(objects.map((object) => object.kind))].sort((a, b) => a - b);
  const kindLines = used.map((id) => {
    const kind = kinds.get(id);
    return `kind\t${id}\t${kind.width}\t${kind.depth}\t${kind.blocks ? 1 : 0}\t${kind.blocksCamera ? 1 : 0}\t${kind.meshKey}`;
  });
  const objectLines = objects.map(({ kind, x, z, rotation }) => `object\t${kind}\t${x}\t${z}\t${rotation}`);
  return [
    '# 자동 생성된 파일 — 직접 수정하지 마세요. mmo/tools/map/map.mjs가 맵 원본(mmo/data/)에서 만듭니다.',
    '# kind\t번호\t가로\t세로(m, 방향 0)\t막는지\t카메라를 막는지\t메시의 키. 놓인 것이 쓰는 종류만 싣는다',
    '# object\t종류\tx\tz(m, 돌린 뒤의 작은 모서리)\t방향(도)',
    ...kindLines,
    ...objectLines,
    '',
  ].join('\n');
}

const ZONE_COLORS = ['#999999', '#3fae5a', '#e08a2c', '#3d7fd6', '#d23c3c'];

// 미리 보기 그림. 1 m가 1단위이고 위쪽이 +z(북)다.
function previewSvg({ size, min, objects, zones, town, spawns, npcs }) {
  const top = min + size;
  const rect = (x, z, width, depth, attributes) => `<rect x="${x - min}" y="${top - (z + depth)}" width="${width}" height="${depth}" ${attributes}/>`;
  const point = (x, z, color) => `<circle cx="${x - min + 0.5}" cy="${top - z - 0.5}" r="3" fill="${color}" stroke="#000" stroke-width="0.5"/>`;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 2}" height="${size * 2}" font-family="sans-serif" font-size="6">`,
    `<rect width="${size}" height="${size}" fill="#f4f1e8"/>`,
  ];
  for (const zone of zones) {
    const color = ZONE_COLORS[zone.kind] ?? ZONE_COLORS[0];
    parts.push(rect(zone.minX, zone.minZ, zone.maxX - zone.minX, zone.maxZ - zone.minZ, `fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="0.8"`));
    parts.push(`<text x="${zone.minX - min + 2}" y="${top - zone.maxZ + 7}" fill="${color}">${zone.id} ${zone.nameKey}</text>`);
  }
  for (const object of objects) {
    parts.push(rect(object.x, object.z, object.width, object.depth, object.blocks ? 'fill="#3b3b3b"' : 'fill="#8fc77a"'));
  }
  for (const zone of zones.filter((entry) => entry.kind === town)) {
    parts.push(point(zone.respawnX, zone.respawnZ, '#2fbf4f'), point(zone.outlawRespawnX, zone.outlawRespawnZ, '#d0302f'));
  }
  for (const spawn of spawns) {
    // 몬스터는 보라(무리 번호·몬스터), 채집물은 갈색(무리 번호·G채집물).
    const [color, label, what] = spawn.monsterId != null ? ['#8a3fd1', '#5a2590', spawn.monsterId] : ['#b07a2a', '#7a5014', `G${spawn.gatherNodeId}`];
    parts.push(point(spawn.x, spawn.z, color), `<text x="${spawn.x - min + 4}" y="${top - spawn.z + 2}" fill="${label}">${spawn.id}·${what}</text>`);
  }
  for (const npc of npcs) {
    parts.push(point(npc.x, npc.z, '#1f6fd1'), `<text x="${npc.x - min + 4}" y="${top - npc.z + 2}" fill="#164f96">N${npc.id}</text>`);
  }
  parts.push(`<text x="4" y="${size - 6}" fill="#333">막힌 칸: 진회색 · 장식: 연두 · 부활 지점: 초록 · 무법자의 부활 지점: 빨강 · 스폰: 보라(무리 번호·몬스터)와 갈색(무리 번호·G채집물) · NPC: 파랑(N번호) · 1 m = 1</text>`, '</svg>', '');
  return parts.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [source, out] = process.argv.slice(2);
  if (!source || !out) {
    console.error('Usage: node mmo/tools/map/map.mjs <mmo/data folder> <data-tool --out folder>');
    process.exit(2);
  }
  try {
    const map = await generateMap(source, out);
    console.log(`Map: ${map.objects.length} object(s) on ${map.size}×${map.size} cells → ${out}`);
  } catch (error) {
    console.error(`map: ${error.message}`);
    process.exit(1);
  }
}
