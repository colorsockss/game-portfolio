<script lang="ts">
  import type { Formula } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import { validateProject } from '$lib/project/validation';
  import ExpressionEditor from '$lib/editor/ExpressionEditor.svelte';

  interface Props {
    formula: Formula;
  }
  let { formula }: Props = $props();

  const keyIssue = $derived.by(() => {
    const p = projectStore.current;
    if (!p) return null;
    return validateProject(p).find((i) => i.key === formula.key)?.message ?? null;
  });

  function touched() {
    projectStore.markDirty();
  }

  function onExpressionChange(value: string) {
    formula.expression = value;
    projectStore.markDirty();
  }
</script>

<div class="item-editor">
  <h2>공식</h2>
  <label class="field">key
    <input class="mono" bind:value={formula.key} oninput={touched} />
  </label>
  {#if keyIssue}<p class="warn">{keyIssue}</p>{/if}
  <span class="field-label">수식</span>
  {#if projectStore.current}
    <ExpressionEditor
      value={formula.expression}
      project={projectStore.current}
      formulaKey={formula.key}
      onChange={onExpressionChange}
    />
  {/if}
  <label class="field">설명
    <textarea bind:value={formula.description} oninput={touched} rows="2"></textarea>
  </label>
  <button class="delete" onclick={() => projectStore.removeItem('formula', formula.id)}>이 공식 삭제</button>
</div>

<style>
  .item-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--text-muted);
    max-width: 640px;
  }
  .field-label {
    font-size: 12px;
    color: var(--text-muted);
  }
  input,
  textarea {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 14px;
  }
  .mono {
    font-family: monospace;
  }
  .warn {
    margin: 0;
    color: var(--warn);
    background: var(--warn-bg);
    border: 1px solid var(--warn-border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 12px;
    max-width: 640px;
  }
  .delete {
    align-self: flex-start;
    margin-top: 8px;
    border: 1px solid var(--danger-border);
    background: var(--surface);
    color: var(--danger);
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-size: 13px;
  }
  .delete:hover {
    background: var(--danger-bg);
  }
</style>
