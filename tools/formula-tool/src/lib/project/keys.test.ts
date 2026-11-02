import { describe, it, expect } from 'vitest';
import { uniqueKey } from './keys';

describe('uniqueKey', () => {
  it('충돌이 없으면 base를 그대로 쓴다', () => {
    expect(uniqueKey('stat', [])).toBe('stat');
    expect(uniqueKey('stat', ['atk', 'def'])).toBe('stat');
  });

  it('충돌하면 숫자 접미사를 붙인다', () => {
    expect(uniqueKey('stat', ['stat'])).toBe('stat_2');
    expect(uniqueKey('stat', ['stat', 'stat_2'])).toBe('stat_3');
  });

  it('잘못된 문자를 밑줄로 치환해 유효한 key를 만든다', () => {
    const key = uniqueKey('새 스탯', []);
    expect(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)).toBe(true);
  });

  it('숫자로 시작하면 밑줄을 앞에 붙인다', () => {
    expect(uniqueKey('2bad', [])).toBe('_2bad');
  });

  it('비어 있는 가장 낮은 접미사를 찾는다', () => {
    expect(uniqueKey('stat', ['stat', 'stat_3'])).toBe('stat_2');
  });
});
