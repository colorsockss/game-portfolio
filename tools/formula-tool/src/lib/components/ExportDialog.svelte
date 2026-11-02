<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    abilityTypeImport: string;
    onConfirm: (abilityTypeImport: string) => void;
    onCancel: () => void;
  }
  let { abilityTypeImport, onConfirm, onCancel }: Props = $props();

  let value = $state(untrack(() => abilityTypeImport));
</script>

<div class="overlay">
  <div class="dialog">
    <h2>TypeScript로 내보내기</h2>
    <label class="field">E_AbilityType import 경로
      <input bind:value placeholder="예: ../game/ability-type" />
    </label>
    <div class="buttons">
      <button onclick={onCancel}>취소</button>
      <button class="primary" disabled={value.trim() === ''} onclick={() => onConfirm(value.trim())}>내보내기</button>
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .dialog {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-md);
    padding: 20px;
    width: 420px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  input {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    font-size: 14px;
    font-family: monospace;
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
</style>
