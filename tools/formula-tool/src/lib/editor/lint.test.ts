import { describe, it, expect } from 'vitest';
import { expressionDiagnostics } from './lint';
import type { Project } from '$lib/project/types';

function project(over: Partial<Project> = {}): Project {
  return {
    schemaVersion: 2,
    name: 'test',
    stats: [],
    constants: [],
    formulas: [],
    ...over,
  };
}

function withFormula(expression: string, extra: Partial<Project> = {}): Project {
  return project({
    ...extra,
    formulas: [
      { id: 'f', key: 'f', expression, description: '' },
      ...(extra.formulas ?? []),
    ],
  });
}

describe('expressionDiagnostics', () => {
  it('정상 수식은 진단이 없다 (저장된 식이 아니라 src를 분석한다)', () => {
    const p = withFormula('ghost', {
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
    });
    expect(expressionDiagnostics('caster.atk * 2', 'f', p)).toEqual([]);
  });

  it('파싱 오류를 error 진단으로 보고한다', () => {
    const p = withFormula('1');
    const diags = expressionDiagnostics('1 +', 'f', p);
    expect(diags).toHaveLength(1);
    expect(diags[0].severity).toBe('error');
  });

  it('미정의 식별자를 진단으로 보고한다', () => {
    const p = withFormula('1');
    const diags = expressionDiagnostics('ghost + 1', 'f', p);
    expect(diags.some((d) => d.message.includes('ghost'))).toBe(true);
  });

  it('진단 위치가 소스 범위 안에 있다', () => {
    const p = withFormula('1');
    const src = 'ghost + 1';
    for (const d of expressionDiagnostics(src, 'f', p)) {
      expect(d.from).toBeGreaterThanOrEqual(0);
      expect(d.to).toBeLessThanOrEqual(src.length);
      expect(d.from).toBeLessThanOrEqual(d.to);
    }
  });

  it('순환 참조는 수식 전체를 표시한다', () => {
    const p = project({
      formulas: [
        { id: 'a', key: 'a', expression: 'b', description: '' },
        { id: 'b', key: 'b', expression: 'a', description: '' },
      ],
    });
    const src = 'b';
    const diags = expressionDiagnostics(src, 'a', p);
    expect(diags.some((d) => d.from === 0 && d.to === src.length)).toBe(true);
  });

  it('존재하지 않는 formulaKey는 빈 배열을 반환한다', () => {
    expect(expressionDiagnostics('1 + 2', 'nonexistent', project())).toEqual([]);
  });

  it('빈 수식은 파싱 오류 진단을 낸다', () => {
    const p = withFormula('1');
    const diags = expressionDiagnostics('', 'f', p);
    expect(diags.length).toBeGreaterThanOrEqual(1);
    for (const d of diags) {
      expect(d.from).toBe(0);
      expect(d.to).toBe(0);
    }
  });
});
