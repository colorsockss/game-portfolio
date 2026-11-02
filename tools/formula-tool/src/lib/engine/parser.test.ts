import { describe, it, expect } from 'vitest';
import { parse } from './parser';
import type { BinaryExpr, ConditionalExpr, CallExpr, UnaryExpr } from './types';

describe('parse', () => {
  it('숫자 리터럴을 파싱한다', () => {
    const r = parse('42');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({ kind: 'number', value: 42 });
  });

  it('* 가 + 보다 먼저 묶인다', () => {
    const r = parse('1 + 2 * 3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as BinaryExpr;
    expect(ast.op).toBe('+');
    expect((ast.right as BinaryExpr).op).toBe('*');
  });

  it('+ 와 - 는 왼쪽 결합이다', () => {
    const r = parse('1 - 2 - 3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as BinaryExpr;
    expect(ast.op).toBe('-');
    expect((ast.left as BinaryExpr).op).toBe('-');
    expect((ast.right as { value: number }).value).toBe(3);
  });

  it('괄호가 우선순위를 뒤집는다', () => {
    const r = parse('(1 + 2) * 3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as BinaryExpr;
    expect(ast.op).toBe('*');
    expect((ast.left as BinaryExpr).op).toBe('+');
  });

  it('단항 마이너스를 파싱한다', () => {
    const r = parse('-atk');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({ kind: 'unary', op: '-' });
  });

  it('함수 호출을 인자와 함께 파싱한다', () => {
    const r = parse('clamp(atk, 0, 100)');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as CallExpr;
    expect(ast.kind).toBe('call');
    expect(ast.callee).toBe('clamp');
    expect(ast.args).toHaveLength(3);
  });

  it('인자 없는 함수 호출을 파싱한다', () => {
    const r = parse('rand()');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.ast as CallExpr).args).toHaveLength(0);
  });

  it('삼항 연산자를 파싱한다', () => {
    const r = parse('atk > 0 ? 1 : 2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as ConditionalExpr;
    expect(ast.kind).toBe('conditional');
    expect((ast.test as BinaryExpr).op).toBe('>');
  });

  it('논리 연산자가 비교보다 낮은 우선순위다', () => {
    const r = parse('a > 1 && b < 2');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ast).toMatchObject({ kind: 'logical', op: '&&' });
  });

  it('닫는 괄호 누락은 ParseError를 낸다', () => {
    const r = parse('(1 + 2');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });

  it('남는 토큰은 ParseError를 낸다', () => {
    const r = parse('1 2');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });

  it('빈 식은 ParseError를 낸다', () => {
    const r = parse('   ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });

  it('중첩 삼항은 오른쪽 결합이다', () => {
    const r = parse('a ? b ? c : d : e');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as ConditionalExpr;
    expect(ast.kind).toBe('conditional');
    expect((ast.consequent as ConditionalExpr).kind).toBe('conditional');
  });

  it('단항 연산자를 연쇄한다', () => {
    const r = parse('!!a');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ast = r.ast as UnaryExpr;
    expect(ast.kind).toBe('unary');
    expect((ast.operand as UnaryExpr).kind).toBe('unary');
  });

  it('피연산자 누락은 ParseError를 낸다', () => {
    const r = parse('1 +');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });

  it('파싱 오류는 위치를 기록한다', () => {
    const r = parse('(1 + 2');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.start).toBe(6);
  });

  it('함수 호출의 후행 쉼표는 ParseError를 낸다', () => {
    const r = parse('f(1,)');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });
});
