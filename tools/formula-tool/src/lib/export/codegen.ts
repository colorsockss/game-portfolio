import type { ExportSettings, Project } from '$lib/project/types';
import type { Node } from '$lib/engine';
import { BIG_UNSUPPORTED, BUILTINS, parse } from '$lib/engine';

// 같은 이름의 Math 함수로 내보내는 내장 함수. 나머지(clamp, rand, randInt)는 아래 도우미를 함께 낸다.
const isMathBuiltin = (name: string): boolean =>
  Object.hasOwn(BUILTINS, name) && typeof (Math as unknown as Record<string, unknown>)[name] === 'function';

const HELPER_SOURCE: Record<string, string> = {
  clamp: `function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}`,
  rand: `function rand(...args: number[]): number {
  if (args.length === 0) return Math.random();
  if (args.length === 1) return Math.random() * args[0];
  return args[0] + Math.random() * (args[1] - args[0]);
}`,
  randInt: `function randInt(lo: number, hi: number): number {
  const a = Math.floor(lo);
  const b = Math.floor(hi);
  return a + Math.floor(Math.random() * (b - a + 1));
}`,
};

// Big 모드의 도우미. Big에는 abs가 없고, clamp는 Big.min/max로 만든다.
const BIG_HELPER_SOURCE: Record<string, string> = {
  abs: `function abs(x: Big): Big {
  return Big.sign(x) < 0 ? Big.neg(x) : x;
}`,
  clamp: `function clamp(x: Big, lo: Big, hi: Big): Big {
  return Big.min(Big.max(x, lo), hi);
}`,
};

const BIG_ARITHMETIC: Record<string, string> = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' };
const BIG_COMPARISON: Record<string, string> = { '<': 'lt', '<=': 'lte', '>': 'gt', '>=': 'gte' };

const DEFAULT_BIG_IMPORT = '@idle/big-number';

type Kind = 'big' | 'bool';
const KIND_LABEL: Record<Kind, string> = { big: '수', bool: '불리언' };

const JS_RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'implements', 'interface', 'let', 'package', 'private', 'protected', 'public', 'static',
  'await', 'eval', 'arguments', 'undefined', 'NaN', 'Infinity',
]);

// 생성 코드가 선언하거나 참조하는 이름. 상수·공식 key는 생성 코드에서 식별자가 되므로
// 이 이름과 겹치면 선언이 충돌하거나 공식 함수의 매개변수(caster, target, input)에 가려진다.
const GENERATED_NAMES = new Set([
  'E_AbilityType', 'IAbilityOwner', 'FormulaInput', 'FormulaFn', 'Formula',
  'caster', 'target', 'input', 'given',
  'Math', 'Map', 'Error', 'console', 'Big', 'BigLike',
  ...Object.keys(HELPER_SOURCE),
  ...Object.keys(BIG_HELPER_SOURCE),
]);

// '__'로 시작하는 이름은 생성 코드의 임시 변수(__t1, __caster_atk, __result)용이다.
export function isReservedIdentifier(name: string): boolean {
  return JS_RESERVED.has(name) || GENERATED_NAMES.has(name) || name.startsWith('__');
}

export function generateTypeScript(project: Project, settings: ExportSettings): string {
  const { abilityTypeImport, numeric } = settings;
  if (numeric !== undefined && numeric !== 'number' && numeric !== 'big') {
    throw new Error(`알 수 없는 numeric 설정: ${String(numeric)}`);
  }
  const big = numeric === 'big';
  const bigImport = settings.bigImport || DEFAULT_BIG_IMPORT;
  const numType = big ? 'Big' : 'number';
  const helperSource = big ? BIG_HELPER_SOURCE : HELPER_SOURCE;
  // 디버그 로그는 Big도 사람이 읽는 number로 찍는다.
  const shown = (v: string) => (big ? `Big.toNumber(${v})` : v);
  const inputs = project.inputs ?? [];
  const inputType = big ? 'BigLike' : 'number';
  const constantKeys = new Set(project.constants.map((c) => c.key));
  const inputKeys = new Set(inputs.map((i) => i.key));
  const formulaKeys = new Set(project.formulas.map((f) => f.key));
  const usedHelpers = new Set<string>();
  let readsInput = false;

  function buildFormulaBody(key: string, ast: Node): string {
    const extracts: string[] = [];
    const statMemo = new Map<string, string>();
    let tempCounter = 0;

    interface Translated {
      exec: string;
      log: string;
      // Big 모드에서만 검사한다. 수(big)와 조건·비교의 결과(bool)를 섞어 쓰면 형식 오류다.
      kind: Kind;
    }

    function need(t: Translated, kind: Kind, where: string): void {
      if (big && t.kind !== kind) {
        throw new Error(`형식 오류: ${where} (${KIND_LABEL[kind]} 필요, ${KIND_LABEL[t.kind]} 받음)`);
      }
    }

    function sameKind(a: Translated, b: Translated, where: string): void {
      if (big && a.kind !== b.kind) {
        throw new Error(`형식 오류: ${where} 양쪽의 형식이 다릅니다 (${KIND_LABEL[a.kind]}, ${KIND_LABEL[b.kind]})`);
      }
    }

    function translate(node: Node): Translated {
      switch (node.kind) {
        case 'number': {
          const s = String(node.value);
          return { exec: big ? `Big.from(${s})` : s, log: s, kind: 'big' };
        }
        case 'identifier': {
          const name = node.name;
          const dot = name.indexOf('.');
          if (dot !== -1) {
            let varName = statMemo.get(name);
            if (!varName) {
              const actor = name.slice(0, dot);
              const statKey = name.slice(dot + 1);
              varName = `__${actor}_${statKey}`;
              extracts.push(`const ${varName} = ${actor}.get(E_AbilityType.${statKey});`);
              statMemo.set(name, varName);
            }
            return { exec: varName, log: name + '(${' + shown(varName) + '})', kind: 'big' };
          }
          if (constantKeys.has(name)) {
            return { exec: name, log: name + '(${' + shown(name) + '})', kind: 'big' };
          }
          if (inputKeys.has(name)) {
            let varName = statMemo.get(name);
            if (!varName) {
              varName = `__input_${name}`;
              extracts.push(`const ${varName} = given(input.${name}, '${name}');`);
              statMemo.set(name, varName);
              readsInput = true;
            }
            return { exec: varName, log: name + '(${' + shown(varName) + '})', kind: 'big' };
          }
          if (formulaKeys.has(name)) {
            tempCounter++;
            const varName = `__t${tempCounter}`;
            extracts.push(`const ${varName} = Formula.get(E_AbilityType.${name}, caster, target, input);`);
            return { exec: varName, log: name + '(${' + shown(varName) + '})', kind: 'big' };
          }
          throw new Error(`알 수 없는 식별자: ${name}`);
        }
        case 'unary': {
          const x = translate(node.operand);
          const log = `(${node.op}${x.log})`;
          if (node.op === '!') {
            need(x, 'bool', "'!' 피연산자");
            return { exec: `(!${x.exec})`, log, kind: 'bool' };
          }
          need(x, 'big', "'-' 피연산자");
          return { exec: big ? `Big.neg(${x.exec})` : `(-${x.exec})`, log, kind: 'big' };
        }
        case 'binary': {
          const l = translate(node.left);
          const r = translate(node.right);
          const op = node.op;
          const log = `(${l.log} ${op} ${r.log})`;
          if (!big) {
            const execOp = op === '==' ? '===' : op === '!=' ? '!==' : op;
            const kind = op in BIG_ARITHMETIC || op === '%' ? 'big' : 'bool';
            return { exec: `(${l.exec} ${execOp} ${r.exec})`, log, kind };
          }
          if (op === '%') throw new Error('Big 모드에서 쓸 수 없는 연산자: %');
          if (op === '==' || op === '!=') {
            sameKind(l, r, `'${op}'`);
            if (l.kind === 'bool') {
              return { exec: `(${l.exec} ${op === '==' ? '===' : '!=='} ${r.exec})`, log, kind: 'bool' };
            }
            const eq = `Big.eq(${l.exec}, ${r.exec})`;
            return { exec: op === '==' ? eq : `!${eq}`, log, kind: 'bool' };
          }
          need(l, 'big', `'${op}' 피연산자`);
          need(r, 'big', `'${op}' 피연산자`);
          if (op in BIG_ARITHMETIC) {
            return { exec: `Big.${BIG_ARITHMETIC[op]}(${l.exec}, ${r.exec})`, log, kind: 'big' };
          }
          return { exec: `Big.${BIG_COMPARISON[op]}(${l.exec}, ${r.exec})`, log, kind: 'bool' };
        }
        case 'logical': {
          const l = translate(node.left);
          const r = translate(node.right);
          need(l, 'bool', `'${node.op}' 피연산자`);
          need(r, 'bool', `'${node.op}' 피연산자`);
          return {
            exec: `(${l.exec} ${node.op} ${r.exec})`,
            log: `(${l.log} ${node.op} ${r.log})`,
            kind: 'bool',
          };
        }
        case 'conditional': {
          const t = translate(node.test);
          const c = translate(node.consequent);
          const a = translate(node.alternate);
          need(t, 'bool', "'?:' 조건");
          sameKind(c, a, "'?:' 분기");
          return {
            exec: `(${t.exec} ? ${c.exec} : ${a.exec})`,
            log: `(${t.log} ? ${c.log} : ${a.log})`,
            kind: c.kind,
          };
        }
        case 'call': {
          if (big && BIG_UNSUPPORTED.has(node.callee)) {
            throw new Error(`Big 모드에서 쓸 수 없는 함수: ${node.callee}`);
          }
          const argsTranslated = node.args.map((a) => translate(a));
          const argsExec = argsTranslated.map((a) => a.exec).join(', ');
          const argsLog = argsTranslated.map((a) => a.log).join(', ');
          const log = `${node.callee}(${argsLog})`;
          if (big) {
            for (const a of argsTranslated) need(a, 'big', `'${node.callee}' 인자`);
            if (node.callee === 'min' || node.callee === 'max') {
              // 인자가 셋 이상이면 왼쪽부터 접는다.
              const exec = argsTranslated
                .slice(1)
                .reduce((acc, a) => `Big.${node.callee}(${acc}, ${a.exec})`, argsTranslated[0].exec);
              return { exec, log, kind: 'big' };
            }
            if (node.callee === 'floor') return { exec: `Big.floor(${argsExec})`, log, kind: 'big' };
            if (node.callee === 'pow') {
              // 제곱을 거듭하는 곱셈이라 어느 엔진에서든 같은 비트다. 지수가 정수가 아니면 Big.pow가 던진다.
              const [base, exponent] = argsTranslated;
              return { exec: `Big.pow(${base.exec}, Big.toNumber(${exponent.exec}))`, log, kind: 'big' };
            }
            if (Object.hasOwn(BIG_HELPER_SOURCE, node.callee)) {
              usedHelpers.add(node.callee);
              return { exec: `${node.callee}(${argsExec})`, log, kind: 'big' };
            }
            throw new Error(`알 수 없는 함수: ${node.callee}`);
          }
          if (isMathBuiltin(node.callee)) {
            return { exec: `Math.${node.callee}(${argsExec})`, log, kind: 'big' };
          }
          if (node.callee in HELPER_SOURCE) {
            usedHelpers.add(node.callee);
            if (node.callee === 'rand' || node.callee === 'randInt') {
              tempCounter++;
              const varName = `__t${tempCounter}`;
              extracts.push(`const ${varName} = ${node.callee}(${argsExec});`);
              return {
                exec: varName,
                log: node.callee + '(' + argsLog + ')(${' + varName + '})',
                kind: 'big',
              };
            }
            return { exec: `${node.callee}(${argsExec})`, log, kind: 'big' };
          }
          throw new Error(`알 수 없는 함수: ${node.callee}`);
        }
      }
    }

    const result = translate(ast);
    need(result, 'big', `공식 '${key}'의 결과`);
    const { exec, log } = result;
    const bodyLines: string[] = [];
    for (const ex of extracts) bodyLines.push(`  ${ex}`);
    bodyLines.push(`  const __result = ${exec};`);
    bodyLines.push(`  if (Formula.debug) {`);
    bodyLines.push('    console.log(`' + key + '(${' + shown('__result') + '}) = ' + log + '`);');
    bodyLines.push(`  }`);
    bodyLines.push(`  return __result;`);
    return `const ${key}: FormulaFn = (caster, target, input) => {\n${bodyLines.join('\n')}\n};`;
  }

  const formulaFns = project.formulas.map((f) => {
    const result = parse(f.expression);
    if (!result.ok) {
      throw new Error(`공식 '${f.key}' 파싱 실패: ${result.error.message}`);
    }
    return buildFormulaBody(f.key, result.ast);
  });

  const sections: string[] = [];

  sections.push(
    `// 자동 생성된 파일 — 직접 수정하지 마세요. 프로젝트: ${project.name}\n` +
      `import { E_AbilityType } from '${abilityTypeImport}';` +
      (big ? `\nimport { Big${inputs.length > 0 ? ', type BigLike' : ''} } from '${bigImport}';` : ''),
  );

  sections.push(`export interface IAbilityOwner {\n  get(type: E_AbilityType): ${numType};\n}`);

  // 설명이 주석을 닫지 못하게 한다.
  const inputMembers = inputs.map((i) =>
    (i.description ? `  /** ${i.description.replace(/\*\//g, '* /')} */\n` : '') + `  readonly ${i.key}?: ${inputType};`,
  );
  sections.push(
    '/** 공식을 부르는 쪽이 넘기는 입력. 공식이 읽는 입력을 넘기지 않으면 던진다. */\n' +
      `export interface FormulaInput {${inputMembers.length > 0 ? `\n${inputMembers.join('\n')}\n` : ''}}`,
  );

  sections.push(
    `type FormulaFn = (caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput) => ${numType};`,
  );

  if (project.constants.length > 0) {
    sections.push(
      project.constants.map((c) => `const ${c.key} = ${big ? `Big.from(${c.value})` : c.value};`).join('\n'),
    );
  }

  if (readsInput) {
    sections.push(
      `function given(value: ${inputType} | undefined, key: string): ${numType} {\n` +
        "  if (value === undefined) throw new Error(`공식 입력 '${key}'를 넘기지 않았습니다`);\n" +
        `  return ${big ? 'Big.from(value)' : 'value'};\n` +
        '}',
    );
  }

  for (const name of Object.keys(helperSource)) {
    if (usedHelpers.has(name)) sections.push(helperSource[name]);
  }

  for (const fn of formulaFns) sections.push(fn);

  const mapEntries = project.formulas
    .map((f) => `    [E_AbilityType.${f.key}, ${f.key}],`)
    .join('\n');
  sections.push(
    'export class Formula {\n' +
      '  static debug = false;\n\n' +
      `  private static readonly map = new Map<E_AbilityType, FormulaFn>([\n${mapEntries}\n  ]);\n\n` +
      `  static get(type: E_AbilityType, caster: IAbilityOwner, target: IAbilityOwner, input: FormulaInput = {}): ${numType} {\n` +
      '    const fn = Formula.map.get(type);\n' +
      '    if (!fn) throw new Error(`등록되지 않은 공식: ${type}`);\n' +
      '    return fn(caster, target, input);\n' +
      '  }\n' +
      '}',
  );

  return sections.join('\n\n') + '\n';
}
