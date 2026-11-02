<script lang="ts">
  import type { Stat, ActorKey } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import { validateProject } from '$lib/project/validation';

  interface Props {
    stat: Stat;
  }
  let { stat }: Props = $props();

  const keyIssue = $derived.by(() => {
    const p = projectStore.current;
    if (!p) return null;
    return validateProject(p).find((i) => i.key === stat.key)?.message ?? null;
  });

  function touched() {
    projectStore.markDirty();
  }

  function setDefault(actor: ActorKey, raw: string) {
    const n = Number(raw);
    stat.defaults[actor] = Number.isFinite(n) ? n : 0;
    projectStore.markDirty();
  }
</script>

<div class="item-editor">
  <h2>스탯</h2>
  <label class="field">key
    <input class="mono" bind:value={stat.key} oninput={touched} />
  </label>
  {#if keyIssue}<p class="warn">{keyIssue}</p>{/if}
  <label class="field">시전자 기본값
    <input type="number" value={stat.defaults.caster} onchange={(e) => setDefault('caster', e.currentTarget.value)} />
  </label>
  <label class="field">대상 기본값
    <input type="number" value={stat.defaults.target} onchange={(e) => setDefault('target', e.currentTarget.value)} />
  </label>
  <label class="field">설명
    <textarea bind:value={stat.description} oninput={touched} rows="2"></textarea>
  </label>
  <button class="delete" onclick={() => projectStore.removeItem('stat', stat.id)}>이 스탯 삭제</button>
</div>

<style>
  .item-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
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
