<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import {
    createProject,
    readProject,
    listRecentProjects,
    removeRecentProject,
    pickOpenPath,
    pickSavePath,
    type RecentEntry,
  } from '$lib/tauri/projects';
  import { projectStore } from '$lib/stores/project.svelte';
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';

  let recent = $state<RecentEntry[]>([]);
  let error = $state<string | null>(null);
  let busy = $state(false);

  onMount(loadRecent);

  function messageOf(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
  }

  async function loadRecent() {
    try {
      recent = await listRecentProjects();
    } catch (e) {
      error = `최근 목록을 불러오지 못했습니다: ${messageOf(e)}`;
    }
  }

  function baseName(path: string): string {
    const file = path.split(/[\\/]/).pop() ?? path;
    return file.replace(/\.json$/i, '');
  }

  async function loadProjectFromPath(path: string): Promise<void> {
    const project = await readProject(path);
    projectStore.load(project, path);
    await goto('/editor');
  }

  async function newProject() {
    if (busy) return;
    error = null;
    busy = true;
    try {
      const path = await pickSavePath('새 프로젝트');
      if (!path) return;
      const project = await createProject(path, baseName(path));
      projectStore.load(project, path);
      await goto('/editor');
    } catch (e) {
      error = `프로젝트를 만들지 못했습니다: ${messageOf(e)}`;
    } finally {
      busy = false;
    }
  }

  async function openProject() {
    if (busy) return;
    error = null;
    busy = true;
    try {
      const path = await pickOpenPath();
      if (path) await loadProjectFromPath(path);
    } catch (e) {
      error = `프로젝트를 열지 못했습니다: ${messageOf(e)}`;
    } finally {
      busy = false;
    }
  }

  async function openRecent(path: string) {
    if (busy) return;
    error = null;
    busy = true;
    try {
      await loadProjectFromPath(path);
    } catch (e) {
      error = `프로젝트를 열지 못했습니다: ${messageOf(e)}`;
    } finally {
      busy = false;
    }
  }

  async function removeRecent(path: string, event: MouseEvent) {
    event.stopPropagation();
    try {
      recent = await removeRecentProject(path);
    } catch (e) {
      error = `목록에서 제거하지 못했습니다: ${messageOf(e)}`;
    }
  }
</script>

<main class="manager">
  <header>
    <div class="header-text">
      <h1>전투 공식 작성 툴</h1>
      <p class="subtitle">프로젝트를 만들거나 열어 시작하세요.</p>
    </div>
    <ThemeToggle />
  </header>

  <div class="actions">
    <button class="primary" onclick={newProject} disabled={busy}>새 프로젝트</button>
    <button onclick={openProject} disabled={busy}>프로젝트 열기</button>
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <section class="recent">
    <h2>최근 프로젝트</h2>
    {#if recent.length === 0}
      <p class="empty">아직 최근 프로젝트가 없습니다.</p>
    {:else}
      <ul>
        {#each recent as entry (entry.path)}
          <li>
            <button class="entry" onclick={() => openRecent(entry.path)} disabled={busy}>
              <span class="entry-name">{entry.name}</span>
              <span class="entry-path">{entry.path}</span>
            </button>
            <button
              class="remove"
              aria-label="목록에서 제거"
              title="목록에서 제거"
              disabled={busy}
              onclick={(e) => removeRecent(entry.path, e)}
            >×</button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .manager {
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 24px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  header h1 {
    margin: 0 0 4px;
    font-size: 24px;
  }
  .subtitle {
    margin: 0 0 24px;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  button {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    border-radius: var(--radius);
    padding: 8px 16px;
    font-size: 14px;
    transition: background 0.12s;
  }
  button:hover:not(:disabled) {
    background: var(--surface-2);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .error {
    color: var(--danger);
    background: var(--danger-bg);
    border: 1px solid var(--danger-border);
    border-radius: var(--radius);
    padding: 8px 12px;
    font-size: 13px;
  }
  .recent h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 24px 0 8px;
  }
  .empty {
    color: var(--text-faint);
    font-size: 14px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }
  .entry {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    text-align: left;
    padding: 10px 14px;
  }
  .entry-name {
    font-weight: 600;
    font-size: 14px;
  }
  .entry-path {
    font-size: 12px;
    color: var(--text-faint);
  }
  .remove {
    width: 36px;
    font-size: 18px;
    color: var(--text-faint);
  }
  .remove:hover:not(:disabled) {
    color: var(--danger);
    background: var(--danger-bg);
  }
</style>
