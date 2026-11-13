import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { encode } from '@msgpack/msgpack';
import { readWorkbook } from './workbook.js';
import { checkReferences, ENUMS_TABLE, readEnums } from './checks.js';
import { stringify, validateTableName, validateMapKey } from './types.js';
import { generateEnums, generateTypeScript } from './generate-typescript.js';
import { generateEntry } from './generate-entry.js';
import { runtimeFiles } from './runtime-files.js';
import { checkProtoFields, generateProto, generateProtoEnums } from './generate-proto.js';
import { encodeRecord, encodeRows } from './protobuf.js';

export { readWorkbook } from './workbook.js';

export async function convertWorkbook(input, { out = 'generated', table = path.basename(input, path.extname(input)), ...options } = {}) {
  const [result] = await convertWorkbooks([{ input, table }], { out, ...options });
  return result;
}

// 워크북을 모두 읽고 검사한 뒤에 쓴다. ref와 enum은 함께 변환하는 워크북 안에서 찾으므로, 하나라도 실패하면
// 아무것도 쓰지 않는다. 위반(enum, range, length, when, ref)은 모아서 한 번에 알린다.
// format이 'proto'면 JSON·MessagePack·TS 대신 `.proto`, Protobuf 바이너리, 데이터 해시를 쓴다(writeProto).
export async function convertWorkbooks(inputs, { out = 'generated', bigModule, format = 'typescript', protoPackage, csharpNamespace } = {}) {
  if (!['typescript', 'proto'].includes(format)) throw new Error(`Unknown format '${format}'; use typescript or proto`);
  const entries = inputs.map(({ input, table = path.basename(input, path.extname(input)) }) => {
    validateTableName(table);
    if (path.extname(input).toLowerCase() !== '.xlsx') throw new Error('Only .xlsx workbooks are supported; save legacy .xls files as .xlsx');
    return { input, table };
  });
  const located = (input, error) => new Error(`${input}: ${error.message}`, { cause: error });
  const violations = [];
  // Enum 정의를 먼저 읽어야 다른 워크북의 enum·when 열을 풀 수 있다.
  let enums;
  const source = entries.find(({ table }) => table === ENUMS_TABLE);
  if (source) {
    try {
      const workbook = await readWorkbook(source.input);
      validateMapKey(workbook.fields, workbook.rows, workbook.rowNumbers, workbook.sheets.data);
      const found = [];
      enums = readEnums(workbook, found);
      violations.push(...found.map((violation) => `${source.input}: ${violation}`));
    } catch (error) { throw located(source.input, error); }
  }
  const tables = [];
  for (const { input, table } of entries.filter((entry) => entry !== source)) {
    let workbook;
    try {
      workbook = await readWorkbook(input, { enums });
      validateMapKey(workbook.fields, workbook.rows, workbook.rowNumbers, workbook.sheets.data);
    } catch (error) { throw located(input, error); }
    violations.push(...workbook.violations.map((violation) => `${input}: ${violation}`));
    tables.push({ table, file: input, workbook });
  }
  checkReferences(tables, violations);
  // 문자열 id 테이블의 id와 그 테이블을 가리키는 ref 열은 id의 리터럴 유니온 타입이 된다(generate-typescript.js).
  const keyed = new Set(tables.filter(({ workbook }) => workbook.fields.some((f) => f.name === 'id' && f.base === 'string')).map(({ table }) => table));
  for (const { table, workbook } of tables) {
    for (const field of workbook.fields) {
      if (field.name === 'id' && keyed.has(table)) field.keyType = `${table}Id`;
      else if (keyed.has(field.ref)) field.keyType = `${field.ref}Id`;
    }
  }
  if (violations.length > 0) throw new Error(`${violations.length} table check(s) failed:\n  ${violations.join('\n  ')}`);

  const output = path.resolve(out);
  if (format === 'proto') return writeProto(output, tables, enums, { protoPackage, csharpNamespace });
  const names = [...tables.map(({ table }) => table), ...(enums ? [ENUMS_TABLE] : [])];
  const entryFiles = await Promise.all(['portable', 'puerts'].map((target) => generateEntry(path.join(output, 'typescript', target), names)));
  const shared = await runtimeFiles();
  const files = new Map();
  for (const { table, workbook: { fields, rows, indexedRows } } of tables) {
    files.set(`data/${table}.json`, stringify(rows) + '\n');
    files.set(`data/${table}.bytes`, encode(indexedRows, { useBigInt64: true }));
    const keys = keyed.has(table) ? rows.map((row) => row.id) : undefined;
    for (const target of ['node', 'portable', 'puerts']) files.set(`typescript/${target}/${table}.ts`, generateTypeScript(table, fields, target, { bigModule, keys }));
  }
  if (enums) for (const target of ['node', 'portable', 'puerts']) files.set(`typescript/${target}/${ENUMS_TABLE}.ts`, generateEnums(enums));
  files.set('typescript/portable/_index.ts', entryFiles[0]);
  files.set('typescript/puerts/_index.ts', entryFiles[1]);
  for (const [name, contents] of shared) files.set(name, contents);
  const pending = new Map(files);
  // 고정 지원 파일은 대상마다 함께 보내되, 바뀌지 않은 사본은 다시 쓰지 않는다.
  for (const [name, contents] of shared) {
    try {
      if (await readFile(path.join(output, name), 'utf8') === contents) pending.delete(name);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeAll(output, pending);
  // 테이블마다 자기 파일과 함께 쓴 공용 파일(_index.ts, runtime/)을 알린다.
  const common = ['typescript/portable/_index.ts', 'typescript/puerts/_index.ts', ...shared.keys()];
  const written = (table) => [...[...files.keys()].filter((f) => f.includes(`/${table}.`)), ...common].map((f) => path.join(output, f));
  const results = tables.map(({ table, workbook }) => ({ table, rowCount: workbook.rows.length, fieldCount: workbook.fields.length, files: written(table) }));
  if (enums) results.unshift({ table: ENUMS_TABLE, rowCount: [...enums.values()].reduce((n, e) => n + e.list.length, 0), fieldCount: enums.size, files: written(ENUMS_TABLE) });
  return results;
}

// 임시 폴더에 모두 쓴 뒤 옮겨, 쓰다 실패해도 반쯤 쓴 파일이 출력에 남지 않게 한다.
async function writeAll(output, files) {
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(path.join(output, '.sheet-baker-'));
  try {
    for (const [name, contents] of files) {
      const filename = path.join(staging, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, contents);
    }
    for (const name of files.keys()) {
      const filename = path.join(output, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await rename(path.join(staging, name), filename);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

/** 데이터 해시를 담는 파일(proto 출력). data/의 다른 파일을 이름 순으로 이은 SHA-256의 앞 8바이트를 16진수 16자로 적는다. */
export const DATA_HASH_FILE = 'data.hash';

/** data/의 파일(이름 → 바이트)에서 데이터 해시 파일의 내용을 만든다. 게임이 data/에 더 쓰는 생성물(맵)도 이것으로 함께 묶는다. */
export function dataHash(files) {
  const hash = createHash('sha256');
  for (const name of [...files.keys()].filter((name) => name !== DATA_HASH_FILE).sort()) hash.update(files.get(name));
  return `${hash.digest('hex').slice(0, 16)}\n`;
}

// proto 출력: proto/<Table>.proto, data/<Table>.bytes, data/data.hash. 워크북이 없어도 해시 파일은 쓴다(테이블이 없는 게임).
async function writeProto(output, tables, enums, names) {
  for (const { table, workbook } of tables) checkProtoFields(table, workbook.fields, enums ?? new Map());
  const files = new Map();
  const data = new Map();
  if (enums) files.set(`proto/${ENUMS_TABLE}.proto`, generateProtoEnums(enums, names));
  for (const { table, workbook: { fields, rows } } of tables) {
    const keyValue = !fields.some((field) => field.name === 'id');
    files.set(`proto/${table}.proto`, generateProto(table, fields, { keyValue, ...names }));
    data.set(`${table}.bytes`, keyValue ? encodeRecord(fields, rows[0]) : encodeRows(fields, rows));
  }
  for (const [name, bytes] of data) files.set(`data/${name}`, bytes);
  files.set(`data/${DATA_HASH_FILE}`, dataHash(data));
  await writeAll(output, files);
  const written = (table) => [...files.keys()].filter((f) => f.endsWith(`/${table}.proto`) || f.endsWith(`/${table}.bytes`)).map((f) => path.join(output, f));
  const results = tables.map(({ table, workbook }) => ({ table, rowCount: workbook.rows.length, fieldCount: workbook.fields.length, files: written(table) }));
  if (enums) results.unshift({ table: ENUMS_TABLE, rowCount: [...enums.values()].reduce((n, e) => n + e.list.length, 0), fieldCount: enums.size, files: written(ENUMS_TABLE) });
  return results;
}
