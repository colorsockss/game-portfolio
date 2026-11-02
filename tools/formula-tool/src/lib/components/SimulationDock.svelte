<script lang="ts">
  import { projectStore } from '$lib/stores/project.svelte';
  import { evaluate, type EvaluateResult } from '$lib/engine';
  import { ACTORS, type ActorKey } from '$lib/project/types';
  import BattlePreview from './BattlePreview.svelte';

  const ACTOR_LABELS: Record<ActorKey, string> = { caster: '시전자', target: '대상' };

  let collapsed = $state(false);
  // 공식 하나를 평가하거나, 프로젝트 전체로 N초 전투를 미리 본다.
  let mode = $state<'formula' | 'battle'>('formula');
  let result = $state<EvaluateResult | null>(null);

  const formula = $derived.by(() => {
    const p = projectStore.current;
    const sel = projectStore.selection;
    if (!p || !sel || sel.kind !== 'formula') return null;
    return p.formulas.find((f) => f.id === sel.id) ?? null;
  });

  // 선택된 공식이 바뀌면 이전 결과를 지운다.
  $effect(() => {
    formula;
    result = null;
  });

  const stats = $derived(projectStore.current?.stats ?? []);
  const inputs = $derived(projectStore.current?.inputs ?? []);

  function inputValue(key: string, fallback: number): number {
    const v = projectStore.inputValues[key];
    return v === undefined ? fallback : v;
  }

  function setInputValue(key: string, raw: string): void {
    const n = Number(raw);
    projectStore.inputValues[key] = Number.isFinite(n) ? n : 0;
  }

  function statInput(actor: ActorKey, key: string, fallback: number): number {
    const v = projectStore.simulationInputs[actor][key];
    return v === undefined ? fallback : v;
  }

  function setStatInput(actor: ActorKey, key: string, raw: string): void {
    const n = Number(raw);
    projectStore.simulationInputs[actor][key] = Number.isFinite(n) ? n : 0;
  }

  function run(): void {
    const p = projectStore.current;
    const f = formula;
    if (!p || !f) return;
    const inputs: Record<ActorKey, Record<string, number>> = { caster: {}, target: {} };
    for (const actor of ACTORS) {
      for (const s of p.stats) inputs[actor][s.key] = statInput(actor, s.key, s.defaults[actor]);
    }
    const given: Record<string, number> = {};
    for (const i of p.inputs ?? []) given[i.key] = inputValue(i.key, i.value);
    result = evaluate(f.key, p, inputs, { inputs: given });
  }
</script>

<section class="dock">
  <header class="dock-head">
    <button class="toggle" onclick={() => (collapsed = !collapsed)}>
      {collapsed ? '▲' : '▼'} 시뮬레이션
    </button>
    <button class="mode" class:active={mode === 'formula'} onclick={() => (mode = 'formula')}>공식</button>
    <button class="mode" class:active={mode === 'battle'} onclick={() => (mode = 'battle')}>전투 미리보기</button>
    {#if formula && mode === 'formula'}<span class="dock-target">{formula.key}</span>{/if}
  </header>

  {#if !collapsed}
    <div class="dock-body">
      {#if mode === 'battle'}
        <BattlePreview />
      {:else if !formula}
        <p class="hint">공식을 선택하면 시뮬레이션할 수 있습니다.</p>
      {:else}
        {#if stats.length === 0}
          <p class="hint">스탯이 없습니다</p>
        {:else}
          <div class="actors">
            {#each ACTORS as actor (actor)}
              <div class="actor-col">
                <span class="actor-name">{ACTOR_LABELS[actor]}</span>
                <div class="inputs">
                  {#each stats as stat (stat.id)}
                    <label class="stat-input">
                      <span class="stat-key">{stat.key}</span>
                      <input
                        type="number"
                        value={statInput(actor, stat.key, stat.defaults[actor])}
                        onchange={(e) => setStatInput(actor, stat.key, e.currentTarget.value)}
                      />
                    </label>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if inputs.length > 0}
          <div class="actor-col">
            <span class="actor-name">입력</span>
            <div class="inputs">
              {#each inputs as input (input.id)}
                <label class="stat-input">
                  <span class="stat-key">{input.key}</span>
                  <input
                    type="number"
                    value={inputValue(input.key, input.value)}
                    onchange={(e) => setInputValue(input.key, e.currentTarget.value)}
                  />
                </label>
              {/each}
            </div>
          </div>
        {/if}
        <div class="run-row">
          <button class="run" onclick={run}>평가</button>
          {#if result}
            {#if result.ok}
              <span class="result-ok">= {result.value}</span>
            {:else}
              <span class="result-err">{result.error.type}: {result.error.message}</span>
            {/if}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .dock {
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .dock-head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 12px;
  }
  .toggle {
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    padding: 4px;
  }
  .mode {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    padding: 4px 6px;
    border-bottom: 2px solid transparent;
  }
  .mode.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  .dock-target {
    font-size: 12px;
    color: var(--text-muted);
    font-family: monospace;
  }
  .dock-body {
    padding: 8px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .actors {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .actor-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .actor-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }
  .inputs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .stat-input {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-key {
    font-size: 11px;
    color: var(--text-muted);
    font-family: monospace;
  }
  .stat-input input {
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
  .run:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
  .result-ok {
    font-size: 18px;
    font-weight: 700;
    color: var(--success);
  }
  .result-err {
    font-size: 13px;
    color: var(--danger);
  }
  .hint {
    color: var(--text-faint);
    font-size: 13px;
    margin: 0;
  }
</style>
