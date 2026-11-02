import type { Project, Stat, Constant, Input, Formula, ActorKey } from '$lib/project/types';
import { uniqueKey } from '$lib/project/keys';

export type ItemKind = 'formula' | 'stat' | 'constant' | 'input';

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

  addStat(): void {
    if (!this.current) return;
    const id = crypto.randomUUID();
    const stat: Stat = {
      id,
      key: uniqueKey('stat', this.allKeys()),
      defaults: { caster: 0, target: 0 },
      description: '',
    };
    this.current.stats.push(stat);
    this.markDirty();
    this.select('stat', id);
  }

  addConstant(): void {
    if (!this.current) return;
    const id = crypto.randomUUID();
    const constant: Constant = {
      id,
      key: uniqueKey('constant', this.allKeys()),
      value: 0,
      description: '',
    };
    this.current.constants.push(constant);
    this.markDirty();
    this.select('constant', id);
  }

  addInput(): void {
    if (!this.current) return;
    const id = crypto.randomUUID();
    const input: Input = {
      id,
      // 'input'은 생성 코드의 매개변수라 예약된 이름이다.
      key: uniqueKey('param', this.allKeys()),
      value: 0,
      description: '',
    };
    (this.current.inputs ??= []).push(input);
    this.markDirty();
    this.select('input', id);
  }

  addFormula(): void {
    if (!this.current) return;
    const id = crypto.randomUUID();
    const formula: Formula = {
      id,
      key: uniqueKey('formula', this.allKeys()),
      expression: '0',
      description: '',
    };
    this.current.formulas.push(formula);
    this.markDirty();
    this.select('formula', id);
  }

  removeItem(kind: ItemKind, id: string): void {
    if (!this.current) return;
    const list =
      kind === 'stat'
        ? this.current.stats
        : kind === 'constant'
          ? this.current.constants
          : kind === 'input'
            ? (this.current.inputs ?? [])
            : this.current.formulas;
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
