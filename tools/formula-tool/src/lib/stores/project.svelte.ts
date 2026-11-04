import type { Project, Stat, Constant, Formula, ActorKey } from '$lib/project/types';
import { uniqueKey } from '$lib/project/keys';

export type ItemKind = 'formula' | 'stat' | 'constant' | 'input';

/** 사이드바와 편집기가 다루는 항목. 입력(Input)은 상수와 모양이 같다. */
export type Item = Stat | Constant | Formula;

/** 항목 종류 하나: 탭 이름, 프로젝트 안의 목록, 새 항목을 더하는 법. 종류를 가르는 곳은 이 표 하나다. */
interface KindSpec {
  readonly label: string;
  items(project: Project): Item[];
  add(project: Project, id: string, keys: readonly string[]): void;
}

/** 탭 순서대로의 항목 종류. */
export const KINDS: Readonly<Record<ItemKind, KindSpec>> = {
  formula: {
    label: '공식',
    items: (p) => p.formulas,
    add: (p, id, keys) => void p.formulas.push({ id, key: uniqueKey('formula', keys), expression: '0', description: '' }),
  },
  stat: {
    label: '스탯',
    items: (p) => p.stats,
    add: (p, id, keys) =>
      void p.stats.push({ id, key: uniqueKey('stat', keys), defaults: { caster: 0, target: 0 }, description: '' }),
  },
  constant: {
    label: '상수',
    items: (p) => p.constants,
    add: (p, id, keys) => void p.constants.push({ id, key: uniqueKey('constant', keys), value: 0, description: '' }),
  },
  input: {
    label: '입력',
    items: (p) => p.inputs ?? [],
    // 'input'은 생성 코드의 매개변수라 예약된 이름이다.
    add: (p, id, keys) => void (p.inputs ??= []).push({ id, key: uniqueKey('param', keys), value: 0, description: '' }),
  },
};

export interface Selection {
  kind: ItemKind;
  id: string;
}

class ProjectStore {
  current = $state<Project | null>(null);
  path = $state<string | null>(null);
  dirty = $state(false);
  activeTab = $state<ItemKind>('formula');
  selections = $state<Record<ItemKind, string | null>>({
    formula: null,
    stat: null,
    constant: null,
    input: null,
  });
  simulationInputs = $state<Record<ActorKey, Record<string, number>>>({ caster: {}, target: {} });
  // 시뮬레이션에서 바꾼 입력 값과 전투 미리보기의 요청 값. 저장하지 않는다(없으면 프로젝트의 기본값).
  inputValues = $state<Record<string, number>>({});
  previewValues = $state<Record<string, number>>({});

  get selection(): Selection | null {
    const id = this.selections[this.activeTab];
    return id === null ? null : { kind: this.activeTab, id };
  }

  load(project: Project, path: string): void {
    this.current = project;
    this.path = path;
    this.dirty = false;
    this.activeTab = 'formula';
    this.selections = { formula: null, stat: null, constant: null, input: null };
    this.simulationInputs = { caster: {}, target: {} };
    this.inputValues = {};
    this.previewValues = {};
  }

  // 편집마다 1씩 오른다. 저장이 끝났을 때 그 사이에 편집이 있었는지 가려내는 데 쓴다.
  revision = 0;

  markDirty(): void {
    this.revision++;
    this.dirty = true;
  }

  // 저장을 시작한 시점의 revision을 받는다. 저장 중에 편집이 있었다면 dirty를 유지한다.
  markSaved(savedRevision: number): void {
    if (savedRevision === this.revision) this.dirty = false;
  }

  close(): void {
    this.current = null;
    this.path = null;
    this.dirty = false;
    this.activeTab = 'formula';
    this.selections = { formula: null, stat: null, constant: null, input: null };
    this.simulationInputs = { caster: {}, target: {} };
    this.inputValues = {};
    this.previewValues = {};
  }

  select(kind: ItemKind, id: string): void {
    this.selections[kind] = id;
  }

  private allKeys(): string[] {
    const p = this.current;
    if (!p) return [];
    return [...p.stats, ...p.constants, ...(p.inputs ?? []), ...p.formulas].map((i) => i.key);
  }

  addItem(kind: ItemKind): void {
    if (!this.current) return;
    const id = crypto.randomUUID();
    KINDS[kind].add(this.current, id, this.allKeys());
    this.markDirty();
    this.select(kind, id);
  }

  removeItem(kind: ItemKind, id: string): void {
    if (!this.current) return;
    const list = KINDS[kind].items(this.current);
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) return;
    list.splice(idx, 1);
    this.markDirty();
    if (this.selections[kind] === id) {
      this.selections[kind] = null;
    }
  }
}

export const projectStore = new ProjectStore();
