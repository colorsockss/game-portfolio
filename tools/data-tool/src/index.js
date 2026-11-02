import { mkdir, readFile, writeFile, mkdtemp, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { encode } from '@msgpack/msgpack';
import { readWorkbook } from './workbook.js';
import { checkReferences, ENUMS_TABLE, readEnums } from './checks.js';
import { stringify, validateTableName, validateMapKey } from './types.js';
import { generateEnums, generateTypeScript } from './generate-typescript.js';
import { generateEntry } from './generate-entry.js';
import { runtimeFiles } from './runtime-files.js';

export { readWorkbook } from './workbook.js';

export async function convertWorkbook(input, { out = 'generated', table = path.basename(input, path.extname(input)), bigModule } = {}) {
  const [result] = await convertWorkbooks([{ input, table }], { out, bigModule });
  return result;
}

// 워크북을 모두 읽고 검사한 뒤에 쓴다. ref와 enum은 함께 변환하는 워크북 안에서 찾으므로, 하나라도 실패하면
// 아무것도 쓰지 않는다. 위반(enum, range, length, when, ref)은 모아서 한 번에 알린다.
export async function convertWorkbooks(inputs, { out = 'generated', bigModule } = {}) {
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
  await mkdir(output, { recursive: true });
  const staging = await mkdtemp(path.join(output, '.sheet-baker-'));
  try {
    for (const [name, contents] of pending) {
      const filename = path.join(staging, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await writeFile(filename, contents);
    }
    for (const name of pending.keys()) {
      const filename = path.join(output, name);
      await mkdir(path.dirname(filename), { recursive: true });
      await rename(path.join(staging, name), filename);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  // 테이블마다 자기 파일과 함께 쓴 공용 파일(_index.ts, runtime/)을 알린다.
  const common = ['typescript/portable/_index.ts', 'typescript/puerts/_index.ts', ...shared.keys()];
  const written = (table) => [...[...files.keys()].filter((f) => f.includes(`/${table}.`)), ...common].map((f) => path.join(output, f));
  const results = tables.map(({ table, workbook }) => ({ table, rowCount: workbook.rows.length, fieldCount: workbook.fields.length, files: written(table) }));
  if (enums) results.unshift({ table: ENUMS_TABLE, rowCount: [...enums.values()].reduce((n, e) => n + e.list.length, 0), fieldCount: enums.size, files: written(ENUMS_TABLE) });
  return results;
}
