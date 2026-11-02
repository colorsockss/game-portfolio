import { describe, it, expect } from 'vitest';
import { expressionCompletions } from './completions';
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

describe('expressionCompletions', () => {
  it('스탯은 caster./target. 후보 두 개를 만든다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 10, target: 10 }, description: '' }],
      constants: [{ id: 'c', key: 'mult', value: 2, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: '1', description: '' }],
    });
    const labels = expressionCompletions(p).map((c) => c.label);
    expect(labels).toContain('caster.atk');
    expect(labels).toContain('target.atk');
    expect(labels).toContain('mult');
    expect(labels).toContain('dmg');
  });

  it('내장 함수를 후보로 포함한다', () => {
    const labels = expressionCompletions(project()).map((c) => c.label);
    expect(labels).toContain('min');
    expect(labels).toContain('clamp');
    expect(labels).toContain('rand');
  });

  it('항목 종류를 detail로 구분한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 10, target: 10 }, description: '' }],
      constants: [{ id: 'c', key: 'mult', value: 2, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: '1', description: '' }],
    });
    const items = expressionCompletions(p);
    expect(items.find((c) => c.label === 'caster.atk')?.detail).toContain('스탯');
    expect(items.find((c) => c.label === 'mult')?.detail).toContain('상수');
    expect(items.find((c) => c.label === 'dmg')?.detail).toContain('공식');
  });

  it('내장 함수는 괄호까지 삽입한다', () => {
    const min = expressionCompletions(project()).find((c) => c.label === 'min');
    expect(min?.apply).toBe('min()');
  });

  it('빈 프로젝트도 내장 함수만으로 후보를 만든다', () => {
    expect(expressionCompletions(project()).length).toBeGreaterThan(0);
  });

  it('설명이 비어 있으면 info를 생략한다', () => {
    const p = project({
      stats: [
        { id: 's1', key: 'atk', defaults: { caster: 10, target: 10 }, description: '' },
        { id: 's2', key: 'def', defaults: { caster: 5, target: 5 }, description: '방어 수치' },
      ],
    });
    const items = expressionCompletions(p);
    expect(items.find((c) => c.label === 'caster.atk')?.info).toBeUndefined();
    expect(items.find((c) => c.label === 'caster.def')?.info).toBe('방어 수치');
  });
});
