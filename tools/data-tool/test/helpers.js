import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { build } from 'esbuild';
import vm from 'node:vm';

// npm 워크스페이스는 의존성을 저장소 루트로 끌어올리므로 Node처럼 위쪽으로 찾아 올라간다.
export function packageDirectory(name) {
  for (let dir = path.dirname(fileURLToPath(import.meta.url)); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`Cannot find installed package: ${name}`);
  }
}

export const tscPath = path.join(packageDirectory('typescript'), 'bin/tsc');

// 번들링은 Excel 변환기가 아니라 이를 가져다 쓰는 TypeScript 프로젝트가 맡는다.
export async function bundlePuerts(output) {
  const options = {
    entryPoints: [path.join(output, 'typescript/puerts/_index.ts')],
    bundle: true, write: false, platform: 'neutral', target: 'es2020',
    mainFields: ['module', 'main'], logLevel: 'silent',
  };
  const [commonjs, esm] = await Promise.all([
    build({ ...options, format: 'cjs' }), build({ ...options, format: 'esm' }),
  ]);
  return { commonjs: commonjs.outputFiles[0].text, esm: esm.outputFiles[0].text };
}

export async function loadPuerts(output) {
  const bundles = await bundlePuerts(output);
  // PuerTS와 같은 실행 환경: Node API, require, Buffer, TextEncoder, TextDecoder가 없다.
  const context = vm.createContext({ module: { exports: {} }, Uint8Array, ArrayBuffer });
  vm.runInContext(bundles.commonjs, context);
  const esm = await import(`data:text/javascript;base64,${Buffer.from(bundles.esm).toString('base64')}`);
  return [context.module.exports, esm];
}

// schemaHeader에 검사 열(ref, enum, range, length, when)을 더하면 스키마 행도 그 순서로 값을 적는다.
export async function fixture(filename, schema, rows, header = schema.map((f) => f[1]), schemaHeader = ['index', 'name', 'type', 'default', 'description']) {
  const book = new ExcelJS.Workbook();
  const data = book.addWorksheet('First');
  data.addRows([header, ...rows]);
  const sheet = book.addWorksheet('Second');
  sheet.addRows([schemaHeader, ...schema]);
  await mkdir(path.dirname(filename), { recursive: true });
  await book.xlsx.writeFile(filename);
  return book;
}

export const KEY_VALUE_HEADER = ['index', 'name', 'type', 'value', 'description', 'ref', 'enum', 'range', 'length'];

// 시트가 하나인 키-값 워크북. 행마다 [index, name, type, value, …검사 열]이다.
export async function keyValueFixture(filename, rows, header = KEY_VALUE_HEADER) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('First').addRows([header, ...rows]);
  await mkdir(path.dirname(filename), { recursive: true });
  await book.xlsx.writeFile(filename);
}

export const allTypesSchema = [
  [0, 'id', 'int'], [1, 'unsigned', 'uint'], [2, 'large', 'long'],
  [3, 'single', 'float'], [4, 'precise', 'double'], [5, 'active', 'bool'],
  [6, 'title', 'string'], [7, 'ints', 'int[]'], [8, 'uints', 'uint[]'],
  [9, 'longs', 'long[]'], [10, 'floats', 'float[]'], [11, 'doubles', 'double[]'],
  [12, 'bools', 'bool[]'], [13, 'strings', 'string[]'],
  // 인덱스 14는 폐기된 필드라 빈 슬롯(nil)으로 남는다.
  [15, 'maybeInt', 'int?'], [16, 'maybeLong', 'long?'], [17, 'maybeBool', 'bool?'],
  [18, 'maybeFloat', 'float?'], [19, 'maybeDouble', 'double?'], [20, 'maybeString', 'string?'],
  [21, 'maybeArray', 'int[]?'], [22, 'maybeUint', 'uint?'],
  [23, 'defaultInt', 'int', 42], [24, 'defaultLong', 'long', '9223372036854775807'],
  [25, 'defaultArray', 'string[]', '["기본","value"]'], [26, 'class', 'string', '2026-09-16T00:00:00Z'],
];

export const allTypesRows = [
  [-2147483648, 4294967295, '-9223372036854775808', 0.3, 1.23456789012345, true, '한글 😀 ' + '가'.repeat(256),
    '[1,-2147483648,2147483647]', '[0,4294967295]', '["-9223372036854775808","9223372036854775807"]',
    '[0.1,0.5]', '[1.23456789012345,1e100]', '[true,false]', '["안녕","😀",""]'],
  [2147483647, 0, '9223372036854775807', -1.5, -1e100, false, '""',
    '[]', '[]', '[]', '[]', '[]', '[]', '[]',
    7, '9007199254740993', true, 0.2, 2.25, '선택', '[1,2]', 4294967295],
];
