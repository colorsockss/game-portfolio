import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluator';
import type { Project, ActorKey } from '../project/types';

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

const NO_INPUTS: Record<ActorKey, Record<string, number>> = { caster: {}, target: {} };

function ok(r: ReturnType<typeof evaluate>): number {
  if (!r.ok) throw new Error(`평가 실패: ${r.error.type} ${r.error.message}`);
  return r.value;
}

describe('evaluate', () => {
  it('산술 우선순위를 지킨다', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '1 + 2 * 3', description: '' }] });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(7);
  });

  it('액터 입력값으로 stat을 해석한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 10, target: 10 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.atk * 2', description: '' }],
    });
    expect(ok(evaluate('f', p, { caster: { atk: 50 }, target: {} }))).toBe(100);
  });

  it('입력값이 없으면 액터 기본값을 쓴다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 10, target: 3 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.atk * 2', description: '' }],
    });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(20);
  });

  it('caster와 target은 서로 다른 값을 쓴다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 100, target: 30 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.atk - target.atk', description: '' }],
    });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(70);
  });

  it('constant를 해석한다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'mult', value: 3, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: '10 * mult', description: '' }],
    });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(30);
  });

  it('다른 공식을 참조해 재귀 평가한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 100, target: 100 }, description: '' }],
      formulas: [
        { id: '1', key: 'base', expression: 'caster.atk * 2', description: '' },
        { id: '2', key: 'final', expression: 'base + 10', description: '' },
      ],
    });
    expect(ok(evaluate('final', p, NO_INPUTS))).toBe(210);
  });

  it('삼항 + 비교를 평가한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'hp', defaults: { caster: 0, target: 0 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.hp > 0 ? 1 : 0', description: '' }],
    });
    expect(ok(evaluate('f', p, { caster: { hp: 5 }, target: {} }))).toBe(1);
    expect(ok(evaluate('f', p, { caster: { hp: 0 }, target: {} }))).toBe(0);
  });

  it('내장 함수를 호출한다', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'clamp(150, 0, 100)', description: '' }] });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(100);
  });

  it('같은 시드의 rand는 재현 가능하다', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'rand()', description: '' }] });
    const a = evaluate('f', p, NO_INPUTS, { seed: 99 });
    const b = evaluate('f', p, NO_INPUTS, { seed: 99 });
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
  });

  it('0으로 나누면 DivisionByZero', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '1 / 0', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('DivisionByZero');
  });

  it('알 수 없는 식별자는 UnknownIdentifier', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'nope + 1', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownIdentifier');
  });

  it('맨 스탯 key는 UnknownIdentifier', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'atk', description: '' }],
    });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownIdentifier');
  });

  it('알 수 없는 액터는 UnknownIdentifier', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'foo.atk', description: '' }],
    });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownIdentifier');
  });

  it('알 수 없는 스탯은 UnknownIdentifier', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'caster.nope', description: '' }],
    });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownIdentifier');
  });

  it('알 수 없는 함수는 UnknownFunction', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'wat(1)', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownFunction');
  });

  it('인자 수가 틀리면 ArityError', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'pow(2)', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('ArityError');
  });

  it('순환 참조는 CycleError', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'a', expression: 'b + 1', description: '' },
        { id: '2', key: 'b', expression: 'a + 1', description: '' },
      ],
    });
    const r = evaluate('a', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('CycleError');
  });

  it('최종 결과가 불리언이면 TypeError', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '1 > 0', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('TypeError');
  });

  it('없는 공식 key는 UnknownIdentifier', () => {
    const r = evaluate('missing', project(), NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('UnknownIdentifier');
  });

  it('파싱 불가능한 공식은 ParseError', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '1 +', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('ParseError');
  });

  it('NaN을 내는 공식은 TypeError', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: 'sqrt(-1)', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('TypeError');
  });

  it('논리 AND/OR를 평가한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'andf', expression: '(1 > 0) && (2 > 1) ? 1 : 0', description: '' },
        { id: '2', key: 'orf', expression: '(1 > 2) || (2 > 1) ? 1 : 0', description: '' },
      ],
    });
    expect(ok(evaluate('andf', p, NO_INPUTS))).toBe(1);
    expect(ok(evaluate('orf', p, NO_INPUTS))).toBe(1);
  });

  it('논리 연산자는 단축 평가한다', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '(1 > 2) && nope ? 1 : 0', description: '' }] });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(0);
  });

  it('단항 부정을 평가한다', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '!(1 > 0) ? 1 : 0', description: '' }] });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(0);
  });

  it('3단계 공식 체인을 평가한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'a', expression: '2', description: '' },
        { id: '2', key: 'b', expression: 'a * 3', description: '' },
        { id: '3', key: 'c', expression: 'b + 1', description: '' },
      ],
    });
    expect(ok(evaluate('c', p, NO_INPUTS))).toBe(7);
  });

  it('0으로 나머지 연산하면 DivisionByZero', () => {
    const p = project({ formulas: [{ id: '1', key: 'f', expression: '1 % 0', description: '' }] });
    const r = evaluate('f', p, NO_INPUTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('DivisionByZero');
  });

  it('입력은 넘긴 값, 없으면 기본값을 쓴다', () => {
    const p = project({
      inputs: [{ id: 'i', key: 'power', value: 0.5, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'power * 10', description: '' }],
    });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(5);
    expect(ok(evaluate('f', p, NO_INPUTS, { inputs: { power: 2 } }))).toBe(20);
  });

  it('Big 모드의 pow는 정수가 아닌 지수를 거절한다', () => {
    const p = project({
      inputs: [{ id: 'i', key: 'step', value: 2, description: '' }],
      formulas: [{ id: '1', key: 'f', expression: 'pow(3, step)', description: '' }],
      exportSettings: { abilityTypeImport: './a', numeric: 'big' },
    });
    expect(ok(evaluate('f', p, NO_INPUTS))).toBe(9);
    const r = evaluate('f', p, NO_INPUTS, { inputs: { step: 2.5 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatchObject({ type: 'Unsupported', start: 7, end: 11 });
    expect(ok(evaluate('f', { ...p, exportSettings: undefined }, NO_INPUTS, { inputs: { step: 0.5 } }))).toBe(Math.sqrt(3));
  });
});
