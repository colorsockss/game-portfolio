import type { Token, TokenType } from './types';
import { type EngineError, engineError } from './errors';

export type LexResult =
  | { ok: true; tokens: Token[] }
  | { ok: false; error: EngineError };

const SINGLE: Record<string, TokenType> = {
  '+': 'plus', '-': 'minus', '*': 'star', '/': 'slash', '%': 'percent',
  '(': 'lparen', ')': 'rparen', ',': 'comma', '?': 'question', ':': 'colon',
};

const TWO: Record<string, TokenType> = {
  '<=': 'lte', '>=': 'gte', '==': 'eq', '!=': 'neq', '&&': 'and', '||': 'or',
};

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);

export function tokenize(src: string): LexResult {
  const tokens: Token[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    const start = i;

    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let seenDot = false;
      while (i < src.length && (isDigit(src[i]) || (src[i] === '.' && !seenDot))) {
        if (src[i] === '.') seenDot = true;
        i++;
      }
      tokens.push({ type: 'number', value: src.slice(start, i), start, end: i });
      continue;
    }

    if (isIdentStart(c)) {
      while (i < src.length && isIdentPart(src[i])) i++;
      // 액터 한정자 구간은 하나까지만 올 수 있다. caster.atk는 토큰 하나다.
      if (src[i] === '.' && isIdentStart(src[i + 1] ?? '')) {
        i++;
        while (i < src.length && isIdentPart(src[i])) i++;
      }
      tokens.push({ type: 'ident', value: src.slice(start, i), start, end: i });
      continue;
    }

    const two = src.slice(i, i + 2);
    if (TWO[two]) {
      tokens.push({ type: TWO[two], value: two, start, end: i + 2 });
      i += 2;
      continue;
    }

    if (c === '<') { tokens.push({ type: 'lt', value: c, start, end: i + 1 }); i++; continue; }
    if (c === '>') { tokens.push({ type: 'gt', value: c, start, end: i + 1 }); i++; continue; }
    if (c === '!') { tokens.push({ type: 'bang', value: c, start, end: i + 1 }); i++; continue; }
    if (SINGLE[c]) { tokens.push({ type: SINGLE[c], value: c, start, end: i + 1 }); i++; continue; }

    return {
      ok: false,
      error: engineError('ParseError', `예상치 못한 문자 '${c}'`, start, start + 1),
    };
  }

  tokens.push({ type: 'eof', value: '', start: i, end: i });
  return { ok: true, tokens };
}
