import { analyze } from '$lib/engine';
import type { Project } from '$lib/project/types';
import { validateProject } from '$lib/project/validation';

/** 내보낼 수 없게 하는 문제: 키 검사와 공식 분석의 오류. 편집기의 내보내기와 scripts/export-typescript.mjs가 같은 검사를 거친다. */
export function exportProblems(project: Project): string[] {
  return [
    ...validateProject(project).map((issue) => issue.message),
    ...analyze(project).map((d) => `공식 '${d.formulaKey}': ${d.error.message}`),
  ];
}
