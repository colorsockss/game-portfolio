<script lang="ts">
  import type { Constant } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import { validateProject } from '$lib/project/validation';

  interface Props {
    constant: Constant;
    // 입력(Project.inputs)도 모양이 같아 이 편집기를 쓴다. 입력의 값은 시뮬레이션의 기본값이다.
    kind?: 'constant' | 'input';
  }
  let { constant, kind = 'constant' }: Props = $props();
  const label = $derived(kind === 'input' ? '입력' : '상수');

  const keyIssue = $derived.by(() => {
    const p = projectStore.current;
    if (!p) return null;
    return validateProject(p).find((i) => i.key === constant.key)?.message ?? null;
  });

  function touched() {
    projectStore.markDirty();
  }

  function setNumber(raw: string) {
    constant.value = Number(raw) || 0;
    projectStore.markDirty();
  }
</script>

<div class="item-editor">
  <h2>{label}</h2>
  {#if kind === 'input'}
    <p class="hint">공식을 부르는 쪽이 <code>Formula.get</code>의 마지막 인자로 넘기는 값입니다.</p>
  {/if}
  <label class="field">key
    <input class="mono" bind:value={constant.key} oninput={touched} />
  </label>
  {#if keyIssue}<p class="warn">{keyIssue}</p>{/if}
  <label class="field">{kind === 'input' ? '기본값 (시뮬레이션)' : '값'}
    <input type="number" value={constant.value} onchange={(e) => setNumber(e.currentTarget.value)} />
  </label>
  <label class="field">설명
    <textarea bind:value={constant.description} oninput={touched} rows="2"></textarea>
  </label>
  <button class="delete" onclick={() => projectStore.removeItem(kind, constant.id)}>이 {label} 삭제</button>
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
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
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
