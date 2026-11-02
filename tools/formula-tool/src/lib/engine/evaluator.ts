import type { Node } from './types';
import { type EngineError, engineError } from './errors';
import { parse } from './parser';
import { BUILTINS, isBigProject } from './builtins';
import { createRng, type Rng } from './rng';
import { ACTORS, type ActorKey, type Project } from '../project/types';

export interface EvaluateOptions {
  seed?: number;
  /** 입력(Project.inputs)의 값. 없는 입력은 그 기본값(value)을 쓴다. */
  inputs?: Record<string, number>;
}

export type EvaluateResult =
  | { ok: true; value: number }
  | { ok: false; error: EngineError };

type Value = number | boolean;

class EvalError extends Error {
  constructor(public engineErr: EngineError) {
    super(engineErr.message);
  }
}

function isActorKey(s: string): s is ActorKey {
  return (ACTORS as readonly string[]).includes(s);
}

export function evaluate(
  formulaKey: string,
  project: Project,
  statValues: Record<ActorKey, Record<string, number>>,
  options: EvaluateOptions = {},
): EvaluateResult {
  const statByKey = new Map(project.stats.map((s) => [s.key, s]));
  const constByKey = new Map(project.constants.map((c) => [c.key, c]));
  const formulaByKey = new Map(project.formulas.map((f) => [f.key, f]));
  const inputByKey = new Map((project.inputs ?? []).map((i) => [i.key, i]));
  const big = isBigProject(project);
  const astCache = new Map<string, Node>();
  const rng: Rng = createRng(options.seed ?? (Date.now() & 0xffffffff));
  const inProgress = new Set<string>();

  if (!formulaByKey.has(formulaKey)) {
    return {
      ok: false,
      error: engineError('UnknownIdentifier', `알 수 없는 공식 '${formulaKey}'`),
    };
  }

  function getAst(key: string): Node {
    const cached = astCache.get(key);
    if (cached) return cached;
    const result = parse(formulaByKey.get(key)!.expression);
    if (!result.ok) throw new EvalError(result.error);
    astCache.set(key, result.ast);
    return result.ast;
  }

  function asNumber(v: Value, node: Node): number {
    if (typeof v !== 'number') {
      throw new EvalError(engineError('TypeError', '숫자가 필요합니다', node.start, node.end));
    }
    return v;
  }

  function asBool(v: Value, node: Node): boolean {
    if (typeof v !== 'boolean') {
      throw new EvalError(engineError('TypeError', '불리언이 필요합니다', node.start, node.end));
    }
    return v;
  }

  function evalFormula(key: string): number {
    if (inProgress.has(key)) {
      throw new EvalError(
        engineError('CycleError', `공식 '${key}'에서 순환 참조가 발생했습니다`),
      );
    }
    inProgress.add(key);
    const v = evalNode(getAst(key));
    inProgress.delete(key);
    if (typeof v !== 'number') {
      throw new EvalError(
        engineError('TypeError', `공식 '${key}'의 결과는 숫자여야 합니다`),
      );
    }
    if (!Number.isFinite(v)) {
      throw new EvalError(
        engineError('TypeError', `공식 '${key}'의 결과가 유효한 숫자가 아닙니다 (NaN 또는 무한대)`),
      );
    }
    return v;
  }

  function evalNode(node: Node): Value {
    switch (node.kind) {
      case 'number':
        return node.value;
      case 'identifier': {
        const name = node.name;
        const dot = name.indexOf('.');
        if (dot !== -1) {
          const actor = name.slice(0, dot);
          const statKey = name.slice(dot + 1);
          if (!isActorKey(actor)) {
            throw new EvalError(
              engineError('UnknownIdentifier', `알 수 없는 액터 '${actor}'`, node.start, node.end),
            );
          }
          const stat = statByKey.get(statKey);
          if (!stat) {
            throw new EvalError(
              engineError('UnknownIdentifier', `알 수 없는 스탯 '${statKey}'`, node.start, node.end),
            );
          }
          const actorInputs = statValues[actor];
          if (Object.hasOwn(actorInputs, statKey)) return actorInputs[statKey];
          return stat.defaults[actor];
        }
        if (constByKey.has(name)) return constByKey.get(name)!.value;
        if (inputByKey.has(name)) {
          const given = options.inputs;
          return given && Object.hasOwn(given, name) ? given[name] : inputByKey.get(name)!.value;
        }
        if (formulaByKey.has(name)) return evalFormula(name);
        if (statByKey.has(name)) {
          throw new EvalError(
            engineError('UnknownIdentifier', `스탯 '${name}'은 caster. 또는 target.으로 참조하세요`, node.start, node.end),
          );
        }
        throw new EvalError(
          engineError('UnknownIdentifier', `알 수 없는 식별자 '${name}'`, node.start, node.end),
        );
      }
      case 'unary': {
        if (node.op === '-') return -asNumber(evalNode(node.operand), node.operand);
        return !asBool(evalNode(node.operand), node.operand);
      }
      case 'binary': {
        const l = evalNode(node.left);
        const r = evalNode(node.right);
        const op = node.op;
        const { start, end } = node;
        switch (op) {
          case '+': return asNumber(l, node.left) + asNumber(r, node.right);
          case '-': return asNumber(l, node.left) - asNumber(r, node.right);
          case '*': return asNumber(l, node.left) * asNumber(r, node.right);
          case '/': {
            const d = asNumber(r, node.right);
            if (d === 0) {
              throw new EvalError(
                engineError('DivisionByZero', '0으로 나눌 수 없습니다', node.start, node.end),
              );
            }
            return asNumber(l, node.left) / d;
          }
          case '%': {
            const d = asNumber(r, node.right);
            if (d === 0) {
              throw new EvalError(
                engineError('DivisionByZero', '0으로 나눌 수 없습니다', node.start, node.end),
              );
            }
            return asNumber(l, node.left) % d;
          }
          case '<': return asNumber(l, node.left) < asNumber(r, node.right);
          case '>': return asNumber(l, node.left) > asNumber(r, node.right);
          case '<=': return asNumber(l, node.left) <= asNumber(r, node.right);
          case '>=': return asNumber(l, node.left) >= asNumber(r, node.right);
          case '==': return l === r;
          case '!=': return l !== r;
          default: {
            const _exhaustive: never = op;
            throw new EvalError(
              engineError('TypeError', `알 수 없는 연산자 '${String(_exhaustive)}'`, start, end),
            );
          }
        }
      }
      case 'logical': {
        const l = asBool(evalNode(node.left), node.left);
        if (node.op === '&&') return l && asBool(evalNode(node.right), node.right);
        return l || asBool(evalNode(node.right), node.right);
      }
      case 'conditional': {
        const t = asBool(evalNode(node.test), node.test);
        return t ? evalNode(node.consequent) : evalNode(node.alternate);
      }
      case 'call': {
        const builtin = BUILTINS[node.callee];
        if (!builtin) {
          throw new EvalError(
            engineError('UnknownFunction', `알 수 없는 함수 '${node.callee}'`, node.start, node.end),
          );
        }
        if (node.args.length < builtin.minArgs || node.args.length > builtin.maxArgs) {
          throw new EvalError(
            engineError('ArityError', `함수 '${node.callee}'의 인자 수가 올바르지 않습니다`, node.start, node.end),
          );
        }
        const args = node.args.map((a) => asNumber(evalNode(a), a));
        // 생성 코드의 Big.pow처럼 정수 지수만 받는다(값은 double로 계산하므로 마지막 비트는 다를 수 있다).
        if (big && node.callee === 'pow' && !Number.isInteger(args[1])) {
          throw new EvalError(
            engineError('Unsupported', `Big 모드의 pow는 정수 지수만 받습니다 (지수 ${args[1]})`, node.args[1].start, node.args[1].end),
          );
        }
        return builtin.fn(args, rng);
      }
    }
  }

  try {
    return { ok: true, value: evalFormula(formulaKey) };
  } catch (e) {
    if (e instanceof EvalError) return { ok: false, error: e.engineErr };
    throw e;
  }
}
