import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import { Big } from '@idle/big-number';
import { generateTypeScript } from './codegen';
import type { ExportSettings, Project } from '$lib/project/types';

function project(over: Partial<Project> = {}): Project {
  return {
    schemaVersion: 3,
    name: 'test',
    stats: [],
    constants: [],
    formulas: [],
    ...over,
  };
}

describe('generateTypeScript', () => {
  it('헤더와 import 줄을 생성한다', () => {
    const ts = generateTypeScript(project({ name: '내 게임' }), { abilityTypeImport: '../game/ability-type' });
    expect(ts).toContain('자동 생성된 파일');
    expect(ts).toContain('프로젝트: 내 게임');
    expect(ts).toContain("import { E_AbilityType } from '../game/ability-type';");
  });

  it('IAbilityOwner 인터페이스를 생성한다', () => {
    const ts = generateTypeScript(project(), { abilityTypeImport: '../t' });
    expect(ts).toContain('export interface IAbilityOwner');
    expect(ts).toContain('get(type: E_AbilityType): number;');
  });

  it('스탯 참조를 actor.get(E_AbilityType.x)로 변환한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'caster.atk - target.atk', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('caster.get(E_AbilityType.atk)');
    expect(ts).toContain('target.get(E_AbilityType.atk)');
  });

  it('공식을 함수로 만들고 Formula 맵에 등록한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'dmg', expression: '1 + 2', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const dmg: FormulaFn = (caster, target, input) => {');
    expect(ts).toContain('[E_AbilityType.dmg, dmg],');
    expect(ts).toContain('export class Formula');
  });

  it('FormulaFn 타입 별칭을 정의하고 맵 타입과 공식 선언에서 재사용한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'dmg', expression: '1 + 2', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('type FormulaFn = (caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput) => number;');
    expect(ts).toContain('new Map<E_AbilityType, FormulaFn>');
    // 인라인 시그니처가 더 이상 등장하지 않아야 한다 (타입 별칭 정의 한 줄만 남는다).
    const inlineSig = '(caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput) => number';
    const occurrences = ts.split(inlineSig).length - 1;
    expect(occurrences).toBe(1);
  });

  it('공식이 다른 공식을 참조하면 Formula.get으로 변환한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'final', expression: 'base * 2', description: '' },
      ],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('Formula.get(E_AbilityType.base, caster, target, input)');
  });

  it('상수를 const로 생성하고 참조한다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'crit_mult', value: 1.5, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: '10 * crit_mult', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const crit_mult = 1.5;');
    expect(ts).toContain('crit_mult');
  });

  it('Math 내장 함수를 Math.*로 변환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: 'floor(3.7)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('Math.floor(3.7)');
  });

  it('clamp는 헬퍼로 변환하고 헬퍼 정의를 포함한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: 'clamp(150, 0, 100)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('clamp(150, 0, 100)');
    expect(ts).toContain('function clamp(x: number, lo: number, hi: number): number');
  });

  it('rand 헬퍼는 가변 인자로 생성된다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: 'rand(1, 10)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('rand(1, 10)');
    expect(ts).toContain('function rand(...args: number[]): number');
  });

  it('쓰이지 않은 헬퍼는 생성하지 않는다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: '1 + 1', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).not.toContain('function clamp');
    expect(ts).not.toContain('function rand');
  });

  it('== 를 === 로 변환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: '(1 == 1) ? 1 : 0', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('===');
  });

  it('공식이 없어도 Formula 클래스를 생성한다', () => {
    const ts = generateTypeScript(project(), { abilityTypeImport: '../t' });
    expect(ts).toContain('export class Formula');
  });

  it('!= 를 !== 로 변환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: '(1 != 2) ? 1 : 0', description: '' }],
    });
    expect(generateTypeScript(p, { abilityTypeImport: '../t' })).toContain('!==');
  });

  it('비교·논리 연산자를 변환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: '(1 > 0) && (2 < 100) ? 1 : 0', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('>');
    expect(ts).toContain('<');
    expect(ts).toContain('&&');
  });

  it('단항 연산자를 변환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: '-1 + 2', description: '' }],
    });
    expect(generateTypeScript(p, { abilityTypeImport: '../t' })).toContain('(-1)');
  });

  it('randInt 헬퍼 정의를 포함한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: 'randInt(1, 10)', description: '' }],
    });
    expect(generateTypeScript(p, { abilityTypeImport: '../t' })).toContain('function randInt(lo: number, hi: number): number');
  });

  it('공식 본문이 __result 변수를 통해 결과를 반환한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'dmg', expression: '1 + 2', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __result = (1 + 2);');
    expect(ts).toContain('return __result;');
  });

  it('Formula 클래스에 static debug = false 필드를 정의한다', () => {
    const ts = generateTypeScript(project(), { abilityTypeImport: '../t' });
    expect(ts).toContain('static debug = false;');
  });

  it('스탯 참조를 함수 본문 최상단에 임시 변수로 추출한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'caster.atk - target.atk', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __caster_atk = caster.get(E_AbilityType.atk);');
    expect(ts).toContain('const __target_atk = target.get(E_AbilityType.atk);');
    expect(ts).toContain('const __result = (__caster_atk - __target_atk);');
  });

  it('같은 (actor, stat) 조합은 한 번만 추출한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'caster.atk * caster.atk', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    const occurrences = ts.split('const __caster_atk = caster.get(E_AbilityType.atk);').length - 1;
    expect(occurrences).toBe(1);
    expect(ts).toContain('const __result = (__caster_atk * __caster_atk);');
  });

  it('다른 공식 호출을 임시 변수로 추출한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'final', expression: 'base * 2', description: '' },
      ],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __t1 = Formula.get(E_AbilityType.base, caster, target, input);');
    expect(ts).toContain('const __result = (__t1 * 2);');
  });

  it('같은 공식을 두 번 참조하면 임시 변수도 두 개 추출한다 (부수효과 보존)', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'doubled', expression: 'base + base', description: '' },
      ],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __t1 = Formula.get(E_AbilityType.base, caster, target, input);');
    expect(ts).toContain('const __t2 = Formula.get(E_AbilityType.base, caster, target, input);');
    expect(ts).toContain('const __result = (__t1 + __t2);');
  });

  it('rand 호출을 임시 변수로 추출한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'r', expression: 'rand(1, 10)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __t1 = rand(1, 10);');
    expect(ts).toContain('const __result = __t1;');
  });

  it('rand가 두 번 등장하면 임시 변수도 두 개 추출한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'r', expression: 'rand(1, 10) + rand(1, 10)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __t1 = rand(1, 10);');
    expect(ts).toContain('const __t2 = rand(1, 10);');
    expect(ts).toContain('const __result = (__t1 + __t2);');
  });

  it('Formula.debug 가드와 console.log를 공식 본문에 포함한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'one', expression: '1', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('if (Formula.debug) {');
    expect(ts).toContain('console.log(`one(${__result}) = 1`);');
  });

  it('스탯 참조를 log 템플릿에 inline 값으로 표시한다', () => {
    const p = project({
      stats: [{ id: 's', key: 'atk', defaults: { caster: 1, target: 1 }, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'caster.atk', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`dmg(${__result}) = caster.atk(${__caster_atk})`);');
  });

  it('상수 참조를 log 템플릿에 inline 값으로 표시한다', () => {
    const p = project({
      constants: [{ id: 'c', key: 'crit_mult', value: 1.5, description: '' }],
      formulas: [{ id: 'f', key: 'dmg', expression: 'crit_mult', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`dmg(${__result}) = crit_mult(${crit_mult})`);');
  });

  it('다른 공식 참조를 log 템플릿에 inline 값으로 표시한다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'final', expression: 'base', description: '' },
      ],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`final(${__result}) = base(${__t1})`);');
  });

  it('Math 내장 함수는 log에서 Math. 접두어 없이 표시한다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'f', expression: 'floor(3.7)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`f(${__result}) = floor(3.7)`);');
  });

  it('rand는 log에서 함수호출 뒤에 결과값을 inline으로 붙인다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'r', expression: 'rand(1, 10)', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`r(${__result}) = rand(1, 10)(${__t1})`);');
  });

  it('== 연산자는 exec에서 ===로 바뀌어도 log에서는 == 그대로다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'eq', expression: '(1 == 1) ? 1 : 0', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('const __result = ((1 === 1) ? 1 : 0);');
    expect(ts).toContain('console.log(`eq(${__result}) = ((1 == 1) ? 1 : 0)`);');
  });

  it('!=도 log에서는 != 그대로다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'ne', expression: '(1 != 2) ? 1 : 0', description: '' }],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: '../t' });
    expect(ts).toContain('console.log(`ne(${__result}) = ((1 != 2) ? 1 : 0)`);');
  });
});

describe('generateTypeScript runtime trace', () => {
  it('생성된 코드를 실행하면 trace 라인이 호출 순서대로 찍힌다', () => {
    const p = project({
      stats: [
        { id: 's1', key: 'atk', defaults: { caster: 100, target: 50 }, description: '' },
        { id: 's2', key: 'def', defaults: { caster: 10, target: 20 }, description: '' },
      ],
      constants: [{ id: 'c', key: 'crit_mult', value: 1.5, description: '' }],
      formulas: [
        { id: '1', key: 'base_attack', expression: 'max(0, caster.atk - target.def)', description: '' },
        { id: '2', key: 'crit_dmg', expression: 'base_attack * crit_mult', description: '' },
      ],
    });
    const ts = generateTypeScript(p, { abilityTypeImport: './ability-type' });
    const { Formula, E_AbilityType } = load(ts, ['atk', 'def', 'base_attack', 'crit_dmg']);
    const caster = { get: (t: string) => ({ atk: 100, def: 10 }[t] ?? 0) };
    const target = { get: (t: string) => ({ atk: 50, def: 20 }[t] ?? 0) };

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });

    Formula.debug = true;
    const result = Formula.get(E_AbilityType.crit_dmg, caster, target);
    spy.mockRestore();

    expect(result).toBe(120);
    expect(logs).toEqual([
      'base_attack(80) = max(0, (caster.atk(100) - target.def(20)))',
      'crit_dmg(120) = (base_attack(80) * crit_mult(1.5))',
    ]);
  });

  it('Formula.debug = false 면 trace를 찍지 않는다', () => {
    const p = project({
      formulas: [{ id: 'f', key: 'one', expression: '1', description: '' }],
    });
    const { Formula, E_AbilityType } = load(generateTypeScript(p, { abilityTypeImport: './ability-type' }), ['one']);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    Formula.debug = false;
    Formula.get(E_AbilityType.one, { get: () => 0 }, { get: () => 0 });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

const BIG: ExportSettings = { abilityTypeImport: '../t', numeric: 'big', bigImport: '@idle/big-number' };

function formulaProject(expression: string, over: Partial<Project> = {}): Project {
  return project({
    formulas: [{ id: 'f', key: 'f', expression, description: '' }],
    ...over,
  });
}

// 생성된 TS를 esbuild로 JS(CommonJS)로 바꿔 실행한다. 생성 파일의 import는 가짜 require가 받는다.
function load(ts: string, enumKeys: string[]) {
  const E_AbilityType = Object.fromEntries(enumKeys.map((k) => [k, k]));
  const { code } = transformSync(ts, { loader: 'ts', format: 'cjs' });
  const module = { exports: {} as Record<string, unknown> };
  const require = (id: string) => (id === '@idle/big-number' ? { Big } : { E_AbilityType });
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return { Formula: module.exports.Formula as FormulaClass, E_AbilityType };
}

interface Owner {
  get(type: string): unknown;
}
interface FormulaClass {
  debug: boolean;
  get(type: string, caster: Owner, target: Owner, input?: Record<string, unknown>): unknown;
}

describe('입력', () => {
  const effects = project({
    stats: [{ id: 's', key: 'attack', defaults: { caster: 100, target: 0 }, description: '' }],
    inputs: [
      { id: 'i1', key: 'power', value: 0.15, description: '효과의 계수 (Effects.power)' },
      { id: 'i2', key: 'unused', value: 0, description: '' },
    ],
    formulas: [
      { id: 'f1', key: 'dot', expression: 'floor(caster.attack * power)', description: '' },
      { id: 'f2', key: 'twice', expression: 'dot * 2', description: '' },
    ],
  });

  it('FormulaInput에 입력을 하나씩 선택 속성으로 두고 설명을 주석으로 단다', () => {
    const ts = generateTypeScript(effects, BIG);
    expect(ts).toContain("import { Big, type BigLike } from '@idle/big-number';");
    expect(ts).toContain(
      'export interface FormulaInput {\n  /** 효과의 계수 (Effects.power) */\n  readonly power?: BigLike;\n  readonly unused?: BigLike;\n}',
    );
    expect(ts).toContain("const __input_power = given(input.power, 'power');");
    expect(generateTypeScript(effects, { abilityTypeImport: '../t' })).toContain('readonly power?: number;');
  });

  it('입력이 없으면 빈 FormulaInput을 만들고 BigLike와 given을 쓰지 않는다', () => {
    const ts = generateTypeScript(formulaProject('1'), BIG);
    expect(ts).toContain('export interface FormulaInput {}');
    expect(ts).toContain("import { Big } from '@idle/big-number';");
    expect(ts).not.toContain('function given');
  });

  it('설명의 */는 주석을 닫지 못한다', () => {
    const p = project({ inputs: [{ id: 'i', key: 'x', value: 0, description: 'a */ b' }] });
    expect(generateTypeScript(p, BIG)).toContain('/** a * / b */');
  });

  it('넘긴 입력을 읽고 다른 공식에도 그대로 넘긴다', () => {
    const { Formula } = load(generateTypeScript(effects, BIG), ['attack', 'dot', 'twice']);
    const caster = { get: () => Big.from(1234) };
    expect(Formula.get('twice', caster, caster, { power: 0.15 })).toEqual(Big.mul(Big.floor(Big.mul(1234, 0.15)), 2));
    const asNumber = load(generateTypeScript(effects, { abilityTypeImport: '../t' }), ['attack', 'dot', 'twice']);
    expect(asNumber.Formula.get('twice', { get: () => 1234 }, { get: () => 0 }, { power: 0.15 })).toBe(370);
  });

  it('공식이 읽는 입력을 넘기지 않으면 던진다', () => {
    const { Formula } = load(generateTypeScript(effects, BIG), ['attack', 'dot', 'twice']);
    const caster = { get: () => Big.from(1) };
    expect(() => Formula.get('dot', caster, caster)).toThrow("공식 입력 'power'를 넘기지 않았습니다");
  });
});

describe('number 모드 출력', () => {
  const golden = project({
    name: 'golden',
    stats: [
      { id: 's1', key: 'attack', defaults: { caster: 16, target: 12 }, description: '' },
      { id: 's2', key: 'defense', defaults: { caster: 4, target: 3 }, description: '' },
    ],
    constants: [
      { id: 'c1', key: 'minDamage', value: 1, description: '' },
      { id: 'c2', key: 'critMult', value: 1.5, description: '' },
    ],
    formulas: [
      { id: 'f1', key: 'base', expression: 'max(minDamage, caster.attack - target.defense)', description: '' },
      { id: 'f2', key: 'shaped', expression: 'clamp(floor(base * critMult), -abs(target.defense), min(100, 200, 300))', description: '' },
      {
        id: 'f3',
        key: 'branchy',
        expression: '(caster.attack >= 10 && !(target.defense == 3)) || base != 1 ? -base % 7 : rand(1, 10) + randInt(1, 6) / 2',
        description: '',
      },
    ],
  });
  // number 모드의 출력을 저장한 파일이다. 생성 코드의 모양을 바꾸면(60의 입력 인자) 다시 쓴다.
  const expected = readFileSync(new URL('./fixtures/number-mode.golden.txt', import.meta.url), 'utf8');

  it('numeric이 없으면 이전과 같은 출력을 만든다', () => {
    expect(generateTypeScript(golden, { abilityTypeImport: '../ability-type' })).toBe(expected);
  });

  it('numeric이 number여도 같은 출력을 만든다', () => {
    expect(generateTypeScript(golden, { abilityTypeImport: '../ability-type', numeric: 'number' })).toBe(expected);
  });

  it('알 수 없는 numeric 값은 거절한다', () => {
    const settings = { abilityTypeImport: '../t', numeric: 'Big' } as unknown as ExportSettings;
    expect(() => generateTypeScript(project(), settings)).toThrow('알 수 없는 numeric 설정: Big');
  });
});

describe('Big 모드', () => {
  const damage = project({
    stats: [
      { id: 's1', key: 'attack', defaults: { caster: 16, target: 12 }, description: '' },
      { id: 's2', key: 'defense', defaults: { caster: 4, target: 3 }, description: '' },
    ],
    constants: [{ id: 'c', key: 'minDamage', value: 1, description: '' }],
    formulas: [
      { id: 'f', key: 'damage', expression: 'max(minDamage, caster.attack - target.defense)', description: '' },
    ],
  });

  it('피해 공식을 Big 연산으로 만든다', () => {
    const ts = generateTypeScript(damage, BIG);
    expect(ts).toContain("import { Big } from '@idle/big-number';");
    expect(ts).toContain('get(type: E_AbilityType): Big;');
    expect(ts).toContain('type FormulaFn = (caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput) => Big;');
    expect(ts).toContain('const minDamage = Big.from(1);');
    expect(ts).toContain('const __result = Big.max(minDamage, Big.sub(__caster_attack, __target_defense));');
    expect(ts).toContain(
      'static get(type: E_AbilityType, caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput = {}): Big {',
    );
    expect(ts).not.toContain('Math.');
  });

  it('bigImport가 없으면 @idle/big-number를 쓴다', () => {
    const ts = generateTypeScript(damage, { abilityTypeImport: '../t', numeric: 'big' });
    expect(ts).toContain("import { Big } from '@idle/big-number';");
  });

  it('bigImport를 import 경로로 쓴다', () => {
    const ts = generateTypeScript(damage, { ...BIG, bigImport: '../big.js' });
    expect(ts).toContain("import { Big } from '../big.js';");
  });

  it('공식 참조는 Big을 돌려주는 Formula.get이다', () => {
    const p = project({
      formulas: [
        { id: '1', key: 'base', expression: '10', description: '' },
        { id: '2', key: 'final', expression: 'base * 2', description: '' },
      ],
    });
    const ts = generateTypeScript(p, BIG);
    expect(ts).toContain('const __t1 = Formula.get(E_AbilityType.base, caster, target, input);');
    expect(ts).toContain('const __result = Big.mul(__t1, Big.from(2));');
  });

  it.each([
    ['1 + 2', 'Big.add(Big.from(1), Big.from(2))'],
    ['1 - 2', 'Big.sub(Big.from(1), Big.from(2))'],
    ['2 * 3', 'Big.mul(Big.from(2), Big.from(3))'],
    ['6 / 3', 'Big.div(Big.from(6), Big.from(3))'],
    ['-(1 + 2)', 'Big.neg(Big.add(Big.from(1), Big.from(2)))'],
    ['1.5', 'Big.from(1.5)'],
    ['min(1, 2)', 'Big.min(Big.from(1), Big.from(2))'],
    ['max(1, 2)', 'Big.max(Big.from(1), Big.from(2))'],
    ['max(7)', 'Big.from(7)'],
    ['min(1, 2, 3)', 'Big.min(Big.min(Big.from(1), Big.from(2)), Big.from(3))'],
    ['max(1, 2, 3, 4)', 'Big.max(Big.max(Big.max(Big.from(1), Big.from(2)), Big.from(3)), Big.from(4))'],
    ['floor(3.7)', 'Big.floor(Big.from(3.7))'],
    ['pow(2, 3)', 'Big.pow(Big.from(2), Big.toNumber(Big.from(3)))'],
    ['pow(1.15, -2)', 'Big.pow(Big.from(1.15), Big.toNumber(Big.neg(Big.from(2))))'],
    ['abs(-3)', 'abs(Big.neg(Big.from(3)))'],
    ['clamp(150, 0, 100)', 'clamp(Big.from(150), Big.from(0), Big.from(100))'],
    ['(1 < 2) ? 1 : 0', '(Big.lt(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    ['(1 <= 2) ? 1 : 0', '(Big.lte(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    ['(1 > 2) ? 1 : 0', '(Big.gt(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    ['(1 >= 2) ? 1 : 0', '(Big.gte(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    ['(1 == 2) ? 1 : 0', '(Big.eq(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    ['(1 != 2) ? 1 : 0', '(!Big.eq(Big.from(1), Big.from(2)) ? Big.from(1) : Big.from(0))'],
    [
      '(1 < 2 && 2 < 3) || !(1 < 3) ? 1 : 0',
      '(((Big.lt(Big.from(1), Big.from(2)) && Big.lt(Big.from(2), Big.from(3))) || (!Big.lt(Big.from(1), Big.from(3)))) ? Big.from(1) : Big.from(0))',
    ],
    [
      '((1 < 2) == (2 < 3)) ? 1 : 0',
      '((Big.lt(Big.from(1), Big.from(2)) === Big.lt(Big.from(2), Big.from(3))) ? Big.from(1) : Big.from(0))',
    ],
  ])('%s 를 Big 연산으로 바꾼다', (expression, exec) => {
    expect(generateTypeScript(formulaProject(expression), BIG)).toContain(`const __result = ${exec};`);
  });

  it('abs와 clamp는 생성 파일 안의 도우미 함수로 만든다', () => {
    const ts = generateTypeScript(formulaProject('clamp(abs(-3), 0, 100)'), BIG);
    expect(ts).toContain('function abs(x: Big): Big {');
    expect(ts).toContain('function clamp(x: Big, lo: Big, hi: Big): Big {');
    expect(ts).not.toContain('function rand');
  });

  it('쓰지 않은 도우미 함수는 만들지 않는다', () => {
    const ts = generateTypeScript(formulaProject('1 + 1'), BIG);
    expect(ts).not.toContain('function abs');
    expect(ts).not.toContain('function clamp');
  });

  it.each(['sqrt(4)', 'round(1.5)', 'ceil(1.5)', 'rand()', 'rand(1, 10)', 'randInt(1, 6)'])(
    '%s 는 거절한다',
    (expression) => {
      const name = expression.slice(0, expression.indexOf('('));
      expect(() => generateTypeScript(formulaProject(expression), BIG)).toThrow(
        `Big 모드에서 쓸 수 없는 함수: ${name}`,
      );
    },
  );

  it('% 연산자는 거절한다', () => {
    expect(() => generateTypeScript(formulaProject('7 % 3'), BIG)).toThrow('Big 모드에서 쓸 수 없는 연산자: %');
  });

  it.each([
    '1 + (1 < 2)',
    '-(1 < 2)',
    'abs(1 < 2)',
    'max(1, 2 < 3)',
    '(1 < 2) < 3',
    '(1 < 2) == 1',
    '1 ? 2 : 3',
    '!1 ? 2 : 3',
    '(1 < 2) && 3',
    '1 || (2 < 3) ? 1 : 0',
    '(1 < 2) ? 1 : (2 < 3)',
    '1 < 2',
    'pow(2, 1 < 2)',
  ])('%s 는 형식 오류다', (expression) => {
    expect(() => generateTypeScript(formulaProject(expression), BIG)).toThrow('형식 오류');
  });

  describe('실행', () => {
    const keys = ['attack', 'defense', 'damage', 'base', 'shaped', 'branchy'];
    const richProject = project({
      stats: [
        { id: 's1', key: 'attack', defaults: { caster: 16, target: 12 }, description: '' },
        { id: 's2', key: 'defense', defaults: { caster: 4, target: 3 }, description: '' },
      ],
      constants: [
        { id: 'c1', key: 'minDamage', value: 1, description: '' },
        { id: 'c2', key: 'critMult', value: 1.5, description: '' },
      ],
      formulas: [
        { id: 'f0', key: 'damage', expression: 'max(minDamage, caster.attack - target.defense)', description: '' },
        { id: 'f1', key: 'base', expression: 'max(minDamage, caster.attack - target.defense)', description: '' },
        { id: 'f2', key: 'shaped', expression: 'clamp(floor(base * critMult), -abs(target.defense), min(100, 200, 300))', description: '' },
        {
          id: 'f3',
          key: 'branchy',
          expression: '(caster.attack >= 10 && !(target.defense == 3)) || base != 1 ? -base / 4 : abs(caster.attack - 50)',
          description: '',
        },
      ],
    });
    const owners = (attack: number, defense: number) => ({
      caster: { get: (t: string) => (t === 'attack' ? Big.from(attack) : Big.from(0)) },
      target: { get: (t: string) => (t === 'defense' ? Big.from(defense) : Big.from(0)) },
    });
    const plain = (attack: number, defense: number) => ({
      caster: { get: (t: string) => (t === 'attack' ? attack : 0) },
      target: { get: (t: string) => (t === 'defense' ? defense : 0) },
    });

    it.each([
      [16, 12],
      [3, 12],
      [100, 5],
      [10, 3],
    ])('caster.attack=%d, target.defense=%d 에서 number 모드와 같은 값을 낸다', (attack, defense) => {
      const asNumber = load(generateTypeScript(richProject, { abilityTypeImport: '../t' }), keys);
      const asBig = load(generateTypeScript(richProject, BIG), keys);
      const n = plain(attack, defense);
      const b = owners(attack, defense);
      for (const key of ['damage', 'base', 'shaped', 'branchy']) {
        const expected = asNumber.Formula.get(key, n.caster, n.target);
        const actual = asBig.Formula.get(key, b.caster, b.target) as Big;
        expect(Big.toNumber(actual), key).toBe(expected);
      }
    });

    it('피해 공식은 16 / 12 에서 4, 3 / 12 에서 최소 피해 1이다', () => {
      const { Formula } = load(generateTypeScript(damage, BIG), ['attack', 'defense', 'damage']);
      expect(Big.toNumber(Formula.get('damage', owners(16, 12).caster, owners(16, 12).target) as Big)).toBe(4);
      expect(Big.toNumber(Formula.get('damage', owners(3, 12).caster, owners(3, 12).target) as Big)).toBe(1);
    });

    it('디버그 로그에는 값을 number로 찍는다', () => {
      const { Formula } = load(generateTypeScript(damage, BIG), ['attack', 'defense', 'damage']);
      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((msg: string) => {
        logs.push(msg);
      });
      Formula.debug = true;
      const o = owners(16, 12);
      Formula.get('damage', o.caster, o.target);
      spy.mockRestore();
      expect(logs).toEqual(['damage(4) = max(minDamage(1), (caster.attack(16) - target.defense(12)))']);
    });

    it('pow는 Big.pow와 비트까지 같은 값을 낸다', () => {
      const p = formulaProject('floor(base * pow(growth, step))', {
        constants: [
          { id: 'c1', key: 'base', value: 100, description: '' },
          { id: 'c2', key: 'growth', value: 1.15, description: '' },
        ],
        inputs: [{ id: 'i', key: 'step', value: 0, description: '' }],
      });
      const { Formula } = load(generateTypeScript(p, BIG), ['f']);
      const none = owners(0, 0);
      for (const step of [0, 1, 2, 10, 37, 100, 1000, -3]) {
        const actual = Formula.get('f', none.caster, none.target, { step }) as Big;
        expect(actual, `step ${step}`).toEqual(Big.floor(Big.mul(100, Big.pow(1.15, step))));
      }
      // 100 × 1.15^10000 ≈ 9.5e608은 double(1.8e308)을 넘는다.
      expect((Formula.get('f', none.caster, none.target, { step: 10_000 }) as Big).e).toBe(608);
    });

    it('pow의 지수가 정수가 아니면 실행할 때 던진다', () => {
      const p = formulaProject('pow(2, step)', { inputs: [{ id: 'i', key: 'step', value: 0, description: '' }] });
      const { Formula } = load(generateTypeScript(p, BIG), ['f']);
      expect(() => Formula.get('f', owners(0, 0).caster, owners(0, 0).target, { step: 1.5 })).toThrow('integer exponent');
    });

    it('조건식은 입력에 따라 분기한다', () => {
      const p = formulaProject('advantage > 0 ? strong : advantage < 0 ? weak : 1', {
        constants: [
          { id: 'c1', key: 'strong', value: 1.5, description: '' },
          { id: 'c2', key: 'weak', value: 0.75, description: '' },
        ],
        inputs: [{ id: 'i', key: 'advantage', value: 0, description: '' }],
      });
      const { Formula } = load(generateTypeScript(p, BIG), ['f']);
      const none = owners(0, 0);
      const multiplier = (advantage: number) => Big.toNumber(Formula.get('f', none.caster, none.target, { advantage }) as Big);
      expect([multiplier(1), multiplier(0), multiplier(-1)]).toEqual([1.5, 1, 0.75]);
    });

        it('0으로 나누면 던진다', () => {
      const { Formula } = load(generateTypeScript(formulaProject('1 / (1 - 1)'), BIG), ['f']);
      expect(() => Formula.get('f', owners(0, 0).caster, owners(0, 0).target)).toThrow();
    });
  });
});
