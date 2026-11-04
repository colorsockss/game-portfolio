<script lang="ts">
  import type { Formula } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import ExpressionEditor from '$lib/editor/ExpressionEditor.svelte';
  import ItemEditor from './ItemEditor.svelte';

  interface Props {
    formula: Formula;
  }
  let { formula }: Props = $props();

  function onExpressionChange(value: string) {
    formula.expression = value;
    projectStore.markDirty();
  }
</script>

<ItemEditor kind="formula" item={formula} wide>
  <span class="field-label">수식</span>
  {#if projectStore.current}
    <ExpressionEditor
      value={formula.expression}
      project={projectStore.current}
      formulaKey={formula.key}
      onChange={onExpressionChange}
    />
  {/if}
</ItemEditor>
