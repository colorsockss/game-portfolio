import type { Project } from './types';
import { isReservedIdentifier } from '../export/codegen';

export interface ValidationIssue {
  kind: 'duplicate-key' | 'invalid-key' | 'reserved-key';
  key: string;
  message: string;
}

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const inputs = project.inputs ?? [];
  const allKeys: string[] = [
    ...project.stats.map((s) => s.key),
    ...project.constants.map((c) => c.key),
    ...inputs.map((i) => i.key),
    ...project.formulas.map((f) => f.key),
  ];
  // 스탯은 E_AbilityType 멤버로만 쓰이지만, 상수·공식 key는 내보낸 TS에서 식별자가 되고 입력 key는 임시 변수
  // (__input_key)와 FormulaInput의 속성 이름이 된다.
  const identifierKeys = new Set([
    ...project.constants.map((c) => c.key),
    ...inputs.map((i) => i.key),
    ...project.formulas.map((f) => f.key),
  ]);
  const counts = new Map<string, number>();
  for (const key of allKeys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const reported = new Set<string>();
  for (const key of allKeys) {
    if (reported.has(key)) continue;
    reported.add(key);
    if (!KEY_RE.test(key)) {
      issues.push({ kind: 'invalid-key', key, message: `잘못된 key 형식: '${key}'` });
    } else if ((counts.get(key) ?? 0) > 1) {
      issues.push({ kind: 'duplicate-key', key, message: `중복된 key: '${key}'` });
    } else if (identifierKeys.has(key) && isReservedIdentifier(key)) {
      issues.push({ kind: 'reserved-key', key, message: `예약된 이름이라 쓸 수 없는 key: '${key}'` });
    }
  }
  return issues;
}
