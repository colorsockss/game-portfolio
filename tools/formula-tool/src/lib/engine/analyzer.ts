import { ACTORS, type Project } from '../project/types';
import type { Node } from './types';
import { type EngineError, engineError } from './errors';
import { parse } from './parser';
import { BIG_UNSUPPORTED, BUILTINS, isBigProject } from './builtins';

export interface Diagnostic {
  formulaKey: string;
  error: EngineError;
}

function walk(node: Node, visit: (n: Node) => void): void {
  visit(node);
  switch (node.kind) {
    case 'unary':
      walk(node.operand, visit);
      break;
    case 'binary':
    case 'logical':
      walk(node.left, visit);
      walk(node.right, visit);
      break;
    case 'conditional':
      walk(node.test, visit);
      walk(node.consequent, visit);
      walk(node.alternate, visit);
      break;
    case 'call':
      node.args.forEach((a) => walk(a, visit));
      break;
  }
}

function inCycle(key: string, deps: Map<string, Set<string>>): boolean {
  const stack = [...(deps.get(key) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === key) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const d of deps.get(cur) ?? []) stack.push(d);
  }
  return false;
}

function identifierError(
  name: string,
  start: number,
  end: number,
  statKeys: Set<string>,
): EngineError {
  const dot = name.indexOf('.');
  if (dot !== -1) {
    const actor = name.slice(0, dot);
    const statKey = name.slice(dot + 1);
    if (!(ACTORS as readonly string[]).includes(actor)) {
      return engineError('UnknownIdentifier', `알 수 없는 액터 '${actor}'`, start, end);
    }
    if (!statKeys.has(statKey)) {
      return engineError('UnknownIdentifier', `알 수 없는 스탯 '${statKey}'`, start, end);
    }
    // 올바른 actor.stat는 knownIds에 들어 있으므로 호출한 쪽은 두 부분이 모두 유효한 채로
    // 여기 오지 않는다. 만약을 대비해 일반 메시지로 넘어간다.
  } else if (statKeys.has(name)) {
    return engineError(
      'UnknownIdentifier',
      `스탯 '${name}'은 caster. 또는 target.으로 참조하세요`,
      start,
      end,
    );
  }
  return engineError('UnknownIdentifier', `알 수 없는 식별자 '${name}'`, start, end);
}

// 식이 숫자 리터럴(앞의 단항 -까지)이면 그 값. Big 모드의 pow 지수를 내보내기 전에 검사하는 데 쓴다.
function literalOf(node: Node): number | null {
  if (node.kind === 'number') return node.value;
  if (node.kind === 'unary' && node.op === '-') {
    const v = literalOf(node.operand);
    return v === null ? null : -v;
  }
  return null;
}

// Big 모드에서 결정적으로 계산할 수 없는 것. 지수가 식이면 실행할 때 Big.pow가 정수인지 확인한다.
function bigModeError(node: Node): EngineError | null {
  if (node.kind === 'binary' && node.op === '%') {
    return engineError('Unsupported', "Big 모드에서 쓸 수 없는 연산자 '%'", node.start, node.end);
  }
  if (node.kind !== 'call') return null;
  if (BIG_UNSUPPORTED.has(node.callee)) {
    return engineError('Unsupported', `Big 모드에서 쓸 수 없는 함수 '${node.callee}'`, node.start, node.end);
  }
  const exponent = node.callee === 'pow' && node.args.length === 2 ? literalOf(node.args[1]) : null;
  if (exponent !== null && !Number.isInteger(exponent)) {
    return engineError('Unsupported', 'Big 모드의 pow는 정수 지수만 받습니다', node.args[1].start, node.args[1].end);
  }
  return null;
}

export function analyze(project: Project): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const statKeys = new Set(project.stats.map((s) => s.key));
  const knownIds = new Set<string>([
    ...project.constants.map((c) => c.key),
    ...project.formulas.map((f) => f.key),
    ...(project.inputs ?? []).map((i) => i.key),
  ]);
  const big = isBigProject(project);
  for (const s of project.stats) {
    for (const actor of ACTORS) knownIds.add(`${actor}.${s.key}`);
  }
  const formulaKeys = new Set(project.formulas.map((f) => f.key));
  const asts = new Map<string, Node>();

  for (const f of project.formulas) {
    const result = parse(f.expression);
    if (!result.ok) {
      diagnostics.push({ formulaKey: f.key, error: result.error });
      continue;
    }
    asts.set(f.key, result.ast);
    walk(result.ast, (node) => {
      if (node.kind === 'identifier' && !knownIds.has(node.name)) {
        diagnostics.push({
          formulaKey: f.key,
          error: identifierError(node.name, node.start, node.end, statKeys),
        });
      }
      if (node.kind === 'call') {
        const b = BUILTINS[node.callee];
        if (!b) {
          diagnostics.push({
            formulaKey: f.key,
            error: engineError('UnknownFunction', `알 수 없는 함수 '${node.callee}'`, node.start, node.end),
          });
        } else if (node.args.length < b.minArgs || node.args.length > b.maxArgs) {
          diagnostics.push({
            formulaKey: f.key,
            error: engineError('ArityError', `함수 '${node.callee}'의 인자 수가 올바르지 않습니다`, node.start, node.end),
          });
        }
      }
      const unsupported = big ? bigModeError(node) : null;
      if (unsupported) diagnostics.push({ formulaKey: f.key, error: unsupported });
    });
  }

  const deps = new Map<string, Set<string>>();
  for (const [key, ast] of asts) {
    const set = new Set<string>();
    walk(ast, (node) => {
      if (node.kind === 'identifier' && formulaKeys.has(node.name)) set.add(node.name);
    });
    deps.set(key, set);
  }
  for (const key of formulaKeys) {
    if (inCycle(key, deps)) {
      diagnostics.push({
        formulaKey: key,
        error: engineError('CycleError', `공식 '${key}'가 순환 참조에 포함되어 있습니다`),
      });
    }
  }

  return diagnostics;
}
