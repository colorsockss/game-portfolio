<script lang="ts">
  import { projectStore } from '$lib/stores/project.svelte';
  import { runPreview } from '$lib/tauri/preview';

  type Row = Record<string, unknown>;

  let running = $state(false);
  let error = $state<string | null>(null);
  let result = $state<Row | null>(null);
  let elapsed = $state<number | null>(null);

  const settings = $derived(projectStore.current?.previewSettings ?? null);
  const fields = $derived(settings?.fields ?? []);

  function fieldValue(key: string, fallback: number): number {
    const v = projectStore.previewValues[key];
    return v === undefined ? fallback : v;
  }

  function setFieldValue(key: string, raw: string): void {
    const n = Number(raw);
    projectStore.previewValues[key] = Number.isFinite(n) ? n : 0;
  }

  // 저장하지 않은 편집도 그대로 보낸다.
  async function run(): Promise<void> {
    const p = projectStore.current;
    const path = projectStore.path;
    if (!p || !path || !settings || running) return;
    running = true;
    error = null;
    const values: Record<string, number> = {};
    for (const f of fields) values[f.key] = fieldValue(f.key, f.value);
    const started = performance.now();
    try {
      result = (await runPreview(path, $state.snapshot(settings), $state.snapshot(p), values)) as Row;
      elapsed = performance.now() - started;
    } catch (e) {
      result = null;
      error = e instanceof Error ? e.message : String(e);
    } finally {
      running = false;
    }
  }

  function format(v: unknown): string {
    // id도 수라서 자릿수 쉼표를 넣지 않는다.
    if (typeof v === 'number') return v.toLocaleString('ko-KR', { maximumFractionDigits: 2, useGrouping: false });
    if (typeof v === 'string') return v;
    return JSON.stringify(v);
  }

  const isRow = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
</script>

{#if !settings}
  <p class="hint">프로젝트에 <code>previewSettings</code>(미리보기 스크립트)가 없습니다.</p>
{:else}
  <div class="fields">
    {#each fields as field (field.key)}
      <label class="field" title={field.description}>
        <span class="field-key">{field.key}</span>
        <input
          type="number"
          value={fieldValue(field.key, field.value)}
          onchange={(e) => setFieldValue(field.key, e.currentTarget.value)}
        />
      </label>
    {/each}
  </div>
  <div class="run-row">
    <button class="run" onclick={run} disabled={running}>{running ? '도는 중…' : '전투 돌리기'}</button>
    <span class="script">node {settings.script} {(settings.args ?? []).join(' ')}</span>
    {#if elapsed !== null && result}<span class="elapsed">{Math.round(elapsed)} ms</span>{/if}
  </div>
  {#if error}<pre class="error">{error}</pre>{/if}
  {#if result}
    <!-- 툴은 결과의 모양을 모른다: 수는 한 줄, 객체는 키-값 목록, 객체 배열은 표로 보인다. -->
    <div class="result">
      {#each Object.entries(result) as [key, value] (key)}
        {#if Array.isArray(value)}
          <section>
            <h4>{key}</h4>
            {#if value.length === 0 || !isRow(value[0])}
              <p class="hint">{value.length === 0 ? '없음' : format(value)}</p>
            {:else}
              {@const columns = Object.keys(value[0])}
              <table>
                <thead><tr>{#each columns as column (column)}<th>{column}</th>{/each}</tr></thead>
                <tbody>
                  {#each value as row, i (i)}
                    <tr>{#each columns as column (column)}<td>{format((row as Row)[column])}</td>{/each}</tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </section>
        {:else if isRow(value)}
          <section>
            <h4>{key}</h4>
            <dl>
              {#each Object.entries(value) as [name, item] (name)}
                <dt>{name}</dt>
                <dd>{format(item)}</dd>
              {/each}
            </dl>
          </section>
        {:else}
          <section class="scalar"><h4>{key}</h4><span>{format(value)}</span></section>
        {/if}
      {/each}
    </div>
  {/if}
{/if}

<style>
  .fields {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .field-key,
  .script {
    font-size: 11px;
    color: var(--text-muted);
    font-family: monospace;
  }
  .field input {
    width: 90px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 4px 6px;
    font-size: 13px;
  }
  .run-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .run {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    border-radius: var(--radius-sm);
    padding: 6px 18px;
    font-size: 13px;
  }
  .run:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .elapsed {
    font-size: 12px;
    color: var(--text-muted);
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--danger);
    white-space: pre-wrap;
  }
  .result {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    max-height: 260px;
    overflow-y: auto;
  }
  h4 {
    margin: 0 0 4px;
    font-size: 12px;
    color: var(--text);
  }
  dl {
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 12px;
    margin: 0;
    font-size: 12px;
  }
  dt {
    color: var(--text-muted);
    font-family: monospace;
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    color: var(--text-muted);
    font-family: monospace;
    font-weight: normal;
    text-align: right;
    padding: 0 8px 2px;
  }
  td {
    text-align: right;
    padding: 1px 8px;
    font-variant-numeric: tabular-nums;
    border-top: 1px solid var(--border);
  }
  .scalar span {
    font-size: 13px;
  }
  .hint {
    color: var(--text-faint);
    font-size: 13px;
    margin: 0;
  }
</style>
