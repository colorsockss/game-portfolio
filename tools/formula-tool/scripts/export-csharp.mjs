// 데스크톱 앱 없이 Formula Lab 프로젝트를 C#으로 내보낸다(double, MMO 서버용). TS 내보내기와 같은 검증을 거친다.
// 설정은 프로젝트의 exportSettings.csharpNamespace와 csharpAbilityType이다.
// 사용법: node scripts/export-csharp.mjs <project.json> <output.cs>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const [projectPath, outputPath] = process.argv.slice(2);
if (!projectPath || !outputPath) {
  console.error('Usage: node scripts/export-csharp.mjs <project.json> <output.cs>');
  process.exit(2);
}

const lib = fileURLToPath(new URL('../src/lib', import.meta.url));
const bundle = await build({
  stdin: {
    contents: [
      "export { generateCSharp } from '$lib/export/codegen-csharp';",
      "export { exportProblems } from '$lib/export/check';",
    ].join('\n'),
    resolveDir: lib,
    loader: 'ts',
  },
  alias: { $lib: lib },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { generateCSharp, exportProblems } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
);

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const problems = exportProblems(project);
const namespace = project.exportSettings?.csharpNamespace?.trim() ?? '';
const abilityType = project.exportSettings?.csharpAbilityType?.trim() ?? '';
if (namespace === '') problems.push('exportSettings.csharpNamespace가 비어 있습니다');
if (abilityType === '') problems.push('exportSettings.csharpAbilityType이 비어 있습니다');
if (problems.length > 0) {
  console.error(`${path.basename(projectPath)}: 오류가 있어 내보낼 수 없습니다\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

await writeFile(outputPath, generateCSharp(project, { namespace, abilityType }));
console.log(`Exported ${project.formulas.length} formula(s) → ${outputPath}`);
