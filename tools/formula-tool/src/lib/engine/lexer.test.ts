import { describe, it, expect } from 'vitest';
import { tokenize } from './lexer';

describe('tokenize', () => {
  it('숫자와 식별자를 토큰화한다', () => {
    const r = tokenize('atk 12 3.5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['ident', 'number', 'number', 'eof']);
    expect(r.tokens[0].value).toBe('atk');
    expect(r.tokens[1].value).toBe('12');
    expect(r.tokens[2].value).toBe('3.5');
  });

  it('한 글자 연산자를 토큰화한다', () => {
    const r = tokenize('+ - * / % ( ) , ? :');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual([
      'plus', 'minus', 'star', 'slash', 'percent',
      'lparen', 'rparen', 'comma', 'question', 'colon', 'eof',
    ]);
  });

  it('두 글자 연산자를 토큰화한다', () => {
    const r = tokenize('<= >= == != && ||');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual([
      'lte', 'gte', 'eq', 'neq', 'and', 'or', 'eof',
    ]);
  });

  it('한 글자 비교/부정 연산자를 토큰화한다', () => {
    const r = tokenize('< > !');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['lt', 'gt', 'bang', 'eof']);
  });

  it('공백을 건너뛰고 위치를 기록한다', () => {
    const r = tokenize('  atk  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens[0]).toMatchObject({ type: 'ident', start: 2, end: 5 });
  });

  it('예상치 못한 문자는 ParseError를 낸다', () => {
    const r = tokenize('atk @ def');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
    expect(r.error.start).toBe(4);
  });

  it('빈 문자열은 eof 토큰만 낸다', () => {
    const r = tokenize('');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['eof']);
  });

  it('숫자 토큰의 위치를 기록한다', () => {
    const r = tokenize('  3.5  ');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens[0]).toMatchObject({ type: 'number', value: '3.5', start: 2, end: 5 });
  });

  it('두 글자 연산자의 위치를 기록한다', () => {
    const r = tokenize(' <=');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens[0]).toMatchObject({ type: 'lte', start: 1, end: 3 });
  });

  it('1.2.3은 두 개의 숫자 토큰으로 분리된다', () => {
    const r = tokenize('1.2.3');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['number', 'number', 'eof']);
    expect(r.tokens[0].value).toBe('1.2');
    expect(r.tokens[1].value).toBe('.3');
  });

  it('액터 한정 식별자를 단일 토큰으로 만든다', () => {
    const r = tokenize('caster.atk');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['ident', 'eof']);
    expect(r.tokens[0]).toMatchObject({ type: 'ident', value: 'caster.atk', start: 0, end: 10 });
  });

  it('액터 식별자를 연산자와 함께 토큰화한다', () => {
    const r = tokenize('caster.atk - target.def');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tokens.map((t) => t.type)).toEqual(['ident', 'minus', 'ident', 'eof']);
    expect(r.tokens[0].value).toBe('caster.atk');
    expect(r.tokens[2].value).toBe('target.def');
  });

  it('점이 두 개면 ParseError를 낸다', () => {
    const r = tokenize('caster.atk.extra');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });

  it('점 앞뒤 공백은 ParseError를 낸다', () => {
    const r = tokenize('caster . atk');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.type).toBe('ParseError');
  });
});
