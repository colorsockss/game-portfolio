<script lang="ts">
  import { themeStore } from '$lib/theme/theme.svelte';
</script>

<button
  class="theme-toggle"
  onclick={() => themeStore.toggle()}
  aria-label="테마 전환"
  aria-pressed={themeStore.current === 'dark'}
  title="테마 전환"
>
  {#if themeStore.current === 'dark'}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  {:else}
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    transition: background 0.12s, color 0.12s;
  }
  .theme-toggle:hover {
    background: var(--surface-2);
    color: var(--text);
  }
</style>
