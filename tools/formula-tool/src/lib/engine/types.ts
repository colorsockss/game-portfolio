export type TokenType =
  | 'number' | 'ident'
  | 'plus' | 'minus' | 'star' | 'slash' | 'percent'
  | 'lt' | 'gt' | 'lte' | 'gte' | 'eq' | 'neq'
  | 'and' | 'or' | 'bang'
  | 'question' | 'colon'
  | 'lparen' | 'rparen' | 'comma'
  | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

export interface NumberLiteral {
  kind: 'number';
  value: number;
  start: number;
  end: number;
}

export interface Identifier {
  kind: 'identifier';
  name: string;
  start: number;
  end: number;
}

export interface UnaryExpr {
  kind: 'unary';
  op: '-' | '!';
  operand: Node;
  start: number;
  end: number;
}

export interface BinaryExpr {
  kind: 'binary';
  op: '+' | '-' | '*' | '/' | '%' | '<' | '>' | '<=' | '>=' | '==' | '!=';
  left: Node;
  right: Node;
  start: number;
  end: number;
}

export interface LogicalExpr {
  kind: 'logical';
  op: '&&' | '||';
  left: Node;
  right: Node;
  start: number;
  end: number;
}

export interface ConditionalExpr {
  kind: 'conditional';
  test: Node;
  consequent: Node;
  alternate: Node;
  start: number;
  end: number;
}

export interface CallExpr {
  kind: 'call';
  callee: string;
  args: Node[];
  start: number;
  end: number;
}

export type Node =
  | NumberLiteral
  | Identifier
  | UnaryExpr
  | BinaryExpr
  | LogicalExpr
  | ConditionalExpr
  | CallExpr;
