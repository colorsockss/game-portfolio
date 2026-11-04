<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ask } from '@tauri-apps/plugin-dialog';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { projectStore } from '$lib/stores/project.svelte';
  import { writeProject } from '$lib/tauri/projects';
  import { writeTextFile, pickTsExportPath } from '$lib/tauri/export';
  import { generateTypeScript } from '$lib/export/codegen';
  import { exportProblems } from '$lib/export/check';
  import type { Formula, Stat, Constant } from '$lib/project/types';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import FormulaEditor from '$lib/components/FormulaEditor.svelte';
  import StatEditor from '$lib/components/StatEditor.svelte';
  import ConstantEditor from '$lib/components/ConstantEditor.svelte';
  import SimulationDock from '$lib/components/SimulationDock.svelte';
  import ExportDialog from '$lib/components/ExportDialog.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let error = $state<string | null>(null);
  let saving = $state(false);
  let showExport = $state(false);

  onMount(() => {
    if (!projectStore.current) {
      goto('/');
      return;
    }
    // 창 닫기 버튼·단축키로 닫을 때도 "프로젝트 목록" 버튼과 같은 확인을 거친다.
    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await confirmDiscard())) event.preventDefault();
    });
    return () => {
      unlisten.then((stop) => stop());
    };
  });

  async function confirmDiscard(): Promise<boolean> {
    if (!projectStore.dirty) return true;
    return ask('저장하지 않은 변경이 있습니다. 정말 나가시겠어요?', {
      title: '프로젝트 닫기',
      kind: 'warning',
    });
  }

  const selectedItem = $derived.by(() => {
    const p = projectStore.current;
    const sel = projectStore.selection;
    if (!p || !sel) return null;
    if (sel.kind === 'formula') return p.formulas.find((f) => f.id === sel.id) ?? null;
    if (sel.kind === 'stat') return p.stats.find((s) => s.id === sel.id) ?? null;
    if (sel.kind === 'input') return p.inputs?.find((i) => i.id === sel.id) ?? null;
    return p.constants.find((c) => c.id === sel.id) ?? null;
  });

  async function save() {
    if (!projectStore.current || !projectStore.path) return;
    saving = true;
    error = null;
    // 저장 중에도 편집할 수 있으므로, 보낼 내용과 그 시점의 revision을 함께 고정한다.
    const revision = projectStore.revision;
    const snapshot = $state.snapshot(projectStore.current);
    try {
      await writeProject(projectStore.path, snapshot);
      projectStore.markSaved(revision);
    } catch (e) {
      error = `저장하지 못했습니다: ${e instanceof Error ? e.message : e}`;
    } finally {
      saving = false;
    }
  }

  function startExport() {
    const p = projectStore.current;
    if (!p) return;
    error = null;
    const problems = exportProblems(p);
    if (problems.length > 0) {
      const more = problems.length > 1 ? ` 외 ${problems.length - 1}건` : '';
      error = `오류가 있어 내보낼 수 없습니다 — ${problems[0]}${more}`;
      return;
    }
    showExport = true;
  }

  async function runExport(abilityTypeImport: string) {
    const p = projectStore.current;
    if (!p) return;
    showExport = false;
    // numeric, bigImport 같은 대화상자에 없는 설정은 그대로 둔다.
    p.exportSettings = { ...p.exportSettings, abilityTypeImport };
    projectStore.markDirty();
    error = null;
    try {
      const path = await pickTsExportPath(p.name);
      if (!path) return;
      await writeTextFile(path, generateTypeScript(p, p.exportSettings));
    } catch (e) {
      error = `내보내기 실패: ${e instanceof Error ? e.message : e}`;
    }
  }

  async function backToManager() {
    if (!(await confirmDiscard())) return;
    projectStore.close();
    await goto('/');
  }
</script>

{#if projectStore.current}
  <div class="editor">
    <header class="topbar">
      <button class="back" onclick={backToManager}>← 프로젝트 목록</button>
      <span class="title">
        {projectStore.current.name}
        {#if projectStore.dirty}<span class="dirty" title="저장되지 않은 변경">●</span>{/if}
      </span>
      <button onclick={startExport}>TS로 내보내기</button>
      <button class="save" onclick={save} disabled={saving || !projectStore.dirty}>
        {saving ? '저장 중…' : '저장'}
      </button>
      <ThemeToggle />
    </header>

    {#if error}<p class="error">{error}</p>{/if}

    <div class="main">
      <Sidebar />
      <div class="center">
        <div class="item-area">
          {#if selectedItem && projectStore.selection}
            {#key projectStore.selection.id}
              {#if projectStore.selection.kind === 'formula'}
                <FormulaEditor formula={selectedItem as Formula} />
              {:else if projectStore.selection.kind === 'stat'}
                <StatEditor stat={selectedItem as Stat} />
              {:else if projectStore.selection.kind === 'constant'}
                <ConstantEditor constant={selectedItem as Constant} />
              {:else if projectStore.selection.kind === 'input'}
                <ConstantEditor constant={selectedItem as Constant} kind="input" />
              {/if}
            {/key}
          {:else}
            <p class="hint">왼쪽에서 항목을 선택하거나 새로 추가하세요.</p>
          {/if}
        </div>
        {#if projectStore.activeTab === 'formula'}
          <SimulationDock />
        {/if}
      </div>
    </div>
  </div>

  {#if showExport}
    <ExportDialog
      abilityTypeImport={projectStore.current.exportSettings?.abilityTypeImport ?? ''}
      onConfirm={runExport}
      onCancel={() => (showExport = false)}
    />
  {/if}
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }
  .title {
    flex: 1;
    font-weight: 600;
    font-size: 14px;
  }
  .dirty {
    color: var(--warn);
    margin-left: 6px;
  }
  button {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 6px 14px;
    font-size: 13px;
    transition: background 0.12s;
  }
  button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .save {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .save:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .error {
    color: var(--danger);
    background: var(--danger-bg);
    margin: 0;
    padding: 8px 16px;
    font-size: 13px;
    flex-shrink: 0;
  }
  .main {
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .center {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .item-area {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }
  .hint {
    color: var(--text-faint);
    font-size: 14px;
  }
</style>
