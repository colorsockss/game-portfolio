import { describe, it, expect } from 'vitest';
import { validateProject } from './validation';
import type { Project } from './types';

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

describe('validateProject', () => {
  it('정상 프로젝트는 이슈가 없다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'caster.atk', description: '' }],
    });
    expect(validateProject(p)).toEqual([]);
  });

  it('종류가 달라도 중복 key를 보고한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'power', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'power', expression: '1', description: '' }],
    });
    const issues = validateProject(p);
    expect(issues.some((i) => i.kind === 'duplicate-key' && i.key === 'power')).toBe(true);
  });

  it('잘못된 key 형식을 보고한다', () => {
    const p = project({
      stats: [{ id: 's', key: '2bad', defaults: { caster: 1, target: 1 }, description: '' }],
    });
    const issues = validateProject(p);
    expect(issues.some((i) => i.kind === 'invalid-key' && i.key === '2bad')).toBe(true);
  });

  it('공백이 든 key는 잘못된 형식이다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'a b', value: 1, description: '' }],
    });
    const issues = validateProject(p);
    expect(issues.some((i) => i.kind === 'invalid-key')).toBe(true);
  });

  it('같은 key가 세 번 나와도 중복 이슈는 하나만 보고한다', () => {
    const p = project({
      stats: [
        { id: 's1', key: 'x', defaults: { caster: 1, target: 1 }, description: '' },
        { id: 's2', key: 'x', defaults: { caster: 1, target: 1 }, description: '' },
      ],
      formulas: [{ id: 'f', key: 'x', expression: '1', description: '' }],
    });
    const dups = validateProject(p).filter((i) => i.kind === 'duplicate-key' && i.key === 'x');
    expect(dups).toHaveLength(1);
  });

  it('빈 key는 잘못된 형식이다', () => {
    const p = project({
      stats: [{ id: 's', key: '', defaults: { caster: 1, target: 1 }, description: '' }],
    });
    expect(validateProject(p).some((i) => i.kind === 'invalid-key')).toBe(true);
  });

  it('잘못된 형식이면서 중복인 key는 이슈를 하나만 낸다', () => {
    const p = project({
      stats: [
        { id: 's1', key: '2bad', defaults: { caster: 1, target: 1 }, description: '' },
        { id: 's2', key: '2bad', defaults: { caster: 1, target: 1 }, description: '' },
      ],
    });
    const issues = validateProject(p).filter((i) => i.key === '2bad');
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe('invalid-key');
  });

  it('JS 예약어인 공식 key를 보고한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'default', expression: '1', description: '' }],
    });
    expect(validateProject(p)).toEqual([
      { kind: 'reserved-key', key: 'default', message: "예약된 이름이라 쓸 수 없는 key: 'default'" },
    ]);
  });

  it('생성 코드가 쓰는 이름과 겹치는 상수 key를 보고한다', () => {
    for (const key of ['caster', 'target', 'clamp', 'rand', 'abs', 'Big', 'Formula', 'Math', 'console', '__t1']) {
      const p = project({ constants: [{ id: 'c', key, value: 1, description: '' }] });
      expect(validateProject(p).map((i) => i.kind), key).toEqual(['reserved-key']);
    }
  });

  it('스탯 key는 식별자로 쓰이지 않으므로 예약어 검사를 하지 않는다', () => {
    const p = project({
      stats: [{ id: 's', key: 'default', defaults: { caster: 1, target: 1 }, description: '' }],
    });
    expect(validateProject(p)).toEqual([]);
  });

  it('min 같은 Math 내장 함수 이름은 Math.min으로 나가므로 key로 쓸 수 있다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'min', value: 1, description: '' }],
    });
    expect(validateProject(p)).toEqual([]);
  });

  it('입력 key도 다른 종류와 겹치거나 예약된 이름이면 보고한다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'power', value: 1, description: '' }],
      inputs: [
        { id: 'i1', key: 'power', value: 1, description: '' },
        { id: 'i2', key: 'input', value: 1, description: '' },
      ],
    });
    expect(validateProject(p).map((i) => [i.kind, i.key])).toEqual([
      ['duplicate-key', 'power'],
      ['reserved-key', 'input'],
    ]);
  });
});
