// 데스크톱 앱 없이 Formula Lab 프로젝트를 TypeScript로 내보낸다.
// 편집기의 "TS로 내보내기" 버튼과 같은 검증과 코드 생성을 거친다.
// 사용법: node scripts/export-typescript.mjs <project.json> <output.ts>
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const [projectPath, outputPath] = process.argv.slice(2);
if (!projectPath || !outputPath) {
  console.error('Usage: node scripts/export-typescript.mjs <project.json> <output.ts>');
  process.exit(2);
}

const lib = fileURLToPath(new URL('../src/lib', import.meta.url));
const bundle = await build({
  stdin: {
    contents: [
      "export { generateTypeScript } from '$lib/export/codegen';",
      "export { validateProject } from '$lib/project/validation';",
      "export { analyze } from '$lib/engine';",
    ].join('\n'),
    resolveDir: lib,
    loader: 'ts',
  },
  alias: { $lib: lib },
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const { generateTypeScript, validateProject, analyze } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
);

const project = JSON.parse(await readFile(projectPath, 'utf8'));
const problems = [
  ...validateProject(project).map((issue) => issue.message),
  ...analyze(project).map((d) => `공식 '${d.formulaKey}': ${d.error.message}`),
];
const abilityTypeImport = project.exportSettings?.abilityTypeImport ?? '';
if (abilityTypeImport.trim() === '') problems.push('exportSettings.abilityTypeImport가 비어 있습니다');
if (problems.length > 0) {
  console.error(`${path.basename(projectPath)}: 오류가 있어 내보낼 수 없습니다\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

await writeFile(outputPath, generateTypeScript(project, { ...project.exportSettings, abilityTypeImport: abilityTypeImport.trim() }));
console.log(`Exported ${project.formulas.length} formula(s) → ${outputPath}`);
