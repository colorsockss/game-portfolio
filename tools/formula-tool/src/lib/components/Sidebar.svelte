<script lang="ts">
  import { projectStore, type ItemKind } from '$lib/stores/project.svelte';
  import type { Stat, Constant, Formula } from '$lib/project/types';

  type Item = Stat | Constant | Formula;

  let query = $state('');

  const tabs: { kind: ItemKind; label: string }[] = [
    { kind: 'formula', label: '공식' },
    { kind: 'stat', label: '스탯' },
    { kind: 'constant', label: '상수' },
    { kind: 'input', label: '입력' },
  ];

  const items = $derived.by((): Item[] => {
    const p = projectStore.current;
    if (!p) return [];
    if (projectStore.activeTab === 'stat') return p.stats;
    if (projectStore.activeTab === 'constant') return p.constants;
    if (projectStore.activeTab === 'input') return p.inputs ?? [];
    return p.formulas;
  });

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) => i.key.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  });

  function add() {
    if (projectStore.activeTab === 'stat') projectStore.addStat();
    else if (projectStore.activeTab === 'constant') projectStore.addConstant();
    else if (projectStore.activeTab === 'input') projectStore.addInput();
    else projectStore.addFormula();
  }
</script>

<aside class="sidebar">
  <div class="search">
    <input type="search" placeholder="검색 (key · 설명)" bind:value={query} />
  </div>

  <div class="tabs">
    {#each tabs as tab (tab.kind)}
      <button
        class="tab"
        class:active={projectStore.activeTab === tab.kind}
        onclick={() => (projectStore.activeTab = tab.kind)}
      >{tab.label}</button>
    {/each}
  </div>

  <ul class="list">
    {#each filtered as item (item.id)}
      <li>
        <button
          class="item"
          class:selected={projectStore.selection?.id === item.id}
          onclick={() => projectStore.select(projectStore.activeTab, item.id)}
        >
          <span class="item-key">{item.key}</span>
        </button>
      </li>
    {/each}
    {#if filtered.length === 0}
      <li class="empty">{query.trim() ? '검색 결과 없음' : '항목이 없습니다'}</li>
    {/if}
  </ul>

  <button class="add" onclick={add}>+ 추가</button>
</aside>

<style>
  .sidebar {
    width: 220px;
    border-right: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .search {
    padding: 8px;
    border-bottom: 1px solid var(--border);
  }
  .search input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 13px;
  }
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    flex: 1;
    border: none;
    background: transparent;
    padding: 8px 0;
    font-size: 13px;
    color: var(--text-muted);
    border-bottom: 2px solid transparent;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 6px;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .item {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    text-align: left;
  }
  .item:hover {
    background: var(--surface);
  }
  .item.selected {
    background: var(--surface);
    border-color: var(--accent);
  }
  .item-key {
    font-size: 13px;
    color: var(--text);
    font-family: monospace;
  }
  .empty {
    color: var(--text-faint);
    font-size: 12px;
    padding: 8px;
  }
  .add {
    margin: 6px;
    border: 1px dashed var(--border-strong);
    background: var(--surface);
    border-radius: var(--radius-sm);
    padding: 6px;
    font-size: 13px;
    color: var(--accent);
  }
  .add:hover {
    background: var(--surface-2);
  }
</style>
