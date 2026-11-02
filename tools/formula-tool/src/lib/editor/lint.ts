import type { Diagnostic } from '@codemirror/lint';
import type { Project } from '$lib/project/types';
import { analyze } from '$lib/engine';

export function expressionDiagnostics(
  src: string,
  formulaKey: string,
  project: Project,
): Diagnostic[] {
  const patched: Project = {
    ...project,
    formulas: project.formulas.map((f) =>
      f.key === formulaKey ? { ...f, expression: src } : f,
    ),
  };

  return analyze(patched)
    .filter((d) => d.formulaKey === formulaKey)
    .map((d) => {
      let from = d.error.start;
      let to = d.error.end;
      // start===end===0은 엔진이 위치 없는 오류(예: CycleError)를 나타내는 표시값이다.
      // CodeMirror가 밑줄을 그을 수 있도록 식 전체로 넓힌다.
      if (from === 0 && to === 0) {
        to = src.length;
      }
      from = Math.max(0, Math.min(from, src.length));
      to = Math.max(from, Math.min(to, src.length));
      return { from, to, severity: 'error' as const, message: d.error.message };
    });
}
