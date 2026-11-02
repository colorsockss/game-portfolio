import { describe, it, expect } from 'vitest';
import { analyze } from './analyzer';
import type { Project } from '../project/types';

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

describe('analyze', () => {
  it('정상 프로젝트는 진단이 없다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.atk * 2', description: '' }],
    });
    expect(analyze(p)).toEqual([]);
  });

  it('파싱 오류 공식을 보고한다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'f', expression: '1 +', description: '' }],
    });
    const d = analyze(p);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ formulaKey: 'f', error: { type: 'ParseError' } });
  });

  it('미정의 식별자를 보고한다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'f', expression: 'ghost + 1', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'UnknownIdentifier')).toBe(true);
  });

  it('맨 스탯 key 사용을 보고한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'atk * 2', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'UnknownIdentifier' && x.error.message.includes('caster'))).toBe(true);
  });

  it('알 수 없는 액터를 보고한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'foo.atk', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.message.includes('액터'))).toBe(true);
  });

  it('알 수 없는 스탯을 보고한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.nope', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.message.includes('스탯'))).toBe(true);
  });

  it('미정의 함수를 보고한다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'f', expression: 'bogus(1)', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'UnknownFunction')).toBe(true);
  });

  it('함수 인자 수 오류를 보고한다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'f', expression: 'pow(2)', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'ArityError')).toBe(true);
  });

  it('순환 참조에 든 공식을 보고한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'a', expression: 'b + 1', description: '' },
        { id: '2', key: 'b', expression: 'a + 1', description: '' },
      ],
    });
    const d = analyze(p);
    const cycleKeys = d.filter((x) => x.error.type === 'CycleError').map((x) => x.formulaKey).sort();
    expect(cycleKeys).toEqual(['a', 'b']);
  });

  it('자기 자신을 참조하는 공식도 순환으로 본다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'a', expression: 'a + 1', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'CycleError' && x.formulaKey === 'a')).toBe(true);
  });

  it('다른 공식을 정상 참조하는 것은 진단이 없다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'final', expression: 'base * 2', description: '' },
      ],
    });
    expect(analyze(p)).toEqual([]);
  });

  it('인자가 너무 많아도 ArityError를 보고한다', () => {
    const p = project({
      formulas: [{ id: '1', key: 'f', expression: 'pow(1, 2, 3)', description: '' }],
    });
    const d = analyze(p);
    expect(d.some((x) => x.error.type === 'ArityError')).toBe(true);
  });

  it('파싱 실패한 공식을 참조해도 참조하는 공식 자체는 깨끗하다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'bad', expression: '1 +', description: '' },
        { id: '2', key: 'good', expression: 'bad * 2', description: '' },
      ],
    });
    const d = analyze(p);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ formulaKey: 'bad', error: { type: 'ParseError' } });
  });

  it('입력 key를 식별자로 받는다', () => {
    const p = project({
      inputs: [{ id: 'i', key: 'power', value: 0.5, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'power * 2', description: '' }],
    });
    expect(analyze(p)).toEqual([]);
  });

  describe('Big 모드', () => {
    const big = (expression: string) =>
      analyze(
        project({
          inputs: [{ id: 'i', key: 'step', value: 1, description: '' }],
          formulas: [{ id: '1', key: 'f', expression, description: '' }],
          exportSettings: { abilityTypeImport: './a', numeric: 'big' },
        }),
      );

    it.each(['pow(2, 3)', 'pow(1.15, step)', 'pow(2, -3)', 'step > 1 ? pow(2, step - 1) : 1'])('%s 는 진단이 없다', (expression) => {
      expect(big(expression)).toEqual([]);
    });

    it.each([
      ['sqrt(4)', "Big 모드에서 쓸 수 없는 함수 'sqrt'"],
      ['round(1.5) + 1', "Big 모드에서 쓸 수 없는 함수 'round'"],
      ['rand()', "Big 모드에서 쓸 수 없는 함수 'rand'"],
      ['7 % 3', "Big 모드에서 쓸 수 없는 연산자 '%'"],
      ['pow(2, 0.5)', 'Big 모드의 pow는 정수 지수만 받습니다'],
      ['pow(2, -1.5)', 'Big 모드의 pow는 정수 지수만 받습니다'],
    ])('%s 는 Unsupported 진단이다', (expression, message) => {
      expect(big(expression)).toEqual([
        { formulaKey: 'f', error: expect.objectContaining({ type: 'Unsupported', message }) },
      ]);
    });

    it('지수 진단은 지수 자리를 짚는다', () => {
      const [d] = big('pow(2, 0.5)');
      expect([d.error.start, d.error.end]).toEqual([7, 10]);
    });

    it('number 모드에서는 같은 식을 진단하지 않는다', () => {
      const p = project({ formulas: [{ id: '1', key: 'f', expression: 'sqrt(4) + pow(2, 0.5) + 7 % 3', description: '' }] });
      expect(analyze(p)).toEqual([]);
    });
  });
});
