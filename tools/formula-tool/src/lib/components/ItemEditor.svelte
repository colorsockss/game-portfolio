<script lang="ts">
  import type { Snippet } from 'svelte';
  import { validateProject } from '$lib/project/validation';
  import { KINDS, projectStore, type Item, type ItemKind } from '$lib/stores/project.svelte';

  // 항목 편집기의 껍데기: 제목, key와 그 검사, 설명, 삭제. 종류마다 다른 칸은 children으로 key와 설명 사이에 들어간다.
  interface Props {
    kind: ItemKind;
    item: Item;
    /** 편집 칸이 넓은 공식은 true. 껍데기는 넓히고 칸만 폭을 줄인다. */
    wide?: boolean;
    /** 제목 아래 안내. */
    hint?: Snippet;
    children: Snippet;
  }
  let { kind, item, wide = false, hint, children }: Props = $props();
  const label = $derived(KINDS[kind].label);

  const keyIssue = $derived.by(() => {
    const p = projectStore.current;
    if (!p) return null;
    return validateProject(p).find((i) => i.key === item.key)?.message ?? null;
  });

  function touched() {
    projectStore.markDirty();
  }
</script>

<div class="item-editor" class:wide>
  <h2>{label}</h2>
  {@render hint?.()}
  <label class="field">key
    <input class="mono" bind:value={item.key} oninput={touched} />
  </label>
  {#if keyIssue}<p class="warn">{keyIssue}</p>{/if}
  {@render children()}
  <label class="field">설명
    <textarea bind:value={item.description} oninput={touched} rows="2"></textarea>
  </label>
  <button class="delete" onclick={() => projectStore.removeItem(kind, item.id)}>이 {label} 삭제</button>
</div>

<style>
  .item-editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 640px;
  }
  .item-editor.wide {
    max-width: none;
  }
  .wide :global(.field),
  .wide .warn {
    max-width: 640px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .item-editor :global(.field) {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .item-editor :global(.field-label) {
    font-size: 12px;
    color: var(--text-muted);
  }
  .item-editor :global(.field input),
  .item-editor :global(.field textarea) {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 14px;
  }
  .mono {
    font-family: monospace;
  }
  .item-editor :global(.hint) {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
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
