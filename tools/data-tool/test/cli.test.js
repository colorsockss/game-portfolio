import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fixture, loadPuerts } from './helpers.js';

const exec = promisify(execFile);
const cli = (...args) => exec(process.execPath, ['src/cli.js', ...args]);
const schema = [[0, 'id', 'int']];
await mkdir('.test-output', { recursive: true });
const root = await mkdtemp(path.resolve('.test-output/cli-'));
after(() => rm(root, { recursive: true, force: true }));

test('CLI converts a directory and its subdirectories in order, skipping lock files and other formats', async () => {
  const input = path.join(root, 'folder input');
  const output = path.join(root, 'folder output');
  await fixture(path.join(input, 'Zeta.xlsx'), schema, [[2]]);
  await fixture(path.join(input, 'Alpha.XLSX'), schema, [[1]]);
  await fixture(path.join(input, 'nested', 'Nested.xlsx'), schema, [[3]]);
  await writeFile(path.join(input, '~$Alpha.xlsx'), 'Excel lock file');
  await writeFile(path.join(input, 'readme.txt'), 'not a workbook');
  await writeFile(path.join(input, 'Legacy.xls'), 'not an xlsx workbook');
  const { stdout } = await cli(input, '--out', output);
  assert.ok(stdout.indexOf('Alpha:') < stdout.indexOf('Zeta:'));
  assert.ok(stdout.indexOf('Zeta:') < stdout.indexOf('Nested:'));
  assert.match(stdout, /Converted 3 workbook\(s\)/);
  assert.deepEqual((await readdir(path.join(output, 'data'))).sort(), ['Alpha.bytes', 'Alpha.json', 'Nested.bytes', 'Nested.json', 'Zeta.bytes', 'Zeta.json']);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'data/Alpha.json'), 'utf8')), [{ id: 1 }]);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'data/Zeta.json'), 'utf8')), [{ id: 2 }]);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'data/Nested.json'), 'utf8')), [{ id: 3 }]);
  assert.deepEqual((await readdir(output)).sort(), ['data', 'typescript']);
  const [, loaders] = await loadPuerts(output);
  for (const [name, id] of [['Alpha', 1], ['Zeta', 2], ['Nested', 3]]) {
    const bytes = await readFile(path.join(output, 'data', `${name}.bytes`));
    assert.deepEqual(await loaders[`deserialize${name}MessagePack`](bytes), new Map([[id, { id }]]));
  }
});

test('CLI recursive directory conversion skips its output subtree and symbolic links', async () => {
  const input = path.join(root, 'recursive');
  const output = path.join(input, 'generated');
  await fixture(path.join(input, 'Root.xlsx'), schema, [[1]]);
  await fixture(path.join(input, 'sub folder', 'deep', 'Nested.xlsx'), schema, [[2]]);
  await writeFile(path.join(input, 'sub folder', '~$Locked.xlsx'), 'Excel lock file');
  await mkdir(output);
  await writeFile(path.join(output, 'Ignored.xlsx'), 'existing output');
  if (process.platform !== 'win32') {
    await symlink(input, path.join(input, 'loop'), 'dir');
    await symlink(path.join(input, 'Root.xlsx'), path.join(input, 'Alias.xlsx'));
  }
  const { stdout } = await cli(input, '--out', output);
  assert.match(stdout, /Converted 2 workbook\(s\)/);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'data/Nested.json'), 'utf8')), [{ id: 2 }]);
  assert.equal(await readFile(path.join(output, 'Ignored.xlsx'), 'utf8'), 'existing output');
});

test('CLI directory conversion skips hidden entries and node_modules', async () => {
  const input = path.join(root, 'project root');
  const output = path.join(root, 'project root out');
  await fixture(path.join(input, 'Root.xlsx'), schema, [[1]]);
  // 이 항목들은 읽으면 변환이 실패한다.
  for (const skipped of ['.cache/Cached.xlsx', '.git/Tracked.xlsx', 'node_modules/pkg/Package.xlsx', '._Root.xlsx', '.Hidden.xlsx']) {
    await mkdir(path.dirname(path.join(input, skipped)), { recursive: true });
    await writeFile(path.join(input, skipped), 'not a workbook');
  }
  const { stdout } = await cli(input, '--out', output);
  assert.match(stdout, /Converted 1 workbook\(s\)/);
  assert.deepEqual((await readdir(path.join(output, 'data'))).sort(), ['Root.bytes', 'Root.json']);
});

test('CLI rejects duplicate table names across folders before writing any results', async () => {
  const input = path.join(root, 'duplicates');
  const output = path.join(root, 'duplicates-out');
  await fixture(path.join(input, 'Aardvark.xlsx'), schema, [[0]]);
  await fixture(path.join(input, 'one', 'Alpha.xlsx'), schema, [[1]]);
  await fixture(path.join(input, 'two', 'ALPHA.xlsx'), schema, [[2]]);
  await assert.rejects(cli(input, '--out', output), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Duplicate table name/);
    assert.ok(error.stderr.includes(path.join('one', 'Alpha.xlsx')));
    assert.ok(error.stderr.includes(path.join('two', 'ALPHA.xlsx')));
    assert.equal(error.stdout, '');
    return true;
  });
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('CLI validates every directory table name before writing results', async () => {
  const input = path.join(root, 'invalid-name');
  const output = path.join(root, 'invalid-name-out');
  await fixture(path.join(input, 'Alpha.xlsx'), schema, [[1]]);
  await fixture(path.join(input, 'lowercase.xlsx'), schema, [[2]]);
  await assert.rejects(cli(input, '--out', output), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /lowercase\.xlsx: Invalid table name/);
    assert.equal(error.stdout, '');
    return true;
  });
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('CLI rejects empty selections and options that do not apply to the input', async () => {
  const input = path.join(root, 'empty-selection');
  const file = path.join(root, 'option-input', 'Only.xlsx');
  const output = path.join(root, 'empty-selection-out');
  await fixture(file, schema, [[1]]);
  await mkdir(path.join(input, 'nested'), { recursive: true });
  await writeFile(path.join(input, 'nested', '~$Locked.xlsx'), 'Excel lock file');
  await assert.rejects(cli(input, '--out', output), (error) => error.code === 1 && /No \.xlsx files found/.test(error.stderr));
  await assert.rejects(cli(path.dirname(file), '--out', output, '--table', 'Shared'), (error) => error.code === 1 && /--table is only supported/.test(error.stderr));
  await assert.rejects(stat(output), { code: 'ENOENT' });
});

test('CLI reads every workbook before writing, so a failing workbook leaves all earlier output as it was', async () => {
  const input = path.join(root, 'failure');
  const output = path.join(root, 'failure-out');
  const broken = path.join(input, 'Broken.xlsx');
  await fixture(path.join(input, 'Alpha.xlsx'), schema, [[1]]);
  await fixture(broken, schema, [['not an integer']]);
  await fixture(path.join(input, 'Zeta.xlsx'), schema, [[3]]);
  await mkdir(path.join(output, 'data'), { recursive: true });
  await writeFile(path.join(output, 'data/Broken.json'), 'previous output');
  await assert.rejects(cli(input, '--out', output), (error) => {
    assert.equal(error.code, 1);
    assert.ok(error.stderr.includes(broken));
    assert.match(error.stderr, /invalid number/);
    assert.equal(error.stdout, '');
    return true;
  });
  assert.deepEqual(await readdir(path.join(output, 'data')), ['Broken.json']);
  assert.equal(await readFile(path.join(output, 'data/Broken.json'), 'utf8'), 'previous output');
});

test('CLI --big-module reaches the generated loaders of big columns', async () => {
  const file = path.join(root, 'big-option', 'Stats.xlsx');
  const output = path.join(root, 'big-option-out');
  await fixture(file, [[0, 'id', 'int'], [1, 'hp', 'big']], [[1, '1e40']]);
  await assert.rejects(cli(file, '--out', output), (error) => error.code === 1 && /big columns need --big-module/.test(error.stderr));
  await cli(file, '--out', output, '--big-module', '@idle/big-number');
  assert.match(await readFile(path.join(output, 'typescript/portable/Stats.ts'), 'utf8'), /import \{ Big \} from '@idle\/big-number';/);
  assert.match((await cli('--help')).stdout, /--big-module/);
});
