import type { Project } from '$lib/project/types';
import type { Node } from '$lib/engine';
import { parse } from '$lib/engine';

/** C# 내보내기의 설정. 프로젝트의 exportSettings(csharpNamespace, csharpAbilityType)에서 온다. */
export interface CSharpSettings {
  /** 생성 코드의 namespace. */
  namespace: string;
  /** 능력치 enum의 전체 이름(예: PortfolioMmo.Data.AbilityType). 멤버 이름은 능력치 key의 PascalCase다. */
  abilityType: string;
}

// 생성 코드가 선언하는 이름. 공식과 상수의 PascalCase 이름이 이것과 겹치면 안 된다.
const GENERATED_NAMES = new Set(['Formulas', 'FormulaInput', 'IAbilityOwner', 'AbilityType', 'Get', 'Given', 'Clamp', 'Rand', 'RandInt']);

const HELPER_SOURCE: Record<string, string> = {
  clamp: 'private static double Clamp(double x, double lo, double hi) => Math.Min(Math.Max(x, lo), hi);',
  rand: [
    '// rand() → [0,1), rand(a) → [0,a), rand(a,b) → [a,b). 툴의 시뮬레이션과 같다.',
    'private static double Rand(Random random) => random.NextDouble();',
    'private static double Rand(Random random, double a) => random.NextDouble() * a;',
    'private static double Rand(Random random, double a, double b) => a + (random.NextDouble() * (b - a));',
  ].join('\n'),
  randInt: [
    'private static double RandInt(Random random, double lo, double hi)',
    '{',
    '    double a = Math.Floor(lo);',
    '    return a + Math.Floor(random.NextDouble() * (Math.Floor(hi) - a + 1));',
    '}',
  ].join('\n'),
};

// 같은 이름의 C# Math 함수. round는 JS의 Math.round(반은 위로)와 같게 Floor(x + 0.5)로 낸다(C#의 Math.Round는 반을 짝수로 보냄).
const MATH: Record<string, string> = { floor: 'Floor', ceil: 'Ceiling', abs: 'Abs', sqrt: 'Sqrt', pow: 'Pow' };

type Kind = 'number' | 'bool';
const KIND_LABEL: Record<Kind, string> = { number: '수', bool: '불리언' };

const pascal = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);
const xml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const indent = (text: string, spaces: string): string => text.split('\n').map((line) => (line ? spaces + line : line)).join('\n');

function summary(description: string, spaces: string): string {
  const lines = description.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  return [`${spaces}/// <summary>`, ...lines.map((line) => `${spaces}/// ${xml(line)}`), `${spaces}/// </summary>`].join('\n') + '\n';
}

// C#의 double 리터럴. 정수도 .0을 붙여 정수 나눗셈이 되지 않게 한다.
function literal(value: number): string {
  const text = String(value);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

/**
 * 공식을 C#의 정적 함수로 내보낸다(double로 계산, Big 모드는 받지 않음). 난수는 인자로 받은 Random에서만 뽑아,
 * 서버가 주입한 Random과 고정한 씨앗으로 테스트할 수 있다. 조건(?:, &&, ||)은 툴의 시뮬레이션처럼 고른 쪽만 계산하고,
 * 수와 불리언을 섞어 쓰면 내보내지 않는다(C#은 두 형식을 바꾸지 않음).
 */
export function generateCSharp(project: Project, settings: CSharpSettings): string {
  if (project.exportSettings?.numeric === 'big') throw new Error('C# 내보내기는 Big 모드를 지원하지 않습니다');
  if (!settings.namespace.trim() || !settings.abilityType.trim()) throw new Error('C# 내보내기에는 namespace와 능력치 enum 이름이 필요합니다');
  const inputs = project.inputs ?? [];
  const constantKeys = new Set(project.constants.map((c) => c.key));
  const inputKeys = new Set(inputs.map((i) => i.key));
  const formulaKeys = new Set(project.formulas.map((f) => f.key));
  const declared = new Map<string, string>();
  for (const key of [...constantKeys, ...formulaKeys]) {
    const name = pascal(key);
    if (GENERATED_NAMES.has(name)) throw new Error(`'${key}'의 C# 이름 ${name}이 생성 코드의 이름과 겹칩니다`);
    if (declared.has(name)) throw new Error(`'${declared.get(name)}'와 '${key}'의 C# 이름이 같습니다(${name})`);
    declared.set(name, key);
  }
  const usedHelpers = new Set<string>();
  let readsInput = false;

  function translate(node: Node, where: string): { code: string; kind: Kind } {
    const need = (t: { kind: Kind }, kind: Kind, what: string) => {
      if (t.kind !== kind) throw new Error(`형식 오류: ${where}의 ${what} (${KIND_LABEL[kind]} 필요, ${KIND_LABEL[t.kind]} 받음)`);
    };
    switch (node.kind) {
      case 'number':
        return { code: literal(node.value), kind: 'number' };
      case 'identifier': {
        const name = node.name;
        const dot = name.indexOf('.');
        if (dot !== -1) return { code: `${name.slice(0, dot)}.Get(AbilityType.${pascal(name.slice(dot + 1))})`, kind: 'number' };
        if (constantKeys.has(name)) return { code: pascal(name), kind: 'number' };
        if (inputKeys.has(name)) {
          readsInput = true;
          return { code: `Given(input.${pascal(name)}, "${name}")`, kind: 'number' };
        }
        if (formulaKeys.has(name)) return { code: `${pascal(name)}(caster, target, input, random)`, kind: 'number' };
        throw new Error(`알 수 없는 식별자: ${name}`);
      }
      case 'unary': {
        const x = translate(node.operand, where);
        if (node.op === '!') {
          need(x, 'bool', "'!' 피연산자");
          return { code: `(!${x.code})`, kind: 'bool' };
        }
        need(x, 'number', "'-' 피연산자");
        return { code: `(-${x.code})`, kind: 'number' };
      }
      case 'binary': {
        const l = translate(node.left, where);
        const r = translate(node.right, where);
        if (node.op === '==' || node.op === '!=') {
          if (l.kind !== r.kind) throw new Error(`형식 오류: ${where}의 '${node.op}' 양쪽의 형식이 다릅니다`);
          return { code: `(${l.code} ${node.op} ${r.code})`, kind: 'bool' };
        }
        need(l, 'number', `'${node.op}' 피연산자`);
        need(r, 'number', `'${node.op}' 피연산자`);
        const arithmetic = ['+', '-', '*', '/', '%'].includes(node.op);
        return { code: `(${l.code} ${node.op} ${r.code})`, kind: arithmetic ? 'number' : 'bool' };
      }
      case 'logical': {
        const l = translate(node.left, where);
        const r = translate(node.right, where);
        need(l, 'bool', `'${node.op}' 피연산자`);
        need(r, 'bool', `'${node.op}' 피연산자`);
        return { code: `(${l.code} ${node.op} ${r.code})`, kind: 'bool' };
      }
      case 'conditional': {
        const t = translate(node.test, where);
        const c = translate(node.consequent, where);
        const a = translate(node.alternate, where);
        need(t, 'bool', "'?:' 조건");
        if (c.kind !== a.kind) throw new Error(`형식 오류: ${where}의 '?:' 분기의 형식이 다릅니다`);
        return { code: `(${t.code} ? ${c.code} : ${a.code})`, kind: c.kind };
      }
      case 'call': {
        const args = node.args.map((arg) => translate(arg, where));
        for (const arg of args) need(arg, 'number', `'${node.callee}' 인자`);
        const codes = args.map((arg) => arg.code);
        if (node.callee === 'min' || node.callee === 'max') {
          // 인자가 셋 이상이면 왼쪽부터 접는다.
          const method = node.callee === 'min' ? 'Math.Min' : 'Math.Max';
          return { code: codes.slice(1).reduce((acc, code) => `${method}(${acc}, ${code})`, codes[0]), kind: 'number' };
        }
        if (node.callee === 'round') return { code: `Math.Floor(${codes[0]} + 0.5)`, kind: 'number' };
        if (Object.hasOwn(MATH, node.callee)) return { code: `Math.${MATH[node.callee]}(${codes.join(', ')})`, kind: 'number' };
        if (node.callee === 'clamp') {
          usedHelpers.add('clamp');
          return { code: `Clamp(${codes.join(', ')})`, kind: 'number' };
        }
        if (node.callee === 'rand' || node.callee === 'randInt') {
          usedHelpers.add(node.callee);
          return { code: `${pascal(node.callee)}(${['random', ...codes].join(', ')})`, kind: 'number' };
        }
        throw new Error(`알 수 없는 함수: ${node.callee}`);
      }
    }
  }

  const members: string[] = [];
  for (const constant of project.constants) {
    members.push(`${summary(constant.description, '')}private const double ${pascal(constant.key)} = ${literal(constant.value)};`);
  }
  for (const formula of project.formulas) {
    const result = parse(formula.expression);
    if (!result.ok) throw new Error(`공식 '${formula.key}' 파싱 실패: ${result.error.message}`);
    const body = translate(result.ast, `공식 '${formula.key}'`);
    if (body.kind !== 'number') throw new Error(`형식 오류: 공식 '${formula.key}'의 결과 (수 필요, 불리언 받음)`);
    members.push(`${summary(formula.description, '')}public static double ${pascal(formula.key)}(IAbilityOwner caster, IAbilityOwner target, FormulaInput input, Random random) =>\n    ${body.code};`);
  }
  if (readsInput) {
    members.push('private static double Given(double? value, string key) =>\n    value ?? throw new ArgumentException($"Formula input \'{key}\' was not given.", nameof(value));');
  }
  for (const name of Object.keys(HELPER_SOURCE)) {
    if (usedHelpers.has(name)) members.push(HELPER_SOURCE[name]);
  }

  const inputMembers = inputs.map((i) => `${summary(i.description, '')}public double? ${pascal(i.key)} { get; set; }`);
  const sections = [
    `/// <summary>\n/// 공식이 능력치를 읽는 개체.\n/// </summary>\npublic interface IAbilityOwner\n{\n    double Get(AbilityType type);\n}`,
    `/// <summary>\n/// 공식을 부르는 쪽이 넘기는 입력. 공식이 읽는 입력을 넘기지 않으면 던진다.\n/// </summary>\npublic sealed class FormulaInput\n{\n${indent(inputMembers.join('\n\n'), '    ')}${inputMembers.length > 0 ? '\n' : ''}}`,
    `/// <summary>\n/// 공식. 난수는 넘겨받은 random에서만 뽑는다.\n/// </summary>\npublic static class Formulas\n{\n${indent(members.join('\n\n'), '    ')}${members.length > 0 ? '\n' : ''}}`,
  ];
  return `// 자동 생성된 파일 — 직접 수정하지 마세요. 프로젝트: ${project.name}\n`
    + `using System;\nusing AbilityType = ${settings.abilityType};\n\n`
    + `namespace ${settings.namespace}\n{\n${indent(sections.join('\n\n'), '    ')}\n}\n`;
}
