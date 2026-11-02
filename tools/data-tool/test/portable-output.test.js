import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { build } from 'esbuild';
import { convertWorkbook, readWorkbook } from '../src/index.js';
import { fixture, allTypesSchema, allTypesRows, packageDirectory, tscPath } from './helpers.js';

const exec = promisify(execFile);

test('copied Node, portable and PuerTS outputs compile and run in projects outside the converter repository', async (t) => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'sheet-baker-portable-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = path.join(root, 'Types.xlsx');
  const generated = path.join(root, 'export');
  await fixture(input, allTypesSchema, allTypesRows);
  await convertWorkbook(input, { out: generated });
  const expected = new Map((await readWorkbook(input)).rows.map((row) => [row.id, row]));
  const bytes = await readFile(path.join(generated, 'data/Types.bytes'));

  for (const target of ['node', 'portable', 'puerts']) {
    const project = path.join(root, `${target} project`);
    await mkdir(path.join(project, 'src'), { recursive: true });
    await cp(path.join(generated, 'typescript', target), path.join(project, 'src/GameData'), { recursive: true });
    // 가져다 쓰는 프로젝트에 설치된 의존성을 흉내 낸다. 이 저장소를 거쳐 찾아지는 것은 없다.
    const dependencies = {
      node: ['@msgpack/msgpack', '@types/node', 'undici-types'],
      portable: ['@msgpack/msgpack'],
      puerts: ['@msgpack/msgpack', 'fast-text-encoding'],
    }[target];
    for (const name of dependencies) {
      await cp(packageDirectory(name), path.join(project, 'node_modules', name), { recursive: true, dereference: true });
    }
    await writeFile(path.join(project, 'package.json'), '{"private":true,"type":"module"}\n');
    await writeFile(path.join(project, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, target: 'ES2020', module: 'NodeNext', moduleResolution: 'NodeNext', types: target === 'node' ? ['node'] : [] },
      include: ['src/**/*.ts'],
    }));
    await writeFile(path.join(project, 'src/main.ts'), target === 'node'
      ? "export { loadTypesMessagePack as load } from './GameData/Types.js';\n"
      : "export { deserializeTypesMessagePack as load } from './GameData/_index.js';\n");
    await exec(process.execPath, [tscPath, '--project', path.join(project, 'tsconfig.json')], { cwd: project });
    const result = await build({
      absWorkingDir: project, entryPoints: ['src/main.ts'], bundle: true, write: false,
      platform: target === 'node' ? 'node' : 'neutral', format: target === 'node' ? 'esm' : 'cjs',
      target: 'es2020', mainFields: ['module', 'main'], metafile: true, logLevel: 'silent',
    });
    for (const source of Object.keys(result.metafile.inputs)) {
      assert.ok(path.resolve(project, source).startsWith(project + path.sep), `Imported outside consuming project: ${source}`);
    }
    if (target === 'node') {
      await writeFile(path.join(project, 'main.mjs'), result.outputFiles[0].contents);
      await writeFile(path.join(project, 'Types.bytes'), bytes);
      const { load } = await import(pathToFileURL(path.join(project, 'main.mjs')).href);
      assert.deepEqual(await load(path.join(project, 'Types.bytes')), expected);
    } else {
      // Node 전역이 없는 엔진에서 빌드한 모듈을 실행해 본다. portable 로더는 UTF-8 폴리필을
      // 들고 오지 않으므로 호스트가 TextEncoder/TextDecoder를 제공하고, PuerTS 로더는 직접 설치한다.
      const utf8 = target === 'portable' ? { TextEncoder, TextDecoder } : {};
      const context = vm.createContext({ module: { exports: {} }, Uint8Array, ArrayBuffer, ...utf8 });
      vm.runInContext(result.outputFiles[0].text, context);
      assert.equal(typeof context.TextEncoder, 'function');
      assert.equal(typeof context.TextDecoder, 'function');
      assert.deepEqual(structuredClone(await context.module.exports.load(Uint8Array.from(bytes).buffer)), expected);
      assert.deepEqual(Object.values(result.metafile.outputs).flatMap((file) => file.imports), []);
    }
  }
});
