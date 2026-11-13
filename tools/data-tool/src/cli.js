#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { convertWorkbooks } from './index.js';
import { validateTableName } from './types.js';

const usage = `sheet-baker — Excel → JSON / indexed MessagePack / Node and PuerTS TypeScript

Usage:
  node src/cli.js <workbook.xlsx> [--out generated] [--table Items]
  node src/cli.js <directory> [--out generated]

Directory inputs include subdirectories, skipping hidden entries and node_modules.
The first worksheet contains data; the second contains the schema.
Schema headers: index, name, type, default (optional), description (optional).
Types: int, uint, long, float, double, bool, string, big; append [] or ? (e.g. int[]?).
Each table needs a unique, non-nullable id field (int, uint, long or string).
A workbook with a single worksheet is a key-value table loaded as one record:
each row is a field (index, name, type, value, description) and value holds its value.
Optional schema checks: ref (table), enum (from Enums.xlsx), range (0..1), length (field), when (field=value or field=a|b).
Output: data/*.json, data/*.bytes,
        typescript/node/*.ts, typescript/puerts/*.ts,
        typescript/{node,puerts}/runtime/*

Options:
  --out, -o        Output directory (default: generated)
  --table, -t      PascalCase table name for a single file (default: workbook filename)
  --big-module     Module that exports Big, imported by loaders of big columns (e.g. @idle/big-number)
  --format         typescript (default) or proto: proto/*.proto, data/*.bytes (Protobuf) and data/data.hash
  --proto-package  proto package of the proto output (e.g. portfolio.mmo.data)
  --csharp-namespace  csharp_namespace option of the proto output (e.g. PortfolioMmo.Data)
  --help, -h      Show help
`;

async function collectInputs(input, { out = 'generated', table, format }) {
  const info = await stat(input);
  if (!info.isDirectory()) {
    if (!info.isFile()) throw new Error(`Input is not a regular file or directory: ${input}`);
    return { files: [input], directory: false };
  }
  if (table !== undefined) throw new Error('--table is only supported for a single .xlsx file; directory conversion uses each filename.');

  const files = [];
  const output = path.resolve(out);
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      // 숨김 항목(.git, macOS ._ 메타데이터)과 설치된 패키지는 워크북 원본이 아니다.
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const filename = path.join(directory, entry.name);
      if (entry.isFile() && !entry.name.startsWith('~$') && path.extname(entry.name).toLowerCase() === '.xlsx') files.push(filename);
      else if (entry.isDirectory() && path.resolve(filename) !== output) await visit(filename);
    }
  }
  await visit(input);
  files.sort();
  // proto 출력은 테이블이 아직 없는 게임도 데이터 해시를 내야 하므로 빈 폴더를 받는다.
  if (files.length === 0 && format !== 'proto') throw new Error(`No .xlsx files found in directory '${input}' or its subdirectories.`);

  // 쓰기 전에 출력 이름을 모두 검증한다. 폴더가 달라도 파일 이름이 겹칠 수 있고,
  // 대소문자를 구분하지 않는 파일 시스템에서도 겹친다. 워크북은 같은 출력 폴더를 공유한다.
  const tables = new Map();
  for (const filename of files) {
    const name = path.basename(filename, path.extname(filename));
    try { validateTableName(name); }
    catch (error) { throw new Error(`${filename}: ${error.message}`, { cause: error }); }
    const key = name.toLowerCase();
    if (tables.has(key)) throw new Error(`Duplicate table name '${name}': '${tables.get(key)}' and '${filename}'. Rename one workbook.`);
    tables.set(key, filename);
  }
  return { files, directory: true };
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' }, table: { type: 'string', short: 't' }, 'big-module': { type: 'string' },
      format: { type: 'string' }, 'proto-package': { type: 'string' }, 'csharp-namespace': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) process.stdout.write(usage);
  else {
    if (positionals.length !== 1) throw new Error('Provide one .xlsx file or directory. Run with --help for usage.');
    const { files, directory } = await collectInputs(positionals[0], values);
    const results = await convertWorkbooks(files.map((input) => ({ input, table: values.table })), {
      out: values.out, bigModule: values['big-module'],
      format: values.format, protoPackage: values['proto-package'], csharpNamespace: values['csharp-namespace'],
    });
    for (const result of results) {
      process.stdout.write(`${result.table}: ${result.rowCount} rows, ${result.fieldCount} fields → ${values.out ?? 'generated'}\n`);
      for (const file of result.files) process.stdout.write(`  ${file}\n`);
    }
    if (directory) process.stdout.write(`Converted ${files.length} workbook(s) → ${values.out ?? 'generated'}\n`);
  }
} catch (error) {
  process.stderr.write(`sheet-baker: ${error.message}\n`);
  process.exitCode = 1;
}
