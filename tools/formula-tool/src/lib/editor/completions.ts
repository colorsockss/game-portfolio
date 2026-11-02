import type { Completion } from '@codemirror/autocomplete';
import { ACTORS, type Project } from '$lib/project/types';
import { BUILTINS } from '$lib/engine';

export function expressionCompletions(project: Project): Completion[] {
  const items: Completion[] = [];

  for (const s of project.stats) {
    for (const actor of ACTORS) {
      items.push({
        label: `${actor}.${s.key}`,
        type: 'variable',
        detail: '스탯',
        info: s.description || undefined,
      });
    }
  }
  for (const c of project.constants) {
    items.push({
      label: c.key,
      type: 'constant',
      detail: '상수',
      info: c.description || undefined,
    });
  }
  for (const i of project.inputs ?? []) {
    items.push({
      label: i.key,
      type: 'variable',
      detail: '입력',
      info: i.description || undefined,
    });
  }
  for (const f of project.formulas) {
    items.push({
      label: f.key,
      type: 'variable',
      detail: '공식',
      info: f.description || undefined,
    });
  }
  for (const name of Object.keys(BUILTINS)) {
    items.push({
      label: name,
      type: 'function',
      detail: '내장 함수',
      apply: `${name}()`,
    });
  }

  return items;
}
