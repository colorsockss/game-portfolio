import { describe, it, expect } from 'vitest';
import { parseStoredMode, resolveTheme } from './theme-logic';

describe('parseStoredMode', () => {
  it("'light'·'dark'는 그대로 반환한다", () => {
    expect(parseStoredMode('light')).toBe('light');
    expect(parseStoredMode('dark')).toBe('dark');
  });

  it('null·알 수 없는 값은 system이다', () => {
    expect(parseStoredMode(null)).toBe('system');
    expect(parseStoredMode('')).toBe('system');
    expect(parseStoredMode('blue')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('system 모드는 systemDark를 따른다', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('명시 모드는 systemDark와 무관하다', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});
