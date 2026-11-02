import type { Token, Node } from './types';
import { type EngineError, engineError } from './errors';
import { tokenize } from './lexer';

export type ParseResult =
  | { ok: true; ast: Node }
  | { ok: false; error: EngineError };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private at(type: string): boolean {
    return this.peek().type === type;
  }
  private eat(type: string): Token | null {
    return this.at(type) ? this.next() : null;
  }

  parse(): Node {
    const expr = this.parseExpression();
    if (!this.at('eof')) {
      throw engineError(
        'ParseError',
        `예상치 못한 토큰 '${this.peek().value}'`,
        this.peek().start,
        this.peek().end,
      );
    }
    return expr;
  }

  private parseExpression(): Node {
    return this.parseTernary();
  }

  private parseTernary(): Node {
    const test = this.parseOr();
    if (this.eat('question')) {
      const consequent = this.parseExpression();
      if (!this.eat('colon')) {
        throw engineError(
          'ParseError',
          "삼항 연산자에 ':'가 필요합니다",
          this.peek().start,
          this.peek().end,
        );
      }
      const alternate = this.parseTernary();
      return {
        kind: 'conditional',
        test,
        consequent,
        alternate,
        start: test.start,
        end: alternate.end,
      };
    }
    return test;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.at('or')) {
      this.next();
      const right = this.parseAnd();
      left = { kind: 'logical', op: '||', left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseEquality();
    while (this.at('and')) {
      this.next();
      const right = this.parseEquality();
      left = { kind: 'logical', op: '&&', left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseEquality(): Node {
    let left = this.parseComparison();
    while (this.at('eq') || this.at('neq')) {
      const op = this.next().type === 'eq' ? '==' : '!=';
      const right = this.parseComparison();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseComparison(): Node {
    let left = this.parseAdditive();
    const map: Record<string, '<' | '>' | '<=' | '>='> = {
      lt: '<', gt: '>', lte: '<=', gte: '>=',
    };
    while (map[this.peek().type]) {
      const op = map[this.next().type];
      const right = this.parseAdditive();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative();
    while (this.at('plus') || this.at('minus')) {
      const op = this.next().type === 'plus' ? '+' : '-';
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary();
    const map: Record<string, '*' | '/' | '%'> = {
      star: '*', slash: '/', percent: '%',
    };
    while (map[this.peek().type]) {
      const op = map[this.next().type];
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private parseUnary(): Node {
    if (this.at('minus') || this.at('bang')) {
      const t = this.next();
      const op = t.type === 'minus' ? '-' : '!';
      const operand = this.parseUnary();
      return { kind: 'unary', op, operand, start: t.start, end: operand.end };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (t.type === 'number') {
      this.next();
      return { kind: 'number', value: Number(t.value), start: t.start, end: t.end };
    }
    if (t.type === 'ident') {
      this.next();
      if (this.at('lparen')) {
        this.next();
        const args: Node[] = [];
        if (!this.at('rparen')) {
          args.push(this.parseExpression());
          while (this.eat('comma')) args.push(this.parseExpression());
        }
        const close = this.eat('rparen');
        if (!close) {
          throw engineError(
            'ParseError',
            "함수 호출에 ')'가 필요합니다",
            this.peek().start,
            this.peek().end,
          );
        }
        return { kind: 'call', callee: t.value, args, start: t.start, end: close.end };
      }
      return { kind: 'identifier', name: t.value, start: t.start, end: t.end };
    }
    if (t.type === 'lparen') {
      this.next();
      const expr = this.parseExpression();
      const close = this.eat('rparen');
      if (!close) {
        throw engineError(
          'ParseError',
          "')'가 필요합니다",
          this.peek().start,
          this.peek().end,
        );
      }
      return expr;
    }
    throw engineError(
      'ParseError',
      `예상치 못한 토큰 '${t.value || 'EOF'}'`,
      t.start,
      t.end,
    );
  }
}

export function parse(src: string): ParseResult {
  const lex = tokenize(src);
  if (!lex.ok) return { ok: false, error: lex.error };
  try {
    const ast = new Parser(lex.tokens).parse();
    return { ok: true, ast };
  } catch (e) {
    if (e !== null && typeof e === 'object' && 'type' in e && 'message' in e) {
      return { ok: false, error: e as EngineError };
    }
    throw e;
  }
}
