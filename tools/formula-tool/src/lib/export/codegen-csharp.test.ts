import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateCSharp } from './codegen-csharp';
import type { Project } from '$lib/project/types';

function project(over: Partial<Project> = {}): Project {
  return { schemaVersion: 3, name: 'test', stats: [], constants: [], formulas: [], ...over };
}

const settings = { namespace: 'Game.Rules', abilityType: 'Game.Data.AbilityType' };

// 능력치, 상수, 입력, 공식 참조, 조건, 내장 함수와 난수를 모두 쓰는 프로젝트.
const golden = project({
  name: 'golden',
  stats: [
    { id: 's1', key: 'attack', defaults: { caster: 10, target: 10 }, description: '' },
    { id: 's2', key: 'defense', defaults: { caster: 5, target: 5 }, description: '' },
  ],
  constants: [{ id: 'c1', key: 'critRate', value: 0.05, description: '치명타 확률' }],
  inputs: [{ id: 'i1', key: 'coefficient', value: 1, description: '스킬 계수' }],
  formulas: [
    { id: 'f1', key: 'damage', expression: 'max(1, caster.attack * coefficient - target.defense) * rand(0.9, 1.1)', description: '피해 <기본>' },
    { id: 'f2', key: 'critical', expression: 'rand() < critRate ? 1.5 : 1', description: '' },
    { id: 'f3', key: 'total', expression: 'round(clamp(damage * critical, 0, 100000)) + randInt(0, 2) * 0', description: '' },
    { id: 'f4', key: 'halved', expression: '-(min(caster.attack, 3, 2) / 2) % 7 + pow(2, 3) + floor(1.5) + ceil(abs(-0.5)) + sqrt(4)', description: '' },
  ],
});

describe('generateCSharp', () => {
  it('정해 둔 글과 같다', () => {
    const expected = readFileSync(new URL('./fixtures/csharp.golden.txt', import.meta.url), 'utf8');
    expect(generateCSharp(golden, settings)).toBe(expected);
  });

  it('정수 리터럴에 .0을 붙여 정수 나눗셈을 막는다', () => {
    const cs = generateCSharp(project({ formulas: [{ id: 'f', key: 'half', expression: '1 / 2', description: '' }] }), settings);
    expect(cs).toContain('(1.0 / 2.0)');
  });

  it('수와 불리언을 섞으면 내보내지 않는다', () => {
    const mixed = project({ formulas: [{ id: 'f', key: 'bad', expression: '1 + (2 > 1)', description: '' }] });
    expect(() => generateCSharp(mixed, settings)).toThrow(/형식 오류/);
  });

  it('Big 모드는 받지 않는다', () => {
    expect(() => generateCSharp(project({ exportSettings: { abilityTypeImport: '', numeric: 'big' } }), settings)).toThrow(/Big 모드/);
  });

  it('PascalCase 이름이 겹치거나 생성 코드의 이름과 같으면 내보내지 않는다', () => {
    const same = project({
      constants: [{ id: 'c', key: 'value', value: 1, description: '' }],
      formulas: [{ id: 'f', key: 'Value', expression: '1', description: '' }],
    });
    expect(() => generateCSharp(same, settings)).toThrow(/C# 이름이 같습니다/);
    const helper = project({ formulas: [{ id: 'f', key: 'clamp', expression: '1', description: '' }] });
    expect(() => generateCSharp(helper, settings)).toThrow(/생성 코드의 이름과 겹칩니다/);
  });
});
